import React, { useEffect, useState } from 'react';
import { Plus, AlertTriangle, RefreshCw, Archive, Download } from 'lucide-react';
import { apiRequest } from '../services/api';
import { useApp } from '../contexts/AppContext';
import type { Contract, Employee } from '../types';
import { DataTable, type ColumnDef } from '../components/ui/DataTable';
import { StatusText } from '../components/ui/StatusText';
import { ConfirmModal, Modal } from '../components/ui/ConfirmModal';
import { formatMad } from '../utils/i18n';
import { exportToExcel } from '../utils/exportUtils';

interface ContractAlerts {
  days7: Contract[];
  days15: Contract[];
  days30: Contract[];
}

export const ContractsPage: React.FC = () => {
  const { user, addToast } = useApp();
  const canEdit = ['COMPANY_ADMIN', 'HR_MANAGER'].includes(user?.role_code || '');

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [alerts, setAlerts] = useState<ContractAlerts>({ days7: [], days15: [], days30: [] });
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [renewTarget, setRenewTarget] = useState<Contract | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Contract | null>(null);

  const [form, setForm] = useState({
    employee_id: '',
    contract_type: 'CDI' as Contract['contract_type'],
    start_date: new Date().toISOString().slice(0, 10),
    end_date: '',
    salary_mad: 8500,
    weekly_hours: 44,
    notes: '',
  });

  const loadContracts = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ contracts: Contract[]; alerts: ContractAlerts }>('/api/contracts');
      setContracts(res.contracts);
      setAlerts(res.alerts);
      if (canEdit) {
        const empRes = await apiRequest<{ employees: Employee[] }>('/api/employees');
        setEmployees(empRes.employees.filter((e) => e.status !== 'archived'));
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur chargement contrats', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContracts();
  }, []);

  const openCreate = () => {
    setRenewTarget(null);
    setForm({
      employee_id: employees[0]?.id || '',
      contract_type: 'CDI',
      start_date: new Date().toISOString().slice(0, 10),
      end_date: '',
      salary_mad: 8500,
      weekly_hours: 44,
      notes: '',
    });
    setModalOpen(true);
  };

  const openRenew = (ctr: Contract) => {
    setRenewTarget(ctr);
    const nextEnd = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);
    setForm({
      employee_id: ctr.employee_id,
      contract_type: ctr.contract_type,
      start_date: new Date().toISOString().slice(0, 10),
      end_date: ctr.contract_type === 'CDI' ? '' : nextEnd,
      salary_mad: ctr.salary_mad,
      weekly_hours: ctr.weekly_hours,
      notes: `Renouvellement de ${ctr.reference}`,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/contracts', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          renewFromContractId: renewTarget?.id || undefined,
        }),
      });
      addToast(renewTarget ? 'Contrat renouvelé' : 'Contrat créé', 'success');
      setModalOpen(false);
      loadContracts();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur enregistrement contrat', 'error');
    }
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    try {
      await apiRequest(`/api/contracts/${archiveTarget.id}/archive`, { method: 'POST' });
      addToast('Contrat archivé', 'success');
      setArchiveTarget(null);
      loadContracts();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur archivage', 'error');
    }
  };

  const filtered = contracts.filter((c) => typeFilter === 'all' || c.contract_type === typeFilter);

  const columns: ColumnDef<Contract>[] = [
    { key: 'ref', header: 'Référence', render: (c) => <span className="font-mono text-xs text-slate-600 dark:text-slate-300">{c.reference}</span>, sortValue: (c) => c.reference },
    {
      key: 'emp',
      header: 'Employé',
      render: (c) => (
        <div>
          <div className="font-medium text-slate-900 dark:text-white">{c.employee_name}</div>
          <div className="text-xs text-slate-500">
            {c.matricule} · {c.department_name}
          </div>
        </div>
      ),
      sortValue: (c) => c.employee_name || '',
    },
    { key: 'type', header: 'Type', render: (c) => <span className="font-medium">{c.contract_type}</span>, sortValue: (c) => c.contract_type },
    {
      key: 'dates',
      header: 'Période',
      render: (c) => (
        <span className="text-xs tabular-nums">
          {c.start_date} → {c.end_date || 'Durée indéterminée'}
        </span>
      ),
    },
    { key: 'salary', header: 'Salaire base', align: 'right', render: (c) => formatMad(c.salary_mad), sortValue: (c) => c.salary_mad },
    {
      key: 'status',
      header: 'Statut',
      render: (c) => (
        <div>
          <StatusText status={c.status} />
          {c.days_remaining !== null && c.days_remaining !== undefined && c.days_remaining >= 0 && c.status !== 'archived' && (
            <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">J-{c.days_remaining}</div>
          )}
        </div>
      ),
      sortValue: (c) => c.status,
    },
    ...(canEdit
      ? [
          {
            key: 'actions',
            header: 'Actions',
            align: 'right' as const,
            render: (c: Contract) => (
              <div className="inline-flex items-center gap-2">
                {c.status !== 'archived' && (
                  <>
                    <button
                      type="button"
                      onClick={() => openRenew(c)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Renouveler
                    </button>
                    <button
                      type="button"
                      onClick={() => setArchiveTarget(c)}
                      className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-600"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      Archiver
                    </button>
                  </>
                )}
              </div>
            ),
          },
        ]
      : []),
  ];

  const alertTotal = alerts.days7.length + alerts.days15.length + alerts.days30.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            {user?.role_code === 'EMPLOYEE' ? 'Mes contrats' : 'Gestion des Contrats'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Suivi CDI, CDD, Stage, Intérim, ANAPEC et alertes d’échéance 30 / 15 / 7 jours
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              exportToExcel(
                'contrats_plushr',
                'Contrats',
                filtered.map((c) => ({
                  Référence: c.reference,
                  Employé: c.employee_name,
                  Matricule: c.matricule,
                  Type: c.contract_type,
                  Début: c.start_date,
                  Fin: c.end_date || 'CDI',
                  'Salaire (MAD)': c.salary_mad,
                  Statut: c.status,
                }))
              )
            }
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
            >
              <Plus className="w-4 h-4" />
              Nouveau contrat
            </button>
          )}
        </div>
      </div>

      {alertTotal > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Alertes d’expiration de contrats ({alertTotal})
              </div>
              <div className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                ≤ 7 jours : <strong>{alerts.days7.length}</strong> · 8–15 jours : <strong>{alerts.days15.length}</strong> · 16–30 jours :{' '}
                <strong>{alerts.days30.length}</strong>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-amber-900 dark:text-amber-200">
            {[...alerts.days7, ...alerts.days15, ...alerts.days30].slice(0, 3).map((c) => (
              <span key={c.id} className="font-medium underline">
                {c.employee_name} (J-{c.days_remaining})
              </span>
            ))}
          </div>
        </div>
      )}

      <DataTable
        data={filtered}
        columns={columns}
        loading={loading}
        searchPlaceholder="Rechercher par référence, employé, matricule…"
        searchFilter={(c, q) =>
          c.reference.toLowerCase().includes(q) ||
          (c.employee_name || '').toLowerCase().includes(q) ||
          (c.matricule || '').toLowerCase().includes(q)
        }
        toolbarExtras={
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
          >
            <option value="all">Tous les types</option>
            <option value="CDI">CDI</option>
            <option value="CDD">CDD</option>
            <option value="Stage">Stage</option>
            <option value="Intérim">Intérim</option>
            <option value="ANAPEC">ANAPEC</option>
          </select>
        }
      />

      <Modal
        open={modalOpen}
        title={renewTarget ? `Renouveler contrat — ${renewTarget.employee_name}` : 'Créer un contrat'}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {!renewTarget && (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Employé *</label>
              <select
                required
                value={form.employee_id}
                onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name} ({emp.matricule})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Type de contrat</label>
              <select
                value={form.contract_type}
                onChange={(e) => setForm({ ...form, contract_type: e.target.value as Contract['contract_type'] })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="CDI">CDI</option>
                <option value="CDD">CDD</option>
                <option value="Stage">Stage</option>
                <option value="Intérim">Intérim</option>
                <option value="ANAPEC">ANAPEC</option>
                <option value="Autre">Autre</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Salaire mensuel (MAD)</label>
              <input
                type="number"
                required
                min={1000}
                value={form.salary_mad}
                onChange={(e) => setForm({ ...form, salary_mad: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Date de début *</label>
              <input
                type="date"
                required
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            {form.contract_type !== 'CDI' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Date de fin</label>
                <input
                  type="date"
                  required
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Volume horaire hebdomadaire</label>
              <input
                type="number"
                min={10}
                max={60}
                value={form.weekly_hours}
                onChange={(e) => setForm({ ...form, weekly_hours: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg">
              Annuler
            </button>
            <button type="submit" className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">
              Enregistrer
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(archiveTarget)}
        title="Archiver ce contrat"
        message={`Confirmer l'archivage du contrat ${archiveTarget?.reference} (${archiveTarget?.employee_name}) ?`}
        confirmLabel="Archiver"
        danger
        onConfirm={handleArchive}
        onClose={() => setArchiveTarget(null)}
      />
    </div>
  );
};
