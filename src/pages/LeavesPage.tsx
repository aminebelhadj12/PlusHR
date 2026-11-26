import React, { useEffect, useState } from 'react';
import { Check, Plus, X, Trash2 } from 'lucide-react';
import { apiRequest } from '../services/api';
import { useApp } from '../contexts/AppContext';
import { DataTable, ColumnDef } from '../components/ui/DataTable';
import { StatusText } from '../components/ui/StatusText';
import { Modal } from '../components/ui/ConfirmModal';
import type { LeaveBalance, LeaveRequest, LeaveType } from '../types';

export const LeavesPage: React.FC = () => {
  const { user, addToast } = useApp();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const [form, setForm] = useState({ leave_type_id: '', start_date: '', end_date: '', reason: '' });
  const [attachment, setAttachment] = useState<File | null>(null);

  const load = async () => {
    try {
      const res = await apiRequest<{
        requests: LeaveRequest[];
        balances: LeaveBalance[];
        leaveTypes: LeaveType[];
      }>('/api/leaves');
      setRequests(res.requests);
      setBalances(res.balances);
      setLeaveTypes(res.leaveTypes);
      if (!form.leave_type_id && res.leaveTypes[0]) {
        setForm((f) => ({ ...f, leave_type_id: res.leaveTypes[0].id }));
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      fd.append('leave_type_id', form.leave_type_id);
      fd.append('start_date', form.start_date);
      fd.append('end_date', form.end_date);
      fd.append('reason', form.reason);
      if (attachment) fd.append('attachment', attachment);

      await apiRequest('/api/leaves', { method: 'POST', body: fd });
      addToast('Demande de congé soumise.', 'success');
      setModalOpen(false);
      setForm({ leave_type_id: leaveTypes[0]?.id || '', start_date: '', end_date: '', reason: '' });
      setAttachment(null);
      await load();
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  };

  const handleReview = async (id: string, decision: 'approve' | 'reject') => {
    try {
      await apiRequest(`/api/leaves/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      addToast(decision === 'approve' ? 'Demande validée.' : 'Demande refusée.', 'success');
      await load();
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await apiRequest(`/api/leaves/${id}/cancel`, { method: 'POST' });
      addToast('Demande annulée.', 'info');
      await load();
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  };

  const canActOnRow = (r: LeaveRequest) => {
    if (r.status === 'pending_manager' && ['MANAGER', 'COMPANY_ADMIN', 'HR_MANAGER'].includes(user?.role_code || '')) return true;
    if (r.status === 'pending_hr' && user?.role_code === 'HR_MANAGER') return true;
    return false;
  };

  const columns: ColumnDef<LeaveRequest>[] = [
    ...(user?.role_code !== 'EMPLOYEE'
      ? [
          {
            key: 'emp',
            header: 'Employé',
            render: (r: LeaveRequest) => (
              <div>
                <div className="font-medium text-slate-900 dark:text-white">{r.employee_name}</div>
                <div className="text-xs text-slate-500">{r.department_name}</div>
              </div>
            ),
          },
        ]
      : []),
    { key: 'type', header: 'Type de congé', render: (r) => <span className="font-medium">{r.leave_type_name}</span> },
    {
      key: 'dates',
      header: 'Période',
      render: (r) => <span className="font-mono text-xs tabular-nums">{r.start_date} → {r.end_date}</span>,
    },
    { key: 'days', header: 'Jours ouvrables', align: 'right', render: (r) => <span className="font-mono font-semibold tabular-nums">{r.working_days} j</span> },
    { key: 'reason', header: 'Motif', render: (r) => <span className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 max-w-xs">{r.reason}</span> },
    { key: 'status', header: 'Workflow (Manager → RH)', render: (r) => <StatusText status={r.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="inline-flex items-center gap-1.5">
          {canActOnRow(r) && (
            <>
              <button
                type="button"
                onClick={() => handleReview(r.id, 'approve')}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium inline-flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" /> Valider
              </button>
              <button
                type="button"
                onClick={() => handleReview(r.id, 'reject')}
                className="px-2.5 py-1 border border-red-200 text-red-600 hover:bg-red-50 rounded text-xs font-medium inline-flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" /> Refuser
              </button>
            </>
          )}
          {r.employee_id === user?.employee_id && ['pending_manager', 'pending_hr'].includes(r.status) && (
            <button
              type="button"
              onClick={() => handleCancel(r.id)}
              className="p-1.5 text-slate-400 hover:text-red-600"
              title="Annuler la demande"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  const myBalances = user?.employee_id ? balances.filter((b) => b.employee_id === user.employee_id) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Gestion des Congés</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Validation en deux étapes (Employé → Manager → Responsable RH) · Contrôle automatique de solde et chevauchement
          </p>
        </div>
        {user?.employee_id && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Nouvelle demande</span>
          </button>
        )}
      </div>

      {myBalances.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {myBalances.map((b) => (
            <div key={b.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-500 truncate">{b.leave_type_name}</div>
              <div className="mt-1.5 font-mono text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {b.remaining_days} <span className="text-xs font-normal text-slate-400">/ {b.allocated_days} j</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <DataTable
        data={requests}
        columns={columns}
        loading={loading}
        searchPlaceholder="Rechercher par employé ou type de congé…"
        searchFilter={(r, q) =>
          (r.employee_name || '').toLowerCase().includes(q) || (r.leave_type_name || '').toLowerCase().includes(q)
        }
      />

      <Modal open={modalOpen} title="Nouvelle demande de congé" onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1">Type de congé</label>
            <select
              required
              value={form.leave_type_id}
              onChange={(e) => setForm({ ...form, leave_type_id: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800"
            >
              {leaveTypes.map((lt) => (
                <option key={lt.id} value={lt.id}>{lt.name_fr}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Date de début</label>
              <input type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Date de fin</label>
              <input type="date" required value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Motif</label>
            <textarea required rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Justificatif (optionnel)</label>
            <input type="file" onChange={(e) => setAttachment(e.target.files?.[0] || null)} className="w-full text-xs" />
          </div>
          <button type="submit" className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg">
            Envoyer la demande
          </button>
        </form>
      </Modal>
    </div>
  );
};
