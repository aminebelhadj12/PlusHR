import React, { useEffect, useState } from 'react';
import { Plus, Power, ShieldAlert } from 'lucide-react';
import { apiRequest } from '../services/api';
import { useApp } from '../contexts/AppContext';
import { DataTable, ColumnDef } from '../components/ui/DataTable';
import { StatusText } from '../components/ui/StatusText';
import { Modal } from '../components/ui/ConfirmModal';
import { formatMad } from '../utils/i18n';

export const CompaniesPage: React.FC = () => {
  const { addToast } = useApp();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', city: 'Casablanca', industry: 'Industrie', adminName: '', adminEmail: '', plan_name: 'Business' });
  const [createdInfo, setCreatedInfo] = useState<{ adminEmail: string; tempPassword: string } | null>(null);

  const load = async () => {
    try {
      const res = await apiRequest('/api/platform/overview');
      setData(res);
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
      const res = await apiRequest<{ adminEmail: string; tempPassword: string }>('/api/platform/companies', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setCreatedInfo(res);
      addToast('Entreprise provisionnée avec succès.', 'success');
      setForm({ name: '', city: 'Casablanca', industry: 'Industrie', adminName: '', adminEmail: '', plan_name: 'Business' });
      await load();
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  };

  const handleToggle = async (id: string, current: string) => {
    const next = current === 'active' ? 'suspended' : 'active';
    try {
      await apiRequest(`/api/platform/companies/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      addToast(`Entreprise ${next === 'active' ? 'activée' : 'suspendue'}.`, 'success');
      await load();
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  };

  const handleIncident = async (id: string, status: string) => {
    try {
      await apiRequest(`/api/platform/incidents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      addToast('Statut incident mis à jour.', 'success');
      await load();
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  };

  const columns: ColumnDef<any>[] = [
    {
      key: 'name',
      header: 'Entreprise',
      sortValue: (r) => r.name,
      render: (r) => (
        <div>
          <div className="font-semibold text-slate-900 dark:text-white">{r.name}</div>
          <div className="text-xs text-slate-500">{r.industry} · {r.city}</div>
        </div>
      ),
    },
    {
      key: 'plan',
      header: 'Abonnement',
      render: (r) => (
        <div className="text-xs">
          <div className="font-medium">{r.subscription?.plan_name}</div>
          <div className="text-slate-500 tabular-nums">{formatMad(r.subscription?.price_mad || 0)} / {r.subscription?.billing_cycle}</div>
        </div>
      ),
    },
    { key: 'employees', header: 'Employés', align: 'right', sortValue: (r) => r.employee_count, render: (r) => r.employee_count },
    { key: 'status', header: 'Statut', render: (r) => <StatusText status={r.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <button
          type="button"
          onClick={() => handleToggle(r.id, r.status)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
            r.status === 'active'
              ? 'border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30'
              : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-900 dark:hover:bg-emerald-950/30'
          }`}
        >
          <Power className="w-3.5 h-3.5" />
          <span>{r.status === 'active' ? 'Suspendre' : 'Activer'}</span>
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Gestion des Entreprises (Multi-Tenant)</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Provisionnement des espaces clients, abonnements et incidents techniques</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreatedInfo(null);
            setModalOpen(true);
          }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>Nouvelle entreprise</span>
        </button>
      </div>

      <DataTable
        data={data?.companies || []}
        columns={columns}
        loading={loading}
        searchPlaceholder="Rechercher une entreprise ou ville…"
        searchFilter={(r, q) => r.name.toLowerCase().includes(q) || r.city.toLowerCase().includes(q)}
      />

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <ShieldAlert className="w-4 h-4 text-amber-600" />
          <h2 className="font-display text-base font-semibold">Incidents techniques plateforme</h2>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {(data?.incidents || []).map((inc: any) => (
            <div key={inc.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-white">{inc.title}</div>
                <div className="text-xs text-slate-500">Sévérité : {inc.severity} · {new Date(inc.reported_at).toLocaleDateString('fr-FR')}</div>
              </div>
              <div className="flex items-center gap-3">
                <StatusText status={inc.status} />
                {inc.status !== 'resolved' && (
                  <button
                    type="button"
                    onClick={() => handleIncident(inc.id, 'resolved')}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Marquer résolu
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Modal open={modalOpen} title="Créer un compte entreprise" onClose={() => setModalOpen(false)}>
        {createdInfo ? (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-sm">
              <div className="font-semibold text-emerald-800 dark:text-emerald-300">Entreprise créée avec succès</div>
              <p className="mt-2 text-xs text-slate-700 dark:text-slate-300">Identifiant Admin : <span className="font-mono font-semibold">{createdInfo.adminEmail}</span></p>
              <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">Mot de passe temporaire : <span className="font-mono font-semibold">{createdInfo.tempPassword}</span></p>
            </div>
            <button type="button" onClick={() => setModalOpen(false)} className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold">
              Fermer
            </button>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1">Nom de l’entreprise</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Ville</label>
                <input required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Plan</label>
                <select value={form.plan_name} onChange={(e) => setForm({ ...form, plan_name: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <option value="Starter">Starter (990 MAD/mois)</option>
                  <option value="Business">Business (2 400 MAD/mois)</option>
                  <option value="Enterprise">Enterprise (4 900 MAD/mois)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Nom Administrateur Entreprise</label>
              <input required value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Email professionnel Administrateur</label>
              <input type="email" required value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800" />
            </div>
            <button type="submit" className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg">
              Provisionner l’espace entreprise
            </button>
          </form>
        )}
      </Modal>
    </div>
  );
};
