import bcrypt from 'bcryptjs';
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import path from 'node:path';
import { getSqliteDb, getSqliteDbPath } from '../config/database.js';
import { demoPasswords } from '../config/demoAccounts.js';

const platformAdminId = 'user-superadmin';

export function checkRecoveryConfiguration(): boolean {
  if (process.env.SUPER_ADMIN_RECOVERY_ENABLED !== 'true') return false;
  if (process.env.NODE_ENV !== 'production' || (process.env.DB_MODE || 'sqlite').toLowerCase() !== 'sqlite') {
    throw new Error('Super Admin recovery requires production mode and SQLite.');
  }
  const configuredPath = process.env.SQLITE_DB_PATH?.trim();
  if (!configuredPath || !path.isAbsolute(configuredPath) ||
      !statSync(getSqliteDbPath(), { throwIfNoEntry: false })?.isFile()) {
    throw new Error('Super Admin recovery requires an existing database at the absolute SQLITE_DB_PATH.');
  }
  return true;
}

export function recoverSuperAdmin(): 'recovered' | 'already-completed' {
  const db = getSqliteDb();
  return db.transaction(() => {
    if (db.prepare('SELECT 1 FROM super_admin_recovery WHERE id = 1').get()) return 'already-completed';

    const email = process.env.SUPER_ADMIN_RECOVERY_EMAIL?.trim().toLowerCase();
    const password = process.env.SUPER_ADMIN_RECOVERY_PASSWORD;
    if (!email || !password || password.length < 16 || Buffer.byteLength(password, 'utf8') > 72 ||
        !/[A-Za-z]/.test(password) || !/[0-9]/.test(password) || /[\u0000-\u001f\u007f]/.test(password) ||
        demoPasswords.has(password)) {
      throw new Error('Super Admin recovery requires the account email and a fresh password with at least 16 characters, a letter, a digit, and at most 72 UTF-8 bytes.');
    }

    const account = db.prepare(`
      SELECT id, full_name, password_hash FROM users
      WHERE id = ? AND lower(email) = ? AND role_code = 'SUPER_ADMIN' AND company_id IS NULL
    `).get(platformAdminId, email) as { id: string; full_name: string; password_hash: string } | undefined;
    if (!account) throw new Error('Super Admin recovery could not match the existing platform administrator.');
    if (bcrypt.compareSync(password, account.password_hash)) {
      throw new Error('Super Admin recovery requires a password different from the existing password.');
    }

    const hash = bcrypt.hashSync(password, 12);
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE users SET password_hash = ?, is_active = 1, must_change_password = 0, updated_at = ?
      WHERE id = ?
    `).run(hash, now, account.id);
    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(now, account.id);
    db.prepare('UPDATE password_reset_otps SET used_at = ? WHERE user_id = ? AND used_at IS NULL').run(now, account.id);
    db.prepare('INSERT INTO super_admin_recovery (id, user_id, recovered_at) VALUES (1, ?, ?)').run(account.id, now);
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, user_name, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, ?, 'SUPER_ADMIN_RECOVERED', 'user', ?, 'Récupération unique au démarrage', ?)
    `).run(randomUUID(), account.id, account.full_name, account.id, now);
    return 'recovered';
  }).immediate();
}

export function preserveRecoveryMarker(stage: Database.Database, live: Database.Database): void {
  const marker = live.prepare('SELECT user_id, recovered_at FROM super_admin_recovery WHERE id = 1').get() as
    { user_id: string; recovered_at: string } | undefined;
  if (!marker) return;

  if (!stage.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'super_admin_recovery'").get()) {
    const definition = live.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'super_admin_recovery'")
      .pluck().get() as string;
    stage.exec(definition);
  }
  stage.prepare('INSERT OR REPLACE INTO super_admin_recovery (id, user_id, recovered_at) VALUES (1, ?, ?)')
    .run(marker.user_id, marker.recovered_at);
}
