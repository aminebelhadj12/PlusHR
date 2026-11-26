import bcrypt from 'bcryptjs';
import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { getSqliteDb } from '../config/database.js';
import { clearAuthCookies, requireAuth, requireRole, verifyAccessToken, type AuthenticatedRequest } from '../middlewares/auth.js';
import { auditBackup, BackupError, createManualBackup, listBackups, restoreBackup, verifiedBackup, withBackupOperation } from '../services/sqliteBackup.js';

export const backupsRouter = Router();

const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Trop de tentatives. Réessayez plus tard.' },
});

backupsRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
backupsRouter.use(requireAuth, requireRole('SUPER_ADMIN'), (req: AuthenticatedRequest, res, next) => {
  // Require an explicit bearer credential even when an auth cookie is present.
  if (!req.headers.authorization?.startsWith('Bearer ') || req.user?.firstLogin) {
    res.status(403).json({ error: 'Session administrateur requise.' });
    return;
  }
  next();
});

function authenticatedActor(req: AuthenticatedRequest) {
  const user = getSqliteDb().prepare(`
    SELECT id, full_name, password_hash, must_change_password
    FROM users WHERE id = ? AND role_code = 'SUPER_ADMIN' AND is_active = 1
  `).get(req.user?.userId) as { id: string; full_name: string; password_hash: string; must_change_password: number } | undefined;
  if (!user || user.must_change_password) throw new BackupError(403, 'Accès administrateur requis.');
  return user;
}

function reauthenticate(req: AuthenticatedRequest) {
  try {
    verifyAccessToken(req.headers.authorization!.slice(7).trim());
  } catch {
    throw new BackupError(403, 'Session administrateur expirée ou invalide.');
  }
  const user = authenticatedActor(req);
  const password = req.body?.password;
  if (typeof password !== 'string' || !password || !bcrypt.compareSync(password, user.password_hash)) {
    throw new BackupError(403, 'Mot de passe actuel incorrect.');
  }
  return user;
}

function handle(handler: (req: AuthenticatedRequest, res: Response) => Promise<void>) {
  return (req: AuthenticatedRequest, res: Response) => {
    void handler(req, res).catch((error: unknown) => {
      if (!(error instanceof BackupError)) console.error('[+HR Backup]', error);
      if (!res.headersSent && !res.destroyed) {
        res.status(error instanceof BackupError ? error.status : 500)
          .json({ error: error instanceof BackupError ? error.message : 'L’opération de sauvegarde a échoué.' });
      }
    });
  };
}

backupsRouter.get('/', handle(async (req, res) => {
  authenticatedActor(req);
  res.json({ backups: listBackups() });
}));

backupsRouter.post('/', handle(async (req, res) => {
  const user = authenticatedActor(req);
  const backup = await createManualBackup({ user_id: user.id, user_name: user.full_name, ip_address: req.ip });
  res.status(201).json({ backup });
}));

backupsRouter.post('/:id/download', passwordLimiter, handle(async (req, res) => {
  const user = reauthenticate(req);
  const { id } = req.params;
  await withBackupOperation(async () => {
    const file = verifiedBackup(id);
    await auditBackup('SQLITE_BACKUP_DOWNLOADED', id, { user_id: user.id, user_name: user.full_name, ip_address: req.ip });
    if (res.destroyed) return;
    await new Promise<void>((resolve, reject) => {
      res.download(file, id, { acceptRanges: false, cacheControl: false, lastModified: false }, (error) => {
        if (error && !res.destroyed) reject(error);
        else resolve();
      });
    });
  });
}));

backupsRouter.post('/:id/restore', passwordLimiter, handle(async (req, res) => {
  const user = reauthenticate(req);
  const { id } = req.params;
  if (req.body?.confirmation !== 'RESTAURER') throw new BackupError(400, 'Saisissez RESTAURER pour confirmer.');
  const preRestoreBackup = await restoreBackup(id, {
    user_id: user.id, user_name: user.full_name, ip_address: req.ip,
  }, res, () => {
    if (res.destroyed) throw new BackupError(409, 'La demande de restauration a été interrompue.');
    reauthenticate(req);
  });
  clearAuthCookies(res);
  res.json({ ok: true, preRestoreBackup });
}));
