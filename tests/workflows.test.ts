import assert from 'node:assert/strict';
import fs from 'node:fs';
import { io as createSocketClient } from 'socket.io-client';
import { createAppServer } from '../server.js';
import { reloadDbFromSqlite, resetDemoDatabase, mutateDb } from '../server/repositories/dataStore.js';
import { isolateTestDatabase } from './isolatedDatabase.js';
import { getSqliteDb, getSqliteDbPath } from '../server/config/database.js';

async function request(
  baseUrl: string,
  path: string,
  options: { method?: string; token?: string; body?: unknown; cookie?: string } = {}
): Promise<{ status: number; data: any; setCookies: string[] }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.cookie) headers.Cookie = options.cookie;

  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  return { status: res.status, data, setCookies };
}

function nextWeekday(offsetDays = 10): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

async function runTests() {
  console.log('=== +HR Complete Functional Test Suite ===');
  resetDemoDatabase();

  const { httpServer } = await createAppServer({ skipVite: true, scheduleBackups: false });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const addr = httpServer.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // 1. SQLite initialization & WAL check
    assert.ok(fs.existsSync(getSqliteDbPath()), 'plushr.db SQLite file must exist');
    const sqlite = getSqliteDb();
    const journalRow = sqlite.pragma('journal_mode', { simple: true });
    assert.equal(String(journalRow).toLowerCase(), 'wal');
    const tablesCount = (
      sqlite.prepare("SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get() as {
        cnt: number;
      }
    ).cnt;
    assert.ok(tablesCount >= 50, `Expected 50 SQLite tables, got ${tablesCount}`);
    console.log(`✓ 1. SQLite plushr.db initialized (${tablesCount} tables, WAL mode)`);

    // 2. Authentication: all 5 roles + invalid login + refresh + OTP reset + profile/WebAuthn
    const invalidLogin = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { identifier: 'ATL-010', password: 'WrongPassword!' },
    });
    assert.equal(invalidLogin.status, 401);

    const loginSuper = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { identifier: 'superadmin@plushr.ma', password: 'PlusHR#Super2026!' },
    });
    assert.equal(loginSuper.status, 200);
    assert.equal(loginSuper.data.user.role_code, 'SUPER_ADMIN');
    const superToken = loginSuper.data.accessToken;

    const loginAdmin = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { identifier: 'admin@atlas-industrial.ma', password: 'Atlas#Admin2026!', rememberMe: true },
    });
    assert.equal(loginAdmin.status, 200);
    assert.equal(loginAdmin.data.user.role_code, 'COMPANY_ADMIN');
    const adminToken = loginAdmin.data.accessToken;

    // Session refresh cookie verification
    const cookieHeader = loginAdmin.setCookies.map((c) => c.split(';')[0]).join('; ');
    assert.ok(cookieHeader.includes('plushr_refresh='));
    const refreshRes = await request(baseUrl, '/api/auth/refresh', { method: 'POST', cookie: cookieHeader });
    assert.equal(refreshRes.status, 200);
    assert.ok(refreshRes.data.accessToken);

    const loginHr = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { identifier: 'ATL-002', password: 'Atlas#HR2026!' },
    });
    assert.equal(loginHr.status, 200);
    assert.equal(loginHr.data.user.role_code, 'HR_MANAGER');
    const hrToken = loginHr.data.accessToken;

    const loginMgr = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { identifier: 'ATL-003', password: 'Atlas#Mgr2026!' },
    });
    assert.equal(loginMgr.status, 200);
    assert.equal(loginMgr.data.user.role_code, 'MANAGER');
    const mgrToken = loginMgr.data.accessToken;

    const loginEmp = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { identifier: 'ATL-010', password: 'Atlas#Emp2026!' },
    });
    assert.equal(loginEmp.status, 200);
    assert.equal(loginEmp.data.user.role_code, 'EMPLOYEE');
    let empToken = loginEmp.data.accessToken;
    const empUserId = loginEmp.data.user.id;
    const empEmployeeId = loginEmp.data.user.employee_id;

    const loginMaghreb = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { identifier: 'MGT-001', password: 'Maghreb#Admin2026!' },
    });
    assert.equal(loginMaghreb.status, 200);
    const maghrebToken = loginMaghreb.data.accessToken;

    const meRes = await request(baseUrl, '/api/auth/me', { token: empToken });
    assert.equal(meRes.status, 200);
    assert.equal(meRes.data.user.matricule, 'ATL-010');

    const profileRes = await request(baseUrl, '/api/auth/profile', {
      method: 'PUT',
      token: empToken,
      body: { preferred_lang: 'fr', theme: 'light', phone: '+212 611 22 33 44' },
    });
    assert.equal(profileRes.status, 200);

    const webauthnRes = await request(baseUrl, '/api/auth/webauthn/register', {
      method: 'POST',
      token: empToken,
      body: { credentialId: 'webauthn-demo-cred-001' },
    });
    assert.equal(webauthnRes.status, 200);

    // OTP password reset flow on employee
    const otpReq = await request(baseUrl, '/api/auth/otp/request', {
      method: 'POST',
      body: { email: 'employe@atlas-industrial.ma' },
    });
    assert.equal(otpReq.status, 200);
    assert.ok(otpReq.data.devOtpPreview);
    const otpVerify = await request(baseUrl, '/api/auth/otp/verify-reset', {
      method: 'POST',
      body: { email: 'employe@atlas-industrial.ma', code: otpReq.data.devOtpPreview, verifyOnly: true },
    });
    assert.equal(otpVerify.status, 200);
    const otpReset = await request(baseUrl, '/api/auth/otp/verify-reset', {
      method: 'POST',
      body: { email: 'employe@atlas-industrial.ma', code: otpReq.data.devOtpPreview, newPassword: 'Atlas#Emp2026!' },
    });
    assert.equal(otpReset.status, 200);
    assert.equal((await request(baseUrl, '/api/auth/me', { token: empToken })).status, 401);
    const employeeReLogin = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { identifier: 'ATL-010', password: 'Atlas#Emp2026!' },
    });
    assert.equal(employeeReLogin.status, 200);
    empToken = employeeReLogin.data.accessToken;
    console.log('✓ 2. Authentication (5 roles, 401, refresh, profile, WebAuthn, OTP reset) verified');

    // 3. RBAC enforcement
    assert.equal((await request(baseUrl, '/api/platform/overview', { token: empToken })).status, 403);
    assert.equal(
      (await request(baseUrl, '/api/payroll/generate', { method: 'POST', token: empToken, body: { month: 12, year: 2026 } })).status,
      403
    );
    assert.equal((await request(baseUrl, '/api/payroll', { token: mgrToken })).status, 403);
    assert.equal((await request(baseUrl, `/api/employees/${empEmployeeId}`, { method: 'DELETE', token: mgrToken })).status, 403);
    console.log('✓ 3. Role-based access denial (403) verified');

    // 4. Multi-tenant isolation
    const maghrebEmployees = await request(baseUrl, '/api/employees', { token: maghrebToken });
    assert.equal(maghrebEmployees.status, 200);
    assert.ok(maghrebEmployees.data.employees.every((e: any) => e.company_id === 'comp-maghreb'));
    const crossTenantDossier = await request(baseUrl, '/api/employees/emp-atlas-10', { token: maghrebToken });
    assert.ok([403, 404].includes(crossTenantDossier.status));
    console.log('✓ 4. Strict multi-tenant isolation verified');

    // 5. Employee CRUD: 6-step onboarding + modify + status + delete
    const deptsRes = await request(baseUrl, '/api/departments', { token: adminToken });
    const firstDept = deptsRes.data.departments[0];
    const firstPos = deptsRes.data.positions.find((p: any) => p.department_id === firstDept.id);

    const regCreate = await request(baseUrl, '/api/registration-requests', {
      method: 'POST',
      token: adminToken,
      body: {
        first_name: 'Nadia',
        last_name: 'Benjelloun',
        email: 'nadia.benjelloun@atlas-industrial.ma',
        matricule: 'ATL-999',
        department_id: firstDept.id,
        position_id: firstPos.id,
        role_code: 'EMPLOYEE',
        contract_type: 'CDI',
        base_salary_mad: 9500,
        hire_date: '2026-04-01',
      },
    });
    assert.equal(regCreate.status, 201);
    const regId = regCreate.data.request.id;

    const regApprove = await request(baseUrl, `/api/registration-requests/${regId}/review`, {
      method: 'POST',
      token: hrToken,
      body: { decision: 'approved' },
    });
    assert.equal(regApprove.status, 200);
    const createdEmpId = regApprove.data.employeeId;
    assert.ok(createdEmpId);

    const newEmpLogin = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { identifier: 'ATL-999', password: regApprove.data.tempPassword },
    });
    assert.equal(newEmpLogin.status, 200);
    assert.equal(newEmpLogin.data.user.must_change_password, true);

    const pwdChange = await request(baseUrl, '/api/auth/change-password', {
      method: 'POST',
      token: newEmpLogin.data.accessToken,
      body: { currentPassword: regApprove.data.tempPassword, newPassword: 'Nadia#NewPass2026!' },
    });
    assert.equal(pwdChange.status, 200);
    assert.equal(pwdChange.data.user.must_change_password, false);

    // Modify employee (phone + skills + salary)
    const empUpdate = await request(baseUrl, `/api/employees/${createdEmpId}`, {
      method: 'PUT',
      token: hrToken,
      body: { phone: '+212 699 88 77 66', skills: 'Lean, Qualité ISO', base_salary_mad: 10500, status: 'inactive' },
    });
    assert.equal(empUpdate.status, 200);
    const updatedDossier = await request(baseUrl, `/api/employees/${createdEmpId}`, { token: hrToken });
    assert.equal(updatedDossier.data.employee.phone, '+212 699 88 77 66');
    assert.equal(updatedDossier.data.employee.skills, 'Lean, Qualité ISO');
    assert.equal(updatedDossier.data.employee.status, 'inactive');

    // Self-delete guard
    const adminEmp = (await request(baseUrl, '/api/employees', { token: adminToken })).data.employees.find(
      (e: any) => e.user_id === loginAdmin.data.user.id
    );
    const selfDel = await request(baseUrl, `/api/employees/${adminEmp.id}`, { method: 'DELETE', token: adminToken });
    assert.equal(selfDel.status, 400);

    // Delete created employee ATL-999 & confirm removed from list and SQLite
    const empDelete = await request(baseUrl, `/api/employees/${createdEmpId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert.equal(empDelete.status, 200);
    const empsAfterDelete = await request(baseUrl, '/api/employees', { token: adminToken });
    assert.ok(!empsAfterDelete.data.employees.some((e: any) => e.id === createdEmpId));
    const sqlDeletedEmp = sqlite.prepare('SELECT id FROM employees WHERE id = ?').get(createdEmpId);
    assert.equal(sqlDeletedEmp, undefined);
    console.log('✓ 5. Employee CRUD (6-step creation, forced pwd, edit, status, self-delete guard, DELETE) verified');

    // 6. Departments & Positions CRUD
    const deptCreate = await request(baseUrl, '/api/departments', {
      method: 'POST',
      token: adminToken,
      body: { name: 'R&D Innovation', code: 'RND', description: 'Recherche & Développement' },
    });
    assert.equal(deptCreate.status, 201);
    const createdDeptId = deptCreate.data.department.id;

    const posCreate = await request(baseUrl, '/api/positions', {
      method: 'POST',
      token: adminToken,
      body: { department_id: createdDeptId, title: 'Ingénieur R&D', level: 'Senior', base_salary_min: 14000, base_salary_max: 24000 },
    });
    assert.equal(posCreate.status, 201);

    const deptArchive = await request(baseUrl, `/api/departments/${createdDeptId}`, {
      method: 'PUT',
      token: adminToken,
      body: { is_archived: true },
    });
    assert.equal(deptArchive.status, 200);
    console.log('✓ 6. Departments & Positions CRUD verified');

    // 7. Attendance: Check-in, Check-out & Admin/HR Correction
    const checkInRes = await request(baseUrl, '/api/attendance/check-in', {
      method: 'POST',
      token: empToken,
      body: { notes: 'Pointage test' },
    });
    assert.equal(checkInRes.status, 201);
    const attId = checkInRes.data.record.id;

    const checkOutRes = await request(baseUrl, '/api/attendance/check-out', {
      method: 'POST',
      token: empToken,
      body: {},
    });
    assert.equal(checkOutRes.status, 200);
    assert.ok(checkOutRes.data.record.check_out);

    const attCorrect = await request(baseUrl, `/api/attendance/${attId}/correct`, {
      method: 'PUT',
      token: hrToken,
      body: { status: 'late', late_minutes: 25, reason: 'Retard confirmé badgeuse' },
    });
    assert.equal(attCorrect.status, 200);
    console.log('✓ 7. Attendance check-in, check-out, lateness & correction verified');

    // 8. Leaves: 2-step approval, manager rejection stop, balance limit, overlap, cancellation
    const leavesMeta = await request(baseUrl, '/api/leaves', { token: empToken });
    const annualLt = leavesMeta.data.leaveTypes.find((lt: any) => lt.code === 'ANNUAL');
    const balBefore = leavesMeta.data.balances.find((b: any) => b.leave_type_id === annualLt.id).remaining_days;

    const d1 = nextWeekday(20);
    const leaveCreate = await request(baseUrl, '/api/leaves', {
      method: 'POST',
      token: empToken,
      body: { leave_type_id: annualLt.id, start_date: d1, end_date: d1, reason: 'Repos familial' },
    });
    assert.equal(leaveCreate.status, 201);
    assert.equal(leaveCreate.data.request.status, 'pending_manager');
    const leaveId = leaveCreate.data.request.id;

    const mgrApprove = await request(baseUrl, `/api/leaves/${leaveId}/review`, {
      method: 'POST',
      token: mgrToken,
      body: { decision: 'approve', comment: 'OK équipe' },
    });
    assert.equal(mgrApprove.data.request.status, 'pending_hr');

    const hrApprove = await request(baseUrl, `/api/leaves/${leaveId}/review`, {
      method: 'POST',
      token: hrToken,
      body: { decision: 'approve', comment: 'Validé RH' },
    });
    assert.equal(hrApprove.data.request.status, 'approved');

    const leavesAfter = await request(baseUrl, '/api/leaves', { token: empToken });
    const balAfter = leavesAfter.data.balances.find((b: any) => b.leave_type_id === annualLt.id).remaining_days;
    assert.equal(balAfter, balBefore - 1);

    // Manager rejection stops HR step
    const d2 = nextWeekday(30);
    const leave2 = await request(baseUrl, '/api/leaves', {
      method: 'POST',
      token: empToken,
      body: { leave_type_id: annualLt.id, start_date: d2, end_date: d2, reason: 'Autre date' },
    });
    const mgrReject = await request(baseUrl, `/api/leaves/${leave2.data.request.id}/review`, {
      method: 'POST',
      token: mgrToken,
      body: { decision: 'reject', comment: 'Pic production' },
    });
    assert.equal(mgrReject.data.request.status, 'rejected_manager');
    assert.equal(
      (await request(baseUrl, `/api/leaves/${leave2.data.request.id}/review`, { method: 'POST', token: hrToken, body: { decision: 'approve' } })).status,
      400
    );

    // Balance limit & overlap
    assert.equal(
      (
        await request(baseUrl, '/api/leaves', {
          method: 'POST',
          token: empToken,
          body: { leave_type_id: annualLt.id, start_date: nextWeekday(60), end_date: nextWeekday(120), reason: 'Long' },
        })
      ).status,
      400
    );
    assert.equal(
      (
        await request(baseUrl, '/api/leaves', {
          method: 'POST',
          token: empToken,
          body: { leave_type_id: annualLt.id, start_date: d1, end_date: d1, reason: 'Overlap' },
        })
      ).status,
      409
    );

    // Leave cancellation
    const dCancel = nextWeekday(40);
    const leave3 = await request(baseUrl, '/api/leaves', {
      method: 'POST',
      token: empToken,
      body: { leave_type_id: annualLt.id, start_date: dCancel, end_date: dCancel, reason: 'Annulation test' },
    });
    const cancelRes = await request(baseUrl, `/api/leaves/${leave3.data.request.id}/cancel`, {
      method: 'POST',
      token: empToken,
    });
    assert.equal(cancelRes.status, 200);
    console.log('✓ 8. Leaves 2-step approval, rejection stop, balance guard, overlap, cancel verified');

    // 9. Exit Authorizations
    const exitsMeta = await request(baseUrl, '/api/exits', { token: empToken });
    const exitTypeId = exitsMeta.data.exitTypes[0].id;
    assert.equal(
      (
        await request(baseUrl, '/api/exits', {
          method: 'POST',
          token: empToken,
          body: { exit_type_id: exitTypeId, date: nextWeekday(5), departure_time: '09:00', return_time: '15:00', reason: 'Trop long' },
        })
      ).status,
      400
    );
    const exitRes = await request(baseUrl, '/api/exits', {
      method: 'POST',
      token: empToken,
      body: { exit_type_id: exitTypeId, date: nextWeekday(6), departure_time: '14:00', return_time: '16:00', reason: 'Démarche' },
    });
    assert.equal(exitRes.status, 201);
    const exitId = exitRes.data.request.id;
    await request(baseUrl, `/api/exits/${exitId}/review`, { method: 'POST', token: mgrToken, body: { decision: 'approve' } });
    assert.equal(
      (await request(baseUrl, `/api/exits/${exitId}/review`, { method: 'POST', token: hrToken, body: { decision: 'approve' } })).status,
      200
    );
    console.log('✓ 9. Exit authorization daily max rule & 2-step workflow verified');

    // 10. Schedules & Shifts + conflict detection (approved leave + double shift)
    const schedMeta = await request(baseUrl, '/api/schedules', { token: mgrToken });
    const shiftId = schedMeta.data.shifts[0].id;
    assert.equal(
      (
        await request(baseUrl, '/api/schedules/assignments', {
          method: 'POST',
          token: mgrToken,
          body: { employee_id: 'emp-atlas-10', shift_id: shiftId, date: d1 },
        })
      ).status,
      409
    );
    const freeDate = nextWeekday(15);
    const validShift = await request(baseUrl, '/api/schedules/assignments', {
      method: 'POST',
      token: mgrToken,
      body: { employee_id: 'emp-atlas-10', shift_id: shiftId, date: freeDate },
    });
    assert.equal(validShift.status, 201);
    const dupShift = await request(baseUrl, '/api/schedules/assignments', {
      method: 'POST',
      token: mgrToken,
      body: { employee_id: 'emp-atlas-10', shift_id: shiftId, date: freeDate },
    });
    assert.equal(dupShift.status, 409);
    console.log('✓ 10. Schedules & double-shift / approved-leave conflicts (409) verified');

    // 11. Tasks & Weekly 44h Workload
    const tasksMeta = await request(baseUrl, '/api/tasks', { token: mgrToken });
    assert.equal(tasksMeta.status, 200);
    assert.ok(tasksMeta.data.workload.every((w: any) => w.capacity_hours === 44));
    const taskCreate = await request(baseUrl, '/api/tasks', {
      method: 'POST',
      token: mgrToken,
      body: {
        department_id: firstDept.id,
        title: 'Contrôle sécurité ligne B',
        priority: 'high',
        estimated_hours: 6,
        assignee_id: 'emp-atlas-10',
        due_date: nextWeekday(7),
      },
    });
    assert.equal(taskCreate.status, 201);
    const taskPatch = await request(baseUrl, `/api/tasks/${taskCreate.data.task.id}`, {
      method: 'PATCH',
      token: empToken,
      body: { status: 'in_progress', actual_hours: 3, comment: 'Inspection démarrée' },
    });
    assert.equal(taskPatch.status, 200);
    assert.equal(taskPatch.data.ok, true);
    const empTasksAfter = await request(baseUrl, '/api/tasks', { token: empToken });
    const updatedTask = empTasksAfter.data.tasks.find((t: any) => t.id === taskCreate.data.task.id);
    assert.equal(updatedTask.status, 'in_progress');
    assert.equal(updatedTask.comments.length, 1);
    console.log('✓ 11. Tasks Kanban transitions, comments & 44h workload verified');

    // 12. Contracts
    const ctrList = await request(baseUrl, '/api/contracts', { token: hrToken });
    assert.equal(ctrList.status, 200);
    assert.ok(ctrList.data.alerts);
    const ctrCreate = await request(baseUrl, '/api/contracts', {
      method: 'POST',
      token: hrToken,
      body: { employee_id: 'emp-atlas-10', contract_type: 'CDI', start_date: '2026-05-01', salary_mad: 9200, weekly_hours: 44 },
    });
    assert.equal(ctrCreate.status, 201);
    const ctrArchive = await request(baseUrl, `/api/contracts/${ctrCreate.data.contract.id}/archive`, {
      method: 'POST',
      token: hrToken,
    });
    assert.equal(ctrArchive.status, 200);
    console.log('✓ 12. Contracts listing, alerts, creation & archiving verified');

    // 13. Payroll & Confidential Payslips
    const payGen = await request(baseUrl, '/api/payroll/generate', {
      method: 'POST',
      token: hrToken,
      body: { month: 12, year: 2026 },
    });
    assert.equal(payGen.status, 201);
    const payVal = await request(baseUrl, `/api/payroll/${payGen.data.payrollId}/validate`, {
      method: 'POST',
      token: hrToken,
    });
    assert.equal(payVal.status, 200);
    const empPayslips = await request(baseUrl, '/api/payroll', { token: empToken });
    assert.equal(empPayslips.status, 200);
    assert.ok(empPayslips.data.payslips.every((p: any) => p.employee_id === empEmployeeId));
    assert.ok(empPayslips.data.payslips.some((p: any) => p.period_label === '12/2026'));
    console.log('✓ 13. Payroll generation, validation, payslips & employee isolation verified');

    // 14. Announcements & Meetings
    const annCreate = await request(baseUrl, '/api/announcements', {
      method: 'POST',
      token: hrToken,
      body: { title: 'Note de service test', content: 'Contenu note interne', category: 'hr', is_pinned: 'false' },
    });
    assert.equal(annCreate.status, 201);
    assert.equal(annCreate.data.announcement.is_pinned, false);
    const annId = annCreate.data.announcement.id;

    assert.equal((await request(baseUrl, `/api/announcements/${annId}/pin`, { method: 'PATCH', token: hrToken })).status, 200);
    const commCreate = await request(baseUrl, `/api/announcements/${annId}/comments`, {
      method: 'POST',
      token: empToken,
      body: { content: 'Bien reçu' },
    });
    assert.equal(commCreate.status, 201);
    assert.equal(
      (await request(baseUrl, `/api/announcements/${annId}/comments/${commCreate.data.comment.id}`, { method: 'DELETE', token: empToken })).status,
      200
    );
    assert.equal((await request(baseUrl, `/api/announcements/${annId}`, { method: 'DELETE', token: hrToken })).status, 200);

    const meetCreate = await request(baseUrl, '/api/meetings', {
      method: 'POST',
      token: mgrToken,
      body: {
        title: 'Point Production',
        date: nextWeekday(3),
        start_time: '10:00',
        end_time: '11:00',
        location: 'Salle Atlas',
        participant_ids: ['emp-atlas-10'],
      },
    });
    assert.equal(meetCreate.status, 201);
    assert.equal((await request(baseUrl, `/api/meetings/${meetCreate.data.meeting.id}/cancel`, { method: 'POST', token: mgrToken })).status, 200);
    console.log('✓ 14. Announcements (pin, comment, delete) & Meetings (create, cancel) verified');

    // 15. Dashboards (all 5 roles) & Global Search
    for (const [roleLabel, tok] of [
      ['SUPER_ADMIN', superToken],
      ['COMPANY_ADMIN', adminToken],
      ['HR_MANAGER', hrToken],
      ['MANAGER', mgrToken],
      ['EMPLOYEE', empToken],
    ] as const) {
      const dash = await request(baseUrl, '/api/dashboard', { token: tok });
      assert.equal(dash.status, 200, `Dashboard failed for ${roleLabel}`);
    }
    const searchRes = await request(baseUrl, '/api/search?q=Atlas', { token: adminToken });
    assert.equal(searchRes.status, 200);
    assert.ok(Array.isArray(searchRes.data.results));
    console.log('✓ 15. Dashboards across all 5 roles & Global Search verified');

    // 16. Real-time Socket.io Messaging & Notifications
    const msgWorkspace = await request(baseUrl, '/api/messages/workspace', { token: empToken });
    const hrColleague = msgWorkspace.data.colleagues.find((c: any) => c.role_code === 'HR_MANAGER');
    assert.ok(hrColleague);
    const convCreate = await request(baseUrl, '/api/messages/conversations', {
      method: 'POST',
      token: empToken,
      body: { peerUserId: hrColleague.user_id },
    });
    const convId = convCreate.data.conversationId;

    const hrSocket = createSocketClient(baseUrl, { auth: { token: hrToken }, transports: ['websocket'] });
    await new Promise<void>((resolve, reject) => {
      hrSocket.on('connect', () => resolve());
      hrSocket.on('connect_error', reject);
    });

    const receivedChatPromise = new Promise<any>((resolve) => hrSocket.once('chat:message', resolve));
    const receivedNotifPromise = new Promise<any>((resolve) => hrSocket.once('notification:new', resolve));
    const receivedEditPromise = new Promise<any>((resolve) => hrSocket.once('chat:updated', resolve));

    const sendMsg = await request(baseUrl, `/api/messages/conversations/${convId}`, {
      method: 'POST',
      token: empToken,
      body: { content: 'Bonjour RH, test Socket.io.' },
    });
    assert.equal(sendMsg.status, 201);

    const [rtMsg, rtNotif] = await Promise.all([receivedChatPromise, receivedNotifPromise]);
    assert.equal(rtMsg.id, sendMsg.data.message.id);
    assert.ok(rtNotif.title.includes('Nouveau message'));

    const editMsg = await request(baseUrl, `/api/messages/${sendMsg.data.message.id}`, {
      method: 'PUT',
      token: empToken,
      body: { content: 'Message modifié en direct' },
    });
    assert.equal(editMsg.status, 200);
    const rtEdited = await receivedEditPromise;
    assert.equal(rtEdited.is_edited, true);

    const delMsg = await request(baseUrl, `/api/messages/${sendMsg.data.message.id}`, {
      method: 'DELETE',
      token: empToken,
    });
    assert.equal(delMsg.status, 200);
    assert.equal(delMsg.data.message.is_deleted, true);
    hrSocket.disconnect();

    assert.equal((await request(baseUrl, `/api/messages/conversations/${convId}`, { token: maghrebToken })).status, 403);
    assert.equal((await request(baseUrl, '/api/notifications/all/read', { method: 'POST', token: hrToken })).status, 200);
    assert.equal(
      (
        await request(baseUrl, '/api/notifications/preferences', {
          method: 'PUT',
          token: hrToken,
          body: { email_enabled: false, realtime_enabled: true, leave_updates: true, message_alerts: true, meeting_alerts: true },
        })
      ).status,
      200
    );
    console.log('✓ 16. Real-time Socket.io chat/notifications, edit/delete message & preferences verified');

    // 17. AI Assistant, AI Analytics, AI Schedule Suggestion + Decision
    const aiChat = await request(baseUrl, '/api/ai/chat', {
      method: 'POST',
      token: empToken,
      body: { question: 'Quel est mon solde de congés ?', lang: 'fr' },
    });
    assert.equal(aiChat.status, 200);
    assert.ok(typeof aiChat.data.answer === 'string' && aiChat.data.answer.length > 10);

    const aiAnalytics = await request(baseUrl, '/api/ai/analytics', { token: hrToken });
    assert.equal(aiAnalytics.status, 200);
    assert.ok(Array.isArray(aiAnalytics.data.deptAnalytics));

    const aiSug = await request(baseUrl, '/api/ai/schedule-suggest', {
      method: 'POST',
      token: mgrToken,
      body: { department_id: firstDept.id, week_start: nextWeekday(25) },
    });
    assert.equal(aiSug.status, 201);
    const aiDec = await request(baseUrl, `/api/ai/schedule-suggestions/${aiSug.data.suggestion.id}/decision`, {
      method: 'POST',
      token: mgrToken,
      body: { decision: 'rejected' },
    });
    assert.equal(aiDec.status, 200);
    console.log('✓ 17. AI Assistant, AI Analytics & AI Schedule Suggestion verified');

    // 18. All 11 Report types + Settings + Super Admin Company Management
    for (const rType of ['attendance', 'absences', 'lates', 'leaves', 'exits', 'hours', 'overtime', 'contracts', 'payroll', 'workload', 'headcount']) {
      const rep = await request(baseUrl, `/api/reports?type=${rType}`, { token: hrToken });
      assert.equal(rep.status, 200, `Report ${rType} failed`);
      assert.ok(Array.isArray(rep.data.columns));
    }

    const getSet = await request(baseUrl, '/api/settings', { token: adminToken });
    assert.equal(getSet.status, 200);
    const putSet = await request(baseUrl, '/api/settings', {
      method: 'PUT',
      token: adminToken,
      body: { settings: { late_threshold_minutes: 10 } },
    });
    assert.equal(putSet.status, 200);

    const compCreate = await request(baseUrl, '/api/platform/companies', {
      method: 'POST',
      token: superToken,
      body: { name: 'Rif Logistics', city: 'Tanger', industry: 'Logistique', adminName: 'Karim Tazi', adminEmail: 'karim@riflogistics.ma', plan_name: 'Business' },
    });
    assert.equal(compCreate.status, 201);
    assert.equal(
      (await request(baseUrl, `/api/platform/companies/${compCreate.data.companyId}/status`, { method: 'PATCH', token: superToken, body: { status: 'suspended' } })).status,
      200
    );
    console.log('✓ 18. All 11 Reports, Settings & Super Admin Company Management verified');

    // 19. Final SQLite persistence reload check
    const sqlLeaveRow = sqlite.prepare('SELECT status FROM leave_requests WHERE id = ?').get(leaveId) as { status: string } | undefined;
    assert.equal(sqlLeaveRow?.status, 'approved');
    const persisted = reloadDbFromSqlite();
    assert.ok(persisted.leave_requests.some((l) => l.id === leaveId && l.status === 'approved'));
    assert.ok(persisted.companies.some((c) => c.id === compCreate.data.companyId && c.status === 'suspended'));
    console.log('✓ 19. Full SQLite plushr.db persistence & reload verified');

    console.log('\nALL 19 COMPLETE FUNCTIONAL TEST SUITES PASSED SUCCESSFULLY.');
  } finally {
    httpServer.closeAllConnections?.();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
}

const cleanup = isolateTestDatabase();
runTests()
  .catch((err) => {
    console.error('TEST SUITE FAILED:', err);
    process.exitCode = 1;
  })
  .finally(cleanup);
