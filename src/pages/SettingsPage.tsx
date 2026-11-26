import React, { useEffect, useState } from 'react';
import { Save, Plus, Shield, Calendar, Settings as SettingsIcon } from 'lucide-react';
import { apiRequest } from '../services/api';
import { useApp } from '../contexts/AppContext';
import type { Company, CompanySettings, LeaveType } from '../types';

interface Holiday {
  id: string;
  name: string;
  date: string;
}

interface RolePerm {
  id: string;
  role_code: string;
  permission_code: string;
  allowed: boolean;
}

export const SettingsPage: React.FC = () => {
  const { user, addToast } = useApp();
  const canEdit = ['COMPANY_ADMIN', 'HR_MANAGER'].includes(user?.role_code || '');

  const [company, setCompany] = useState<Company | null>(null);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePerm[]>([]);
  const [newHoliday, setNewHoliday] = useState({ name: '', date: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{
        company: Company;
        settings: CompanySettings;
        holidays: Holiday[];
        leaveTypes: LeaveType[];
        rolePermissions: RolePerm[];
      }>('/api/settings');
      setCompany(res.company);
      setSettings(res.settings);
      setHolidays(res.holidays);
      setLeaveTypes(res.leaveTypes);
      setRolePermissions(res.rolePermissions);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur chargement paramètres', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role_code !== 'SUPER_ADMIN') {
      loadSettings();
    } else {
      setLoading(false);
    }
  }, [user?.role_code]);

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    try {
      await apiRequest('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ company, settings }),
      });
      addToast('Paramètres de l’entreprise enregistrés', 'success');
      loadSettings();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur sauvegarde paramètres', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddHoliday = async () => {
    if (!newHoliday.name || !newHoliday.date) return;
    try {
      await apiRequest('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ newHoliday }),
      });
      setNewHoliday({ name: '', date: '' });
      addToast('Jour férié ajouté', 'success');
      loadSettings();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur ajout jour férié', 'error');
    }
  };

  const handleTogglePerm = async (id: string) => {
    if (!canEdit) return;
    try {
      await apiRequest('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ togglePermissionId: id }),
      });
      setRolePermissions((prev) => prev.map((rp) => (rp.id === id ? { ...rp, allowed: !rp.allowed } : rp)));
      addToast('Permission mise à jour', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur mise à jour permission', 'error');
    }
  };

  if (user?.role_code === 'SUPER_ADMIN') {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-2">
        <h1 className="font-display text-xl font-bold">Paramètres Plateforme +HR</h1>
        <p className="text-sm text-slate-500">
          Les paramètres métiers (horaires, règles de sortie, paie MAD, jours fériés) sont configurés indépendamment par chaque entreprise cliente. Gérez les entreprises depuis le menu Entreprises.
        </p>
      </div>
    );
  }

  if (loading || !company || !settings) {
    return <div className="h-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl animate-pulse" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Paramètres Entreprise</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Configuration horaire, règles de pointage & sorties, taux de paie MAD et matrice de permissions RBAC
          </p>
        </div>

        {canEdit && (
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Enregistrement…' : 'Enregistrer tout'}
          </button>
        )}
      </div>

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Company Info */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 font-display text-base font-semibold">
            <SettingsIcon className="w-4 h-4 text-blue-600" />
            Informations entreprise & localisation
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-500 mb-1">Nom commercial</label>
              <input
                disabled={!canEdit}
                value={company.name}
                onChange={(e) => setCompany({ ...company, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Ville</label>
              <input
                disabled={!canEdit}
                value={company.city}
                onChange={(e) => setCompany({ ...company, city: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Téléphone</label>
              <input
                disabled={!canEdit}
                value={company.phone}
                onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Devise</label>
              <input
                disabled={!canEdit}
                value={settings.currency}
                onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Fuseau horaire</label>
              <input
                disabled={!canEdit}
                value={settings.timezone}
                onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
          </div>
        </section>

        {/* Attendance, Exits & Payroll rules */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="font-display text-base font-semibold">Horaires, Sorties & Paramètres Paie</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Début journée</label>
              <input
                type="time"
                disabled={!canEdit}
                value={settings.work_start_time}
                onChange={(e) => setSettings({ ...settings, work_start_time: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Fin journée</label>
              <input
                type="time"
                disabled={!canEdit}
                value={settings.work_end_time}
                onChange={(e) => setSettings({ ...settings, work_end_time: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Tolérance retard (min)</label>
              <input
                type="number"
                disabled={!canEdit}
                value={settings.late_threshold_minutes}
                onChange={(e) => setSettings({ ...settings, late_threshold_minutes: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Max sortie / jour (h)</label>
              <input
                type="number"
                step="0.5"
                disabled={!canEdit}
                value={settings.exit_max_hours_per_day}
                onChange={(e) => setSettings({ ...settings, exit_max_hours_per_day: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Cumul sortie → 1j (h)</label>
              <input
                type="number"
                step="0.5"
                disabled={!canEdit}
                value={settings.exit_conversion_hours}
                onChange={(e) => setSettings({ ...settings, exit_conversion_hours: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Coeff. heures sup.</label>
              <input
                type="number"
                step="0.05"
                disabled={!canEdit}
                value={settings.overtime_multiplier}
                onChange={(e) => setSettings({ ...settings, overtime_multiplier: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Taux cotisations config. (%)</label>
              <input
                type="number"
                step="0.1"
                disabled={!canEdit}
                value={settings.payroll_contribution_rate}
                onChange={(e) => setSettings({ ...settings, payroll_contribution_rate: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Taux retenue fiscale config. (%)</label>
              <input
                type="number"
                step="0.1"
                disabled={!canEdit}
                value={settings.payroll_tax_rate}
                onChange={(e) => setSettings({ ...settings, payroll_tax_rate: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
          </div>

          <div className="space-y-2 pt-2 text-xs">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={settings.enable_exit_rules}
                onChange={(e) => setSettings({ ...settings, enable_exit_rules: e.target.checked })}
              />
              Activer les règles de plafonnement & conversion des sorties
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={settings.require_geolocation_checkin}
                onChange={(e) => setSettings({ ...settings, require_geolocation_checkin: e.target.checked })}
              />
              Exiger la géolocalisation lors du pointage
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={settings.allow_webauthn_checkin}
                onChange={(e) => setSettings({ ...settings, allow_webauthn_checkin: e.target.checked })}
              />
              Autoriser la vérification WebAuthn / Passkey au pointage
            </label>
          </div>
        </section>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Holidays & Leave Types */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 font-display text-base font-semibold">
            <Calendar className="w-4 h-4 text-blue-600" />
            Jours fériés ({holidays.length}) & Types de congés ({leaveTypes.length})
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <input
                placeholder="Nom du jour férié"
                value={newHoliday.name}
                onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })}
                className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
              <input
                type="date"
                value={newHoliday.date}
                onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
              <button
                type="button"
                onClick={handleAddHoliday}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" />
                Ajouter
              </button>
            </div>
          )}
          <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {holidays.map((h) => (
              <div key={h.id} className="py-2 flex items-center justify-between">
                <span className="font-medium text-slate-800 dark:text-slate-200">{h.name}</span>
                <span className="font-mono text-slate-500 tabular-nums">{h.date}</span>
              </div>
            ))}
          </div>
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
            Types de congés actifs : {leaveTypes.map((lt) => `${lt.name_fr} (${lt.default_days_per_year}j)`).join(' · ')}
          </div>
        </section>

        {/* Role permissions matrix */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 font-display text-base font-semibold">
            <Shield className="w-4 h-4 text-blue-600" />
            Matrice des permissions par rôle
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {rolePermissions.length === 0 ? (
              <p className="text-slate-400">Permissions standards actives pour votre entreprise.</p>
            ) : (
              rolePermissions.map((rp) => (
                <div key={rp.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 me-2">{rp.role_code}</span>
                    <span className="font-mono text-slate-500">{rp.permission_code}</span>
                  </div>
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={rp.allowed}
                    onChange={() => handleTogglePerm(rp.id)}
                    className="w-4 h-4 accent-blue-600"
                  />
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
