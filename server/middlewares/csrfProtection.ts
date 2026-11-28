import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function parseOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function configuredOrigins(): Set<string> {
  const origins = new Set<string>();
  for (const value of (process.env.CSRF_TRUSTED_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean)) {
    const origin = parseOrigin(value);
    if (!origin) throw new Error('CSRF_TRUSTED_ORIGINS contains an invalid origin.');
    origins.add(origin);
  }
  return origins;
}

function sourceOrigin(req: Request): string | null {
  const origin = req.get('origin');
  if (origin) return origin === 'null' ? null : parseOrigin(origin);
  const referer = req.get('referer');
  return referer ? parseOrigin(referer) : null;
}

export function protectCookieAuthenticatedRequests(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method) || (!req.cookies?.plushr_access && !req.cookies?.plushr_refresh)) {
    next();
    return;
  }

  const source = sourceOrigin(req);
  const requestOrigin = parseOrigin(`${req.protocol}://${req.get('host') || ''}`);
  const trustedOrigins = configuredOrigins();
  if (requestOrigin) trustedOrigins.add(requestOrigin);

  if (!source || !trustedOrigins.has(source) ||
      (req.get('sec-fetch-site') === 'cross-site' && !configuredOrigins().has(source))) {
    res.status(403).json({ error: 'Origine de requête non autorisée.' });
    return;
  }
  next();
}

export function isTrustedBrowserOrigin(origin: string, requestOriginValue: string): boolean {
  const parsedOrigin = parseOrigin(origin);
  if (!parsedOrigin) return false;
  const trustedOrigins = configuredOrigins();
  const requestOrigin = parseOrigin(requestOriginValue);
  if (requestOrigin) trustedOrigins.add(requestOrigin);
  return trustedOrigins.has(parsedOrigin);
}
