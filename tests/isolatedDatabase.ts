import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getSqliteDb } from '../server/config/database.js';

export function isolateTestDatabase(): () => void {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'plushr-test-'));
  process.env.NODE_ENV = 'test';
  process.env.DB_MODE = 'sqlite';
  process.env.SQLITE_DB_PATH = path.join(directory, 'test.sqlite');
  process.env.ENABLE_DEMO_ACCOUNTS = 'true';
  return () => {
    getSqliteDb().close();
    for (const file of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, file));
    fs.rmdirSync(directory);
  };
}
