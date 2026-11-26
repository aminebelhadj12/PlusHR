import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
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
  companyId: string | null;
  roleCode: RoleCode;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export function signAccessToken(payload: JwtPayload, rememberMe = false): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: rememberMe ? '7d' : '12h',
  });
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, getRefreshSecret(), {
    expiresIn: '14d',
  });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, getJwtSecret()) as JwtPayload;
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
