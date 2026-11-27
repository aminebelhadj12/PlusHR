import React, { useEffect, useState } from 'react';
import { BarChart3, ShieldAlert, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar } from 'recharts';
import { apiRequest } from '../services/api';
import { useApp } from '../contexts/AppContext';

interface AiAnalyticsPayload {
  daysObserved: number;
  sufficientHistoryForForecast: boolean;
  forecastNotice: string;
  ethicalNotice: string;
  deptAnalytics: Array<{
    department: string;
    headcount: number;
    absenteeismRate: number;
    lateRate: number;
    overtimeHours: number;
    workloadRatio: number;
  }>;
  anomalies: Array<{
    type: string;
    department: string;
    detail: string;
    severity: 'info' | 'warning';
  }>;
  trendSeries: Array<{
    date: string;
    absences: number;
    retards: number;
    overtimeHours: number;
  }>;
}

export const AiAnalyticsPage: React.FC = () => {
  const { addToast } = useApp();
  const [data, setData] = useState<AiAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<AiAnalyticsPayload>('/api/ai/analytics')
      .then(setData)
      .catch((err) => addToast(err instanceof Error ? err.message : 'Erreur chargement analytique', 'error'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl animate-pulse" />
        <div className="h-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Analyse IA & Tendances RH</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Indicateurs descriptifs, détection d’anomalies opérationnelles et garde-fous éthiques
        </p>
      </div>

      {/* Data sufficiency & ethical banners */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div
          className={`rounded-xl p-4 border flex items-start gap-3 text-xs leading-relaxed ${
            data.sufficientHistoryForForecast
              ? 'bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : 'bg-amber-50/70 dark:bg-amber-950/25 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
          }`}
        >
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold mb-0.5">Suffisance statistique ({data.daysObserved} jours observés)</div>
            <div>{data.forecastNotice}</div>
          </div>
        </div>

        <div className="rounded-xl p-4 border bg-blue-50/70 dark:bg-blue-950/25 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200 flex items-start gap-3 text-xs leading-relaxed">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
          <div>
            <div className="font-semibold mb-0.5">Gouvernance & Éthique RH</div>
            <div>{data.ethicalNotice}</div>
          </div>
        </div>
      </div>

      {/* Anomalies */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-2 font-display text-base font-semibold text-slate-900 dark:text-white mb-4">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          Anomalies opérationnelles détectées ({data.anomalies.length})
        </div>
        {data.anomalies.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span>Aucune dérive critique détectée sur les indicateurs de présence et charge.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.anomalies.map((a, i) => (
              <div
                key={i}
                className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 flex items-start gap-3"
              >
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    {a.type} · <span className="text-amber-700 dark:text-amber-300">{a.department}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{a.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="dashboard-panels grid gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white mb-4">
            Évolution des absences, retards et heures sup.
          </h2>
          <div className="chart-viewport">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={data.trendSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="absences" name="Absences" stroke="#DC2626" strokeWidth={2} />
                <Line type="monotone" dataKey="retards" name="Retards" stroke="#D97706" strokeWidth={2} />
                <Line type="monotone" dataKey="overtimeHours" name="Heures sup (h)" stroke="#2563EB" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white mb-4">
            Taux par département (%) & Charge tâches
          </h2>
          <div className="chart-viewport">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={data.deptAnalytics}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="department" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="absenteeismRate" name="Absentéisme (%)" fill="#DC2626" radius={[4, 4, 0, 0]} />
                <Bar dataKey="lateRate" name="Retard (%)" fill="#D97706" radius={[4, 4, 0, 0]} />
                <Bar dataKey="workloadRatio" name="Charge tâches (%)" fill="#2563EB" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Department table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 font-display text-sm font-semibold">
          Synthèse analytique par département
        </div>
        <div className="responsive-scroll" role="region" aria-label="Indicateurs par département" tabIndex={0}>
          <table className="w-full text-sm text-start">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 text-start">Département</th>
                <th className="px-4 py-3 text-end">Effectif</th>
                <th className="px-4 py-3 text-end">Taux absence</th>
                <th className="px-4 py-3 text-end">Taux retard</th>
                <th className="px-4 py-3 text-end">Heures sup.</th>
                <th className="px-4 py-3 text-end">Charge tâches</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
              {data.deptAnalytics.map((row) => (
                <tr key={row.department}>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{row.department}</td>
                  <td className="px-4 py-3 text-end">{row.headcount}</td>
                  <td className="px-4 py-3 text-end">{row.absenteeismRate}%</td>
                  <td className="px-4 py-3 text-end">{row.lateRate}%</td>
                  <td className="px-4 py-3 text-end">{row.overtimeHours} h</td>
                  <td className="px-4 py-3 text-end">{row.workloadRatio}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
