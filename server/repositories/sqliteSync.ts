import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';
import { getSqliteDb } from '../config/database.js';
import type { DbSchema } from './dataStore.js';

export type TableName = keyof DbSchema;

interface TableConfig {
  pk: string;
  columns: readonly string[];
  booleans?: readonly string[];
  jsonCols?: readonly string[];
}

export const TABLE_CONFIGS: Record<TableName, TableConfig> = {
  companies: {
    pk: 'id',
    columns: ['id', 'name', 'slug', 'legal_name', 'ice', 'rc', 'city', 'country', 'address', 'phone', 'email', 'logo_url', 'industry', 'status', 'created_at', 'updated_at'],
  },
  subscriptions: {
    pk: 'id',
    columns: ['id', 'company_id', 'plan_name', 'max_employees', 'price_mad', 'billing_cycle', 'status', 'starts_at', 'ends_at'],
  },
  company_settings: {
    pk: 'id',
    columns: [
      'id', 'company_id', 'language', 'currency', 'timezone', 'work_start_time', 'work_end_time', 'working_days',
      'late_threshold_minutes', 'enable_exit_rules', 'exit_max_hours_per_day', 'exit_conversion_hours',
      'require_geolocation_checkin', 'allow_webauthn_checkin', 'payroll_contribution_rate', 'payroll_tax_rate', 'overtime_multiplier',
    ],
    booleans: ['enable_exit_rules', 'require_geolocation_checkin', 'allow_webauthn_checkin'],
  },
  roles: {
    pk: 'id',
    columns: ['id', 'code', 'name_fr', 'name_en', 'name_ar'],
  },
  permissions: {
    pk: 'id',
    columns: ['id', 'code', 'module', 'description'],
  },
  role_permissions: {
    pk: 'id',
    columns: ['id', 'company_id', 'role_code', 'permission_code', 'allowed'],
    booleans: ['allowed'],
  },
  users: {
    pk: 'id',
    columns: [
      'id', 'company_id', 'role_code', 'email', 'matricule', 'password_hash', 'full_name',
      'preferred_lang', 'theme', 'is_active', 'must_change_password', 'webauthn_credential_id',
      'last_login_at', 'created_at', 'updated_at',
    ],
    booleans: ['is_active', 'must_change_password'],
  },
  departments: {
    pk: 'id',
    columns: ['id', 'company_id', 'name', 'code', 'description', 'parent_department_id', 'manager_employee_id', 'is_archived'],
    booleans: ['is_archived'],
  },
  positions: {
    pk: 'id',
    columns: ['id', 'company_id', 'department_id', 'title', 'level', 'base_salary_min', 'base_salary_max'],
  },
  employees: {
    pk: 'id',
    columns: [
      'id', 'company_id', 'user_id', 'matricule', 'first_name', 'last_name', 'email', 'phone', 'cin', 'cnss_number',
      'birth_date', 'gender', 'address', 'city', 'emergency_contact', 'photo_url', 'department_id', 'position_id',
      'manager_id', 'hire_date', 'contract_type', 'base_salary_mad', 'skills', 'status',
    ],
  },
  employee_registration_requests: {
    pk: 'id',
    columns: [
      'id', 'company_id', 'requested_by_user_id', 'reviewed_by_user_id', 'first_name', 'last_name', 'email', 'phone',
      'matricule', 'department_id', 'position_id', 'manager_id', 'role_code', 'contract_type', 'base_salary_mad',
      'hire_date', 'status', 'rejection_reason', 'created_at',
    ],
  },
  employee_documents: {
    pk: 'id',
    columns: ['id', 'company_id', 'employee_id', 'title', 'category', 'file_name', 'file_path', 'mime_type', 'file_size', 'uploaded_by_user_id', 'created_at'],
  },
  contracts: {
    pk: 'id',
    columns: ['id', 'company_id', 'employee_id', 'contract_type', 'reference', 'start_date', 'end_date', 'salary_mad', 'weekly_hours', 'status', 'notes'],
  },
  work_schedules: {
    pk: 'id',
    columns: ['id', 'company_id', 'name', 'start_time', 'end_time', 'break_minutes', 'working_days', 'is_default'],
    booleans: ['is_default'],
  },
  shifts: {
    pk: 'id',
    columns: ['id', 'company_id', 'name', 'shift_type', 'start_time', 'end_time', 'is_night_shift', 'color'],
    booleans: ['is_night_shift'],
  },
  shift_assignments: {
    pk: 'id',
    columns: ['id', 'company_id', 'employee_id', 'shift_id', 'date', 'is_rest_day', 'notes'],
    booleans: ['is_rest_day'],
  },
  attendance_records: {
    pk: 'id',
    columns: [
      'id', 'company_id', 'employee_id', 'date', 'check_in', 'check_out', 'planned_start', 'planned_end',
      'worked_minutes', 'late_minutes', 'early_departure_minutes', 'overtime_minutes', 'status',
      'location_lat', 'location_lng', 'location_verified', 'webauthn_verified', 'notes',
    ],
    booleans: ['location_verified', 'webauthn_verified'],
  },
  attendance_corrections: {
    pk: 'id',
    columns: [
      'id', 'company_id', 'attendance_id', 'corrected_by_user_id', 'corrected_by_name',
      'previous_check_in', 'new_check_in', 'previous_check_out', 'new_check_out',
      'previous_status', 'new_status', 'reason', 'created_at',
    ],
  },
  leave_types: {
    pk: 'id',
    columns: ['id', 'company_id', 'code', 'name_fr', 'name_en', 'name_ar', 'default_days_per_year', 'is_paid', 'is_protected', 'requires_attachment'],
    booleans: ['is_paid', 'is_protected', 'requires_attachment'],
  },
  leave_balances: {
    pk: 'id',
    columns: ['id', 'company_id', 'employee_id', 'leave_type_id', 'year', 'allocated_days', 'used_days', 'remaining_days'],
  },
  leave_requests: {
    pk: 'id',
    columns: [
      'id', 'company_id', 'employee_id', 'leave_type_id', 'start_date', 'end_date', 'working_days',
      'reason', 'attachment_path', 'status', 'manager_comment', 'hr_comment', 'created_at',
    ],
  },
  exit_types: {
    pk: 'id',
    columns: ['id', 'company_id', 'name_fr', 'name_en', 'name_ar'],
  },
  exit_requests: {
    pk: 'id',
    columns: [
      'id', 'company_id', 'employee_id', 'exit_type_id', 'date', 'departure_time', 'return_time',
      'duration_minutes', 'reason', 'attachment_path', 'status', 'manager_comment', 'hr_comment',
      'converted_to_leave', 'created_at',
    ],
    booleans: ['converted_to_leave'],
  },
  approval_history: {
    pk: 'id',
    columns: ['id', 'company_id', 'entity_type', 'entity_id', 'actor_user_id', 'actor_name', 'step', 'decision', 'comment', 'created_at'],
  },
  payrolls: {
    pk: 'id',
    columns: ['id', 'company_id', 'period_month', 'period_year', 'currency', 'status', 'total_gross', 'total_net', 'validated_at'],
  },
  payroll_items: {
    pk: 'id',
    columns: [
      'id', 'company_id', 'payroll_id', 'employee_id', 'base_salary', 'bonuses', 'overtime_pay',
      'allowances', 'deductions', 'configured_contributions', 'gross_salary', 'net_salary',
    ],
  },
  payslips: {
    pk: 'id',
    columns: ['id', 'company_id', 'payroll_item_id', 'employee_id', 'period_label', 'reference', 'issued_at'],
  },
  projects: {
    pk: 'id',
    columns: ['id', 'company_id', 'department_id', 'name', 'description', 'status'],
  },
  tasks: {
    pk: 'id',
    columns: ['id', 'company_id', 'project_id', 'department_id', 'title', 'description', 'priority', 'start_date', 'due_date', 'estimated_hours', 'actual_hours', 'status', 'assignee_id', 'comments'],
    jsonCols: ['comments'],
  },
  task_assignments: {
    pk: 'id',
    columns: ['id', 'company_id', 'task_id', 'employee_id', 'assigned_hours'],
  },
  workload_records: {
    pk: 'id',
    columns: ['id', 'company_id', 'employee_id', 'week_start', 'capacity_hours', 'planned_shift_hours', 'task_hours', 'meeting_hours', 'total_load_hours', 'overload_risk'],
  },
  announcements: {
    pk: 'id',
    columns: [
      'id', 'company_id', 'author_user_id', 'author_name', 'title', 'content', 'category',
      'audience_type', 'target_department_id', 'target_role_code', 'is_pinned', 'attachment_path', 'expires_at', 'created_at',
    ],
    booleans: ['is_pinned'],
  },
  announcement_comments: {
    pk: 'id',
    columns: ['id', 'company_id', 'announcement_id', 'user_id', 'user_name', 'content', 'is_moderated', 'created_at'],
    booleans: ['is_moderated'],
  },
  meetings: {
    pk: 'id',
    columns: [
      'id', 'company_id', 'organizer_user_id', 'organizer_name', 'department_id', 'title', 'description',
      'date', 'start_time', 'end_time', 'location', 'meeting_type', 'video_link', 'status', 'participant_ids',
    ],
    jsonCols: ['participant_ids'],
  },
  meeting_participants: {
    pk: 'id',
    columns: ['id', 'company_id', 'meeting_id', 'employee_id', 'rsvp_status'],
  },
  calendar_events: {
    pk: 'id',
    columns: ['id', 'company_id', 'event_type', 'reference_id', 'title', 'start_datetime', 'end_datetime'],
  },
  notifications: {
    pk: 'id',
    columns: ['id', 'company_id', 'user_id', 'type', 'title', 'message', 'link_path', 'is_read', 'created_at'],
    booleans: ['is_read'],
  },
  conversations: {
    pk: 'id',
    columns: ['id', 'company_id', 'is_group', 'title', 'created_at'],
    booleans: ['is_group'],
  },
  conversation_members: {
    pk: 'id',
    columns: ['id', 'company_id', 'conversation_id', 'user_id', 'last_read_at'],
  },
  messages: {
    pk: 'id',
    columns: [
      'id', 'company_id', 'conversation_id', 'sender_user_id', 'sender_name', 'reply_to_message_id',
      'content', 'is_edited', 'is_deleted', 'attachment', 'created_at',
    ],
    booleans: ['is_edited', 'is_deleted'],
    jsonCols: ['attachment'],
  },
  message_attachments: {
    pk: 'id',
    columns: ['id', 'company_id', 'message_id', 'file_name', 'file_path', 'mime_type', 'file_size'],
  },
  password_reset_otps: {
    pk: 'id',
    columns: ['id', 'user_id', 'email', 'otp_hash', 'attempts', 'expires_at', 'used_at', 'created_at'],
  },
  refresh_tokens: {
    pk: 'id',
    columns: ['id', 'user_id', 'token_hash', 'expires_at', 'revoked_at'],
  },
  ai_conversations: {
    pk: 'id',
    columns: ['id', 'company_id', 'user_id', 'title', 'created_at'],
  },
  ai_messages: {
    pk: 'id',
    columns: ['id', 'ai_conversation_id', 'role', 'content', 'created_at'],
  },
  audit_logs: {
    pk: 'id',
    columns: ['id', 'company_id', 'user_id', 'user_name', 'action', 'entity_type', 'entity_id', 'details', 'ip_address', 'created_at'],
  },
  holidays: {
    pk: 'id',
    columns: ['id', 'company_id', 'name', 'date', 'is_recurring'],
    booleans: ['is_recurring'],
  },
  technical_incidents: {
    pk: 'id',
    columns: ['id', 'title', 'severity', 'status', 'company_id', 'reported_at'],
  },
  notification_preferences: {
    pk: 'user_id',
    columns: ['user_id', 'email_enabled', 'realtime_enabled', 'leave_updates', 'message_alerts', 'meeting_alerts'],
    booleans: ['email_enabled', 'realtime_enabled', 'leave_updates', 'message_alerts', 'meeting_alerts'],
  },
  ai_schedule_suggestions: {
    pk: 'id',
    columns: ['id', 'company_id', 'department_id', 'week_start', 'created_by_user_id', 'status', 'rationale', 'assignments', 'created_at'],
    jsonCols: ['assignments'],
  },
};

const TABLE_NAMES = Object.keys(TABLE_CONFIGS) as TableName[];

let lastSyncedMap = new Map<TableName, Map<string, string>>();
let schemaInitialized = false;

export function ensureSqliteSchema(db: Database.Database = getSqliteDb()): void {
  if (schemaInitialized) return;
  const schemaPath = path.resolve(process.cwd(), 'database/migrations/sqlite_schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);
  schemaInitialized = true;
}

function serializeValue(val: unknown, col: string, cfg: TableConfig): string | number | null {
  if (val === undefined || val === null) return null;
  if (cfg.booleans?.includes(col)) {
    return val ? 1 : 0;
  }
  if (cfg.jsonCols?.includes(col)) {
    return JSON.stringify(val);
  }
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (typeof val === 'number' || typeof val === 'string') return val;
  return JSON.stringify(val);
}

function deserializeRow(row: Record<string, unknown>, cfg: TableConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of cfg.columns) {
    const raw = row[col];
    if (cfg.booleans?.includes(col)) {
      out[col] = Boolean(raw);
    } else if (cfg.jsonCols?.includes(col)) {
      if (raw === null || raw === undefined || raw === '') {
        out[col] = col === 'attachment' ? null : [];
      } else {
        try {
          out[col] = JSON.parse(String(raw));
        } catch {
          out[col] = col === 'attachment' ? null : [];
        }
      }
    } else {
      out[col] = raw;
    }
  }
  return out;
}

export function isSqliteSeeded(db: Database.Database = getSqliteDb()): boolean {
  ensureSqliteSchema(db);
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM users').get() as { cnt: number };
  return row.cnt > 0;
}

export function readAllFromSqlite(db: Database.Database = getSqliteDb()): DbSchema {
  ensureSqliteSchema(db);
  const result = {} as Record<TableName, unknown[]>;
  const nextSynced = new Map<TableName, Map<string, string>>();

  for (const tbl of TABLE_NAMES) {
    const cfg = TABLE_CONFIGS[tbl];
    const rows = db.prepare(`SELECT ${cfg.columns.join(', ')} FROM ${tbl}`).all() as Array<Record<string, unknown>>;
    const parsed = rows.map((r) => deserializeRow(r, cfg));
    result[tbl] = parsed;

    const tblMap = new Map<string, string>();
    for (const item of parsed) {
      const pkVal = String(item[cfg.pk]);
      tblMap.set(pkVal, JSON.stringify(item));
    }
    nextSynced.set(tbl, tblMap);
  }

  lastSyncedMap = nextSynced;
  return result as unknown as DbSchema;
}

export function writeSeedToSqlite(seed: DbSchema, db: Database.Database = getSqliteDb()): void {
  ensureSqliteSchema(db);
  const nextSynced = new Map<TableName, Map<string, string>>();

  const tx = db.transaction(() => {
    for (const tbl of TABLE_NAMES) {
      db.prepare(`DELETE FROM ${tbl}`).run();
      const cfg = TABLE_CONFIGS[tbl];
      const placeholders = cfg.columns.map(() => '?').join(', ');
      const stmt = db.prepare(`INSERT INTO ${tbl} (${cfg.columns.join(', ')}) VALUES (${placeholders})`);
      const rows = (seed[tbl] as unknown as Array<Record<string, unknown>>) || [];
      const tblMap = new Map<string, string>();

      for (const row of rows) {
        const values = cfg.columns.map((col) => serializeValue(row[col], col, cfg));
        stmt.run(...values);
        tblMap.set(String(row[cfg.pk]), JSON.stringify(row));
      }
      nextSynced.set(tbl, tblMap);
    }
  });

  tx();
  lastSyncedMap = nextSynced;
}

export function syncChangesToSqlite(current: DbSchema, db: Database.Database = getSqliteDb()): void {
  ensureSqliteSchema(db);
  const nextSynced = new Map<TableName, Map<string, string>>();

  const tx = db.transaction(() => {
    for (const tbl of TABLE_NAMES) {
      const cfg = TABLE_CONFIGS[tbl];
      const prevTblMap = lastSyncedMap.get(tbl) || new Map<string, string>();
      const newTblMap = new Map<string, string>();
      const rows = (current[tbl] as unknown as Array<Record<string, unknown>>) || [];

      const placeholders = cfg.columns.map(() => '?').join(', ');
      const upsertStmt = db.prepare(`INSERT OR REPLACE INTO ${tbl} (${cfg.columns.join(', ')}) VALUES (${placeholders})`);
      const deleteStmt = db.prepare(`DELETE FROM ${tbl} WHERE ${cfg.pk} = ?`);

      for (const row of rows) {
        const pkVal = String(row[cfg.pk]);
        const serialized = JSON.stringify(row);
        newTblMap.set(pkVal, serialized);
        if (prevTblMap.get(pkVal) !== serialized) {
          const values = cfg.columns.map((col) => serializeValue(row[col], col, cfg));
          upsertStmt.run(...values);
        }
      }

      for (const oldPk of prevTblMap.keys()) {
        if (!newTblMap.has(oldPk)) {
          deleteStmt.run(oldPk);
        }
      }

      nextSynced.set(tbl, newTblMap);
    }
  });

  tx();
  lastSyncedMap = nextSynced;
}

export function resetSqliteSchemaCache(): void {
  schemaInitialized = false;
  lastSyncedMap.clear();
}
