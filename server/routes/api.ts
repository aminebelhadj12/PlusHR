import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { uploadMiddleware } from '../validators/validators.js';
import * as authCtrl from '../controllers/authController.js';
import * as coreCtrl from '../controllers/coreHrController.js';
import * as opsCtrl from '../controllers/operationsController.js';
import * as admCtrl from '../controllers/adminCommAiController.js';
import { getDbMode } from '../config/database.js';

export const apiRouter = Router();

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Veuillez réessayer dans quelques minutes.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

apiRouter.use(apiLimiter);

// Health check
apiRouter.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: '+HR API',
    dbMode: getDbMode(),
    databaseFile: getDbMode() === 'sqlite' ? 'plushr.db' : undefined,
    smtpConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
    timestamp: new Date().toISOString(),
  });
});

function authHandler(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response): void => {
    void handler(req, res).catch((error: unknown) => {
      console.error('[+HR Auth]', error);
      if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur inattendue.' });
    });
  };
}

// Auth & Security
apiRouter.post('/auth/login', authLimiter, authHandler(authCtrl.login));
apiRouter.post('/auth/logout', authHandler(authCtrl.logout));
apiRouter.post('/auth/refresh', authHandler(authCtrl.refreshSession));
apiRouter.get('/auth/demo-accounts', authCtrl.getDemoAccounts);
apiRouter.post('/auth/otp/request', authLimiter, authHandler(authCtrl.requestPasswordOtp));
apiRouter.post('/auth/otp/verify-reset', authLimiter, authHandler(authCtrl.verifyAndResetPasswordWithOtp));

apiRouter.get('/auth/me', requireAuth, authCtrl.getMe);
apiRouter.post('/auth/change-password', requireAuth, authHandler(authCtrl.changePassword));
apiRouter.put('/auth/profile', requireAuth, authCtrl.updateMyProfile);
apiRouter.post('/auth/webauthn/register', requireAuth, authCtrl.registerWebAuthnCredential);

// Protected file serving
apiRouter.get('/uploads/:filename', requireAuth, coreCtrl.serveSafeUpload);

// Global search
apiRouter.get('/search', requireAuth, admCtrl.globalSearch);

// Super Admin Platform Routes
apiRouter.get('/platform/overview', requireAuth, requireRole('SUPER_ADMIN'), coreCtrl.getPlatformOverview);
apiRouter.post('/platform/companies', requireAuth, requireRole('SUPER_ADMIN'), coreCtrl.createCompany);
apiRouter.patch('/platform/companies/:id/status', requireAuth, requireRole('SUPER_ADMIN'), coreCtrl.toggleCompanyStatus);
apiRouter.patch('/platform/incidents/:id', requireAuth, requireRole('SUPER_ADMIN'), coreCtrl.updateIncidentStatus);

// Dashboard
apiRouter.get('/dashboard', requireAuth, coreCtrl.getDashboardData);

// Employees & 6-Step Registration Workflow
apiRouter.get('/employees', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'), coreCtrl.listEmployees);
apiRouter.get('/employees/:id', requireAuth, coreCtrl.getEmployeeDossier);
apiRouter.put('/employees/:id', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER'), coreCtrl.updateEmployee);
apiRouter.delete('/employees/:id', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER'), coreCtrl.deleteEmployee);
apiRouter.post('/employees/:id/documents', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER', 'EMPLOYEE'), uploadMiddleware.single('file'), coreCtrl.uploadEmployeeDocument);
apiRouter.post('/employees/import', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER'), uploadMiddleware.single('file'), coreCtrl.importEmployeesSpreadsheet);

apiRouter.get('/registration-requests', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER'), coreCtrl.listRegistrationRequests);
apiRouter.post('/registration-requests', requireAuth, requireRole('COMPANY_ADMIN'), coreCtrl.createRegistrationRequest);
apiRouter.post('/registration-requests/:id/review', requireAuth, requireRole('HR_MANAGER'), coreCtrl.reviewRegistrationRequest);

// Departments & Positions
apiRouter.get('/departments', requireAuth, coreCtrl.listDepartments);
apiRouter.post('/departments', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER'), coreCtrl.createDepartment);
apiRouter.put('/departments/:id', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER'), coreCtrl.updateDepartment);
apiRouter.post('/positions', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER'), coreCtrl.createPosition);

// Attendance
apiRouter.get('/attendance', requireAuth, opsCtrl.listAttendance);
apiRouter.post('/attendance/check-in', requireAuth, opsCtrl.checkIn);
apiRouter.post('/attendance/check-out', requireAuth, opsCtrl.checkOut);
apiRouter.put('/attendance/:id/correct', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER'), opsCtrl.correctAttendance);

// Leaves (2-step workflow)
apiRouter.get('/leaves', requireAuth, opsCtrl.listLeaves);
apiRouter.post('/leaves', requireAuth, uploadMiddleware.single('attachment'), opsCtrl.createLeaveRequest);
apiRouter.post('/leaves/:id/review', requireAuth, requireRole('MANAGER', 'HR_MANAGER', 'COMPANY_ADMIN'), opsCtrl.reviewLeaveRequest);
apiRouter.post('/leaves/:id/cancel', requireAuth, opsCtrl.cancelLeaveRequest);

// Exits (2-step workflow + HR Vision rules)
apiRouter.get('/exits', requireAuth, opsCtrl.listExits);
apiRouter.post('/exits', requireAuth, uploadMiddleware.single('attachment'), opsCtrl.createExitRequest);
apiRouter.post('/exits/:id/review', requireAuth, requireRole('MANAGER', 'HR_MANAGER', 'COMPANY_ADMIN'), opsCtrl.reviewExitRequest);

// Schedules & Shifts
apiRouter.get('/schedules', requireAuth, opsCtrl.listSchedules);
apiRouter.post('/schedules/assignments', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'), opsCtrl.createShiftAssignment);

// Tasks & Workload
apiRouter.get('/tasks', requireAuth, opsCtrl.listTasksAndWorkload);
apiRouter.post('/tasks', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'), opsCtrl.createTask);
apiRouter.patch('/tasks/:id', requireAuth, opsCtrl.updateTask);

// Contracts
apiRouter.get('/contracts', requireAuth, admCtrl.listContracts);
apiRouter.post('/contracts', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER'), admCtrl.createOrRenewContract);
apiRouter.post('/contracts/:id/archive', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER'), admCtrl.archiveContract);

// Payroll
apiRouter.get('/payroll', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER', 'EMPLOYEE'), admCtrl.listPayrolls);
apiRouter.post('/payroll/generate', requireAuth, requireRole('HR_MANAGER'), admCtrl.generateMonthlyPayroll);
apiRouter.post('/payroll/:id/validate', requireAuth, requireRole('HR_MANAGER'), admCtrl.validatePayroll);

// Announcements
apiRouter.get('/announcements', requireAuth, admCtrl.listAnnouncements);
apiRouter.post('/announcements', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'), uploadMiddleware.single('attachment'), admCtrl.createAnnouncement);
apiRouter.patch('/announcements/:id/pin', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER'), admCtrl.togglePinAnnouncement);
apiRouter.delete('/announcements/:id', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER'), admCtrl.deleteAnnouncement);
apiRouter.post('/announcements/:id/comments', requireAuth, admCtrl.addAnnouncementComment);
apiRouter.delete('/announcements/:id/comments/:commentId', requireAuth, admCtrl.deleteAnnouncementComment);

// Meetings
apiRouter.get('/meetings', requireAuth, admCtrl.listMeetings);
apiRouter.post('/meetings', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'), admCtrl.createMeeting);
apiRouter.post('/meetings/:id/cancel', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'), admCtrl.cancelMeeting);

// Messaging
apiRouter.get('/messages/workspace', requireAuth, admCtrl.listMessagingWorkspace);
apiRouter.post('/messages/conversations', requireAuth, admCtrl.getOrCreatePrivateConversation);
apiRouter.get('/messages/conversations/:id', requireAuth, admCtrl.getConversationMessages);
apiRouter.post('/messages/conversations/:id', requireAuth, uploadMiddleware.single('attachment'), admCtrl.sendChatMessage);
apiRouter.put('/messages/:messageId', requireAuth, admCtrl.editOrDeleteChatMessage);
apiRouter.delete('/messages/:messageId', requireAuth, admCtrl.editOrDeleteChatMessage);

// Notifications
apiRouter.get('/notifications', requireAuth, admCtrl.listNotifications);
apiRouter.post('/notifications/:id/read', requireAuth, admCtrl.markNotificationRead);
apiRouter.put('/notifications/preferences', requireAuth, admCtrl.saveNotificationPreferences);

// Gemini AI Assistant, Analytics & Schedule Suggestion
apiRouter.post('/ai/chat', requireAuth, admCtrl.aiAssistantChat);
apiRouter.get('/ai/conversations', requireAuth, admCtrl.listAiConversations);
apiRouter.get('/ai/analytics', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'), admCtrl.getAiAnalytics);
apiRouter.get('/ai/schedule-suggestions', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'), admCtrl.listAiScheduleSuggestions);
apiRouter.post('/ai/schedule-suggest', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'), admCtrl.suggestScheduleAi);
apiRouter.post('/ai/schedule-suggestions/:id/decision', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'), admCtrl.decideAiScheduleSuggestion);

// Reports & Settings
apiRouter.get('/reports', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'), admCtrl.generateReport);
apiRouter.get('/settings', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE'), admCtrl.getCompanySettings);
apiRouter.put('/settings', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER'), admCtrl.updateCompanySettings);
