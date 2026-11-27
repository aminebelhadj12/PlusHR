import React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { AppLayout } from '../layouts/AppLayout';
import { BrandLogo } from '../components/ui/BrandLogo';
import type { RoleCode } from '../types';

import { ChangePasswordPage } from '../pages/ChangePasswordPage';
import { DashboardPage } from '../pages/DashboardPage';
import { BackupsPage } from '../pages/BackupsPage';
import { CompaniesPage } from '../pages/CompaniesPage';
import { EmployeesPage } from '../pages/EmployeesPage';
import { EmployeeDossierPage } from '../pages/EmployeeDossierPage';
import { RegistrationRequestsPage } from '../pages/RegistrationRequestsPage';
import { DepartmentsPage } from '../pages/DepartmentsPage';
import { AttendancePage } from '../pages/AttendancePage';
import { LeavesPage } from '../pages/LeavesPage';
import { ExitsPage } from '../pages/ExitsPage';
import { SchedulesPage } from '../pages/SchedulesPage';
import { TasksPage } from '../pages/TasksPage';
import { ContractsPage } from '../pages/ContractsPage';
import { PayrollPage } from '../pages/PayrollPage';
import { AnnouncementsPage } from '../pages/AnnouncementsPage';
import { MeetingsPage } from '../pages/MeetingsPage';
import { MessagesPage } from '../pages/MessagesPage';
import { NotificationsPage } from '../pages/NotificationsPage';
import { AiAssistantPage } from '../pages/AiAssistantPage';
import { AiAnalyticsPage } from '../pages/AiAnalyticsPage';
import { AiSchedulePage } from '../pages/AiSchedulePage';
import { ReportsPage } from '../pages/ReportsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { ProfilePage } from '../pages/ProfilePage';
import { LandingPage } from '../pages/LandingPage';

const AccessDeniedView: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center max-w-lg mx-auto mt-10 space-y-4">
      <div className="w-12 h-12 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 flex items-center justify-center mx-auto">
        <ShieldAlert className="w-6 h-6" />
      </div>
      <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">Accès non autorisé</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Votre rôle actuel ne dispose pas des autorisations nécessaires pour consulter cette ressource.
      </p>
      <button
        type="button"
        onClick={() => navigate('/')}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
      >
        Retour au tableau de bord
      </button>
    </div>
  );
};

const ProtectedRoute: React.FC<{ roles?: RoleCode[]; children: React.ReactNode }> = ({ roles, children }) => {
  const { user, authLoading } = useApp();

  if (authLoading) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-[#F8FAFC] dark:bg-[#0B1120] gap-4">
        <BrandLogo />
        <div className="text-xs text-slate-500">Chargement de votre espace sécurisé…</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.must_change_password) {
    return <Navigate to="/change-password" replace />;
  }

  if (roles && !roles.includes(user.role_code)) {
    return (
      <AppLayout>
        <AccessDeniedView />
      </AppLayout>
    );
  }

  return <AppLayout>{children}</AppLayout>;
};

export const AppRouter: React.FC = () => {
  const { user, authLoading } = useApp();

  if (authLoading) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-[#F8FAFC] dark:bg-[#0B1120] gap-4">
        <BrandLogo />
        <div className="text-xs text-slate-500">Initialisation +HR…</div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            user ? (
              <Navigate to={user.must_change_password ? '/change-password' : '/'} replace />
            ) : (
              <LandingPage />
            )
          }
        />

        <Route
          path="/change-password"
          element={user ? <ChangePasswordPage /> : <Navigate to="/login" replace />}
        />

        <Route path="/" element={user ? <ProtectedRoute><DashboardPage /></ProtectedRoute> : <LandingPage />} />
        <Route path="/companies" element={<ProtectedRoute roles={['SUPER_ADMIN']}><CompaniesPage /></ProtectedRoute>} />
        <Route path="/backups" element={<ProtectedRoute roles={['SUPER_ADMIN']}><BackupsPage /></ProtectedRoute>} />
        <Route path="/employees" element={<ProtectedRoute roles={['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER']}><EmployeesPage /></ProtectedRoute>} />
        <Route path="/employees/:id" element={<ProtectedRoute roles={['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE']}><EmployeeDossierPage /></ProtectedRoute>} />
        <Route path="/registration-requests" element={<ProtectedRoute roles={['COMPANY_ADMIN', 'HR_MANAGER']}><RegistrationRequestsPage /></ProtectedRoute>} />
        <Route path="/departments" element={<ProtectedRoute roles={['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER']}><DepartmentsPage /></ProtectedRoute>} />
        <Route path="/attendance" element={<ProtectedRoute roles={['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE']}><AttendancePage /></ProtectedRoute>} />
        <Route path="/leaves" element={<ProtectedRoute roles={['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE']}><LeavesPage /></ProtectedRoute>} />
        <Route path="/exits" element={<ProtectedRoute roles={['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE']}><ExitsPage /></ProtectedRoute>} />
        <Route path="/schedules" element={<ProtectedRoute roles={['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE']}><SchedulesPage /></ProtectedRoute>} />
        <Route path="/tasks" element={<ProtectedRoute roles={['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE']}><TasksPage /></ProtectedRoute>} />
        <Route path="/contracts" element={<ProtectedRoute roles={['COMPANY_ADMIN', 'HR_MANAGER', 'EMPLOYEE']}><ContractsPage /></ProtectedRoute>} />
        <Route path="/payroll" element={<ProtectedRoute roles={['COMPANY_ADMIN', 'HR_MANAGER', 'EMPLOYEE']}><PayrollPage /></ProtectedRoute>} />
        <Route path="/announcements" element={<ProtectedRoute roles={['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE']}><AnnouncementsPage /></ProtectedRoute>} />
        <Route path="/meetings" element={<ProtectedRoute roles={['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE']}><MeetingsPage /></ProtectedRoute>} />
        <Route path="/messages" element={<ProtectedRoute roles={['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE']}><MessagesPage /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
        <Route path="/ai-assistant" element={<ProtectedRoute><AiAssistantPage /></ProtectedRoute>} />
        <Route path="/ai-analytics" element={<ProtectedRoute roles={['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER']}><AiAnalyticsPage /></ProtectedRoute>} />
        <Route path="/ai-schedule" element={<ProtectedRoute roles={['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER']}><AiSchedulePage /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute roles={['COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER']}><ReportsPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute roles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER']}><SettingsPage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};
