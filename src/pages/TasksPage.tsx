import React, { useEffect, useState } from 'react';
import { Plus, MessageSquare, Clock, AlertTriangle, CheckCircle2, ArrowRight, User } from 'lucide-react';
import { apiRequest } from '../services/api';
import { useApp } from '../contexts/AppContext';
import type { Department, Employee, TaskItem } from '../types';
import { Modal } from '../components/ui/ConfirmModal';
import { StatusText } from '../components/ui/StatusText';
import { DataTable, type ColumnDef } from '../components/ui/DataTable';

interface WorkloadRow {
  id?: string;
  employee_id: string;
  employee_name: string;
  department_name: string;
  capacity_hours: number;
  shift_hours: number;
  task_hours: number;
  meeting_hours: number;
  current_load_hours: number;
  available_hours: number;
  risk: 'normal' | 'warning' | 'critical';
  active_tasks_count: number;
}

const COLUMNS: Array<{ key: TaskItem['status']; label: string }> = [
  { key: 'todo', label: 'À faire' },
  { key: 'in_progress', label: 'En cours' },
  { key: 'in_review', label: 'En validation' },
  { key: 'done', label: 'Terminé' },
];

export const TasksPage: React.FC = () => {
  const { user, addToast } = useApp();
  const canManage = ['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'].includes(user?.role_code || '');

  const [tab, setTab] = useState<'kanban' | 'workload'>('kanban');
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [workload, setWorkload] = useState<WorkloadRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [commentText, setCommentText] = useState('');
  const [actualHoursInput, setActualHoursInput] = useState<number>(0);

  const [form, setForm] = useState({
    title: '',
    description: '',
    department_id: '',
    assignee_id: '',
    priority: 'medium' as TaskItem['priority'],
    due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    estimated_hours: 8,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [tasksRes, deptsRes] = await Promise.all([
        apiRequest<{ tasks: TaskItem[]; workload: WorkloadRow[] }>('/api/tasks'),
        apiRequest<{ departments: Department[] }>('/api/departments'),
      ]);
      setTasks(tasksRes.tasks);
      setWorkload(tasksRes.workload.map((w) => ({ ...w, id: w.employee_id })));
      setDepartments(deptsRes.departments);
      if (deptsRes.departments.length > 0 && !form.department_id) {
        setForm((f) => ({ ...f, department_id: deptsRes.departments[0].id }));
      }
      if (canManage) {
        const empRes = await apiRequest<{ employees: Employee[] }>('/api/employees');
        setEmployees(empRes.employees.filter((e) => e.status === 'active'));
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur chargement des tâches', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/tasks', { method: 'POST', body: JSON.stringify(form) });
      addToast('Tâche créée avec succès', 'success');
      setCreateOpen(false);
      setForm((f) => ({ ...f, title: '', description: '' }));
      loadData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur création tâche', 'error');
    }
  };

  const handleStatusChange = async (taskId: string, status: TaskItem['status']) => {
    try {
      await apiRequest(`/api/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
      if (selectedTask?.id === taskId) {
        setSelectedTask((s) => (s ? { ...s, status } : null));
      }
      addToast('Statut mis à jour', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur mise à jour', 'error');
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || !commentText.trim()) return;
    try {
      await apiRequest(`/api/tasks/${selectedTask.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ comment: commentText, actual_hours: actualHoursInput }),
      });
      setCommentText('');
      addToast('Commentaire enregistré', 'success');
      await loadData();
      const refreshed = await apiRequest<{ tasks: TaskItem[] }>('/api/tasks');
      const updated = refreshed.tasks.find((t) => t.id === selectedTask.id) || null;
      setSelectedTask(updated);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur ajout commentaire', 'error');
    }
  };

  const priorityLabel: Record<TaskItem['priority'], { text: string; cls: string }> = {
    low: { text: 'Basse', cls: 'text-slate-500 dark:text-slate-400' },
    medium: { text: 'Normale', cls: 'text-blue-600 dark:text-blue-400' },
    high: { text: 'Haute', cls: 'text-amber-600 dark:text-amber-400' },
    urgent: { text: 'Urgente', cls: 'text-red-600 dark:text-red-400 font-semibold' },
  };

  const workloadColumns: ColumnDef<WorkloadRow>[] = [
    { key: 'name', header: 'Employé', render: (r) => <span className="font-medium text-slate-900 dark:text-white">{r.employee_name}</span>, sortValue: (r) => r.employee_name },
    { key: 'dept', header: 'Département', render: (r) => r.department_name, sortValue: (r) => r.department_name },
    { key: 'shifts', header: 'Shifts (h)', align: 'right', render: (r) => `${r.shift_hours} h`, sortValue: (r) => r.shift_hours },
    { key: 'tasks', header: 'Tâches est. (h)', align: 'right', render: (r) => `${r.task_hours} h`, sortValue: (r) => r.task_hours },
    { key: 'meetings', header: 'Réunions (h)', align: 'right', render: (r) => `${r.meeting_hours} h` },
    {
      key: 'load',
      header: 'Charge / Capacité',
      render: (r) => {
        const pct = Math.min(130, Math.round((r.current_load_hours / r.capacity_hours) * 100));
        return (
          <div className="min-w-[160px]">
            <div className="flex items-center justify-between text-xs mb-1 tabular-nums">
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {r.current_load_hours}h / {r.capacity_hours}h
              </span>
              <span className={r.risk === 'critical' ? 'text-red-600 font-semibold' : r.risk === 'warning' ? 'text-amber-600' : 'text-emerald-600'}>
                {pct}%
              </span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  r.risk === 'critical' ? 'bg-red-600' : r.risk === 'warning' ? 'bg-amber-500' : 'bg-emerald-600'
                }`}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
          </div>
        );
      },
      sortValue: (r) => r.current_load_hours,
    },
    {
      key: 'risk',
      header: 'Risque surcharge',
      render: (r) =>
        r.risk === 'critical' ? (
          <StatusText status="absent" label="Surcharge critique" />
        ) : r.risk === 'warning' ? (
          <StatusText status="late" label="Tension élevée" />
        ) : (
          <StatusText status="active" label="Équilibrée" />
        ),
      sortValue: (r) => r.risk,
    },
  ];

  const overloadCount = workload.filter((w) => w.risk !== 'normal').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            {user?.role_code === 'EMPLOYEE' ? 'Mes tâches & charge' : 'Tâches & Charge de travail'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Suivi Kanban des activités et calcul de capacité hebdomadaire (44h)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-sm bg-white dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setTab('kanban')}
              className={`px-3.5 py-2 font-medium transition-colors ${
                tab === 'kanban' ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              Tableau Kanban ({tasks.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('workload')}
              className={`px-3.5 py-2 font-medium transition-colors ${
                tab === 'workload' ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              Charge hebdomadaire {overloadCount > 0 ? `(${overloadCount} alerte${overloadCount > 1 ? 's' : ''})` : ''}
            </button>
          </div>

          {canManage && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nouvelle tâche
            </button>
          )}
        </div>
      </div>

      {tab === 'kanban' ? (
        loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {COLUMNS.map((c) => (
              <div key={c.key} className="h-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {COLUMNS.map((col) => {
              const colTasks = tasks.filter((t) => t.status === col.key);
              return (
                <div
                  key={col.key}
                  className="bg-slate-50/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col min-h-[420px]"
                >
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <StatusText status={col.key} label={col.label} />
                    <span className="text-xs font-mono font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                      {colTasks.length}
                    </span>
                  </div>
                  <div className="p-3 space-y-3 flex-1">
                    {colTasks.length === 0 ? (
                      <div className="py-10 text-center text-xs text-slate-400">Aucune tâche dans cette colonne</div>
                    ) : (
                      colTasks.map((task) => {
                        const pr = priorityLabel[task.priority];
                        return (
                          <div
                            key={task.id}
                            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 shadow-2xs hover:border-blue-400 dark:hover:border-blue-600 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedTask(task);
                                  setActualHoursInput(task.actual_hours || 0);
                                }}
                                className="text-start font-medium text-sm text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400"
                              >
                                {task.title}
                              </button>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                              <span className={pr.cls}>{pr.text}</span>
                              <span>·</span>
                              <span>{task.department_name}</span>
                              <span>·</span>
                              <span className="tabular-nums">{task.estimated_hours}h</span>
                            </div>
                            <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                              <span className="inline-flex items-center gap-1 truncate max-w-[140px]">
                                <User className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">{task.assignee_name}</span>
                              </span>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="inline-flex items-center gap-1">
                                  <MessageSquare className="w-3.5 h-3.5" />
                                  {task.comments?.length || 0}
                                </span>
                                <span className="tabular-nums">{task.due_date.slice(5)}</span>
                              </div>
                            </div>
                            <div className="mt-2.5 flex items-center gap-1.5">
                              <select
                                aria-label={`Statut de ${task.title}`}
                                value={task.status}
                                onChange={(e) => handleStatusChange(task.id, e.target.value as TaskItem['status'])}
                                className="w-full text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                              >
                                {COLUMNS.map((opt) => (
                                  <option key={opt.key} value={opt.key}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="space-y-4">
          {overloadCount > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900 dark:text-amber-200">
                <span className="font-semibold">{overloadCount} collaborateur(s)</span> dépassent 85% de leur capacité hebdomadaire (44h) en cumulant shifts, tâches actives et réunions planifiées.
              </div>
            </div>
          )}
          <DataTable
            data={workload}
            columns={workloadColumns}
            loading={loading}
            searchPlaceholder="Filtrer par employé ou département…"
            searchFilter={(r, q) => r.employee_name.toLowerCase().includes(q) || r.department_name.toLowerCase().includes(q)}
          />
        </div>
      )}

      {/* Create Task Modal */}
      <Modal open={createOpen} title="Nouvelle tâche" onClose={() => setCreateOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Titre *</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              placeholder="Ex. Contrôle qualité lot Q2"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Département *</label>
              <select
                required
                value={form.department_id}
                onChange={(e) => setForm({ ...form, department_id: e.target.value })}
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
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Assigné à</label>
              <select
                value={form.assignee_id}
                onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="">Non assigné</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name} ({emp.matricule})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Priorité</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as TaskItem['priority'] })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="low">Basse</option>
                <option value="medium">Normale</option>
                <option value="high">Haute</option>
                <option value="urgent">Urgente</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Charge estimée (heures)</label>
              <input
                type="number"
                min={1}
                max={200}
                value={form.estimated_hours}
                onChange={(e) => setForm({ ...form, estimated_hours: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Date limite *</label>
              <input
                type="date"
                required
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg">
              Annuler
            </button>
            <button type="submit" className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">
              Créer la tâche
            </button>
          </div>
        </form>
      </Modal>

      {/* Task Details & Comments Modal */}
      <Modal open={Boolean(selectedTask)} title={selectedTask?.title || ''} onClose={() => setSelectedTask(null)} maxWidth="max-w-xl">
        {selectedTask && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <StatusText status={selectedTask.status} />
              <span>·</span>
              <span>{selectedTask.department_name}</span>
              <span>·</span>
              <span>Assigné : {selectedTask.assignee_name}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Estimé {selectedTask.estimated_hours}h · Réel {selectedTask.actual_hours}h
              </span>
            </div>
            {selectedTask.description && (
              <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg">
                {selectedTask.description}
              </p>
            )}

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Commentaires ({selectedTask.comments?.length || 0})
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {(!selectedTask.comments || selectedTask.comments.length === 0) ? (
                  <p className="text-xs text-slate-400">Aucun commentaire pour le moment.</p>
                ) : (
                  selectedTask.comments.map((c) => (
                    <div key={c.id} className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
                      <div className="flex items-center justify-between font-medium text-slate-800 dark:text-slate-200">
                        <span>{c.user_name}</span>
                        <span className="text-slate-400">{new Date(c.created_at).toLocaleString('fr-FR')}</span>
                      </div>
                      <p className="mt-1 text-slate-600 dark:text-slate-300">{c.text}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <form onSubmit={handleAddComment} className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <input
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Ajouter une note d'avancement…"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={actualHoursInput}
                    onChange={(e) => setActualHoursInput(Number(e.target.value))}
                    title="Heures passées"
                    className="w-20 px-2 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                  <button type="submit" className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">
                    <CheckCircle2 className="w-4 h-4" />
                    <ArrowRight className="w-3.5 h-3.5 hidden sm:inline" />
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </Modal>
    </div>
  );
};
