import { Response } from 'express';
import { loadDb, mutateDb, newId, logAudit } from '../repositories/dataStore.js';
import { AuthenticatedRequest, assertSameCompany, getScopedCompanyId } from '../middlewares/auth.js';
import { isValidDateStr, isValidTimeStr, sanitizeText } from '../validators/validators.js';
import { getCompanyOnlineUserIds, getRealtimeIo, pushNotification } from '../services/realtimeService.js';
import { generateScheduleSuggestionWithAi } from '../services/geminiService.js';

// ======================== CONTRACTS ========================

export function listContracts(req: AuthenticatedRequest, res: Response): void {
  const db = loadDb();
  const cid = getScopedCompanyId(req);
  if (!cid) {
    res.status(400).json({ error: 'Entreprise requise.' });
    return;
  }

  const myEmp = db.employees.find((e) => e.user_id === req.user?.userId && e.company_id === cid);
  let contracts = db.contracts.filter((c) => c.company_id === cid);
  if (req.user?.roleCode === 'EMPLOYEE' && myEmp) {
    contracts = contracts.filter((c) => c.employee_id === myEmp.id);
  }

  const enriched = contracts.map((c) => {
    const emp = db.employees.find((e) => e.id === c.employee_id);
    const dept = emp ? db.departments.find((d) => d.id === emp.department_id) : null;
    const daysRemaining = c.end_date ? Math.ceil((Date.parse(c.end_date) - Date.now()) / 86400000) : null;
    let computedStatus = c.status;
    if (c.status !== 'archived' && c.status !== 'renewed' && daysRemaining !== null) {
      if (daysRemaining < 0) computedStatus = 'expired';
      else if (daysRemaining <= 30) computedStatus = 'expiring_soon';
    }
    return {
      ...c,
      status: computedStatus,
      days_remaining: daysRemaining,
      employee_name: emp ? `${emp.first_name} ${emp.last_name}` : c.employee_id,
      matricule: emp?.matricule || '-',
      department_name: dept?.name || '-',
    };
  });

  res.json({
    contracts: enriched,
    alerts: {
      days7: enriched.filter((c) => c.days_remaining !== null && c.days_remaining >= 0 && c.days_remaining <= 7 && c.status !== 'archived'),
      days15: enriched.filter((c) => c.days_remaining !== null && c.days_remaining > 7 && c.days_remaining <= 15 && c.status !== 'archived'),
      days30: enriched.filter((c) => c.days_remaining !== null && c.days_remaining > 15 && c.days_remaining <= 30 && c.status !== 'archived'),
    },
  });
}

export async function createOrRenewContract(req: AuthenticatedRequest, res: Response): Promise<void> {
  const cid = req.user!.companyId;
  if (!cid) {
    res.status(400).json({ error: 'Entreprise requise.' });
    return;
  }

  const employeeId = sanitizeText(req.body?.employee_id, 50);
  const contractType = (req.body?.contract_type || 'CDI') as 'CDI' | 'CDD' | 'Stage' | 'Intérim' | 'ANAPEC' | 'Autre';
  const startDate = sanitizeText(req.body?.start_date, 20);
  const endDate = req.body?.end_date ? sanitizeText(req.body.end_date, 20) : null;
  const salaryMad = Number(req.body?.salary_mad || 8000);

  if (!employeeId || !isValidDateStr(startDate) || salaryMad <= 0) {
    res.status(400).json({ error: 'Employé, date de début et salaire valides requis.' });
    return;
  }

  const db = loadDb();
  const emp = db.employees.find((e) => e.id === employeeId && e.company_id === cid);
  if (!emp) {
    res.status(404).json({ error: 'Employé introuvable.' });
    return;
  }

  const ctr = {
    id: newId('ctr'),
    company_id: cid,
    employee_id: employeeId,
    contract_type: contractType,
    reference: `CTR-${emp.matricule}-${Date.now().toString().slice(-4)}`,
    start_date: startDate,
    end_date: contractType === 'CDI' ? null : endDate,
    salary_mad: salaryMad,
    weekly_hours: Number(req.body?.weekly_hours || 44),
    status: 'active' as const,
    notes: sanitizeText(req.body?.notes || '', 400),
  };

  await mutateDb((d) => {
    if (req.body?.renewFromContractId) {
      const old = d.contracts.find((c) => c.id === req.body.renewFromContractId && c.company_id === cid);
      if (old) old.status = 'renewed';
    }
    d.contracts.unshift(ctr);
    const targetEmp = d.employees.find((e) => e.id === employeeId);
    if (targetEmp) {
      targetEmp.contract_type = contractType;
      targetEmp.base_salary_mad = salaryMad;
    }
    logAudit(d, {
      company_id: cid,
      user_id: req.user!.userId,
      action: 'CONTRACT_CREATED',
      entity_type: 'contract',
      entity_id: ctr.id,
      details: `Contrat ${ctr.reference} (${contractType}) pour ${emp.matricule}`,
    });
  });

  res.status(201).json({ contract: ctr });
}

export async function archiveContract(req: AuthenticatedRequest, res: Response): Promise<void> {
  const db = loadDb();
  const ctr = db.contracts.find((c) => c.id === req.params.id);
  if (!ctr || !assertSameCompany(req, ctr.company_id)) {
    res.status(404).json({ error: 'Contrat introuvable.' });
    return;
  }
  await mutateDb((d) => {
    const target = d.contracts.find((c) => c.id === ctr.id)!;
    target.status = 'archived';
  });
  res.json({ ok: true });
}

// ======================== PAYROLL & PAYSLIPS ========================

export function listPayrolls(req: AuthenticatedRequest, res: Response): void {
  const db = loadDb();
  const cid = getScopedCompanyId(req);
  if (!cid) {
    res.status(400).json({ error: 'Entreprise requise.' });
    return;
  }

  const myEmp = db.employees.find((e) => e.user_id === req.user?.userId && e.company_id === cid);

  if (req.user?.roleCode === 'EMPLOYEE' && myEmp) {
    const myPayslips = db.payslips
      .filter((ps) => ps.company_id === cid && ps.employee_id === myEmp.id)
      .map((ps) => {
        const item = db.payroll_items.find((pi) => pi.id === ps.payroll_item_id);
        return {
          ...ps,
          employee_name: `${myEmp.first_name} ${myEmp.last_name}`,
          matricule: myEmp.matricule,
          item,
        };
      });
    res.json({ payrolls: [], payslips: myPayslips, settings: db.company_settings.find((s) => s.company_id === cid) });
    return;
  }

  const payrolls = db.payrolls
    .filter((p) => p.company_id === cid)
    .map((p) => ({
      ...p,
      items: db.payroll_items
        .filter((pi) => pi.payroll_id === p.id)
        .map((pi) => {
          const emp = db.employees.find((e) => e.id === pi.employee_id);
          const dept = emp ? db.departments.find((d) => d.id === emp.department_id) : null;
          return {
            ...pi,
            employee_name: emp ? `${emp.first_name} ${emp.last_name}` : pi.employee_id,
            matricule: emp?.matricule || '-',
            department_name: dept?.name || '-',
          };
        }),
    }))
    .sort((a, b) => b.period_year * 100 + b.period_month - (a.period_year * 100 + a.period_month));

  const payslips = db.payslips
    .filter((ps) => ps.company_id === cid)
    .map((ps) => {
      const emp = db.employees.find((e) => e.id === ps.employee_id);
      const item = db.payroll_items.find((pi) => pi.id === ps.payroll_item_id);
      return {
        ...ps,
        employee_name: emp ? `${emp.first_name} ${emp.last_name}` : ps.employee_id,
        matricule: emp?.matricule || '-',
        item,
      };
    });

  res.json({ payrolls, payslips, settings: db.company_settings.find((s) => s.company_id === cid) });
}

export async function generateMonthlyPayroll(req: AuthenticatedRequest, res: Response): Promise<void> {
  const cid = req.user!.companyId;
  if (!cid) {
    res.status(400).json({ error: 'Entreprise requise.' });
    return;
  }

  const month = Number(req.body?.month || new Date().getMonth() + 1);
  const year = Number(req.body?.year || new Date().getFullYear());
  if (month < 1 || month > 12 || year < 2020) {
    res.status(400).json({ error: 'Période de paie invalide.' });
    return;
  }

  const db = loadDb();
  if (db.payrolls.some((p) => p.company_id === cid && p.period_month === month && p.period_year === year)) {
    res.status(409).json({ error: `Une paie existe déjà pour ${String(month).padStart(2, '0')}/${year}.` });
    return;
  }

  const settings = db.company_settings.find((s) => s.company_id === cid);
  const contribRate = settings?.payroll_contribution_rate ?? 0;
  const taxRate = settings?.payroll_tax_rate ?? 0;
  const overtimeMult = settings?.overtime_multiplier ?? 1.25;
  const activeEmps = db.employees.filter((e) => e.company_id === cid && e.status === 'active');

  const payrollId = newId('pay');
  let totalGross = 0;
  let totalNet = 0;

  await mutateDb((d) => {
    for (const emp of activeEmps) {
      const otMinutes = d.attendance_records
        .filter((a) => a.company_id === cid && a.employee_id === emp.id)
        .reduce((acc, a) => acc + a.overtime_minutes, 0);
      const hourlyRate = emp.base_salary_mad / 191;
      const overtimePay = Number(((otMinutes / 60) * hourlyRate * overtimeMult).toFixed(2));
      const bonuses = Number(req.body?.defaultBonus || 0);
      const allowances = 500;
      const gross = Number((emp.base_salary_mad + bonuses + allowances + overtimePay).toFixed(2));
      const configuredContrib = Number(((gross * (contribRate + taxRate)) / 100).toFixed(2));
      const net = Number((gross - configuredContrib).toFixed(2));

      totalGross += gross;
      totalNet += net;

      d.payroll_items.push({
        id: newId('pi'),
        company_id: cid,
        payroll_id: payrollId,
        employee_id: emp.id,
        base_salary: emp.base_salary_mad,
        bonuses,
        overtime_pay: overtimePay,
        allowances,
        deductions: 0,
        configured_contributions: configuredContrib,
        gross_salary: gross,
        net_salary: net,
      });
    }

    d.payrolls.unshift({
      id: payrollId,
      company_id: cid,
      period_month: month,
      period_year: year,
      currency: settings?.currency || 'MAD',
      status: 'draft',
      total_gross: Number(totalGross.toFixed(2)),
      total_net: Number(totalNet.toFixed(2)),
      validated_at: null,
    });
  });

  res.status(201).json({ payrollId });
}

export async function validatePayroll(req: AuthenticatedRequest, res: Response): Promise<void> {
  const db = loadDb();
  const pr = db.payrolls.find((p) => p.id === req.params.id);
  if (!pr || !assertSameCompany(req, pr.company_id)) {
    res.status(404).json({ error: 'Lot de paie introuvable.' });
    return;
  }
  if (pr.status === 'validated') {
    res.status(400).json({ error: 'Cette paie est déjà validée.' });
    return;
  }

  const now = new Date().toISOString();
  const periodLabel = `${String(pr.period_month).padStart(2, '0')}/${pr.period_year}`;
  const items = db.payroll_items.filter((pi) => pi.payroll_id === pr.id);

  await mutateDb((d) => {
    const target = d.payrolls.find((p) => p.id === pr.id)!;
    target.status = 'validated';
    target.validated_at = now;

    for (const item of items) {
      const emp = d.employees.find((e) => e.id === item.employee_id);
      d.payslips.unshift({
        id: newId('ps'),
        company_id: pr.company_id,
        payroll_item_id: item.id,
        employee_id: item.employee_id,
        period_label: periodLabel,
        reference: `BUL-${emp?.matricule || item.employee_id}-${pr.period_year}${String(pr.period_month).padStart(2, '0')}`,
        issued_at: now,
      });
    }

    logAudit(d, {
      company_id: pr.company_id,
      user_id: req.user!.userId,
      action: 'PAYROLL_VALIDATED',
      entity_type: 'payroll',
      entity_id: pr.id,
      details: `Validation paie ${periodLabel} (${items.length} bulletins émis)`,
    });
  });

  for (const item of items) {
    const emp = db.employees.find((e) => e.id === item.employee_id);
    if (emp?.user_id) {
      await pushNotification({
        company_id: pr.company_id,
        user_id: emp.user_id,
        type: 'payslip_ready',
        title: 'Nouveau bulletin de paie disponible',
        message: `Votre bulletin de paie de ${periodLabel} est disponible au téléchargement.`,
        link_path: '/payroll',
      });
    }
  }

  res.json({ ok: true });
}

// ======================== ANNOUNCEMENTS ========================

export function listAnnouncements(req: AuthenticatedRequest, res: Response): void {
  const db = loadDb();
  const cid = getScopedCompanyId(req);
  if (!cid) {
    res.status(400).json({ error: 'Entreprise requise.' });
    return;
  }

  const myEmp = db.employees.find((e) => e.user_id === req.user?.userId && e.company_id === cid);
  const role = req.user!.roleCode;
  const today = new Date().toISOString().slice(0, 10);

  const list = db.announcements
    .filter((a) => a.company_id === cid)
    .filter((a) => !a.expires_at || a.expires_at >= today || role === 'HR_MANAGER' || role === 'COMPANY_ADMIN')
    .filter((a) => {
      if (role === 'COMPANY_ADMIN' || role === 'HR_MANAGER') return true;
      if (a.audience_type === 'all') return true;
      if (a.audience_type === 'department') return a.target_department_id === myEmp?.department_id;
      if (a.audience_type === 'role') return a.target_role_code === role;
      return false;
    })
    .map((a) => ({
      ...a,
      comments: db.announcement_comments.filter((c) => c.announcement_id === a.id && !c.is_moderated),
    }))
    .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || b.created_at.localeCompare(a.created_at));

  res.json({ announcements: list });
}

export async function createAnnouncement(req: AuthenticatedRequest, res: Response): Promise<void> {
  const cid = req.user!.companyId;
  if (!cid) {
    res.status(400).json({ error: 'Entreprise requise.' });
    return;
  }
  const title = sanitizeText(req.body?.title, 200);
  const content = sanitizeText(req.body?.content, 3000);
  if (!title || !content) {
    res.status(400).json({ error: 'Titre et contenu requis.' });
    return;
  }

  const db = loadDb();
  const author = db.users.find((u) => u.id === req.user!.userId);
  const ann = {
    id: newId('ann'),
    company_id: cid,
    author_user_id: req.user!.userId,
    author_name: author?.full_name || 'Direction RH',
    title,
    content,
    category: (req.body?.category || 'general') as 'general' | 'hr' | 'operations' | 'urgent' | 'event',
    audience_type: (req.body?.audience_type || 'all') as 'all' | 'department' | 'role',
    target_department_id: req.body?.target_department_id || null,
    target_role_code: req.body?.target_role_code || null,
    is_pinned: req.body?.is_pinned === true || req.body?.is_pinned === 'true' || req.body?.is_pinned === 1 || req.body?.is_pinned === '1',
    attachment_path: req.file ? `/api/uploads/${req.file.filename}` : null,
    expires_at: req.body?.expires_at || null,
    created_at: new Date().toISOString(),
  };

  await mutateDb((d) => {
    d.announcements.unshift(ann);
  });

  // Notify targeted users
  const targetUsers = db.users.filter((u) => u.company_id === cid && u.id !== req.user!.userId && u.is_active);
  for (const u of targetUsers.slice(0, 30)) {
    await pushNotification({
      company_id: cid,
      user_id: u.id,
      type: 'announcement',
      title: `Nouvelle annonce : ${title}`,
      message: content.slice(0, 120),
      link_path: '/announcements',
    });
  }

  res.status(201).json({ announcement: ann });
}

export async function togglePinAnnouncement(req: AuthenticatedRequest, res: Response): Promise<void> {
  const db = loadDb();
  const ann = db.announcements.find((a) => a.id === req.params.id);
  if (!ann || !assertSameCompany(req, ann.company_id)) {
    res.status(404).json({ error: 'Annonce introuvable.' });
    return;
  }
  await mutateDb((d) => {
    const target = d.announcements.find((a) => a.id === ann.id)!;
    target.is_pinned = !target.is_pinned;
  });
  res.json({ ok: true });
}

export async function deleteAnnouncement(req: AuthenticatedRequest, res: Response): Promise<void> {
  const db = loadDb();
  const ann = db.announcements.find((a) => a.id === req.params.id);
  if (!ann || !assertSameCompany(req, ann.company_id)) {
    res.status(404).json({ error: 'Annonce introuvable.' });
    return;
  }
  await mutateDb((d) => {
    d.announcements = d.announcements.filter((a) => a.id !== ann.id);
    d.announcement_comments = d.announcement_comments.filter((c) => c.announcement_id !== ann.id);
  });
  res.json({ ok: true });
}

export async function addAnnouncementComment(req: AuthenticatedRequest, res: Response): Promise<void> {
  const db = loadDb();
  const ann = db.announcements.find((a) => a.id === req.params.id);
  if (!ann || !assertSameCompany(req, ann.company_id)) {
    res.status(404).json({ error: 'Annonce introuvable.' });
    return;
  }
  const content = sanitizeText(req.body?.content, 800);
  if (!content) {
    res.status(400).json({ error: 'Commentaire vide.' });
    return;
  }
  const user = db.users.find((u) => u.id === req.user!.userId);
  const comment = {
    id: newId('acomm'),
    company_id: ann.company_id,
    announcement_id: ann.id,
    user_id: req.user!.userId,
    user_name: user?.full_name || 'Utilisateur',
    content,
    is_moderated: false,
    created_at: new Date().toISOString(),
  };
  await mutateDb((d) => {
    d.announcement_comments.push(comment);
  });
  res.status(201).json({ comment });
}

export async function deleteAnnouncementComment(req: AuthenticatedRequest, res: Response): Promise<void> {
  const db = loadDb();
  const comm = db.announcement_comments.find((c) => c.id === req.params.commentId);
  if (!comm || !assertSameCompany(req, comm.company_id)) {
    res.status(404).json({ error: 'Commentaire introuvable.' });
    return;
  }
  const isMod = ['HR_MANAGER', 'COMPANY_ADMIN'].includes(req.user!.roleCode);
  if (comm.user_id !== req.user!.userId && !isMod) {
    res.status(403).json({ error: 'Non autorisé.' });
    return;
  }
  await mutateDb((d) => {
    d.announcement_comments = d.announcement_comments.filter((c) => c.id !== comm.id);
  });
  res.json({ ok: true });
}

// ======================== MEETINGS ========================

export function listMeetings(req: AuthenticatedRequest, res: Response): void {
  const db = loadDb();
  const cid = getScopedCompanyId(req);
  if (!cid) {
    res.status(400).json({ error: 'Entreprise requise.' });
    return;
  }
  const myEmp = db.employees.find((e) => e.user_id === req.user?.userId && e.company_id === cid);
  let meetings = db.meetings.filter((m) => m.company_id === cid);

  if (req.user?.roleCode === 'EMPLOYEE' && myEmp) {
    meetings = meetings.filter((m) => m.participant_ids.includes(myEmp.id) || m.organizer_user_id === req.user!.userId);
  }

  const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
  const enriched = meetings.map((m) => ({
    ...m,
    department_name: m.department_id ? db.departments.find((d) => d.id === m.department_id)?.name : 'Toute l’entreprise',
    participant_names: m.participant_ids.map((id) => {
      const emp = db.employees.find((e) => e.id === id);
      return emp ? `${emp.first_name} ${emp.last_name}` : id;
    }),
    email_delivery_status: smtpConfigured ? 'Invitations email prêtes (SMTP actif)' : 'Notifications internes actives (service email SMTP non configuré)',
  }));

  res.json({ meetings: enriched, smtpConfigured });
}

export async function createMeeting(req: AuthenticatedRequest, res: Response): Promise<void> {
  const cid = req.user!.companyId;
  if (!cid) {
    res.status(400).json({ error: 'Entreprise requise.' });
    return;
  }

  const title = sanitizeText(req.body?.title, 180);
  const date = sanitizeText(req.body?.date, 20);
  const startTime = sanitizeText(req.body?.start_time, 10);
  const endTime = sanitizeText(req.body?.end_time, 10);

  if (!title || !isValidDateStr(date) || !isValidTimeStr(startTime) || !isValidTimeStr(endTime)) {
    res.status(400).json({ error: 'Titre, date et heures de réunion valides requis.' });
    return;
  }

  const db = loadDb();
  const org = db.users.find((u) => u.id === req.user!.userId);
  const participantIds = Array.isArray(req.body?.participant_ids) ? (req.body.participant_ids as string[]) : [];

  const meeting = {
    id: newId('meet'),
    company_id: cid,
    organizer_user_id: req.user!.userId,
    organizer_name: org?.full_name || 'Organisateur',
    department_id: req.body?.department_id || null,
    title,
    description: sanitizeText(req.body?.description || '', 800),
    date,
    start_time: startTime,
    end_time: endTime,
    location: sanitizeText(req.body?.location || 'Salle principale', 200),
    meeting_type: (req.body?.meeting_type || 'in_person') as 'in_person' | 'google_meet' | 'zoom' | 'teams' | 'hybrid',
    video_link: req.body?.video_link ? sanitizeText(req.body.video_link, 500) : null,
    status: 'scheduled' as const,
    participant_ids: participantIds,
  };

  await mutateDb((d) => {
    d.meetings.unshift(meeting);
    d.calendar_events.unshift({
      id: newId('ce'),
      company_id: cid,
      event_type: 'meeting',
      reference_id: meeting.id,
      title: meeting.title,
      start_datetime: `${date}T${startTime}:00`,
      end_datetime: `${date}T${endTime}:00`,
    });
  });

  for (const empId of participantIds) {
    const emp = db.employees.find((e) => e.id === empId);
    if (emp?.user_id) {
      await pushNotification({
        company_id: cid,
        user_id: emp.user_id,
        type: 'meeting',
        title: `Invitation réunion : ${title}`,
        message: `${date} de ${startTime} à ${endTime} (${meeting.location}).`,
        link_path: '/meetings',
      });
    }
  }

  res.status(201).json({ meeting });
}

export async function cancelMeeting(req: AuthenticatedRequest, res: Response): Promise<void> {
  const db = loadDb();
  const m = db.meetings.find((x) => x.id === req.params.id);
  if (!m || !assertSameCompany(req, m.company_id)) {
    res.status(404).json({ error: 'Réunion introuvable.' });
    return;
  }
  await mutateDb((d) => {
    const target = d.meetings.find((x) => x.id === m.id)!;
    target.status = 'cancelled';
  });
  for (const empId of m.participant_ids) {
    const emp = db.employees.find((e) => e.id === empId);
    if (emp?.user_id) {
      await pushNotification({
        company_id: m.company_id,
        user_id: emp.user_id,
        type: 'meeting_cancelled',
        title: `Réunion annulée : ${m.title}`,
        message: `La réunion prévue le ${m.date} à ${m.start_time} a été annulée.`,
        link_path: '/meetings',
      });
    }
  }
  res.json({ ok: true });
}

// ======================== MESSAGING (SOCKET.IO) ========================

export function listMessagingWorkspace(req: AuthenticatedRequest, res: Response): void {
  const db = loadDb();
  const cid = req.user!.companyId;
  if (!cid) {
    res.json({ colleagues: [], conversations: [], onlineUserIds: [] });
    return;
  }

  const colleagues = db.users
    .filter((u) => u.company_id === cid && u.is_active && u.id !== req.user!.userId)
    .map((u) => {
      const emp = db.employees.find((e) => e.user_id === u.id);
      const dept = emp ? db.departments.find((d) => d.id === emp.department_id) : null;
      return {
        user_id: u.id,
        full_name: u.full_name,
        role_code: u.role_code,
        department_name: dept?.name || '-',
        matricule: u.matricule,
      };
    });

  const myMemberships = db.conversation_members.filter((cm) => cm.company_id === cid && cm.user_id === req.user!.userId);
  const convIds = new Set(myMemberships.map((m) => m.conversation_id));

  const conversations = db.conversations
    .filter((c) => c.company_id === cid && convIds.has(c.id))
    .map((c) => {
      const members = db.conversation_members.filter((m) => m.conversation_id === c.id);
      const otherMember = members.find((m) => m.user_id !== req.user!.userId);
      const otherUser = otherMember ? db.users.find((u) => u.id === otherMember.user_id) : null;
      const msgs = db.messages.filter((msg) => msg.conversation_id === c.id);
      const myMem = members.find((m) => m.user_id === req.user!.userId);
      const unreadCount = msgs.filter(
        (m) => m.sender_user_id !== req.user!.userId && (!myMem?.last_read_at || m.created_at > myMem.last_read_at)
      ).length;
      const lastMsg = msgs[msgs.length - 1] || null;
      return {
        id: c.id,
        peer_user_id: otherUser?.id || null,
        peer_name: otherUser?.full_name || c.title || 'Discussion',
        peer_role: otherUser?.role_code || '',
        unread_count: unreadCount,
        last_message: lastMsg,
      };
    });

  res.json({
    colleagues,
    conversations,
    onlineUserIds: getCompanyOnlineUserIds(cid),
  });
}

export async function getOrCreatePrivateConversation(req: AuthenticatedRequest, res: Response): Promise<void> {
  const cid = req.user!.companyId;
  const peerUserId = sanitizeText(req.body?.peerUserId, 60);
  if (!cid || !peerUserId) {
    res.status(400).json({ error: 'Destinataire invalide.' });
    return;
  }

  const db = loadDb();
  const peer = db.users.find((u) => u.id === peerUserId && u.company_id === cid && u.is_active);
  if (!peer) {
    res.status(404).json({ error: 'Collègue introuvable dans votre entreprise.' });
    return;
  }

  const existingConv = db.conversations.find((c) => {
    if (c.company_id !== cid || c.is_group) return false;
    const mems = db.conversation_members.filter((m) => m.conversation_id === c.id).map((m) => m.user_id);
    return mems.includes(req.user!.userId) && mems.includes(peerUserId);
  });

  if (existingConv) {
    res.json({ conversationId: existingConv.id });
    return;
  }

  const convId = newId('conv');
  const now = new Date().toISOString();
  await mutateDb((d) => {
    d.conversations.push({ id: convId, company_id: cid, is_group: false, title: null, created_at: now });
    d.conversation_members.push(
      { id: newId('cm'), company_id: cid, conversation_id: convId, user_id: req.user!.userId, last_read_at: now },
      { id: newId('cm'), company_id: cid, conversation_id: convId, user_id: peerUserId, last_read_at: null }
    );
  });

  res.status(201).json({ conversationId: convId });
}

export async function getConversationMessages(req: AuthenticatedRequest, res: Response): Promise<void> {
  const cid = req.user!.companyId;
  const convId = req.params.id;
  const db = loadDb();
  const isMember = db.conversation_members.some(
    (m) => m.conversation_id === convId && m.user_id === req.user!.userId && m.company_id === cid
  );
  if (!isMember) {
    res.status(403).json({ error: 'Accès non autorisé à cette conversation.' });
    return;
  }

  await mutateDb((d) => {
    const mem = d.conversation_members.find((m) => m.conversation_id === convId && m.user_id === req.user!.userId);
    if (mem) mem.last_read_at = new Date().toISOString();
  });

  const msgs = loadDb().messages.filter((m) => m.conversation_id === convId && m.company_id === cid);
  res.json({ messages: msgs });
}

export async function sendChatMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
  const cid = req.user!.companyId;
  const convId = req.params.id;
  const content = sanitizeText(req.body?.content || '', 2000);
  if (!cid || (!content && !req.file)) {
    res.status(400).json({ error: 'Message ou pièce jointe requis.' });
    return;
  }

  const db = loadDb();
  const members = db.conversation_members.filter((m) => m.conversation_id === convId && m.company_id === cid);
  if (!members.some((m) => m.user_id === req.user!.userId)) {
    res.status(403).json({ error: 'Accès refusé à cette conversation.' });
    return;
  }

  const sender = db.users.find((u) => u.id === req.user!.userId);
  const msg = {
    id: newId('msg'),
    company_id: cid,
    conversation_id: convId,
    sender_user_id: req.user!.userId,
    sender_name: sender?.full_name || 'Collègue',
    reply_to_message_id: req.body?.reply_to_message_id || null,
    content: content || (req.file ? `Pièce jointe : ${req.file.originalname}` : ''),
    is_edited: false,
    is_deleted: false,
    attachment: req.file
      ? { file_name: req.file.originalname, file_path: `/api/uploads/${req.file.filename}`, mime_type: req.file.mimetype }
      : null,
    created_at: new Date().toISOString(),
  };

  await mutateDb((d) => {
    d.messages.push(msg);
    const myMem = d.conversation_members.find((m) => m.conversation_id === convId && m.user_id === req.user!.userId);
    if (myMem) myMem.last_read_at = msg.created_at;
  });

  const io = getRealtimeIo();
  for (const m of members) {
    io?.to(`user:${m.user_id}`).emit('chat:message', msg);
    if (m.user_id !== req.user!.userId) {
      await pushNotification({
        company_id: cid,
        user_id: m.user_id,
        type: 'message',
        title: `Nouveau message de ${sender?.full_name}`,
        message: msg.content.slice(0, 100),
        link_path: '/messages',
      });
    }
  }

  res.status(201).json({ message: msg });
}

export async function editOrDeleteChatMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { messageId } = req.params;
  const db = loadDb();
  const msg = db.messages.find((m) => m.id === messageId && m.company_id === req.user!.companyId);
  if (!msg || msg.sender_user_id !== req.user!.userId) {
    res.status(403).json({ error: 'Impossible de modifier ce message.' });
    return;
  }

  let updated = msg;
  await mutateDb((d) => {
    const target = d.messages.find((m) => m.id === messageId)!;
    if (req.method === 'DELETE') {
      target.is_deleted = true;
      target.content = 'Message supprimé';
    } else if (req.body?.content) {
      target.content = sanitizeText(req.body.content, 2000);
      target.is_edited = true;
    }
    updated = target;
  });

  const members = loadDb().conversation_members.filter((m) => m.conversation_id === msg.conversation_id);
  const io = getRealtimeIo();
  for (const m of members) {
    io?.to(`user:${m.user_id}`).emit('chat:updated', updated);
  }

  res.json({ message: updated });
}

// ======================== NOTIFICATIONS ========================

export function listNotifications(req: AuthenticatedRequest, res: Response): void {
  const db = loadDb();
  const items = db.notifications
    .filter((n) => n.user_id === req.user!.userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const prefs = db.notification_preferences.find((p) => p.user_id === req.user!.userId) || {
    user_id: req.user!.userId,
    email_enabled: true,
    realtime_enabled: true,
    leave_updates: true,
    message_alerts: true,
    meeting_alerts: true,
  };
  res.json({ notifications: items, unreadCount: items.filter((n) => !n.is_read).length, preferences: prefs });
}

export async function markNotificationRead(req: AuthenticatedRequest, res: Response): Promise<void> {
  await mutateDb((d) => {
    if (req.params.id === 'all') {
      d.notifications.forEach((n) => {
        if (n.user_id === req.user!.userId) n.is_read = true;
      });
    } else {
      const n = d.notifications.find((x) => x.id === req.params.id && x.user_id === req.user!.userId);
      if (n) n.is_read = true;
    }
  });
  res.json({ ok: true });
}

export async function saveNotificationPreferences(req: AuthenticatedRequest, res: Response): Promise<void> {
  await mutateDb((d) => {
    const idx = d.notification_preferences.findIndex((p) => p.user_id === req.user!.userId);
    const prefs = {
      user_id: req.user!.userId,
      email_enabled: Boolean(req.body?.email_enabled),
      realtime_enabled: Boolean(req.body?.realtime_enabled),
      leave_updates: Boolean(req.body?.leave_updates),
      message_alerts: Boolean(req.body?.message_alerts),
      meeting_alerts: Boolean(req.body?.meeting_alerts),
    };
    if (idx >= 0) d.notification_preferences[idx] = prefs;
    else d.notification_preferences.push(prefs);
  });
  res.json({ ok: true });
}

// ======================== GEMINI AI ASSISTANT, ANALYTICS & SCHEDULE ========================

export function getAiAnalytics(req: AuthenticatedRequest, res: Response): void {
  const db = loadDb();
  const cid = getScopedCompanyId(req);
  if (!cid) {
    res.status(400).json({ error: 'Entreprise requise.' });
    return;
  }

  const myEmp = db.employees.find((e) => e.user_id === req.user?.userId && e.company_id === cid);
  const scopeDeptId = req.user?.roleCode === 'MANAGER' ? myEmp?.department_id : null;
  const emps = db.employees.filter((e) => e.company_id === cid && e.status !== 'archived' && (!scopeDeptId || e.department_id === scopeDeptId));
  const empIds = new Set(emps.map((e) => e.id));

  const att = db.attendance_records.filter((a) => a.company_id === cid && empIds.has(a.employee_id));
  const dates = Array.from(new Set(att.map((a) => a.date))).sort();
  const sufficientHistoryForForecast = dates.length >= 30;

  const deptAnalytics = db.departments
    .filter((d) => d.company_id === cid && !d.is_archived && (!scopeDeptId || d.id === scopeDeptId))
    .map((d) => {
      const dEmps = emps.filter((e) => e.department_id === d.id);
      const dIds = new Set(dEmps.map((e) => e.id));
      const dAtt = att.filter((a) => dIds.has(a.employee_id));
      const absents = dAtt.filter((a) => a.status === 'absent').length;
      const lates = dAtt.filter((a) => a.status === 'late').length;
      const otHours = Math.round(dAtt.reduce((acc, a) => acc + a.overtime_minutes, 0) / 60);
      const taskHours = db.tasks.filter((t) => t.company_id === cid && t.department_id === d.id && t.status !== 'done').reduce((acc, t) => acc + t.estimated_hours, 0);
      const capacity = dEmps.length * 44;
      return {
        department: d.name,
        headcount: dEmps.length,
        absenteeismRate: dAtt.length ? Math.round((absents / dAtt.length) * 1000) / 10 : 0,
        lateRate: dAtt.length ? Math.round((lates / dAtt.length) * 1000) / 10 : 0,
        overtimeHours: otHours,
        workloadRatio: capacity ? Math.round((taskHours / capacity) * 100) : 0,
      };
    });

  // Anomaly detection (strictly operational non-protected indicators)
  const anomalies: Array<{ type: string; department: string; detail: string; severity: 'info' | 'warning' }> = [];
  deptAnalytics.forEach((da) => {
    if (da.absenteeismRate > 12) {
      anomalies.push({
        type: 'Pic d’absentéisme non planifié',
        department: da.department,
        detail: `Taux observé de ${da.absenteeismRate}% sur la période (hors congés maladie/maternité protégés).`,
        severity: 'warning',
      });
    }
    if (da.workloadRatio > 40) {
      anomalies.push({
        type: 'Tension de charge de travail',
        department: da.department,
        detail: `${da.workloadRatio}% de la capacité hebdomadaire déjà engagée en tâches actives.`,
        severity: 'warning',
      });
    }
  });

  const trendSeries = dates.map((dt) => {
    const dayRecs = att.filter((a) => a.date === dt);
    return {
      date: dt.slice(5),
      absences: dayRecs.filter((r) => r.status === 'absent').length,
      retards: dayRecs.filter((r) => r.status === 'late').length,
      overtimeHours: Math.round((dayRecs.reduce((acc, r) => acc + r.overtime_minutes, 0) / 60) * 10) / 10,
    };
  });

  res.json({
    daysObserved: dates.length,
    sufficientHistoryForForecast,
    forecastNotice: sufficientHistoryForForecast
      ? 'Prévision statistique basée sur plus de 30 jours d’historique.'
      : `Historique actuel : ${dates.length} jours enregistrés. Au moins 30 jours d’historique continu sont requis pour une prévision fiable des besoins en personnel.`,
    ethicalNotice:
      'Aide à la décision uniquement : les congés maladie, maternité et absences protégées ne sont jamais utilisés comme critères négatifs de performance. Aucune décision disciplinaire ou salariale n’est automatisée.',
    deptAnalytics,
    anomalies,
    trendSeries,
  });
}

export async function suggestScheduleAi(req: AuthenticatedRequest, res: Response): Promise<void> {
  const cid = req.user!.companyId;
  const departmentId = sanitizeText(req.body?.department_id, 50);
  const weekStart = sanitizeText(req.body?.week_start || new Date().toISOString().slice(0, 10), 20);
  if (!cid || !departmentId || !isValidDateStr(weekStart)) {
    res.status(400).json({ error: 'Département et date de début de semaine requis.' });
    return;
  }

  const db = loadDb();
  const suggestion = await generateScheduleSuggestionWithAi({ db, companyId: cid, departmentId, weekStart });
  const id = newId('aisug');

  const record = {
    id,
    company_id: cid,
    department_id: departmentId,
    week_start: weekStart,
    created_by_user_id: req.user!.userId,
    status: 'pending' as const,
    rationale: suggestion.rationale,
    assignments: suggestion.assignments,
    created_at: new Date().toISOString(),
  };

  await mutateDb((d) => {
    d.ai_schedule_suggestions.unshift(record);
  });

  res.status(201).json({ suggestion: record, usedGemini: suggestion.usedGemini });
}

export async function decideAiScheduleSuggestion(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const decision = req.body?.decision as 'accepted' | 'rejected';
  const editedAssignments = Array.isArray(req.body?.assignments) ? req.body.assignments : null;
  if (!['accepted', 'rejected'].includes(decision)) {
    res.status(400).json({ error: 'Décision invalide.' });
    return;
  }

  const db = loadDb();
  const sug = db.ai_schedule_suggestions.find((s) => s.id === id);
  if (!sug || !assertSameCompany(req, sug.company_id)) {
    res.status(404).json({ error: 'Proposition introuvable.' });
    return;
  }

  await mutateDb((d) => {
    const target = d.ai_schedule_suggestions.find((s) => s.id === id)!;
    target.status = decision;
    if (editedAssignments) {
      target.assignments = editedAssignments;
    }
    if (decision === 'accepted') {
      for (const item of target.assignments) {
        const exists = d.shift_assignments.find(
          (sa) => sa.company_id === target.company_id && sa.employee_id === item.employee_id && sa.date === item.date
        );
        if (exists) {
          exists.shift_id = item.shift_id;
          exists.notes = 'Validé via AI Schedule Suggestion';
        } else {
          d.shift_assignments.push({
            id: newId('sa'),
            company_id: target.company_id,
            employee_id: item.employee_id,
            shift_id: item.shift_id,
            date: item.date,
            is_rest_day: false,
            notes: 'Validé via AI Schedule Suggestion',
          });
        }
      }
      logAudit(d, {
        company_id: target.company_id,
        user_id: req.user!.userId,
        action: 'AI_SCHEDULE_ACCEPTED',
        entity_type: 'ai_schedule_suggestion',
        entity_id: target.id,
        details: `Planning IA validé par le manager (${target.assignments.length} affectations)`,
      });
    }
  });

  res.json({ ok: true });
}

export function listAiScheduleSuggestions(req: AuthenticatedRequest, res: Response): void {
  const db = loadDb();
  const cid = getScopedCompanyId(req);
  if (!cid) {
    res.status(400).json({ error: 'Entreprise requise.' });
    return;
  }
  res.json({
    suggestions: db.ai_schedule_suggestions.filter((s) => s.company_id === cid),
  });
}

// ======================== REPORTS, SETTINGS & GLOBAL SEARCH ========================

export function generateReport(req: AuthenticatedRequest, res: Response): void {
  const db = loadDb();
  const cid = getScopedCompanyId(req);
  if (!cid) {
    res.status(400).json({ error: 'Entreprise requise.' });
    return;
  }

  const reportType = String(req.query.type || 'attendance');
  const deptId = typeof req.query.departmentId === 'string' ? req.query.departmentId : '';
  const from = typeof req.query.from === 'string' ? req.query.from : '';
  const to = typeof req.query.to === 'string' ? req.query.to : '';

  const company = db.companies.find((c) => c.id === cid);
  const emps = db.employees.filter((e) => e.company_id === cid && (!deptId || e.department_id === deptId));
  const empIds = new Set(emps.map((e) => e.id));
  const empName = (id: string) => {
    const e = db.employees.find((x) => x.id === id);
    return e ? `${e.first_name} ${e.last_name}` : id;
  };
  const deptName = (id: string) => db.departments.find((d) => d.id === id)?.name || '-';

  let columns: string[] = [];
  let rows: Array<Record<string, unknown>> = [];

  if (reportType === 'attendance' || reportType === 'absences' || reportType === 'lates' || reportType === 'hours' || reportType === 'overtime') {
    columns = ['Date', 'Matricule', 'Employé', 'Département', 'Statut', 'Entrée', 'Sortie', 'Heures (h)', 'Retard (min)', 'Heures Sup (min)'];
    rows = db.attendance_records
      .filter((a) => a.company_id === cid && empIds.has(a.employee_id))
      .filter((a) => (!from || a.date >= from) && (!to || a.date <= to))
      .filter((a) => {
        if (reportType === 'absences') return a.status === 'absent' || a.status === 'justified_absence';
        if (reportType === 'lates') return a.late_minutes > 0;
        if (reportType === 'overtime') return a.overtime_minutes > 0;
        return true;
      })
      .map((a) => {
        const e = db.employees.find((x) => x.id === a.employee_id);
        return {
          Date: a.date,
          Matricule: e?.matricule || '-',
          Employé: empName(a.employee_id),
          Département: e ? deptName(e.department_id) : '-',
          Statut: a.status,
          Entrée: a.check_in ? a.check_in.slice(11, 16) : '-',
          Sortie: a.check_out ? a.check_out.slice(11, 16) : '-',
          'Heures (h)': Math.round((a.worked_minutes / 60) * 10) / 10,
          'Retard (min)': a.late_minutes,
          'Heures Sup (min)': a.overtime_minutes,
        };
      });
  } else if (reportType === 'leaves') {
    columns = ['Employé', 'Type', 'Début', 'Fin', 'Jours Ouvrables', 'Statut'];
    rows = db.leave_requests
      .filter((l) => l.company_id === cid && empIds.has(l.employee_id))
      .map((l) => ({
        Employé: empName(l.employee_id),
        Type: db.leave_types.find((lt) => lt.id === l.leave_type_id)?.name_fr || l.leave_type_id,
        Début: l.start_date,
        Fin: l.end_date,
        'Jours Ouvrables': l.working_days,
        Statut: l.status,
      }));
  } else if (reportType === 'exits') {
    columns = ['Date', 'Employé', 'Départ', 'Retour', 'Durée (min)', 'Statut'];
    rows = db.exit_requests
      .filter((ex) => ex.company_id === cid && empIds.has(ex.employee_id))
      .map((ex) => ({
        Date: ex.date,
        Employé: empName(ex.employee_id),
        Départ: ex.departure_time,
        Retour: ex.return_time,
        'Durée (min)': ex.duration_minutes,
        Statut: ex.status,
      }));
  } else if (reportType === 'contracts') {
    columns = ['Référence', 'Employé', 'Type', 'Début', 'Fin', 'Salaire (MAD)', 'Statut'];
    rows = db.contracts
      .filter((c) => c.company_id === cid && empIds.has(c.employee_id))
      .map((c) => ({
        Référence: c.reference,
        Employé: empName(c.employee_id),
        Type: c.contract_type,
        Début: c.start_date,
        Fin: c.end_date || 'Indéterminée',
        'Salaire (MAD)': c.salary_mad,
        Statut: c.status,
      }));
  } else if (reportType === 'payroll') {
    columns = ['Employé', 'Salaire Base', 'Primes', 'Heures Sup', 'Cotisations', 'Brut (MAD)', 'Net (MAD)'];
    rows = db.payroll_items
      .filter((pi) => pi.company_id === cid && empIds.has(pi.employee_id))
      .map((pi) => ({
        Employé: empName(pi.employee_id),
        'Salaire Base': pi.base_salary,
        Primes: pi.bonuses,
        'Heures Sup': pi.overtime_pay,
        Cotisations: pi.configured_contributions,
        'Brut (MAD)': pi.gross_salary,
        'Net (MAD)': pi.net_salary,
      }));
  } else if (reportType === 'workload') {
    columns = ['Employé', 'Département', 'Tâches Actives', 'Heures Tâches'];
    rows = emps.map((e) => {
      const ts = db.tasks.filter((t) => t.company_id === cid && t.assignee_id === e.id && t.status !== 'done');
      return {
        Employé: `${e.first_name} ${e.last_name}`,
        Département: deptName(e.department_id),
        'Tâches Actives': ts.length,
        'Heures Tâches': ts.reduce((acc, t) => acc + t.estimated_hours, 0),
      };
    });
  } else {
    // headcount
    columns = ['Matricule', 'Nom Complet', 'Département', 'Contrat', 'Date Embauche', 'Statut'];
    rows = emps.map((e) => ({
      Matricule: e.matricule,
      'Nom Complet': `${e.first_name} ${e.last_name}`,
      Département: deptName(e.department_id),
      Contrat: e.contract_type,
      'Date Embauche': e.hire_date,
      Statut: e.status,
    }));
  }

  res.json({
    companyName: company?.name || '+HR',
    generatedAt: new Date().toISOString(),
    reportType,
    columns,
    rows,
  });
}

export function getCompanySettings(req: AuthenticatedRequest, res: Response): void {
  const db = loadDb();
  const cid = getScopedCompanyId(req);
  if (!cid) {
    res.status(400).json({ error: 'Entreprise requise.' });
    return;
  }
  res.json({
    company: db.companies.find((c) => c.id === cid),
    settings: db.company_settings.find((s) => s.company_id === cid),
    holidays: db.holidays.filter((h) => h.company_id === cid),
    leaveTypes: db.leave_types.filter((lt) => lt.company_id === cid),
    rolePermissions: db.role_permissions.filter((rp) => rp.company_id === cid),
  });
}

export async function updateCompanySettings(req: AuthenticatedRequest, res: Response): Promise<void> {
  const cid = req.user!.companyId;
  if (!cid) {
    res.status(400).json({ error: 'Entreprise requise.' });
    return;
  }

  await mutateDb((d) => {
    const comp = d.companies.find((c) => c.id === cid);
    if (comp && req.body?.company) {
      if (req.body.company.name) comp.name = sanitizeText(req.body.company.name, 160);
      if (req.body.company.city) comp.city = sanitizeText(req.body.company.city, 100);
      if (req.body.company.address) comp.address = sanitizeText(req.body.company.address, 250);
      if (req.body.company.phone) comp.phone = sanitizeText(req.body.company.phone, 40);
      if (req.body.company.logo_url !== undefined) comp.logo_url = sanitizeText(req.body.company.logo_url, 500);
    }

    const cs = d.company_settings.find((s) => s.company_id === cid);
    if (cs && req.body?.settings) {
      Object.assign(cs, {
        language: req.body.settings.language || cs.language,
        currency: req.body.settings.currency || cs.currency,
        timezone: req.body.settings.timezone || cs.timezone,
        work_start_time: req.body.settings.work_start_time || cs.work_start_time,
        work_end_time: req.body.settings.work_end_time || cs.work_end_time,
        working_days: req.body.settings.working_days || cs.working_days,
        late_threshold_minutes: Number(req.body.settings.late_threshold_minutes ?? cs.late_threshold_minutes),
        enable_exit_rules: Boolean(req.body.settings.enable_exit_rules),
        exit_max_hours_per_day: Number(req.body.settings.exit_max_hours_per_day ?? cs.exit_max_hours_per_day),
        exit_conversion_hours: Number(req.body.settings.exit_conversion_hours ?? cs.exit_conversion_hours),
        require_geolocation_checkin: Boolean(req.body.settings.require_geolocation_checkin),
        allow_webauthn_checkin: Boolean(req.body.settings.allow_webauthn_checkin),
        payroll_contribution_rate: Number(req.body.settings.payroll_contribution_rate ?? cs.payroll_contribution_rate),
        payroll_tax_rate: Number(req.body.settings.payroll_tax_rate ?? cs.payroll_tax_rate),
        overtime_multiplier: Number(req.body.settings.overtime_multiplier ?? cs.overtime_multiplier),
      });
    }

    if (req.body?.newHoliday?.name && isValidDateStr(req.body.newHoliday.date)) {
      d.holidays.push({
        id: newId('hol'),
        company_id: cid,
        name: sanitizeText(req.body.newHoliday.name, 160),
        date: req.body.newHoliday.date,
        is_recurring: true,
      });
    }

    if (req.body?.togglePermissionId) {
      const rp = d.role_permissions.find((x) => x.id === req.body.togglePermissionId && x.company_id === cid);
      if (rp) rp.allowed = !rp.allowed;
    }

    logAudit(d, {
      company_id: cid,
      user_id: req.user!.userId,
      action: 'SETTINGS_UPDATED',
      entity_type: 'company_settings',
      entity_id: cid,
      details: 'Mise à jour des paramètres de l’entreprise',
    });
  });

  res.json({ ok: true });
}

export function globalSearch(req: AuthenticatedRequest, res: Response): void {
  const q = sanitizeText(String(req.query.q || ''), 80).toLowerCase();
  if (!q || q.length < 2) {
    res.json({ results: [] });
    return;
  }

  const db = loadDb();
  const cid = req.user!.companyId;
  const results: Array<{ type: string; title: string; subtitle: string; path: string }> = [];

  if (req.user!.roleCode === 'SUPER_ADMIN') {
    db.companies
      .filter((c) => c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q))
      .slice(0, 6)
      .forEach((c) => results.push({ type: 'Entreprise', title: c.name, subtitle: c.city, path: '/companies' }));
    res.json({ results });
    return;
  }

  if (req.user!.roleCode !== 'EMPLOYEE') {
    db.employees
      .filter((e) => e.company_id === cid && (`${e.first_name} ${e.last_name}`.toLowerCase().includes(q) || e.matricule.toLowerCase().includes(q)))
      .slice(0, 5)
      .forEach((e) =>
        results.push({ type: 'Employé', title: `${e.first_name} ${e.last_name}`, subtitle: e.matricule, path: `/employees/${e.id}` })
      );
  }

  db.departments
    .filter((d) => d.company_id === cid && d.name.toLowerCase().includes(q))
    .slice(0, 4)
    .forEach((d) => results.push({ type: 'Département', title: d.name, subtitle: d.code, path: '/departments' }));

  db.tasks
    .filter((t) => t.company_id === cid && t.title.toLowerCase().includes(q))
    .slice(0, 4)
    .forEach((t) => results.push({ type: 'Tâche', title: t.title, subtitle: t.status, path: '/tasks' }));

  db.announcements
    .filter((a) => a.company_id === cid && a.title.toLowerCase().includes(q))
    .slice(0, 4)
    .forEach((a) => results.push({ type: 'Annonce', title: a.title, subtitle: a.category, path: '/announcements' }));

  res.json({ results });
}
