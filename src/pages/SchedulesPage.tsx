import React, { useEffect, useState } from 'react';
import { AlertTriangle, Calendar, Plus } from 'lucide-react';
import { apiRequest } from '../services/api';
import { useApp } from '../contexts/AppContext';
import { Modal } from '../components/ui/ConfirmModal';
import type { Employee, Shift, ShiftAssignment } from '../types';

export const SchedulesPage: React.FC = () => {
  const { user, addToast } = useApp();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [approvedLeaves, setApprovedLeaves] = useState<any[]>([]);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [view, setView] = useState<'day' | 'week' | 'month'>('week');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: '', shift_id: '', date: new Date().toISOString().slice(0, 10), is_rest_day: false });

  const canManage = ['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'].includes(user?.role_code || '');

  const load = async () => {
    try {
      const [schRes, empRes] = await Promise.all([
        apiRequest<any>('/api/schedules'),
        canManage ? apiRequest<{ employees: Employee[] }>('/api/employees') : Promise.resolve({ employees: [] }),
      ]);
      setShifts(schRes.shifts);
      setAssignments(schRes.assignments);
      setApprovedLeaves(schRes.approvedLeaves || []);
      setConflicts(schRes.conflicts || []);
      setEmployees(empRes.employees);
      if (!form.employee_id && empRes.employees[0]) setForm((f) => ({ ...f, employee_id: empRes.employees[0].id }));
      if (!form.shift_id && schRes.shifts[0]) setForm((f) => ({ ...f, shift_id: schRes.shifts[0].id }));
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/schedules/assignments', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      addToast('Horaire affecté avec succès.', 'success');
      setModalOpen(false);
      await load();
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  };

  // Compute dates window
  const datesWindow = (() => {
    const base = new Date(`${selectedDate}T00:00:00Z`);
    if (view === 'day') return [selectedDate];
    if (view === 'week') {
      const arr: string[] = [];
      for (let i = -2; i <= 4; i++) {
        const d = new Date(base);
        d.setUTCDate(base.getUTCDate() + i);
        arr.push(d.toISOString().slice(0, 10));
      }
      return arr;
    }
    const arr: string[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(base);
      d.setUTCDate(base.getUTCDate() + i);
      arr.push(d.toISOString().slice(0, 10));
    }
    return arr;
  })();

  const totalPlannedHours = assignments.length * 8;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Horaires & Plannings</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Vue journalière, hebdomadaire et mensuelle · Équipes matin, après-midi, nuit et administratif
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-medium">
            {(['day', 'week', 'month'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-md ${view === v ? 'bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}
              >
                {v === 'day' ? 'Jour' : v === 'week' ? 'Semaine' : 'Quinzaine / Mois'}
              </button>
            ))}
          </div>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
          />
          {canManage && (
            <button type="button" onClick={() => setModalOpen(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Affecter un shift
            </button>
          )}
        </div>
      </div>

      {/* Shifts Legend & Summary */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          {shifts.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
              <span className="font-medium text-slate-800 dark:text-slate-200">{s.name}</span>
              <span className="font-mono text-slate-500">({s.start_time}–{s.end_time})</span>
            </div>
          ))}
        </div>
        <div className="text-xs font-mono text-slate-600 dark:text-slate-300 tabular-nums">
          Heures planifiées totales : <strong>{totalPlannedHours}h</strong>
        </div>
      </div>

      {/* Conflict alerts */}
      {conflicts.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 space-y-1.5">
          <div className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> Conflits de planning détectés ({conflicts.length})
          </div>
          {conflicts.map((c, idx) => (
            <div key={idx} className="text-xs text-amber-700 dark:text-amber-200">
              {c.employee_name} ({c.date}) : {c.reason}
            </div>
          ))}
        </div>
      )}

      {/* Calendar Matrix */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl responsive-scroll" role="region" aria-label="Planning hebdomadaire" tabIndex={0}>
        <table className="w-full text-xs text-start border-collapse min-w-[720px]">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
              <th className="p-3 text-start font-semibold text-slate-500">Date</th>
              <th className="p-3 text-start font-semibold text-slate-500">Équipes & Employés planifiés</th>
              <th className="p-3 text-start font-semibold text-slate-500">Congés approuvés</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {datesWindow.map((dt) => {
              const dayAssigns = assignments.filter((a) => a.date === dt);
              const dayLeaves = approvedLeaves.filter((l) => l.start_date <= dt && l.end_date >= dt);
              return (
                <tr key={dt} className="align-top">
                  <td className="p-3 font-mono font-semibold text-slate-900 dark:text-white whitespace-nowrap tabular-nums">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{dt}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    {dayAssigns.length === 0 ? (
                      <span className="text-slate-400">Aucune affectation</span>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {dayAssigns.slice(0, 12).map((a) => (
                          <div
                            key={a.id}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60"
                          >
                            <div className="font-medium text-slate-900 dark:text-white">{a.employee_name}</div>
                            <div className="text-[11px] font-mono text-slate-500">
                              {a.shift_name} ({a.start_time}–{a.end_time})
                            </div>
                          </div>
                        ))}
                        {dayAssigns.length > 12 && (
                          <span className="self-center text-slate-500">+{dayAssigns.length - 12} autres</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    {dayLeaves.length === 0 ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <div className="space-y-1">
                        {dayLeaves.map((l) => (
                          <div key={l.id} className="text-blue-600 dark:text-blue-400 font-medium">
                            {l.employee_name} (Congé)
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} title="Affecter un horaire / shift" onClose={() => setModalOpen(false)}>
        <form onSubmit={handleAssign} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1">Employé</label>
            <select value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800">
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.matricule})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Équipe / Shift</label>
              <select value={form.shift_id} onChange={(e) => setForm({ ...form, shift_id: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800">
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Date</label>
              <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800" />
            </div>
          </div>
          <button type="submit" className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg">Enregistrer l’affectation</button>
        </form>
      </Modal>
    </div>
  );
};
