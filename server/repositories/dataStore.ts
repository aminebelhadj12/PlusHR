import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getSqliteDb } from '../config/database.js';
import { isDemoModeEnabled } from '../config/demoAccounts.js';
import { isSqliteSeeded, readAllFromSqlite, syncChangesToSqlite, writeSeedToSqlite } from './sqliteSync.js';
import type {
  RoleCode,
  Company,
  Subscription,
  Department,
  Position,
  Employee,
  EmployeeRegistrationRequest,
  AttendanceRecord,
  LeaveType,
  LeaveBalance,
  LeaveRequest,
  ExitRequest,
  Shift,
  ShiftAssignment,
  TaskItem,
  Contract,
  PayrollRun,
  PayrollItem,
  Announcement,
  Meeting,
  NotificationItem,
  ChatMessage,
  CompanySettings,
} from '../../src/types/index.js';

export interface DbUser {
  id: string;
  company_id: string | null;
  role_code: RoleCode;
  email: string;
  matricule: string | null;
  password_hash: string;
  full_name: string;
  preferred_lang: 'fr' | 'en' | 'ar';
  theme: 'light' | 'dark';
  is_active: boolean;
  must_change_password: boolean;
  webauthn_credential_id: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbSchema {
  companies: Company[];
  subscriptions: Subscription[];
  company_settings: CompanySettings[];
  roles: Array<{ id: string; code: RoleCode; name_fr: string; name_en: string; name_ar: string }>;
  permissions: Array<{ id: string; code: string; module: string; description: string }>;
  role_permissions: Array<{ id: string; company_id: string; role_code: RoleCode; permission_code: string; allowed: boolean }>;
  users: DbUser[];
  departments: Department[];
  positions: Position[];
  employees: Employee[];
  employee_registration_requests: EmployeeRegistrationRequest[];
  employee_documents: Array<{
    id: string;
    company_id: string;
    employee_id: string;
    title: string;
    category: string;
    file_name: string;
    file_path: string;
    mime_type: string;
    file_size: number;
    uploaded_by_user_id: string;
    created_at: string;
  }>;
  contracts: Contract[];
  work_schedules: Array<{
    id: string;
    company_id: string;
    name: string;
    start_time: string;
    end_time: string;
    break_minutes: number;
    working_days: string;
    is_default: boolean;
  }>;
  shifts: Shift[];
  shift_assignments: ShiftAssignment[];
  attendance_records: AttendanceRecord[];
  attendance_corrections: Array<{
    id: string;
    company_id: string;
    attendance_id: string;
    corrected_by_user_id: string;
    corrected_by_name: string;
    previous_check_in: string | null;
    new_check_in: string | null;
    previous_check_out: string | null;
    new_check_out: string | null;
    previous_status: string;
    new_status: string;
    reason: string;
    created_at: string;
  }>;
  leave_types: LeaveType[];
  leave_balances: LeaveBalance[];
  leave_requests: LeaveRequest[];
  exit_types: Array<{ id: string; company_id: string; name_fr: string; name_en: string; name_ar: string }>;
  exit_requests: ExitRequest[];
  approval_history: Array<{
    id: string;
    company_id: string;
    entity_type: string;
    entity_id: string;
    actor_user_id: string;
    actor_name: string;
    step: string;
    decision: string;
    comment: string;
    created_at: string;
  }>;
  payrolls: PayrollRun[];
  payroll_items: PayrollItem[];
  payslips: Array<{
    id: string;
    company_id: string;
    payroll_item_id: string;
    employee_id: string;
    period_label: string;
    reference: string;
    issued_at: string;
  }>;
  projects: Array<{ id: string; company_id: string; department_id: string; name: string; description: string; status: string }>;
  tasks: TaskItem[];
  task_assignments: Array<{ id: string; company_id: string; task_id: string; employee_id: string; assigned_hours: number }>;
  workload_records: Array<{
    id: string;
    company_id: string;
    employee_id: string;
    week_start: string;
    capacity_hours: number;
    planned_shift_hours: number;
    task_hours: number;
    meeting_hours: number;
    total_load_hours: number;
    overload_risk: 'normal' | 'warning' | 'critical';
  }>;
  announcements: Announcement[];
  announcement_comments: Array<{
    id: string;
    company_id: string;
    announcement_id: string;
    user_id: string;
    user_name: string;
    content: string;
    is_moderated: boolean;
    created_at: string;
  }>;
  meetings: Meeting[];
  meeting_participants: Array<{ id: string; company_id: string; meeting_id: string; employee_id: string; rsvp_status: string }>;
  calendar_events: Array<{
    id: string;
    company_id: string;
    event_type: string;
    reference_id: string;
    title: string;
    start_datetime: string;
    end_datetime: string;
  }>;
  notifications: NotificationItem[];
  conversations: Array<{ id: string; company_id: string; is_group: boolean; title: string | null; created_at: string }>;
  conversation_members: Array<{ id: string; company_id: string; conversation_id: string; user_id: string; last_read_at: string | null }>;
  messages: ChatMessage[];
  message_attachments: Array<{ id: string; company_id: string; message_id: string; file_name: string; file_path: string; mime_type: string; file_size: number }>;
  password_reset_otps: Array<{
    id: string;
    user_id: string;
    email: string;
    otp_hash: string;
    attempts: number;
    expires_at: string;
    used_at: string | null;
    created_at: string;
  }>;
  refresh_tokens: Array<{ id: string; user_id: string; token_hash: string; expires_at: string; revoked_at: string | null }>;
  ai_conversations: Array<{ id: string; company_id: string | null; user_id: string; title: string; created_at: string }>;
  ai_messages: Array<{ id: string; ai_conversation_id: string; role: 'user' | 'assistant'; content: string; created_at: string }>;
  audit_logs: Array<{
    id: string;
    company_id: string | null;
    user_id: string | null;
    user_name?: string;
    action: string;
    entity_type: string;
    entity_id: string | null;
    details: string;
    ip_address: string;
    created_at: string;
  }>;
  holidays: Array<{ id: string; company_id: string; name: string; date: string; is_recurring: boolean }>;
  technical_incidents: Array<{
    id: string;
    title: string;
    severity: 'low' | 'medium' | 'high';
    status: 'open' | 'investigating' | 'resolved';
    company_id: string | null;
    reported_at: string;
  }>;
  notification_preferences: Array<{
    user_id: string;
    email_enabled: boolean;
    realtime_enabled: boolean;
    leave_updates: boolean;
    message_alerts: boolean;
    meeting_alerts: boolean;
  }>;
  ai_schedule_suggestions: Array<{
    id: string;
    company_id: string;
    department_id: string;
    week_start: string;
    created_by_user_id: string;
    status: 'pending' | 'accepted' | 'rejected';
    rationale: string;
    assignments: Array<{
      employee_id: string;
      employee_name: string;
      shift_id: string;
      shift_name: string;
      date: string;
      reason: string;
    }>;
    created_at: string;
  }>;
}

let memoryDb: DbSchema | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function isoDateOffset(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().slice(0, 10);
}

function createInitialSeed(): DbSchema {
  const now = new Date().toISOString();
  const hash = (pwd: string) => bcrypt.hashSync(pwd, 10);

  const companies: Company[] = [
    {
      id: 'comp-atlas',
      name: 'Atlas Industrial Group',
      slug: 'atlas-industrial',
      legal_name: 'Atlas Industrial Group S.A.',
      ice: '001584920000041',
      rc: 'RC-482910',
      city: 'Casablanca',
      country: 'Maroc',
      address: 'Zone Industrielle Sidi Maarouf, Lot 42, Casablanca',
      phone: '+212 522 48 91 00',
      email: 'contact@atlas-industrial.ma',
      logo_url: '',
      industry: 'Industrie & Ingénierie',
      status: 'active',
      created_at: '2025-01-10T09:00:00Z',
      updated_at: now,
    },
    {
      id: 'comp-maghreb',
      name: 'Maghreb Tech Solutions',
      slug: 'maghreb-tech',
      legal_name: 'Maghreb Tech Solutions SARL',
      ice: '002491830000088',
      rc: 'RC-194022',
      city: 'Rabat',
      country: 'Maroc',
      address: 'Technopolis Rabat Shore, Bâtiment B4, Salé',
      phone: '+212 537 68 24 10',
      email: 'hello@maghrebtech.ma',
      logo_url: '',
      industry: 'Technologies & Conseil',
      status: 'active',
      created_at: '2025-03-14T09:00:00Z',
      updated_at: now,
    },
  ];

  const subscriptions: Subscription[] = [
    {
      id: 'sub-atlas',
      company_id: 'comp-atlas',
      plan_name: 'Enterprise',
      max_employees: 250,
      price_mad: 4900,
      billing_cycle: 'annual',
      status: 'active',
      starts_at: '2026-01-01',
      ends_at: '2027-01-01',
    },
    {
      id: 'sub-maghreb',
      company_id: 'comp-maghreb',
      plan_name: 'Business',
      max_employees: 100,
      price_mad: 2400,
      billing_cycle: 'monthly',
      status: 'active',
      starts_at: '2026-01-01',
      ends_at: '2026-12-31',
    },
  ];

  const company_settings: CompanySettings[] = [
    {
      id: 'cs-atlas',
      company_id: 'comp-atlas',
      language: 'fr',
      currency: 'MAD',
      timezone: 'Africa/Casablanca',
      work_start_time: '08:30',
      work_end_time: '17:30',
      working_days: '1,2,3,4,5',
      late_threshold_minutes: 15,
      enable_exit_rules: true,
      exit_max_hours_per_day: 4,
      exit_conversion_hours: 7.5,
      require_geolocation_checkin: false,
      allow_webauthn_checkin: true,
      payroll_contribution_rate: 6.74,
      payroll_tax_rate: 10,
      overtime_multiplier: 1.25,
    },
    {
      id: 'cs-maghreb',
      company_id: 'comp-maghreb',
      language: 'fr',
      currency: 'MAD',
      timezone: 'Africa/Casablanca',
      work_start_time: '09:00',
      work_end_time: '18:00',
      working_days: '1,2,3,4,5',
      late_threshold_minutes: 15,
      enable_exit_rules: false,
      exit_max_hours_per_day: 4,
      exit_conversion_hours: 7.5,
      require_geolocation_checkin: false,
      allow_webauthn_checkin: true,
      payroll_contribution_rate: 6.0,
      payroll_tax_rate: 8.0,
      overtime_multiplier: 1.25,
    },
  ];

  const roles: DbSchema['roles'] = [
    { id: 'role-1', code: 'SUPER_ADMIN', name_fr: 'Super Administrateur', name_en: 'Super Admin', name_ar: 'مدير المنصة' },
    { id: 'role-2', code: 'COMPANY_ADMIN', name_fr: 'Administrateur Entreprise', name_en: 'Company Admin', name_ar: 'مدير الشركة' },
    { id: 'role-3', code: 'HR_MANAGER', name_fr: 'Responsable RH', name_en: 'HR Manager', name_ar: 'مسؤول الموارد البشرية' },
    { id: 'role-4', code: 'MANAGER', name_fr: 'Manager', name_en: 'Manager', name_ar: 'مدير القسم' },
    { id: 'role-5', code: 'EMPLOYEE', name_fr: 'Employé', name_en: 'Employee', name_ar: 'موظف' },
  ];

  const permissions: DbSchema['permissions'] = [
    { id: 'perm-1', code: 'employees.read', module: 'Employés', description: 'Consulter le répertoire des employés' },
    { id: 'perm-2', code: 'employees.write', module: 'Employés', description: 'Créer des demandes et modifier les fiches' },
    { id: 'perm-3', code: 'employees.approve', module: 'Employés', description: 'Valider les nouveaux comptes employés' },
    { id: 'perm-4', code: 'attendance.read', module: 'Présences', description: 'Consulter les pointages et retards' },
    { id: 'perm-5', code: 'attendance.correct', module: 'Présences', description: 'Corriger les enregistrements de pointage' },
    { id: 'perm-6', code: 'leaves.approve_l1', module: 'Congés & Sorties', description: 'Validation niveau 1 (Manager)' },
    { id: 'perm-7', code: 'leaves.approve_l2', module: 'Congés & Sorties', description: 'Validation finale (RH)' },
    { id: 'perm-8', code: 'payroll.manage', module: 'Paie', description: 'Préparer et valider la paie' },
    { id: 'perm-9', code: 'contracts.manage', module: 'Contrats', description: 'Gérer et renouveler les contrats' },
    { id: 'perm-10', code: 'schedules.manage', module: 'Plannings', description: 'Gérer les équipes, shifts et IA Planning' },
    { id: 'perm-11', code: 'settings.manage', module: 'Paramètres', description: 'Modifier les paramètres de l’entreprise' },
  ];

  const role_permissions: DbSchema['role_permissions'] = [];
  for (const cid of ['comp-atlas', 'comp-maghreb']) {
    for (const r of ['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE'] as RoleCode[]) {
      for (const p of permissions) {
        let allowed = false;
        if (r === 'COMPANY_ADMIN') allowed = !['leaves.approve_l2', 'payroll.manage'].includes(p.code);
        if (r === 'HR_MANAGER') allowed = !['settings.manage'].includes(p.code);
        if (r === 'MANAGER') allowed = ['employees.read', 'attendance.read', 'leaves.approve_l1', 'schedules.manage'].includes(p.code);
        if (r === 'EMPLOYEE') allowed = false;
        role_permissions.push({
          id: `rp-${cid}-${r}-${p.id}`,
          company_id: cid,
          role_code: r,
          permission_code: p.code,
          allowed,
        });
      }
    }
  }

  // 8 Departments for Atlas Industrial + 4 for Maghreb Tech
  const departments: Department[] = [
    { id: 'dept-rh', company_id: 'comp-atlas', name: 'Ressources Humaines', code: 'RH', description: 'Gestion du capital humain, recrutement et paie', parent_department_id: null, manager_employee_id: 'emp-atlas-2', is_archived: false },
    { id: 'dept-prod', company_id: 'comp-atlas', name: 'Production', code: 'PROD', description: 'Chaînes d’assemblage et fabrication industrielle', parent_department_id: null, manager_employee_id: 'emp-atlas-3', is_archived: false },
    { id: 'dept-maint', company_id: 'comp-atlas', name: 'Maintenance', code: 'MAINT', description: 'Maintenance préventive et corrective des équipements', parent_department_id: 'dept-prod', manager_employee_id: 'emp-atlas-4', is_archived: false },
    { id: 'dept-qual', company_id: 'comp-atlas', name: 'Qualité', code: 'QUAL', description: 'Contrôle qualité ISO 9001 et conformité', parent_department_id: null, manager_employee_id: 'emp-atlas-5', is_archived: false },
    { id: 'dept-it', company_id: 'comp-atlas', name: 'Informatique', code: 'IT', description: 'Systèmes d’information, infrastructure et cybersécurité', parent_department_id: null, manager_employee_id: 'emp-atlas-6', is_archived: false },
    { id: 'dept-log', company_id: 'comp-atlas', name: 'Logistique', code: 'LOG', description: 'Approvisionnement, entrepôt et expéditions', parent_department_id: null, manager_employee_id: 'emp-atlas-7', is_archived: false },
    { id: 'dept-fin', company_id: 'comp-atlas', name: 'Finance', code: 'FIN', description: 'Comptabilité, contrôle de gestion et trésorerie', parent_department_id: null, manager_employee_id: 'emp-atlas-8', is_archived: false },
    { id: 'dept-eng', company_id: 'comp-atlas', name: 'Process Engineering', code: 'ENG', description: 'Optimisation des procédés industriels et R&D', parent_department_id: 'dept-prod', manager_employee_id: 'emp-atlas-9', is_archived: false },

    { id: 'dept-mgt-it', company_id: 'comp-maghreb', name: 'Informatique', code: 'IT', description: 'Développement logiciel et cloud', parent_department_id: null, manager_employee_id: 'emp-mgt-2', is_archived: false },
    { id: 'dept-mgt-rh', company_id: 'comp-maghreb', name: 'Ressources Humaines', code: 'RH', description: 'Talents et culture d’entreprise', parent_department_id: null, manager_employee_id: 'emp-mgt-1', is_archived: false },
    { id: 'dept-mgt-fin', company_id: 'comp-maghreb', name: 'Finance', code: 'FIN', description: 'Gestion financière et facturation', parent_department_id: null, manager_employee_id: 'emp-mgt-3', is_archived: false },
    { id: 'dept-mgt-qual', company_id: 'comp-maghreb', name: 'Qualité', code: 'QUAL', description: 'Assurance qualité logicielle (QA)', parent_department_id: null, manager_employee_id: 'emp-mgt-4', is_archived: false },
  ];

  const positions: Position[] = [
    { id: 'pos-dir', company_id: 'comp-atlas', department_id: 'dept-rh', title: 'Directeur Général Adjoint', level: 'Direction', base_salary_min: 28000, base_salary_max: 42000 },
    { id: 'pos-hr', company_id: 'comp-atlas', department_id: 'dept-rh', title: 'Responsable Ressources Humaines', level: 'Cadre Senior', base_salary_min: 18000, base_salary_max: 26000 },
    { id: 'pos-hr-asst', company_id: 'comp-atlas', department_id: 'dept-rh', title: 'Chargé(e) de Paie & Administration', level: 'Confirmé', base_salary_min: 8500, base_salary_max: 13000 },
    { id: 'pos-prod-mgr', company_id: 'comp-atlas', department_id: 'dept-prod', title: 'Chef de Production', level: 'Manager', base_salary_min: 17000, base_salary_max: 24000 },
    { id: 'pos-prod-op', company_id: 'comp-atlas', department_id: 'dept-prod', title: 'Technicien de Production', level: 'Opérateur', base_salary_min: 5500, base_salary_max: 8500 },
    { id: 'pos-maint-mgr', company_id: 'comp-atlas', department_id: 'dept-maint', title: 'Responsable Maintenance', level: 'Manager', base_salary_min: 16000, base_salary_max: 22000 },
    { id: 'pos-maint-tech', company_id: 'comp-atlas', department_id: 'dept-maint', title: 'Électromécanicien', level: 'Technicien', base_salary_min: 6500, base_salary_max: 10500 },
    { id: 'pos-qual-mgr', company_id: 'comp-atlas', department_id: 'dept-qual', title: 'Responsable Qualité HSE', level: 'Manager', base_salary_min: 16500, base_salary_max: 23000 },
    { id: 'pos-qual-ctrl', company_id: 'comp-atlas', department_id: 'dept-qual', title: 'Contrôleur Qualité', level: 'Technicien', base_salary_min: 7000, base_salary_max: 11000 },
    { id: 'pos-it-mgr', company_id: 'comp-atlas', department_id: 'dept-it', title: 'DSI / Responsable IT', level: 'Manager', base_salary_min: 19000, base_salary_max: 28000 },
    { id: 'pos-it-dev', company_id: 'comp-atlas', department_id: 'dept-it', title: 'Ingénieur Systèmes & Réseaux', level: 'Ingénieur', base_salary_min: 11000, base_salary_max: 16000 },
    { id: 'pos-log-mgr', company_id: 'comp-atlas', department_id: 'dept-log', title: 'Responsable Supply Chain', level: 'Manager', base_salary_min: 16000, base_salary_max: 22000 },
    { id: 'pos-log-coord', company_id: 'comp-atlas', department_id: 'dept-log', title: 'Coordinateur Logistique', level: 'Confirmé', base_salary_min: 7500, base_salary_max: 11500 },
    { id: 'pos-fin-mgr', company_id: 'comp-atlas', department_id: 'dept-fin', title: 'Directeur Financier', level: 'Manager', base_salary_min: 20000, base_salary_max: 30000 },
    { id: 'pos-fin-acc', company_id: 'comp-atlas', department_id: 'dept-fin', title: 'Comptable Confirmé', level: 'Confirmé', base_salary_min: 9000, base_salary_max: 13500 },
    { id: 'pos-eng-mgr', company_id: 'comp-atlas', department_id: 'dept-eng', title: 'Chef de Projet Process', level: 'Manager', base_salary_min: 18000, base_salary_max: 25000 },
    { id: 'pos-eng-ing', company_id: 'comp-atlas', department_id: 'dept-eng', title: 'Ingénieur Méthodes & Process', level: 'Ingénieur', base_salary_min: 12000, base_salary_max: 17000 },

    { id: 'pos-mgt-admin', company_id: 'comp-maghreb', department_id: 'dept-mgt-rh', title: 'Directrice Opérations & RH', level: 'Direction', base_salary_min: 24000, base_salary_max: 34000 },
    { id: 'pos-mgt-lead', company_id: 'comp-maghreb', department_id: 'dept-mgt-it', title: 'Engineering Manager', level: 'Manager', base_salary_min: 21000, base_salary_max: 30000 },
    { id: 'pos-mgt-dev', company_id: 'comp-maghreb', department_id: 'dept-mgt-it', title: 'Développeur Full Stack', level: 'Ingénieur', base_salary_min: 12000, base_salary_max: 18500 },
    { id: 'pos-mgt-fin', company_id: 'comp-maghreb', department_id: 'dept-mgt-fin', title: 'Contrôleur de Gestion', level: 'Confirmé', base_salary_min: 11000, base_salary_max: 16000 },
    { id: 'pos-mgt-qa', company_id: 'comp-maghreb', department_id: 'dept-mgt-qual', title: 'QA Automation Lead', level: 'Senior', base_salary_min: 13000, base_salary_max: 19000 },
  ];

  // Build 40 realistic Moroccan/international synthetic employees (28 Atlas + 12 Maghreb Tech)
  const atlasSeeds: Array<{
    id: string;
    mat: string;
    fn: string;
    ln: string;
    email: string;
    dept: string;
    pos: string;
    mgr: string | null;
    gender: 'M' | 'F';
    contract: Employee['contract_type'];
    salary: number;
    hire: string;
    skills: string;
    role?: RoleCode;
    pwd?: string;
    status?: Employee['status'];
  }> = [
    { id: 'emp-atlas-1', mat: 'ATL-001', fn: 'Karim', ln: 'Bennani', email: 'admin@atlas-industrial.ma', dept: 'dept-rh', pos: 'pos-dir', mgr: null, gender: 'M', contract: 'CDI', salary: 32000, hire: '2021-02-01', skills: 'Gouvernance, Stratégie RH, Lean', role: 'COMPANY_ADMIN', pwd: 'Atlas#Admin2026!' },
    { id: 'emp-atlas-2', mat: 'ATL-002', fn: 'Salma', ln: 'El Fassi', email: 'rh@atlas-industrial.ma', dept: 'dept-rh', pos: 'pos-hr', mgr: 'emp-atlas-1', gender: 'F', contract: 'CDI', salary: 22500, hire: '2021-05-15', skills: 'Droit du travail, Paie, Recrutement', role: 'HR_MANAGER', pwd: 'Atlas#HR2026!' },
    { id: 'emp-atlas-3', mat: 'ATL-003', fn: 'Youssef', ln: 'Chraibi', email: 'manager.prod@atlas-industrial.ma', dept: 'dept-prod', pos: 'pos-prod-mgr', mgr: 'emp-atlas-1', gender: 'M', contract: 'CDI', salary: 21000, hire: '2021-09-01', skills: 'Production, Lean Manufacturing, Planning', role: 'MANAGER', pwd: 'Atlas#Mgr2026!' },
    { id: 'emp-atlas-4', mat: 'ATL-004', fn: 'Hassan', ln: 'Tazi', email: 'h.tazi@atlas-industrial.ma', dept: 'dept-maint', pos: 'pos-maint-mgr', mgr: 'emp-atlas-3', gender: 'M', contract: 'CDI', salary: 19500, hire: '2022-01-10', skills: 'GMAO, Automatismes, Maintenance préventive', role: 'MANAGER', pwd: 'Atlas#Mgr2026!' },
    { id: 'emp-atlas-5', mat: 'ATL-005', fn: 'Nadia', ln: 'Berrada', email: 'n.berrada@atlas-industrial.ma', dept: 'dept-qual', pos: 'pos-qual-mgr', mgr: 'emp-atlas-1', gender: 'F', contract: 'CDI', salary: 20000, hire: '2022-03-01', skills: 'ISO 9001, Audit Qualité, HSE', role: 'MANAGER', pwd: 'Atlas#Mgr2026!' },
    { id: 'emp-atlas-6', mat: 'ATL-006', fn: 'Mehdi', ln: 'Alaoui', email: 'm.alaoui@atlas-industrial.ma', dept: 'dept-it', pos: 'pos-it-mgr', mgr: 'emp-atlas-1', gender: 'M', contract: 'CDI', salary: 24000, hire: '2022-04-12', skills: 'Cloud, ERP, Cybersécurité', role: 'MANAGER', pwd: 'Atlas#Mgr2026!' },
    { id: 'emp-atlas-7', mat: 'ATL-007', fn: 'Rachid', ln: 'Kabbaj', email: 'r.kabbaj@atlas-industrial.ma', dept: 'dept-log', pos: 'pos-log-mgr', mgr: 'emp-atlas-1', gender: 'M', contract: 'CDI', salary: 18500, hire: '2022-06-01', skills: 'Supply Chain, Import-Export, WMS', role: 'MANAGER', pwd: 'Atlas#Mgr2026!' },
    { id: 'emp-atlas-8', mat: 'ATL-008', fn: 'Zineb', ln: 'Lahlou', email: 'z.lahlou@atlas-industrial.ma', dept: 'dept-fin', pos: 'pos-fin-mgr', mgr: 'emp-atlas-1', gender: 'F', contract: 'CDI', salary: 26000, hire: '2021-11-01', skills: 'IFRS, Contrôle budgétaire, Fiscalité', role: 'MANAGER', pwd: 'Atlas#Mgr2026!' },
    { id: 'emp-atlas-9', mat: 'ATL-009', fn: 'Omar', ln: 'Sefrioui', email: 'o.sefrioui@atlas-industrial.ma', dept: 'dept-eng', pos: 'pos-eng-mgr', mgr: 'emp-atlas-3', gender: 'M', contract: 'CDI', salary: 21500, hire: '2022-08-15', skills: 'Six Sigma, CAO, Amélioration continue', role: 'MANAGER', pwd: 'Atlas#Mgr2026!' },
    { id: 'emp-atlas-10', mat: 'ATL-010', fn: 'Amine', ln: 'Idrissi', email: 'employe@atlas-industrial.ma', dept: 'dept-prod', pos: 'pos-prod-op', mgr: 'emp-atlas-3', gender: 'M', contract: 'CDI', salary: 7800, hire: '2023-02-01', skills: 'Assemblage CNC, Contrôle ligne, Sécurité', role: 'EMPLOYEE', pwd: 'Atlas#Emp2026!' },
    { id: 'emp-atlas-11', mat: 'ATL-011', fn: 'Kenza', ln: 'Benjelloun', email: 'k.benjelloun@atlas-industrial.ma', dept: 'dept-rh', pos: 'pos-hr-asst', mgr: 'emp-atlas-2', gender: 'F', contract: 'CDI', salary: 10500, hire: '2023-03-10', skills: 'Administration RH, Paie, Onboarding' },
    { id: 'emp-atlas-12', mat: 'ATL-012', fn: 'Tarik', ln: 'Ouazzani', email: 't.ouazzani@atlas-industrial.ma', dept: 'dept-prod', pos: 'pos-prod-op', mgr: 'emp-atlas-3', gender: 'M', contract: 'CDD', salary: 7200, hire: '2025-01-15', skills: 'Usinage, Contrôle ligne' },
    { id: 'emp-atlas-13', mat: 'ATL-013', fn: 'Imane', ln: 'Boukhari', email: 'i.boukhari@atlas-industrial.ma', dept: 'dept-prod', pos: 'pos-prod-op', mgr: 'emp-atlas-3', gender: 'F', contract: 'CDI', salary: 7600, hire: '2023-07-01', skills: 'Conditionnement, Qualité ligne' },
    { id: 'emp-atlas-14', mat: 'ATL-014', fn: 'Saad', ln: 'Mekouar', email: 's.mekouar@atlas-industrial.ma', dept: 'dept-prod', pos: 'pos-prod-op', mgr: 'emp-atlas-3', gender: 'M', contract: 'ANAPEC', salary: 5800, hire: '2025-07-01', skills: 'Montage industriel, 5S' },
    { id: 'emp-atlas-15', mat: 'ATL-015', fn: 'Hicham', ln: 'Ziani', email: 'h.ziani@atlas-industrial.ma', dept: 'dept-prod', pos: 'pos-prod-op', mgr: 'emp-atlas-3', gender: 'M', contract: 'CDI', salary: 8100, hire: '2022-10-03', skills: 'Pilotage ligne automatisée' },
    { id: 'emp-atlas-16', mat: 'ATL-016', fn: 'Adil', ln: 'Rhazi', email: 'a.rhazi@atlas-industrial.ma', dept: 'dept-maint', pos: 'pos-maint-tech', mgr: 'emp-atlas-4', gender: 'M', contract: 'CDI', salary: 8900, hire: '2023-01-16', skills: 'Électricité industrielle, API Siemens' },
    { id: 'emp-atlas-17', mat: 'ATL-017', fn: 'Soufiane', ln: 'Naciri', email: 's.naciri@atlas-industrial.ma', dept: 'dept-maint', pos: 'pos-maint-tech', mgr: 'emp-atlas-4', gender: 'M', contract: 'CDD', salary: 7900, hire: '2025-06-01', skills: 'Hydraulique, Pneumatique' },
    { id: 'emp-atlas-18', mat: 'ATL-018', fn: 'Meryem', ln: 'Kettani', email: 'm.kettani@atlas-industrial.ma', dept: 'dept-qual', pos: 'pos-qual-ctrl', mgr: 'emp-atlas-5', gender: 'F', contract: 'CDI', salary: 9400, hire: '2023-05-02', skills: 'Métrologie, Audit interne' },
    { id: 'emp-atlas-19', mat: 'ATL-019', fn: 'Ayoub', ln: 'Benslimane', email: 'a.benslimane@atlas-industrial.ma', dept: 'dept-qual', pos: 'pos-qual-ctrl', mgr: 'emp-atlas-5', gender: 'M', contract: 'Stage', salary: 4200, hire: '2026-06-01', skills: 'Contrôle dimensionnel, SPC' },
    { id: 'emp-atlas-20', mat: 'ATL-020', fn: 'Fatima Zahra', ln: 'Tounsi', email: 'fz.tounsi@atlas-industrial.ma', dept: 'dept-it', pos: 'pos-it-dev', mgr: 'emp-atlas-6', gender: 'F', contract: 'CDI', salary: 14500, hire: '2023-09-01', skills: 'React, Node.js, SQL, DevOps' },
    { id: 'emp-atlas-21', mat: 'ATL-021', fn: 'Hamza', ln: 'El Amrani', email: 'h.elamrani@atlas-industrial.ma', dept: 'dept-it', pos: 'pos-it-dev', mgr: 'emp-atlas-6', gender: 'M', contract: 'CDI', salary: 13800, hire: '2024-01-08', skills: 'Linux, Réseaux, Support N2' },
    { id: 'emp-atlas-22', mat: 'ATL-022', fn: 'Nabil', ln: 'Filali', email: 'n.filali@atlas-industrial.ma', dept: 'dept-log', pos: 'pos-log-coord', mgr: 'emp-atlas-7', gender: 'M', contract: 'CDI', salary: 9800, hire: '2023-04-03', skills: 'Gestion stocks, SAP MM' },
    { id: 'emp-atlas-23', mat: 'ATL-023', fn: 'Houda', ln: 'Cherkaoui', email: 'h.cherkaoui@atlas-industrial.ma', dept: 'dept-log', pos: 'pos-log-coord', mgr: 'emp-atlas-7', gender: 'F', contract: 'CDD', salary: 8600, hire: '2025-09-01', skills: 'Transit, Planification expéditions' },
    { id: 'emp-atlas-24', mat: 'ATL-024', fn: 'Mouad', ln: 'Zemmouri', email: 'm.zemmouri@atlas-industrial.ma', dept: 'dept-log', pos: 'pos-log-coord', mgr: 'emp-atlas-7', gender: 'M', contract: 'Intérim', salary: 6800, hire: '2026-02-01', skills: 'CACES, Réception marchandises' },
    { id: 'emp-atlas-25', mat: 'ATL-025', fn: 'Sanaa', ln: 'Mikou', email: 's.mikou@atlas-industrial.ma', dept: 'dept-fin', pos: 'pos-fin-acc', mgr: 'emp-atlas-8', gender: 'F', contract: 'CDI', salary: 11800, hire: '2022-11-15', skills: 'Comptabilité générale, TVA, Bilan' },
    { id: 'emp-atlas-26', mat: 'ATL-026', fn: 'Badr', ln: 'guessous', email: 'b.guessous@atlas-industrial.ma', dept: 'dept-fin', pos: 'pos-fin-acc', mgr: 'emp-atlas-8', gender: 'M', contract: 'CDI', salary: 10900, hire: '2024-03-04', skills: 'Trésorerie, Recouvrement' },
    { id: 'emp-atlas-27', mat: 'ATL-027', fn: 'Lina', ln: 'Benkirane', email: 'l.benkirane@atlas-industrial.ma', dept: 'dept-eng', pos: 'pos-eng-ing', mgr: 'emp-atlas-9', gender: 'F', contract: 'CDI', salary: 15200, hire: '2023-10-02', skills: 'Amélioration continue, AutoCAD, Python' },
    { id: 'emp-atlas-28', mat: 'ATL-028', fn: 'Anas', ln: 'Rami', email: 'a.rami@atlas-industrial.ma', dept: 'dept-eng', pos: 'pos-eng-ing', mgr: 'emp-atlas-9', gender: 'M', contract: 'CDD', salary: 13200, hire: '2025-11-10', skills: 'Industrialisation, Ergonomie postes' },
  ];

  const maghrebSeeds: Array<{
    id: string;
    mat: string;
    fn: string;
    ln: string;
    email: string;
    dept: string;
    pos: string;
    mgr: string | null;
    gender: 'M' | 'F';
    contract: Employee['contract_type'];
    salary: number;
    hire: string;
    skills: string;
    role?: RoleCode;
    pwd?: string;
  }> = [
    { id: 'emp-mgt-1', mat: 'MGT-001', fn: 'Ghita', ln: 'Mansouri', email: 'admin@maghrebtech.ma', dept: 'dept-mgt-rh', pos: 'pos-mgt-admin', mgr: null, gender: 'F', contract: 'CDI', salary: 29000, hire: '2022-01-15', skills: 'Direction RH, Opérations SaaS', role: 'COMPANY_ADMIN', pwd: 'Maghreb#Admin2026!' },
    { id: 'emp-mgt-2', mat: 'MGT-002', fn: 'Oussama', ln: 'Belhadj', email: 'o.belhadj@maghrebtech.ma', dept: 'dept-mgt-it', pos: 'pos-mgt-lead', mgr: 'emp-mgt-1', gender: 'M', contract: 'CDI', salary: 25000, hire: '2022-04-01', skills: 'Architecture Cloud, TypeScript, Go', role: 'MANAGER', pwd: 'Maghreb#Mgr2026!' },
    { id: 'emp-mgt-3', mat: 'MGT-003', fn: 'Dounia', ln: 'Skalli', email: 'd.skalli@maghrebtech.ma', dept: 'dept-mgt-fin', pos: 'pos-mgt-fin', mgr: 'emp-mgt-1', gender: 'F', contract: 'CDI', salary: 14500, hire: '2023-02-15', skills: 'Finance SaaS, Reporting' },
    { id: 'emp-mgt-4', mat: 'MGT-004', fn: 'Reda', ln: 'Khamlichi', email: 'r.khamlichi@maghrebtech.ma', dept: 'dept-mgt-qual', pos: 'pos-mgt-qa', mgr: 'emp-mgt-1', gender: 'M', contract: 'CDI', salary: 16500, hire: '2023-06-01', skills: 'Playwright, Cypress, CI/CD' },
    { id: 'emp-mgt-5', mat: 'MGT-005', fn: 'Yasmine', ln: 'El Khatib', email: 'y.elkhatib@maghrebtech.ma', dept: 'dept-mgt-it', pos: 'pos-mgt-dev', mgr: 'emp-mgt-2', gender: 'F', contract: 'CDI', salary: 15800, hire: '2024-01-10', skills: 'React, Tailwind, GraphQL' },
    { id: 'emp-mgt-6', mat: 'MGT-006', fn: 'Ilyas', ln: 'Moutawakil', email: 'i.moutawakil@maghrebtech.ma', dept: 'dept-mgt-it', pos: 'pos-mgt-dev', mgr: 'emp-mgt-2', gender: 'M', contract: 'CDI', salary: 15000, hire: '2024-03-01', skills: 'Node.js, PostgreSQL, Docker' },
    { id: 'emp-mgt-7', mat: 'MGT-007', fn: 'Rim', ln: 'Bensaid', email: 'r.bensaid@maghrebtech.ma', dept: 'dept-mgt-it', pos: 'pos-mgt-dev', mgr: 'emp-mgt-2', gender: 'F', contract: 'CDD', salary: 13500, hire: '2025-04-01', skills: 'TypeScript, Next.js' },
    { id: 'emp-mgt-8', mat: 'MGT-008', fn: 'Walid', ln: 'Jazouli', email: 'w.jazouli@maghrebtech.ma', dept: 'dept-mgt-it', pos: 'pos-mgt-dev', mgr: 'emp-mgt-2', gender: 'M', contract: 'ANAPEC', salary: 9500, hire: '2025-10-01', skills: 'Python, FastAPI, ML' },
    { id: 'emp-mgt-9', mat: 'MGT-009', fn: 'Chaimae', ln: 'Hariri', email: 'c.hariri@maghrebtech.ma', dept: 'dept-mgt-rh', pos: 'pos-mgt-admin', mgr: 'emp-mgt-1', gender: 'F', contract: 'CDI', salary: 17000, hire: '2023-08-01', skills: 'Talent Acquisition, HRBP', role: 'HR_MANAGER', pwd: 'Maghreb#HR2026!' },
    { id: 'emp-mgt-10', mat: 'MGT-010', fn: 'Zakaria', ln: 'Fadili', email: 'z.fadili@maghrebtech.ma', dept: 'dept-mgt-qual', pos: 'pos-mgt-qa', mgr: 'emp-mgt-4', gender: 'M', contract: 'CDI', salary: 12800, hire: '2024-07-01', skills: 'Tests fonctionnels, API Testing' },
    { id: 'emp-mgt-11', mat: 'MGT-011', fn: 'Khadija', ln: 'Bennis', email: 'k.bennis@maghrebtech.ma', dept: 'dept-mgt-fin', pos: 'pos-mgt-fin', mgr: 'emp-mgt-3', gender: 'F', contract: 'Stage', salary: 4500, hire: '2026-07-01', skills: 'Excel, Analyse financière' },
    { id: 'emp-mgt-12', mat: 'MGT-012', fn: 'Samir', ln: 'El Mansouri', email: 's.elmansouri@maghrebtech.ma', dept: 'dept-mgt-it', pos: 'pos-mgt-dev', mgr: 'emp-mgt-2', gender: 'M', contract: 'CDI', salary: 14200, hire: '2024-11-01', skills: 'Kubernetes, Terraform' },
  ];

  const users: DbUser[] = [
    {
      id: 'user-superadmin',
      company_id: null,
      role_code: 'SUPER_ADMIN',
      email: 'superadmin@plushr.ma',
      matricule: 'SA-001',
      password_hash: hash('PlusHR#Super2026!'),
      full_name: 'Amine Belhadj (Platform Admin)',
      preferred_lang: 'fr',
      theme: 'light',
      is_active: true,
      must_change_password: false,
      webauthn_credential_id: null,
      last_login_at: now,
      created_at: '2025-01-01T08:00:00Z',
      updated_at: now,
    },
  ];

  const employees: Employee[] = [];

  const registerEmployee = (cid: string, item: (typeof atlasSeeds)[number], city: string) => {
    const uid = `user-${item.id}`;
    const roleCode: RoleCode = item.role || 'EMPLOYEE';
    const pwd = item.pwd || (cid === 'comp-atlas' ? 'Atlas#Emp2026!' : 'Maghreb#Emp2026!');
    users.push({
      id: uid,
      company_id: cid,
      role_code: roleCode,
      email: item.email,
      matricule: item.mat,
      password_hash: hash(pwd),
      full_name: `${item.fn} ${item.ln}`,
      preferred_lang: 'fr',
      theme: 'light',
      is_active: true,
      must_change_password: false,
      webauthn_credential_id: null,
      last_login_at: null,
      created_at: now,
      updated_at: now,
    });
    employees.push({
      id: item.id,
      company_id: cid,
      user_id: uid,
      matricule: item.mat,
      first_name: item.fn,
      last_name: item.ln.charAt(0).toUpperCase() + item.ln.slice(1),
      email: item.email,
      phone: `+212 6${Math.floor(10 + Math.random() * 89)} ${Math.floor(10 + Math.random() * 89)} ${Math.floor(10 + Math.random() * 89)} ${Math.floor(10 + Math.random() * 89)}`,
      cin: `BK${Math.floor(100000 + Math.random() * 899999)}`,
      cnss_number: `1${Math.floor(10000000 + Math.random() * 89999999)}`,
      birth_date: '1992-05-14',
      gender: item.gender,
      address: `${city}, Maroc`,
      city,
      emergency_contact: `Famille ${item.ln} (+212 661 00 11 22)`,
      photo_url: '',
      department_id: item.dept,
      position_id: item.pos,
      manager_id: item.mgr,
      hire_date: item.hire,
      contract_type: item.contract,
      base_salary_mad: item.salary,
      skills: item.skills,
      status: item.status || 'active',
    });
  };

  atlasSeeds.forEach((e) => registerEmployee('comp-atlas', e, 'Casablanca'));
  maghrebSeeds.forEach((e) => registerEmployee('comp-maghreb', e, 'Rabat'));

  // Contracts (with some expiring in 7, 15, and 26 days for alert testing)
  const contracts: Contract[] = employees.map((emp, idx) => {
    let endDate: string | null = null;
    let status: Contract['status'] = 'active';
    if (emp.contract_type !== 'CDI') {
      if (idx % 5 === 1) {
        endDate = isoDateOffset(6);
        status = 'expiring_soon';
      } else if (idx % 5 === 3) {
        endDate = isoDateOffset(14);
        status = 'expiring_soon';
      } else if (idx % 5 === 4) {
        endDate = isoDateOffset(26);
        status = 'expiring_soon';
      } else {
        endDate = isoDateOffset(120);
      }
    }
    return {
      id: `ctr-${emp.id}`,
      company_id: emp.company_id,
      employee_id: emp.id,
      contract_type: emp.contract_type,
      reference: `CTR-${emp.matricule}-2026`,
      start_date: emp.hire_date,
      end_date: endDate,
      salary_mad: emp.base_salary_mad,
      weekly_hours: 44,
      status,
      notes: emp.contract_type === 'CDI' ? 'Contrat à durée indéterminée standard.' : 'Contrat à terme fixe avec suivi RH.',
    };
  });

  // Leave types & balances
  const leave_types: LeaveType[] = [
    { id: 'lt-atlas-annual', company_id: 'comp-atlas', code: 'ANNUAL', name_fr: 'Congé annuel', name_en: 'Annual Leave', name_ar: 'إجازة سنوية', default_days_per_year: 18, is_paid: true, is_protected: false, requires_attachment: false },
    { id: 'lt-atlas-sick', company_id: 'comp-atlas', code: 'SICK', name_fr: 'Congé maladie', name_en: 'Sick Leave', name_ar: 'إجازة مرضية', default_days_per_year: 15, is_paid: true, is_protected: true, requires_attachment: true },
    { id: 'lt-atlas-exc', company_id: 'comp-atlas', code: 'EXCEPTIONAL', name_fr: 'Congé exceptionnel', name_en: 'Exceptional Leave', name_ar: 'إجازة استثنائية', default_days_per_year: 5, is_paid: true, is_protected: false, requires_attachment: false },
    { id: 'lt-atlas-mat', company_id: 'comp-atlas', code: 'MATERNITY', name_fr: 'Congé maternité', name_en: 'Maternity Leave', name_ar: 'إجازة أمومة', default_days_per_year: 98, is_paid: true, is_protected: true, requires_attachment: true },
    { id: 'lt-atlas-pat', company_id: 'comp-atlas', code: 'PATERNITY', name_fr: 'Congé paternité', name_en: 'Paternity Leave', name_ar: 'إجازة أبوة', default_days_per_year: 3, is_paid: true, is_protected: true, requires_attachment: false },
    { id: 'lt-atlas-unpaid', company_id: 'comp-atlas', code: 'UNPAID', name_fr: 'Congé sans solde', name_en: 'Unpaid Leave', name_ar: 'إجازة بدون أجر', default_days_per_year: 30, is_paid: false, is_protected: false, requires_attachment: false },

    { id: 'lt-mgt-annual', company_id: 'comp-maghreb', code: 'ANNUAL', name_fr: 'Congé annuel', name_en: 'Annual Leave', name_ar: 'إجازة سنوية', default_days_per_year: 20, is_paid: true, is_protected: false, requires_attachment: false },
    { id: 'lt-mgt-sick', company_id: 'comp-maghreb', code: 'SICK', name_fr: 'Congé maladie', name_en: 'Sick Leave', name_ar: 'إجازة مرضية', default_days_per_year: 15, is_paid: true, is_protected: true, requires_attachment: true },
    { id: 'lt-mgt-unpaid', company_id: 'comp-maghreb', code: 'UNPAID', name_fr: 'Congé sans solde', name_en: 'Unpaid Leave', name_ar: 'إجازة بدون أجر', default_days_per_year: 30, is_paid: false, is_protected: false, requires_attachment: false },
  ];

  const leave_balances: LeaveBalance[] = [];
  for (const emp of employees) {
    const compTypes = leave_types.filter((lt) => lt.company_id === emp.company_id);
    for (const lt of compTypes) {
      const used = lt.code === 'ANNUAL' ? 3 : 0;
      leave_balances.push({
        id: `lb-${emp.id}-${lt.code}`,
        company_id: emp.company_id,
        employee_id: emp.id,
        leave_type_id: lt.id,
        year: 2026,
        allocated_days: lt.default_days_per_year,
        used_days: used,
        remaining_days: lt.default_days_per_year - used,
      });
    }
  }

  const leave_requests: LeaveRequest[] = [
    {
      id: 'lr-1',
      company_id: 'comp-atlas',
      employee_id: 'emp-atlas-10',
      leave_type_id: 'lt-atlas-annual',
      start_date: isoDateOffset(7),
      end_date: isoDateOffset(9),
      working_days: 3,
      reason: 'Déplacement familial prévu à Marrakech.',
      status: 'pending_manager',
      created_at: now,
    },
    {
      id: 'lr-2',
      company_id: 'comp-atlas',
      employee_id: 'emp-atlas-13',
      leave_type_id: 'lt-atlas-annual',
      start_date: isoDateOffset(12),
      end_date: isoDateOffset(14),
      working_days: 3,
      reason: 'Congé annuel planifié.',
      status: 'pending_hr',
      manager_comment: 'Accordé par le Chef de Production, continuité assurée.',
      created_at: now,
    },
    {
      id: 'lr-3',
      company_id: 'comp-atlas',
      employee_id: 'emp-atlas-16',
      leave_type_id: 'lt-atlas-annual',
      start_date: isoDateOffset(-2),
      end_date: isoDateOffset(1),
      working_days: 3,
      reason: 'Repos annuel.',
      status: 'approved',
      manager_comment: 'Validé.',
      hr_comment: 'Validé et déduit du solde.',
      created_at: now,
    },
    {
      id: 'lr-4',
      company_id: 'comp-maghreb',
      employee_id: 'emp-mgt-5',
      leave_type_id: 'lt-mgt-annual',
      start_date: isoDateOffset(5),
      end_date: isoDateOffset(6),
      working_days: 2,
      reason: 'Congé personnel.',
      status: 'pending_manager',
      created_at: now,
    },
  ];

  const exit_types: DbSchema['exit_types'] = [
    { id: 'et-atlas-med', company_id: 'comp-atlas', name_fr: 'Rendez-vous médical', name_en: 'Medical Appointment', name_ar: 'موعد طبي' },
    { id: 'et-atlas-adm', company_id: 'comp-atlas', name_fr: 'Démarche administrative', name_en: 'Administrative Errand', name_ar: 'إجراء إداري' },
    { id: 'et-atlas-pro', company_id: 'comp-atlas', name_fr: 'Mission externe', name_en: 'External Mission', name_ar: 'مهمة خارجية' },
    { id: 'et-mgt-adm', company_id: 'comp-maghreb', name_fr: 'Sortie personnelle', name_en: 'Personal Exit', name_ar: 'خروج شخصي' },
  ];

  const exit_requests: ExitRequest[] = [
    {
      id: 'er-1',
      company_id: 'comp-atlas',
      employee_id: 'emp-atlas-10',
      exit_type_id: 'et-atlas-adm',
      date: isoDateOffset(1),
      departure_time: '14:00',
      return_time: '16:00',
      duration_minutes: 120,
      reason: 'Renouvellement passeport préfecture.',
      status: 'pending_manager',
      converted_to_leave: false,
      created_at: now,
    },
    {
      id: 'er-2',
      company_id: 'comp-atlas',
      employee_id: 'emp-atlas-15',
      exit_type_id: 'et-atlas-med',
      date: isoDateOffset(-3),
      departure_time: '10:00',
      return_time: '12:30',
      duration_minutes: 150,
      reason: 'Consultation clinique.',
      status: 'approved',
      manager_comment: 'OK',
      hr_comment: 'Justificatif reçu.',
      converted_to_leave: false,
      created_at: now,
    },
  ];

  // Shifts (4 shifts for Atlas, 2 for Maghreb Tech)
  const shifts: Shift[] = [
    { id: 'sh-atlas-morn', company_id: 'comp-atlas', name: 'Équipe du matin', shift_type: 'morning', start_time: '06:00', end_time: '14:00', is_night_shift: false, color: '#2563EB' },
    { id: 'sh-atlas-aft', company_id: 'comp-atlas', name: 'Équipe de l’après-midi', shift_type: 'afternoon', start_time: '14:00', end_time: '22:00', is_night_shift: false, color: '#D97706' },
    { id: 'sh-atlas-night', company_id: 'comp-atlas', name: 'Équipe de nuit', shift_type: 'night', start_time: '22:00', end_time: '06:00', is_night_shift: true, color: '#0F172A' },
    { id: 'sh-atlas-admin', company_id: 'comp-atlas', name: 'Équipe administrative', shift_type: 'admin', start_time: '08:30', end_time: '17:30', is_night_shift: false, color: '#16A34A' },
    { id: 'sh-mgt-admin', company_id: 'comp-maghreb', name: 'Équipe administrative', shift_type: 'admin', start_time: '09:00', end_time: '18:00', is_night_shift: false, color: '#2563EB' },
  ];

  const shift_assignments: ShiftAssignment[] = [];
  for (let d = -2; d <= 5; d++) {
    const dateStr = isoDateOffset(d);
    const dayOfWeek = new Date(dateStr).getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;
    employees.forEach((emp, i) => {
      const shId =
        emp.company_id === 'comp-maghreb'
          ? 'sh-mgt-admin'
          : emp.department_id === 'dept-prod' || emp.department_id === 'dept-maint'
          ? i % 3 === 0
            ? 'sh-atlas-morn'
            : i % 3 === 1
            ? 'sh-atlas-aft'
            : 'sh-atlas-night'
          : 'sh-atlas-admin';
      shift_assignments.push({
        id: `sa-${emp.id}-${dateStr}`,
        company_id: emp.company_id,
        employee_id: emp.id,
        shift_id: shId,
        date: dateStr,
        is_rest_day: false,
      });
    });
  }

  // 14 days of realistic attendance records (excluding today for ATL-010 so employee can test live Check-in!)
  const attendance_records: AttendanceRecord[] = [];
  for (let d = -13; d <= 0; d++) {
    const dateStr = isoDateOffset(d);
    const day = new Date(dateStr).getDay();
    if (day === 0 || day === 6) continue;
    employees.forEach((emp, idx) => {
      // Leave emp-atlas-10 unpunched today so check-in works interactively in demo
      if (d === 0 && emp.id === 'emp-atlas-10') return;
      const isLeave = emp.id === 'emp-atlas-16' && d >= -2 && d <= 0;
      let status: AttendanceRecord['status'] = 'present';
      let lateMins = 0;
      let checkIn: string | null = `${dateStr}T08:28:00`;
      let checkOut: string | null = d === 0 ? null : `${dateStr}T17:35:00`;
      let workedMins = d === 0 ? 0 : 487;
      let overtimeMins = d === 0 ? 0 : 7;

      if (isLeave) {
        status = 'on_leave';
        checkIn = null;
        checkOut = null;
        workedMins = 0;
      } else if ((idx + Math.abs(d)) % 11 === 0) {
        status = 'absent';
        checkIn = null;
        checkOut = null;
        workedMins = 0;
      } else if ((idx + Math.abs(d)) % 7 === 0) {
        status = 'late';
        lateMins = 24;
        checkIn = `${dateStr}T08:54:00`;
        workedMins = d === 0 ? 0 : 456;
        overtimeMins = 0;
      } else if (emp.department_id === 'dept-it' && (idx + Math.abs(d)) % 5 === 0) {
        status = 'remote';
      }

      attendance_records.push({
        id: `att-${emp.id}-${dateStr}`,
        company_id: emp.company_id,
        employee_id: emp.id,
        date: dateStr,
        check_in: checkIn,
        check_out: checkOut,
        planned_start: emp.company_id === 'comp-atlas' ? '08:30' : '09:00',
        planned_end: emp.company_id === 'comp-atlas' ? '17:30' : '18:00',
        worked_minutes: workedMins,
        late_minutes: lateMins,
        early_departure_minutes: 0,
        overtime_minutes: overtimeMins,
        status,
        location_verified: status !== 'absent' && status !== 'on_leave',
        webauthn_verified: false,
      });
    });
  }

  // Projects & Tasks (Kanban)
  const projects: DbSchema['projects'] = [
    { id: 'proj-1', company_id: 'comp-atlas', department_id: 'dept-prod', name: 'Modernisation Ligne B', description: 'Optimisation cadence et maintenance préventive Ligne B', status: 'active' },
    { id: 'proj-2', company_id: 'comp-atlas', department_id: 'dept-it', name: 'Déploiement SIRH +HR', description: 'Digitalisation des processus RH et pointage', status: 'active' },
    { id: 'proj-3', company_id: 'comp-atlas', department_id: 'dept-qual', name: 'Renouvellement ISO 9001', description: 'Audit interne de conformité Q4', status: 'active' },
    { id: 'proj-4', company_id: 'comp-maghreb', department_id: 'dept-mgt-it', name: 'Plateforme Cloud v2', description: 'Migration microservices Kubernetes', status: 'active' },
  ];

  const tasks: TaskItem[] = [
    {
      id: 'task-1',
      company_id: 'comp-atlas',
      project_id: 'proj-1',
      department_id: 'dept-prod',
      title: 'Calibration capteurs Ligne B2',
      description: 'Vérifier les tolérances thermiques et mettre à jour la fiche de poste.',
      priority: 'high',
      start_date: isoDateOffset(-2),
      due_date: isoDateOffset(3),
      estimated_hours: 12,
      actual_hours: 6,
      status: 'in_progress',
      assignee_id: 'emp-atlas-10',
      comments: [{ id: 'tc-1', user_name: 'Youssef Chraibi', text: 'Prioritaire avant l’audit qualité de vendredi.', created_at: now }],
    },
    {
      id: 'task-2',
      company_id: 'comp-atlas',
      project_id: 'proj-1',
      department_id: 'dept-prod',
      title: 'Inventaire outillage équipe matin',
      description: 'Contrôle complet des coffrets de maintenance de premier niveau.',
      priority: 'medium',
      start_date: isoDateOffset(0),
      due_date: isoDateOffset(5),
      estimated_hours: 8,
      actual_hours: 0,
      status: 'todo',
      assignee_id: 'emp-atlas-12',
      comments: [],
    },
    {
      id: 'task-3',
      company_id: 'comp-atlas',
      project_id: 'proj-1',
      department_id: 'dept-prod',
      title: 'Rapport hebdomadaire rendement TRS',
      description: 'Consolidation des temps d’arrêt et taux de rendement synthétique.',
      priority: 'urgent',
      start_date: isoDateOffset(-3),
      due_date: isoDateOffset(1),
      estimated_hours: 10,
      actual_hours: 9,
      status: 'in_review',
      assignee_id: 'emp-atlas-15',
      comments: [],
    },
    {
      id: 'task-4',
      company_id: 'comp-atlas',
      project_id: 'proj-2',
      department_id: 'dept-it',
      title: 'Configuration SSO & sauvegardes SQL',
      description: 'Planifier la sauvegarde nocturne automatique MySQL.',
      priority: 'high',
      start_date: isoDateOffset(-5),
      due_date: isoDateOffset(-1),
      estimated_hours: 14,
      actual_hours: 14,
      status: 'done',
      assignee_id: 'emp-atlas-20',
      comments: [],
    },
    {
      id: 'task-5',
      company_id: 'comp-atlas',
      project_id: 'proj-3',
      department_id: 'dept-qual',
      title: 'Revue documentaire procédures HSE',
      description: 'Mise à jour des consignes de sécurité atelier.',
      priority: 'medium',
      start_date: isoDateOffset(1),
      due_date: isoDateOffset(6),
      estimated_hours: 10,
      actual_hours: 2,
      status: 'in_progress',
      assignee_id: 'emp-atlas-18',
      comments: [],
    },
    {
      id: 'task-6',
      company_id: 'comp-atlas',
      project_id: 'proj-1',
      department_id: 'dept-prod',
      title: 'Formation sécurité nouveaux opérateurs',
      description: 'Session d’intégration sécurité de 6h.',
      priority: 'low',
      start_date: isoDateOffset(2),
      due_date: isoDateOffset(8),
      estimated_hours: 6,
      actual_hours: 0,
      status: 'todo',
      assignee_id: 'emp-atlas-10',
      comments: [],
    },
    {
      id: 'task-7',
      company_id: 'comp-maghreb',
      project_id: 'proj-4',
      department_id: 'dept-mgt-it',
      title: 'Pipeline CI/CD staging',
      description: 'Automatiser les tests de régression avant déploiement.',
      priority: 'high',
      start_date: isoDateOffset(-1),
      due_date: isoDateOffset(4),
      estimated_hours: 16,
      actual_hours: 8,
      status: 'in_progress',
      assignee_id: 'emp-mgt-5',
      comments: [],
    },
  ];

  // Payroll run for current & previous month
  const curMonth = new Date().getMonth() + 1;
  const curYear = new Date().getFullYear();
  const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
  const prevYear = curMonth === 1 ? curYear - 1 : curYear;

  const payrolls: PayrollRun[] = [];
  const payroll_items: PayrollItem[] = [];
  const payslips: DbSchema['payslips'] = [];

  for (const cid of ['comp-atlas', 'comp-maghreb']) {
    const cs = company_settings.find((c) => c.company_id === cid)!;
    const compEmps = employees.filter((e) => e.company_id === cid);
    const prId = `pay-${cid}-${prevYear}-${prevMonth}`;
    let totalGross = 0;
    let totalNet = 0;

    compEmps.forEach((emp, i) => {
      const bonuses = i % 3 === 0 ? 1200 : 500;
      const allowances = 600;
      const overtimePay = i % 4 === 0 ? 450 : 0;
      const deductions = 0;
      const gross = emp.base_salary_mad + bonuses + allowances + overtimePay;
      const contrib = Number(((gross * (cs.payroll_contribution_rate + cs.payroll_tax_rate)) / 100).toFixed(2));
      const net = Number((gross - contrib - deductions).toFixed(2));
      totalGross += gross;
      totalNet += net;

      const piId = `pi-${prId}-${emp.id}`;
      payroll_items.push({
        id: piId,
        company_id: cid,
        payroll_id: prId,
        employee_id: emp.id,
        base_salary: emp.base_salary_mad,
        bonuses,
        overtime_pay: overtimePay,
        allowances,
        deductions,
        configured_contributions: contrib,
        gross_salary: gross,
        net_salary: net,
      });

      payslips.push({
        id: `ps-${piId}`,
        company_id: cid,
        payroll_item_id: piId,
        employee_id: emp.id,
        period_label: `${String(prevMonth).padStart(2, '0')}/${prevYear}`,
        reference: `BUL-${emp.matricule}-${prevYear}${String(prevMonth).padStart(2, '0')}`,
        issued_at: now,
      });
    });

    payrolls.push({
      id: prId,
      company_id: cid,
      period_month: prevMonth,
      period_year: prevYear,
      currency: 'MAD',
      status: 'validated',
      total_gross: Number(totalGross.toFixed(2)),
      total_net: Number(totalNet.toFixed(2)),
      validated_at: now,
    });
  }

  const announcements: Announcement[] = [
    {
      id: 'ann-1',
      company_id: 'comp-atlas',
      author_user_id: 'user-emp-atlas-2',
      author_name: 'Salma El Fassi',
      title: 'Campagne d’entretiens annuels 2026',
      content: 'Les entretiens d’évaluation et de développement des compétences débuteront le mois prochain. Chaque manager est invité à planifier les créneaux avec son équipe.',
      category: 'hr',
      audience_type: 'all',
      is_pinned: true,
      expires_at: isoDateOffset(45),
      created_at: now,
    },
    {
      id: 'ann-2',
      company_id: 'comp-atlas',
      author_user_id: 'user-emp-atlas-3',
      author_name: 'Youssef Chraibi',
      title: 'Mise à jour des consignes EPI – Zone Production',
      content: 'Le port des chaussures de sécurité et protections auditives est strictement contrôlé à partir de lundi sur les lignes A et B.',
      category: 'operations',
      audience_type: 'department',
      target_department_id: 'dept-prod',
      is_pinned: false,
      expires_at: isoDateOffset(30),
      created_at: now,
    },
    {
      id: 'ann-3',
      company_id: 'comp-maghreb',
      author_user_id: 'user-emp-mgt-1',
      author_name: 'Ghita Mansouri',
      title: 'Nouvelle politique hybride – 2 jours de télétravail',
      content: 'À compter de ce trimestre, l’ensemble des équipes techniques bénéficient de 2 jours de télétravail flexibles par semaine.',
      category: 'hr',
      audience_type: 'all',
      is_pinned: true,
      expires_at: isoDateOffset(60),
      created_at: now,
    },
  ];

  const announcement_comments: DbSchema['announcement_comments'] = [
    {
      id: 'acomm-1',
      company_id: 'comp-atlas',
      announcement_id: 'ann-1',
      user_id: 'user-emp-atlas-3',
      user_name: 'Youssef Chraibi',
      content: 'Merci Salma, le planning de l’équipe Production sera prêt dès jeudi.',
      is_moderated: false,
      created_at: now,
    },
  ];

  const meetings: Meeting[] = [
    {
      id: 'meet-1',
      company_id: 'comp-atlas',
      organizer_user_id: 'user-emp-atlas-2',
      organizer_name: 'Salma El Fassi',
      department_id: 'dept-rh',
      title: 'Comité Mensuel RH & Managers',
      description: 'Revue des effectifs, suivi de l’absentéisme et préparation de la paie.',
      date: isoDateOffset(1),
      start_time: '10:00',
      end_time: '11:30',
      location: 'Salle de Conférence Atlas (RDC)',
      meeting_type: 'hybrid',
      video_link: 'https://meet.google.com/atlas-hr-monthly',
      status: 'scheduled',
      participant_ids: ['emp-atlas-1', 'emp-atlas-2', 'emp-atlas-3', 'emp-atlas-5', 'emp-atlas-6', 'emp-atlas-10'],
    },
    {
      id: 'meet-2',
      company_id: 'comp-atlas',
      organizer_user_id: 'user-emp-atlas-3',
      organizer_name: 'Youssef Chraibi',
      department_id: 'dept-prod',
      title: 'Briefing Hebdomadaire Production',
      description: 'Objectifs de fabrication et répartition des équipes matin/après-midi.',
      date: isoDateOffset(2),
      start_time: '09:00',
      end_time: '09:45',
      location: 'Atelier B - Bureau Chef d’équipe',
      meeting_type: 'in_person',
      video_link: null,
      status: 'scheduled',
      participant_ids: ['emp-atlas-3', 'emp-atlas-10', 'emp-atlas-12', 'emp-atlas-13', 'emp-atlas-15'],
    },
  ];

  const notifications: NotificationItem[] = [
    {
      id: 'notif-1',
      company_id: 'comp-atlas',
      user_id: 'user-emp-atlas-2',
      type: 'leave_request',
      title: 'Demande de congé validée par le Manager',
      message: 'Imane Boukhari attend votre validation finale RH pour son congé annuel (3 jours).',
      link_path: '/leaves',
      is_read: false,
      created_at: now,
    },
    {
      id: 'notif-2',
      company_id: 'comp-atlas',
      user_id: 'user-emp-atlas-3',
      type: 'leave_request',
      title: 'Nouvelle demande de congé',
      message: 'Amine Idrissi a soumis une demande de congé annuel de 3 jours.',
      link_path: '/leaves',
      is_read: false,
      created_at: now,
    },
    {
      id: 'notif-3',
      company_id: 'comp-atlas',
      user_id: 'user-emp-atlas-10',
      type: 'task',
      title: 'Nouvelle tâche assignée',
      message: 'Calibration capteurs Ligne B2 vous a été assignée.',
      link_path: '/tasks',
      is_read: false,
      created_at: now,
    },
    {
      id: 'notif-4',
      company_id: 'comp-atlas',
      user_id: 'user-emp-atlas-2',
      type: 'contract_expiry',
      title: 'Contrats proches de l’expiration',
      message: 'Des contrats CDD/ANAPEC arrivent à échéance dans moins de 30 jours.',
      link_path: '/contracts',
      is_read: false,
      created_at: now,
    },
  ];

  const conversations: DbSchema['conversations'] = [
    { id: 'conv-1', company_id: 'comp-atlas', is_group: false, title: null, created_at: now },
    { id: 'conv-2', company_id: 'comp-atlas', is_group: false, title: null, created_at: now },
  ];

  const conversation_members: DbSchema['conversation_members'] = [
    { id: 'cm-1', company_id: 'comp-atlas', conversation_id: 'conv-1', user_id: 'user-emp-atlas-2', last_read_at: now },
    { id: 'cm-2', company_id: 'comp-atlas', conversation_id: 'conv-1', user_id: 'user-emp-atlas-3', last_read_at: now },
    { id: 'cm-3', company_id: 'comp-atlas', conversation_id: 'conv-2', user_id: 'user-emp-atlas-3', last_read_at: now },
    { id: 'cm-4', company_id: 'comp-atlas', conversation_id: 'conv-2', user_id: 'user-emp-atlas-10', last_read_at: now },
  ];

  const messages: ChatMessage[] = [
    {
      id: 'msg-1',
      company_id: 'comp-atlas',
      conversation_id: 'conv-1',
      sender_user_id: 'user-emp-atlas-2',
      sender_name: 'Salma El Fassi',
      content: 'Bonjour Youssef, peux-tu confirmer les plannings de l’équipe de nuit pour la semaine prochaine ?',
      is_edited: false,
      is_deleted: false,
      created_at: now,
    },
    {
      id: 'msg-2',
      company_id: 'comp-atlas',
      conversation_id: 'conv-1',
      sender_user_id: 'user-emp-atlas-3',
      sender_name: 'Youssef Chraibi',
      content: 'Bonjour Salma, oui je viens d’utiliser l’assistant de planification et je te valide ça dans l’après-midi.',
      is_edited: false,
      is_deleted: false,
      created_at: now,
    },
    {
      id: 'msg-3',
      company_id: 'comp-atlas',
      conversation_id: 'conv-2',
      sender_user_id: 'user-emp-atlas-3',
      sender_name: 'Youssef Chraibi',
      content: 'Bonjour Amine, n’oublie pas de pointer ton entrée et de vérifier la fiche de calibration de la ligne B2.',
      is_edited: false,
      is_deleted: false,
      created_at: now,
    },
  ];

  const holidays: DbSchema['holidays'] = [
    { id: 'hol-1', company_id: 'comp-atlas', name: 'Jour de l’An', date: '2026-01-01', is_recurring: true },
    { id: 'hol-2', company_id: 'comp-atlas', name: 'Manifeste de l’Indépendance', date: '2026-01-11', is_recurring: true },
    { id: 'hol-3', company_id: 'comp-atlas', name: 'Fête du Travail', date: '2026-05-01', is_recurring: true },
    { id: 'hol-4', company_id: 'comp-atlas', name: 'Fête du Trône', date: '2026-07-30', is_recurring: true },
    { id: 'hol-5', company_id: 'comp-atlas', name: 'Marche Verte', date: '2026-11-06', is_recurring: true },
    { id: 'hol-6', company_id: 'comp-atlas', name: 'Fête de l’Indépendance', date: '2026-11-18', is_recurring: true },
    { id: 'hol-7', company_id: 'comp-maghreb', name: 'Fête du Travail', date: '2026-05-01', is_recurring: true },
    { id: 'hol-8', company_id: 'comp-maghreb', name: 'Fête du Trône', date: '2026-07-30', is_recurring: true },
  ];

  const employee_registration_requests: EmployeeRegistrationRequest[] = [
    {
      id: 'reg-1',
      company_id: 'comp-atlas',
      requested_by_user_id: 'user-emp-atlas-1',
      reviewed_by_user_id: null,
      first_name: 'Soukaina',
      last_name: 'El Ghazali',
      email: 's.elghazali@atlas-industrial.ma',
      phone: '+212 662 41 85 90',
      matricule: 'ATL-029',
      department_id: 'dept-qual',
      position_id: 'pos-qual-ctrl',
      manager_id: 'emp-atlas-5',
      role_code: 'EMPLOYEE',
      contract_type: 'CDI',
      base_salary_mad: 9200,
      hire_date: isoDateOffset(5),
      status: 'pending',
      created_at: now,
    },
  ];

  const audit_logs: DbSchema['audit_logs'] = [
    {
      id: 'aud-1',
      company_id: 'comp-atlas',
      user_id: 'user-emp-atlas-2',
      user_name: 'Salma El Fassi',
      action: 'PAYROLL_VALIDATED',
      entity_type: 'payroll',
      entity_id: `pay-comp-atlas-${prevYear}-${prevMonth}`,
      details: 'Validation mensuelle de la paie par la Direction RH',
      ip_address: '127.0.0.1',
      created_at: now,
    },
    {
      id: 'aud-2',
      company_id: null,
      user_id: 'user-superadmin',
      user_name: 'Amine Belhadj',
      action: 'TENANT_PROVISIONED',
      entity_type: 'company',
      entity_id: 'comp-maghreb',
      details: 'Activation espace multi-tenant Maghreb Tech Solutions',
      ip_address: '127.0.0.1',
      created_at: now,
    },
  ];

  const technical_incidents: DbSchema['technical_incidents'] = [
    {
      id: 'inc-1',
      title: 'Latence SMTP sur relais notification externe',
      severity: 'low',
      status: 'resolved',
      company_id: 'comp-atlas',
      reported_at: now,
    },
    {
      id: 'inc-2',
      title: 'Synchronisation horodatage pointeuse secondaire',
      severity: 'medium',
      status: 'investigating',
      company_id: 'comp-atlas',
      reported_at: now,
    },
  ];

  return {
    companies,
    subscriptions,
    company_settings,
    roles,
    permissions,
    role_permissions,
    users,
    departments,
    positions,
    employees,
    employee_registration_requests,
    employee_documents: [],
    contracts,
    work_schedules: [
      { id: 'ws-atlas', company_id: 'comp-atlas', name: 'Horaire Standard Industrie', start_time: '08:30', end_time: '17:30', break_minutes: 60, working_days: '1,2,3,4,5', is_default: true },
      { id: 'ws-mgt', company_id: 'comp-maghreb', name: 'Horaire Tech Flexible', start_time: '09:00', end_time: '18:00', break_minutes: 60, working_days: '1,2,3,4,5', is_default: true },
    ],
    shifts,
    shift_assignments,
    attendance_records,
    attendance_corrections: [],
    leave_types,
    leave_balances,
    leave_requests,
    exit_types,
    exit_requests,
    approval_history: [],
    payrolls,
    payroll_items,
    payslips,
    projects,
    tasks,
    task_assignments: tasks
      .filter((t) => t.assignee_id)
      .map((t) => ({ id: `ta-${t.id}`, company_id: t.company_id, task_id: t.id, employee_id: t.assignee_id!, assigned_hours: t.estimated_hours })),
    workload_records: [],
    announcements,
    announcement_comments,
    meetings,
    meeting_participants: meetings.flatMap((m) =>
      m.participant_ids.map((empId) => ({
        id: `mp-${m.id}-${empId}`,
        company_id: m.company_id,
        meeting_id: m.id,
        employee_id: empId,
        rsvp_status: 'invited',
      }))
    ),
    calendar_events: meetings.map((m) => ({
      id: `ce-${m.id}`,
      company_id: m.company_id,
      event_type: 'meeting',
      reference_id: m.id,
      title: m.title,
      start_datetime: `${m.date}T${m.start_time}:00`,
      end_datetime: `${m.date}T${m.end_time}:00`,
    })),
    notifications,
    conversations,
    conversation_members,
    messages,
    message_attachments: [],
    password_reset_otps: [],
    refresh_tokens: [],
    ai_conversations: [],
    ai_messages: [],
    audit_logs,
    holidays,
    technical_incidents,
    notification_preferences: [],
    ai_schedule_suggestions: [],
  };
}

export function loadDb(): DbSchema {
  if (memoryDb) return memoryDb;
  if (!isDemoModeEnabled() || isSqliteSeeded()) {
    memoryDb = readAllFromSqlite();
    return memoryDb;
  }
  const seed = createInitialSeed();
  writeSeedToSqlite(seed);
  memoryDb = readAllFromSqlite();
  return memoryDb;
}

export function reloadDbFromSqlite(): DbSchema {
  memoryDb = null;
  return loadDb();
}

export async function mutateDb<T>(fn: (db: DbSchema) => T | Promise<T>): Promise<T> {
  const run = async () => {
    const db = loadDb();
    const result = await fn(db);
    syncChangesToSqlite(db);
    return result;
  };
  return queueWrite(run);
}

export function mutateAuthDb<T>(fn: (db: DbSchema) => T): Promise<T> {
  return queueWrite(() => {
    const sqlite = getSqliteDb();
    try {
      const result = sqlite.transaction(() => {
        const db = readAllFromSqlite(sqlite);
        const value = fn(db);
        syncChangesToSqlite(db, sqlite);
        return { db, value };
      }).immediate();
      memoryDb = result.db;
      return result.value;
    } catch (error) {
      memoryDb = null;
      throw error;
    }
  });
}

function queueWrite<T>(run: () => T | Promise<T>): Promise<T> {
  const next = writeQueue.then(run, run);
  writeQueue = next.then(() => undefined, () => undefined);
  return next;
}

export function newId(prefix = 'id'): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
}

export function logAudit(
  db: DbSchema,
  params: {
    company_id: string | null;
    user_id: string | null;
    user_name?: string;
    action: string;
    entity_type: string;
    entity_id?: string | null;
    details: string;
    ip_address?: string;
  }
): void {
  db.audit_logs.unshift({
    id: newId('aud'),
    company_id: params.company_id,
    user_id: params.user_id,
    user_name: params.user_name,
    action: params.action,
    entity_type: params.entity_type,
    entity_id: params.entity_id ?? null,
    details: params.details,
    ip_address: params.ip_address || '127.0.0.1',
    created_at: new Date().toISOString(),
  });
  if (db.audit_logs.length > 500) {
    db.audit_logs.length = 500;
  }
}

export function resetDemoDatabase(): void {
  if (process.env.NODE_ENV !== 'test' || !process.env.SQLITE_DB_PATH || !isDemoModeEnabled()) {
    throw new Error('Demo reset requires test mode and an explicit SQLite path.');
  }
  const seed = createInitialSeed();
  writeSeedToSqlite(seed);
  memoryDb = readAllFromSqlite();
}
