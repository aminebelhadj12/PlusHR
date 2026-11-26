import React, { useEffect, useState } from 'react';
import { Sparkles, Check, X, ShieldCheck, Calendar } from 'lucide-react';
import { apiRequest } from '../services/api';
import { useApp } from '../contexts/AppContext';
import type { Department, Shift } from '../types';
import { StatusText } from '../components/ui/StatusText';

interface SuggestedAssignment {
  employee_id: string;
  employee_name: string;
  date: string;
  shift_id: string;
  shift_name: string;
  reason: string;
}

interface ScheduleSuggestion {
  id: string;
  department_id: string;
  week_start: string;
  status: 'pending' | 'accepted' | 'rejected';
  rationale: string;
  assignments: SuggestedAssignment[];
  created_at: string;
}

export const AiSchedulePage: React.FC = () => {
  const { addToast } = useApp();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [suggestions, setSuggestions] = useState<ScheduleSuggestion[]>([]);
  const [activeSug, setActiveSug] = useState<ScheduleSuggestion | null>(null);

  const [departmentId, setDepartmentId] = useState('');
  const [weekStart, setWeekStart] = useState(new Date().toISOString().slice(0, 10));
  const [generating, setGenerating] = useState(false);

  const loadData = async () => {
    try {
      const [deptRes, schedRes, sugRes] = await Promise.all([
        apiRequest<{ departments: Department[] }>('/api/departments'),
        apiRequest<{ shifts: Shift[] }>('/api/schedules'),
        apiRequest<{ suggestions: ScheduleSuggestion[] }>('/api/ai/schedule-suggestions'),
      ]);
      setDepartments(deptRes.departments);
      setShifts(schedRes.shifts);
      setSuggestions(sugRes.suggestions);
      if (deptRes.departments.length > 0 && !departmentId) {
        setDepartmentId(deptRes.departments[0].id);
      }
      if (sugRes.suggestions.length > 0 && !activeSug) {
        setActiveSug(sugRes.suggestions[0]);
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur chargement AI Schedule', 'error');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!departmentId) return;
    setGenerating(true);
    try {
      const res = await apiRequest<{ suggestion: ScheduleSuggestion; usedGemini: boolean }>('/api/ai/schedule-suggest', {
        method: 'POST',
        body: JSON.stringify({ department_id: departmentId, week_start: weekStart }),
      });
      setSuggestions((prev) => [res.suggestion, ...prev]);
      setActiveSug(res.suggestion);
      addToast(
        res.usedGemini ? 'Proposition générée par Gemini IA — en attente de votre validation' : 'Proposition générée (moteur déterministe) — en attente de validation',
        'success'
      );
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur génération planning', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleShiftEdit = (idx: number, newShiftId: string) => {
    if (!activeSug || activeSug.status !== 'pending') return;
    const sh = shifts.find((s) => s.id === newShiftId);
    if (!sh) return;
    const updatedAssignments = activeSug.assignments.map((a, i) =>
      i === idx ? { ...a, shift_id: sh.id, shift_name: sh.name, reason: `${a.reason} (ajusté manuellement)` } : a
    );
    setActiveSug({ ...activeSug, assignments: updatedAssignments });
  };

  const handleDecision = async (decision: 'accepted' | 'rejected') => {
    if (!activeSug) return;
    try {
      await apiRequest(`/api/ai/schedule-suggestions/${activeSug.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          assignments: activeSug.assignments,
        }),
      });
      addToast(
        decision === 'accepted' ? 'Planning validé et publié dans Horaires & Plannings' : 'Proposition rejetée',
        decision === 'accepted' ? 'success' : 'info'
      );
      setActiveSug({ ...activeSug, status: decision });
      loadData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur décision', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">AI Schedule Suggestion</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Optimisation intelligente des équipes respectant les congés approuvés et le repos — validation humaine obligatoire
        </p>
      </div>

      <div className="bg-blue-50/70 dark:bg-blue-950/25 border border-blue-200 dark:border-blue-800 rounded-xl p-3.5 flex items-center gap-3 text-xs text-blue-900 dark:text-blue-200">
        <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
        <span>
          Human-in-the-loop : aucune affectation n’est appliquée sans votre clic explicite sur « Accepter et publier ». Vous pouvez ajuster chaque shift avant validation.
        </span>
      </div>

      <form
        onSubmit={handleGenerate}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-end gap-4"
      >
        <div className="min-w-[220px]">
          <label className="block text-xs font-medium text-slate-500 mb-1">Département</label>
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Début de semaine</label>
          <input
            type="date"
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          />
        </div>

        <button
          type="submit"
          disabled={generating}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4" />
          {generating ? 'Génération en cours…' : 'Générer une proposition'}
        </button>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <aside className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden h-fit">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Propositions ({suggestions.length})
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
            {suggestions.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">Aucune proposition générée</div>
            ) : (
              suggestions.map((s) => {
                const dName = departments.find((d) => d.id === s.department_id)?.name || s.department_id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveSug(s)}
                    className={`w-full text-start px-4 py-3 text-xs space-y-1 ${
                      activeSug?.id === s.id ? 'bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="font-semibold text-slate-900 dark:text-white">{dName}</div>
                    <div className="flex items-center justify-between text-slate-500">
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Calendar className="w-3 h-3" />
                        {s.week_start}
                      </span>
                      <StatusText status={s.status === 'accepted' ? 'approved' : s.status} />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          {!activeSug ? (
            <div className="py-16 text-center text-sm text-slate-400">
              Lancez une génération ou sélectionnez une proposition dans la liste.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                      Semaine du {activeSug.week_start}
                    </h2>
                    <StatusText status={activeSug.status === 'accepted' ? 'approved' : activeSug.status} />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{activeSug.rationale}</p>
                </div>

                {activeSug.status === 'pending' && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDecision('rejected')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-red-200 dark:border-red-800 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      <X className="w-4 h-4" />
                      Rejeter
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDecision('accepted')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg"
                    >
                      <Check className="w-4 h-4" />
                      Accepter et publier
                    </button>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-start">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5 text-start">Date</th>
                      <th className="px-3 py-2.5 text-start">Employé</th>
                      <th className="px-3 py-2.5 text-start">Shift proposé (modifiable)</th>
                      <th className="px-3 py-2.5 text-start">Justification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {activeSug.assignments.map((a, idx) => (
                      <tr key={`${a.employee_id}-${a.date}`}>
                        <td className="px-3 py-2.5 font-mono text-xs tabular-nums">{a.date}</td>
                        <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-white">{a.employee_name}</td>
                        <td className="px-3 py-2.5">
                          {activeSug.status === 'pending' ? (
                            <select
                              value={a.shift_id}
                              onChange={(e) => handleShiftEdit(idx, e.target.value)}
                              className="px-2.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                            >
                              {shifts.map((sh) => (
                                <option key={sh.id} value={sh.id}>
                                  {sh.name} ({sh.start_time}-{sh.end_time})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs font-medium">{a.shift_name}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">{a.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};
