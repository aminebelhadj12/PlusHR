import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { AppLang, AuthUser, NotificationItem, ThemeMode } from '../types';
import { apiRequest, getAccessToken, setAccessToken } from '../services/api';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

interface AppContextValue {
  user: AuthUser | null;
  authLoading: boolean;
  lang: AppLang;
  theme: ThemeMode;
  notifications: NotificationItem[];
  unreadCount: number;
  toasts: ToastItem[];
  socket: Socket | null;
  setSession: (user: AuthUser, token: string) => void;
  updateUser: (user: AuthUser) => void;
  logout: () => Promise<void>;
  setLang: (lang: AppLang) => void;
  setTheme: (theme: ThemeMode) => void;
  addToast: (message: string, type?: ToastItem['type']) => void;
  dismissToast: (id: string) => void;
  refreshNotifications: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [lang, setLangState] = useState<AppLang>('fr');
  const [theme, setThemeState] = useState<ThemeMode>('light');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const [socketState, setSocketState] = useState<Socket | null>(null);

  const addToast = useCallback((message: string, type: ToastItem['type'] = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Sync HTML lang, dir, and dark class
  useEffect(() => {
    const html = document.documentElement;
    html.lang = lang;
    html.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    const html = document.documentElement;
    if (theme === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }, [theme]);

  const refreshNotifications = useCallback(async () => {
    if (!getAccessToken()) return;
    try {
      const res = await apiRequest<{ notifications: NotificationItem[]; unreadCount: number }>('/api/notifications');
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch {
      // ignore transient
    }
  }, []);

  const markNotificationRead = useCallback(async (id: string) => {
    await apiRequest(`/api/notifications/${id}/read`, { method: 'POST' });
    setNotifications((prev) =>
      id === 'all' ? prev.map((n) => ({ ...n, is_read: true })) : prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnreadCount((prev) => (id === 'all' ? 0 : Math.max(0, prev - 1)));
  }, []);

  // Restore session on mount via HttpOnly refresh cookie
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await apiRequest<{ accessToken: string; user: AuthUser }>('/api/auth/refresh', { method: 'POST' });
        if (mounted && res.accessToken && res.user) {
          setAccessToken(res.accessToken);
          setUser(res.user);
          setLangState(res.user.preferred_lang || 'fr');
          setThemeState(res.user.theme || 'light');
        }
      } catch {
        // Not signed in yet
      } finally {
        if (mounted) setAuthLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Manage Socket.io connection when authenticated
  useEffect(() => {
    const token = getAccessToken();
    if (!user || !token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocketState(null);
      }
      return;
    }

    refreshNotifications();
    const s = io({
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    s.on('notification:new', (notif: NotificationItem) => {
      setNotifications((prev) => (prev.some((p) => p.id === notif.id) ? prev : [notif, ...prev]));
      setUnreadCount((c) => c + 1);
      addToast(notif.title, 'info');
    });

    socketRef.current = s;
    setSocketState(s);

    return () => {
      s.disconnect();
      socketRef.current = null;
      setSocketState(null);
    };
  }, [user?.id, refreshNotifications, addToast]);

  const setSession = useCallback((u: AuthUser, token: string) => {
    setAccessToken(token);
    setUser(u);
    setLangState(u.preferred_lang || 'fr');
    setThemeState(u.theme || 'light');
  }, []);

  const updateUser = useCallback((u: AuthUser) => {
    setUser(u);
    setLangState(u.preferred_lang || 'fr');
    setThemeState(u.theme || 'light');
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setAccessToken(null);
    setUser(null);
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  const setLang = useCallback(
    (nextLang: AppLang) => {
      setLangState(nextLang);
      if (user) {
        apiRequest('/api/auth/profile', {
          method: 'PUT',
          body: JSON.stringify({ preferred_lang: nextLang }),
        }).catch(() => {});
      }
    },
    [user]
  );

  const setTheme = useCallback(
    (nextTheme: ThemeMode) => {
      setThemeState(nextTheme);
      if (user) {
        apiRequest('/api/auth/profile', {
          method: 'PUT',
          body: JSON.stringify({ theme: nextTheme }),
        }).catch(() => {});
      }
    },
    [user]
  );

  return (
    <AppContext.Provider
      value={{
        user,
        authLoading,
        lang,
        theme,
        notifications,
        unreadCount,
        toasts,
        socket: socketState,
        setSession,
        updateUser,
        logout,
        setLang,
        setTheme,
        addToast,
        dismissToast,
        refreshNotifications,
        markNotificationRead,
      }}
    >
      {children}
      {/* Toast viewport */}
      <div className="fixed bottom-4 end-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-lg border text-sm font-medium shadow-sm transition-all ${
              toast.type === 'success'
                ? 'bg-white dark:bg-slate-900 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                : toast.type === 'error'
                ? 'bg-white dark:bg-slate-900 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                : toast.type === 'warning'
                ? 'bg-white dark:bg-slate-900 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
            }`}
          >
            <span className="truncate">{toast.message}</span>
            <button
              onClick={() => dismissToast(toast.id)}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
