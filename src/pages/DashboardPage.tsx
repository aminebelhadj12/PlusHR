import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  CalendarOff,
  FileWarning,
  Wallet,
  Building2,
  LogIn,
  LogOut,
  CheckCircle2,
  Megaphone,
  Video,
  ClipboardList,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { apiRequest } from '../services/api';
import { StatusText } from '../components/ui/StatusText';
import { formatMad } from '../utils/i18n';

const CHART_COLORS = ['#2563EB', '#16A34A', '#F59E0B', '#0F172A', '#64748B', '#DC2626'];

export const DashboardPage: React.FC = () => {
  const { user, addToast } = useApp();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [nowClock, setNowClock] = useState(new Date());
  const [punchBusy, setPunchBusy] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      const res = await apiRequest('/api/dashboard');
      setData(res);
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const id = setInterval(() => setNowClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const handleClock = async (action: 'check-in' | 'check-out') => {
    setPunchBusy(true);
    try {
      await apiRequest(`/api/attendance/${action}`, { method: 'POST', body: JSON.stringify({}) });
      addToast(action === 'check-in' ? 'Pointage d’entrée enregistré.' : 'Pointage de sortie enregistré.', 'success');
      await loadDashboard();
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setPunchBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="h-72 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
          <div className="h-72 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  // ======================== SUPER ADMIN DASHBOARD ========================
  if (user?.role_code === 'SUPER_ADMIN') {
    const { stats, companies, incidents, auditLogs } = data;
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Console Globale +HR</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Supervision multi-entreprises, abonnements et sécurité plateforme</p>
          </div>
          <Link
            to="/companies"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg whitespace-nowrap"
          >
            Gérer les entreprises
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard icon={Building2} label="Entreprises actives" value={`${stats.activeCompanies} / ${stats.totalCompanies}`} />
          <KpiCard icon={Users} label="Employés plateforme" value={stats.totalEmployees} />
          <KpiCard icon={Wallet} label="Revenus abonnements" value={formatMad(stats.monthlyRevenueMad)} />
          <KpiCard icon={FileWarning} label="Incidents ouverts" value={stats.openIncidents} tone={stats.openIncidents > 0 ? 'warning' : 'success'} />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h2 className="font-display text-base font-semibold mb-4">Entreprises clientes</h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {companies.map((c: any) => (
                <div key={c.id} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-slate-900 dark:text-white">{c.name}</div>
                    <div className="text-xs text-slate-500">
                      {c.city} · {c.employee_count} employés · Plan {c.subscription?.plan_name}
                    </div>
                  </div>
                  <StatusText status={c.status} />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h2 className="font-display text-base font-semibold mb-4">Incidents techniques</h2>
            <div className="space-y-3">
              {incidents.map((inc: any) => (
                <div key={inc.id} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <div className="text-sm font-medium text-slate-900 dark:text-white">{inc.title}</div>
                  <div className="mt-1.5 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Priorité : {inc.severity}</span>
                    <StatusText status={inc.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h2 className="font-display text-base font-semibold mb-3">Journal d’activité global</h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            {auditLogs.slice(0, 8).map((log: any) => (
              <div key={log.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-xs text-blue-600 dark:text-blue-400 me-2">{log.action}</span>
                  <span className="text-slate-700 dark:text-slate-200">{log.details}</span>
                </div>
                <span className="text-xs text-slate-400 tabular-nums">{new Date(log.created_at).toLocaleString('fr-FR')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ======================== EMPLOYEE PORTAL DASHBOARD ========================
  if (user?.role_code === 'EMPLOYEE') {
    const { employee, todayAttendance, kpis, balances, upcomingShifts, assignedTasks, announcements, upcomingMeetings } = data;
    const hasCheckedIn = Boolean(todayAttendance?.check_in);
    const hasCheckedOut = Boolean(todayAttendance?.check_out);

    return (
      <div className="space-y-6">
        {/* Welcome + Live Time Clock */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
              Espace Employé · Matricule {employee?.matricule}
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white">
              Bonjour, {employee?.first_name} {employee?.last_name}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {nowClock.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="text-end">
              <div className="font-mono text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
                {nowClock.toLocaleTimeString('fr-FR')}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {todayAttendance ? <StatusText status={todayAttendance.status} /> : 'Non pointé aujourd’hui'}
              </div>
            </div>

            {!hasCheckedIn ? (
              <button
                type="button"
                disabled={punchBusy}
                onClick={() => handleClock('check-in')}
                className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                <LogIn className="w-4 h-4" />
                <span>Pointer l’entrée</span>
              </button>
            ) : !hasCheckedOut ? (
              <button
                type="button"
                disabled={punchBusy}
                onClick={() => handleClock('check-out')}
                className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                <LogOut className="w-4 h-4" />
                <span>Pointer la sortie</span>
              </button>
            ) : (
              <div className="px-4 py-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Journée terminée ({Math.round((todayAttendance.worked_minutes / 60) * 10) / 10}h)</span>
              </div>
            )}
          </div>
        </div>

        {/* Employee KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <KpiCard icon={Clock} label="Heures ce mois" value={`${kpis.workedHoursMonth}h`} />
          <KpiCard icon={UserX} label="Absences" value={kpis.absencesCount} />
          <KpiCard icon={Clock} label="Retards" value={kpis.latesCount} />
          <KpiCard icon={CalendarOff} label="Solde congé annuel" value={`${kpis.annualLeaveRemaining}j`} tone="success" />
          <KpiCard icon={ClipboardList} label="Demandes en cours" value={kpis.pendingRequestsCount} />
          <KpiCard icon={CheckCircle2} label="Tâches assignées" value={kpis.assignedTasksCount} />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Weekly Schedule */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-base font-semibold">Mon planning de la semaine</h2>
              <Link to="/schedules" className="text-xs text-blue-600 hover:underline">Voir tout</Link>
            </div>
            <div className="space-y-2.5">
              {upcomingShifts.length === 0 ? (
                <p className="text-xs text-slate-500">Aucun shift planifié.</p>
              ) : (
                upcomingShifts.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between py-2 border-b last:border-b-0 border-slate-100 dark:border-slate-800 text-sm">
                    <div>
                      <div className="font-medium text-slate-900 dark:text-white">{s.shift_name}</div>
                      <div className="text-xs text-slate-500 tabular-nums">{s.date}</div>
                    </div>
                    <span className="font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                      {s.start_time} – {s.end_time}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Assigned Tasks */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-base font-semibold">Mes tâches assignées</h2>
              <Link to="/tasks" className="text-xs text-blue-600 hover:underline">Kanban</Link>
            </div>
            <div className="space-y-2.5">
              {assignedTasks.length === 0 ? (
                <p className="text-xs text-slate-500">Aucune tâche en cours.</p>
              ) : (
                assignedTasks.map((t: any) => (
                  <div key={t.id} className="py-2 border-b last:border-b-0 border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-900 dark:text-white truncate">{t.title}</span>
                      <StatusText status={t.status} />
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 tabular-nums">Échéance : {t.due_date} · {t.estimated_hours}h</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Leave Balances + Announcements + Meetings */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <h2 className="font-display text-base font-semibold mb-3">Soldes de congés</h2>
              <div className="space-y-2 text-sm">
                {balances.slice(0, 4).map((b: any) => (
                  <div key={b.id} className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">{b.leave_type_name}</span>
                    <span className="font-mono font-semibold tabular-nums">{b.remaining_days} / {b.allocated_days} j</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <h2 className="font-display text-base font-semibold mb-3">Annonces & Réunions</h2>
              <div className="space-y-3">
                {announcements.slice(0, 2).map((a: any) => (
                  <Link key={a.id} to="/announcements" className="block text-sm hover:text-blue-600">
                    <div className="font-medium flex items-center gap-1.5">
                      <Megaphone className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span className="truncate">{a.title}</span>
                    </div>
                  </Link>
                ))}
                {upcomingMeetings.slice(0, 2).map((m: any) => (
                  <Link key={m.id} to="/meetings" className="block text-sm hover:text-blue-600">
                    <div className="font-medium flex items-center gap-1.5">
                      <Video className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate">{m.title} ({m.date} {m.start_time})</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ======================== ADMIN / HR / MANAGER DASHBOARD ========================
  const { kpis, charts, recentActivities, upcomingMeetings, pinnedAnnouncements, pendingQueue } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Tableau de bord {user?.role_code === 'MANAGER' ? 'Équipe' : 'RH & Direction'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Indicateurs calculés en temps réel depuis la base de données · {user?.company_name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/reports" className="px-3.5 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap">
            Rapports & Exports
          </Link>
          <Link to="/ai-assistant" className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium whitespace-nowrap">
            +HR AI Assistant
          </Link>
        </div>
      </div>

      {/* 11 KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <KpiCard icon={Users} label="Total employés" value={kpis.totalEmployees} />
        <KpiCard icon={UserCheck} label="Employés actifs" value={kpis.activeEmployees} />
        <KpiCard icon={CheckCircle2} label="Présents aujourd’hui" value={kpis.presentToday} tone="success" />
        <KpiCard icon={UserX} label="Absents aujourd’hui" value={kpis.absentToday} tone={kpis.absentToday > 0 ? 'danger' : 'neutral'} />
        <KpiCard icon={Clock} label="En retard" value={kpis.lateToday} tone={kpis.lateToday > 0 ? 'warning' : 'neutral'} />
        <KpiCard icon={CalendarOff} label="En congé" value={kpis.onLeaveToday} />
        <KpiCard icon={UserCheck} label="Taux de présence" value={`${kpis.attendanceRate}%`} tone="success" />
        <KpiCard icon={ClipboardList} label="Demandes en attente" value={kpis.pendingRequests} tone={kpis.pendingRequests > 0 ? 'warning' : 'neutral'} />
        <KpiCard icon={Users} label="Nouveaux (30j)" value={kpis.newEmployees} />
        <KpiCard icon={FileWarning} label="Contrats à échéance" value={kpis.expiringContracts} tone={kpis.expiringContracts > 0 ? 'warning' : 'neutral'} />
        {kpis.monthlyPayrollMass !== null && (
          <div className="col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Masse salariale mensuelle</span>
              <Wallet className="w-4 h-4 text-blue-600" />
            </div>
            <div className="mt-2 font-mono text-xl font-bold text-slate-900 dark:text-white tabular-nums">
              {formatMad(kpis.monthlyPayrollMass)}
            </div>
          </div>
        )}
      </div>

      {/* 7 Interactive Charts Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* 1 & 2: Attendance & Absence Evolution */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h2 className="font-display text-base font-semibold mb-4">Évolution des présences, retards et absences</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={charts.attendanceSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="presents" name="Présents" stroke="#16A34A" fill="#16A34A" fillOpacity={0.15} />
                <Area type="monotone" dataKey="retards" name="Retards" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.15} />
                <Area type="monotone" dataKey="absents" name="Absents" stroke="#DC2626" fill="#DC2626" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3: Department Distribution */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h2 className="font-display text-base font-semibold mb-4">Répartition des employés par département</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.departmentBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="code" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" name="Effectif" fill="#2563EB" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 4 & 5: Recruitment & Contract Types */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h2 className="font-display text-base font-semibold mb-4">Évolution des recrutements</h2>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={charts.recruitmentSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="recrutements" name="Recrutements" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h2 className="font-display text-base font-semibold mb-4">Répartition des types de contrats (CDI, CDD, Stage…)</h2>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={charts.contractDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3}>
                  {charts.contractDistribution.map((_: unknown, idx: number) => (
                    <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 6: Leave Statistics */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h2 className="font-display text-base font-semibold mb-4">Statistiques des congés</h2>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.leaveStats} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" name="Demandes" fill="#0F172A" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 7: Worked Hours Evolution */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h2 className="font-display text-base font-semibold mb-4">Évolution des heures travaillées (h/jour)</h2>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.attendanceSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="heures" name="Heures travaillées" fill="#16A34A" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Operational Lists */}
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h2 className="font-display text-sm font-semibold mb-3">Demandes à traiter</h2>
          <div className="space-y-2.5">
            {pendingQueue.length === 0 ? (
              <p className="text-xs text-slate-500">Aucune demande en attente.</p>
            ) : (
              pendingQueue.map((item: any) => (
                <Link key={item.id} to={item.link} className="block p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-800">
                  <div className="text-xs font-medium text-slate-900 dark:text-white truncate">{item.title}</div>
                  <div className="mt-1"><StatusText status={item.status} /></div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h2 className="font-display text-sm font-semibold mb-3">Prochaines réunions</h2>
          <div className="space-y-2.5">
            {upcomingMeetings.length === 0 ? (
              <p className="text-xs text-slate-500">Aucune réunion planifiée.</p>
            ) : (
              upcomingMeetings.map((m: any) => (
                <Link key={m.id} to="/meetings" className="block p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-800">
                  <div className="text-xs font-medium text-slate-900 dark:text-white truncate">{m.title}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">{m.date} · {m.start_time}–{m.end_time}</div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h2 className="font-display text-sm font-semibold mb-3">Annonces épinglées</h2>
          <div className="space-y-2.5">
            {pinnedAnnouncements.length === 0 ? (
              <p className="text-xs text-slate-500">Aucune annonce épinglée.</p>
            ) : (
              pinnedAnnouncements.map((a: any) => (
                <Link key={a.id} to="/announcements" className="block p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-800">
                  <div className="text-xs font-medium text-slate-900 dark:text-white truncate">{a.title}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{a.content}</div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h2 className="font-display text-sm font-semibold mb-3">Activités récentes</h2>
          <div className="space-y-2.5">
            {recentActivities.length === 0 ? (
              <p className="text-xs text-slate-500">Aucune activité récente.</p>
            ) : (
              recentActivities.map((act: any) => (
                <div key={act.id} className="text-xs border-b last:border-b-0 border-slate-100 dark:border-slate-800 pb-2">
                  <div className="font-medium text-slate-800 dark:text-slate-200 truncate">{act.details}</div>
                  <div className="text-[11px] text-slate-400 tabular-nums mt-0.5">{new Date(act.created_at).toLocaleString('fr-FR')}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const KpiCard: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}> = ({ icon: Icon, label, value, tone = 'neutral' }) => {
  const toneClass =
    tone === 'success'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'warning'
      ? 'text-amber-600 dark:text-amber-400'
      : tone === 'danger'
      ? 'text-red-600 dark:text-red-400'
      : 'text-slate-900 dark:text-white';

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between">
      <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="truncate">{label}</span>
        <Icon className="w-4 h-4 shrink-0 text-slate-400" />
      </div>
      <div className={`mt-2 font-mono text-2xl font-bold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
};
