import { useEffect, useState, type FormEvent } from 'react';
import { DatabaseBackup, Download, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { apiDownload, apiRequest } from '../services/api';
import { t } from '../utils/i18n';

interface Backup {
  id: string;
  kind: 'daily' | 'manual' | 'pre-restore';
  createdAt: string;
  size: number;
  integrity: 'ok' | 'invalid';
}

const endpoint = '/api/platform/backups';
const labels = { daily: 'Quotidienne', manual: 'Manuelle', 'pre-restore': 'Avant restauration' };
const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50';
const field = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1048576).toFixed(1)} Mo`;
}

export function BackupsPage() {
  const { addToast, lang, logout } = useApp();
  const navigate = useNavigate();
  const [backups, setBackups] = useState<Backup[] | null>(null);
  const [action, setAction] = useState<{ kind: 'download' | 'restore'; backup: Backup } | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function loadHistory() {
    const { backups } = await apiRequest<{ backups: Backup[] }>(endpoint);
    setBackups(backups);
  }

  useEffect(() => {
    void loadHistory().catch((error: Error) => setError(error.message));
  }, []);

  function selectAction(next: typeof action) {
    setError('');
    setPassword('');
    setConfirmation('');
    setAction(next);
  }

  async function createBackup() {
    setBusy(true);
    setError('');
    try {
      await apiRequest(endpoint, { method: 'POST' });
      await loadHistory();
      addToast('Sauvegarde cr??e.', 'success');
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!action) return;
    setError('');
    setBusy(true);
    const url = `${endpoint}/${encodeURIComponent(action.backup.id)}/${action.kind}`;
    const options = { method: 'POST', body: JSON.stringify({ password, confirmation }) };
    setPassword('');
    try {
      if (action.kind === 'download') {
        const file = await apiDownload(url, options);
        const objectUrl = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = action.backup.id;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
        selectAction(null);
      } else {
        await apiRequest(url, options);
        await logout();
        addToast('Base restaur?e. Reconnectez-vous pour continuer.', 'success');
        navigate('/login', { replace: true });
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">{t(lang, 'backups')}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Les 7 derni?res sauvegardes quotidiennes sont conserv?es.</p>
        </div>
        <button className={primaryButton} type="button" onClick={() => void createBackup()} disabled={busy}>
          <DatabaseBackup className="h-4 w-4" /> Cr?er une sauvegarde
        </button>
      </header>

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}

      {action && (
        <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-semibold">{action.kind === 'restore' ? 'Confirmer la restauration' : 'Confirmer le t?l?chargement'}</h2>
          <p className="break-all text-sm text-slate-500 dark:text-slate-400">{action.backup.id}</p>
          {action.kind === 'restore' && (
            <label className="block space-y-2 text-sm">
              <span>La restauration remplace les donn?es par celles de cette sauvegarde. Une copie de la base actuelle est cr??e avant l?op?ration et les sessions sont ferm?es. Saisissez <strong>RESTAURER</strong> pour confirmer.</span>
              <input className={field} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required autoComplete="off" />
            </label>
          )}
          <label className="block space-y-1 text-sm">
            <span>Mot de passe actuel</span>
            <input className={field} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          <div className="flex flex-wrap gap-3">
            <button className={primaryButton} type="submit" disabled={busy || !password || (action.kind === 'restore' && confirmation !== 'RESTAURER')}>
              {action.kind === 'restore' ? 'Restaurer la base' : 'T?l?charger la sauvegarde'}
            </button>
            <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm disabled:opacity-50 dark:border-slate-700" type="button" disabled={busy} onClick={() => selectAction(null)}>Annuler</button>
          </div>
          {busy && <p role="status" className="text-sm text-slate-500">Op?ration en cours?</p>}
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {backups?.length ? (
          <table className="w-full text-start text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>{['Sauvegarde', 'Date', 'Taille', 'Int?grit?', 'Actions'].map((label) => <th key={label} scope="col" className="px-4 py-3 text-start font-semibold">{label}</th>)}</tr>
            </thead>
            <tbody>
              {backups.map((backup) => (
                <tr className="border-t border-slate-100 dark:border-slate-800" key={backup.id}>
                  <td className="px-4 py-3"><p>{labels[backup.kind]}</p><p className="text-xs text-slate-500 dark:text-slate-400">{backup.id}</p></td>
                  <td className="whitespace-nowrap px-4 py-3"><time dateTime={backup.createdAt}>{new Date(backup.createdAt).toLocaleString(lang)}</time></td>
                  <td className="whitespace-nowrap px-4 py-3">{formatSize(backup.size)}</td>
                  <td className={`px-4 py-3 ${backup.integrity === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-300'}`}>{backup.integrity === 'ok' ? 'V?rifi?e' : 'Invalide'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button type="button" disabled={busy || backup.integrity !== 'ok'} onClick={() => selectAction({ kind: 'download', backup })} className="inline-flex items-center gap-1 text-blue-700 disabled:opacity-40 dark:text-blue-400"><Download className="h-4 w-4" /> T?l?charger</button>
                      <button type="button" disabled={busy || backup.integrity !== 'ok'} onClick={() => selectAction({ kind: 'restore', backup })} className="inline-flex items-center gap-1 text-red-700 disabled:opacity-40 dark:text-red-300"><RotateCcw className="h-4 w-4" /> Restaurer</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="p-4 text-sm text-slate-500">{backups ? 'Aucune sauvegarde disponible.' : error ? 'Historique indisponible.' : 'Chargement des sauvegardes?'}</p>}
      </div>
    </section>
  );
}
