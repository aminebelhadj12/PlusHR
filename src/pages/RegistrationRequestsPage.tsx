import React, { useEffect, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { apiRequest } from '../services/api';
import { useApp } from '../contexts/AppContext';
import { DataTable, ColumnDef } from '../components/ui/DataTable';
import { StatusText } from '../components/ui/StatusText';
import { Modal } from '../components/ui/ConfirmModal';
import type { Department, Employee, EmployeeRegistrationRequest, Position } from '../types';

export const RegistrationRequestsPage: React.FC = () => {
  const { user, addToast } = useApp();
  const [requests, setRequests] = useState<EmployeeRegistrationRequest[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [activatedCredentials, setActivatedCredentials] = useState<{ matricule: string; tempPassword: string } | null>(null);

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    matricule: '',
    department_id: '',
    position_id: '',
    manager_id: '',
    role_code: 'EMPLOYEE',
    contract_type: 'CDI',
    base_salary_mad: 9000,
    hire_date: new Date().toISOString().slice(0, 10),
  });

  const load = async () => {
    try {
      const [regRes, deptRes, empRes] = await Promise.all([
        apiRequest<{ requests: EmployeeRegistrationRequest[] }>('/api/registration-requests'),
        apiRequest<{ departments: Department[]; positions: Position[] }>('/api/departments'),
        apiRequest<{ employees: Employee[] }>('/api/employees'),
      ]);
      setRequests(regRes.requests);
      setDepartments(deptRes.departments);
      setPositions(deptRes.positions);
      setEmployees(empRes.employees);
      if (!form.department_id && deptRes.departments[0]) {
        const firstDept = deptRes.departments[0].id;
        const firstPos = deptRes.positions.find((p) => p.department_id === firstDept)?.id || deptRes.positions[0]?.id || '';
        setForm((f) => ({ ...f, department_id: firstDept, position_id: firstPos }));
      }
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/registration-requests', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      addToast('Demande créée et notifiée au Responsable RH.', 'success');
      setModalOpen(false);
      await load();
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  };

  const handleReview = async (id: string, decision: 'approved' | 'rejected') => {
    try {
      const res = await apiRequest<{ decision: string; matricule?: string; tempPassword?: string }>(
        `/api/registration-requests/${id}/review`,
        {
          method: 'POST',
          body: JSON.stringify({ decision }),
        }
      );
      if (decision === 'approved' && res.tempPassword) {
        setActivatedCredentials({ matricule: res.matricule || '', tempPassword: res.tempPassword });
      }
      addToast(decision === 'approved' ? 'Compte employé activé.' : 'Demande refusée.', 'success');
      await load();
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  };

  const columns: ColumnDef<EmployeeRegistrationRequest>[] = [
    {
      key: 'candidate',
      header: 'Nouvel employé',
      render: (r) => (
        <div>
          <div className="font-semibold text-slate-900 dark:text-white">{r.first_name} {r.last_name}</div>
          <div className="text-xs text-slate-500 font-mono">{r.matricule} · {r.email}</div>
        </div>
      ),
    },
    {
      key: 'dept',
      header: 'Affectation',
      render: (r) => (
        <div className="text-xs">
          <div className="font-medium">{r.department_name}</div>
          <div className="text-slate-500">{r.position_title} ({r.contract_type})</div>
        </div>
      ),
    },
    { key: 'hire', header: 'Embauche', render: (r) => <span className="font-mono text-xs tabular-nums">{r.hire_date}</span> },
    { key: 'status', header: 'Statut', render: (r) => <StatusText status={r.status} /> },
    {
      key: 'actions',
      header: 'Validation RH',
      align: 'right',
      render: (r) =>
        r.status === 'pending' && user?.role_code === 'HR_MANAGER' ? (
          <div className="inline-flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleReview(r.id, 'approved')}
              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium inline-flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" /> Accepter
            </button>
            <button
              type="button"
              onClick={() => handleReview(r.id, 'rejected')}
              className="px-2.5 py-1.5 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-xs font-medium inline-flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" /> Refuser
            </button>
          </div>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Demandes d’ajout d’employés</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Workflow sécurisé : L’Administrateur crée la demande → le Responsable RH valide → mot de passe temporaire généré.
          </p>
        </div>
        {user?.role_code === 'COMPANY_ADMIN' && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Nouvelle demande d’ajout</span>
          </button>
        )}
      </div>

      {activatedCredentials && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm">
            <div className="font-semibold text-emerald-800 dark:text-emerald-300">Compte employé activé (changement de mot de passe requis à la 1ʳᵉ connexion)</div>
            <div className="mt-1 font-mono text-xs text-slate-700 dark:text-slate-300">
              Matricule : <strong>{activatedCredentials.matricule}</strong> · Mot de passe temporaire : <strong>{activatedCredentials.tempPassword}</strong>
            </div>
          </div>
          <button type="button" onClick={() => setActivatedCredentials(null)} className="text-xs text-slate-500 hover:text-slate-800">
            Fermer
          </button>
        </div>
      )}

      <DataTable
        data={requests}
        columns={columns}
        loading={loading}
        searchPlaceholder="Rechercher par nom ou matricule…"
        searchFilter={(r, q) => `${r.first_name} ${r.last_name}`.toLowerCase().includes(q) || r.matricule.toLowerCase().includes(q)}
      />

      <Modal open={modalOpen} title="Créer une demande d’ajout d’employé" onClose={() => setModalOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Prénom</label>
              <input required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Nom</label>
              <input required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Email professionnel</label>
              <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Matricule unique</label>
              <input required value={form.matricule} onChange={(e) => setForm({ ...form, matricule: e.target.value })} placeholder="ATL-030" className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Département</label>
              <select
                value={form.department_id}
                onChange={(e) => {
                  const deptId = e.target.value;
                  const pos = positions.find((p) => p.department_id === deptId)?.id || form.position_id;
                  setForm({ ...form, department_id: deptId, position_id: pos });
                }}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Poste</label>
              <select value={form.position_id} onChange={(e) => setForm({ ...form, position_id: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800">
                {positions
                  .filter((p) => p.department_id === form.department_id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Rôle</label>
              <select value={form.role_code} onChange={(e) => setForm({ ...form, role_code: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800">
                <option value="EMPLOYEE">Employé</option>
                <option value="MANAGER">Manager</option>
                <option value="HR_MANAGER">Responsable RH</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Contrat</label>
              <select value={form.contract_type} onChange={(e) => setForm({ ...form, contract_type: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800">
                <option value="CDI">CDI</option>
                <option value="CDD">CDD</option>
                <option value="ANAPEC">ANAPEC</option>
                <option value="Stage">Stage</option>
                <option value="Intérim">Intérim</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Salaire (MAD)</label>
              <input type="number" min={3000} value={form.base_salary_mad} onChange={(e) => setForm({ ...form, base_salary_mad: Number(e.target.value) })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Manager</label>
              <select value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800">
                <option value="">Aucun</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Date d’embauche</label>
              <input type="date" required value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800" />
            </div>
          </div>
          <button type="submit" className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg">
            Soumettre à la Direction RH
          </button>
        </form>
      </Modal>
    </div>
  );
};
