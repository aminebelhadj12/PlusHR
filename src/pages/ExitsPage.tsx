import React, { useEffect, useState } from 'react';
import { Check, Plus, X, Info } from 'lucide-react';
import { apiRequest } from '../services/api';
import { useApp } from '../contexts/AppContext';
import { DataTable, ColumnDef } from '../components/ui/DataTable';
import { StatusText } from '../components/ui/StatusText';
import { Modal } from '../components/ui/ConfirmModal';
import type { ExitRequest } from '../types';

export const ExitsPage: React.FC = () => {
  const { user, addToast } = useApp();
  const [requests, setRequests] = useState<ExitRequest[]>([]);
  const [exitTypes, setExitTypes] = useState<Array<{ id: string; name_fr: string }>>([]);
  const [stats, setStats] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const [form, setForm] = useState({
    exit_type_id: '',
    date: new Date().toISOString().slice(0, 10),
    departure_time: '14:00',
    return_time: '16:00',
    reason: '',
  });
  const [attachment, setAttachment] = useState<File | null>(null);

  const load = async () => {
    try {
      const res = await apiRequest<any>('/api/exits');
      setRequests(res.requests);
      setExitTypes(res.exitTypes);
      setStats(res.stats);
      setSettings(res.settings);
      if (!form.exit_type_id && res.exitTypes[0]) {
        setForm((f) => ({ ...f, exit_type_id: res.exitTypes[0].id }));
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
      fd.append('exit_type_id', form.exit_type_id);
      fd.append('date', form.date);
      fd.append('departure_time', form.departure_time);
      fd.append('return_time', form.return_time);
      fd.append('reason', form.reason);
      if (attachment) fd.append('attachment', attachment);

      await apiRequest('/api/exits', { method: 'POST', body: fd });
      addToast('Demande d’autorisation de sortie envoyée.', 'success');
      setModalOpen(false);
      await load();
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  };

  const handleReview = async (id: string, decision: 'approve' | 'reject') => {
    try {
      await apiRequest(`/api/exits/${id}/review`, { method: 'POST', body: JSON.stringify({ decision }) });
      addToast('Décision enregistrée.', 'success');
      await load();
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  };

  const canReview = (r: ExitRequest) => {
    if (r.status === 'pending_manager' && ['MANAGER', 'COMPANY_ADMIN', 'HR_MANAGER'].includes(user?.role_code || '')) return true;
    if (r.status === 'pending_hr' && user?.role_code === 'HR_MANAGER') return true;
    return false;
  };

  const columns: ColumnDef<ExitRequest>[] = [
    ...(user?.role_code !== 'EMPLOYEE'
      ? [
          {
            key: 'emp',
            header: 'Employé',
            render: (r: ExitRequest) => (
              <div>
                <div className="font-medium text-slate-900 dark:text-white">{r.employee_name}</div>
                <div className="text-xs text-slate-500">{r.department_name}</div>
              </div>
            ),
          },
        ]
      : []),
    { key: 'type', header: 'Type de sortie', render: (r) => r.exit_type_name },
    { key: 'date', header: 'Date', render: (r) => <span className="font-mono text-xs tabular-nums">{r.date}</span> },
    {
      key: 'hours',
      header: 'Créneau / Durée',
      render: (r) => (
        <span className="font-mono text-xs tabular-nums">
          {r.departure_time}–{r.return_time} ({Math.round((r.duration_minutes / 60) * 10) / 10}h)
        </span>
      ),
    },
    { key: 'reason', header: 'Motif', render: (r) => <span className="text-xs line-clamp-2 max-w-xs">{r.reason}</span> },
    { key: 'status', header: 'Statut', render: (r) => <StatusText status={r.status} /> },
    {
      key: 'actions',
      header: 'Validation',
      align: 'right',
      render: (r) =>
        canReview(r) ? (
          <div className="inline-flex items-center gap-1.5">
            <button type="button" onClick={() => handleReview(r.id, 'approve')} className="px-2.5 py-1 bg-emerald-600 text-white rounded text-xs font-medium inline-flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Valider
            </button>
            <button type="button" onClick={() => handleReview(r.id, 'reject')} className="px-2.5 py-1 border border-red-200 text-red-600 rounded text-xs font-medium inline-flex items-center gap-1">
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
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Autorisations de Sortie</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Sorties pendant les heures de travail, validation en deux étapes et règles configurables par entreprise
          </p>
        </div>
        {user?.employee_id && (
          <button type="button" onClick={() => setModalOpen(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg flex items-center gap-2">
            <Plus className="w-4 h-4" /> Demander une sortie
          </button>
        )}
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatBox label="Nombre de sorties" value={stats.totalExits} />
          <StatBox label="Total heures sortie" value={`${stats.totalExitHours}h`} />
          <StatBox label="Retards cumulés" value={stats.cumulativeLates} />
          <StatBox label="Départs anticipés" value={stats.earlyDepartures} />
          <StatBox label="Acceptées" value={stats.acceptedCount} tone="text-emerald-600" />
          <StatBox label="Refusées" value={stats.rejectedCount} tone="text-red-600" />
        </div>
      )}

      {settings && (
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
          <Info className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            Règles entreprise ({settings.enable_exit_rules ? 'Activées' : 'Désactivées'}) : Max {settings.exit_max_hours_per_day}h/jour · Seuil retard {settings.late_threshold_minutes} min · Conversion {settings.exit_conversion_hours}h cumulées = 1 jour de congé (modifiable dans Paramètres selon le droit applicable).
          </span>
        </div>
      )}

      <DataTable
        data={requests}
        columns={columns}
        loading={loading}
        searchPlaceholder="Rechercher employé ou motif…"
        searchFilter={(r, q) => (r.employee_name || '').toLowerCase().includes(q) || r.reason.toLowerCase().includes(q)}
      />

      <Modal open={modalOpen} title="Demande d’autorisation de sortie" onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1">Type de sortie</label>
            <select value={form.exit_type_id} onChange={(e) => setForm({ ...form, exit_type_id: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800">
              {exitTypes.map((et) => (
                <option key={et.id} value={et.id}>{et.name_fr}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Date</label>
              <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Départ</label>
              <input type="time" required value={form.departure_time} onChange={(e) => setForm({ ...form, departure_time: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Retour</label>
              <input type="time" required value={form.return_time} onChange={(e) => setForm({ ...form, return_time: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800" />
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
          <button type="submit" className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg">Soumettre la demande</button>
        </form>
      </Modal>
    </div>
  );
};

const StatBox: React.FC<{ label: string; value: string | number; tone?: string }> = ({ label, value, tone = 'text-slate-900 dark:text-white' }) => (
  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
    <div className="text-xs text-slate-500 truncate">{label}</div>
    <div className={`mt-1 font-mono text-xl font-bold tabular-nums ${tone}`}>{value}</div>
  </div>
);
