import React, { useEffect, useState } from 'react';
import { Video, Calendar, Clock, MapPin, Plus, XCircle, ExternalLink, Info, Users } from 'lucide-react';
import { apiRequest } from '../services/api';
import { useApp } from '../contexts/AppContext';
import type { Department, Employee, Meeting } from '../types';
import { StatusText } from '../components/ui/StatusText';
import { ConfirmModal, Modal } from '../components/ui/ConfirmModal';

export const MeetingsPage: React.FC = () => {
  const { user, addToast } = useApp();
  const canSchedule = ['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'].includes(user?.role_code || '');

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Meeting | null>(null);

  const [form, setForm] = useState({
    title: '',
    description: '',
    department_id: '',
    date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    start_time: '10:00',
    end_time: '11:00',
    location: 'Salle Atlas A',
    meeting_type: 'hybrid' as Meeting['meeting_type'],
    video_link: '',
    participant_ids: [] as string[],
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [mRes, dRes] = await Promise.all([
        apiRequest<{ meetings: Meeting[]; smtpConfigured: boolean }>('/api/meetings'),
        apiRequest<{ departments: Department[] }>('/api/departments'),
      ]);
      setMeetings(mRes.meetings);
      setSmtpConfigured(mRes.smtpConfigured);
      setDepartments(dRes.departments);
      if (canSchedule) {
        const empRes = await apiRequest<{ employees: Employee[] }>('/api/employees');
        setEmployees(empRes.employees.filter((e) => e.status === 'active'));
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur chargement réunions', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const toggleParticipant = (empId: string) => {
    setForm((f) => ({
      ...f,
      participant_ids: f.participant_ids.includes(empId)
        ? f.participant_ids.filter((id) => id !== empId)
        : [...f.participant_ids, empId],
    }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/meetings', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          department_id: form.department_id || null,
          video_link: form.video_link || null,
        }),
      });
      addToast('Réunion planifiée et participants notifiés', 'success');
      setCreateOpen(false);
      setForm((f) => ({ ...f, title: '', description: '', video_link: '', participant_ids: [] }));
      loadData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur création réunion', 'error');
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      await apiRequest(`/api/meetings/${cancelTarget.id}/cancel`, { method: 'POST' });
      addToast('Réunion annulée', 'success');
      setCancelTarget(null);
      loadData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur annulation', 'error');
    }
  };

  const typeLabels: Record<Meeting['meeting_type'], string> = {
    in_person: 'Présentiel',
    google_meet: 'Google Meet',
    zoom: 'Zoom',
    teams: 'Microsoft Teams',
    hybrid: 'Hybride',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Réunions & Visioconférences</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Planification, liens Meet / Zoom / Teams et synchronisation automatique dans le calendrier interne
          </p>
        </div>

        {canSchedule && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
          >
            <Plus className="w-4 h-4" />
            Planifier une réunion
          </button>
        )}
      </div>

      <div className="bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 flex items-center gap-3 text-xs text-slate-700 dark:text-slate-300">
        <Info className="w-4 h-4 text-blue-600 shrink-0" />
        <span>
          {smtpConfigured
            ? 'Service SMTP configuré : les invitations génèrent des notifications temps réel et des alertes email.'
            : 'Notifications internes temps réel actives. Service email SMTP externe non configuré dans cet environnement (aucun email factice simulé).'}
        </span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : meetings.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center">
          <Video className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Aucune réunion planifiée.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {meetings.map((m) => (
            <div
              key={m.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">{m.title}</h2>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {typeLabels[m.meeting_type]} · {m.department_name} · Organisé par {m.organizer_name}
                    </div>
                  </div>
                  <StatusText status={m.status} />
                </div>

                {m.description && <p className="text-sm text-slate-600 dark:text-slate-300">{m.description}</p>}

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600 dark:text-slate-400 pt-1">
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                    {m.date}
                  </span>
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    {m.start_time} – {m.end_time}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-blue-600" />
                    {m.location}
                  </span>
                </div>

                {m.participant_names && m.participant_names.length > 0 && (
                  <div className="flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <Users className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{m.participant_names.join(', ')}</span>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                {m.video_link && m.status !== 'cancelled' ? (
                  <a
                    href={m.video_link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Rejoindre la visioconférence
                  </a>
                ) : (
                  <span className="text-xs text-slate-400">{m.email_delivery_status}</span>
                )}

                {canSchedule && m.status === 'scheduled' && (
                  <button
                    type="button"
                    onClick={() => setCancelTarget(m)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Annuler
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={createOpen} title="Planifier une réunion" onClose={() => setCreateOpen(false)} maxWidth="max-w-xl">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Titre *</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              placeholder="Ex. Comité hebdomadaire Production"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Ordre du jour</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Date *</label>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Début *</label>
              <input
                type="time"
                required
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Fin *</label>
              <input
                type="time"
                required
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Format</label>
              <select
                value={form.meeting_type}
                onChange={(e) => setForm({ ...form, meeting_type: e.target.value as Meeting['meeting_type'] })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="in_person">Présentiel</option>
                <option value="google_meet">Google Meet</option>
                <option value="zoom">Zoom</option>
                <option value="teams">Microsoft Teams</option>
                <option value="hybrid">Hybride</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Département</label>
              <select
                value={form.department_id}
                onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="">Toute l’entreprise</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Lieu / Salle</label>
              <input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Lien visio (optionnel)</label>
              <input
                type="url"
                value={form.video_link}
                onChange={(e) => setForm({ ...form, video_link: e.target.value })}
                placeholder="https://meet.google.com/..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Participants ({form.participant_ids.length} sélectionnés)
            </label>
            <div className="max-h-36 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg p-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {employees.map((emp) => (
                <label key={emp.id} className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.participant_ids.includes(emp.id)}
                    onChange={() => toggleParticipant(emp.id)}
                  />
                  <span className="truncate">
                    {emp.first_name} {emp.last_name} ({emp.matricule})
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg">
              Annuler
            </button>
            <button type="submit" className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">
              Planifier
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(cancelTarget)}
        title="Annuler cette réunion"
        message={`Confirmer l'annulation de "${cancelTarget?.title}" ? Les participants recevront une notification.`}
        confirmLabel="Annuler la réunion"
        danger
        onConfirm={handleCancel}
        onClose={() => setCancelTarget(null)}
      />
    </div>
  );
};
