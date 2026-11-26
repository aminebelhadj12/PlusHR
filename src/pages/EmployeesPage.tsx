import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, FileSpreadsheet, Upload, UserPlus, Eye, Archive, Power, Trash2 } from 'lucide-react';
import { apiRequest } from '../services/api';
import { useApp } from '../contexts/AppContext';
import { DataTable, ColumnDef } from '../components/ui/DataTable';
import { StatusText } from '../components/ui/StatusText';
import { ConfirmModal, Modal } from '../components/ui/ConfirmModal';
import { exportToExcel, exportToPdf } from '../utils/exportUtils';
import type { Department, Employee } from '../types';

export const EmployeesPage: React.FC = () => {
  const { user, addToast } = useApp();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<{ emp: Employee; nextStatus: 'inactive' | 'archived' | 'active' } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [importModal, setImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);

  const canManage = user?.role_code === 'COMPANY_ADMIN' || user?.role_code === 'HR_MANAGER';

  const load = async () => {
    try {
      const [empRes, deptRes] = await Promise.all([
        apiRequest<{ employees: Employee[] }>('/api/employees'),
        apiRequest<{ departments: Department[] }>('/api/departments'),
      ]);
      setEmployees(empRes.employees);
      setDepartments(deptRes.departments);
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return employees.filter((e) => {
      if (deptFilter && e.department_id !== deptFilter) return false;
      if (statusFilter && e.status !== statusFilter) return false;
      return true;
    });
  }, [employees, deptFilter, statusFilter]);

  const handleStatusChange = async () => {
    if (!confirmTarget) return;
    try {
      await apiRequest(`/api/employees/${confirmTarget.emp.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: confirmTarget.nextStatus }),
      });
      addToast('Statut employé mis à jour.', 'success');
      setConfirmTarget(null);
      await load();
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  };

  const handleDeleteEmployee = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/employees/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      addToast('Employé supprimé définitivement.', 'success');
      setDeleteTarget(null);
      await load();
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) return;
    const fd = new FormData();
    fd.append('file', importFile);
    try {
      const res = await apiRequest<{ imported: number; errors: string[] }>('/api/employees/import', {
        method: 'POST',
        body: fd,
      });
      addToast(`${res.imported} demande(s) d’ajout créées depuis le fichier.`, 'success');
      setImportModal(false);
      setImportFile(null);
      navigate('/registration-requests');
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  };

  const handleExportExcel = () => {
    exportToExcel(
      'employes_plushr',
      'Employés',
      filtered.map((e) => ({
        Matricule: e.matricule,
        Nom: `${e.first_name} ${e.last_name}`,
        Email: e.email,
        Téléphone: e.phone,
        Département: e.department_name,
        Poste: e.position_title,
        Manager: e.manager_name,
        Embauche: e.hire_date,
        Contrat: e.contract_type,
        Statut: e.status,
      }))
    );
  };

  const handleExportPdf = () => {
    exportToPdf({
      filename: 'employes_plushr.pdf',
      title: 'Répertoire du Personnel',
      companyName: user?.company_name || '+HR',
      columns: ['Matricule', 'Nom Complet', 'Département', 'Poste', 'Contrat', 'Statut'],
      rows: filtered.map((e) => ({
        Matricule: e.matricule,
        'Nom Complet': `${e.first_name} ${e.last_name}`,
        Département: e.department_name,
        Poste: e.position_title,
        Contrat: e.contract_type,
        Statut: e.status,
      })),
    });
  };

  const columns: ColumnDef<Employee>[] = [
    {
      key: 'name',
      header: 'Employé',
      sortValue: (e) => `${e.last_name} ${e.first_name}`,
      render: (e) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center shrink-0">
            {e.first_name.charAt(0)}{e.last_name.charAt(0)}
          </div>
          <div>
            <Link to={`/employees/${e.id}`} className="font-semibold text-slate-900 dark:text-white hover:text-blue-600">
              {e.first_name} {e.last_name}
            </Link>
            <div className="text-xs text-slate-500 font-mono">{e.matricule} · {e.email}</div>
          </div>
        </div>
      ),
    },
    { key: 'phone', header: 'Téléphone', render: (e) => <span className="font-mono text-xs tabular-nums">{e.phone}</span> },
    {
      key: 'dept',
      header: 'Département & Poste',
      sortValue: (e) => e.department_name || '',
      render: (e) => (
        <div>
          <div className="font-medium text-slate-800 dark:text-slate-200">{e.department_name}</div>
          <div className="text-xs text-slate-500">{e.position_title}</div>
        </div>
      ),
    },
    { key: 'manager', header: 'Manager', render: (e) => <span className="text-xs">{e.manager_name}</span> },
    {
      key: 'contract',
      header: 'Contrat / Embauche',
      render: (e) => (
        <div className="text-xs tabular-nums">
          <span className="font-semibold">{e.contract_type}</span> · {e.hire_date}
        </div>
      ),
    },
    { key: 'status', header: 'Statut', render: (e) => <StatusText status={e.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (e) => (
        <div className="inline-flex items-center gap-1.5">
          <Link
            to={`/employees/${e.id}`}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            title="Consulter dossier"
          >
            <Eye className="w-3.5 h-3.5" />
          </Link>
          {canManage && (
            <>
              <button
                type="button"
                onClick={() => setConfirmTarget({ emp: e, nextStatus: e.status === 'active' ? 'inactive' : 'active' })}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-amber-600"
                title={e.status === 'active' ? 'Désactiver' : 'Réactiver'}
              >
                <Power className="w-3.5 h-3.5" />
              </button>
              {e.status !== 'archived' && (
                <button
                  type="button"
                  onClick={() => setConfirmTarget({ emp: e, nextStatus: 'archived' })}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600"
                  title="Archiver"
                >
                  <Archive className="w-3.5 h-3.5" />
                </button>
              )}
              {e.user_id !== user?.id && (
                <button
                  type="button"
                  onClick={() => setDeleteTarget(e)}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600"
                  title="Supprimer définitivement"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Gestion des Employés</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Répertoire du personnel, dossiers individuels et workflow d’ajout sécurisé
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Excel</span>
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5"
          >
            <Download className="w-4 h-4 text-blue-600" />
            <span>PDF</span>
          </button>
          {canManage && (
            <>
              <button
                type="button"
                onClick={() => setImportModal(true)}
                className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5"
              >
                <Upload className="w-4 h-4" />
                <span>Importer CSV/Excel</span>
              </button>
              {user?.role_code === 'COMPANY_ADMIN' && (
                <Link
                  to="/registration-requests"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Demander un ajout</span>
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        loading={loading}
        searchPlaceholder="Rechercher par nom, matricule ou email…"
        searchFilter={(e, q) =>
          `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) ||
          e.matricule.toLowerCase().includes(q) ||
          e.email.toLowerCase().includes(q)
        }
        toolbarExtras={
          <>
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
            >
              <option value="">Tous les départements</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
            >
              <option value="">Tous les statuts</option>
              <option value="active">Actif</option>
              <option value="on_leave">En congé</option>
              <option value="inactive">Désactivé</option>
              <option value="archived">Archivé</option>
            </select>
          </>
        }
      />

      <ConfirmModal
        open={Boolean(confirmTarget)}
        title="Confirmer la modification du statut"
        message={
          confirmTarget
            ? `Voulez-vous passer ${confirmTarget.emp.first_name} ${confirmTarget.emp.last_name} (${confirmTarget.emp.matricule}) au statut « ${confirmTarget.nextStatus} » ?`
            : ''
        }
        danger={confirmTarget?.nextStatus === 'archived'}
        onConfirm={handleStatusChange}
        onClose={() => setConfirmTarget(null)}
      />

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Confirmer la suppression définitive"
        message={
          deleteTarget
            ? `Voulez-vous supprimer définitivement ${deleteTarget.first_name} ${deleteTarget.last_name} (${deleteTarget.matricule}) et son compte associé ? Cette action est irréversible.`
            : ''
        }
        danger
        onConfirm={handleDeleteEmployee}
        onClose={() => setDeleteTarget(null)}
      />

      <Modal open={importModal} title="Importer des employés (CSV / Excel)" onClose={() => setImportModal(false)}>
        <form onSubmit={handleImport} className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Colonnes reconnues : <span className="font-mono">first_name, last_name, email, matricule, phone, department, salary</span>. Les lignes créent des demandes soumises à validation RH.
          </p>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            required
            onChange={(e) => setImportFile(e.target.files?.[0] || null)}
            className="w-full text-sm file:me-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700"
          />
          <button type="submit" className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg">
            Importer le fichier
          </button>
        </form>
      </Modal>
    </div>
  );
};
