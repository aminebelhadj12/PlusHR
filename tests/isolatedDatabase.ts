import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeSqliteDb } from '../server/config/database.js';

export function isolateTestDatabase(): () => void {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'plushr-test-'));
  process.env.NODE_ENV = 'test';
  process.env.DB_MODE = 'sqlite';
  process.env.SQLITE_DB_PATH = path.join(directory, 'test.sqlite');
  process.env.ENABLE_DEMO_ACCOUNTS = 'true';
  process.env.SUPER_ADMIN_RECOVERY_ENABLED = 'false';
  return () => {
    closeSqliteDb();
    fs.rmSync(directory, { recursive: true, force: true });
  };
}
