import React, { useEffect, useState } from 'react';
import { Plus, Network, Archive, Briefcase } from 'lucide-react';
import { apiRequest } from '../services/api';
import { useApp } from '../contexts/AppContext';
import { Modal } from '../components/ui/ConfirmModal';
import type { Department, Employee, Position } from '../types';

export const DepartmentsPage: React.FC = () => {
  const { user, addToast } = useApp();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'orgchart'>('grid');
  const [deptModal, setDeptModal] = useState(false);
  const [posModal, setPosModal] = useState(false);

  const [deptForm, setDeptForm] = useState({ name: '', code: '', description: '', manager_employee_id: '', parent_department_id: '' });
  const [posForm, setPosForm] = useState({ department_id: '', title: '', level: 'Confirmé', base_salary_min: 7000, base_salary_max: 15000 });

  const canManage = user?.role_code === 'COMPANY_ADMIN' || user?.role_code === 'HR_MANAGER';

  const load = async () => {
    try {
      const [deptRes, empRes] = await Promise.all([
        apiRequest<{ departments: Department[]; positions: Position[] }>('/api/departments'),
        apiRequest<{ employees: Employee[] }>('/api/employees'),
      ]);
      setDepartments(deptRes.departments);
      setPositions(deptRes.positions);
      setEmployees(empRes.employees);
      if (!posForm.department_id && deptRes.departments[0]) {
        setPosForm((f) => ({ ...f, department_id: deptRes.departments[0].id }));
      }
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreateDept = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/departments', { method: 'POST', body: JSON.stringify(deptForm) });
      addToast('Département créé.', 'success');
      setDeptModal(false);
      setDeptForm({ name: '', code: '', description: '', manager_employee_id: '', parent_department_id: '' });
      await load();
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  };

  const handleCreatePos = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/positions', { method: 'POST', body: JSON.stringify(posForm) });
      addToast('Poste ajouté.', 'success');
      setPosModal(false);
      await load();
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  };

  const handleArchiveDept = async (dept: Department) => {
    try {
      await apiRequest(`/api/departments/${dept.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_archived: !dept.is_archived }),
      });
      addToast(dept.is_archived ? 'Département restauré.' : 'Département archivé.', 'success');
      await load();
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  };

  const activeDepts = departments.filter((d) => !d.is_archived);
  const rootDepts = activeDepts.filter((d) => !d.parent_department_id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Départements, Postes & Organigramme</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Structure hiérarchique, managers désignés et postes rattachés</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-medium">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 rounded-md ${viewMode === 'grid' ? 'bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}
            >
              Départements
            </button>
            <button
              type="button"
              onClick={() => setViewMode('orgchart')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 ${viewMode === 'orgchart' ? 'bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}
            >
              <Network className="w-3.5 h-3.5" /> Organigramme
            </button>
          </div>
          {canManage && (
            <>
              <button type="button" onClick={() => setPosModal(true)} className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5" /> Ajouter poste
              </button>
              <button type="button" onClick={() => setDeptModal(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5">
                <Plus className="w-4 h-4" /> Nouveau département
              </button>
            </>
          )}
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {departments.map((d) => {
            const deptPositions = positions.filter((p) => p.department_id === d.id);
            return (
              <div key={d.id} className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between ${d.is_archived ? 'opacity-55' : ''}`}>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">{d.code}</span>
                    {canManage && (
                      <button type="button" onClick={() => handleArchiveDept(d)} className="p-1 text-slate-400 hover:text-slate-700" title={d.is_archived ? 'Restaurer' : 'Archiver'}>
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <h3 className="mt-1 font-display text-base font-bold text-slate-900 dark:text-white">{d.name}</h3>
                  <p className="mt-1 text-xs text-slate-500 line-clamp-2">{d.description}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Manager :</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">{d.manager_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Effectif :</span>
                    <span className="font-mono font-semibold tabular-nums">{d.employee_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Postes :</span>
                    <span className="font-mono tabular-nums">{deptPositions.length}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Interactive Hierarchical Org Chart */
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 overflow-x-auto">
          <div className="flex flex-col items-center gap-6 min-w-[700px]">
            <div className="px-6 py-3 rounded-xl bg-[#0F172A] text-white text-center">
              <div className="text-xs text-blue-300">Direction Générale</div>
              <div className="font-display font-bold">{user?.company_name}</div>
            </div>
            <div className="w-px h-6 bg-slate-300 dark:bg-slate-700" />
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 w-full">
              {rootDepts.map((dept) => {
                const children = activeDepts.filter((c) => c.parent_department_id === dept.id);
                const members = employees.filter((e) => e.department_id === dept.id && e.status === 'active');
                return (
                  <div key={dept.id} className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="font-display font-bold text-sm text-slate-900 dark:text-white">{dept.name}</div>
                    <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">Manager : {dept.manager_name}</div>
                    <div className="mt-3 space-y-1">
                      {members.slice(0, 5).map((m) => (
                        <div key={m.id} className="text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between">
                          <span>{m.first_name} {m.last_name}</span>
                          <span className="font-mono text-[11px] text-slate-400">{m.matricule}</span>
                        </div>
                      ))}
                      {members.length > 5 && <div className="text-[11px] text-slate-400">+{members.length - 5} autre(s)</div>}
                    </div>
                    {children.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2">
                        {children.map((ch) => (
                          <div key={ch.id} className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                            <div className="text-xs font-semibold text-slate-900 dark:text-white">↳ {ch.name}</div>
                            <div className="text-[11px] text-slate-500">Manager : {ch.manager_name} ({ch.employee_count})</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <Modal open={deptModal} title="Créer un département" onClose={() => setDeptModal(false)}>
        <form onSubmit={handleCreateDept} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">Nom</label>
              <input required value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Code</label>
              <input required value={deptForm.code} onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })} placeholder="MKT" className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 font-mono" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Description</label>
            <textarea rows={2} value={deptForm.description} onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Manager</label>
              <select value={deptForm.manager_employee_id} onChange={(e) => setDeptForm({ ...deptForm, manager_employee_id: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800">
                <option value="">Non assigné</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Département parent</label>
              <select value={deptForm.parent_department_id} onChange={(e) => setDeptForm({ ...deptForm, parent_department_id: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800">
                <option value="">Aucun (Racine)</option>
                {activeDepts.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg">Créer le département</button>
        </form>
      </Modal>

      <Modal open={posModal} title="Ajouter un poste" onClose={() => setPosModal(false)}>
        <form onSubmit={handleCreatePos} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1">Département</label>
            <select value={posForm.department_id} onChange={(e) => setPosForm({ ...posForm, department_id: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800">
              {activeDepts.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Intitulé du poste</label>
            <input required value={posForm.title} onChange={(e) => setPosForm({ ...posForm, title: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Salaire min (MAD)</label>
              <input type="number" value={posForm.base_salary_min} onChange={(e) => setPosForm({ ...posForm, base_salary_min: Number(e.target.value) })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 font-mono" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Salaire max (MAD)</label>
              <input type="number" value={posForm.base_salary_max} onChange={(e) => setPosForm({ ...posForm, base_salary_max: Number(e.target.value) })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 font-mono" />
            </div>
          </div>
          <button type="submit" className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg">Enregistrer le poste</button>
        </form>
      </Modal>
    </div>
  );
};
