import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { loadDb, mutateDb, newId, logAudit } from '../repositories/dataStore.js';
import {
  AuthenticatedRequest,
  clearAuthCookies,
  getRefreshSecret,
  setAuthCookies,
  signAccessToken,
  signRefreshToken,
  JwtPayload,
} from '../middlewares/auth.js';
import jwt from 'jsonwebtoken';
import { isStrongPassword, isValidEmail, sanitizeText } from '../validators/validators.js';

export function isDemoModeEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEMO_ACCOUNTS !== 'false';
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

  const db = loadDb();
  const user = db.users.find(
    (u) => u.email.toLowerCase() === identifier || (u.matricule && u.matricule.toLowerCase() === identifier)
  );

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Identifiants invalides.' });
    return;
  }

  if (!user.is_active) {
    res.status(403).json({ error: 'Ce compte est désactivé. Contactez votre administrateur.' });
    return;
  }

  if (user.company_id) {
    const company = db.companies.find((c) => c.id === user.company_id);
    if (!company || company.status === 'suspended') {
      res.status(403).json({ error: 'L’espace de votre entreprise est actuellement suspendu.' });
      return;
    }
  }

  const payload: JwtPayload = {
    userId: user.id,
    companyId: user.company_id,
    roleCode: user.role_code,
    email: user.email,
  };

  const accessToken = signAccessToken(payload, rememberMe);
  const refreshToken = signRefreshToken(payload);

  await mutateDb((d) => {
    const u = d.users.find((x) => x.id === user.id);
    if (u) u.last_login_at = new Date().toISOString();
    d.refresh_tokens.push({
      id: newId('rt'),
      user_id: user.id,
      token_hash: bcrypt.hashSync(refreshToken, 6),
      expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
      revoked_at: null,
    });
    logAudit(d, {
      company_id: user.company_id,
      user_id: user.id,
      user_name: user.full_name,
      action: 'USER_LOGIN',
      entity_type: 'user',
      entity_id: user.id,
      details: `Connexion réussie (${user.role_code})`,
      ip_address: req.ip,
    });
  });

  setAuthCookies(res, accessToken, refreshToken, rememberMe);
  res.json({
    accessToken,
    user: buildAuthUserResponse(loadDb(), user),
  });
}

export async function logout(req: AuthenticatedRequest, res: Response): Promise<void> {
  const refreshCookie = req.cookies?.plushr_refresh as string | undefined;
  if (refreshCookie) {
    await mutateDb((db) => {
      db.refresh_tokens.forEach((rt) => {
        if (req.user && rt.user_id === req.user.userId && !rt.revoked_at) {
          rt.revoked_at = new Date().toISOString();
        }
      });
    });
  }
  clearAuthCookies(res);
  res.json({ ok: true });
}

export async function refreshSession(req: Request, res: Response): Promise<void> {
  const refreshCookie = req.cookies?.plushr_refresh as string | undefined;
  if (!refreshCookie) {
    res.status(401).json({ error: 'Token de rafraîchissement manquant.' });
    return;
  }
  try {
    const decoded = jwt.verify(refreshCookie, getRefreshSecret()) as JwtPayload;
    const db = loadDb();
    const user = db.users.find((u) => u.id === decoded.userId && u.is_active);
    if (!user) {
      res.status(401).json({ error: 'Utilisateur introuvable ou inactif.' });
      return;
    }
    const payload: JwtPayload = {
      userId: user.id,
      companyId: user.company_id,
      roleCode: user.role_code,
      email: user.email,
    };
    const accessToken = signAccessToken(payload, true);
    setAuthCookies(res, accessToken, refreshCookie, true);
    res.json({ accessToken, user: buildAuthUserResponse(db, user) });
  } catch {
    res.status(401).json({ error: 'Refresh token invalide ou expiré.' });
  }
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

  const db = loadDb();
  const user = db.users.find((u) => u.id === req.user?.userId);
  if (!user) {
    res.status(404).json({ error: 'Utilisateur introuvable.' });
    return;
  }

  if (!user.must_change_password && !bcrypt.compareSync(currentPassword, user.password_hash)) {
    res.status(400).json({ error: 'Mot de passe actuel incorrect.' });
    return;
  }

  await mutateDb((d) => {
    const u = d.users.find((x) => x.id === user.id);
    if (u) {
      u.password_hash = bcrypt.hashSync(newPassword, 10);
      u.must_change_password = false;
      u.updated_at = new Date().toISOString();
    }
    logAudit(d, {
      company_id: user.company_id,
      user_id: user.id,
      user_name: user.full_name,
      action: 'PASSWORD_CHANGED',
      entity_type: 'user',
      entity_id: user.id,
      details: 'Changement de mot de passe effectué',
    });
  });

  const updated = loadDb().users.find((u) => u.id === user.id)!;
  res.json({ ok: true, user: buildAuthUserResponse(loadDb(), updated) });
}

export async function requestPasswordOtp(req: Request, res: Response): Promise<void> {
  const email = sanitizeText(req.body?.email, 160).toLowerCase();
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Adresse email professionnelle invalide.' });
    return;
  }

  const db = loadDb();
  const user = db.users.find((u) => u.email.toLowerCase() === email && u.is_active);
  if (!user) {
    // Generic response to avoid account enumeration
    res.json({ ok: true, message: 'Si cette adresse existe, un code OTP valable 5 minutes a été généré.' });
    return;
  }

  const otpCode = String(crypto.randomInt(100000, 999999));
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  await mutateDb((d) => {
    // Invalidate prior unused OTPs
    d.password_reset_otps.forEach((o) => {
      if (o.user_id === user.id && !o.used_at) o.used_at = new Date().toISOString();
    });
    d.password_reset_otps.push({
      id: newId('otp'),
      user_id: user.id,
      email: user.email,
      otp_hash: bcrypt.hashSync(otpCode, 8),
      attempts: 0,
      expires_at: expiresAt,
      used_at: null,
      created_at: new Date().toISOString(),
    });
  });

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

  await mutateDb((db) => {
    const otpRecord = [...db.password_reset_otps]
      .reverse()
      .find((o) => o.email.toLowerCase() === email && !o.used_at);

    if (!otpRecord) {
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

    const user = db.users.find((u) => u.id === otpRecord.user_id);
    if (user) {
      user.password_hash = bcrypt.hashSync(newPassword, 10);
      user.must_change_password = false;
      user.updated_at = new Date().toISOString();
      otpRecord.used_at = new Date().toISOString();
      logAudit(db, {
        company_id: user.company_id,
        user_id: user.id,
        user_name: user.full_name,
        action: 'PASSWORD_RESET_OTP',
        entity_type: 'user',
        entity_id: user.id,
        details: 'Réinitialisation mot de passe par OTP vérifié',
      });
    }
  });

  if (errorMsg) {
    res.status(statusCode).json({ error: errorMsg });
    return;
  }

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
