import React, { useEffect, useState } from 'react';
import { Clock, Download, Edit3, FileSpreadsheet, LogIn, LogOut, MapPin, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../services/api';
import { useApp } from '../contexts/AppContext';
import { DataTable, ColumnDef } from '../components/ui/DataTable';
import { StatusText } from '../components/ui/StatusText';
import { Modal } from '../components/ui/ConfirmModal';
import { exportToExcel, exportToPdf } from '../utils/exportUtils';
import type { AttendanceRecord, Department } from '../types';

export const AttendancePage: React.FC = () => {
  const { user, addToast } = useApp();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [corrections, setCorrections] = useState<any[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [myToday, setMyToday] = useState<AttendanceRecord | null>(null);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [clock, setClock] = useState(new Date());
  const [useGeo, setUseGeo] = useState(false);

  const [correctModal, setCorrectModal] = useState<AttendanceRecord | null>(null);
  const [correctForm, setCorrectForm] = useState({ status: 'present', check_in: '', check_out: '', reason: '' });

  const canCorrect = user?.role_code === 'COMPANY_ADMIN' || user?.role_code === 'HR_MANAGER';

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = async () => {
    try {
      const qs = new URLSearchParams();
      if (dateFilter) qs.set('date', dateFilter);
      if (deptFilter) qs.set('departmentId', deptFilter);
      const [attRes, deptRes] = await Promise.all([
        apiRequest<any>(`/api/attendance?${qs.toString()}`),
        user?.role_code !== 'EMPLOYEE' ? apiRequest<{ departments: Department[] }>('/api/departments') : Promise.resolve({ departments: [] }),
      ]);
      setRecords(attRes.records);
      setCorrections(attRes.corrections || []);
      setMyToday(attRes.myTodayRecord);
      setSettings(attRes.companySettings);
      setDepartments(deptRes.departments);
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [dateFilter, deptFilter]);

  const handleCheckIn = async () => {
    try {
      let coords: { lat?: number; lng?: number } = {};
      if (useGeo || settings?.require_geolocation_checkin) {
        if (!navigator.geolocation) {
          addToast('Géolocalisation non supportée par ce navigateur.', 'error');
          return;
        }
        coords = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => reject(new Error('Autorisation de localisation refusée.'))
          );
        });
      }

      await apiRequest('/api/attendance/check-in', {
        method: 'POST',
        body: JSON.stringify({ ...coords, webauthnVerified: Boolean(user?.webauthn_credential_id && window.PublicKeyCredential) }),
      });
      addToast('Pointage d’entrée enregistré.', 'success');
      await load();
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  };

  const handleCheckOut = async () => {
    try {
      await apiRequest('/api/attendance/check-out', { method: 'POST', body: JSON.stringify({}) });
      addToast('Pointage de sortie enregistré.', 'success');
      await load();
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  };

  const handleCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctModal) return;
    try {
      await apiRequest(`/api/attendance/${correctModal.id}/correct`, {
        method: 'PUT',
        body: JSON.stringify({
          status: correctForm.status,
          check_in: correctForm.check_in ? `${correctModal.date}T${correctForm.check_in}:00` : null,
          check_out: correctForm.check_out ? `${correctModal.date}T${correctForm.check_out}:00` : null,
          reason: correctForm.reason,
        }),
      });
      addToast('Pointage corrigé et journalisé.', 'success');
      setCorrectModal(null);
      await load();
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  };

  const columns: ColumnDef<AttendanceRecord>[] = [
    { key: 'date', header: 'Date', sortValue: (r) => r.date, render: (r) => <span className="font-mono text-xs tabular-nums">{r.date}</span> },
    ...(user?.role_code !== 'EMPLOYEE'
      ? [
          {
            key: 'employee',
            header: 'Employé',
            sortValue: (r: AttendanceRecord) => r.employee_name || '',
            render: (r: AttendanceRecord) => (
              <div>
                <div className="font-medium text-slate-900 dark:text-white">{r.employee_name}</div>
                <div className="text-xs text-slate-500 font-mono">{r.matricule} · {r.department_name}</div>
              </div>
            ),
          },
        ]
      : []),
    {
      key: 'planned',
      header: 'Horaire prévu',
      render: (r) => <span className="font-mono text-xs tabular-nums text-slate-500">{r.planned_start || '08:30'}–{r.planned_end || '17:30'}</span>,
    },
    {
      key: 'actual',
      header: 'Pointage réel',
      render: (r) => (
        <span className="font-mono text-xs tabular-nums">
          {r.check_in ? r.check_in.slice(11, 16) : '—'} → {r.check_out ? r.check_out.slice(11, 16) : '—'}
        </span>
      ),
    },
    {
      key: 'worked',
      header: 'Durée / Retard / H.Sup',
      render: (r) => (
        <div className="text-xs font-mono tabular-nums">
          <span>{Math.round((r.worked_minutes / 60) * 10) / 10}h</span>
          {r.late_minutes > 0 && <span className="text-amber-600 ms-2">+{r.late_minutes}m ret.</span>}
          {r.overtime_minutes > 0 && <span className="text-blue-600 ms-2">+{r.overtime_minutes}m sup.</span>}
        </div>
      ),
    },
    { key: 'status', header: 'Statut', render: (r) => <StatusText status={r.status} /> },
    ...(canCorrect
      ? [
          {
            key: 'actions',
            header: 'Corriger',
            align: 'right' as const,
            render: (r: AttendanceRecord) => (
              <button
                type="button"
                onClick={() => {
                  setCorrectModal(r);
                  setCorrectForm({
                    status: r.status,
                    check_in: r.check_in ? r.check_in.slice(11, 16) : '08:30',
                    check_out: r.check_out ? r.check_out.slice(11, 16) : '17:30',
                    reason: '',
                  });
                }}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Corriger le pointage"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Système de Pointage & Présences</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Suivi en temps réel, comparaison au planning, calcul des retards et heures supplémentaires
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              exportToExcel(
                'presences_plushr',
                'Présences',
                records.map((r) => ({
                  Date: r.date,
                  Employé: r.employee_name,
                  Statut: r.status,
                  Entrée: r.check_in ? r.check_in.slice(11, 16) : '-',
                  Sortie: r.check_out ? r.check_out.slice(11, 16) : '-',
                  Heures: Math.round((r.worked_minutes / 60) * 10) / 10,
                  RetardMin: r.late_minutes,
                }))
              )
            }
            className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Excel
          </button>
          <button
            type="button"
            onClick={() =>
              exportToPdf({
                filename: 'presences_plushr.pdf',
                title: 'Rapport des Présences',
                companyName: user?.company_name || '+HR',
                columns: ['Date', 'Employé', 'Statut', 'Entrée', 'Sortie', 'Retard (min)'],
                rows: records.slice(0, 100).map((r) => ({
                  Date: r.date,
                  Employé: r.employee_name,
                  Statut: r.status,
                  Entrée: r.check_in ? r.check_in.slice(11, 16) : '-',
                  Sortie: r.check_out ? r.check_out.slice(11, 16) : '-',
                  'Retard (min)': r.late_minutes,
                })),
              })
            }
            className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Download className="w-4 h-4 text-blue-600" /> PDF
          </button>
        </div>
      </div>

      {/* Live Punch Card (when user has an employee profile) */}
      {user?.employee_id && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <div className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {clock.toLocaleTimeString('fr-FR')}
              </div>
              <div className="text-xs text-slate-500">
                {clock.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                {' · '}Planning prévu : {myToday?.planned_start || settings?.work_start_time || '08:30'}–{myToday?.planned_end || settings?.work_end_time || '17:30'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input type="checkbox" checked={useGeo} onChange={(e) => setUseGeo(e.target.checked)} className="rounded border-slate-300" />
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              <span>Inclure ma localisation</span>
            </label>
            {user.webauthn_credential_id && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                <ShieldCheck className="w-3.5 h-3.5" /> WebAuthn actif
              </span>
            )}
            {!myToday?.check_in ? (
              <button type="button" onClick={handleCheckIn} className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg flex items-center gap-2">
                <LogIn className="w-4 h-4" /> Check-in
              </button>
            ) : !myToday?.check_out ? (
              <button type="button" onClick={handleCheckOut} className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg flex items-center gap-2">
                <LogOut className="w-4 h-4" /> Check-out
              </button>
            ) : (
              <StatusText status={myToday.status} label={`Terminé (${Math.round((myToday.worked_minutes / 60) * 10) / 10}h)`} />
            )}
          </div>
        </div>
      )}

      <DataTable
        data={records}
        columns={columns}
        loading={loading}
        searchPlaceholder="Rechercher employé ou date…"
        searchFilter={(r, q) => (r.employee_name || '').toLowerCase().includes(q) || r.date.includes(q)}
        toolbarExtras={
          <>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800"
            />
            {departments.length > 0 && (
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800"
              >
                <option value="">Tous les départements</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            )}
          </>
        }
      />

      {corrections.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h2 className="font-display text-sm font-semibold mb-3">Historique des corrections de pointage</h2>
          <div className="space-y-2 text-xs">
            {corrections.slice(0, 8).map((c) => (
              <div key={c.id} className="flex flex-wrap justify-between gap-2 py-2 border-b last:border-b-0 border-slate-100 dark:border-slate-800">
                <span>
                  <strong>{c.corrected_by_name}</strong> : {c.previous_status} → {c.new_status} ({c.reason})
                </span>
                <span className="text-slate-400 tabular-nums">{new Date(c.created_at).toLocaleString('fr-FR')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={Boolean(correctModal)} title="Corriger un pointage" onClose={() => setCorrectModal(null)}>
        <form onSubmit={handleCorrection} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1">Statut</label>
            <select value={correctForm.status} onChange={(e) => setCorrectForm({ ...correctForm, status: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800">
              <option value="present">Présent</option>
              <option value="late">En retard</option>
              <option value="remote">Télétravail</option>
              <option value="justified_absence">Absence justifiée</option>
              <option value="absent">Absent</option>
              <option value="on_leave">Congé</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Heure d’entrée</label>
              <input type="time" value={correctForm.check_in} onChange={(e) => setCorrectForm({ ...correctForm, check_in: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Heure de sortie</label>
              <input type="time" value={correctForm.check_out} onChange={(e) => setCorrectForm({ ...correctForm, check_out: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Motif obligatoire de la correction</label>
            <textarea required rows={2} value={correctForm.reason} onChange={(e) => setCorrectForm({ ...correctForm, reason: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800" />
          </div>
          <button type="submit" className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg">Enregistrer la correction</button>
        </form>
      </Modal>
    </div>
  );
};
