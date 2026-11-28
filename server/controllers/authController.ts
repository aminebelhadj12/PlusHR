import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { loadDb, mutateDb, mutateAuthDb, newId, logAudit, type DbSchema, type DbUser } from '../repositories/dataStore.js';
import {
  AuthenticatedRequest,
  canAuthenticate,
  createSessionPayload,
  matchesSession,
  clearAuthCookies,
  getRefreshSecret,
  getJwtSecret,
  setAuthCookies,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  JwtPayload,
} from '../middlewares/auth.js';
import jwt from 'jsonwebtoken';
import { isStrongPassword, isValidEmail, sanitizeText } from '../validators/validators.js';

import { demoPasswords, isDemoModeEnabled } from '../config/demoAccounts.js';
import { hasDefaultDemoPassword, refreshDigest, revokeUserSessions } from '../services/authSecurity.js';
import { getSqliteDb } from '../config/database.js';
import { getBrevoConfig, sendPasswordResetEmail } from '../services/brevoEmail.js';
import { getRealtimeIo } from '../services/realtimeService.js';

function issueSession(db: DbSchema, user: DbUser, rememberMe: boolean, firstLogin = user.must_change_password) {
  const payload = { ...createSessionPayload(user, rememberMe), firstLogin };
  const refreshToken = signRefreshToken(payload);
  const accessToken = signAccessToken(payload, rememberMe);
  db.refresh_tokens.push({
    id: payload.sessionId,
    user_id: user.id,
    token_hash: refreshDigest(refreshToken),
    expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
    revoked_at: null,
  });
  return { accessToken, refreshToken, user: buildAuthUserResponse(db, user) };
}

function respondWithSession(res: Response, session: ReturnType<typeof issueSession>, rememberMe: boolean): void {
  setAuthCookies(res, session.accessToken, session.refreshToken, rememberMe);
  res.json({ ok: true, accessToken: session.accessToken, user: session.user });
}

function buildAuthUserResponse(db: ReturnType<typeof loadDb>, user: ReturnType<typeof loadDb>['users'][number]) {
  const emp = db.employees.find((e) => e.user_id === user.id);
  const comp = user.company_id ? db.companies.find((c) => c.id === user.company_id) : null;
  return {
    id: user.id,
    company_id: user.company_id,
    company_name: comp?.name || 'Plateforme +HR',
    role_code: user.role_code,
    email: user.email,
    matricule: user.matricule,
    full_name: user.full_name,
    preferred_lang: user.preferred_lang,
    theme: user.theme,
    must_change_password: user.must_change_password,
    employee_id: emp?.id || null,
    department_id: emp?.department_id || null,
    webauthn_credential_id: user.webauthn_credential_id || null,
  };
}

export async function login(req: Request, res: Response): Promise<void> {
  const identifier = sanitizeText(req.body?.identifier, 160).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const rememberMe = Boolean(req.body?.rememberMe);

  if (!identifier || !password) {
    res.status(400).json({ error: 'Identifiant professionnel (ou matricule) et mot de passe requis.' });
    return;
  }

  if (!isDemoModeEnabled() && demoPasswords.has(password)) {
    res.status(401).json({ error: 'Identifiants invalides.' });
    return;
  }

  const result = await mutateAuthDb((db) => {
    const user = db.users.find(
      (u) => u.email.toLowerCase() === identifier || (u.matricule && u.matricule.toLowerCase() === identifier)
    );
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return { status: 401, error: 'Identifiants invalides.' };
    }
    if (!user.is_active) {
      return { status: 403, error: 'Ce compte est désactivé. Contactez votre administrateur.' };
    }
    if (!canAuthenticate(db, user)) {
      return { status: 403, error: 'L’espace de votre entreprise est actuellement suspendu.' };
    }

    user.last_login_at = new Date().toISOString();
    logAudit(db, {
      company_id: user.company_id,
      user_id: user.id,
      user_name: user.full_name,
      action: 'USER_LOGIN',
      entity_type: 'user',
      entity_id: user.id,
      details: `Connexion réussie (${user.role_code})`,
      ip_address: req.ip,
    });
    return { session: issueSession(db, user, rememberMe) };
  });

  if (!result.session) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  respondWithSession(res, result.session, rememberMe);
}

export async function logout(req: Request, res: Response): Promise<void> {
  const refreshCookie = req.cookies?.plushr_refresh;
  const accessCookie = req.cookies?.plushr_access;
  const authorization = req.get('authorization');
  const bearerToken = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : undefined;
  const accessSessionIds = new Set<string>();
  for (const token of [accessCookie, bearerToken]) {
    if (typeof token !== 'string' || !token) continue;
    try {
      accessSessionIds.add(verifyAccessToken(token).sessionId);
    } catch {
      continue;
    }
  }
  const refreshDigestValue = typeof refreshCookie === 'string' && refreshCookie
    ? refreshDigest(refreshCookie)
    : undefined;
  const sessionIds = new Set<string>();
  await mutateAuthDb((db) => {
    const now = new Date().toISOString();
    const refreshRecord = refreshDigestValue
      ? db.refresh_tokens.find((token) => token.token_hash === refreshDigestValue)
      : undefined;
    const accessRecords = [...accessSessionIds].map((sessionId) =>
      db.refresh_tokens.find((token) => token.id === sessionId)
    );
    for (const record of new Set([refreshRecord, ...accessRecords])) {
      if (record && !record.revoked_at) {
        record.revoked_at = now;
        sessionIds.add(record.id);
      }
    }
  });
  for (const sessionId of sessionIds) {
    getRealtimeIo()?.in(`session:${sessionId}`).disconnectSockets(true);
  }
  clearAuthCookies(res);
  res.json({ ok: true });
}

export async function refreshSession(req: Request, res: Response): Promise<void> {
  const refreshCookie = req.cookies?.plushr_refresh;
  if (typeof refreshCookie !== 'string' || !refreshCookie) {
    res.status(401).json({ error: 'Token de rafraîchissement manquant.' });
    return;
  }

  let decoded: JwtPayload & { exp: number };
  try {
    decoded = jwt.verify(refreshCookie, getRefreshSecret(), {
      algorithms: ['HS256'],
      audience: 'plushr-refresh',
    }) as JwtPayload & { exp: number };
    if (typeof decoded.userId !== 'string' || typeof decoded.exp !== 'number') {
      throw new Error('Invalid refresh claims');
    }
  } catch {
    res.status(401).json({ error: 'Refresh token invalide ou expiré.' });
    return;
  }

  const digest = refreshDigest(refreshCookie);
  const rememberMe = decoded.rememberMe === true;
  const result = await mutateAuthDb((db) => {
    const now = Date.now();
    const record = db.refresh_tokens.find((token) =>
      token.id === decoded.sessionId && token.token_hash === digest && token.user_id === decoded.userId
    );
    if (!record || record.revoked_at || !(Date.parse(record.expires_at) > now) || decoded.exp * 1000 <= now) {
      return null;
    }
    const user = db.users.find((u) => u.id === record.user_id);
    if (!user || !canAuthenticate(db, user) || !matchesSession(decoded, user)) return null;

    record.revoked_at = new Date(now).toISOString();
    return {
      sessionId: record.id,
      session: issueSession(db, user, rememberMe, decoded.firstLogin === true && user.must_change_password),
    };
  });

  if (!result) {
    res.status(401).json({ error: 'Refresh token invalide ou expiré.' });
    return;
  }
  getRealtimeIo()?.in(`session:${result.sessionId}`).disconnectSockets(true);
  respondWithSession(res, result.session, rememberMe);
}

export function getMe(req: AuthenticatedRequest, res: Response): void {
  const db = loadDb();
  const user = db.users.find((u) => u.id === req.user?.userId);
  if (!user) {
    res.status(404).json({ error: 'Utilisateur introuvable.' });
    return;
  }
  res.json({ user: buildAuthUserResponse(db, user) });
}

export async function changePassword(req: AuthenticatedRequest, res: Response): Promise<void> {
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

  if (!isStrongPassword(newPassword)) {
    res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule et un chiffre.' });
    return;
  }

  if (!isDemoModeEnabled() && demoPasswords.has(newPassword)) {
    res.status(400).json({ error: 'Choisissez un autre mot de passe.' });
    return;
  }

  const authenticated = req.user!;
  const rememberMe = authenticated.rememberMe === true;
  const result = await mutateAuthDb((db) => {
    const user = db.users.find((u) => u.id === authenticated.userId);
    if (!user || !canAuthenticate(db, user) || !matchesSession(authenticated, user)) {
      return { status: 401, error: 'Session expirée ou invalide.' };
    }
    const authorizedFirstLogin = user.must_change_password && authenticated.firstLogin === true;
    if (!authorizedFirstLogin && !bcrypt.compareSync(currentPassword, user.password_hash)) {
      return { status: 400, error: 'Mot de passe actuel incorrect.' };
    }

    user.password_hash = bcrypt.hashSync(newPassword, 10);
    user.must_change_password = false;
    user.updated_at = new Date().toISOString();
    revokeUserSessions(db, user.id, user.updated_at);
    logAudit(db, {
      company_id: user.company_id,
      user_id: user.id,
      user_name: user.full_name,
      action: 'PASSWORD_CHANGED',
      entity_type: 'user',
      entity_id: user.id,
      details: 'Changement de mot de passe effectué',
    });
    return { session: issueSession(db, user, rememberMe) };
  });

  if (!result.session) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  getRealtimeIo()?.in(`user:${authenticated.userId}`).disconnectSockets(true);
  respondWithSession(res, result.session, rememberMe);
}

const otpValidity = 5 * 60_000;
const otpRequestWindow = 15 * 60_000;
const invalidOtpMessage = 'Code ou demande de réinitialisation invalide ou expiré.';
const otpPrefix = 'otp-v1:';
const resetPrefix = 'reset-v1:';

function readRecoveryEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const email = input.trim();
  if (email.length > 254 || !isValidEmail(email) || /[<>,;\x00-\x1f\x7f]/.test(email)) return null;
  return email.toLowerCase();
}

function recoveryDigest(prefix: string, recordId: string, companyId: string | null, secret: string): string {
  return prefix + crypto.createHmac('sha256', getJwtSecret())
    .update(JSON.stringify([prefix, recordId, companyId, secret])).digest('hex');
}

function matchesRecoveryDigest(stored: string, expected: string): boolean {
  const digest = Buffer.from(stored);
  const supplied = Buffer.from(expected);
  return digest.length === supplied.length && crypto.timingSafeEqual(digest, supplied);
}

export async function requestPasswordOtp(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store').json({
    ok: true, message: 'Si un compte actif est associé à cette adresse, vous recevrez un code de réinitialisation par e-mail.',
  });

  const config = getBrevoConfig();
  const email = readRecoveryEmail(req.body?.email);
  if (!config || !email) return;

  // Finish the generic HTTP response before doing any account-dependent work.
  await new Promise<void>((resolve) => setImmediate(resolve));
  const issued = await mutateAuthDb((db) => {
    const users = db.users.filter((user) => readRecoveryEmail(user.email) === email);
    const user = users.length === 1 ? users[0] : undefined;
    if (!user || !canAuthenticate(db, user)) return null;

    const now = Date.now();
    const prior = db.password_reset_otps.filter((record) => record.user_id === user.id);
    const recent = prior.filter((record) => Date.parse(record.created_at) > now - otpRequestWindow);
    if (recent.length >= 3 || recent.some((record) => Date.parse(record.created_at) > now - 60_000)) return null;
    if (hasDefaultDemoPassword(user)) return null;

    const code = String(crypto.randomInt(1_000_000)).padStart(6, '0');
    const id = newId('otp');
    const digest = recoveryDigest(otpPrefix, id, user.company_id, code);
    const createdAt = new Date(now).toISOString();
    for (const record of prior) {
      if (!record.used_at) record.used_at = createdAt;
    }
    db.password_reset_otps.push({
      id,
      user_id: user.id,
      email: user.email,
      otp_hash: 'pending:' + digest,
      attempts: 0,
      expires_at: new Date(now + otpValidity).toISOString(),
      used_at: null,
      created_at: createdAt,
    });
    return { id, code, digest, userId: user.id, companyId: user.company_id };
  });
  if (!issued) return;

  // Re-read the authoritative recipient and account state immediately before calling Brevo.
  const recipient = getSqliteDb().prepare(`
    SELECT u.email, u.preferred_lang FROM users u
    JOIN password_reset_otps o ON o.user_id = u.id AND o.email = u.email
    WHERE u.id = ? AND u.company_id IS ? AND o.id = ? AND o.used_at IS NULL AND o.expires_at > ? AND u.is_active = 1
      AND (u.company_id IS NULL OR EXISTS (
        SELECT 1 FROM companies c WHERE c.id = u.company_id AND c.status <> 'suspended'
      ))
  `).get(issued.userId, issued.companyId, issued.id, new Date().toISOString()) as { email: string; preferred_lang: string } | undefined;
  const delivered = recipient ? await sendPasswordResetEmail(config, recipient.email, recipient.preferred_lang, issued.code) : false;
  await mutateAuthDb((db) => {
    const record = db.password_reset_otps.find((otp) => otp.id === issued.id && !otp.used_at);
    if (!record) return;
    const user = db.users.find((entry) => entry.id === record.user_id && entry.email === record.email);
    if (delivered && user && user.company_id === issued.companyId && canAuthenticate(db, user) && Date.parse(record.expires_at) > Date.now()) {
      record.otp_hash = issued.digest;
    } else {
      record.used_at = new Date().toISOString();
    }
  });
}

export async function verifyAndResetPasswordWithOtp(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const email = readRecoveryEmail(req.body?.email);
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  const token = typeof req.body?.resetToken === 'string' ? req.body.resetToken : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  const verifyOnly = req.body?.verifyOnly === true;

  if (!getBrevoConfig() || !email || (token ? verifyOnly || !/^[a-f0-9]{64}$/.test(token) : !/^\d{6}$/.test(code))) {
    res.status(400).json({ error: invalidOtpMessage });
    return;
  }
  if (!verifyOnly && (!isStrongPassword(newPassword) || Buffer.byteLength(newPassword, 'utf8') > 72)) {
    res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule et un chiffre, avec un maximum de 72 octets.' });
    return;
  }
  if (!verifyOnly && !isDemoModeEnabled() && demoPasswords.has(newPassword)) {
    res.status(400).json({ error: 'Choisissez un autre mot de passe.' });
    return;
  }

  const result = await mutateAuthDb((db) => {
    const users = db.users.filter((user) => readRecoveryEmail(user.email) === email);
    const user = users.length === 1 ? users[0] : undefined;
    if (!user || !canAuthenticate(db, user)) return null;
    const record = db.password_reset_otps.find((otp) =>
      otp.user_id === user.id && otp.email === user.email && !otp.used_at &&
      otp.otp_hash.startsWith(token ? resetPrefix : otpPrefix)
    );
    if (!record || !(Date.parse(record.expires_at) > Date.now()) || record.attempts >= 5) return null;

    if (!matchesRecoveryDigest(record.otp_hash, recoveryDigest(token ? resetPrefix : otpPrefix, record.id, user.company_id, token || code))) {
      if (!token) record.attempts += 1;
      return null;
    }
    if (verifyOnly) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      record.otp_hash = recoveryDigest(resetPrefix, record.id, user.company_id, resetToken);
      return { resetToken };
    }

    user.password_hash = bcrypt.hashSync(newPassword, 10);
    user.must_change_password = false;
    user.updated_at = new Date().toISOString();
    revokeUserSessions(db, user.id, user.updated_at);
    logAudit(db, {
      company_id: user.company_id,
      user_id: user.id,
      user_name: user.full_name,
      action: 'PASSWORD_RESET_OTP',
      entity_type: 'user',
      entity_id: user.id,
      details: 'Réinitialisation mot de passe par OTP vérifié',
    });
    return { userId: user.id };
  });

  if (!result) {
    res.status(400).json({ error: invalidOtpMessage });
    return;
  }
  if (result.resetToken) {
    res.json({ ok: true, message: 'Code OTP vérifié.', resetToken: result.resetToken });
    return;
  }
  getRealtimeIo()?.in(`user:${result.userId}`).disconnectSockets(true);
  res.json({ ok: true, message: 'Mot de passe réinitialisé avec succès.' });
}

export async function updateMyProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
  const preferredLang = req.body?.preferred_lang;
  const theme = req.body?.theme;
  const phone = req.body?.phone !== undefined ? sanitizeText(req.body.phone, 40) : undefined;
  const emergencyContact = req.body?.emergency_contact !== undefined ? sanitizeText(req.body.emergency_contact, 160) : undefined;
  const address = req.body?.address !== undefined ? sanitizeText(req.body.address, 250) : undefined;

  await mutateDb((db) => {
    const u = db.users.find((x) => x.id === req.user?.userId);
    if (!u) return;
    if (preferredLang === 'fr' || preferredLang === 'en' || preferredLang === 'ar') u.preferred_lang = preferredLang;
    if (theme === 'light' || theme === 'dark') u.theme = theme;
    u.updated_at = new Date().toISOString();

    const emp = db.employees.find((e) => e.user_id === u.id);
    if (emp) {
      if (phone !== undefined) emp.phone = phone;
      if (emergencyContact !== undefined) emp.emergency_contact = emergencyContact;
      if (address !== undefined) emp.address = address;
    }
  });

  const db = loadDb();
  const user = db.users.find((u) => u.id === req.user?.userId)!;
  res.json({ user: buildAuthUserResponse(db, user) });
}

export async function registerWebAuthnCredential(req: AuthenticatedRequest, res: Response): Promise<void> {
  const credentialId = sanitizeText(req.body?.credentialId, 255);
  if (!credentialId) {
    res.status(400).json({ error: 'Identifiant WebAuthn requis.' });
    return;
  }
  await mutateDb((db) => {
    const u = db.users.find((x) => x.id === req.user?.userId);
    if (u) {
      u.webauthn_credential_id = credentialId;
      u.updated_at = new Date().toISOString();
    }
  });
  res.json({ ok: true, credentialId });
}

export function getDemoAccounts(_req: Request, res: Response): void {
  if (!isDemoModeEnabled()) {
    res.status(404).json({ error: 'Not available in production' });
    return;
  }
  res.json({
    enabled: true,
    accounts: [
      { role: 'SUPER_ADMIN', label: 'Super Admin', company: 'Plateforme +HR', identifier: 'superadmin@plushr.ma', password: 'PlusHR#Super2026!' },
      { role: 'COMPANY_ADMIN', label: 'Admin Entreprise (Atlas)', company: 'Atlas Industrial Group', identifier: 'ATL-001', password: 'Atlas#Admin2026!' },
      { role: 'HR_MANAGER', label: 'Responsable RH (Atlas)', company: 'Atlas Industrial Group', identifier: 'ATL-002', password: 'Atlas#HR2026!' },
      { role: 'MANAGER', label: 'Manager Production (Atlas)', company: 'Atlas Industrial Group', identifier: 'ATL-003', password: 'Atlas#Mgr2026!' },
      { role: 'EMPLOYEE', label: 'Employé (Atlas)', company: 'Atlas Industrial Group', identifier: 'ATL-010', password: 'Atlas#Emp2026!' },
      { role: 'COMPANY_ADMIN', label: 'Admin Entreprise (Maghreb Tech)', company: 'Maghreb Tech Solutions', identifier: 'MGT-001', password: 'Maghreb#Admin2026!' },
    ],
  });
}
