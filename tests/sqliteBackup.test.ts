import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createAppServer } from '../server.js';
import { getSqliteDb, getSqliteDbPath } from '../server/config/database.js';
import { ensureDailyBackup } from '../server/services/sqliteBackup.js';
import { isInMaintenance, trackApiHandler } from '../server/services/maintenance.js';
import { isolateTestDatabase } from './isolatedDatabase.js';

const cleanup = isolateTestDatabase();
const root = '/api/platform/backups';
const superPassword = 'PlusHR#Super2026!';
const restoredPassword = 'Private#Admin2026!';
const companyId = 'comp-atlas';

async function run() {
  let releaseRequest!: () => void;
  let markRequestStarted!: () => void;
  const heldRequest = new Promise<void>((resolve) => { releaseRequest = resolve; });
  const requestStarted = new Promise<void>((resolve) => { markRequestStarted = resolve; });
  let releaseAbortedHandler!: () => void;
  let markAbortedHandlerStarted!: () => void;
  const abortedHandler = new Promise<void>((resolve) => { releaseAbortedHandler = resolve; });
  const abortedHandlerStarted = new Promise<void>((resolve) => { markAbortedHandlerStarted = resolve; });
  const { app, httpServer } = await createAppServer({ skipVite: true });
  app.get('/api/test-hold', (_req, res) => {
    markRequestStarted();
    void heldRequest.then(() => res.json({ ok: true }));
  });
  app.get('/api/test-abort', trackApiHandler(async (_req, res) => {
    markAbortedHandlerStarted();
    await abortedHandler;
    if (!res.destroyed) res.json({ ok: true });
  }));
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address() as { port: number };
  const base = `http://127.0.0.1:${port}`;

  async function call(url: string, token?: string, body?: unknown, cookie?: string) {
    return fetch(base + url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: base,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function login(identifier: string, password: string) {
    const response = await call('/api/auth/login', undefined, { identifier, password });
    assert.equal(response.status, 200);
    return { token: (await response.json()).accessToken as string, cookies: response.headers.getSetCookie() };
  }

  async function status(expected: number, request: Promise<Response>) {
    const response = await request;
    assert.equal(response.status, expected, await response.text());
  }

  async function retryUntil(check: () => boolean) {
    const deadline = Date.now() + 5000;
    while (!check()) {
      if (Date.now() >= deadline) assert.fail('Timed out waiting for server state');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  try {
    const db = getSqliteDb();
    const directory = path.join(path.dirname(getSqliteDbPath()), 'backups');
    const dailyId = `daily-${new Date().toISOString().slice(0, 10)}.sqlite`;
    await retryUntil(() => fs.existsSync(path.join(directory, dailyId)) &&
      Boolean(db.prepare("SELECT id FROM audit_logs WHERE action = 'SQLITE_BACKUP_CREATED' AND entity_id = ?").get(dailyId)));
    const admin = await login('SA-001', superPassword);
    const employee = await login('ATL-010', 'Atlas#Emp2026!');
    const adminCookie = admin.cookies.find((value) => value.startsWith('plushr_access='))!.split(';')[0];
    await status(401, call(root));
    await status(403, call(root, undefined, undefined, adminCookie));
    await status(403, call(root, employee.token));
    await status(403, call(root, employee.token, {}));
    await status(403, call(`${root}/${dailyId}/download`, employee.token, { password: superPassword }));
    await status(403, call(`${root}/${dailyId}/restore`, employee.token, { password: superPassword, confirmation: 'RESTAURER' }));
    console.log('[PASS] Automatic startup backup and Super Admin-only API');

    // Keep an old read transaction open so the new write cannot be checkpointed out of WAL.
    const reader = new Database(getSqliteDbPath(), { readonly: true });
    const updateCompany = db.prepare('UPDATE companies SET name = ? WHERE id = ?');
    let backup: { id: string; kind: string; createdAt: string; integrity: string; size: number };
    try {
      reader.exec('BEGIN');
      reader.prepare('SELECT name FROM companies WHERE id = ?').get(companyId);
      updateCompany.run('WAL snapshot marker', companyId);
      assert.ok(fs.statSync(getSqliteDbPath() + '-wal').size > 0);
      const manual = await call(root, admin.token, {});
      assert.equal(manual.status, 201);
      backup = (await manual.json()).backup;
    } finally {
      reader.close();
    }
    assert.equal(backup.kind, 'manual');
    assert.equal(backup.integrity, 'ok');
    assert.ok(backup.size > 0 && Date.parse(backup.createdAt) > 0);

    await status(403, call(`${root}/${backup.id}/download`, admin.token, {}));
    await status(403, call(`${root}/${backup.id}/download`, admin.token, { password: 'incorrect' }));
    await status(404, call(`${root}/..%2Ftest.sqlite/download`, admin.token, { password: superPassword }));
    await status(404, call(`${root}/..%2Ftest.sqlite/restore`, admin.token, { password: superPassword, confirmation: 'RESTAURER' }));
    const download = await call(`${root}/${backup.id}/download`, admin.token, { password: superPassword });
    assert.equal(download.status, 200);
    assert.match(download.headers.get('content-disposition') || '', /attachment.*manual-/);
    assert.equal(download.headers.get('cache-control'), 'no-store');
    const externalCopy = path.join(path.dirname(directory), 'external-copy.sqlite');
    fs.writeFileSync(externalCopy, Buffer.from(await download.arrayBuffer()));
    const external = new Database(externalCopy, { readonly: true });
    try {
      assert.equal(external.pragma('integrity_check', { simple: true }), 'ok');
      assert.equal(external.prepare('SELECT name FROM companies WHERE id = ?').pluck().get(companyId), 'WAL snapshot marker');
    } finally {
      external.close();
    }
    const publicResponse = await call(`/backups/${backup.id}`);
    assert.equal(publicResponse.status, 404);
    await publicResponse.arrayBuffer();
    console.log('[PASS] WAL-consistent snapshot, private download, reauthentication and traversal rejection');

    const corrupt = await call(root, admin.token, {});
    assert.equal(corrupt.status, 201);
    const corruptId = (await corrupt.json()).backup.id as string;
    fs.writeFileSync(path.join(directory, corruptId), 'truncated snapshot');
    const history = await call(root, admin.token);
    assert.equal(history.status, 200);
    assert.equal((await history.json()).backups.find((entry: { id: string }) => entry.id === corruptId)?.integrity, 'invalid');
    await status(422, call(`${root}/${corruptId}/download`, admin.token, { password: superPassword }));
    await status(422, call(`${root}/${corruptId}/restore`, admin.token, { password: superPassword, confirmation: 'RESTAURER' }));
    await status(400, call(`${root}/${backup.id}/restore`, admin.token, { password: superPassword }));
    console.log('[PASS] Integrity checks and explicit restore confirmation');

    for (let offset = 9; offset >= 1; offset--) {
      await ensureDailyBackup(new Date(Date.now() - offset * 86_400_000));
    }
    await ensureDailyBackup(); // idempotent for the current UTC day
    const retained = fs.readdirSync(directory).filter((id) => id.startsWith('daily-')).sort();
    const expected = Array.from({ length: 7 }, (_, index) =>
      `daily-${new Date(Date.now() - index * 86_400_000).toISOString().slice(0, 10)}.sqlite`).sort();
    assert.deepEqual(retained, expected);
    assert.ok(fs.existsSync(path.join(directory, backup.id)));
    console.log('[PASS] Seven-day retention applies only to daily backups');

    updateCompany.run('Live database marker', companyId);
    const changePassword = await call('/api/auth/change-password', admin.token, { currentPassword: superPassword, newPassword: restoredPassword });
    assert.equal(changePassword.status, 200);
    const changedToken = (await changePassword.json()).accessToken as string;
    const refresh = employee.cookies.find((value) => value.startsWith('plushr_refresh='))!.split(';')[0];
    const holding = call('/api/test-hold');
    await requestStarted;
    const abort = new AbortController();
    const disconnecting = fetch(base + '/api/test-abort', { signal: abort.signal }).catch((error: Error) => error);
    await abortedHandlerStarted;
    abort.abort();
    assert.equal((await disconnecting as Error).name, 'AbortError');
    const restoring = call(`${root}/${backup.id}/restore`, changedToken, { password: restoredPassword, confirmation: 'RESTAURER' });
    try {
      await retryUntil(isInMaintenance);
      await status(503, call('/api/health'));
    } finally {
      releaseRequest();
    }
    await status(200, holding);
    await status(503, call('/api/health'));
    releaseAbortedHandler();
    const restored = await restoring;
    assert.equal(restored.status, 200, restored.status === 200 ? '' : await restored.text());
    const { preRestoreBackup } = await restored.json();
    assert.match(preRestoreBackup, /^pre-restore-/);
    const before = new Database(path.join(directory, preRestoreBackup), { readonly: true });
    try {
      assert.equal(before.prepare('SELECT name FROM companies WHERE id = ?').pluck().get(companyId), 'Live database marker');
    } finally {
      before.close();
    }

    await status(401, call('/api/auth/me', changedToken));
    await status(401, call('/api/auth/me', employee.token));
    await status(401, call('/api/auth/refresh', undefined, {}, refresh));
    await status(401, call('/api/auth/login', undefined, { identifier: 'SA-001', password: superPassword }));
    const newAdmin = await login('SA-001', restoredPassword);
    const overview = await call('/api/platform/overview', newAdmin.token);
    assert.equal(overview.status, 200);
    assert.match(await overview.text(), /WAL snapshot marker/);
    const restoredDb = getSqliteDb();
    assert.equal(restoredDb.prepare('SELECT name FROM companies WHERE id = ?').pluck().get(companyId), 'WAL snapshot marker');
    assert.equal(restoredDb.pragma('journal_mode', { simple: true }), 'wal');
    const audits = restoredDb.prepare("SELECT action, entity_id FROM audit_logs WHERE action LIKE 'SQLITE_BACKUP_%'").all() as
      Array<{ action: string; entity_id: string }>;
    for (const [action, id] of [
      ['SQLITE_BACKUP_CREATED', backup.id],
      ['SQLITE_BACKUP_CREATED', preRestoreBackup],
      ['SQLITE_BACKUP_DOWNLOADED', backup.id],
      ['SQLITE_BACKUP_RESTORED', backup.id],
    ]) assert.ok(audits.some((audit) => audit.action === action && audit.entity_id === id), action);
    console.log('[PASS] Maintenance mode, pre-restore backup, live restore, audit retention and session invalidation');
  } finally {
    releaseRequest();
    releaseAbortedHandler();
    httpServer.closeAllConnections();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
}

try {
  await run();
} finally {
  cleanup();
}
