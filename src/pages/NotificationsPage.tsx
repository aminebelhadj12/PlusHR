import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Save, ArrowUpRight } from 'lucide-react';
import { apiRequest } from '../services/api';
import { useApp } from '../contexts/AppContext';
import type { NotificationItem } from '../types';

interface NotificationPrefs {
  email_enabled: boolean;
  realtime_enabled: boolean;
  leave_updates: boolean;
  message_alerts: boolean;
  meeting_alerts: boolean;
}

export const NotificationsPage: React.FC = () => {
  const { notifications, unreadCount, markNotificationRead, refreshNotifications, addToast } = useApp();
  const navigate = useNavigate();

  const [prefs, setPrefs] = useState<NotificationPrefs>({
    email_enabled: true,
    realtime_enabled: true,
    leave_updates: true,
    message_alerts: true,
    meeting_alerts: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    refreshNotifications();
    apiRequest<{ notifications: NotificationItem[]; preferences: NotificationPrefs }>('/api/notifications')
      .then((res) => {
        if (res.preferences) setPrefs(res.preferences);
      })
      .catch(() => {});
  }, [refreshNotifications]);

  const handleSavePrefs = async () => {
    setSaving(true);
    try {
      await apiRequest('/api/notifications/preferences', {
        method: 'PUT',
        body: JSON.stringify(prefs),
      });
      addToast('Préférences de notifications enregistrées', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur sauvegarde préférences', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Centre de Notifications</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Alertes temps réel Socket.io ({unreadCount} non lue{unreadCount > 1 ? 's' : ''})
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => markNotificationRead('all')}
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <CheckCheck className="w-4 h-4 text-blue-600" />
            Tout marquer comme lu
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 font-display text-sm font-semibold text-slate-900 dark:text-white">
            Historique récent ({notifications.length})
          </div>
          {notifications.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              <Bell className="w-7 h-7 text-slate-400 mx-auto mb-2" />
              Aucune notification reçue.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-4 flex items-start justify-between gap-4 transition-colors ${
                    !n.is_read ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {!n.is_read && <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />}
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{n.title}</span>
                      <span className="text-xs text-slate-400 tabular-nums">
                        {new Date(n.created_at).toLocaleString('fr-FR')}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{n.message}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!n.is_read && (
                      <button
                        type="button"
                        onClick={() => markNotificationRead(n.id)}
                        className="text-xs text-slate-500 hover:text-blue-600"
                      >
                        Marquer lu
                      </button>
                    )}
                    {n.link_path && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!n.is_read) markNotificationRead(n.id);
                          navigate(n.link_path!);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                      >
                        Ouvrir
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 h-fit">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">Préférences</h2>
          <div className="space-y-3 text-sm">
            {[
              { key: 'realtime_enabled', label: 'Notifications temps réel (Socket.io)' },
              { key: 'leave_updates', label: 'Suivi des demandes de congés et sorties' },
              { key: 'message_alerts', label: 'Alertes nouveaux messages privés' },
              { key: 'meeting_alerts', label: 'Invitations et rappels de réunions' },
              { key: 'email_enabled', label: 'Alertes par email (si SMTP configuré)' },
            ].map((opt) => (
              <label key={opt.key} className="flex items-center justify-between gap-3 cursor-pointer">
                <span className="text-slate-700 dark:text-slate-300">{opt.label}</span>
                <input
                  type="checkbox"
                  checked={prefs[opt.key as keyof NotificationPrefs]}
                  onChange={(e) => setPrefs((p) => ({ ...p, [opt.key]: e.target.checked }))}
                  className="w-4 h-4 accent-blue-600"
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={handleSavePrefs}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Enregistrement…' : 'Enregistrer les préférences'}
          </button>
        </div>
      </div>
    </div>
  );
};
