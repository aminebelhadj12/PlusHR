-- +HR Initial Seed SQL (Roles, Permissions, 2 Demo Companies, Holidays)
-- Synthetic demo data for PFE demonstration only.

INSERT IGNORE INTO roles (id, code, name_fr, name_en, name_ar, description) VALUES
  ('role-1', 'SUPER_ADMIN', 'Super Administrateur', 'Super Admin', 'مدير المنصة العام', 'Global multi-tenant platform administrator'),
  ('role-2', 'COMPANY_ADMIN', 'Administrateur Entreprise', 'Company Admin', 'مدير الشركة', 'Company space, users, departments, and settings administrator'),
  ('role-3', 'HR_MANAGER', 'Responsable RH', 'HR Manager', 'مسؤول الموارد البشرية', 'HR approvals, contracts, payroll, attendance, and personnel files'),
  ('role-4', 'MANAGER', 'Manager', 'Manager', 'مدير القسم', 'Department team, first-level approvals, schedules, and tasks'),
  ('role-5', 'EMPLOYEE', 'Employé', 'Employee', 'موظف', 'Personal portal, time clock, leave/exit requests, payslips, and chat');

INSERT IGNORE INTO permissions (id, code, module, description) VALUES
  ('perm-1', 'platform.manage', 'platform', 'Manage companies, subscriptions, and global platform metrics'),
  ('perm-2', 'employees.read', 'employees', 'View employee directory and profiles'),
  ('perm-3', 'employees.write', 'employees', 'Request new employees and edit authorized employee records'),
  ('perm-4', 'employees.approve', 'employees', 'Approve or reject employee registration requests'),
  ('perm-5', 'attendance.read', 'attendance', 'View attendance records'),
  ('perm-6', 'attendance.correct', 'attendance', 'Correct attendance records with audit log'),
  ('perm-7', 'leaves.approve_l1', 'leaves', 'First-level manager approval on leaves and exits'),
  ('perm-8', 'leaves.approve_l2', 'leaves', 'Final HR approval on leaves and exits'),
  ('perm-9', 'payroll.manage', 'payroll', 'Prepare and validate monthly payroll'),
  ('perm-10', 'contracts.manage', 'contracts', 'Create, renew, and archive employment contracts'),
  ('perm-11', 'schedules.manage', 'schedules', 'Manage shifts, schedules, and AI schedule suggestions'),
  ('perm-12', 'settings.manage', 'settings', 'Configure company HR, payroll, and security settings');

INSERT IGNORE INTO companies (id, name, slug, legal_name, ice, rc, city, country, address, phone, email, industry, status) VALUES
  ('comp-atlas', 'Atlas Industrial Group', 'atlas-industrial', 'Atlas Industrial Group S.A.', '001584920000041', 'RC-482910', 'Casablanca', 'Maroc', 'Zone Industrielle Sidi Maarouf, Lot 42', '+212 522 48 91 00', 'contact@atlas-industrial.ma', 'Industrie & Ingénierie', 'active'),
  ('comp-maghreb', 'Maghreb Tech Solutions', 'maghreb-tech', 'Maghreb Tech Solutions SARL', '002491830000088', 'RC-194022', 'Rabat', 'Maroc', 'Technopolis Rabat Shore, Bâtiment B4', '+212 537 68 24 10', 'hello@maghrebtech.ma', 'Technologies & Services', 'active');

INSERT IGNORE INTO subscriptions (id, company_id, plan_name, max_employees, price_mad, billing_cycle, status, starts_at, ends_at) VALUES
  ('sub-atlas', 'comp-atlas', 'Enterprise', 250, 4900.00, 'annual', 'active', '2026-01-01', '2027-01-01'),
  ('sub-maghreb', 'comp-maghreb', 'Business', 100, 2400.00, 'monthly', 'active', '2026-01-01', '2026-12-31');

INSERT IGNORE INTO company_settings (id, company_id, language, currency, timezone, work_start_time, work_end_time, working_days, late_threshold_minutes, enable_exit_rules, exit_max_hours_per_day, exit_conversion_hours, require_geolocation_checkin, allow_webauthn_checkin, payroll_contribution_rate, payroll_tax_rate, overtime_multiplier) VALUES
  ('cs-atlas', 'comp-atlas', 'fr', 'MAD', 'Africa/Casablanca', '08:30:00', '17:30:00', '1,2,3,4,5', 15, TRUE, 4.00, 7.50, FALSE, TRUE, 6.74, 10.00, 1.25),
  ('cs-maghreb', 'comp-maghreb', 'fr', 'MAD', 'Africa/Casablanca', '09:00:00', '18:00:00', '1,2,3,4,5', 15, FALSE, 4.00, 7.50, FALSE, TRUE, 6.00, 8.00, 1.25);

INSERT IGNORE INTO holidays (id, company_id, name, date, is_recurring) VALUES
  ('hol-1', 'comp-atlas', 'Jour de l''An', '2026-01-01', TRUE),
  ('hol-2', 'comp-atlas', 'Manifeste de l''Indépendance', '2026-01-11', TRUE),
  ('hol-3', 'comp-atlas', 'Fête du Travail', '2026-05-01', TRUE),
  ('hol-4', 'comp-atlas', 'Fête du Trône', '2026-07-30', TRUE),
  ('hol-5', 'comp-atlas', 'Révolution du Roi et du Peuple', '2026-08-20', TRUE),
  ('hol-6', 'comp-atlas', 'Marche Verte', '2026-11-06', TRUE),
  ('hol-7', 'comp-atlas', 'Fête de l''Indépendance', '2026-11-18', TRUE);
