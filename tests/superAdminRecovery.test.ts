import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { createAppServer } from '../server.js';
import { closeSqliteDb, getSqliteDb, getSqliteDbPath } from '../server/config/database.js';
import { createSessionPayload, signAccessToken, signRefreshToken } from '../server/middlewares/auth.js';
import { loadDb } from '../server/repositories/dataStore.js';
import { refreshDigest } from '../server/services/authSecurity.js';
import { isolateTestDatabase } from './isolatedDatabase.js';

const cleanup = isolateTestDatabase();
const adminId = 'user-superadmin';
const email = 'superadmin@plushr.ma';
const password = 'Aa9' + randomBytes(24).toString('hex');
const replacement = 'Aa9' + randomBytes(24).toString('hex');
const recoveryVars = ['SUPER_ADMIN_RECOVERY_ENABLED', 'SUPER_ADMIN_RECOVERY_EMAIL', 'SUPER_ADMIN_RECOVERY_PASSWORD'] as const;
for (const key of recoveryVars) delete process.env[key];

async function start() {
  const { httpServer } = await createAppServer({ skipVite: true, scheduleBackups: false });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address() as { port: number };
  return {
    call(url: string, body: unknown, token?: string, cookie?: string) {
      return fetch(`http://127.0.0.1:${port}/api${url}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: `http://127.0.0.1:${port}`,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    },
    async close() {
      httpServer.closeAllConnections();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}

async function run() {
  const development = await start();
  let legacyBackup: string;
  try {
    const response = await development.call('/auth/login', { identifier: 'SA-001', password: 'PlusHR#Super2026!' });
    assert.equal(response.status, 200);
    const { accessToken } = await response.json();
    const backup = await development.call('/platform/backups', {}, accessToken);
    assert.equal(backup.status, 201);
    legacyBackup = (await backup.json()).backup.id;
    const file = new Database(path.join(path.dirname(getSqliteDbPath()), 'backups', legacyBackup), { fileMustExist: true });
    try {
      file.exec('DROP TABLE super_admin_recovery');
    } finally {
      file.close();
    }
  } finally {
    await development.close();
  }

  process.env.NODE_ENV = 'production';
  process.env.ENABLE_DEMO_ACCOUNTS = 'false';
  const locked = await start();
  try {
    const response = await locked.call('/auth/login', { identifier: 'SA-001', password: 'PlusHR#Super2026!' });
    assert.equal(response.status, 401);
    await response.json();
  } finally {
    await locked.close();
  }

  const db = getSqliteDb();
  const admin = loadDb().users.find((user) => user.id === adminId)!;
  assert.equal(admin.is_active, false);
  const oldPayload = createSessionPayload(admin, false);
  const oldAccess = signAccessToken(oldPayload);
  const oldRefresh = signRefreshToken(oldPayload);
  const expiry = new Date(Date.now() + 60_000).toISOString();
  db.prepare('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
    .run('recovery-old-refresh', adminId, refreshDigest(oldRefresh), expiry);
  db.prepare('INSERT INTO password_reset_otps (id, user_id, email, otp_hash, attempts, expires_at, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)')
    .run('recovery-old-otp', adminId, email, bcrypt.hashSync('123456', 6), expiry, new Date().toISOString());
  const tables = ['companies', 'employees', 'employee_documents', 'leave_requests', 'payroll_items'];
  const readHrData = () => tables.map((table) => getSqliteDb().prepare(`SELECT * FROM ${table} ORDER BY id`).all());
  const original = readHrData();
  const marker = () => getSqliteDb().prepare('SELECT user_id, recovered_at FROM super_admin_recovery WHERE id = 1').get();

  process.env.SUPER_ADMIN_RECOVERY_ENABLED = 'true';
  process.env.SUPER_ADMIN_RECOVERY_EMAIL = 'employe@atlas-industrial.ma';
  process.env.SUPER_ADMIN_RECOVERY_PASSWORD = password;
  await assert.rejects(() => createAppServer({ skipVite: true }), /could not match the existing platform administrator/);
  assert.equal(marker(), undefined);
  assert.equal(db.prepare('SELECT is_active FROM users WHERE id = ?').pluck().get(adminId), 0);

  process.env.SUPER_ADMIN_RECOVERY_EMAIL = email;
  const filename = process.env.SQLITE_DB_PATH!;
  process.env.SQLITE_DB_PATH = filename + '.missing';
  await assert.rejects(() => createAppServer({ skipVite: true }), /requires an existing database/);
  assert.equal(fs.existsSync(process.env.SQLITE_DB_PATH), false);
  process.env.SQLITE_DB_PATH = filename;

  const recovered = await start();
  const completed = marker();
  try {
    assert.ok(completed);
    const hash = db.prepare('SELECT password_hash FROM users WHERE id = ?').pluck().get(adminId) as string;
    assert.ok(hash !== password, 'Recovery password must be stored as a hash');
    assert.ok(bcrypt.compareSync(password, hash));
    assert.ok(db.prepare("SELECT revoked_at FROM refresh_tokens WHERE id = 'recovery-old-refresh'").pluck().get());
    assert.ok(db.prepare("SELECT used_at FROM password_reset_otps WHERE id = 'recovery-old-otp'").pluck().get());
    assert.deepEqual(readHrData(), original);
    for (const identifier of ['SA-001', email]) {
      const response = await recovered.call('/auth/login', { identifier, password });
      assert.equal(response.status, 200);
      await response.json();
    }
    for (const response of [
      await recovered.call('/auth/me', undefined, oldAccess),
      await recovered.call('/auth/refresh', {}, undefined, 'plushr_refresh=' + oldRefresh),
      await recovered.call('/auth/login', { identifier: 'ATL-010', password: 'Atlas#Emp2026!' }),
    ]) {
      assert.equal(response.status, 401);
      await response.json();
    }
    const publicRoute = await recovered.call('/auth/super-admin-recovery', {});
    assert.equal(publicRoute.status, 404);
    await publicRoute.text();
  } finally {
    await recovered.close();
  }
  console.log('[PASS] Existing Super Admin recovered without changing HR data, and prior sessions and OTPs rejected');

  process.env.SUPER_ADMIN_RECOVERY_PASSWORD = replacement;
  closeSqliteDb();
  const restarted = await start();
  try {
    assert.deepEqual(marker(), completed);
    const denied = await restarted.call('/auth/login', { identifier: email, password: replacement });
    assert.equal(denied.status, 401);
    await denied.json();
    const login = await restarted.call('/auth/login', { identifier: email, password });
    assert.equal(login.status, 200);
    const { accessToken } = await login.json();
    const restore = await restarted.call(`/platform/backups/${legacyBackup}/restore`, {
      password, confirmation: 'RESTAURER',
    }, accessToken);
    assert.equal(restore.status, 200, restore.status === 200 ? '' : await restore.text());
    await restore.json();
    assert.deepEqual(marker(), completed);
  } finally {
    await restarted.close();
  }

  closeSqliteDb();
  const afterRestore = await start();
  try {
    assert.deepEqual(marker(), completed);
    const denied = await afterRestore.call('/auth/login', { identifier: email, password: replacement });
    assert.equal(denied.status, 401);
    await denied.json();
    const login = await afterRestore.call('/auth/login', { identifier: email, password });
    assert.equal(login.status, 200);
    await login.json();
    const auditCount = getSqliteDb().prepare("SELECT COUNT(*) FROM audit_logs WHERE action = 'SUPER_ADMIN_RECOVERED'").pluck().get();
    assert.equal(auditCount, 1);
  } finally {
    await afterRestore.close();
  }
  console.log('[PASS] Recovery is refused on mismatched identity or missing DB, and cannot repeat after restart or older backup restore');
}

try {
  await run();
} finally {
  for (const key of recoveryVars) delete process.env[key];
  cleanup();
}
