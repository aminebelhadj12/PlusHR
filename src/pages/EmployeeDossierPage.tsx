import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Upload, Save } from 'lucide-react';
import { apiRequest } from '../services/api';
import { useApp } from '../contexts/AppContext';
import { StatusText } from '../components/ui/StatusText';
import { formatMad } from '../utils/i18n';

const TABS = [
  { id: 'personal', label: 'Informations personnelles' },
  { id: 'professional', label: 'Informations professionnelles' },
  { id: 'attendance', label: 'Présences' },
  { id: 'absences', label: 'Absences' },
  { id: 'leaves', label: 'Congés' },
  { id: 'contracts', label: 'Contrats' },
  { id: 'documents', label: 'Documents' },
  { id: 'payroll', label: 'Salaires' },
  { id: 'schedule', label: 'Planning' },
  { id: 'workload', label: 'Charge de travail' },
  { id: 'history', label: 'Historique' },
] as const;

export const EmployeeDossierPage: React.FC = () => {
  const { id } = useParams();
  const { user, addToast } = useApp();
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('personal');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [docTitle, setDocTitle] = useState('');
  const [docCategory, setDocCategory] = useState('Contract');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [editPhone, setEditPhone] = useState('');
  const [editSkills, setEditSkills] = useState('');

  const canEdit = user?.role_code === 'COMPANY_ADMIN' || user?.role_code === 'HR_MANAGER';

  const load = async () => {
    if (!id) return;
    try {
      const res = await apiRequest<any>(`/api/employees/${id}`);
      setData(res);
      setEditPhone(res.employee.phone || '');
      setEditSkills(res.employee.skills || '');
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const handleSaveProfile = async () => {
    if (!id) return;
    try {
      await apiRequest(`/api/employees/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ phone: editPhone, skills: editSkills }),
      });
      addToast('Fiche employé mise à jour.', 'success');
      await load();
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  };

  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !docFile) return;
    const fd = new FormData();
    fd.append('file', docFile);
    fd.append('title', docTitle || docFile.name);
    fd.append('category', docCategory);
    try {
      await apiRequest(`/api/employees/${id}/documents`, { method: 'POST', body: fd });
      addToast('Document ajouté au dossier.', 'success');
      setDocTitle('');
      setDocFile(null);
      await load();
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  };

  if (loading) return <div className="h-64 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />;
  if (!data?.employee) return <div className="text-sm text-slate-500">Dossier introuvable.</div>;

  const emp = data.employee;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/employees" className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                {emp.first_name} {emp.last_name}
              </h1>
              <StatusText status={emp.status} />
            </div>
            <p className="text-xs text-slate-500 font-mono">
              {emp.matricule} · {emp.department_name} · {emp.position_title}
            </p>
          </div>
        </div>
      </div>

      {/* 11-Tab Navigation */}
      <div className="border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {TABS.map((tItem) => (
            <button
              key={tItem.id}
              type="button"
              onClick={() => setTab(tItem.id)}
              className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                tab === tItem.id
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {tItem.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
        {tab === 'personal' && (
          <div className="grid sm:grid-cols-2 gap-5 text-sm">
            <InfoField label="Prénom & Nom" value={`${emp.first_name} ${emp.last_name}`} />
            <InfoField label="Email professionnel" value={emp.email} />
            <div>
              <label className="block text-xs text-slate-500 mb-1">Téléphone</label>
              {canEdit ? (
                <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="w-full px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 font-mono" />
              ) : (
                <div className="font-mono">{emp.phone}</div>
              )}
            </div>
            <InfoField label="CIN" value={emp.cin || '-'} mono />
            <InfoField label="Ville & Adresse" value={`${emp.city} · ${emp.address}`} />
            <InfoField label="Contact d’urgence" value={emp.emergency_contact || '-'} />
            {canEdit && (
              <div className="sm:col-span-2 pt-2">
                <button type="button" onClick={handleSaveProfile} className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5">
                  <Save className="w-3.5 h-3.5" /> Enregistrer les modifications
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'professional' && (
          <div className="grid sm:grid-cols-2 gap-5 text-sm">
            <InfoField label="Matricule" value={emp.matricule} mono />
            <InfoField label="Département" value={emp.department_name} />
            <InfoField label="Poste" value={emp.position_title} />
            <InfoField label="Manager direct" value={emp.manager_name} />
            <InfoField label="Date d’embauche" value={emp.hire_date} mono />
            <InfoField label="Type de contrat" value={emp.contract_type} />
            <InfoField label="N° CNSS" value={emp.cnss_number || '-'} mono />
            <div>
              <label className="block text-xs text-slate-500 mb-1">Compétences</label>
              {canEdit ? (
                <input value={editSkills} onChange={(e) => setEditSkills(e.target.value)} className="w-full px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800" />
              ) : (
                <div>{emp.skills || '-'}</div>
              )}
            </div>
            {canEdit && (
              <div className="sm:col-span-2 pt-2">
                <button type="button" onClick={handleSaveProfile} className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5">
                  <Save className="w-3.5 h-3.5" /> Enregistrer les modifications
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'attendance' && (
          <SimpleListTable
            headers={['Date', 'Entrée', 'Sortie', 'Durée (min)', 'Retard (min)', 'Statut']}
            rows={data.attendances.slice(0, 20).map((a: any) => [
              a.date,
              a.check_in ? a.check_in.slice(11, 16) : '-',
              a.check_out ? a.check_out.slice(11, 16) : '-',
              a.worked_minutes,
              a.late_minutes,
              <StatusText key={a.id} status={a.status} />,
            ])}
          />
        )}

        {tab === 'absences' && (
          <SimpleListTable
            headers={['Date', 'Retard (min)', 'Statut', 'Notes']}
            rows={data.absences.map((a: any) => [
              a.date,
              a.late_minutes,
              <StatusText key={a.id} status={a.status} />,
              a.notes || '-',
            ])}
          />
        )}

        {tab === 'leaves' && (
          <div className="space-y-6">
            <div className="grid sm:grid-cols-3 gap-3">
              {data.leaveBalances.map((lb: any) => (
                <div key={lb.id} className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-xs text-slate-500">{lb.leave_type_name}</div>
                  <div className="mt-1 font-mono text-lg font-bold tabular-nums">{lb.remaining_days} / {lb.allocated_days} j</div>
                </div>
              ))}
            </div>
            <SimpleListTable
              headers={['Début', 'Fin', 'Jours', 'Motif', 'Statut']}
              rows={data.leaves.map((l: any) => [l.start_date, l.end_date, l.working_days, l.reason, <StatusText key={l.id} status={l.status} />])}
            />
          </div>
        )}

        {tab === 'contracts' && (
          <SimpleListTable
            headers={['Référence', 'Type', 'Début', 'Fin', 'Salaire', 'Statut']}
            rows={data.contracts.map((c: any) => [
              c.reference,
              c.contract_type,
              c.start_date,
              c.end_date || 'Indéterminée',
              formatMad(c.salary_mad),
              <StatusText key={c.id} status={c.status} />,
            ])}
          />
        )}

        {tab === 'documents' && (
          <div className="space-y-6">
            <form onSubmit={handleUploadDoc} className="grid sm:grid-cols-4 gap-3 items-end p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
              <div>
                <label className="block text-xs font-semibold mb-1">Titre du document</label>
                <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="CIN / Contrat signé…" className="w-full px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Catégorie</label>
                <select value={docCategory} onChange={(e) => setDocCategory(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900">
                  <option value="CIN">CIN</option>
                  <option value="Contract">Contrat</option>
                  <option value="Diploma">Diplôme</option>
                  <option value="Certificate">Attestation</option>
                  <option value="Other">Autre</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Fichier (PDF, PNG, JPG)</label>
                <input type="file" required onChange={(e) => setDocFile(e.target.files?.[0] || null)} className="w-full text-xs" />
              </div>
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5">
                <Upload className="w-3.5 h-3.5" /> Téléverser
              </button>
            </form>
            <SimpleListTable
              headers={['Document', 'Catégorie', 'Fichier', 'Ajouté le']}
              rows={data.documents.map((d: any) => [
                d.title,
                d.category,
                <a key={d.id} href={d.file_path} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{d.file_name}</a>,
                new Date(d.created_at).toLocaleDateString('fr-FR'),
              ])}
            />
          </div>
        )}

        {tab === 'payroll' && (
          <SimpleListTable
            headers={['Salaire base', 'Primes', 'Heures sup.', 'Cotisations', 'Brut', 'Net']}
            rows={data.payrollItems.map((p: any) => [
              formatMad(p.base_salary),
              formatMad(p.bonuses),
              formatMad(p.overtime_pay),
              formatMad(p.configured_contributions),
              formatMad(p.gross_salary),
              <span key={p.id} className="font-semibold text-emerald-600">{formatMad(p.net_salary)}</span>,
            ])}
          />
        )}

        {tab === 'schedule' && (
          <SimpleListTable
            headers={['Date', 'Équipe / Shift', 'Début', 'Fin']}
            rows={data.shifts.map((s: any) => [s.date, s.shift_name, s.start_time, s.end_time])}
          />
        )}

        {tab === 'workload' && (
          <SimpleListTable
            headers={['Tâche', 'Priorité', 'Échéance', 'Heures estimées', 'Statut']}
            rows={data.tasks.map((t: any) => [
              t.title,
              t.priority,
              t.due_date,
              `${t.estimated_hours}h`,
              <StatusText key={t.id} status={t.status} />,
            ])}
          />
        )}

        {tab === 'history' && (
          <SimpleListTable
            headers={['Date', 'Action', 'Détails']}
            rows={data.history.map((h: any) => [new Date(h.created_at).toLocaleString('fr-FR'), h.action, h.details])}
          />
        )}
      </div>
    </div>
  );
};

const InfoField: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div>
    <div className="text-xs text-slate-500 mb-0.5">{label}</div>
    <div className={`text-slate-900 dark:text-white font-medium ${mono ? 'font-mono tabular-nums' : ''}`}>{value}</div>
  </div>
);

const SimpleListTable: React.FC<{ headers: string[]; rows: Array<Array<React.ReactNode>> }> = ({ headers, rows }) => {
  if (rows.length === 0) return <p className="text-sm text-slate-500">Aucun enregistrement trouvé.</p>;
  return (
    <div className="responsive-scroll" role="region" aria-label="Données du dossier employé" tabIndex={0}>
      <table className="w-full text-sm text-start border-collapse">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500">
            {headers.map((h, i) => (
              <th key={i} className="py-2.5 px-3 text-start">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} className="py-2.5 px-3 tabular-nums">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
