import Database from 'better-sqlite3';
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

export type DbMode = 'sqlite' | 'mysql';

let sqliteDb: Database.Database | null = null;
let mysqlPool: mysql.Pool | null = null;
let activeDbMode: DbMode = 'sqlite';

export function getSqliteDbPath(): string {
  const configured = process.env.SQLITE_DB_PATH?.trim() || 'plushr.db';
  return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
}

export function getSqliteDb(): Database.Database {
  if (!sqliteDb) {
    const dbPath = getSqliteDbPath();
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    sqliteDb = new Database(dbPath);
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('synchronous = NORMAL');
  }
  return sqliteDb;
}

export function closeSqliteDb(): void {
  sqliteDb?.close();
  sqliteDb = null;
}

export function getSessionGeneration(): string {
  const row = getSqliteDb().prepare('SELECT generation FROM auth_session_generation WHERE id = 1').get() as
    { generation: string } | undefined;
  return row?.generation ?? '';
}

export async function initDatabaseConnection(): Promise<DbMode> {
  const requestedMode = (process.env.DB_MODE || 'sqlite').toLowerCase();
  const host = process.env.DB_HOST?.trim();

  if (requestedMode === 'mysql' && host) {
    try {
      mysqlPool = mysql.createPool({
        host,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'plushr_db',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        timezone: 'Z',
      });
      const conn = await mysqlPool.getConnection();
      await conn.ping();
      conn.release();
      activeDbMode = 'mysql';
      console.log(`[+HR DB] Connecté à MySQL (${host}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME || 'plushr_db'}).`);
      return activeDbMode;
    } catch (err) {
      console.warn('[+HR DB] MySQL indisponible, bascule automatique sur SQLite (plushr.db):', (err as Error).message);
      mysqlPool = null;
    }
  }

  const db = getSqliteDb();
  const schemaPath = path.resolve(process.cwd(), 'database/migrations/sqlite_schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schemaSql);
  }
  activeDbMode = 'sqlite';
  console.log(`[+HR DB] Base SQLite initialisée (${getSqliteDbPath()}).`);
  return activeDbMode;
}

export function getMysqlPool(): mysql.Pool | null {
  return mysqlPool;
}

export function getDbMode(): DbMode {
  return activeDbMode;
}

export async function executeMysqlQuery<T = unknown>(
  sql: string,
  params: Array<string | number | boolean | null> = []
): Promise<T> {
  if (!mysqlPool) {
    throw new Error('MySQL pool is not initialized');
  }
  const [rows] = await mysqlPool.execute(sql, params);
  return rows as T;
}
