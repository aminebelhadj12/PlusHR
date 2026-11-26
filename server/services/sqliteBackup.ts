import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Response } from 'express';
import { closeSqliteDb, getDbMode, getSqliteDb, getSqliteDbPath } from '../config/database.js';
import { logAudit, mutateAuthDb, reloadDbFromSqlite, waitForDbWrites, type DbSchema } from '../repositories/dataStore.js';
import { drainApiRequests, isInMaintenance, setMaintenance } from './maintenance.js';
import { getRealtimeIo } from './realtimeService.js';

export interface BackupInfo {
  id: string;
  kind: 'daily' | 'manual' | 'pre-restore';
  createdAt: string;
  size: number;
  integrity: 'ok' | 'invalid';
}

type AuditInput = Parameters<typeof logAudit>[1];
type Actor = Partial<Pick<AuditInput, 'user_id' | 'user_name' | 'ip_address'>>;
type SqlValue = string | number | null | Buffer;
const dayPattern = /^daily-[0-9]{4}-[0-9]{2}-[0-9]{2}\.sqlite$/;
const backupPattern = /^(daily-[0-9]{4}-[0-9]{2}-[0-9]{2}|(manual|pre-restore)-[0-9]{8}T[0-9]{9}Z-[a-f0-9]{32})\.sqlite$/;
const dateStamp = (date: Date) => date.toISOString().replace(/[-:.]/g, '');
const integrityCache = new Map<string, { stamp: string; valid: boolean }>();
let busy = false;

export class BackupError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function withBackupOperation<T>(operation: () => Promise<T>): Promise<T> {
  if (busy) throw new BackupError(409, 'Une op?ration de sauvegarde est d?j? en cours.');
  busy = true;
  try {
    return await operation();
  } finally {
    busy = false;
  }
}

function backupDirectory(): string {
  if (getDbMode() !== 'sqlite') throw new BackupError(409, 'Ce module n?cessite SQLite.');
  const dir = path.join(path.dirname(fs.realpathSync(getSqliteDbPath())), 'backups');
  for (const publicDir of ['public', 'dist']) {
    const root = path.resolve(publicDir);
    const relative = path.relative(fs.existsSync(root) ? fs.realpathSync(root) : root, dir);
    if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
      throw new BackupError(500, 'Le r?pertoire des sauvegardes doit ?tre priv?.');
    }
  }
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (!fs.lstatSync(dir).isDirectory()) throw new BackupError(500, 'R?pertoire de sauvegarde invalide.');
  if (process.platform !== 'win32') fs.chmodSync(dir, 0o700);
  return dir;
}

function backupFile(dir: string, id: string): { file: string; stat: fs.Stats } {
  if (!backupPattern.test(id)) throw new BackupError(404, 'Sauvegarde introuvable.');
  const file = path.join(dir, id);
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.nlink !== 1) throw new BackupError(404, 'Sauvegarde introuvable.');
  return { file, stat };
}

function verifyIntegrity(db: Database.Database): void {
  const rows = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
  if (rows.length !== 1 || rows[0].integrity_check !== 'ok') throw new Error('SQLite integrity check failed');
}

function openSnapshot(file: string, readonly: boolean): Database.Database {
  const db = new Database(file, { readonly, fileMustExist: true });
  try {
    db.pragma('trusted_schema = OFF');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function isIntact(file: string): boolean {
  try {
    if (['-wal', '-shm', '-journal'].some((suffix) => fs.lstatSync(file + suffix, { throwIfNoEntry: false }))) return false;
    const db = openSnapshot(file, true);
    try {
      verifyIntegrity(db);
      return true;
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}

export function listBackups(): BackupInfo[] {
  const dir = backupDirectory();
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && backupPattern.test(entry.name))
    .flatMap(({ name: id }) => {
      let entry;
      try {
        entry = backupFile(dir, id);
      } catch (error) {
        if (error instanceof BackupError && error.status === 404) return [];
        throw error;
      }
      const { file, stat } = entry;
      const stamp = [stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':');
      let checked = integrityCache.get(file);
      if (checked?.stamp !== stamp) {
        checked = { stamp, valid: isIntact(file) };
        integrityCache.set(file, checked);
      }
      const kind: BackupInfo['kind'] = id.startsWith('pre-restore') ? 'pre-restore' : dayPattern.test(id) ? 'daily' : 'manual';
      return [{ id, kind, createdAt: stat.mtime.toISOString(), size: stat.size, integrity: checked.valid ? 'ok' as const : 'invalid' as const }];
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function verifiedBackup(id: string): string {
  const { file } = backupFile(backupDirectory(), id);
  if (!isIntact(file)) throw new BackupError(422, 'L?int?grit? de la sauvegarde est invalide.');
  return file;
}

function syncFile(file: string): void {
  const fd = fs.openSync(file, 'r+');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function syncDirectory(dir: string): void {
  if (process.platform === 'win32') return;
  const fd = fs.openSync(dir, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function privateTempFile(dir: string): string {
  const file = path.join(dir, `.plushr-${crypto.randomUUID()}.sqlite`);
  fs.closeSync(fs.openSync(file, 'wx', 0o600));
  return file;
}

function removeTempFile(file: string): void {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    fs.rmSync(file + suffix, { force: true });
  }
}

export async function auditBackup(action: string, id: string, actor: Actor = {}, details = id): Promise<void> {
  await mutateAuthDb((db) => logAudit(db, {
    ...actor, company_id: null, user_id: actor.user_id ?? null, action,
    entity_type: 'sqlite_backup', entity_id: id, details,
  }));
}

async function writeBackup(kind: BackupInfo['kind'], date: Date, actor: Actor = {}): Promise<string> {
  const dir = backupDirectory();
  const id = kind === 'daily' ? `daily-${date.toISOString().slice(0, 10)}.sqlite` :
    `${kind}-${dateStamp(date)}-${crypto.randomUUID().replaceAll('-', '')}.sqlite`;
  const temporary = privateTempFile(dir);
  try {
    await getSqliteDb().backup(temporary);
    const snapshot = openSnapshot(temporary, false);
    try {
      snapshot.pragma('journal_mode = DELETE');
      verifyIntegrity(snapshot);
    } finally {
      snapshot.close();
    }
    syncFile(temporary);
    fs.renameSync(temporary, path.join(dir, id));
    syncDirectory(dir);
  } finally {
    removeTempFile(temporary);
  }

  await auditBackup('SQLITE_BACKUP_CREATED', id, actor, `${kind}: ${id}`);
  return id;
}

export async function createManualBackup(actor: Actor): Promise<BackupInfo> {
  return withBackupOperation(async () => {
    const id = await writeBackup('manual', new Date(), actor);
    return listBackups().find((backup) => backup.id === id)!;
  });
}

export async function ensureDailyBackup(date = new Date()): Promise<void> {
  if (getDbMode() !== 'sqlite' || busy || isInMaintenance()) return;
  await withBackupOperation(async () => {
    const dir = backupDirectory();
    const id = `daily-${date.toISOString().slice(0, 10)}.sqlite`;
    const today = fs.lstatSync(path.join(dir, id), { throwIfNoEntry: false });
    if (!today || !isIntact(backupFile(dir, id).file)) await writeBackup('daily', date);
    const days = fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && dayPattern.test(entry.name))
      .map((entry) => entry.name).sort().reverse();
    for (const obsolete of days.slice(7)) {
      const { file } = backupFile(dir, obsolete);
      fs.unlinkSync(file);
      integrityCache.delete(file);
    }
  });
}

export function startBackupScheduler(): () => void {
  const tick = () => { void ensureDailyBackup().catch((error: unknown) => console.error('[+HR Backup]', error)); };
  tick();
  const interval = setInterval(tick, 60 * 60 * 1000);
  interval.unref();
  return () => clearInterval(interval);
}

function schemaSignature(db: Database.Database): unknown[] {
  return db.prepare(`
    SELECT type, name, tbl_name, sql FROM sqlite_schema
    WHERE name NOT GLOB 'sqlite_*' AND name <> 'auth_session_generation'
    ORDER BY type, name
  `).all();
}

function prepareRestore(stage: Database.Database, live: Database.Database, id: string, preBackup: string, actor: Actor): void {
  verifyIntegrity(stage);
  if (JSON.stringify(schemaSignature(stage)) !== JSON.stringify(schemaSignature(live))) {
    throw new BackupError(422, 'Cette sauvegarde utilise un sch?ma SQLite incompatible.');
  }
  const currentUsers = live.prepare('SELECT * FROM users').all() as Array<Record<string, SqlValue>>;
  const currentById = new Map(currentUsers.map((user) => [user.id, user]));
  const suspendedCompanies = live.prepare("SELECT id FROM companies WHERE status = 'suspended'").pluck().all() as string[];
  const currentAudits = live.prepare('SELECT * FROM audit_logs').all() as Array<Record<string, SqlValue>>;
  const snapshotUsers = stage.prepare('SELECT id, company_id FROM users').all() as Array<Record<string, SqlValue>>;
  const actorUser = currentById.get(actor.user_id ?? null);
  if (!actorUser || actorUser.role_code !== 'SUPER_ADMIN' || actorUser.is_active !== 1) {
    throw new BackupError(403, 'Acc?s administrateur requis.');
  }

  stage.transaction(() => {
    const suspend = stage.prepare("UPDATE companies SET status = 'suspended' WHERE id = ?");
    for (const companyId of suspendedCompanies) suspend.run(companyId);
    const disable = stage.prepare('UPDATE users SET is_active = 0, webauthn_credential_id = NULL WHERE id = ?');
    const credentials = stage.prepare(`
      UPDATE users SET email = ?, matricule = ?, role_code = ?, password_hash = ?, is_active = ?, must_change_password = ?,
        webauthn_credential_id = ? WHERE id = ?
    `);
    for (const user of snapshotUsers) {
      const current = currentById.get(user.id);
      if (!current || current.company_id !== user.company_id) {
        disable.run(user.id);
      } else {
        credentials.run(current.email, current.matricule, current.role_code, current.password_hash, current.is_active,
          current.must_change_password, current.webauthn_credential_id, user.id);
      }
    }

    // A snapshot predating the active platform administrator must still be recoverable.
    for (const user of currentUsers.filter((entry) => entry.role_code === 'SUPER_ADMIN')) {
      const columns = Object.keys(user);
      stage.prepare(`
        INSERT INTO users (${columns.join(', ')}) VALUES (${columns.map((column) => '@' + column).join(', ')})
        ON CONFLICT(id) DO UPDATE SET ${columns.filter((col) => col !== 'id').map((col) => `${col} = excluded.${col}`).join(', ')}
      `).run(user);
    }

    stage.exec(`
      DROP TABLE IF EXISTS auth_session_generation;
      CREATE TABLE auth_session_generation (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        generation TEXT NOT NULL
      );
    `);
    stage.prepare('INSERT OR REPLACE INTO auth_session_generation VALUES (1, ?)').run(crypto.randomUUID());
    const now = new Date().toISOString();
    stage.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE revoked_at IS NULL').run(now);
    stage.prepare('UPDATE password_reset_otps SET used_at = ? WHERE used_at IS NULL').run(now);
    const logs: Pick<DbSchema, 'audit_logs'> = { audit_logs: [] };
    logAudit(logs, {
      ...actor, company_id: null, user_id: actor.user_id ?? null, action: 'SQLITE_BACKUP_RESTORED',
      entity_type: 'sqlite_backup', entity_id: id, details: `${id} (pre-restore: ${preBackup})`,
    });
    const insertAudit = stage.prepare(`
      INSERT OR REPLACE INTO audit_logs (id, company_id, user_id, user_name, action, entity_type, entity_id, details, ip_address, created_at)
      VALUES (@id, @company_id, @user_id, @user_name, @action, @entity_type, @entity_id, @details, @ip_address, @created_at)
    `);
    for (const audit of currentAudits) insertAudit.run(audit);
    for (const audit of logs.audit_logs) insertAudit.run(audit);
  }).immediate();

  stage.pragma('journal_mode = DELETE');
  verifyIntegrity(stage);
}

function swapDatabase(stage: string, target: string): void {
  const live = getSqliteDb();
  const [checkpoint] = live.pragma('wal_checkpoint(TRUNCATE)') as Array<{ busy: number }>;
  if (checkpoint.busy) throw new BackupError(409, 'La base SQLite est occup?e. R?essayez ult?rieurement.');
  closeSqliteDb();
  if (['-wal', '-shm', '-journal'].some((suffix) => fs.existsSync(target + suffix))) {
    throw new BackupError(409, 'Une autre connexion SQLite utilise la base.');
  }
  fs.renameSync(stage, target);
}

export async function restoreBackup(id: string, actor: Actor, response: Response, authorize: () => void): Promise<string> {
  return withBackupOperation(async () => {
    const source = verifiedBackup(id);
    setMaintenance(true);
    let resume = true;
    let stageFile: string | undefined;
    try {
      getRealtimeIo()?.disconnectSockets(true);
      if (!await drainApiRequests(response)) throw new BackupError(409, 'Des requ?tes sont encore en cours. R?essayez.');
      await waitForDbWrites();
      authorize();
      const live = getSqliteDb();
      const target = fs.realpathSync(getSqliteDbPath());
      const dir = path.dirname(target);
      const preBackup = await writeBackup('pre-restore', new Date(), actor);
      stageFile = privateTempFile(dir);
      const snapshot = openSnapshot(source, true);
      try { await snapshot.backup(stageFile); } finally { snapshot.close(); }
      const stage = openSnapshot(stageFile, false);
      try { prepareRestore(stage, live, id, preBackup, actor); } finally { stage.close(); }
      syncFile(stageFile);
      swapDatabase(stageFile, target);
      try {
        syncDirectory(dir);
        reloadDbFromSqlite();
      } catch (error) {
        // Keep maintenance enabled if both the swap and recovery cannot be reopened safely.
        resume = false;
        closeSqliteDb();
        const recovery = privateTempFile(dir);
        try {
          const previous = openSnapshot(path.join(backupDirectory(), preBackup), true);
          try { await previous.backup(recovery); } finally { previous.close(); }
          syncFile(recovery);
          fs.renameSync(recovery, target);
          syncDirectory(dir);
          reloadDbFromSqlite();
          resume = true;
        } finally {
          removeTempFile(recovery);
        }
        throw error;
      }
      return preBackup;
    } finally {
      if (resume) setMaintenance(false);
      if (stageFile) removeTempFile(stageFile);
    }
  });
}
