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
  setAuthCookies,
  signAccessToken,
  signRefreshToken,
  JwtPayload,
} from '../middlewares/auth.js';
import jwt from 'jsonwebtoken';
import { isStrongPassword, isValidEmail, sanitizeText } from '../validators/validators.js';

import { demoPasswords, isDemoModeEnabled } from '../config/demoAccounts.js';
import { refreshDigest, revokeUserSessions } from '../services/authSecurity.js';
import { getRealtimeIo } from '../services/realtimeService.js';

function issueSession(db: DbSchema, user: DbUser, rememberMe: boolean, firstLogin = user.must_change_password) {
  const payload = { ...createSessionPayload(user, rememberMe), firstLogin };
  const accessToken = signAccessToken(payload, rememberMe);
  const refreshToken = signRefreshToken(payload);
  db.refresh_tokens.push({
    id: crypto.randomUUID(),
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
  if (typeof refreshCookie === 'string' && refreshCookie) {
    const digest = refreshDigest(refreshCookie);
    await mutateAuthDb((db) => {
      const record = db.refresh_tokens.find((token) => token.token_hash === digest && !token.revoked_at);
      if (record) record.revoked_at = new Date().toISOString();
    });
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
  const session = await mutateAuthDb((db) => {
    const now = Date.now();
    const record = db.refresh_tokens.find((token) => token.token_hash === digest && token.user_id === decoded.userId);
    if (!record || record.revoked_at || !(Date.parse(record.expires_at) > now) || decoded.exp * 1000 <= now) {
      return null;
    }
    const user = db.users.find((u) => u.id === record.user_id);
    if (!user || !canAuthenticate(db, user) || !matchesSession(decoded, user)) return null;

    record.revoked_at = new Date(now).toISOString();
    return issueSession(db, user, rememberMe, decoded.firstLogin === true && user.must_change_password);
  });

  if (!session) {
    res.status(401).json({ error: 'Refresh token invalide ou expiré.' });
    return;
  }
  respondWithSession(res, session, rememberMe);
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

export async function requestPasswordOtp(req: Request, res: Response): Promise<void> {
  const email = sanitizeText(req.body?.email, 160).toLowerCase();
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Adresse email professionnelle invalide.' });
    return;
  }

  const otpCode = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const user = await mutateAuthDb((db) => {
    const user = db.users.find((u) => u.email.toLowerCase() === email && canAuthenticate(db, u));
    if (!user) return null;
    for (const otp of db.password_reset_otps) {
      if (otp.user_id === user.id && !otp.used_at) otp.used_at = new Date().toISOString();
    }
    db.password_reset_otps.push({
      id: newId('otp'),
      user_id: user.id,
      email: user.email,
      otp_hash: bcrypt.hashSync(otpCode, 8),
      attempts: 0,
      expires_at: expiresAt,
      used_at: null,
      created_at: new Date().toISOString(),
    });
    return user;
  });

  if (!user) {
    res.json({ ok: true, message: 'Si cette adresse existe, un code OTP valable 5 minutes a été généré.' });
    return;
  }

  const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
  if (!smtpConfigured) {
    console.log(`[+HR OTP DEV] Code OTP pour ${user.email} (valable 5 min): ${otpCode}`);
  }

  res.json({
    ok: true,
    smtpConfigured,
    message: smtpConfigured
      ? 'Un code à 6 chiffres a été envoyé à votre adresse professionnelle.'
      : 'Service SMTP non configuré : en mode développement, le code OTP est disponible dans la console serveur ou ci-dessous.',
    ...(isDemoModeEnabled() && !smtpConfigured ? { devOtpPreview: otpCode } : {}),
  });
}

export async function verifyAndResetPasswordWithOtp(req: Request, res: Response): Promise<void> {
  const email = sanitizeText(req.body?.email, 160).toLowerCase();
  const code = sanitizeText(req.body?.code, 10);
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  const verifyOnly = Boolean(req.body?.verifyOnly);

  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
    res.status(400).json({ error: 'Email ou code OTP à 6 chiffres invalide.' });
    return;
  }

  let errorMsg: string | null = null;
  let statusCode = 200;
  let resetUserId: string | undefined;

  await mutateAuthDb((db) => {
    const otpRecord = [...db.password_reset_otps]
      .reverse()
      .find((o) => o.email.toLowerCase() === email && !o.used_at);

    const user = db.users.find((u) => u.id === otpRecord?.user_id && u.email.toLowerCase() === email);
    if (!otpRecord || !user || !canAuthenticate(db, user)) {
      statusCode = 400;
      errorMsg = 'Aucun code OTP actif pour cet email.';
      return;
    }

    if (Date.now() > Date.parse(otpRecord.expires_at)) {
      statusCode = 400;
      errorMsg = 'Code OTP expiré (validité 5 minutes dépassée).';
      return;
    }

    if (otpRecord.attempts >= 5) {
      statusCode = 429;
      errorMsg = 'Nombre maximal de tentatives atteint (5). Veuillez demander un nouveau code.';
      return;
    }

    if (!bcrypt.compareSync(code, otpRecord.otp_hash)) {
      otpRecord.attempts += 1;
      statusCode = 400;
      errorMsg = `Code incorrect. Tentatives restantes : ${Math.max(0, 5 - otpRecord.attempts)}.`;
      return;
    }

    if (verifyOnly) {
      return;
    }

    if (!isStrongPassword(newPassword)) {
      statusCode = 400;
      errorMsg = 'Le nouveau mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule et un chiffre.';
      return;
    }

    if (!isDemoModeEnabled() && demoPasswords.has(newPassword)) {
      statusCode = 400;
      errorMsg = 'Choisissez un autre mot de passe.';
      return;
    }

    user.password_hash = bcrypt.hashSync(newPassword, 10);
    user.must_change_password = false;
    user.updated_at = new Date().toISOString();
    revokeUserSessions(db, user.id, user.updated_at);
    resetUserId = user.id;
    logAudit(db, {
      company_id: user.company_id,
      user_id: user.id,
      user_name: user.full_name,
      action: 'PASSWORD_RESET_OTP',
      entity_type: 'user',
      entity_id: user.id,
      details: 'Réinitialisation mot de passe par OTP vérifié',
    });
  });

  if (errorMsg) {
    res.status(statusCode).json({ error: errorMsg });
    return;
  }

  if (resetUserId) getRealtimeIo()?.in(`user:${resetUserId}`).disconnectSockets(true);
  res.json({ ok: true, message: verifyOnly ? 'Code OTP vérifié.' : 'Mot de passe réinitialisé avec succès.' });
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
