import path from 'path';
import fs from 'fs';
import multer from 'multer';
import crypto from 'crypto';

export const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_ROOT)) {
  fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
}

export function sanitizeText(value: unknown, maxLen = 2000): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .trim()
    .slice(0, maxLen);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidDateStr(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date));
}

export function isValidTimeStr(time: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/.test(time);
}

export function isStrongPassword(pwd: string): boolean {
  return typeof pwd === 'string' && pwd.length >= 8 && /[A-Z]/.test(pwd) && /[a-z]/.test(pwd) && /\d/.test(pwd);
}

export function safeUploadPath(filename: string): string {
  const cleaned = path.basename(filename);
  const resolved = path.resolve(UPLOADS_ROOT, cleaned);
  if (!resolved.startsWith(UPLOADS_ROOT + path.sep)) {
    throw new Error('Invalid file path');
  }
  return resolved;
}

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const ALLOWED_EXTS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.csv', '.xlsx', '.xls', '.doc', '.docx']);

export const uploadMiddleware = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, UPLOADS_ROOT);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeName = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`;
      cb(null, safeName);
    },
  }),
  limits: {
    fileSize: 8 * 1024 * 1024, // 8MB max
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTS.has(ext)) {
      cb(new Error('Type de fichier non autorisé (PDF, PNG, JPG, DOCX, XLSX, CSV uniquement).'));
      return;
    }
    cb(null, true);
  },
});
