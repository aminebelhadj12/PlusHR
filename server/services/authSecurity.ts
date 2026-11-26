import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { demoPasswords, isDemoModeEnabled } from '../config/demoAccounts.js';
import { mutateAuthDb, type DbSchema } from '../repositories/dataStore.js';

const digestPrefix = 'sha256:';
const disabledDemoPassword = '!disabled-demo';

export function refreshDigest(token: string): string {
  return digestPrefix + crypto.createHash('sha256').update(token).digest('hex');
}

export function revokeUserSessions(db: DbSchema, userId: string, now: string): void {
  for (const token of db.refresh_tokens) {
    if (token.user_id === userId && !token.revoked_at) token.revoked_at = now;
  }
  for (const otp of db.password_reset_otps) {
    if (otp.user_id === userId && !otp.used_at) otp.used_at = now;
  }
}

export function hasDefaultDemoPassword(user: DbSchema['users'][number]): boolean {
  if (user.id !== 'user-superadmin' && !/^user-emp-(atlas|atl|mgt)-[0-9]+$/.test(user.id)) return false;
  return user.password_hash !== disabledDemoPassword &&
    [...demoPasswords].some((password) => bcrypt.compareSync(password, user.password_hash));
}

export async function migrateAuthSecurity(): Promise<void> {
  await mutateAuthDb((db) => {
    const now = new Date().toISOString();
    for (const token of db.refresh_tokens) {
      // Legacy bcrypt only covered the first 72 bytes of a JWT.
      if (!token.revoked_at && !token.token_hash.startsWith(digestPrefix)) token.revoked_at = now;
    }

    if (isDemoModeEnabled()) return;
    for (const user of db.users) {
      if (!hasDefaultDemoPassword(user)) continue;

      // Preserve linked records and accounts whose passwords have already changed.
      user.password_hash = disabledDemoPassword;
      user.is_active = false;
      user.updated_at = now;
      revokeUserSessions(db, user.id, now);
    }
  });
}
