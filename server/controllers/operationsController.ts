import { Response } from 'express';
import { loadDb, mutateDb, newId, logAudit, DbSchema } from '../repositories/dataStore.js';
import { AuthenticatedRequest, assertSameCompany, getScopedCompanyId } from '../middlewares/auth.js';
import { isValidDateStr, isValidTimeStr, sanitizeText } from '../validators/validators.js';
import { pushNotification } from '../services/realtimeService.js';

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function calculateWorkingDays(db: DbSchema, companyId: string, startDate: string, endDate: string): number {
  const settings = db.company_settings.find((s) => s.company_id === companyId);
  const workingDaysSet = new Set((settings?.working_days || '1,2,3,4,5').split(',').map(Number));
  const holidaysSet = new Set(db.holidays.filter((h) => h.company_id === companyId).map((h) => h.date));

  let count = 0;
  const cur = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cur <= end) {
    const dow = cur.getUTCDay(); // 0=Sun..6=Sat
    const iso = cur.toISOString().slice(0, 10);
    if (workingDaysSet.has(dow) && !holidaysSet.has(iso)) {
      count += 1;
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

// ======================== ATTENDANCE ========================

export function listAttendance(req: AuthenticatedRequest, res: Response): void {
  const db = loadDb();
  const cid = getScopedCompanyId(req);
  if (!cid) {
    res.status(400).json({ error: 'Entreprise requise.' });
    return;
  }

  const dateFilter = typeof req.query.date === 'string' ? req.query.date : '';
  const deptFilter = typeof req.query.departmentId === 'string' ? req.query.departmentId : '';
  const myEmp = db.employees.find((e) => e.user_id === req.user?.userId && e.company_id === cid);

  let records = db.attendance_records.filter((a) => a.company_id === cid);

  if (req.user?.roleCode === 'EMPLOYEE') {
    records = records.filter((a) => a.employee_id === myEmp?.id);
  } else if (req.user?.roleCode === 'MANAGER' && myEmp) {
    const teamIds = new Set(db.employees.filter((e) => e.company_id === cid && e.department_id === myEmp.department_id).map((e) => e.id));
    records = records.filter((a) => teamIds.has(a.employee_id));
  }

  if (dateFilter) records = records.filter((a) => a.date === dateFilter);

  const enriched = records
    .map((a) => {
      const emp = db.employees.find((e) => e.id === a.employee_id);
      const dept = emp ? db.departments.find((d) => d.id === emp.department_id) : null;
      return {
        ...a,
        employee_name: emp ? `${emp.first_name} ${emp.last_name}` : a.employee_id,
        matricule: emp?.matricule || '-',
        department_id: emp?.department_id,
        department_name: dept?.name || '-',
      };
    })
    .filter((r) => !deptFilter || r.department_id === deptFilter)
    .sort((a, b) => b.date.localeCompare(a.date));

  const corrections = db.attendance_corrections.filter((c) => c.company_id === cid);
  const settings = db.company_settings.find((s) => s.company_id === cid);

  res.json({
    records: enriched,
    corrections,
    companySettings: settings,
    myTodayRecord: myEmp ? enriched.find((r) => r.employee_id === myEmp.id && r.date === new Date().toISOString().slice(0, 10)) || null : null,
  });
}

export async function checkIn(req: AuthenticatedRequest, res: Response): Promise<void> {
  const db = loadDb();
  const cid = req.user!.companyId;
  const emp = db.employees.find((e) => e.user_id === req.user!.userId && e.company_id === cid);
  if (!cid || !emp) {
    res.status(400).json({ error: 'Fiche employé introuvable pour ce compte.' });
    return;
  }

  const settings = db.company_settings.find((s) => s.company_id === cid);
  if (settings?.require_geolocation_checkin && (req.body?.lat === undefined || req.body?.lng === undefined)) {
    res.status(400).json({ error: 'La vérification de géolocalisation est exigée par votre entreprise.' });
    return;
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const existing = db.attendance_records.find((a) => a.company_id === cid && a.employee_id === emp.id && a.date === today);
  if (existing && existing.check_in) {
    res.status(400).json({ error: 'Pointage d’entrée déjà enregistré aujourd’hui.' });
    return;
  }

  const shiftAssignment = db.shift_assignments.find((sa) => sa.company_id === cid && sa.employee_id === emp.id && sa.date === today);
  const shift = shiftAssignment ? db.shifts.find((s) => s.id === shiftAssignment.shift_id) : null;
  const plannedStart = shift?.start_time || settings?.work_start_time || '08:30';
  const plannedEnd = shift?.end_time || settings?.work_end_time || '17:30';

  const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const diffFromPlanned = timeToMinutes(currentHHMM) - timeToMinutes(plannedStart);
  const lateThreshold = settings?.late_threshold_minutes ?? 15;
  const lateMinutes = diffFromPlanned > lateThreshold ? diffFromPlanned : 0;
  const status = lateMinutes > 0 ? 'late' : req.body?.remote ? 'remote' : 'present';

  const record = {
    id: existing?.id || newId('att'),
    company_id: cid,
    employee_id: emp.id,
    date: today,
    check_in: now.toISOString(),
    check_out: null,
    planned_start: plannedStart,
    planned_end: plannedEnd,
    worked_minutes: 0,
    late_minutes: lateMinutes,
    early_departure_minutes: 0,
    overtime_minutes: 0,
    status: status as 'present' | 'late' | 'remote',
    location_lat: req.body?.lat !== undefined ? Number(req.body.lat) : null,
    location_lng: req.body?.lng !== undefined ? Number(req.body.lng) : null,
    location_verified: req.body?.lat !== undefined,
    webauthn_verified: Boolean(req.body?.webauthnVerified),
    notes: sanitizeText(req.body?.notes || '', 200),
  };

  await mutateDb((d) => {
    const idx = d.attendance_records.findIndex((a) => a.company_id === cid && a.employee_id === emp.id && a.date === today);
    if (idx >= 0) d.attendance_records[idx] = record;
    else d.attendance_records.unshift(record);
    logAudit(d, {
      company_id: cid,
      user_id: req.user!.userId,
      action: 'ATTENDANCE_CHECKIN',
      entity_type: 'attendance',
      entity_id: record.id,
      details: `Check-in ${emp.matricule} à ${currentHHMM} (retard: ${lateMinutes} min)`,
    });
  });

  res.status(201).json({ record });
}

export async function checkOut(req: AuthenticatedRequest, res: Response): Promise<void> {
  const db = loadDb();
  const cid = req.user!.companyId;
  const emp = db.employees.find((e) => e.user_id === req.user!.userId && e.company_id === cid);
  if (!cid || !emp) {
    res.status(400).json({ error: 'Fiche employé introuvable.' });
    return;
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const existing = db.attendance_records.find((a) => a.company_id === cid && a.employee_id === emp.id && a.date === today);
  if (!existing || !existing.check_in) {
    res.status(400).json({ error: 'Vous devez d’abord pointer votre entrée.' });
    return;
  }
  if (existing.check_out) {
    res.status(400).json({ error: 'Pointage de sortie déjà enregistré aujourd’hui.' });
    return;
  }

  const workedMinutes = Math.max(0, Math.round((now.getTime() - Date.parse(existing.check_in)) / 60000));
  const plannedEnd = existing.planned_end || '17:30';
  const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const diffEnd = timeToMinutes(currentHHMM) - timeToMinutes(plannedEnd);
  const earlyDepartureMinutes = diffEnd < -10 ? Math.abs(diffEnd) : 0;
  const overtimeMinutes = diffEnd > 15 ? diffEnd : 0;

  let updatedRecord = existing;
  await mutateDb((d) => {
    const target = d.attendance_records.find((a) => a.id === existing.id)!;
    target.check_out = now.toISOString();
    target.worked_minutes = workedMinutes;
    target.early_departure_minutes = earlyDepartureMinutes;
    target.overtime_minutes = overtimeMinutes;
    updatedRecord = target;
    logAudit(d, {
      company_id: cid,
      user_id: req.user!.userId,
      action: 'ATTENDANCE_CHECKOUT',
      entity_type: 'attendance',
      entity_id: target.id,
      details: `Check-out ${emp.matricule} (${workedMinutes} min travaillées)`,
    });
  });

  res.json({ record: updatedRecord });
}

export async function correctAttendance(req: AuthenticatedRequest, res: Response): Promise<void> {
  const db = loadDb();
  const record = db.attendance_records.find((a) => a.id === req.params.id);
  if (!record || !assertSameCompany(req, record.company_id)) {
    res.status(404).json({ error: 'Enregistrement introuvable.' });
    return;
  }

  const reason = sanitizeText(req.body?.reason, 300);
  if (!reason) {
    res.status(400).json({ error: 'Un motif de correction est obligatoire.' });
    return;
  }

  const newStatus = req.body?.status || record.status;
  const newCheckIn = req.body?.check_in !== undefined ? req.body.check_in : record.check_in;
  const newCheckOut = req.body?.check_out !== undefined ? req.body.check_out : record.check_out;

  await mutateDb((d) => {
    const target = d.attendance_records.find((a) => a.id === record.id)!;
    const actor = d.users.find((u) => u.id === req.user!.userId);

    d.attendance_corrections.unshift({
      id: newId('ac'),
      company_id: target.company_id,
      attendance_id: target.id,
      corrected_by_user_id: req.user!.userId,
      corrected_by_name: actor?.full_name || 'Admin',
      previous_check_in: target.check_in,
      new_check_in: newCheckIn,
      previous_check_out: target.check_out,
      new_check_out: newCheckOut,
      previous_status: target.status,
      new_status: newStatus,
      reason,
      created_at: new Date().toISOString(),
    });

    target.status = newStatus;
    target.check_in = newCheckIn;
    target.check_out = newCheckOut;
    if (newCheckIn && newCheckOut) {
      target.worked_minutes = Math.max(0, Math.round((Date.parse(newCheckOut) - Date.parse(newCheckIn)) / 60000));
    }
    if (req.body?.late_minutes !== undefined) target.late_minutes = Number(req.body.late_minutes);
    if (req.body?.overtime_minutes !== undefined) target.overtime_minutes = Number(req.body.overtime_minutes);

    logAudit(d, {
      company_id: target.company_id,
      user_id: req.user!.userId,
      action: 'ATTENDANCE_CORRECTED',
      entity_type: 'attendance',
      entity_id: target.id,
      details: `Correction pointage (${target.date}): ${reason}`,
    });
  });

  res.json({ ok: true });
}

// ======================== LEAVES (2-STEP WORKFLOW) ========================

export function listLeaves(req: AuthenticatedRequest, res: Response): void {
  const db = loadDb();
  const cid = getScopedCompanyId(req);
  if (!cid) {
    res.status(400).json({ error: 'Entreprise requise.' });
    return;
  }

  const myEmp = db.employees.find((e) => e.user_id === req.user?.userId && e.company_id === cid);
  let requests = db.leave_requests.filter((lr) => lr.company_id === cid);
  let balances = db.leave_balances.filter((lb) => lb.company_id === cid);

  if (req.user?.roleCode === 'EMPLOYEE' && myEmp) {
    requests = requests.filter((lr) => lr.employee_id === myEmp.id);
    balances = balances.filter((lb) => lb.employee_id === myEmp.id);
  } else if (req.user?.roleCode === 'MANAGER' && myEmp) {
    const teamIds = new Set(db.employees.filter((e) => e.company_id === cid && e.department_id === myEmp.department_id).map((e) => e.id));
    requests = requests.filter((lr) => teamIds.has(lr.employee_id));
    balances = balances.filter((lb) => teamIds.has(lb.employee_id));
  }

  const enrichedRequests = requests
    .map((lr) => {
      const emp = db.employees.find((e) => e.id === lr.employee_id);
      const dept = emp ? db.departments.find((d) => d.id === emp.department_id) : null;
      const lt = db.leave_types.find((t) => t.id === lr.leave_type_id);
      return {
        ...lr,
        employee_name: emp ? `${emp.first_name} ${emp.last_name}` : lr.employee_id,
        department_name: dept?.name || '-',
        leave_type_name: lt?.name_fr || lr.leave_type_id,
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const enrichedBalances = balances.map((lb) => ({
    ...lb,
    leave_type_name: db.leave_types.find((lt) => lt.id === lb.leave_type_id)?.name_fr || '-',
  }));

  res.json({
    requests: enrichedRequests,
    balances: enrichedBalances,
    leaveTypes: db.leave_types.filter((lt) => lt.company_id === cid),
    holidays: db.holidays.filter((h) => h.company_id === cid),
  });
}

export async function createLeaveRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  const db = loadDb();
  const cid = req.user!.companyId;
  const emp = db.employees.find((e) => e.user_id === req.user!.userId && e.company_id === cid);
  if (!cid || !emp) {
    res.status(400).json({ error: 'Employé introuvable.' });
    return;
  }

  const leaveTypeId = sanitizeText(req.body?.leave_type_id, 50);
  const startDate = sanitizeText(req.body?.start_date, 20);
  const endDate = sanitizeText(req.body?.end_date, 20);
  const reason = sanitizeText(req.body?.reason, 500);

  if (!leaveTypeId || !isValidDateStr(startDate) || !isValidDateStr(endDate) || !reason) {
    res.status(400).json({ error: 'Type de congé, dates valides et motif requis.' });
    return;
  }

  if (endDate < startDate) {
    res.status(400).json({ error: 'La date de fin doit être postérieure ou égale à la date de début.' });
    return;
  }

  const leaveType = db.leave_types.find((lt) => lt.id === leaveTypeId && lt.company_id === cid);
  if (!leaveType) {
    res.status(400).json({ error: 'Type de congé invalide pour votre entreprise.' });
    return;
  }

  const workingDays = calculateWorkingDays(db, cid, startDate, endDate);
  if (workingDays <= 0) {
    res.status(400).json({ error: 'La période sélectionnée ne contient aucun jour ouvrable.' });
    return;
  }

  // Overlap & duplicate detection
  const overlapping = db.leave_requests.find(
    (lr) =>
      lr.company_id === cid &&
      lr.employee_id === emp.id &&
      !['rejected_manager', 'rejected_hr', 'cancelled'].includes(lr.status) &&
      lr.start_date <= endDate &&
      lr.end_date >= startDate
  );
  if (overlapping) {
    res.status(409).json({ error: `Chevauchement détecté avec une demande existante (${overlapping.start_date} au ${overlapping.end_date}).` });
    return;
  }

  // Balance check (for paid leave types)
  if (leaveType.is_paid) {
    const bal = db.leave_balances.find((lb) => lb.company_id === cid && lb.employee_id === emp.id && lb.leave_type_id === leaveTypeId);
    if (bal && workingDays > bal.remaining_days) {
      res.status(400).json({
        error: `Solde insuffisant (${bal.remaining_days} jours disponibles pour ${workingDays} jours ouvrables demandés).`,
      });
      return;
    }
  }

  // If employee has no manager or is a manager themselves, still route to manager or directly pending_hr if no manager
  const initialStatus = emp.manager_id ? 'pending_manager' : 'pending_hr';
  const lrId = newId('lr');
  const record = {
    id: lrId,
    company_id: cid,
    employee_id: emp.id,
    leave_type_id: leaveTypeId,
    start_date: startDate,
    end_date: endDate,
    working_days: workingDays,
    reason,
    attachment_path: req.file ? `/api/uploads/${req.file.filename}` : null,
    status: initialStatus as 'pending_manager' | 'pending_hr',
    created_at: new Date().toISOString(),
  };

  await mutateDb((d) => {
    d.leave_requests.unshift(record);
    d.approval_history.unshift({
      id: newId('ah'),
      company_id: cid,
      entity_type: 'leave_request',
      entity_id: lrId,
      actor_user_id: req.user!.userId,
      actor_name: `${emp.first_name} ${emp.last_name}`,
      step: 'submission',
      decision: 'submitted',
      comment: reason,
      created_at: new Date().toISOString(),
    });
  });

  // Notify Manager (or HR if no manager)
  if (emp.manager_id) {
    const mgr = db.employees.find((e) => e.id === emp.manager_id);
    if (mgr?.user_id) {
      await pushNotification({
        company_id: cid,
        user_id: mgr.user_id,
        type: 'leave_request',
        title: 'Nouvelle demande de congé à valider',
        message: `${emp.first_name} ${emp.last_name} demande ${workingDays}j (${startDate} → ${endDate}).`,
        link_path: '/leaves',
      });
    }
  } else {
    const hrUsers = db.users.filter((u) => u.company_id === cid && u.role_code === 'HR_MANAGER');
    for (const hr of hrUsers) {
      await pushNotification({
        company_id: cid,
        user_id: hr.id,
        type: 'leave_request',
        title: 'Demande de congé à valider (RH)',
        message: `${emp.first_name} ${emp.last_name} demande ${workingDays}j (${startDate} → ${endDate}).`,
        link_path: '/leaves',
      });
    }
  }

  res.status(201).json({ request: record });
}

export async function reviewLeaveRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const decision = req.body?.decision as 'approve' | 'reject';
  const comment = sanitizeText(req.body?.comment || '', 400);
  if (!['approve', 'reject'].includes(decision)) {
    res.status(400).json({ error: 'Décision invalide.' });
    return;
  }

  const db = loadDb();
  const lr = db.leave_requests.find((x) => x.id === id);
  if (!lr || !assertSameCompany(req, lr.company_id)) {
    res.status(404).json({ error: 'Demande de congé introuvable.' });
    return;
  }

  const role = req.user!.roleCode;
  const emp = db.employees.find((e) => e.id === lr.employee_id);
  let errorMsg: string | null = null;

  await mutateDb((d) => {
    const target = d.leave_requests.find((x) => x.id === id)!;
    const actor = d.users.find((u) => u.id === req.user!.userId);

    if (target.status === 'pending_manager') {
      if (role !== 'MANAGER' && role !== 'COMPANY_ADMIN' && role !== 'HR_MANAGER') {
        errorMsg = 'Seul un manager habilité peut effectuer la validation de niveau 1.';
        return;
      }
      if (decision === 'reject') {
        target.status = 'rejected_manager';
        target.manager_comment = comment || 'Refusé par le manager';
      } else {
        target.status = 'pending_hr';
        target.manager_comment = comment || 'Validé par le manager';
      }
      d.approval_history.unshift({
        id: newId('ah'),
        company_id: target.company_id,
        entity_type: 'leave_request',
        entity_id: target.id,
        actor_user_id: req.user!.userId,
        actor_name: actor?.full_name || 'Manager',
        step: 'manager_review',
        decision: decision === 'approve' ? 'approved' : 'rejected',
        comment,
        created_at: new Date().toISOString(),
      });
      return;
    }

    if (target.status === 'pending_hr') {
      if (role !== 'HR_MANAGER') {
        errorMsg = 'Seul le Responsable RH peut effectuer la validation finale.';
        return;
      }
      if (decision === 'reject') {
        target.status = 'rejected_hr';
        target.hr_comment = comment || 'Refusé par les Ressources Humaines';
      } else {
        // Transactional balance check & deduction
        const lt = d.leave_types.find((t) => t.id === target.leave_type_id);
        if (lt?.is_paid) {
          const bal = d.leave_balances.find(
            (lb) => lb.company_id === target.company_id && lb.employee_id === target.employee_id && lb.leave_type_id === target.leave_type_id
          );
          if (bal) {
            if (bal.remaining_days < target.working_days) {
              errorMsg = 'Solde insuffisant au moment de la validation finale.';
              return;
            }
            bal.used_days = Number((bal.used_days + target.working_days).toFixed(2));
            bal.remaining_days = Number((bal.allocated_days - bal.used_days).toFixed(2));
          }
        }
        target.status = 'approved';
        target.hr_comment = comment || 'Validé par les Ressources Humaines';
      }
      d.approval_history.unshift({
        id: newId('ah'),
        company_id: target.company_id,
        entity_type: 'leave_request',
        entity_id: target.id,
        actor_user_id: req.user!.userId,
        actor_name: actor?.full_name || 'RH',
        step: 'hr_review',
        decision: decision === 'approve' ? 'approved' : 'rejected',
        comment,
        created_at: new Date().toISOString(),
      });
      return;
    }

    errorMsg = 'Cette demande n’est plus en attente de validation.';
  });

  if (errorMsg) {
    res.status(400).json({ error: errorMsg });
    return;
  }

  const updated = loadDb().leave_requests.find((x) => x.id === id)!;
  if (emp?.user_id) {
    await pushNotification({
      company_id: lr.company_id,
      user_id: emp.user_id,
      type: 'leave_status',
      title: 'Mise à jour de votre demande de congé',
      message: `Statut actuel : ${updated.status} (${lr.start_date} → ${lr.end_date}).`,
      link_path: '/leaves',
    });
  }

  if (updated.status === 'pending_hr') {
    const hrUsers = loadDb().users.filter((u) => u.company_id === lr.company_id && u.role_code === 'HR_MANAGER');
    for (const hr of hrUsers) {
      await pushNotification({
        company_id: lr.company_id,
        user_id: hr.id,
        type: 'leave_request',
        title: 'Congé validé par le Manager (attente RH)',
        message: `${emp?.first_name} ${emp?.last_name} (${lr.working_days}j) attend votre décision finale.`,
        link_path: '/leaves',
      });
    }
  }

  res.json({ request: updated });
}

export async function cancelLeaveRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  const db = loadDb();
  const lr = db.leave_requests.find((x) => x.id === req.params.id);
  const myEmp = db.employees.find((e) => e.user_id === req.user?.userId);
  if (!lr || !assertSameCompany(req, lr.company_id) || lr.employee_id !== myEmp?.id) {
    res.status(404).json({ error: 'Demande introuvable ou non autorisée.' });
    return;
  }
  if (!['pending_manager', 'pending_hr'].includes(lr.status)) {
    res.status(400).json({ error: 'Seules les demandes en attente peuvent être annulées.' });
    return;
  }
  await mutateDb((d) => {
    const target = d.leave_requests.find((x) => x.id === lr.id)!;
    target.status = 'cancelled';
  });
  res.json({ ok: true });
}

// ======================== EXIT AUTHORIZATIONS (HR VISION RULES) ========================

export function listExits(req: AuthenticatedRequest, res: Response): void {
  const db = loadDb();
  const cid = getScopedCompanyId(req);
  if (!cid) {
    res.status(400).json({ error: 'Entreprise requise.' });
    return;
  }
  const myEmp = db.employees.find((e) => e.user_id === req.user?.userId && e.company_id === cid);
  let exits = db.exit_requests.filter((er) => er.company_id === cid);

  if (req.user?.roleCode === 'EMPLOYEE' && myEmp) {
    exits = exits.filter((er) => er.employee_id === myEmp.id);
  } else if (req.user?.roleCode === 'MANAGER' && myEmp) {
    const teamIds = new Set(db.employees.filter((e) => e.company_id === cid && e.department_id === myEmp.department_id).map((e) => e.id));
    exits = exits.filter((er) => teamIds.has(er.employee_id));
  }

  const enriched = exits.map((er) => {
    const emp = db.employees.find((e) => e.id === er.employee_id);
    const dept = emp ? db.departments.find((d) => d.id === emp.department_id) : null;
    const et = db.exit_types.find((t) => t.id === er.exit_type_id);
    return {
      ...er,
      employee_name: emp ? `${emp.first_name} ${emp.last_name}` : er.employee_id,
      department_name: dept?.name || '-',
      exit_type_name: et?.name_fr || er.exit_type_id,
    };
  });

  const approvedExits = enriched.filter((e) => e.status === 'approved');
  const totalMinutes = approvedExits.reduce((acc, e) => acc + e.duration_minutes, 0);
  const settings = db.company_settings.find((s) => s.company_id === cid);

  res.json({
    requests: enriched.sort((a, b) => b.created_at.localeCompare(a.created_at)),
    exitTypes: db.exit_types.filter((t) => t.company_id === cid),
    settings,
    stats: {
      totalExits: enriched.length,
      totalExitHours: Math.round((totalMinutes / 60) * 10) / 10,
      acceptedCount: approvedExits.length,
      rejectedCount: enriched.filter((e) => e.status === 'rejected_manager' || e.status === 'rejected_hr').length,
      cumulativeLates: db.attendance_records.filter((a) => a.company_id === cid && a.late_minutes > 0).length,
      earlyDepartures: db.attendance_records.filter((a) => a.company_id === cid && a.early_departure_minutes > 0).length,
    },
  });
}

export async function createExitRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  const db = loadDb();
  const cid = req.user!.companyId;
  const emp = db.employees.find((e) => e.user_id === req.user!.userId && e.company_id === cid);
  if (!cid || !emp) {
    res.status(400).json({ error: 'Employé introuvable.' });
    return;
  }

  const exitTypeId = sanitizeText(req.body?.exit_type_id, 50);
  const date = sanitizeText(req.body?.date, 20);
  const departureTime = sanitizeText(req.body?.departure_time, 10);
  const returnTime = sanitizeText(req.body?.return_time, 10);
  const reason = sanitizeText(req.body?.reason, 400);

  if (!exitTypeId || !isValidDateStr(date) || !isValidTimeStr(departureTime) || !isValidTimeStr(returnTime) || !reason) {
    res.status(400).json({ error: 'Tous les champs de sortie doivent être valides.' });
    return;
  }

  const durationMinutes = timeToMinutes(returnTime) - timeToMinutes(departureTime);
  if (durationMinutes <= 0) {
    res.status(400).json({ error: 'L’heure de retour doit être postérieure à l’heure de départ.' });
    return;
  }

  const settings = db.company_settings.find((s) => s.company_id === cid);
  if (settings?.enable_exit_rules) {
    const maxMins = (settings.exit_max_hours_per_day || 4) * 60;
    const sameDayUsedMins = db.exit_requests
      .filter((er) => er.company_id === cid && er.employee_id === emp.id && er.date === date && er.status !== 'rejected_manager' && er.status !== 'rejected_hr' && er.status !== 'cancelled')
      .reduce((acc, er) => acc + er.duration_minutes, 0);
    if (sameDayUsedMins + durationMinutes > maxMins) {
      res.status(400).json({
        error: `Règle entreprise : maximum ${settings.exit_max_hours_per_day}h de sortie autorisées par jour.`,
      });
      return;
    }
  }

  const record: DbSchema['exit_requests'][number] = {
    id: newId('er'),
    company_id: cid,
    employee_id: emp.id,
    exit_type_id: exitTypeId,
    date,
    departure_time: departureTime,
    return_time: returnTime,
    duration_minutes: durationMinutes,
    reason,
    attachment_path: req.file ? `/api/uploads/${req.file.filename}` : null,
    status: emp.manager_id ? 'pending_manager' : 'pending_hr',
    converted_to_leave: false,
    created_at: new Date().toISOString(),
  };

  await mutateDb((d) => {
    d.exit_requests.unshift(record);
  });

  if (emp.manager_id) {
    const mgr = db.employees.find((e) => e.id === emp.manager_id);
    if (mgr?.user_id) {
      await pushNotification({
        company_id: cid,
        user_id: mgr.user_id,
        type: 'exit_request',
        title: 'Demande d’autorisation de sortie',
        message: `${emp.first_name} ${emp.last_name} (${date}, ${departureTime}-${returnTime}).`,
        link_path: '/exits',
      });
    }
  }

  res.status(201).json({ request: record });
}

export async function reviewExitRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const decision = req.body?.decision as 'approve' | 'reject';
  const comment = sanitizeText(req.body?.comment || '', 400);
  const db = loadDb();
  const er = db.exit_requests.find((x) => x.id === id);
  if (!er || !assertSameCompany(req, er.company_id)) {
    res.status(404).json({ error: 'Demande de sortie introuvable.' });
    return;
  }

  const emp = db.employees.find((e) => e.id === er.employee_id);
  const role = req.user!.roleCode;
  let errorMsg: string | null = null;

  await mutateDb((d) => {
    const target = d.exit_requests.find((x) => x.id === id)!;
    if (target.status === 'pending_manager') {
      if (!['MANAGER', 'COMPANY_ADMIN', 'HR_MANAGER'].includes(role)) {
        errorMsg = 'Permission refusée.';
        return;
      }
      target.status = decision === 'approve' ? 'pending_hr' : 'rejected_manager';
      target.manager_comment = comment;
    } else if (target.status === 'pending_hr') {
      if (role !== 'HR_MANAGER') {
        errorMsg = 'Seul le Responsable RH effectue la validation finale.';
        return;
      }
      target.status = decision === 'approve' ? 'approved' : 'rejected_hr';
      target.hr_comment = comment;

      // Optional HR Vision 7.5h -> 1 leave day rule (only if enabled & confirmed in company_settings, avoiding double-counting)
      const settings = d.company_settings.find((s) => s.company_id === target.company_id);
      if (decision === 'approve' && settings?.enable_exit_rules) {
        const unconvertedMins = d.exit_requests
          .filter((x) => x.company_id === target.company_id && x.employee_id === target.employee_id && x.status === 'approved' && !x.converted_to_leave)
          .reduce((acc, x) => acc + x.duration_minutes, 0);
        const thresholdMins = (settings.exit_conversion_hours || 7.5) * 60;
        if (unconvertedMins >= thresholdMins) {
          const annualLt = d.leave_types.find((lt) => lt.company_id === target.company_id && lt.code === 'ANNUAL');
          const bal = annualLt
            ? d.leave_balances.find((lb) => lb.employee_id === target.employee_id && lb.leave_type_id === annualLt.id)
            : null;
          if (bal && bal.remaining_days >= 1) {
            bal.used_days += 1;
            bal.remaining_days = Number((bal.allocated_days - bal.used_days).toFixed(2));
            d.exit_requests.forEach((x) => {
              if (x.company_id === target.company_id && x.employee_id === target.employee_id && x.status === 'approved' && !x.converted_to_leave) {
                x.converted_to_leave = true;
              }
            });
          }
        }
      }
    } else {
      errorMsg = 'Cette demande n’est plus en attente.';
    }
  });

  if (errorMsg) {
    res.status(400).json({ error: errorMsg });
    return;
  }

  if (emp?.user_id) {
    await pushNotification({
      company_id: er.company_id,
      user_id: emp.user_id,
      type: 'exit_status',
      title: 'Statut autorisation de sortie',
      message: `Votre sortie du ${er.date} a été mise à jour.`,
      link_path: '/exits',
    });
  }

  res.json({ ok: true });
}

// ======================== SCHEDULES & SHIFTS ========================

export function listSchedules(req: AuthenticatedRequest, res: Response): void {
  const db = loadDb();
  const cid = getScopedCompanyId(req);
  if (!cid) {
    res.status(400).json({ error: 'Entreprise requise.' });
    return;
  }

  const myEmp = db.employees.find((e) => e.user_id === req.user?.userId && e.company_id === cid);
  let assignments = db.shift_assignments.filter((sa) => sa.company_id === cid);

  if (req.user?.roleCode === 'EMPLOYEE' && myEmp) {
    assignments = assignments.filter((sa) => sa.employee_id === myEmp.id);
  } else if (req.user?.roleCode === 'MANAGER' && myEmp) {
    const teamIds = new Set(db.employees.filter((e) => e.company_id === cid && e.department_id === myEmp.department_id).map((e) => e.id));
    assignments = assignments.filter((sa) => teamIds.has(sa.employee_id));
  }

  const enriched = assignments.map((sa) => {
    const emp = db.employees.find((e) => e.id === sa.employee_id);
    const sh = db.shifts.find((s) => s.id === sa.shift_id);
    return {
      ...sa,
      employee_name: emp ? `${emp.first_name} ${emp.last_name}` : sa.employee_id,
      department_id: emp?.department_id,
      shift_name: sh?.name || '-',
      start_time: sh?.start_time || '08:30',
      end_time: sh?.end_time || '17:30',
      color: sh?.color || '#2563EB',
    };
  });

  // Detect conflicts (employee assigned on same date twice OR assigned during approved leave)
  const conflicts: Array<{ employee_id: string; employee_name: string; date: string; reason: string }> = [];
  const seen = new Map<string, number>();
  enriched.forEach((a) => {
    const key = `${a.employee_id}_${a.date}`;
    seen.set(key, (seen.get(key) || 0) + 1);
    if (seen.get(key) === 2) {
      conflicts.push({ employee_id: a.employee_id, employee_name: a.employee_name, date: a.date, reason: 'Double affectation sur la même journée' });
    }
    const onLeave = db.leave_requests.some(
      (lr) => lr.company_id === cid && lr.employee_id === a.employee_id && lr.status === 'approved' && lr.start_date <= a.date && lr.end_date >= a.date
    );
    if (onLeave) {
      conflicts.push({ employee_id: a.employee_id, employee_name: a.employee_name, date: a.date, reason: 'Conflit avec un congé approuvé' });
    }
  });

  const approvedLeaves = db.leave_requests
    .filter((lr) => lr.company_id === cid && lr.status === 'approved')
    .map((lr) => {
      const emp = db.employees.find((e) => e.id === lr.employee_id);
      return { ...lr, employee_name: emp ? `${emp.first_name} ${emp.last_name}` : lr.employee_id };
    });

  res.json({
    shifts: db.shifts.filter((s) => s.company_id === cid),
    assignments: enriched,
    approvedLeaves,
    conflicts,
  });
}

export async function createShiftAssignment(req: AuthenticatedRequest, res: Response): Promise<void> {
  const cid = req.user!.companyId;
  if (!cid) {
    res.status(400).json({ error: 'Entreprise requise.' });
    return;
  }

  const employeeId = sanitizeText(req.body?.employee_id, 50);
  const shiftId = sanitizeText(req.body?.shift_id, 50);
  const date = sanitizeText(req.body?.date, 20);
  const isRestDay = Boolean(req.body?.is_rest_day);

  if (!employeeId || !shiftId || !isValidDateStr(date)) {
    res.status(400).json({ error: 'Employé, équipe et date valide requis.' });
    return;
  }

  const db = loadDb();
  const onLeave = db.leave_requests.find(
    (lr) => lr.company_id === cid && lr.employee_id === employeeId && lr.status === 'approved' && lr.start_date <= date && lr.end_date >= date
  );
  if (onLeave && !req.body?.force) {
    res.status(409).json({ error: 'Conflit détecté : cet employé est en congé approuvé à cette date.' });
    return;
  }

  const sameDayShift = db.shift_assignments.find((sa) => sa.company_id === cid && sa.employee_id === employeeId && sa.date === date);
  if (sameDayShift && !req.body?.force) {
    res.status(409).json({ error: 'Conflit détecté : cet employé possède déjà un shift planifié à cette date.' });
    return;
  }

  const sa = {
    id: newId('sa'),
    company_id: cid,
    employee_id: employeeId,
    shift_id: shiftId,
    date,
    is_rest_day: isRestDay,
    notes: sanitizeText(req.body?.notes || '', 200),
  };

  await mutateDb((d) => {
    d.shift_assignments.push(sa);
  });

  const emp = db.employees.find((e) => e.id === employeeId);
  if (emp?.user_id) {
    await pushNotification({
      company_id: cid,
      user_id: emp.user_id,
      type: 'schedule_updated',
      title: 'Modification de planning',
      message: `Un horaire vous a été assigné pour le ${date}.`,
      link_path: '/schedules',
    });
  }

  res.status(201).json({ assignment: sa });
}

// ======================== TASKS & WORKLOAD ========================

export function listTasksAndWorkload(req: AuthenticatedRequest, res: Response): void {
  const db = loadDb();
  const cid = getScopedCompanyId(req);
  if (!cid) {
    res.status(400).json({ error: 'Entreprise requise.' });
    return;
  }
  const myEmp = db.employees.find((e) => e.user_id === req.user?.userId && e.company_id === cid);
  let tasks = db.tasks.filter((t) => t.company_id === cid);
  let emps = db.employees.filter((e) => e.company_id === cid && e.status === 'active');

  if (req.user?.roleCode === 'EMPLOYEE' && myEmp) {
    tasks = tasks.filter((t) => t.assignee_id === myEmp.id);
    emps = emps.filter((e) => e.id === myEmp.id);
  } else if (req.user?.roleCode === 'MANAGER' && myEmp) {
    tasks = tasks.filter((t) => t.department_id === myEmp.department_id);
    emps = emps.filter((e) => e.department_id === myEmp.department_id);
  }

  const enrichedTasks = tasks.map((t) => {
    const assignee = t.assignee_id ? db.employees.find((e) => e.id === t.assignee_id) : null;
    const dept = db.departments.find((d) => d.id === t.department_id);
    return {
      ...t,
      assignee_name: assignee ? `${assignee.first_name} ${assignee.last_name}` : 'Non assigné',
      department_name: dept?.name || '-',
    };
  });

  const workload = emps.map((e) => {
    const empTasks = db.tasks.filter((t) => t.company_id === cid && t.assignee_id === e.id && t.status !== 'done');
    const taskHours = empTasks.reduce((acc, t) => acc + t.estimated_hours, 0);
    const shiftHours = db.shift_assignments.filter((sa) => sa.company_id === cid && sa.employee_id === e.id).slice(0, 5).length * 8;
    const meetingHours = db.meetings.filter((m) => m.company_id === cid && m.status === 'scheduled' && m.participant_ids.includes(e.id)).length * 1.5;
    const capacity = 44;
    const currentLoad = Math.round((shiftHours + taskHours * 0.5 + meetingHours) * 10) / 10;
    const available = Math.max(0, Math.round((capacity - currentLoad) * 10) / 10);
    const risk = currentLoad > capacity ? 'critical' : currentLoad > capacity * 0.85 ? 'warning' : 'normal';
    return {
      employee_id: e.id,
      employee_name: `${e.first_name} ${e.last_name}`,
      department_name: db.departments.find((d) => d.id === e.department_id)?.name || '-',
      capacity_hours: capacity,
      shift_hours: shiftHours,
      task_hours: taskHours,
      meeting_hours: meetingHours,
      current_load_hours: currentLoad,
      available_hours: available,
      risk,
      active_tasks_count: empTasks.length,
    };
  });

  res.json({
    projects: db.projects.filter((p) => p.company_id === cid),
    tasks: enrichedTasks,
    workload,
  });
}

export async function createTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  const cid = req.user!.companyId;
  if (!cid) {
    res.status(400).json({ error: 'Entreprise requise.' });
    return;
  }

  const title = sanitizeText(req.body?.title, 180);
  const departmentId = sanitizeText(req.body?.department_id, 50);
  const dueDate = sanitizeText(req.body?.due_date || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), 20);

  if (!title || !departmentId || !isValidDateStr(dueDate)) {
    res.status(400).json({ error: 'Titre, département et date limite valide requis.' });
    return;
  }

  const task: DbSchema['tasks'][number] = {
    id: newId('task'),
    company_id: cid,
    project_id: req.body?.project_id || null,
    department_id: departmentId,
    title,
    description: sanitizeText(req.body?.description || '', 800),
    priority: (['low', 'medium', 'high', 'urgent'].includes(req.body?.priority) ? req.body.priority : 'medium') as 'low' | 'medium' | 'high' | 'urgent',
    start_date: sanitizeText(req.body?.start_date || new Date().toISOString().slice(0, 10), 20),
    due_date: dueDate,
    estimated_hours: Math.max(1, Number(req.body?.estimated_hours || 8)),
    actual_hours: 0,
    status: 'todo',
    assignee_id: req.body?.assignee_id || null,
    comments: [],
  };

  await mutateDb((db) => {
    db.tasks.unshift(task);
    if (task.assignee_id) {
      db.task_assignments.push({
        id: newId('ta'),
        company_id: cid,
        task_id: task.id,
        employee_id: task.assignee_id,
        assigned_hours: task.estimated_hours,
      });
    }
  });

  if (task.assignee_id) {
    const emp = loadDb().employees.find((e) => e.id === task.assignee_id);
    if (emp?.user_id) {
      await pushNotification({
        company_id: cid,
        user_id: emp.user_id,
        type: 'task',
        title: 'Nouvelle tâche assignée',
        message: `${task.title} (échéance : ${task.due_date}).`,
        link_path: '/tasks',
      });
    }
  }

  res.status(201).json({ task });
}

export async function updateTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  const db = loadDb();
  const task = db.tasks.find((t) => t.id === req.params.id);
  if (!task || !assertSameCompany(req, task.company_id)) {
    res.status(404).json({ error: 'Tâche introuvable.' });
    return;
  }

  await mutateDb((d) => {
    const target = d.tasks.find((t) => t.id === task.id)!;
    if (req.body?.status && ['todo', 'in_progress', 'in_review', 'done'].includes(req.body.status)) {
      target.status = req.body.status;
    }
    if (req.body?.actual_hours !== undefined) target.actual_hours = Math.max(0, Number(req.body.actual_hours));
    if (req.body?.assignee_id !== undefined) target.assignee_id = req.body.assignee_id || null;
    if (req.body?.comment) {
      const actor = d.users.find((u) => u.id === req.user!.userId);
      target.comments.push({
        id: newId('tc'),
        user_name: actor?.full_name || 'Utilisateur',
        text: sanitizeText(req.body.comment, 400),
        created_at: new Date().toISOString(),
      });
    }
  });

  res.json({ ok: true });
}
