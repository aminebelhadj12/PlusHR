import React, { useEffect, useState } from 'react';
import { Wallet, CheckCircle2, FileDown, Plus, Download, Info } from 'lucide-react';
import { apiRequest } from '../services/api';
import { useApp } from '../contexts/AppContext';
import type { CompanySettings, PayrollItem, PayrollRun } from '../types';
import { DataTable, type ColumnDef } from '../components/ui/DataTable';
import { StatusText } from '../components/ui/StatusText';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { formatMad } from '../utils/i18n';
import { exportPayslipPdf, exportToExcel } from '../utils/exportUtils';

interface PayslipRow {
  id: string;
  company_id: string;
  payroll_item_id: string;
  employee_id: string;
  period_label: string;
  reference: string;
  issued_at: string;
  employee_name: string;
  matricule: string;
  item?: PayrollItem;
}

export const PayrollPage: React.FC = () => {
  const { user, addToast } = useApp();
  const isHr = user?.role_code === 'HR_MANAGER';
  const isEmployee = user?.role_code === 'EMPLOYEE';

  const [payrolls, setPayrolls] = useState<PayrollRun[]>([]);
  const [payslips, setPayslips] = useState<PayslipRow[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [defaultBonus, setDefaultBonus] = useState<number>(0);
  const [validateTarget, setValidateTarget] = useState<PayrollRun | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ payrolls: PayrollRun[]; payslips: PayslipRow[]; settings: CompanySettings }>('/api/payroll');
      setPayrolls(res.payrolls);
      setPayslips(res.payslips);
      setSettings(res.settings);
      if (res.payrolls.length > 0 && !selectedRunId) {
        setSelectedRunId(res.payrolls[0].id);
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur chargement paie', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest<{ payrollId: string }>('/api/payroll/generate', {
        method: 'POST',
        body: JSON.stringify({ month, year, defaultBonus }),
      });
      addToast(`Paie ${String(month).padStart(2, '0')}/${year} générée en brouillon`, 'success');
      setSelectedRunId(res.payrollId);
      loadData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur génération paie', 'error');
    }
  };

  const handleValidate = async () => {
    if (!validateTarget) return;
    try {
      await apiRequest(`/api/payroll/${validateTarget.id}/validate`, { method: 'POST' });
      addToast('Paie validée et bulletins confidentiels émis', 'success');
      setValidateTarget(null);
      loadData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur validation paie', 'error');
    }
  };

  const activeRun = payrolls.find((p) => p.id === selectedRunId) || payrolls[0] || null;

  const itemColumns: ColumnDef<PayrollItem>[] = [
    { key: 'matricule', header: 'Matricule', render: (i) => <span className="font-mono text-xs">{i.matricule}</span>, sortValue: (i) => i.matricule || '' },
    {
      key: 'emp',
      header: 'Employé',
      render: (i) => (
        <div>
          <div className="font-medium text-slate-900 dark:text-white">{i.employee_name}</div>
          <div className="text-xs text-slate-500">{i.department_name}</div>
        </div>
      ),
      sortValue: (i) => i.employee_name || '',
    },
    { key: 'base', header: 'Salaire base', align: 'right', render: (i) => formatMad(i.base_salary), sortValue: (i) => i.base_salary },
    { key: 'ot', header: 'Heures sup.', align: 'right', render: (i) => formatMad(i.overtime_pay) },
    { key: 'gross', header: 'Salaire Brut', align: 'right', render: (i) => formatMad(i.gross_salary), sortValue: (i) => i.gross_salary },
    { key: 'contrib', header: 'Retenues config.', align: 'right', render: (i) => formatMad(i.configured_contributions) },
    {
      key: 'net',
      header: 'Net à payer',
      align: 'right',
      render: (i) => <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatMad(i.net_salary)}</span>,
      sortValue: (i) => i.net_salary,
    },
  ];

  const payslipColumns: ColumnDef<PayslipRow>[] = [
    { key: 'ref', header: 'Référence', render: (p) => <span className="font-mono text-xs">{p.reference}</span>, sortValue: (p) => p.reference },
    { key: 'period', header: 'Période', render: (p) => <span className="font-medium">{p.period_label}</span>, sortValue: (p) => p.period_label },
    { key: 'emp', header: 'Employé', render: (p) => `${p.employee_name} (${p.matricule})`, sortValue: (p) => p.employee_name },
    {
      key: 'gross',
      header: 'Brut',
      align: 'right',
      render: (p) => (p.item ? formatMad(p.item.gross_salary) : '—'),
    },
    {
      key: 'net',
      header: 'Net à payer',
      align: 'right',
      render: (p) => (
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
          {p.item ? formatMad(p.item.net_salary) : '—'}
        </span>
      ),
    },
    {
      key: 'pdf',
      header: 'Bulletin PDF',
      align: 'right',
      render: (p) => (
        <button
          type="button"
          onClick={() => {
            if (!p.item) return;
            exportPayslipPdf({
              companyName: user?.company_name || '+HR',
              reference: p.reference,
              periodLabel: p.period_label,
              employeeName: p.employee_name,
              matricule: p.matricule,
              baseSalary: p.item.base_salary,
              bonuses: p.item.bonuses,
              overtimePay: p.item.overtime_pay,
              allowances: p.item.allowances,
              deductions: p.item.deductions,
              contributions: p.item.configured_contributions,
              grossSalary: p.item.gross_salary,
              netSalary: p.item.net_salary,
            });
          }}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline"
        >
          <FileDown className="w-3.5 h-3.5" />
          Télécharger PDF
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            {isEmployee ? 'Mes bulletins de paie confidentiels' : 'Salaires & Paie'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Calcul configurable en MAD, validation RH et génération de bulletins PDF
          </p>
        </div>
      </div>

      {settings && !isEmployee && (
        <div className="bg-blue-50/70 dark:bg-blue-950/25 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex items-start gap-3 text-xs text-blue-900 dark:text-blue-200">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
          <div>
            Paramètres de paie actifs de l’entreprise : Cotisations configurées <strong>{settings.payroll_contribution_rate}%</strong> · Retenue fiscale configurée{' '}
            <strong>{settings.payroll_tax_rate}%</strong> · Majoration heures sup. <strong>×{settings.overtime_multiplier}</strong> (modifiables dans Paramètres).
          </div>
        </div>
      )}

      {isHr && (
        <form
          onSubmit={handleGenerate}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-end gap-3"
        >
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Mois</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            >
              {Array.from({ length: 12 }).map((_, idx) => (
                <option key={idx + 1} value={idx + 1}>
                  {String(idx + 1).padStart(2, '0')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Année</label>
            <input
              type="number"
              min={2022}
              max={2035}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-24 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Prime par défaut (MAD)</label>
            <input
              type="number"
              min={0}
              value={defaultBonus}
              onChange={(e) => setDefaultBonus(Number(e.target.value))}
              className="w-36 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
          >
            <Plus className="w-4 h-4" />
            Générer le lot de paie
          </button>
        </form>
      )}

      {!isEmployee && payrolls.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Wallet className="w-5 h-5 text-blue-600" />
              <select
                value={activeRun?.id || ''}
                onChange={(e) => setSelectedRunId(e.target.value)}
                className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              >
                {payrolls.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    Période {String(pr.period_month).padStart(2, '0')}/{pr.period_year} ({pr.status})
                  </option>
                ))}
              </select>
              {activeRun && <StatusText status={activeRun.status} />}
            </div>

            {activeRun && (
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div>
                  <span className="text-slate-500 me-1">Brut total :</span>
                  <span className="font-semibold tabular-nums">{formatMad(activeRun.total_gross)}</span>
                </div>
                <div>
                  <span className="text-slate-500 me-1">Net total :</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {formatMad(activeRun.total_net)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    exportToExcel(
                      `paie_${activeRun.period_month}_${activeRun.period_year}`,
                      'Paie',
                      (activeRun.items || []).map((i) => ({
                        Matricule: i.matricule,
                        Employé: i.employee_name,
                        Département: i.department_name,
                        Base: i.base_salary,
                        'Heures Sup': i.overtime_pay,
                        Brut: i.gross_salary,
                        Retenues: i.configured_contributions,
                        Net: i.net_salary,
                      }))
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Download className="w-3.5 h-3.5" />
                  Excel
                </button>
                {isHr && activeRun.status === 'draft' && (
                  <button
                    type="button"
                    onClick={() => setValidateTarget(activeRun)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Valider et émettre bulletins
                  </button>
                )}
              </div>
            )}
          </div>

          <DataTable
            data={activeRun?.items || []}
            columns={itemColumns}
            loading={loading}
            searchPlaceholder="Rechercher employé ou matricule…"
            searchFilter={(i, q) =>
              (i.employee_name || '').toLowerCase().includes(q) || (i.matricule || '').toLowerCase().includes(q)
            }
          />
        </div>
      )}

      <div className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
          Bulletins de paie émis ({payslips.length})
        </h2>
        <DataTable
          data={payslips}
          columns={payslipColumns}
          loading={loading}
          searchPlaceholder="Rechercher par référence, période ou employé…"
          searchFilter={(p, q) =>
            p.reference.toLowerCase().includes(q) ||
            p.period_label.toLowerCase().includes(q) ||
            p.employee_name.toLowerCase().includes(q)
          }
          emptyTitle="Aucun bulletin émis pour le moment"
        />
      </div>

      <ConfirmModal
        open={Boolean(validateTarget)}
        title="Valider la paie mensuelle"
        message={`Confirmer la validation de la paie ${String(validateTarget?.period_month || 0).padStart(2, '0')}/${
          validateTarget?.period_year
        } ? Les bulletins confidentiels seront immédiatement générés et notifiés aux employés.`}
        confirmLabel="Valider et émettre"
        onConfirm={handleValidate}
        onClose={() => setValidateTarget(null)}
      />
    </div>
  );
};
