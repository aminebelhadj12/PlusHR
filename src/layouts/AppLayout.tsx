import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  DatabaseBackup,
  Users,
  UserPlus,
  Network,
  Clock,
  CalendarOff,
  DoorOpen,
  CalendarDays,
  Kanban,
  FileText,
  Wallet,
  Megaphone,
  Video,
  MessageSquare,
  Bell,
  Bot,
  BarChart3,
  Sparkles,
  FileBarChart,
  Settings,
  UserCircle,
  Search,
  Sun,
  Moon,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { BrandLogo } from '../components/ui/BrandLogo';
import { dashboardCopy } from '../utils/dashboardCopy';
import { t } from '../utils/i18n';
import { apiRequest } from '../services/api';
import type { AppLang, RoleCode } from '../types';

interface NavItem {
  to: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: RoleCode[];
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', labelKey: 'dashboard', icon: LayoutDashboard, roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE'] },
  { to: '/companies', labelKey: 'companies', icon: Building2, roles: ['SUPER_ADMIN'] },
  { to: '/backups', labelKey: 'backups', icon: DatabaseBackup, roles: ['SUPER_ADMIN'] },
  { to: '/employees', labelKey: 'employees', icon: Users, roles: ['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'] },
  { to: '/registration-requests', labelKey: 'registrations', icon: UserPlus, roles: ['COMPANY_ADMIN', 'HR_MANAGER'] },
  { to: '/departments', labelKey: 'departments', icon: Network, roles: ['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'] },
  { to: '/attendance', labelKey: 'attendance', icon: Clock, roles: ['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE'] },
  { to: '/leaves', labelKey: 'leaves', icon: CalendarOff, roles: ['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE'] },
  { to: '/exits', labelKey: 'exits', icon: DoorOpen, roles: ['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE'] },
  { to: '/schedules', labelKey: 'schedules', icon: CalendarDays, roles: ['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE'] },
  { to: '/tasks', labelKey: 'tasks', icon: Kanban, roles: ['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE'] },
  { to: '/contracts', labelKey: 'contracts', icon: FileText, roles: ['COMPANY_ADMIN', 'HR_MANAGER', 'EMPLOYEE'] },
  { to: '/payroll', labelKey: 'payroll', icon: Wallet, roles: ['COMPANY_ADMIN', 'HR_MANAGER', 'EMPLOYEE'] },
  { to: '/announcements', labelKey: 'announcements', icon: Megaphone, roles: ['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE'] },
  { to: '/meetings', labelKey: 'meetings', icon: Video, roles: ['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE'] },
  { to: '/messages', labelKey: 'messages', icon: MessageSquare, roles: ['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE'] },
  { to: '/ai-assistant', labelKey: 'aiAssistant', icon: Bot, roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE'] },
  { to: '/ai-analytics', labelKey: 'aiAnalytics', icon: BarChart3, roles: ['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'] },
  { to: '/ai-schedule', labelKey: 'aiSchedule', icon: Sparkles, roles: ['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'] },
  { to: '/reports', labelKey: 'reports', icon: FileBarChart, roles: ['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'] },
  { to: '/settings', labelKey: 'settings', icon: Settings, roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'] },
];

const dashboardNavGroups = [
  { key: 'platform', icon: Building2, paths: ['/companies', '/backups'] },
  { key: 'people', icon: Users, paths: ['/employees', '/registration-requests', '/departments', '/contracts'] },
  { key: 'operations', icon: CalendarDays, paths: ['/attendance', '/leaves', '/exits', '/schedules', '/tasks'] },
  { key: 'communication', icon: MessageSquare, paths: ['/announcements', '/meetings', '/messages'] },
  { key: 'management', icon: BarChart3, paths: ['/payroll', '/ai-assistant', '/ai-analytics', '/ai-schedule', '/reports', '/settings'] },
] as const;

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, lang, setLang, theme, setTheme, logout, notifications, unreadCount, markNotificationRead } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const dashboard = location.pathname === '/';
  const dashboardLabels = dashboardCopy[lang];

  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ type: string; title: string; subtitle: string; path: string }>>([]);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const visibleNav = NAV_ITEMS.filter((item) => user && item.roles.includes(user.role_code));

  useEffect(() => {
    setMobileOpen(false);
    setShowNotifMenu(false);
    setShowProfileMenu(false);
  }, [location.pathname]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await apiRequest<{ results: Array<{ type: string; title: string; subtitle: string; path: string }> }>(
          `/api/search?q=${encodeURIComponent(q)}`
        );
        setSearchResults(res.results);
      } catch {
        setSearchResults([]);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const currentNav = visibleNav.find((n) => (n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)));
  const currentTitle = currentNav ? t(lang, currentNav.labelKey) : t(lang, 'dashboard');

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getNavLabel = (item: NavItem) =>
  user?.role_code === 'EMPLOYEE' && item.to === '/attendance'
    ? t(lang, 'myAttendance')
    : user?.role_code === 'EMPLOYEE' && item.to === '/leaves'
    ? t(lang, 'myLeaves')
    : user?.role_code === 'EMPLOYEE' && item.to === '/exits'
    ? t(lang, 'myExits')
    : user?.role_code === 'EMPLOYEE' && item.to === '/schedules'
    ? t(lang, 'mySchedule')
    : user?.role_code === 'EMPLOYEE' && item.to === '/tasks'
    ? t(lang, 'myTasks')
    : user?.role_code === 'EMPLOYEE' && item.to === '/contracts'
    ? t(lang, 'myContracts')
    : user?.role_code === 'EMPLOYEE' && item.to === '/payroll'
    ? t(lang, 'myPayslips')
    : t(lang, item.labelKey);

  const groups = dashboardNavGroups.map((group) => ({
    ...group, items: visibleNav.filter((item) => group.paths.some((path) => path === item.to)),
  })).filter((group) => group.items.length > 0);

  return (
    <div className={`app-shell min-h-dvh flex bg-[#F8FAFC] dark:bg-[#0B1120] text-[#0F172A] dark:text-slate-100 ${dashboard ? 'dashboard-home' : ''}`}>
      {/* Desktop Sidebar */}
      <aside
        className={`app-sidebar sticky top-0 hidden h-dvh flex-col self-start lg:flex border-e border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-all duration-200 shrink-0 no-print ${
          collapsed ? 'w-[70px]' : 'w-[var(--app-sidebar-width)]'
        }`}
      >
        <div className={`app-header-height flex shrink-0 items-center justify-between border-b border-slate-200 dark:border-slate-800 ${collapsed ? 'px-1.5' : 'px-4'}`}>
          <Link to="/" className="focus:outline-none">
            <BrandLogo variant={collapsed ? 'icon' : 'icon-with-name'} />
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Réduire la barre latérale"
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 space-y-0.5">
          {dashboard && !collapsed ? (
            <>
              <Link to="/" aria-current="page" className="plus-nav-active flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold">
                <LayoutDashboard className="size-4" aria-hidden="true" />{t(lang, 'dashboard')}
              </Link>
              {groups.map(({ key, icon: Icon, items }, index) => {
                const open = expandedGroups[key] ?? index === 0;
                const groupId = `dashboard-nav-${key}`;
                return (
                  <div key={key} className="plus-nav-group">
                    <button type="button" aria-expanded={open} aria-controls={groupId}
                      onClick={() => setExpandedGroups((previous) => ({ ...previous, [key]: !open }))}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-start text-sm font-semibold hover:bg-blue-50 dark:hover:bg-slate-800">
                      <Icon className="size-4 shrink-0 text-blue-600 dark:text-blue-300" aria-hidden="true" />
                      <span className="min-w-0 flex-1">{dashboardLabels[key]}</span>
                      <ChevronDown aria-hidden="true" className={`size-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                    <div id={groupId} hidden={!open} className="plus-nav-children">
                      {items.map((item) => (
                        <Link key={item.to} to={item.to}
                          className="block rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-blue-50 hover:text-blue-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-blue-200">
                          {getNavLabel(item)}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          ) : (visibleNav.map((item) => {
            const Icon = item.icon;
            const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
            const label = getNavLabel(item);

            return (
              <Link
                key={item.to}
                to={item.to}
                title={label}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-600/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
            );
          }))}
        </nav>

        {!collapsed && user && dashboard ? (
          <div className="shrink-0">
            <section className="plus-sidebar-card">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="size-4" aria-hidden="true" />{dashboardLabels.help}
              </div>
              <Link to="/ai-assistant" className="inline-flex w-full items-center justify-center rounded-md px-2 py-1.5 text-xs font-semibold">
                {dashboardLabels.openAi}
              </Link>
            </section>
            <Link to="/profile" className="flex items-center gap-2 border-t border-slate-200 px-3 py-2.5 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800">
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-blue-100 text-sm font-bold text-blue-800 dark:bg-blue-900 dark:text-blue-100" aria-hidden="true">
                {user.full_name.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{user.full_name}</span>
                <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{user.company_name}</span>
              </span>
              <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-slate-500 rtl:rotate-180" />
            </Link>
          </div>
        ) : (!collapsed && user && (
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">{user.company_name}</div>
            <div className="truncate mt-0.5">{user.role_code.replace('_', ' ')}</div>
          </div>
        ))}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-950/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] bg-white dark:bg-slate-900 h-dvh min-h-0 flex flex-col border-e border-slate-200 dark:border-slate-800 z-10">
            <div className="app-header-height shrink-0 px-3 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <BrandLogo variant="icon-with-name" />
              <button type="button" onClick={() => setMobileOpen(false)} className="p-2 text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 space-y-1">
              {visibleNav.map((item) => {
                const Icon = item.icon;
                const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                      active ? 'bg-blue-600/10 text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{t(lang, item.labelKey)}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <header className="app-header-height bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-2.5 sm:px-4 lg:px-5 flex items-center justify-between gap-1.5 sm:gap-3 sticky top-0 z-30 no-print">
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden shrink-0 p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            {dashboard ? (
              <div className="min-w-0">
                <p className="truncate font-display text-base font-bold text-slate-950 dark:text-white sm:text-lg">
                  {dashboardLabels.greeting}{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}
                </p>
                <p className="hidden truncate text-xs text-slate-500 dark:text-slate-400 sm:block">{user?.company_name}</p>
              </div>
            ) : (
              <>            <BrandLogo variant="icon" />
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm min-w-0">
              <Link to="/" className="hidden sm:inline text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 whitespace-nowrap">
                +HR
              </Link>
              <ChevronRight className="hidden sm:block w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="font-display font-semibold text-slate-900 dark:text-white truncate">{currentTitle}</span>
            </nav></>
            )}
          </div>

          {/* Global Search */}
          <div className="relative hidden md:block min-w-0 flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t(lang, 'searchPlaceholder')}
              className="w-full ps-9 pe-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
            />
            {searchResults.length > 0 && (
              <div className="absolute top-full mt-1.5 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg overflow-hidden z-50">
                {searchResults.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      navigate(r.path);
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                    className="w-full px-3.5 py-2.5 text-start flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 text-sm border-b last:border-b-0 border-slate-100 dark:border-slate-800"
                  >
                    <div>
                      <div className="font-medium text-slate-900 dark:text-white">{r.title}</div>
                      <div className="text-xs text-slate-500">{r.subtitle}</div>
                    </div>
                    <span className="text-xs text-blue-600 dark:text-blue-400">{r.type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Language selector */}
            <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden text-xs font-medium">
              {(['fr', 'en', 'ar'] as AppLang[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  className={`px-1.5 sm:px-2 py-1.5 uppercase transition-colors ${
                    lang === l
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            {/* Theme controls */}
            {dashboard && (
              <div className="plus-theme-switch hidden items-center rounded-xl p-0.5 lg:flex">
                {(['light', 'dark'] as const).map((mode) => {
                  const Icon = mode === 'light' ? Sun : Moon;
                  return (
                    <button key={mode} type="button" aria-pressed={theme === mode} onClick={() => setTheme(mode)}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold">
                      <Icon aria-hidden="true" className="size-4" />{dashboardLabels[mode]}
                    </button>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className={`p-1.5 sm:p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 ${dashboard ? 'lg:hidden' : ''}`}
              aria-label="Changer de thème"
            >
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>

            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowNotifMenu((s) => !s);
                  setShowProfileMenu(false);
                }}
                className="relative p-1.5 sm:p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {showNotifMenu && (
                <div className="app-notification-menu bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">{t(lang, 'notifications')}</span>
                    <div className="flex items-center gap-2">
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={() => markNotificationRead('all')}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Tout marquer lu
                        </button>
                      )}
                      <Link to="/notifications" className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
                        Historique
                      </Link>
                    </div>
                  </div>
                  <div className="max-h-[min(20rem,calc(100dvh-var(--app-header-height)-4rem))] overflow-y-auto overscroll-contain divide-y divide-slate-100 dark:divide-slate-800">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">Aucune notification</div>
                    ) : (
                      notifications.slice(0, 8).map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            if (!n.is_read) markNotificationRead(n.id);
                            if (n.link_path) navigate(n.link_path);
                            setShowNotifMenu(false);
                          }}
                          className={`w-full text-start px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${
                            !n.is_read ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
                          }`}
                        >
                          <div className="text-xs font-semibold text-slate-900 dark:text-white">{n.title}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{n.message}</div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Profile dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowProfileMenu((s) => !s);
                  setShowNotifMenu(false);
                }}
                className="flex items-center gap-2 px-1.5 sm:ps-2 sm:pe-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm"
              >
                <div className="w-6 h-6 rounded-md bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {user?.full_name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <span className="hidden sm:inline font-medium text-slate-800 dark:text-slate-100 max-w-[130px] truncate">
                  {user?.full_name}
                </span>
              </button>

              {showProfileMenu && (
                <div className="absolute end-0 mt-2 w-56 max-w-[calc(100vw-1.25rem)] max-h-[calc(100dvh-var(--app-header-height)-1rem)] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-50 py-1">
                  <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">{user?.full_name}</div>
                    <div className="text-xs text-slate-500 truncate">{user?.matricule || user?.email}</div>
                  </div>
                  <Link
                    to="/profile"
                    className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <UserCircle className="w-4 h-4" />
                    <span>{t(lang, 'profile')}</span>
                  </Link>
                  <Link
                    to="/notifications"
                    className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <Bell className="w-4 h-4" />
                    <span>{t(lang, 'notifications')}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 text-start"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>{t(lang, 'logout')}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="app-content mx-auto min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
};
