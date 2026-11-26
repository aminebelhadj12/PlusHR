import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createAppServer } from '../server.js';
import { getSqliteDb } from '../server/config/database.js';
import { createSessionPayload, getRefreshSecret, signRefreshToken } from '../server/middlewares/auth.js';
import { loadDb, mutateDb, resetDemoDatabase } from '../server/repositories/dataStore.js';
import { refreshDigest } from '../server/services/authSecurity.js';
import { isolateTestDatabase } from './isolatedDatabase.js';

const employeePassword = 'Atlas#Emp2026!';
const changedAdminPassword = 'Changed#Admin2026!';
const sqlite = isolateTestDatabase();

async function startServer() {
  const { httpServer } = await createAppServer({ skipVite: true });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address() as { port: number };
  return {
    async call(path: string, body?: unknown, cookie?: string, token?: string) {
      const response = await fetch(`http://127.0.0.1:${port}/api/auth/${path}`, {
        method: path === 'me' || path === 'demo-accounts' ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cookie ? { Cookie: cookie } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return {
        status: response.status,
        data: await response.json(),
        cookie: response.headers.getSetCookie().find((value) => value.startsWith('plushr_refresh='))?.split(';')[0],
      };
    },
    async close() {
      httpServer.closeAllConnections();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}

async function run() {
  process.env.NODE_ENV = 'production';
  process.env.ENABLE_DEMO_ACCOUNTS = 'false';
  const empty = await startServer();
  try {
    assert.equal(getSqliteDb().prepare('SELECT COUNT(*) AS count FROM users').pluck().get(), 0);
    assert.equal((await empty.call('demo-accounts')).status, 404);
  } finally {
    await empty.close();
  }

  process.env.NODE_ENV = 'test';
  process.env.ENABLE_DEMO_ACCOUNTS = 'true';
  resetDemoDatabase();
  const server = await startServer();
  const call = server.call;
  const employee = { identifier: 'ATL-010', password: employeePassword };
  let adminCookie: string | undefined;
  let demoCookie: string | undefined;
  let adminHash: string | undefined;
  let legacyId: string | undefined;

  try {
    async function loginEmployee() {
      const session = await call('login', employee);
      assert.equal(session.status, 200);
      assert.ok(session.cookie);
      return session;
    }

    const original = await loginEmployee();
    const recordDigest = refreshDigest(original.cookie!.slice('plushr_refresh='.length));
    const record = loadDb().refresh_tokens.find((token) => token.token_hash === recordDigest);
    assert.ok(record);
    const concurrent = await Promise.all([
      call('refresh', undefined, original.cookie),
      call('refresh', undefined, original.cookie),
    ]);
    assert.deepEqual(concurrent.map((result) => result.status).sort(), [200, 401]);
    const rotated = concurrent.find((result) => result.status === 200)!;
    assert.ok(rotated.cookie && rotated.cookie !== original.cookie);
    assert.equal((await call('refresh', undefined, original.cookie)).status, 401);
    assert.ok(loadDb().refresh_tokens.find((token) => token.id === record.id)?.revoked_at);
    assert.equal((await call('logout', undefined, rotated.cookie)).status, 200);
    assert.equal((await call('refresh', undefined, rotated.cookie)).status, 401);
    console.log('[PASS] Refresh rotation, concurrent replay and revoked token rejection');

    const session = await loginEmployee();
    const userId = session.data.user.id;
    const digest = refreshDigest(session.cookie!.slice('plushr_refresh='.length));
    const changeRecord = getSqliteDb().prepare('UPDATE refresh_tokens SET expires_at = ? WHERE token_hash = ?');
    changeRecord.run(new Date(0).toISOString(), digest);
    assert.equal((await call('refresh', undefined, session.cookie)).status, 401);
    changeRecord.run(new Date(Date.now() + 60_000).toISOString(), digest);
    const user = loadDb().users.find((entry) => entry.id === userId)!;
    const payload = createSessionPayload(user, false);
    const unregistered = signRefreshToken(payload);
    assert.equal((await call('refresh', undefined, `plushr_refresh=${unregistered}`)).status, 401);
    const expired = jwt.sign(payload, getRefreshSecret(), { audience: 'plushr-refresh', expiresIn: -1 });
    getSqliteDb().prepare('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
      .run('expired-jwt', userId, refreshDigest(expired), new Date(Date.now() + 60_000).toISOString());
    assert.equal((await call('refresh', undefined, `plushr_refresh=${expired}`)).status, 401);
    const changeOwner = getSqliteDb().prepare('UPDATE refresh_tokens SET user_id = ? WHERE token_hash = ?');
    changeOwner.run('user-superadmin', digest);
    assert.equal((await call('refresh', undefined, session.cookie)).status, 401);
    changeOwner.run(userId, digest);
    console.log('[PASS] Database and JWT expiration, unregistered token and ownership checks');

    const changeActive = getSqliteDb().prepare('UPDATE users SET is_active = ? WHERE id = ?');
    changeActive.run(0, userId);
    assert.equal((await call('refresh', undefined, session.cookie)).status, 401);
    assert.equal((await call('me', undefined, undefined, session.data.accessToken)).status, 401);
    changeActive.run(1, userId);
    const changeCompany = getSqliteDb().prepare('UPDATE companies SET status = ? WHERE id = ?');
    changeCompany.run('suspended', user.company_id);
    assert.equal((await call('refresh', undefined, session.cookie)).status, 401);
    changeCompany.run('active', user.company_id);
    console.log('[PASS] Disabled user and suspended company rejection');

    const newPassword = 'Updated#Employee2026!';
    assert.equal((await call('change-password', { newPassword }, undefined, session.data.accessToken)).status, 400);
    assert.equal((await call('change-password', { currentPassword: 'incorrect', newPassword }, undefined, session.data.accessToken)).status, 400);
    const changed = await call('change-password', { currentPassword: employeePassword, newPassword }, undefined, session.data.accessToken);
    assert.equal(changed.status, 200);
    assert.equal((await call('refresh', undefined, session.cookie)).status, 401);
    assert.equal((await call('me', undefined, undefined, session.data.accessToken)).status, 401);
    assert.equal((await call('me', undefined, undefined, changed.data.accessToken)).status, 200);
    assert.equal((await call('refresh', undefined, changed.cookie)).status, 200);
    await mutateDb((db) => { db.users.find((entry) => entry.id === userId)!.must_change_password = true; });
    assert.equal((await call('change-password', { newPassword }, undefined, changed.data.accessToken)).status, 400);
    const firstLogin = await call('login', { ...employee, password: newPassword });
    assert.equal(firstLogin.status, 200);
    assert.equal((await call('change-password', { newPassword: 'FirstLogin#2026' }, undefined, firstLogin.data.accessToken)).status, 200);
    assert.equal((await call('refresh', undefined, firstLogin.cookie)).status, 401);
    console.log('[PASS] Password changes, first-login authorization and session revocation');

    const superSession = await call('login', { identifier: 'SA-001', password: 'PlusHR#Super2026!' });
    assert.equal(superSession.status, 200);
    const updatedAdmin = await call('change-password', {
      currentPassword: 'PlusHR#Super2026!', newPassword: changedAdminPassword,
    }, undefined, superSession.data.accessToken);
    assert.equal(updatedAdmin.status, 200);
    adminCookie = updatedAdmin.cookie;
    adminHash = loadDb().users.find((entry) => entry.id === 'user-superadmin')?.password_hash;
    const demo = await call('login', { identifier: 'MGT-001', password: 'Maghreb#Admin2026!' });
    assert.equal(demo.status, 200);
    demoCookie = demo.cookie;

    legacyId = 'legacy-bcrypt';
    const legacy = jwt.sign({ userId: 'user-superadmin' }, getRefreshSecret(), { expiresIn: '14d' });
    await mutateDb((db) => {
      db.refresh_tokens.push({
        id: legacyId!,
        user_id: 'user-superadmin',
        token_hash: bcrypt.hashSync(legacy, 6),
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        revoked_at: null,
      });
    });
    assert.equal((await call('refresh', undefined, `plushr_refresh=${legacy}`)).status, 401);
  } finally {
    await server.close();
  }

  process.env.NODE_ENV = 'production';
  process.env.ENABLE_DEMO_ACCOUNTS = 'false';
  const fixtures = {
    users: loadDb().users.length,
    companies: loadDb().companies.length,
    employees: loadDb().employees.length,
  };
  for (let boot = 0; boot < 2; boot++) {
    const prod = await startServer();
    try {
      assert.equal((await prod.call('demo-accounts')).status, 404);
      assert.equal((await prod.call('login', { identifier: 'MGT-001', password: 'Maghreb#Admin2026!' })).status, 401);
      assert.equal((await prod.call('login', { identifier: 'SA-001', password: 'PlusHR#Super2026!' })).status, 401);
      assert.equal((await prod.call('refresh', undefined, demoCookie)).status, 401);
      const admin = await prod.call('login', { identifier: 'superadmin@plushr.ma', password: changedAdminPassword });
      assert.equal(admin.status, 200);
      assert.equal(admin.data.user.role_code, 'SUPER_ADMIN');
      const refreshed = await prod.call('refresh', undefined, adminCookie);
      assert.equal(refreshed.status, 200);
      adminCookie = refreshed.cookie;

      const db = loadDb();
      assert.equal(db.users.length, fixtures.users);
      assert.equal(db.companies.length, fixtures.companies);
      assert.equal(db.employees.length, fixtures.employees);
      const disabledDemo = db.users.find((entry) => entry.matricule === 'MGT-001');
      assert.equal(disabledDemo?.is_active, false);
      assert.ok(disabledDemo && !bcrypt.compareSync('Maghreb#Admin2026!', disabledDemo.password_hash));
      assert.equal(db.users.find((entry) => entry.id === 'user-superadmin')?.password_hash, adminHash);
      assert.ok(db.refresh_tokens.find((token) => token.id === legacyId)?.revoked_at);
    } finally {
      await prod.close();
    }
  }
  console.log('[PASS] Production demo credentials blocked, changed Super Admin preserved, and startup migration is repeatable');
}

try {
  await run();
} finally {
  sqlite();
}
