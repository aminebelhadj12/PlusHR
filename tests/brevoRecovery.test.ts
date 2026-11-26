import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { createAppServer } from '../server.js';
import { getSqliteDb } from '../server/config/database.js';
import { resetDemoDatabase, mutateAuthDb } from '../server/repositories/dataStore.js';
import { isolateTestDatabase } from './isolatedDatabase.js';
import { mockBrevo, waitFor } from './mockBrevo.js';

const cleanup = isolateTestDatabase();
const brevo = mockBrevo();
const french = 'employe@atlas-industrial.ma';
const english = 'admin@atlas-industrial.ma';
const arabic = 'admin@maghrebtech.ma';
const unknown = 'unknown@example.test';

async function run() {
  resetDemoDatabase();
  const db = getSqliteDb();
  const passwordHash = bcrypt.hashSync('Fixture#Private2026', 6);
  const updateUser = db.prepare('UPDATE users SET password_hash = ?, preferred_lang = ? WHERE email = ?');
  updateUser.run(passwordHash, 'fr', french);
  updateUser.run(passwordHash, 'en', english);
  updateUser.run(passwordHash, 'ar', arabic);
  const setCompany = db.prepare('UPDATE companies SET status = ? WHERE id = ?');
  setCompany.run('suspended', 'comp-maghreb');
  const blocked = db.prepare("SELECT email FROM users WHERE matricule = 'ATL-002'").pluck().get() as string;

  process.env.NODE_ENV = 'production';
  process.env.ENABLE_DEMO_ACCOUNTS = 'false';
  const { httpServer } = await createAppServer({ skipVite: true, scheduleBackups: false });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address() as { port: number };
  let ip = '192.0.2.10';

  async function post(route: string, body: unknown) {
    const response = await fetch(`http://127.0.0.1:${port}/api/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
      body: JSON.stringify(body),
    });
    const data = response.headers.get('content-type')?.includes('application/json')
      ? await response.json() : await response.text();
    return { status: response.status, data, cache: response.headers.get('cache-control') };
  }
  const request = (email: string, extras = {}) => post('auth/otp/request', { email, ...extras });
  const verify = (email: string, body: object) => post('auth/otp/verify-reset', { email, ...body });
  const count = () => db.prepare('SELECT COUNT(*) FROM password_reset_otps').pluck().get();
  const ageRequests = (email: string) => db.prepare('UPDATE password_reset_otps SET created_at = ? WHERE email = ?')
    .run(new Date(Date.now() - 120_000).toISOString(), email);
  async function settle() {
    await new Promise<void>((resolve) => setImmediate(resolve));
    await mutateAuthDb(() => undefined);
  }

  try {
    delete process.env.BREVO_API_KEY;
    const disabledConfig = await request(french);
    await settle();
    assert.equal(count(), 0);
    assert.equal(brevo.messages.length, 0);
    const noConfigVerify = await verify(french, { code: '123456', verifyOnly: true });
    assert.equal(noConfigVerify.status, 400);
    process.env.BREVO_API_KEY = 'isolated-mock-brevo-key';

    const generic = await request(unknown, { to: french, recipient: french });
    assert.equal(generic.status, 200);
    assert.deepEqual(Object.keys(generic.data).sort(), ['message', 'ok']);
    for (const address of [blocked, arabic, 'invalid', french.toUpperCase()]) {
      assert.deepEqual(await request(address, { to: unknown, company_id: 'comp-maghreb' }), generic);
    }
    assert.deepEqual(disabledConfig, generic);
    const firstCode = await brevo.waitForCode(french, 0);
    assert.equal(brevo.messages.length, 1);
    assert.equal(count(), 1);
    assert.match(brevo.messages[0].htmlContent, /lang="fr" dir="ltr"/);
    assert.ok(!JSON.stringify(generic.data).includes(firstCode));
    const first = db.prepare('SELECT id, otp_hash, expires_at, created_at FROM password_reset_otps WHERE email = ?').get(french) as
      { id: string; otp_hash: string; expires_at: string; created_at: string };
    assert.match(first.otp_hash, /^otp-v1:[a-f0-9]{64}$/);
    assert.equal(Date.parse(first.expires_at) - Date.parse(first.created_at), 300_000);
    assert.deepEqual(await request(french), generic);
    await settle();
    assert.equal(count(), 1);
    console.log('[PASS] Generic response, no delivery without configuration, and recipient is the active database account');

    ageRequests(french);
    await request(french);
    const code = await brevo.waitForCode(french, 1);
    assert.ok(db.prepare('SELECT used_at FROM password_reset_otps WHERE id = ?').pluck().get(first.id));
    ageRequests(french);
    brevo.failNext();
    await request(french);
    await waitFor(() => {
      const row = db.prepare(`SELECT used_at FROM password_reset_otps WHERE email = ? AND otp_hash LIKE 'pending:%'`)
        .pluck().get(french);
      return row || undefined;
    });
    assert.equal((await verify(french, { code, verifyOnly: true })).status, 400);
    ageRequests(french);
    assert.deepEqual(await request(french), generic);
    await settle();
    assert.equal(brevo.messages.length, 3);
    console.log('[PASS] Reissue invalidates the previous OTP, failed delivery disables its record, and per-account limits apply');

    ip = '192.0.2.11';
    await request(english);
    const enCode = await brevo.waitForCode(english, 3);
    assert.match(brevo.messages[3].subject, /Password reset code/);
    const invalid = await verify(unknown, { code: enCode, verifyOnly: true });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.cache, 'no-store');
    setCompany.run('suspended', 'comp-atlas');
    assert.deepEqual(await verify(english, { code: enCode, verifyOnly: true }), invalid);
    setCompany.run('active', 'comp-atlas');
    const expires = db.prepare('UPDATE password_reset_otps SET expires_at = ? WHERE email = ?');
    expires.run(new Date(Date.now() - 1).toISOString(), english);
    assert.deepEqual(await verify(english, { code: enCode, verifyOnly: true }), invalid);
    expires.run(new Date(Date.now() + 60_000).toISOString(), english);
    const wrongCode = enCode === '000000' ? '111111' : '000000';
    for (let attempt = 0; attempt < 5; attempt++) {
      assert.deepEqual(await verify(english, { code: wrongCode, verifyOnly: true }), invalid);
    }
    assert.deepEqual(await verify(english, { code: enCode, verifyOnly: true }), invalid);
    assert.equal(db.prepare('SELECT attempts FROM password_reset_otps WHERE email = ?').pluck().get(english), 5);

    setCompany.run('active', 'comp-maghreb');
    await request(arabic);
    const arCode = await brevo.waitForCode(arabic, 4);
    assert.match(brevo.messages[4].htmlContent, /lang="ar" dir="rtl"/);
    assert.match(brevo.messages[4].subject, /\p{Script=Arabic}/u);

    const exchanged = await Promise.all([
      verify(arabic, { code: arCode, verifyOnly: true }),
      verify(arabic, { code: arCode, verifyOnly: true }),
    ]);
    assert.deepEqual(exchanged.map((result) => result.status).sort(), [200, 400]);
    const { resetToken } = exchanged.find((result) => result.status === 200)!.data;
    assert.match(resetToken, /^[a-f0-9]{64}$/);
    const newPassword = 'Recovery#Changed2026';
    assert.deepEqual(await verify(english, { resetToken, newPassword }), invalid);
    assert.deepEqual(await verify(arabic, { code: arCode, newPassword }), invalid);
    assert.equal((await verify(arabic, { resetToken, newPassword })).status, 200);
    assert.deepEqual(await verify(arabic, { resetToken, newPassword }), invalid);
    assert.equal((await post('auth/login', { identifier: arabic, password: newPassword })).status, 200);
    console.log('[PASS] Localized templates, unchanged generic verification failures, expiry, attempt limits and single-use reset grants');

    ip = '192.0.2.12';
    for (let attempt = 0; attempt < 10; attempt++) assert.equal((await request(unknown)).status, 200);
    assert.equal((await request(french)).status, 429);
    assert.equal((await post('auth/register', { email: unknown })).status, 404);
    console.log('[PASS] Request rate limit and no public registration');
  } finally {
    httpServer.closeAllConnections();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
}

try {
  await run();
} finally {
  brevo.restore();
  cleanup();
}
