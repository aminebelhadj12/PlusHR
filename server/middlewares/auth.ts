import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getSessionGeneration, getSqliteDb } from '../config/database.js';
import type { DbSchema, DbUser } from '../repositories/dataStore.js';
import type { RoleCode } from '../../src/types/index.js';

const IN_MEMORY_JWT_SECRET = crypto.randomBytes(32).toString('hex');
const IN_MEMORY_REFRESH_SECRET = crypto.randomBytes(32).toString('hex');

export function getJwtSecret(): string {
  return process.env.JWT_SECRET?.trim() || IN_MEMORY_JWT_SECRET;
}

export function getRefreshSecret(): string {
  return process.env.JWT_REFRESH_SECRET?.trim() || IN_MEMORY_REFRESH_SECRET;
}

export interface JwtPayload {
  userId: string;
  sessionId: string;
  companyId: string | null;
  roleCode: RoleCode;
  email: string;
  credentialStamp: string;
  firstLogin: boolean;
  rememberMe: boolean;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export function signAccessToken(payload: JwtPayload, rememberMe = false): string {
  return jwt.sign(payload, getJwtSecret(), {
    audience: 'plushr-access',
    expiresIn: rememberMe ? '7d' : '12h',
  });
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, getRefreshSecret(), {
    audience: 'plushr-refresh',
    expiresIn: '14d',
    jwtid: crypto.randomUUID(),
  });
}

export function verifyAccessToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'], audience: 'plushr-access' }) as JwtPayload;
  if (typeof decoded.sessionId !== 'string' || !decoded.sessionId) {
    throw new Error('Access token is not bound to a session');
  }
  const user = getSqliteDb().prepare(`
    SELECT id, company_id, role_code, password_hash
    FROM users
    WHERE id = ? AND is_active = 1 AND (
      company_id IS NULL OR EXISTS (
        SELECT 1 FROM companies WHERE companies.id = users.company_id AND status <> 'suspended'
      )
    )
  `).get(decoded.userId) as SessionIdentity | undefined;
  if (!user || !matchesSession(decoded, user)) {
    throw new Error('Invalid session');
  }
  const activeSession = getSqliteDb().prepare(`
    SELECT id FROM refresh_tokens
    WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > ?
  `).get(decoded.sessionId, decoded.userId, new Date().toISOString());
  if (!activeSession) throw new Error('Session revoked or expired');
  return decoded;
}

export function canAuthenticate(db: DbSchema, user: DbUser): boolean {
  return user.is_active && (!user.company_id || db.companies.some(
    (company) => company.id === user.company_id && company.status !== 'suspended'
  ));
}

export function createSessionPayload(user: DbUser, rememberMe: boolean): JwtPayload {
  return {
    userId: user.id,
    sessionId: crypto.randomUUID(),
    companyId: user.company_id,
    roleCode: user.role_code,
    email: user.email,
    credentialStamp: credentialStamp(user),
    firstLogin: user.must_change_password,
    rememberMe,
  };
}

type SessionIdentity = Pick<DbUser, 'id' | 'company_id' | 'role_code' | 'password_hash'>;

function credentialStamp(user: SessionIdentity): string {
  const generation = getSessionGeneration();
  const identity = [user.id, user.password_hash];
  if (generation) identity.push(generation);
  return crypto.createHmac('sha256', getJwtSecret())
    .update(JSON.stringify(identity)).digest('hex');
}

export function matchesSession(payload: JwtPayload, user: SessionIdentity): boolean {
  return payload.companyId === user.company_id && payload.roleCode === user.role_code &&
    payload.credentialStamp === credentialStamp(user);
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string, rememberMe = false): void {
  const maxAge = rememberMe ? 7 * 24 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000;
  res.cookie('plushr_access', accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    partitioned: true,
    maxAge,
    path: '/',
  });
  res.cookie('plushr_refresh', refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    partitioned: true,
    maxAge: 14 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie('plushr_access', { httpOnly: true, secure: true, sameSite: 'none', partitioned: true, path: '/' });
  res.clearCookie('plushr_refresh', { httpOnly: true, secure: true, sameSite: 'none', partitioned: true, path: '/' });
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    let token: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (req.cookies?.plushr_access) {
      token = req.cookies.plushr_access;
    }

    if (!token) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }

    const decoded = verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Session expirée ou invalide.' });
  }
}

export function requireRole(...roles: RoleCode[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }
    if (!roles.includes(req.user.roleCode)) {
      res.status(403).json({ error: 'Accès refusé pour votre rôle.' });
      return;
    }
    next();
  };
}

export function getScopedCompanyId(req: AuthenticatedRequest): string | null {
  if (!req.user) return null;
  if (req.user.roleCode === 'SUPER_ADMIN') {
    const queryCid = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
    const bodyCid = typeof req.body?.company_id === 'string' ? req.body.company_id : undefined;
    return queryCid || bodyCid || null;
  }
  return req.user.companyId;
}

export function assertSameCompany(req: AuthenticatedRequest, resourceCompanyId: string | null | undefined): boolean {
  if (!req.user) return false;
  if (req.user.roleCode === 'SUPER_ADMIN') return true;
  return Boolean(req.user.companyId && resourceCompanyId && req.user.companyId === resourceCompanyId);
}
