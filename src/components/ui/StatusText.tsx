import React from 'react';
import { CheckCircle2, Clock, AlertTriangle, XCircle, MinusCircle } from 'lucide-react';

interface StatusTextProps {
  status: string;
  label?: string;
}

export const StatusText: React.FC<StatusTextProps> = ({ status, label }) => {
  const map: Record<string, { text: string; color: string; Icon: React.ComponentType<{ className?: string }> }> = {
    active: { text: 'Actif', color: 'text-emerald-600 dark:text-emerald-400', Icon: CheckCircle2 },
    present: { text: 'Présent', color: 'text-emerald-600 dark:text-emerald-400', Icon: CheckCircle2 },
    remote: { text: 'Télétravail', color: 'text-blue-600 dark:text-blue-400', Icon: CheckCircle2 },
    approved: { text: 'Approuvé', color: 'text-emerald-600 dark:text-emerald-400', Icon: CheckCircle2 },
    validated: { text: 'Validée', color: 'text-emerald-600 dark:text-emerald-400', Icon: CheckCircle2 },
    resolved: { text: 'Résolu', color: 'text-emerald-600 dark:text-emerald-400', Icon: CheckCircle2 },
    scheduled: { text: 'Planifiée', color: 'text-blue-600 dark:text-blue-400', Icon: Clock },
    done: { text: 'Terminé', color: 'text-emerald-600 dark:text-emerald-400', Icon: CheckCircle2 },
    pending: { text: 'En attente', color: 'text-amber-600 dark:text-amber-400', Icon: Clock },
    pending_manager: { text: 'Attente Manager', color: 'text-amber-600 dark:text-amber-400', Icon: Clock },
    pending_hr: { text: 'Attente RH', color: 'text-blue-600 dark:text-blue-400', Icon: Clock },
    draft: { text: 'Brouillon', color: 'text-amber-600 dark:text-amber-400', Icon: Clock },
    late: { text: 'En retard', color: 'text-amber-600 dark:text-amber-400', Icon: AlertTriangle },
    expiring_soon: { text: 'Expire bientôt', color: 'text-amber-600 dark:text-amber-400', Icon: AlertTriangle },
    in_progress: { text: 'En cours', color: 'text-blue-600 dark:text-blue-400', Icon: Clock },
    in_review: { text: 'En validation', color: 'text-amber-600 dark:text-amber-400', Icon: Clock },
    todo: { text: 'À faire', color: 'text-slate-600 dark:text-slate-400', Icon: MinusCircle },
    on_leave: { text: 'En congé', color: 'text-blue-600 dark:text-blue-400', Icon: Clock },
    absent: { text: 'Absent', color: 'text-red-600 dark:text-red-400', Icon: XCircle },
    rejected: { text: 'Refusé', color: 'text-red-600 dark:text-red-400', Icon: XCircle },
    rejected_manager: { text: 'Refusé Manager', color: 'text-red-600 dark:text-red-400', Icon: XCircle },
    rejected_hr: { text: 'Refusé RH', color: 'text-red-600 dark:text-red-400', Icon: XCircle },
    suspended: { text: 'Suspendu', color: 'text-red-600 dark:text-red-400', Icon: XCircle },
    expired: { text: 'Expiré', color: 'text-red-600 dark:text-red-400', Icon: XCircle },
    cancelled: { text: 'Annulé', color: 'text-slate-500 dark:text-slate-400', Icon: MinusCircle },
    inactive: { text: 'Désactivé', color: 'text-slate-500 dark:text-slate-400', Icon: MinusCircle },
    archived: { text: 'Archivé', color: 'text-slate-500 dark:text-slate-400', Icon: MinusCircle },
  };

  const entry = map[status] || { text: status, color: 'text-slate-600 dark:text-slate-300', Icon: MinusCircle };
  const Icon = entry.Icon;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${entry.color}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{label || entry.text}</span>
    </span>
  );
};
