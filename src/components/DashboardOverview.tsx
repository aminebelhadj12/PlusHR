import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarClock, ClipboardList, FileText, Gauge, ListTodo, UserRoundCheck, Users, Wallet } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { AppLang, TaskItem } from '../types';
import { apiRequest } from '../services/api';
import { dashboardCopy } from '../utils/dashboardCopy';
import { StatusText } from '../components/ui/StatusText';
import './DashboardOverview.css';

interface HrIndicators {
  totalEmployees: number;
  activeEmployees: number;
  presentToday: number;
  absentToday: number;
  lateToday: number;
  onLeaveToday: number;
  attendanceRate: number;
  pendingRequests: number;
  newEmployees: number;
  expiringContracts: number;
  monthlyPayrollMass: number | null;
}
type ContractSlice = { name: string; value: number };
const colors = ['#3478ef', '#37c7cd', '#7856e4', '#28ad87', '#eda05f', '#9da9cb'];

export function DashboardOverview({ indicators: kpis, contracts, lang, companyId, departmentId }: {
  indicators: HrIndicators;
  contracts: ContractSlice[];
  lang: AppLang;
  companyId?: string | null;
  departmentId?: string | null;
}) {
  const copy = dashboardCopy[lang];
  const [tasks, setTasks] = useState<TaskItem[] | null>(null);
  const [taskError, setTaskError] = useState(false);
  const locale = lang === 'fr' ? 'fr-MA' : lang === 'ar' ? 'ar-MA' : 'en-GB';
  const number = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, { style: 'percent' });
  const contractTotal = contracts.reduce((total, item) => total + item.value, 0);
  const attendance = kpis.totalEmployees > 0 ? Math.max(0, Math.min(100, kpis.attendanceRate)) : null;
  const gauge = attendance === null ? [{ value: 100, remainder: true }] : [
    { value: attendance, remainder: false }, { value: 100 - attendance, remainder: true },
  ];
  const metrics = [
    { icon: Users, label: copy.employees, value: number.format(kpis.totalEmployees), context: copy.scope, color: 'blue' },
    { icon: UserRoundCheck, label: copy.attendance, value: attendance === null ? '—' : percent.format(attendance / 100), context: copy.today, color: 'green' },
    kpis.monthlyPayrollMass === null
      ? { icon: FileText, label: copy.expiring, value: number.format(kpis.expiringContracts), context: copy.scope, color: 'purple' }
      : { icon: Wallet, label: copy.payroll, value: new Intl.NumberFormat(locale, { style: 'currency', currency: 'MAD', currencyDisplay: 'code', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(kpis.monthlyPayrollMass), context: copy.period, color: 'purple' },
    { icon: ClipboardList, label: copy.pending, value: number.format(kpis.pendingRequests), context: copy.current, color: 'cyan' },
  ];
  const indicators = [
    [copy.active, kpis.activeEmployees], [copy.present, kpis.presentToday], [copy.absent, kpis.absentToday],
    [copy.late, kpis.lateToday], [copy.leave, kpis.onLeaveToday], [copy.newHires, kpis.newEmployees],
    [copy.expiring, kpis.expiringContracts],
  ] as const;

  useEffect(() => {
    if (!companyId || departmentId === null) { setTasks([]); return; }
    const controller = new AbortController();
    void apiRequest<{ tasks: TaskItem[] }>('/api/tasks', { signal: controller.signal })
      .then(({ tasks: records }) => {
        if (!controller.signal.aborted) {
          setTasks(records.filter((task) => task.status === 'in_progress' && task.company_id === companyId && (departmentId === undefined || task.department_id === departmentId))
            .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999')).slice(0, 3));
        }
      })
      .catch(() => { if (!controller.signal.aborted) setTaskError(true); });
    return () => controller.abort();
  }, [companyId, departmentId]);

  return (
    <div className="plus-overview">
      <dl className="plus-overview-metrics">
        {metrics.map(({ label, value, color, context, icon: Icon }) => (
          <div className={'plus-overview-metric plus-overview-' + color} key={color}>
            <div className="plus-metric-icon"><Icon size={20} aria-hidden="true" /></div>
            <dt>{label}</dt>
            <dd>{value}</dd>
            <span className="plus-metric-context">{context}</span>
          </div>
        ))}
      </dl>
      <div className="plus-overview-insights">
        <section className="plus-overview-panel">
          <h2>{copy.contracts}</h2>
          {contractTotal ? (
            <>
              <div className="plus-chart plus-donut">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <PieChart>
                    <Pie data={contracts} dataKey="value" nameKey="name" innerRadius="65%" outerRadius="91%" paddingAngle={4}
                      stroke="var(--plus-panel)" strokeWidth={2} cornerRadius={5} isAnimationActive={false}>
                      {contracts.map((contract, index) => <Cell key={contract.name} fill={colors[index % colors.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="plus-chart-number"><strong>{number.format(contractTotal)}</strong><span>{copy.total}</span></div>
              </div>
              <ul className="plus-chart-key">
                {contracts.map(({ name, value }, index) => (
                  <li key={name}>
                    <i aria-hidden="true" style={{ backgroundColor: colors[index % colors.length] }} />
                    <span>{name}</span><b>{number.format(value)}</b>
                  </li>
                ))}
              </ul>
            </>
          ) : <p className="plus-overview-empty">{copy.emptyContracts}</p>}
        </section>

        <section className="plus-overview-panel">
          <h2>{copy.attendance}</h2>
          <div className="plus-chart plus-gauge">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart>
                <Pie data={gauge} dataKey="value" startAngle={180} endAngle={0} cy="84%" innerRadius="75%" outerRadius="96%"
                  stroke="none" cornerRadius={4} isAnimationActive={false}>
                  {gauge.map((segment) => <Cell key={String(segment.remainder)} fill={segment.remainder ? 'var(--plus-track)' : '#19b89d'} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="plus-chart-number"><strong>{attendance === null ? '—' : percent.format(attendance / 100)}</strong><span>{attendance === null ? copy.noRate : copy.today}</span></div>
          </div>
          <dl className="plus-gauge-key">
            {[[copy.present, kpis.presentToday], [copy.absent, kpis.absentToday], [copy.late, kpis.lateToday]].map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{number.format(Number(value))}</dd></div>
            ))}
          </dl>
        </section>

        <section className="plus-overview-panel">
          <h2>{copy.performance}</h2>
          <table className="plus-overview-table">
            <thead><tr><th scope="col">{copy.name}</th><th scope="col">{copy.role}</th><th scope="col">{copy.result}</th></tr></thead>
            <tbody><tr><td colSpan={3}>
              <div className="plus-overview-empty plus-performance-empty"><Gauge size={24} aria-hidden="true" /><span>{copy.emptyPerformance}</span></div>
            </td></tr></tbody>
          </table>
        </section>
      </div>
      <div className="plus-overview-bottom">
        <section className="plus-overview-panel">
          <h2>{copy.indicators}</h2>
          <table className="plus-overview-table">
            <thead><tr><th scope="col">{copy.metric}</th><th scope="col">{copy.value}</th></tr></thead>
            <tbody>{indicators.map(([label, value]) => (
              <tr key={label}><th scope="row">{label}</th><td>{number.format(value)}</td></tr>
            ))}</tbody>
          </table>
        </section>
        <section className="plus-overview-panel">
          <div className="plus-panel-heading">
            <h2>{copy.tasks}</h2>
            <Link to="/tasks" aria-label={copy.viewTasks} title={copy.viewTasks}><ArrowUpRight size={17} aria-hidden="true" /></Link>
          </div>
          {tasks?.length ? <ul className="plus-task-list">{tasks.map((task) => (
            <li key={task.id}><Link to="/tasks">
              <ListTodo size={19} aria-hidden="true" />
              <div className="min-w-0 flex-1"><strong>{task.title}</strong>
                {task.due_date && <small><CalendarClock size={13} aria-hidden="true" /><time dateTime={task.due_date}>
                  {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(task.due_date))}
                </time></small>}
              </div>
              <StatusText status={task.status} />
            </Link></li>
          ))}</ul> : <p className="plus-overview-empty">{taskError ? copy.taskError : tasks ? copy.emptyTasks : copy.loadTasks}</p>}
        </section>
      </div>
    </div>
  );
}
