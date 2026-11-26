export type RoleCode = 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'HR_MANAGER' | 'MANAGER' | 'EMPLOYEE';
export type AppLang = 'fr' | 'en' | 'ar';
export type ThemeMode = 'light' | 'dark';

export interface AuthUser {
  id: string;
  company_id: string | null;
  company_name?: string;
  role_code: RoleCode;
  email: string;
  matricule: string | null;
  full_name: string;
  preferred_lang: AppLang;
  theme: ThemeMode;
  must_change_password: boolean;
  employee_id?: string | null;
  department_id?: string | null;
  webauthn_credential_id?: string | null;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  legal_name: string;
  ice: string;
  rc: string;
  city: string;
  country: string;
  address: string;
  phone: string;
  email: string;
  logo_url: string;
  industry: string;
  status: 'active' | 'suspended' | 'trial';
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  company_id: string;
  plan_name: 'Starter' | 'Business' | 'Enterprise';
  max_employees: number;
  price_mad: number;
  billing_cycle: 'monthly' | 'annual';
  status: 'active' | 'past_due' | 'cancelled' | 'trial';
  starts_at: string;
  ends_at: string;
}

export interface Department {
  id: string;
  company_id: string;
  name: string;
  code: string;
  description: string;
  parent_department_id: string | null;
  manager_employee_id: string | null;
  is_archived: boolean;
  employee_count?: number;
  manager_name?: string;
}

export interface Position {
  id: string;
  company_id: string;
  department_id: string;
  title: string;
  level: string;
  base_salary_min: number;
  base_salary_max: number;
}

export interface Employee {
  id: string;
  company_id: string;
  user_id: string | null;
  matricule: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  cin: string;
  cnss_number: string;
  birth_date: string | null;
  gender: 'M' | 'F' | 'Other';
  address: string;
  city: string;
  emergency_contact: string;
  photo_url: string;
  department_id: string;
  position_id: string;
  manager_id: string | null;
  hire_date: string;
  contract_type: 'CDI' | 'CDD' | 'Stage' | 'Intérim' | 'ANAPEC' | 'Autre';
  base_salary_mad: number;
  skills: string;
  status: 'active' | 'inactive' | 'archived' | 'on_leave';
  department_name?: string;
  position_title?: string;
  manager_name?: string;
}

export interface EmployeeRegistrationRequest {
  id: string;
  company_id: string;
  requested_by_user_id: string;
  reviewed_by_user_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  matricule: string;
  department_id: string;
  position_id: string;
  manager_id: string | null;
  role_code: RoleCode;
  contract_type: Employee['contract_type'];
  base_salary_mad: number;
  hire_date: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
  created_at: string;
  department_name?: string;
  position_title?: string;
}

export interface AttendanceRecord {
  id: string;
  company_id: string;
  employee_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  planned_start: string | null;
  planned_end: string | null;
  worked_minutes: number;
  late_minutes: number;
  early_departure_minutes: number;
  overtime_minutes: number;
  status: 'present' | 'absent' | 'late' | 'on_leave' | 'justified_absence' | 'rest_day' | 'remote';
  location_lat?: number | null;
  location_lng?: number | null;
  location_verified: boolean;
  webauthn_verified: boolean;
  notes?: string;
  employee_name?: string;
  matricule?: string;
  department_name?: string;
}

export interface LeaveType {
  id: string;
  company_id: string;
  code: string;
  name_fr: string;
  name_en: string;
  name_ar: string;
  default_days_per_year: number;
  is_paid: boolean;
  is_protected: boolean;
  requires_attachment: boolean;
}

export interface LeaveBalance {
  id: string;
  company_id: string;
  employee_id: string;
  leave_type_id: string;
  year: number;
  allocated_days: number;
  used_days: number;
  remaining_days: number;
  leave_type_name?: string;
}

export interface LeaveRequest {
  id: string;
  company_id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  working_days: number;
  reason: string;
  attachment_path?: string | null;
  status: 'pending_manager' | 'pending_hr' | 'approved' | 'rejected_manager' | 'rejected_hr' | 'cancelled';
  manager_comment?: string | null;
  hr_comment?: string | null;
  created_at: string;
  employee_name?: string;
  department_name?: string;
  leave_type_name?: string;
}

export interface ExitRequest {
  id: string;
  company_id: string;
  employee_id: string;
  exit_type_id: string;
  date: string;
  departure_time: string;
  return_time: string;
  duration_minutes: number;
  reason: string;
  attachment_path?: string | null;
  status: 'pending_manager' | 'pending_hr' | 'approved' | 'rejected_manager' | 'rejected_hr' | 'cancelled';
  manager_comment?: string | null;
  hr_comment?: string | null;
  converted_to_leave: boolean;
  created_at: string;
  employee_name?: string;
  exit_type_name?: string;
  department_name?: string;
}

export interface Shift {
  id: string;
  company_id: string;
  name: string;
  shift_type: 'morning' | 'afternoon' | 'night' | 'admin';
  start_time: string;
  end_time: string;
  is_night_shift: boolean;
  color: string;
}

export interface ShiftAssignment {
  id: string;
  company_id: string;
  employee_id: string;
  shift_id: string;
  date: string;
  is_rest_day: boolean;
  notes?: string;
  employee_name?: string;
  department_id?: string;
  shift_name?: string;
  start_time?: string;
  end_time?: string;
  color?: string;
}

export interface TaskItem {
  id: string;
  company_id: string;
  project_id: string | null;
  department_id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  start_date: string;
  due_date: string;
  estimated_hours: number;
  actual_hours: number;
  status: 'todo' | 'in_progress' | 'in_review' | 'done';
  assignee_id?: string | null;
  assignee_name?: string;
  department_name?: string;
  comments: Array<{ id: string; user_name: string; text: string; created_at: string }>;
}

export interface Contract {
  id: string;
  company_id: string;
  employee_id: string;
  contract_type: Employee['contract_type'];
  reference: string;
  start_date: string;
  end_date: string | null;
  salary_mad: number;
  weekly_hours: number;
  status: 'active' | 'expiring_soon' | 'expired' | 'renewed' | 'archived';
  notes?: string;
  employee_name?: string;
  matricule?: string;
  department_name?: string;
  days_remaining?: number | null;
}

export interface PayrollItem {
  id: string;
  company_id: string;
  payroll_id: string;
  employee_id: string;
  base_salary: number;
  bonuses: number;
  overtime_pay: number;
  allowances: number;
  deductions: number;
  configured_contributions: number;
  gross_salary: number;
  net_salary: number;
  employee_name?: string;
  matricule?: string;
  department_name?: string;
}

export interface PayrollRun {
  id: string;
  company_id: string;
  period_month: number;
  period_year: number;
  currency: string;
  status: 'draft' | 'validated' | 'paid';
  total_gross: number;
  total_net: number;
  validated_at?: string | null;
  items?: PayrollItem[];
}

export interface Announcement {
  id: string;
  company_id: string;
  author_user_id: string;
  author_name?: string;
  title: string;
  content: string;
  category: 'general' | 'hr' | 'operations' | 'urgent' | 'event';
  audience_type: 'all' | 'department' | 'role';
  target_department_id?: string | null;
  target_role_code?: RoleCode | null;
  is_pinned: boolean;
  attachment_path?: string | null;
  expires_at?: string | null;
  created_at: string;
  comments?: Array<{
    id: string;
    user_id: string;
    user_name: string;
    content: string;
    is_moderated: boolean;
    created_at: string;
  }>;
}

export interface Meeting {
  id: string;
  company_id: string;
  organizer_user_id: string;
  organizer_name?: string;
  department_id?: string | null;
  department_name?: string;
  title: string;
  description: string;
  date: string;
  start_time: string;
  end_time: string;
  location: string;
  meeting_type: 'in_person' | 'google_meet' | 'zoom' | 'teams' | 'hybrid';
  video_link?: string | null;
  status: 'scheduled' | 'cancelled' | 'completed';
  participant_ids: string[];
  participant_names?: string[];
  email_delivery_status?: string;
}

export interface NotificationItem {
  id: string;
  company_id: string | null;
  user_id: string;
  type: string;
  title: string;
  message: string;
  link_path: string | null;
  is_read: boolean;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  company_id: string;
  conversation_id: string;
  sender_user_id: string;
  sender_name?: string;
  reply_to_message_id?: string | null;
  content: string;
  is_edited: boolean;
  is_deleted: boolean;
  attachment?: {
    file_name: string;
    file_path: string;
    mime_type: string;
  } | null;
  created_at: string;
}

export interface CompanySettings {
  id: string;
  company_id: string;
  language: AppLang;
  currency: string;
  timezone: string;
  work_start_time: string;
  work_end_time: string;
  working_days: string;
  late_threshold_minutes: number;
  enable_exit_rules: boolean;
  exit_max_hours_per_day: number;
  exit_conversion_hours: number;
  require_geolocation_checkin: boolean;
  allow_webauthn_checkin: boolean;
  payroll_contribution_rate: number;
  payroll_tax_rate: number;
  overtime_multiplier: number;
}
