-- +HR Intelligent Human Resources Management System
-- SQLite Schema (Development & Standalone Local Persistence — plushr.db)

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  legal_name TEXT NOT NULL,
  ice TEXT DEFAULT '',
  rc TEXT DEFAULT '',
  city TEXT DEFAULT '',
  country TEXT DEFAULT 'Maroc',
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  logo_url TEXT DEFAULT '',
  industry TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  max_employees INTEGER NOT NULL,
  price_mad REAL NOT NULL,
  billing_cycle TEXT NOT NULL,
  status TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS company_settings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL DEFAULT 'fr',
  currency TEXT NOT NULL DEFAULT 'MAD',
  timezone TEXT NOT NULL DEFAULT 'Africa/Casablanca',
  work_start_time TEXT NOT NULL DEFAULT '08:30',
  work_end_time TEXT NOT NULL DEFAULT '17:30',
  working_days TEXT NOT NULL DEFAULT '1,2,3,4,5',
  late_threshold_minutes INTEGER NOT NULL DEFAULT 15,
  enable_exit_rules INTEGER NOT NULL DEFAULT 0,
  exit_max_hours_per_day REAL NOT NULL DEFAULT 4,
  exit_conversion_hours REAL NOT NULL DEFAULT 7.5,
  require_geolocation_checkin INTEGER NOT NULL DEFAULT 0,
  allow_webauthn_checkin INTEGER NOT NULL DEFAULT 1,
  payroll_contribution_rate REAL NOT NULL DEFAULT 6,
  payroll_tax_rate REAL NOT NULL DEFAULT 10,
  overtime_multiplier REAL NOT NULL DEFAULT 1.25
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name_fr TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  role_code TEXT NOT NULL,
  permission_code TEXT NOT NULL,
  allowed INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  role_code TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  matricule TEXT,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  preferred_lang TEXT NOT NULL DEFAULT 'fr',
  theme TEXT NOT NULL DEFAULT 'light',
  is_active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  webauthn_credential_id TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_users_matricule ON users(matricule);

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT DEFAULT '',
  parent_department_id TEXT,
  manager_employee_id TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_departments_company ON departments(company_id);

CREATE TABLE IF NOT EXISTS positions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  department_id TEXT NOT NULL,
  title TEXT NOT NULL,
  level TEXT NOT NULL,
  base_salary_min REAL NOT NULL,
  base_salary_max REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  user_id TEXT,
  matricule TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  cin TEXT DEFAULT '',
  cnss_number TEXT DEFAULT '',
  birth_date TEXT,
  gender TEXT NOT NULL DEFAULT 'Other',
  address TEXT DEFAULT '',
  city TEXT DEFAULT '',
  emergency_contact TEXT DEFAULT '',
  photo_url TEXT DEFAULT '',
  department_id TEXT NOT NULL,
  position_id TEXT NOT NULL,
  manager_id TEXT,
  hire_date TEXT NOT NULL,
  contract_type TEXT NOT NULL DEFAULT 'CDI',
  base_salary_mad REAL NOT NULL,
  skills TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active'
);
CREATE INDEX IF NOT EXISTS idx_employees_company ON employees(company_id);
CREATE INDEX IF NOT EXISTS idx_employees_user ON employees(user_id);

CREATE TABLE IF NOT EXISTS employee_registration_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL,
  reviewed_by_user_id TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  matricule TEXT NOT NULL,
  department_id TEXT NOT NULL,
  position_id TEXT NOT NULL,
  manager_id TEXT,
  role_code TEXT NOT NULL,
  contract_type TEXT NOT NULL,
  base_salary_mad REAL NOT NULL,
  hire_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employee_documents (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  uploaded_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  contract_type TEXT NOT NULL,
  reference TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  salary_mad REAL NOT NULL,
  weekly_hours REAL NOT NULL DEFAULT 44,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_contracts_company ON contracts(company_id);

CREATE TABLE IF NOT EXISTS work_schedules (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  break_minutes INTEGER NOT NULL DEFAULT 60,
  working_days TEXT NOT NULL DEFAULT '1,2,3,4,5',
  is_default INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  shift_type TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  is_night_shift INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#2563EB'
);

CREATE TABLE IF NOT EXISTS shift_assignments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  shift_id TEXT NOT NULL,
  date TEXT NOT NULL,
  is_rest_day INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_company_date ON shift_assignments(company_id, date);

CREATE TABLE IF NOT EXISTS attendance_records (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  planned_start TEXT,
  planned_end TEXT,
  worked_minutes INTEGER NOT NULL DEFAULT 0,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  early_departure_minutes INTEGER NOT NULL DEFAULT 0,
  overtime_minutes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  location_lat REAL,
  location_lng REAL,
  location_verified INTEGER NOT NULL DEFAULT 0,
  webauthn_verified INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_attendance_company_date ON attendance_records(company_id, date);

CREATE TABLE IF NOT EXISTS attendance_corrections (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  attendance_id TEXT NOT NULL,
  corrected_by_user_id TEXT NOT NULL,
  corrected_by_name TEXT NOT NULL,
  previous_check_in TEXT,
  new_check_in TEXT,
  previous_check_out TEXT,
  new_check_out TEXT,
  previous_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leave_types (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name_fr TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  default_days_per_year REAL NOT NULL,
  is_paid INTEGER NOT NULL DEFAULT 1,
  is_protected INTEGER NOT NULL DEFAULT 0,
  requires_attachment INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS leave_balances (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  leave_type_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  allocated_days REAL NOT NULL,
  used_days REAL NOT NULL DEFAULT 0,
  remaining_days REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  leave_type_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  working_days REAL NOT NULL,
  reason TEXT NOT NULL,
  attachment_path TEXT,
  status TEXT NOT NULL,
  manager_comment TEXT,
  hr_comment TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leaves_company ON leave_requests(company_id);

CREATE TABLE IF NOT EXISTS exit_types (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  name_fr TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exit_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  exit_type_id TEXT NOT NULL,
  date TEXT NOT NULL,
  departure_time TEXT NOT NULL,
  return_time TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  reason TEXT NOT NULL,
  attachment_path TEXT,
  status TEXT NOT NULL,
  manager_comment TEXT,
  hr_comment TEXT,
  converted_to_leave INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approval_history (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  step TEXT NOT NULL,
  decision TEXT NOT NULL,
  comment TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payrolls (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  period_month INTEGER NOT NULL,
  period_year INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MAD',
  status TEXT NOT NULL DEFAULT 'draft',
  total_gross REAL NOT NULL DEFAULT 0,
  total_net REAL NOT NULL DEFAULT 0,
  validated_at TEXT
);

CREATE TABLE IF NOT EXISTS payroll_items (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  payroll_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  base_salary REAL NOT NULL,
  bonuses REAL NOT NULL DEFAULT 0,
  overtime_pay REAL NOT NULL DEFAULT 0,
  allowances REAL NOT NULL DEFAULT 0,
  deductions REAL NOT NULL DEFAULT 0,
  configured_contributions REAL NOT NULL DEFAULT 0,
  gross_salary REAL NOT NULL,
  net_salary REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS payslips (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  payroll_item_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  reference TEXT NOT NULL,
  issued_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  department_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  project_id TEXT,
  department_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium',
  start_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  estimated_hours REAL NOT NULL DEFAULT 8,
  actual_hours REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'todo',
  assignee_id TEXT,
  comments TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS task_assignments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  assigned_hours REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS workload_records (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  week_start TEXT NOT NULL,
  capacity_hours REAL NOT NULL DEFAULT 44,
  planned_shift_hours REAL NOT NULL DEFAULT 0,
  task_hours REAL NOT NULL DEFAULT 0,
  meeting_hours REAL NOT NULL DEFAULT 0,
  total_load_hours REAL NOT NULL DEFAULT 0,
  overload_risk TEXT NOT NULL DEFAULT 'normal'
);

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  author_name TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  audience_type TEXT NOT NULL DEFAULT 'all',
  target_department_id TEXT,
  target_role_code TEXT,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  attachment_path TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS announcement_comments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  announcement_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  content TEXT NOT NULL,
  is_moderated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  organizer_user_id TEXT NOT NULL,
  organizer_name TEXT,
  department_id TEXT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  location TEXT DEFAULT '',
  meeting_type TEXT NOT NULL DEFAULT 'in_person',
  video_link TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  participant_ids TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS meeting_participants (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  meeting_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  rsvp_status TEXT NOT NULL DEFAULT 'invited'
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  title TEXT NOT NULL,
  start_datetime TEXT NOT NULL,
  end_datetime TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link_path TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  is_group INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_members (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  last_read_at TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  sender_user_id TEXT NOT NULL,
  sender_name TEXT,
  reply_to_message_id TEXT,
  content TEXT NOT NULL,
  is_edited INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  attachment TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);

CREATE TABLE IF NOT EXISTS message_attachments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS password_reset_otps (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY,
  ai_conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  user_id TEXT,
  user_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details TEXT NOT NULL,
  ip_address TEXT NOT NULL DEFAULT '127.0.0.1',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS holidays (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  is_recurring INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS technical_incidents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  company_id TEXT,
  reported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY,
  email_enabled INTEGER NOT NULL DEFAULT 1,
  realtime_enabled INTEGER NOT NULL DEFAULT 1,
  leave_updates INTEGER NOT NULL DEFAULT 1,
  message_alerts INTEGER NOT NULL DEFAULT 1,
  meeting_alerts INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ai_schedule_suggestions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  department_id TEXT NOT NULL,
  week_start TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  rationale TEXT NOT NULL,
  assignments TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_session_generation (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  generation TEXT NOT NULL
);
