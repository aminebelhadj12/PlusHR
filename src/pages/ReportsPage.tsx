import React, { useEffect, useState } from 'react';
import { FileBarChart, Download, Printer } from 'lucide-react';
import { apiRequest } from '../services/api';
import { useApp } from '../contexts/AppContext';
import type { Department } from '../types';
import { exportToCsv, exportToExcel, exportToPdf } from '../utils/exportUtils';

const REPORT_TYPES = [
  { key: 'attendance', label: 'Rapport des présences' },
  { key: 'absences', label: 'Rapport des absences' },
  { key: 'lates', label: 'Rapport des retards' },
  { key: 'leaves', label: 'Rapport des congés' },
  { key: 'exits', label: 'Rapport des sorties' },
  { key: 'hours', label: 'Rapport des heures travaillées' },
  { key: 'overtime', label: 'Rapport des heures supplémentaires' },
  { key: 'contracts', label: 'Rapport des contrats' },
  { key: 'payroll', label: 'Rapport des salaires' },
  { key: 'workload', label: 'Rapport de charge de travail' },
  { key: 'headcount', label: 'Rapport d’effectifs par département' },
];

interface ReportPayload {
  companyName: string;
  generatedAt: string;
  reportType: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
}

export const ReportsPage: React.FC = () => {
  const { addToast } = useApp();

  const [reportType, setReportType] = useState('attendance');
  const [departmentId, setDepartmentId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const loadReport = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ type: reportType });
      if (departmentId) qs.set('departmentId', departmentId);
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const res = await apiRequest<ReportPayload>(`/api/reports?${qs.toString()}`);
      setReport(res);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur génération rapport', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    apiRequest<{ departments: Department[] }>('/api/departments')
      .then((res) => setDepartments(res.departments))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadReport();
  }, [reportType, departmentId, from, to]);

  const currentLabel = REPORT_TYPES.find((r) => r.key === reportType)?.label || 'Rapport RH';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Rapports & Exports RH</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            11 rapports normalisés avec aperçu avant impression et exports PDF / Excel / CSV
          </p>
        </div>

        {report && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                exportToPdf({
                  filename: `plushr_${reportType}`,
                  title: currentLabel,
                  companyName: report.companyName,
                  columns: report.columns,
                  rows: report.rows,
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Download className="w-3.5 h-3.5" />
              PDF
            </button>
            <button
              type="button"
              onClick={() => exportToExcel(`plushr_${reportType}`, currentLabel, report.rows)}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Download className="w-3.5 h-3.5" />
              Excel
            </button>
            <button
              type="button"
              onClick={() => exportToCsv(`plushr_${reportType}`, report.rows)}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimer
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 no-print">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Type de rapport</label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          >
            {REPORT_TYPES.map((rt) => (
              <option key={rt.key} value={rt.key}>
                {rt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Département</label>
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          >
            <option value="">Tous les départements</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Date début</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Date fin</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          />
        </div>
      </div>

      {/* Print Preview Document */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center gap-2.5">
            <FileBarChart className="w-5 h-5 text-blue-600" />
            <div>
              <div className="font-display font-semibold text-slate-900 dark:text-white">
                +HR · {report?.companyName || ''} — {currentLabel}
              </div>
              <div className="text-xs text-slate-500">
                {report ? `${report.rows.length} ligne(s) · Généré le ${new Date(report.generatedAt).toLocaleString('fr-FR')}` : ''}
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-9 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
            ))}
          </div>
        ) : !report || report.rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-400">Aucune donnée pour ces critères.</div>
        ) : (
          <div className="responsive-scroll" role="region" aria-label="Données du rapport" tabIndex={0}>
            <table className="w-full text-sm text-start">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  {report.columns.map((col) => (
                    <th key={col} className="px-4 py-3 whitespace-nowrap text-start">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {report.rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                    {report.columns.map((col) => (
                      <td key={col} className="px-4 py-2.5 text-slate-700 dark:text-slate-200 whitespace-nowrap tabular-nums">
                        {String(row[col] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
