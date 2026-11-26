import assert from 'node:assert/strict';
import { getSqliteDb } from '../server/config/database.js';

interface SentMail {
  sender: { email: string; name: string };
  to: Array<{ email: string }>;
  subject: string;
  textContent: string;
  htmlContent: string;
}

export async function waitFor<T>(read: () => T | undefined): Promise<T> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = read();
    if (result !== undefined) return result;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error('Timed out waiting for password recovery processing.');
}

export function mockBrevo() {
  process.env.BREVO_API_KEY = 'isolated-mock-brevo-key';
  process.env.EMAIL_FROM = 'noreply@example.test';
  process.env.EMAIL_FROM_NAME = '+HR';
  const originalFetch = globalThis.fetch;
  const messages: SentMail[] = [];
  let nextStatus = 201;
  globalThis.fetch = async (url, options) => {
    if (String(url) !== 'https://api.brevo.com/v3/smtp/email') return originalFetch(url, options);
    assert.equal(options?.method, 'POST');
    assert.equal(options?.redirect, 'error');
    assert.equal(new Headers(options?.headers).get('api-key'), 'isolated-mock-brevo-key');
    const mail = JSON.parse(String(options?.body)) as SentMail;
    assert.deepEqual(mail.sender, { email: 'noreply@example.test', name: '+HR' });
    assert.equal(mail.to.length, 1);
    messages.push(mail);
    const status = nextStatus;
    nextStatus = 201;
    return new Response('{}', { status });
  };

  return {
    messages,
    failNext() { nextStatus = 503; },
    restore() {
      globalThis.fetch = originalFetch;
      delete process.env.BREVO_API_KEY;
      delete process.env.EMAIL_FROM;
      delete process.env.EMAIL_FROM_NAME;
    },
    waitForCode(email: string, index: number) {
      return waitFor(() => {
        const mail = messages[index];
        if (!mail) return undefined;
        assert.equal(mail.to[0].email, email);
        const ready = getSqliteDb().prepare(`
          SELECT 1 FROM password_reset_otps WHERE email = ? AND used_at IS NULL AND otp_hash LIKE 'otp-v1:%'
        `).get(email);
        if (!ready) return undefined;
        const code = mail.textContent.match(/(?:^|\n)([0-9]{6})(?:\n|$)/)?.[1];
        assert.ok(code, 'Missing six-digit code in mock email');
        return code;
      });
    },
  };
}
