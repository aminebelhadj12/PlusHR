import { GoogleGenAI, Type } from '@google/genai';
import type { DbSchema } from '../repositories/dataStore.js';
import type { JwtPayload } from '../middlewares/auth.js';

function createGeminiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key || key === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildSafeContextForUser(db: DbSchema, user: JwtPayload): Record<string, unknown> {
  const today = new Date().toISOString().slice(0, 10);

  if (user.roleCode === 'SUPER_ADMIN') {
    return {
      role: 'SUPER_ADMIN',
      scope: 'Platform-wide aggregate indicators only',
      totalCompanies: db.companies.length,
      activeCompanies: db.companies.filter((c) => c.status === 'active').length,
      totalEmployeesAcrossPlatform: db.employees.length,
      openIncidents: db.technical_incidents.filter((i) => i.status !== 'resolved').length,
    };
  }

  const cid = user.companyId;
  const company = db.companies.find((c) => c.id === cid);
  const myEmp = db.employees.find((e) => e.user_id === user.userId && e.company_id === cid);

  if (user.roleCode === 'EMPLOYEE') {
    const myBalances = db.leave_balances
      .filter((lb) => lb.company_id === cid && lb.employee_id === myEmp?.id)
      .map((lb) => ({
        leaveType: db.leave_types.find((lt) => lt.id === lb.leave_type_id)?.name_fr || lb.leave_type_id,
        allocated: lb.allocated_days,
        used: lb.used_days,
        remaining: lb.remaining_days,
      }));
    const myLeaves = db.leave_requests
      .filter((lr) => lr.company_id === cid && lr.employee_id === myEmp?.id)
      .map((lr) => ({ start: lr.start_date, end: lr.end_date, days: lr.working_days, status: lr.status }));
    const myAttendanceToday = db.attendance_records.find(
      (a) => a.company_id === cid && a.employee_id === myEmp?.id && a.date === today
    );
    const myShifts = db.shift_assignments
      .filter((sa) => sa.company_id === cid && sa.employee_id === myEmp?.id && sa.date >= today)
      .slice(0, 7)
      .map((sa) => {
        const sh = db.shifts.find((s) => s.id === sa.shift_id);
        return { date: sa.date, shift: sh?.name, start: sh?.start_time, end: sh?.end_time };
      });
    const myTasks = db.tasks
      .filter((t) => t.company_id === cid && t.assignee_id === myEmp?.id)
      .map((t) => ({ title: t.title, status: t.status, due: t.due_date, estimatedHours: t.estimated_hours }));

    return {
      role: 'EMPLOYEE',
      companyName: company?.name,
      employeeName: myEmp ? `${myEmp.first_name} ${myEmp.last_name}` : 'Employé',
      matricule: myEmp?.matricule,
      leaveBalances: myBalances,
      recentLeaveRequests: myLeaves,
      attendanceToday: myAttendanceToday ? { status: myAttendanceToday.status, checkIn: myAttendanceToday.check_in } : 'Non pointé',
      upcomingShifts: myShifts,
      assignedTasks: myTasks,
    };
  }

  // Manager, HR Manager, Company Admin — aggregate & authorized scope ONLY (NO individual salaries, NO medical/private notes)
  const scopeDeptId = user.roleCode === 'MANAGER' ? myEmp?.department_id : null;
  const scopedEmployees = db.employees.filter(
    (e) => e.company_id === cid && e.status !== 'archived' && (!scopeDeptId || e.department_id === scopeDeptId)
  );
  const scopedEmpIds = new Set(scopedEmployees.map((e) => e.id));

  const todayAtt = db.attendance_records.filter((a) => a.company_id === cid && a.date === today && scopedEmpIds.has(a.employee_id));
  const absentTodayNames = scopedEmployees
    .filter((e) => todayAtt.some((a) => a.employee_id === e.id && a.status === 'absent'))
    .map((e) => `${e.first_name} ${e.last_name}`);

  const lateTodayCount = todayAtt.filter((a) => a.status === 'late').length;
  const presentTodayCount = todayAtt.filter((a) => a.status === 'present' || a.status === 'remote' || a.status === 'late').length;

  const pendingLeaves = db.leave_requests.filter(
    (lr) => lr.company_id === cid && scopedEmpIds.has(lr.employee_id) && (lr.status === 'pending_manager' || lr.status === 'pending_hr')
  ).length;

  const expiringContracts = db.contracts
    .filter((c) => {
      if (c.company_id !== cid || !c.end_date || !scopedEmpIds.has(c.employee_id)) return false;
      const diffDays = Math.ceil((Date.parse(c.end_date) - Date.now()) / 86400000);
      return diffDays >= 0 && diffDays <= 30;
    })
    .map((c) => {
      const emp = scopedEmployees.find((e) => e.id === c.employee_id);
      return { employee: emp ? `${emp.first_name} ${emp.last_name}` : c.employee_id, type: c.contract_type, endDate: c.end_date };
    });

  // Department workload summary
  const deptWorkload = db.departments
    .filter((d) => d.company_id === cid && !d.is_archived && (!scopeDeptId || d.id === scopeDeptId))
    .map((d) => {
      const deptEmps = scopedEmployees.filter((e) => e.department_id === d.id);
      const activeTasks = db.tasks.filter((t) => t.company_id === cid && t.department_id === d.id && t.status !== 'done');
      const totalTaskHours = activeTasks.reduce((acc, t) => acc + t.estimated_hours, 0);
      const capacity = deptEmps.length * 44;
      return {
        department: d.name,
        headcount: deptEmps.length,
        activeTaskHours: totalTaskHours,
        weeklyCapacityHours: capacity,
        overloadRisk: capacity > 0 && totalTaskHours / capacity > 0.45 ? 'Élevé' : 'Normal',
      };
    });

  return {
    role: user.roleCode,
    companyName: company?.name,
    scope: scopeDeptId ? `Département ${db.departments.find((d) => d.id === scopeDeptId)?.name}` : 'Toute l’entreprise',
    headcount: scopedEmployees.length,
    presentTodayCount,
    absentTodayCount: absentTodayNames.length,
    absentTodayEmployees: absentTodayNames,
    lateTodayCount,
    pendingLeaveRequests: pendingLeaves,
    expiringContractsWithin30Days: user.roleCode === 'MANAGER' ? [] : expiringContracts,
    departmentWorkloadSummary: deptWorkload,
    notice: 'Les salaires individuels et données médicales sont strictement exclus de ce contexte.',
  };
}

export async function askHrAssistant(params: {
  db: DbSchema;
  user: JwtPayload;
  question: string;
  lang: 'fr' | 'en' | 'ar';
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<{ answer: string; usedGemini: boolean; error?: string }> {
  const safeContext = buildSafeContextForUser(params.db, params.user);
  const ai = createGeminiClient();

  if (!ai) {
    return {
      usedGemini: false,
      error: 'GEMINI_API_KEY non configurée sur le serveur.',
      answer: generateDeterministicFallbackAnswer(safeContext, params.question, params.lang),
    };
  }

  const langLabel = params.lang === 'ar' ? 'Arabe' : params.lang === 'en' ? 'Anglais' : 'Français';
  const systemInstruction = `Tu es "+HR AI Assistant", l'assistant RH intelligent de la plateforme +HR.
Règles strictes :
1. Réponds uniquement à partir des données JSON autorisées ci-dessous. N'invente JAMAIS de chiffres, noms, contrats ou soldes.
2. Si une information n'est pas dans les données autorisées ou dépasse le rôle de l'utilisateur, indique-le clairement et poliment.
3. Ne divulgue jamais de salaires individuels ou de motifs médicaux.
4. Présente toute recommandation comme une aide à la décision pour les managers/RH.
5. Réponds en ${langLabel} de façon concise, structurée et professionnelle.

Données autorisées de l'utilisateur (${params.user.roleCode}) :
${JSON.stringify(safeContext, null, 2)}`;

  try {
    const chatHistory = params.history
      .slice(-6)
      .map((m) => `${m.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const prompt = chatHistory ? `${chatHistory}\nUtilisateur: ${params.question}` : params.question;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction,
      },
    });

    const text = response.text?.trim();
    if (!text) {
      throw new Error('Réponse vide de Gemini.');
    }
    return { answer: text, usedGemini: true };
  } catch (err) {
    return {
      usedGemini: false,
      error: (err as Error).message,
      answer: generateDeterministicFallbackAnswer(safeContext, params.question, params.lang),
    };
  }
}

function generateDeterministicFallbackAnswer(ctx: Record<string, unknown>, question: string, lang: 'fr' | 'en' | 'ar'): string {
  const q = question.toLowerCase();
  if (ctx.role === 'EMPLOYEE') {
    const balances = (ctx.leaveBalances as Array<{ leaveType: string; remaining: number }>) || [];
    const balStr = balances.map((b) => `${b.leaveType}: ${b.remaining}j`).join(' · ');
    if (q.includes('solde') || q.includes('cong') || q.includes('leave')) {
      return lang === 'en'
        ? `Your remaining leave balances: ${balStr}.`
        : lang === 'ar'
        ? `رصيد إجازاتك المتبقي: ${balStr}.`
        : `Voici vos soldes de congés actuels : ${balStr}.`;
    }
    const shifts = (ctx.upcomingShifts as Array<{ date: string; shift: string; start: string; end: string }>) || [];
    if (q.includes('plan') || q.includes('shift') || q.includes('horaire')) {
      const s = shifts.map((x) => `${x.date}: ${x.shift} (${x.start}-${x.end})`).join('\n');
      return s || 'Aucun shift planifié sur les prochains jours.';
    }
    return `Bonjour ${ctx.employeeName}. Vos soldes de congés : ${balStr}. Vous avez ${(ctx.assignedTasks as unknown[])?.length || 0} tâche(s) assignée(s).`;
  }

  if (q.includes('absent')) {
    const names = (ctx.absentTodayEmployees as string[]) || [];
    return `Aujourd'hui, ${ctx.absentTodayCount ?? 0} employé(s) sont marqués absents dans votre périmètre (${names.length ? names.join(', ') : 'aucun'}).`;
  }
  if (q.includes('contrat') || q.includes('expir')) {
    const ctrs = (ctx.expiringContractsWithin30Days as Array<{ employee: string; type: string; endDate: string }>) || [];
    return ctrs.length
      ? `Contrats expirant sous 30 jours : ${ctrs.map((c) => `${c.employee} (${c.type}, fin ${c.endDate})`).join(' · ')}.`
      : 'Aucun contrat n’expire dans les 30 prochains jours dans votre périmètre.';
  }
  return `Synthèse (${ctx.companyName || 'Plateforme'}) : Effectif ${ctx.headcount ?? ctx.totalEmployeesAcrossPlatform}, présents aujourd’hui : ${ctx.presentTodayCount ?? '-'}, en retard : ${ctx.lateTodayCount ?? '-'}, demandes de congés en attente : ${ctx.pendingLeaveRequests ?? '-'}.`;
}

export async function generateScheduleSuggestionWithAi(params: {
  db: DbSchema;
  companyId: string;
  departmentId: string;
  weekStart: string;
}): Promise<{
  usedGemini: boolean;
  rationale: string;
  assignments: Array<{
    employee_id: string;
    employee_name: string;
    shift_id: string;
    shift_name: string;
    date: string;
    reason: string;
  }>;
}> {
  const deptEmps = params.db.employees.filter(
    (e) => e.company_id === params.companyId && e.department_id === params.departmentId && e.status === 'active'
  );
  const shifts = params.db.shifts.filter((s) => s.company_id === params.companyId);
  const approvedLeaves = params.db.leave_requests.filter(
    (lr) => lr.company_id === params.companyId && lr.status === 'approved'
  );

  // Build 5 working days starting from weekStart
  const dates: string[] = [];
  const start = new Date(params.weekStart);
  for (let i = 0; i < 7 && dates.length < 5; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      dates.push(d.toISOString().slice(0, 10));
    }
  }

  // Deterministic constraint-based schedule generator (always available + respects approved leaves & load balance)
  const deterministicAssignments: Array<{
    employee_id: string;
    employee_name: string;
    shift_id: string;
    shift_name: string;
    date: string;
    reason: string;
  }> = [];

  if (deptEmps.length > 0 && shifts.length > 0) {
    dates.forEach((date, dayIdx) => {
      deptEmps.forEach((emp, empIdx) => {
        const hasApprovedLeave = approvedLeaves.some(
          (lr) => lr.employee_id === emp.id && lr.start_date <= date && lr.end_date >= date
        );
        if (hasApprovedLeave) return;

        const pickedShift = shifts[(empIdx + dayIdx) % shifts.length];
        deterministicAssignments.push({
          employee_id: emp.id,
          employee_name: `${emp.first_name} ${emp.last_name}`,
          shift_id: pickedShift.id,
          shift_name: pickedShift.name,
          date,
          reason: `Équilibrage rotation (${pickedShift.start_time}-${pickedShift.end_time}), aucun congé ou conflit détecté.`,
        });
      });
    });
  }

  const ai = createGeminiClient();
  if (!ai || deptEmps.length === 0 || shifts.length === 0) {
    return {
      usedGemini: false,
      rationale: 'Proposition générée par le moteur déterministe sous contraintes (congés approuvés exclus, rotation équilibrée, 44h max). Validation humaine requise avant application.',
      assignments: deterministicAssignments,
    };
  }

  try {
    const promptData = {
      department: params.db.departments.find((d) => d.id === params.departmentId)?.name,
      dates,
      employees: deptEmps.map((e) => ({ id: e.id, name: `${e.first_name} ${e.last_name}`, skills: e.skills })),
      shifts: shifts.map((s) => ({ id: s.id, name: s.name, start: s.start_time, end: s.end_time, night: s.is_night_shift })),
      approvedLeaves: approvedLeaves
        .filter((lr) => deptEmps.some((e) => e.id === lr.employee_id))
        .map((lr) => ({ employee_id: lr.employee_id, start: lr.start_date, end: lr.end_date })),
    };

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Propose une répartition équilibrée des shifts pour cette semaine en respectant strictement les congés approuvés et en évitant la surcharge. Utilise uniquement les IDs fournis.\n${JSON.stringify(promptData)}`,
      config: {
        systemInstruction: 'Tu es un planificateur RH expert. Retourne uniquement un JSON valide conforme au schéma. Ne planifie jamais un employé pendant ses congés approuvés.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            rationale: { type: Type.STRING },
            assignments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  employee_id: { type: Type.STRING },
                  shift_id: { type: Type.STRING },
                  date: { type: Type.STRING },
                  reason: { type: Type.STRING },
                },
              },
            },
          },
        },
      },
    });

    const parsed = JSON.parse((response.text || '{}').trim()) as {
      rationale?: string;
      assignments?: Array<{ employee_id: string; shift_id: string; date: string; reason: string }>;
    };

    if (!Array.isArray(parsed.assignments) || parsed.assignments.length === 0) {
      throw new Error('Planning vide');
    }

    // Validate all IDs & constraints server-side
    const validAssignments = parsed.assignments
      .filter((a) => {
        const emp = deptEmps.find((e) => e.id === a.employee_id);
        const sh = shifts.find((s) => s.id === a.shift_id);
        if (!emp || !sh || !dates.includes(a.date)) return false;
        const onLeave = approvedLeaves.some(
          (lr) => lr.employee_id === emp.id && lr.start_date <= a.date && lr.end_date >= a.date
        );
        return !onLeave;
      })
      .map((a) => {
        const emp = deptEmps.find((e) => e.id === a.employee_id)!;
        const sh = shifts.find((s) => s.id === a.shift_id)!;
        return {
          employee_id: emp.id,
          employee_name: `${emp.first_name} ${emp.last_name}`,
          shift_id: sh.id,
          shift_name: sh.name,
          date: a.date,
          reason: a.reason || 'Optimisé par +HR AI',
        };
      });

    if (validAssignments.length === 0) {
      throw new Error('Contraintes invalides');
    }

    return {
      usedGemini: true,
      rationale: parsed.rationale || 'Proposition optimisée par Gemini AI selon les compétences, disponibilités et congés approuvés.',
      assignments: validAssignments,
    };
  } catch {
    return {
      usedGemini: false,
      rationale: 'Proposition générée par le moteur de secours déterministe (congés approuvés respectés, rotation équilibrée). Validation humaine requise.',
      assignments: deterministicAssignments,
    };
  }
}
