import { Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import { loadDb, mutateDb, newId, logAudit } from '../repositories/dataStore.js';
import { AuthenticatedRequest, assertSameCompany, getScopedCompanyId } from '../middlewares/auth.js';
import { isValidDateStr, isValidEmail, safeUploadPath, sanitizeText } from '../validators/validators.js';
import { pushNotification } from '../services/realtimeService.js';

// ======================== PLATFORM (SUPER ADMIN) ========================

export function getPlatformOverview(_req: AuthenticatedRequest, res: Response): void {
  const db = loadDb();
  const companiesWithMetrics = db.companies.map((c) => {
    const sub = db.subscriptions.find((s) => s.company_id === c.id);
    const empCount = db.employees.filter((e) => e.company_id === c.id && e.status !== 'archived').length;
    return { ...c, subscription: sub, employee_count: empCount };
  });

  const totalMrr = db.subscriptions
    .filter((s) => s.status === 'active')
    .reduce((acc, s) => acc + (s.billing_cycle === 'annual' ? s.price_mad : s.price_mad), 0);

  res.json({
    stats: {
      totalCompanies: db.companies.length,
      activeCompanies: db.companies.filter((c) => c.status === 'active').length,
      suspendedCompanies: db.companies.filter((c) => c.status === 'suspended').length,
      totalEmployees: db.employees.filter((e) => e.status !== 'archived').length,
      totalUsers: db.users.length,
      monthlyRevenueMad: totalMrr,
      openIncidents: db.technical_incidents.filter((i) => i.status !== 'resolved').length,
    },
    companies: companiesWithMetrics,
    incidents: db.technical_incidents,
    auditLogs: db.audit_logs.slice(0, 60),
  });
}

export async function createCompany(req: AuthenticatedRequest, res: Response): Promise<void> {
  const name = sanitizeText(req.body?.name, 160);
  const city = sanitizeText(req.body?.city || 'Casablanca', 100);
  const industry = sanitizeText(req.body?.industry || 'Services', 120);
  const adminName = sanitizeText(req.body?.adminName, 160);
  const adminEmail = sanitizeText(req.body?.adminEmail, 160).toLowerCase();
  const planName = (req.body?.plan_name || 'Business') as 'Starter' | 'Business' | 'Enterprise';

  if (!name || !adminName || !isValidEmail(adminEmail)) {
    res.status(400).json({ error: 'Nom de l’entreprise, nom administrateur et email valide requis.' });
    return;
  }

  const db = loadDb();
  if (db.users.some((u) => u.email.toLowerCase() === adminEmail)) {
    res.status(409).json({ error: 'Cet email administrateur est déjà utilisé.' });
    return;
  }

  const companyId = newId('comp');
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${companyId.slice(-4)}`;
  const tempPassword = `PlusHR#${crypto.randomInt(1000, 9999)}a`;
  const now = new Date().toISOString();

  await mutateDb((d) => {
    d.companies.push({
      id: companyId,
      name,
      slug,
      legal_name: name,
      ice: sanitizeText(req.body?.ice || '', 30),
      rc: sanitizeText(req.body?.rc || '', 30),
      city,
      country: 'Maroc',
      address: sanitizeText(req.body?.address || `${city}, Maroc`, 200),
      phone: sanitizeText(req.body?.phone || '+212 522 00 00 00', 40),
      email: adminEmail,
      logo_url: '',
      industry,
      status: 'active',
      created_at: now,
      updated_at: now,
    });

    d.subscriptions.push({
      id: newId('sub'),
      company_id: companyId,
      plan_name: planName,
      max_employees: planName === 'Enterprise' ? 500 : planName === 'Business' ? 100 : 30,
      price_mad: planName === 'Enterprise' ? 4900 : planName === 'Business' ? 2400 : 990,
      billing_cycle: 'monthly',
      status: 'active',
      starts_at: now.slice(0, 10),
      ends_at: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
    });

    d.company_settings.push({
      id: newId('cs'),
      company_id: companyId,
      language: 'fr',
      currency: 'MAD',
      timezone: 'Africa/Casablanca',
      work_start_time: '08:30',
      work_end_time: '17:30',
      working_days: '1,2,3,4,5',
      late_threshold_minutes: 15,
      enable_exit_rules: false,
      exit_max_hours_per_day: 4,
      exit_conversion_hours: 7.5,
      require_geolocation_checkin: false,
      allow_webauthn_checkin: true,
      payroll_contribution_rate: 6,
      payroll_tax_rate: 10,
      overtime_multiplier: 1.25,
    });

    const deptId = newId('dept');
    const posId = newId('pos');
    d.departments.push({
      id: deptId,
      company_id: companyId,
      name: 'Direction & RH',
      code: 'DIR',
      description: 'Direction générale et administration',
      parent_department_id: null,
      manager_employee_id: null,
      is_archived: false,
    });
    d.positions.push({
      id: posId,
      company_id: companyId,
      department_id: deptId,
      title: 'Administrateur Entreprise',
      level: 'Direction',
      base_salary_min: 15000,
      base_salary_max: 35000,
    });

    const userId = newId('user');
    const empId = newId('emp');
    const [firstName, ...rest] = adminName.split(' ');
    const lastName = rest.join(' ') || 'Admin';
    const matricule = `${name.slice(0, 3).toUpperCase()}-001`;

    d.users.push({
      id: userId,
      company_id: companyId,
      role_code: 'COMPANY_ADMIN',
      email: adminEmail,
      matricule,
      password_hash: bcrypt.hashSync(tempPassword, 10),
      full_name: adminName,
      preferred_lang: 'fr',
      theme: 'light',
      is_active: true,
      must_change_password: true,
      webauthn_credential_id: null,
      last_login_at: null,
      created_at: now,
      updated_at: now,
    });

    d.employees.push({
      id: empId,
      company_id: companyId,
      user_id: userId,
      matricule,
      first_name: firstName,
      last_name: lastName,
      email: adminEmail,
      phone: sanitizeText(req.body?.phone || '+212 600 00 00 00', 40),
      cin: '',
      cnss_number: '',
      birth_date: null,
      gender: 'Other',
      address: `${city}, Maroc`,
      city,
      emergency_contact: '',
      photo_url: '',
      department_id: deptId,
      position_id: posId,
      manager_id: null,
      hire_date: now.slice(0, 10),
      contract_type: 'CDI',
      base_salary_mad: 25000,
      skills: 'Administration',
      status: 'active',
    });

    d.leave_types.push({
      id: newId('lt'),
      company_id: companyId,
      code: 'ANNUAL',
      name_fr: 'Congé annuel',
      name_en: 'Annual Leave',
      name_ar: 'إجازة سنوية',
      default_days_per_year: 18,
      is_paid: true,
      is_protected: false,
      requires_attachment: false,
    });

    logAudit(d, {
      company_id: companyId,
      user_id: req.user?.userId || null,
      action: 'COMPANY_CREATED',
      entity_type: 'company',
      entity_id: companyId,
      details: `Création entreprise ${name} + compte admin ${adminEmail}`,
    });
  });

  res.status(201).json({ companyId, adminEmail, tempPassword });
}

export async function toggleCompanyStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const status = req.body?.status as 'active' | 'suspended' | 'trial';
  if (!['active', 'suspended', 'trial'].includes(status)) {
    res.status(400).json({ error: 'Statut invalide.' });
    return;
  }
  await mutateDb((db) => {
    const c = db.companies.find((x) => x.id === id);
    if (c) {
      c.status = status;
      c.updated_at = new Date().toISOString();
      logAudit(db, {
        company_id: c.id,
        user_id: req.user?.userId || null,
        action: 'COMPANY_STATUS_CHANGED',
        entity_type: 'company',
        entity_id: c.id,
        details: `Statut entreprise ${c.name} passé à ${status}`,
      });
    }
  });
  res.json({ ok: true });
}

export async function updateIncidentStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const status = req.body?.status as 'open' | 'investigating' | 'resolved';
  if (!['open', 'investigating', 'resolved'].includes(status)) {
    res.status(400).json({ error: 'Statut incident invalide.' });
    return;
  }
  await mutateDb((db) => {
    const inc = db.technical_incidents.find((x) => x.id === id);
    if (inc) inc.status = status;
  });
  res.json({ ok: true });
}

// ======================== DASHBOARD ========================

export function getDashboardData(req: AuthenticatedRequest, res: Response): void {
  const db = loadDb();
  const user = req.user!;

  if (user.roleCode === 'SUPER_ADMIN') {
    getPlatformOverview(req, res);
    return;
  }

  const cid = user.companyId!;
  const today = new Date().toISOString().slice(0, 10);
  const myEmp = db.employees.find((e) => e.user_id === user.userId && e.company_id === cid);

  // Scoped employees for manager vs company-wide for Admin/HR
  const isManagerOnly = user.roleCode === 'MANAGER';
  const allCompanyEmps = db.employees.filter((e) => e.company_id === cid && e.status !== 'archived');
  const scopedEmps = isManagerOnly
    ? allCompanyEmps.filter((e) => e.department_id === myEmp?.department_id)
    : allCompanyEmps;
  const scopedIds = new Set(scopedEmps.map((e) => e.id));

  // Employee personal dashboard
  if (user.roleCode === 'EMPLOYEE' && myEmp) {
    const myAttToday = db.attendance_records.find((a) => a.company_id === cid && a.employee_id === myEmp.id && a.date === today);
    const myAttHistory = db.attendance_records.filter((a) => a.company_id === cid && a.employee_id === myEmp.id);
    const workedMinutesTotal = myAttHistory.reduce((acc, a) => acc + a.worked_minutes, 0);
    const absencesCount = myAttHistory.filter((a) => a.status === 'absent').length;
    const latesCount = myAttHistory.filter((a) => a.status === 'late').length;
    const balances = db.leave_balances
      .filter((lb) => lb.company_id === cid && lb.employee_id === myEmp.id)
      .map((lb) => ({
        ...lb,
        leave_type_name: db.leave_types.find((lt) => lt.id === lb.leave_type_id)?.name_fr || 'Congé',
      }));
    const pendingLeaves = db.leave_requests.filter(
      (lr) => lr.company_id === cid && lr.employee_id === myEmp.id && (lr.status === 'pending_manager' || lr.status === 'pending_hr')
    );
    const pendingExits = db.exit_requests.filter(
      (er) => er.company_id === cid && er.employee_id === myEmp.id && (er.status === 'pending_manager' || er.status === 'pending_hr')
    );
    const myShifts = db.shift_assignments
      .filter((sa) => sa.company_id === cid && sa.employee_id === myEmp.id && sa.date >= today)
      .slice(0, 7)
      .map((sa) => {
        const sh = db.shifts.find((s) => s.id === sa.shift_id);
        return { ...sa, shift_name: sh?.name, start_time: sh?.start_time, end_time: sh?.end_time, color: sh?.color };
      });
    const myTasks = db.tasks.filter((t) => t.company_id === cid && t.assignee_id === myEmp.id && t.status !== 'done');
    const pinnedAnnouncements = db.announcements.filter(
      (a) =>
        a.company_id === cid &&
        (a.audience_type === 'all' ||
          (a.audience_type === 'department' && a.target_department_id === myEmp.department_id) ||
          (a.audience_type === 'role' && a.target_role_code === 'EMPLOYEE'))
    ).slice(0, 5);
    const upcomingMeetings = db.meetings.filter(
      (m) => m.company_id === cid && m.status === 'scheduled' && m.date >= today && m.participant_ids.includes(myEmp.id)
    );

    res.json({
      role: 'EMPLOYEE',
      employee: myEmp,
      todayAttendance: myAttToday || null,
      kpis: {
        workedHoursMonth: Math.round((workedMinutesTotal / 60) * 10) / 10,
        absencesCount,
        latesCount,
        annualLeaveRemaining: balances.find((b) => b.leave_type_name.toLowerCase().includes('annuel'))?.remaining_days ?? 0,
        pendingRequestsCount: pendingLeaves.length + pendingExits.length,
        assignedTasksCount: myTasks.length,
      },
      balances,
      upcomingShifts: myShifts,
      assignedTasks: myTasks,
      announcements: pinnedAnnouncements,
      upcomingMeetings,
    });
    return;
  }

  // Admin / HR / Manager KPIs from real DB records
  const todayRecords = db.attendance_records.filter((a) => a.company_id === cid && a.date === today && scopedIds.has(a.employee_id));
  const presentToday = todayRecords.filter((a) => ['present', 'late', 'remote'].includes(a.status)).length;
  const absentToday = todayRecords.filter((a) => a.status === 'absent').length;
  const lateToday = todayRecords.filter((a) => a.status === 'late').length;
  const onLeaveToday = todayRecords.filter((a) => a.status === 'on_leave').length;
  const attendanceRate = scopedEmps.length > 0 ? Math.round((presentToday / scopedEmps.length) * 100) : 0;

  const pendingLeaves = db.leave_requests.filter(
    (lr) => lr.company_id === cid && scopedIds.has(lr.employee_id) && (lr.status === 'pending_manager' || lr.status === 'pending_hr')
  );
  const pendingExits = db.exit_requests.filter(
    (er) => er.company_id === cid && scopedIds.has(er.employee_id) && (er.status === 'pending_manager' || er.status === 'pending_hr')
  );
  const pendingRegistrations = db.employee_registration_requests.filter((r) => r.company_id === cid && r.status === 'pending');

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const newEmployeesCount = scopedEmps.filter((e) => e.hire_date >= thirtyDaysAgo).length;

  const expiringContracts = db.contracts.filter((c) => {
    if (c.company_id !== cid || !c.end_date || !scopedIds.has(c.employee_id) || c.status === 'archived') return false;
    const diff = Math.ceil((Date.parse(c.end_date) - Date.now()) / 86400000);
    return diff >= 0 && diff <= 30;
  });

  const monthlyPayrollMass =
    user.roleCode === 'MANAGER'
      ? null
      : scopedEmps.reduce((acc, e) => acc + (e.status === 'active' ? e.base_salary_mad : 0), 0);

  // Chart 1 & 2 & 7: Attendance / Absence / Worked Hours evolution over recorded dates
  const uniqueDates = Array.from(new Set(db.attendance_records.filter((a) => a.company_id === cid).map((a) => a.date))).sort();
  const attendanceSeries = uniqueDates.slice(-10).map((dt) => {
    const recs = db.attendance_records.filter((a) => a.company_id === cid && a.date === dt && scopedIds.has(a.employee_id));
    return {
      date: dt.slice(5),
      presents: recs.filter((r) => r.status === 'present' || r.status === 'remote').length,
      retards: recs.filter((r) => r.status === 'late').length,
      absents: recs.filter((r) => r.status === 'absent').length,
      heures: Math.round(recs.reduce((acc, r) => acc + r.worked_minutes, 0) / 60),
    };
  });

  // Chart 3: Department breakdown
  const departmentBreakdown = db.departments
    .filter((d) => d.company_id === cid && !d.is_archived && (!isManagerOnly || d.id === myEmp?.department_id))
    .map((d) => ({
      name: d.name,
      code: d.code,
      count: scopedEmps.filter((e) => e.department_id === d.id).length,
    }));

  // Chart 4: Recruitment evolution by quarter/year
  const hireYearsMap = new Map<string, number>();
  scopedEmps.forEach((e) => {
    const ym = e.hire_date.slice(0, 4);
    hireYearsMap.set(ym, (hireYearsMap.get(ym) || 0) + 1);
  });
  const recruitmentSeries = Array.from(hireYearsMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([year, recrutements]) => ({ year, recrutements }));

  // Chart 5: Contract type distribution (CDI, CDD, Stage, ANAPEC, Intérim)
  const contractTypes = ['CDI', 'CDD', 'Stage', 'ANAPEC', 'Intérim', 'Autre'] as const;
  const contractDistribution = contractTypes
    .map((ct) => ({
      name: ct,
      value: scopedEmps.filter((e) => e.contract_type === ct).length,
    }))
    .filter((x) => x.value > 0);

  // Chart 6: Leave stats by status / type
  const leaveStats = [
    { name: 'Approuvés', count: db.leave_requests.filter((l) => l.company_id === cid && scopedIds.has(l.employee_id) && l.status === 'approved').length },
    { name: 'En attente Manager', count: db.leave_requests.filter((l) => l.company_id === cid && scopedIds.has(l.employee_id) && l.status === 'pending_manager').length },
    { name: 'En attente RH', count: db.leave_requests.filter((l) => l.company_id === cid && scopedIds.has(l.employee_id) && l.status === 'pending_hr').length },
    { name: 'Refusés', count: db.leave_requests.filter((l) => l.company_id === cid && scopedIds.has(l.employee_id) && (l.status === 'rejected_manager' || l.status === 'rejected_hr')).length },
  ];

  const recentActivities = db.audit_logs.filter((a) => a.company_id === cid).slice(0, 6);
  const upcomingMeetings = db.meetings.filter((m) => m.company_id === cid && m.status === 'scheduled' && m.date >= today).slice(0, 5);
  const pinnedAnnouncements = db.announcements.filter((a) => a.company_id === cid && a.is_pinned).slice(0, 4);

  const pendingQueue = [
    ...pendingLeaves.map((l) => {
      const emp = scopedEmps.find((e) => e.id === l.employee_id);
      return {
        id: l.id,
        kind: 'leave',
        title: `Congé (${l.working_days}j) - ${emp ? `${emp.first_name} ${emp.last_name}` : l.employee_id}`,
        status: l.status,
        link: '/leaves',
      };
    }),
    ...pendingExits.map((ex) => {
      const emp = scopedEmps.find((e) => e.id === ex.employee_id);
      return {
        id: ex.id,
        kind: 'exit',
        title: `Sortie (${ex.departure_time}-${ex.return_time}) - ${emp ? `${emp.first_name} ${emp.last_name}` : ex.employee_id}`,
        status: ex.status,
        link: '/exits',
      };
    }),
    ...(!isManagerOnly
      ? pendingRegistrations.map((r) => ({
          id: r.id,
          kind: 'registration',
          title: `Nouveau compte employé : ${r.first_name} ${r.last_name}`,
          status: r.status,
          link: '/registration-requests',
        }))
      : []),
  ].slice(0, 8);

  res.json({
    role: user.roleCode,
    kpis: {
      totalEmployees: scopedEmps.length,
      activeEmployees: scopedEmps.filter((e) => e.status === 'active').length,
      presentToday,
      absentToday,
      lateToday,
      onLeaveToday,
      attendanceRate,
      pendingRequests: pendingLeaves.length + pendingExits.length + (isManagerOnly ? 0 : pendingRegistrations.length),
      newEmployees: newEmployeesCount,
      expiringContracts: expiringContracts.length,
      monthlyPayrollMass,
    },
    charts: {
      attendanceSeries,
      departmentBreakdown,
      recruitmentSeries,
      contractDistribution,
      leaveStats,
    },
    recentActivities,
    upcomingMeetings,
    pinnedAnnouncements,
    pendingQueue,
  });
}

// ======================== EMPLOYEES & REGISTRATION WORKFLOW ========================

export function listEmployees(req: AuthenticatedRequest, res: Response): void {
  const db = loadDb();
  const cid = getScopedCompanyId(req);
  if (!cid) {
    res.status(400).json({ error: 'Entreprise requise.' });
    return;
  }

  const myEmp = db.employees.find((e) => e.user_id === req.user?.userId && e.company_id === cid);
  const isManagerOnly = req.user?.roleCode === 'MANAGER';

  const list = db.employees
    .filter((e) => e.company_id === cid && (!isManagerOnly || e.department_id === myEmp?.department_id))
    .map((e) => {
      const dept = db.departments.find((d) => d.id === e.department_id);
      const pos = db.positions.find((p) => p.id === e.position_id);
      const mgr = e.manager_id ? db.employees.find((m) => m.id === e.manager_id) : null;
      return {
        ...e,
        department_name: dept?.name || '-',
        position_title: pos?.title || '-',
        manager_name: mgr ? `${mgr.first_name} ${mgr.last_name}` : '-',
      };
    });

  res.json({ employees: list });
}

export function getEmployeeDossier(req: AuthenticatedRequest, res: Response): void {
  const db = loadDb();
  const emp = db.employees.find((e) => e.id === req.params.id);
  if (!emp || !assertSameCompany(req, emp.company_id)) {
    res.status(404).json({ error: 'Employé introuvable.' });
    return;
  }

  if (req.user?.roleCode === 'EMPLOYEE' && emp.user_id !== req.user.userId) {
    res.status(403).json({ error: 'Accès interdit aux données d’un autre employé.' });
    return;
  }

  const dept = db.departments.find((d) => d.id === emp.department_id);
  const pos = db.positions.find((p) => p.id === emp.position_id);
  const mgr = emp.manager_id ? db.employees.find((m) => m.id === emp.manager_id) : null;
  const attendances = db.attendance_records.filter((a) => a.employee_id === emp.id).sort((a, b) => b.date.localeCompare(a.date));
  const absences = attendances.filter((a) => ['absent', 'late', 'justified_absence'].includes(a.status));
  const leaves = db.leave_requests.filter((l) => l.employee_id === emp.id);
  const leaveBalances = db.leave_balances
    .filter((lb) => lb.employee_id === emp.id)
    .map((lb) => ({ ...lb, leave_type_name: db.leave_types.find((lt) => lt.id === lb.leave_type_id)?.name_fr }));
  const contracts = db.contracts.filter((c) => c.employee_id === emp.id);
  const documents = db.employee_documents.filter((d) => d.employee_id === emp.id);
  const payrollItems = db.payroll_items.filter((pi) => pi.employee_id === emp.id);
  const shifts = db.shift_assignments
    .filter((sa) => sa.employee_id === emp.id)
    .map((sa) => {
      const sh = db.shifts.find((s) => s.id === sa.shift_id);
      return { ...sa, shift_name: sh?.name, start_time: sh?.start_time, end_time: sh?.end_time };
    });
  const tasks = db.tasks.filter((t) => t.assignee_id === emp.id);
  const history = db.audit_logs.filter((a) => a.entity_id === emp.id || a.details.includes(emp.matricule));

  res.json({
    employee: {
      ...emp,
      department_name: dept?.name,
      position_title: pos?.title,
      manager_name: mgr ? `${mgr.first_name} ${mgr.last_name}` : '-',
    },
    attendances,
    absences,
    leaves,
    leaveBalances,
    contracts,
    documents,
    payrollItems,
    shifts,
    tasks,
    history,
  });
}

export async function updateEmployee(req: AuthenticatedRequest, res: Response): Promise<void> {
  const db = loadDb();
  const emp = db.employees.find((e) => e.id === req.params.id);
  if (!emp || !assertSameCompany(req, emp.company_id)) {
    res.status(404).json({ error: 'Employé introuvable.' });
    return;
  }

  await mutateDb((d) => {
    const target = d.employees.find((e) => e.id === emp.id);
    if (!target) return;
    if (req.body.first_name) target.first_name = sanitizeText(req.body.first_name, 100);
    if (req.body.last_name) target.last_name = sanitizeText(req.body.last_name, 100);
    if (req.body.phone !== undefined) target.phone = sanitizeText(req.body.phone, 40);
    if (req.body.department_id) target.department_id = sanitizeText(req.body.department_id, 40);
    if (req.body.position_id) target.position_id = sanitizeText(req.body.position_id, 40);
    if (req.body.manager_id !== undefined) target.manager_id = req.body.manager_id || null;
    if (req.body.contract_type) target.contract_type = req.body.contract_type;
    if (req.body.base_salary_mad !== undefined && Number(req.body.base_salary_mad) > 0) {
      target.base_salary_mad = Number(req.body.base_salary_mad);
    }
    if (req.body.skills !== undefined) target.skills = sanitizeText(req.body.skills, 300);
    if (req.body.status && ['active', 'inactive', 'archived', 'on_leave'].includes(req.body.status)) {
      target.status = req.body.status;
      const u = d.users.find((x) => x.id === target.user_id);
      if (u) u.is_active = target.status === 'active' || target.status === 'on_leave';
    }
    logAudit(d, {
      company_id: target.company_id,
      user_id: req.user?.userId || null,
      action: 'EMPLOYEE_UPDATED',
      entity_type: 'employee',
      entity_id: target.id,
      details: `Mise à jour fiche employé ${target.matricule} (${target.first_name} ${target.last_name})`,
    });
  });

  res.json({ ok: true });
}

export async function deleteEmployee(req: AuthenticatedRequest, res: Response): Promise<void> {
  const db = loadDb();
  const emp = db.employees.find((e) => e.id === req.params.id);
  if (!emp || !assertSameCompany(req, emp.company_id)) {
    res.status(404).json({ error: 'Employé introuvable.' });
    return;
  }
  if (emp.user_id && emp.user_id === req.user?.userId) {
    res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
    return;
  }

  await mutateDb((d) => {
    d.employees = d.employees.filter((e) => e.id !== emp.id);
    if (emp.user_id) {
      d.users = d.users.filter((u) => u.id !== emp.user_id);
      d.refresh_tokens = d.refresh_tokens.filter((rt) => rt.user_id !== emp.user_id);
      d.password_reset_otps = d.password_reset_otps.filter((o) => o.user_id !== emp.user_id);
      d.notification_preferences = d.notification_preferences.filter((np) => np.user_id !== emp.user_id);
      d.notifications = d.notifications.filter((n) => n.user_id !== emp.user_id);
      d.conversation_members = d.conversation_members.filter((cm) => cm.user_id !== emp.user_id);
    }
    d.contracts = d.contracts.filter((c) => c.employee_id !== emp.id);
    d.leave_balances = d.leave_balances.filter((lb) => lb.employee_id !== emp.id);
    d.leave_requests = d.leave_requests.filter((lr) => lr.employee_id !== emp.id);
    d.exit_requests = d.exit_requests.filter((er) => er.employee_id !== emp.id);
    d.attendance_records = d.attendance_records.filter((ar) => ar.employee_id !== emp.id);
    d.shift_assignments = d.shift_assignments.filter((sa) => sa.employee_id !== emp.id);
    d.employee_documents = d.employee_documents.filter((ed) => ed.employee_id !== emp.id);
    d.task_assignments = d.task_assignments.filter((ta) => ta.employee_id !== emp.id);
    d.meeting_participants = d.meeting_participants.filter((mp) => mp.employee_id !== emp.id);
    d.workload_records = d.workload_records.filter((wr) => wr.employee_id !== emp.id);

    d.employees.forEach((e) => {
      if (e.manager_id === emp.id) e.manager_id = null;
    });
    d.departments.forEach((dept) => {
      if (dept.manager_employee_id === emp.id) dept.manager_employee_id = null;
    });
    d.tasks.forEach((t) => {
      if (t.assignee_id === emp.id) t.assignee_id = null;
    });

    logAudit(d, {
      company_id: emp.company_id,
      user_id: req.user?.userId || null,
      action: 'EMPLOYEE_DELETED',
      entity_type: 'employee',
      entity_id: emp.id,
      details: `Suppression définitive employé ${emp.matricule} (${emp.first_name} ${emp.last_name})`,
    });
  });

  res.json({ ok: true });
}

export async function uploadEmployeeDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
  const db = loadDb();
  const emp = db.employees.find((e) => e.id === req.params.id);
  if (!emp || !assertSameCompany(req, emp.company_id)) {
    res.status(404).json({ error: 'Employé introuvable.' });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: 'Fichier requis.' });
    return;
  }

  const doc = {
    id: newId('doc'),
    company_id: emp.company_id,
    employee_id: emp.id,
    title: sanitizeText(req.body?.title || req.file.originalname, 180),
    category: sanitizeText(req.body?.category || 'Other', 40),
    file_name: req.file.originalname,
    file_path: `/api/uploads/${req.file.filename}`,
    mime_type: req.file.mimetype,
    file_size: req.file.size,
    uploaded_by_user_id: req.user!.userId,
    created_at: new Date().toISOString(),
  };

  await mutateDb((d) => {
    d.employee_documents.unshift(doc);
    logAudit(d, {
      company_id: emp.company_id,
      user_id: req.user!.userId,
      action: 'DOCUMENT_UPLOADED',
      entity_type: 'employee_document',
      entity_id: doc.id,
      details: `Ajout document ${doc.title} pour ${emp.matricule}`,
    });
  });

  res.status(201).json({ document: doc });
}

export function serveSafeUpload(req: AuthenticatedRequest, res: Response): void {
  const filePath = `/api/uploads/${req.params.filename}`;
  if (!canAccessUpload(req.user, filePath)) {
    res.status(404).json({ error: 'Fichier introuvable.' });
    return;
  }

  try {
    const resolved = safeUploadPath(req.params.filename);
    res.sendFile(resolved);
  } catch {
    res.status(400).json({ error: 'Chemin de fichier invalide.' });
  }
}

export function canAccessUpload(user: AuthenticatedRequest['user'], filePath: string): boolean {
  if (!user) return false;
  const db = loadDb();
  const hasCompanyAccess = (companyId: string) =>
    user.roleCode === 'SUPER_ADMIN' || user.companyId === companyId;
  const employeeRecordAccessible = (employeeId: string, companyId: string): boolean => {
    if (!hasCompanyAccess(companyId)) return false;
    const employee = db.employees.find((entry) => entry.id === employeeId && entry.company_id === companyId);
    if (!employee) return false;
    if (user.roleCode === 'SUPER_ADMIN' || user.roleCode === 'COMPANY_ADMIN' || user.roleCode === 'HR_MANAGER') return true;
    if (user.roleCode === 'EMPLOYEE') return employee.user_id === user.userId;
    if (user.roleCode !== 'MANAGER') return false;
    const manager = db.employees.find((entry) => entry.user_id === user.userId && entry.company_id === companyId);
    return Boolean(manager && manager.department_id === employee.department_id);
  };

  if (db.employee_documents.some((document) =>
    document.file_path === filePath && employeeRecordAccessible(document.employee_id, document.company_id)
  )) return true;

  if (db.message_attachments.some((attachment) => {
    if (attachment.file_path !== filePath || !hasCompanyAccess(attachment.company_id)) return false;
    const message = db.messages.find((entry) =>
      entry.id === attachment.message_id && entry.company_id === attachment.company_id
    );
    return Boolean(message && db.conversation_members.some((member) =>
      member.conversation_id === message.conversation_id &&
      member.company_id === attachment.company_id &&
      member.user_id === user.userId
    ));
  })) return true;

  return db.announcements.some((announcement) => {
    if (announcement.attachment_path !== filePath || !hasCompanyAccess(announcement.company_id)) return false;
    if (announcement.expires_at && announcement.expires_at < new Date().toISOString().slice(0, 10)) return false;
    if (announcement.audience_type === 'all') return true;
    const employee = db.employees.find((entry) =>
      entry.user_id === user.userId && entry.company_id === announcement.company_id
    );
    if (announcement.audience_type === 'department') {
      return employee?.department_id === announcement.target_department_id;
    }
    return announcement.audience_type === 'role' && user.roleCode === announcement.target_role_code;
  });
}

export function listRegistrationRequests(req: AuthenticatedRequest, res: Response): void {
  const db = loadDb();
  const cid = getScopedCompanyId(req);
  if (!cid) {
    res.status(400).json({ error: 'Entreprise requise.' });
    return;
  }
  const list = db.employee_registration_requests
    .filter((r) => r.company_id === cid)
    .map((r) => ({
      ...r,
      department_name: db.departments.find((d) => d.id === r.department_id)?.name || '-',
      position_title: db.positions.find((p) => p.id === r.position_id)?.title || '-',
    }));
  res.json({ requests: list });
}

export async function createRegistrationRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  const cid = req.user!.companyId;
  if (!cid) {
    res.status(400).json({ error: 'Entreprise requise.' });
    return;
  }

  const firstName = sanitizeText(req.body?.first_name, 100);
  const lastName = sanitizeText(req.body?.last_name, 100);
  const email = sanitizeText(req.body?.email, 160).toLowerCase();
  const matricule = sanitizeText(req.body?.matricule, 50).toUpperCase();
  const departmentId = sanitizeText(req.body?.department_id, 40);
  const positionId = sanitizeText(req.body?.position_id, 40);
  const hireDate = sanitizeText(req.body?.hire_date || new Date().toISOString().slice(0, 10), 20);

  if (!firstName || !lastName || !isValidEmail(email) || !matricule || !departmentId || !positionId || !isValidDateStr(hireDate)) {
    res.status(400).json({ error: 'Veuillez renseigner tous les champs obligatoires avec un email et une date valides.' });
    return;
  }

  const db = loadDb();
  if (db.users.some((u) => u.email.toLowerCase() === email)) {
    res.status(409).json({ error: 'Cet email professionnel existe déjà.' });
    return;
  }
  if (db.employees.some((e) => e.company_id === cid && e.matricule.toUpperCase() === matricule)) {
    res.status(409).json({ error: 'Ce matricule existe déjà dans votre entreprise.' });
    return;
  }

  const requestRecord = {
    id: newId('reg'),
    company_id: cid,
    requested_by_user_id: req.user!.userId,
    reviewed_by_user_id: null,
    first_name: firstName,
    last_name: lastName,
    email,
    phone: sanitizeText(req.body?.phone || '', 40),
    matricule,
    department_id: departmentId,
    position_id: positionId,
    manager_id: req.body?.manager_id || null,
    role_code: (['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE'].includes(req.body?.role_code)
      ? req.body.role_code
      : 'EMPLOYEE') as 'COMPANY_ADMIN' | 'HR_MANAGER' | 'MANAGER' | 'EMPLOYEE',
    contract_type: (req.body?.contract_type || 'CDI') as 'CDI' | 'CDD' | 'Stage' | 'Intérim' | 'ANAPEC' | 'Autre',
    base_salary_mad: Math.max(3000, Number(req.body?.base_salary_mad || 8000)),
    hire_date: hireDate,
    status: 'pending' as const,
    created_at: new Date().toISOString(),
  };

  await mutateDb((d) => {
    d.employee_registration_requests.unshift(requestRecord);
    logAudit(d, {
      company_id: cid,
      user_id: req.user!.userId,
      action: 'EMPLOYEE_REQUEST_CREATED',
      entity_type: 'registration_request',
      entity_id: requestRecord.id,
      details: `Demande d’ajout employé ${firstName} ${lastName} (${matricule})`,
    });
  });

  // Notify HR managers in the same company
  const hrUsers = loadDb().users.filter((u) => u.company_id === cid && u.role_code === 'HR_MANAGER' && u.is_active);
  for (const hr of hrUsers) {
    await pushNotification({
      company_id: cid,
      user_id: hr.id,
      type: 'new_employee_request',
      title: 'Nouvelle demande d’ajout employé',
      message: `${firstName} ${lastName} (${matricule}) attend votre validation RH.`,
      link_path: '/registration-requests',
    });
  }

  res.status(201).json({ request: requestRecord });
}

export async function reviewRegistrationRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const decision = req.body?.decision as 'approved' | 'rejected';
  const rejectionReason = sanitizeText(req.body?.rejection_reason || '', 400);

  if (!['approved', 'rejected'].includes(decision)) {
    res.status(400).json({ error: 'Décision invalide.' });
    return;
  }

  const db = loadDb();
  const reg = db.employee_registration_requests.find((r) => r.id === id);
  if (!reg || !assertSameCompany(req, reg.company_id)) {
    res.status(404).json({ error: 'Demande introuvable.' });
    return;
  }
  if (reg.status !== 'pending') {
    res.status(400).json({ error: 'Cette demande a déjà été traitée.' });
    return;
  }

  let tempPassword: string | null = null;
  let newEmployeeId: string | null = null;

  await mutateDb((d) => {
    const target = d.employee_registration_requests.find((r) => r.id === id)!;
    target.reviewed_by_user_id = req.user!.userId;
    target.status = decision;

    if (decision === 'rejected') {
      target.rejection_reason = rejectionReason || 'Refusé par le responsable RH';
      logAudit(d, {
        company_id: target.company_id,
        user_id: req.user!.userId,
        action: 'EMPLOYEE_REQUEST_REJECTED',
        entity_type: 'registration_request',
        entity_id: target.id,
        details: `Demande refusée pour ${target.first_name} ${target.last_name}`,
      });
      return;
    }

    // Approved: create User (must_change_password: true) + Employee + Contract + Leave Balances
    tempPassword = `Tmp${crypto.randomInt(1000, 9999)}@Hr`;
    const userId = newId('user');
    const empId = newId('emp');
    newEmployeeId = empId;
    const now = new Date().toISOString();

    d.users.push({
      id: userId,
      company_id: target.company_id,
      role_code: target.role_code,
      email: target.email,
      matricule: target.matricule,
      password_hash: bcrypt.hashSync(tempPassword, 10),
      full_name: `${target.first_name} ${target.last_name}`,
      preferred_lang: 'fr',
      theme: 'light',
      is_active: true,
      must_change_password: true,
      webauthn_credential_id: null,
      last_login_at: null,
      created_at: now,
      updated_at: now,
    });

    d.employees.push({
      id: empId,
      company_id: target.company_id,
      user_id: userId,
      matricule: target.matricule,
      first_name: target.first_name,
      last_name: target.last_name,
      email: target.email,
      phone: target.phone,
      cin: '',
      cnss_number: '',
      birth_date: null,
      gender: 'Other',
      address: 'Maroc',
      city: 'Casablanca',
      emergency_contact: '',
      photo_url: '',
      department_id: target.department_id,
      position_id: target.position_id,
      manager_id: target.manager_id,
      hire_date: target.hire_date,
      contract_type: target.contract_type,
      base_salary_mad: target.base_salary_mad,
      skills: '',
      status: 'active',
    });

    d.contracts.push({
      id: newId('ctr'),
      company_id: target.company_id,
      employee_id: empId,
      contract_type: target.contract_type,
      reference: `CTR-${target.matricule}-2026`,
      start_date: target.hire_date,
      end_date: target.contract_type === 'CDI' ? null : new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10),
      salary_mad: target.base_salary_mad,
      weekly_hours: 44,
      status: 'active',
      notes: 'Contrat initial généré lors de la validation RH.',
    });

    const leaveTypes = d.leave_types.filter((lt) => lt.company_id === target.company_id);
    for (const lt of leaveTypes) {
      d.leave_balances.push({
        id: newId('lb'),
        company_id: target.company_id,
        employee_id: empId,
        leave_type_id: lt.id,
        year: new Date().getFullYear(),
        allocated_days: lt.default_days_per_year,
        used_days: 0,
        remaining_days: lt.default_days_per_year,
      });
    }

    logAudit(d, {
      company_id: target.company_id,
      user_id: req.user!.userId,
      action: 'EMPLOYEE_ACTIVATED',
      entity_type: 'employee',
      entity_id: empId,
      details: `Compte employé activé pour ${target.first_name} ${target.last_name} (${target.matricule})`,
    });
  });

  await pushNotification({
    company_id: reg.company_id,
    user_id: reg.requested_by_user_id,
    type: 'employee_request_reviewed',
    title: decision === 'approved' ? 'Demande employé approuvée' : 'Demande employé refusée',
    message: `${reg.first_name} ${reg.last_name} (${reg.matricule}) : ${decision === 'approved' ? 'compte activé' : 'refusée'}.`,
    link_path: decision === 'approved' ? '/employees' : '/registration-requests',
  });

  res.json({ ok: true, decision, employeeId: newEmployeeId, matricule: reg.matricule, tempPassword });
}

export async function importEmployeesSpreadsheet(req: AuthenticatedRequest, res: Response): Promise<void> {
  const cid = req.user!.companyId;
  if (!cid || !req.file) {
    res.status(400).json({ error: 'Fichier CSV ou Excel requis.' });
    return;
  }

  try {
    const workbook = XLSX.readFile(req.file.path);
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet);

    let imported = 0;
    const errors: string[] = [];

    await mutateDb((db) => {
      const defaultDept = db.departments.find((d) => d.company_id === cid && !d.is_archived);
      const defaultPos = db.positions.find((p) => p.company_id === cid);
      if (!defaultDept || !defaultPos) return;

      rows.forEach((row, idx) => {
        const firstName = sanitizeText(String(row.first_name || row.prenom || row['Prénom'] || ''), 100);
        const lastName = sanitizeText(String(row.last_name || row.nom || row['Nom'] || ''), 100);
        const email = sanitizeText(String(row.email || row['Email'] || ''), 160).toLowerCase();
        const matricule = sanitizeText(String(row.matricule || row['Matricule'] || `IMP-${Date.now().toString().slice(-4)}-${idx}`), 50).toUpperCase();

        if (!firstName || !lastName || !isValidEmail(email)) {
          errors.push(`Ligne ${idx + 2}: prénom, nom ou email invalide.`);
          return;
        }
        if (db.users.some((u) => u.email.toLowerCase() === email)) {
          errors.push(`Ligne ${idx + 2}: email ${email} déjà existant.`);
          return;
        }

        const deptName = String(row.department || row['Département'] || '').toLowerCase();
        const dept = db.departments.find((d) => d.company_id === cid && d.name.toLowerCase() === deptName) || defaultDept;
        const pos = db.positions.find((p) => p.company_id === cid && p.department_id === dept.id) || defaultPos;

        db.employee_registration_requests.unshift({
          id: newId('reg'),
          company_id: cid,
          requested_by_user_id: req.user!.userId,
          reviewed_by_user_id: null,
          first_name: firstName,
          last_name: lastName,
          email,
          phone: sanitizeText(String(row.phone || row['Téléphone'] || ''), 40),
          matricule,
          department_id: dept.id,
          position_id: pos.id,
          manager_id: dept.manager_employee_id || null,
          role_code: 'EMPLOYEE',
          contract_type: 'CDI',
          base_salary_mad: Number(row.salary || row['Salaire'] || 8000) || 8000,
          hire_date: new Date().toISOString().slice(0, 10),
          status: 'pending',
          created_at: new Date().toISOString(),
        });
        imported += 1;
      });
    });

    res.json({ ok: true, imported, errors });
  } catch (err) {
    res.status(400).json({ error: `Erreur lecture fichier : ${(err as Error).message}` });
  }
}

// ======================== DEPARTMENTS & POSITIONS ========================

export function listDepartments(req: AuthenticatedRequest, res: Response): void {
  const db = loadDb();
  const cid = getScopedCompanyId(req);
  if (!cid) {
    res.status(400).json({ error: 'Entreprise requise.' });
    return;
  }

  const depts = db.departments
    .filter((d) => d.company_id === cid)
    .map((d) => {
      const emps = db.employees.filter((e) => e.company_id === cid && e.department_id === d.id && e.status !== 'archived');
      const mgr = d.manager_employee_id ? db.employees.find((e) => e.id === d.manager_employee_id) : null;
      return {
        ...d,
        employee_count: emps.length,
        manager_name: mgr ? `${mgr.first_name} ${mgr.last_name}` : 'Non assigné',
      };
    });

  const positions = db.positions.filter((p) => p.company_id === cid);
  res.json({ departments: depts, positions });
}

export async function createDepartment(req: AuthenticatedRequest, res: Response): Promise<void> {
  const cid = req.user!.companyId;
  if (!cid) {
    res.status(400).json({ error: 'Entreprise requise.' });
    return;
  }
  const name = sanitizeText(req.body?.name, 140);
  const code = sanitizeText(req.body?.code, 30).toUpperCase();
  if (!name || !code) {
    res.status(400).json({ error: 'Nom et code du département requis.' });
    return;
  }

  const dept = {
    id: newId('dept'),
    company_id: cid,
    name,
    code,
    description: sanitizeText(req.body?.description || '', 400),
    parent_department_id: req.body?.parent_department_id || null,
    manager_employee_id: req.body?.manager_employee_id || null,
    is_archived: false,
  };

  await mutateDb((db) => {
    db.departments.push(dept);
    logAudit(db, {
      company_id: cid,
      user_id: req.user!.userId,
      action: 'DEPARTMENT_CREATED',
      entity_type: 'department',
      entity_id: dept.id,
      details: `Création département ${name} (${code})`,
    });
  });

  res.status(201).json({ department: dept });
}

export async function updateDepartment(req: AuthenticatedRequest, res: Response): Promise<void> {
  const db = loadDb();
  const dept = db.departments.find((d) => d.id === req.params.id);
  if (!dept || !assertSameCompany(req, dept.company_id)) {
    res.status(404).json({ error: 'Département introuvable.' });
    return;
  }

  await mutateDb((d) => {
    const target = d.departments.find((x) => x.id === dept.id)!;
    if (req.body?.name) target.name = sanitizeText(req.body.name, 140);
    if (req.body?.description !== undefined) target.description = sanitizeText(req.body.description, 400);
    if (req.body?.manager_employee_id !== undefined) target.manager_employee_id = req.body.manager_employee_id || null;
    if (req.body?.parent_department_id !== undefined) target.parent_department_id = req.body.parent_department_id || null;
    if (req.body?.is_archived !== undefined) target.is_archived = Boolean(req.body.is_archived);
  });

  res.json({ ok: true });
}

export async function createPosition(req: AuthenticatedRequest, res: Response): Promise<void> {
  const cid = req.user!.companyId;
  if (!cid) {
    res.status(400).json({ error: 'Entreprise requise.' });
    return;
  }
  const title = sanitizeText(req.body?.title, 140);
  const departmentId = sanitizeText(req.body?.department_id, 40);
  if (!title || !departmentId) {
    res.status(400).json({ error: 'Intitulé du poste et département requis.' });
    return;
  }

  const pos = {
    id: newId('pos'),
    company_id: cid,
    department_id: departmentId,
    title,
    level: sanitizeText(req.body?.level || 'Confirmé', 50),
    base_salary_min: Number(req.body?.base_salary_min || 6000),
    base_salary_max: Number(req.body?.base_salary_max || 15000),
  };

  await mutateDb((db) => {
    db.positions.push(pos);
  });

  res.status(201).json({ position: pos });
}
