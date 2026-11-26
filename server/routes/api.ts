import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { uploadMiddleware } from '../validators/validators.js';
import * as authCtrl from '../controllers/authController.js';
import * as coreCtrl from '../controllers/coreHrController.js';
import * as opsCtrl from '../controllers/operationsController.js';
import * as admCtrl from '../controllers/adminCommAiController.js';
import { trackApiHandler } from '../services/maintenance.js';
import { backupsRouter } from './backups.js';
import { getDbMode } from '../config/database.js';

export const apiRouter = Router();

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Veuillez réessayer dans quelques minutes.' },
});

const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Trop de tentatives. Veuillez réessayer dans quelques minutes.' },
});
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false,
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
  return trackApiHandler(async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error('[+HR Auth]', error);
      if (!res.headersSent && !res.destroyed) res.status(500).json({ error: 'Erreur serveur inattendue.' });
    }
  });
}

// Auth & Security
apiRouter.post('/auth/login', authLimiter, authHandler(authCtrl.login));
apiRouter.post('/auth/logout', authHandler(authCtrl.logout));
apiRouter.post('/auth/refresh', authHandler(authCtrl.refreshSession));
apiRouter.get('/auth/demo-accounts', authCtrl.getDemoAccounts);
apiRouter.post('/auth/otp/request', otpRequestLimiter, authHandler(authCtrl.requestPasswordOtp));
apiRouter.post('/auth/otp/verify-reset', otpVerifyLimiter, authHandler(authCtrl.verifyAndResetPasswordWithOtp));

apiRouter.get('/auth/me', requireAuth, authCtrl.getMe);
apiRouter.post('/auth/change-password', requireAuth, authHandler(authCtrl.changePassword));
apiRouter.put('/auth/profile', requireAuth, trackApiHandler(authCtrl.updateMyProfile));
apiRouter.post('/auth/webauthn/register', requireAuth, trackApiHandler(authCtrl.registerWebAuthnCredential));

// Protected file serving
apiRouter.get('/uploads/:filename', requireAuth, coreCtrl.serveSafeUpload);

// Global search
apiRouter.get('/search', requireAuth, admCtrl.globalSearch);

// Super Admin Platform Routes
apiRouter.use('/platform/backups', backupsRouter);
apiRouter.get('/platform/overview', requireAuth, requireRole('SUPER_ADMIN'), coreCtrl.getPlatformOverview);
apiRouter.post('/platform/companies', requireAuth, requireRole('SUPER_ADMIN'), trackApiHandler(coreCtrl.createCompany));
apiRouter.patch('/platform/companies/:id/status', requireAuth, requireRole('SUPER_ADMIN'), trackApiHandler(coreCtrl.toggleCompanyStatus));
apiRouter.patch('/platform/incidents/:id', requireAuth, requireRole('SUPER_ADMIN'), trackApiHandler(coreCtrl.updateIncidentStatus));

// Dashboard
apiRouter.get('/dashboard', requireAuth, coreCtrl.getDashboardData);

// Employees & 6-Step Registration Workflow
apiRouter.get('/employees', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'), coreCtrl.listEmployees);
apiRouter.get('/employees/:id', requireAuth, coreCtrl.getEmployeeDossier);
apiRouter.put('/employees/:id', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER'), trackApiHandler(coreCtrl.updateEmployee));
apiRouter.delete('/employees/:id', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER'), trackApiHandler(coreCtrl.deleteEmployee));
apiRouter.post('/employees/:id/documents', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER', 'EMPLOYEE'), uploadMiddleware.single('file'), trackApiHandler(coreCtrl.uploadEmployeeDocument));
apiRouter.post('/employees/import', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER'), uploadMiddleware.single('file'), trackApiHandler(coreCtrl.importEmployeesSpreadsheet));

apiRouter.get('/registration-requests', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER'), coreCtrl.listRegistrationRequests);
apiRouter.post('/registration-requests', requireAuth, requireRole('COMPANY_ADMIN'), trackApiHandler(coreCtrl.createRegistrationRequest));
apiRouter.post('/registration-requests/:id/review', requireAuth, requireRole('HR_MANAGER'), trackApiHandler(coreCtrl.reviewRegistrationRequest));

// Departments & Positions
apiRouter.get('/departments', requireAuth, coreCtrl.listDepartments);
apiRouter.post('/departments', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER'), trackApiHandler(coreCtrl.createDepartment));
apiRouter.put('/departments/:id', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER'), trackApiHandler(coreCtrl.updateDepartment));
apiRouter.post('/positions', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER'), trackApiHandler(coreCtrl.createPosition));

// Attendance
apiRouter.get('/attendance', requireAuth, opsCtrl.listAttendance);
apiRouter.post('/attendance/check-in', requireAuth, trackApiHandler(opsCtrl.checkIn));
apiRouter.post('/attendance/check-out', requireAuth, trackApiHandler(opsCtrl.checkOut));
apiRouter.put('/attendance/:id/correct', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER'), trackApiHandler(opsCtrl.correctAttendance));

// Leaves (2-step workflow)
apiRouter.get('/leaves', requireAuth, opsCtrl.listLeaves);
apiRouter.post('/leaves', requireAuth, uploadMiddleware.single('attachment'), trackApiHandler(opsCtrl.createLeaveRequest));
apiRouter.post('/leaves/:id/review', requireAuth, requireRole('MANAGER', 'HR_MANAGER', 'COMPANY_ADMIN'), trackApiHandler(opsCtrl.reviewLeaveRequest));
apiRouter.post('/leaves/:id/cancel', requireAuth, trackApiHandler(opsCtrl.cancelLeaveRequest));

// Exits (2-step workflow + HR Vision rules)
apiRouter.get('/exits', requireAuth, opsCtrl.listExits);
apiRouter.post('/exits', requireAuth, uploadMiddleware.single('attachment'), trackApiHandler(opsCtrl.createExitRequest));
apiRouter.post('/exits/:id/review', requireAuth, requireRole('MANAGER', 'HR_MANAGER', 'COMPANY_ADMIN'), trackApiHandler(opsCtrl.reviewExitRequest));

// Schedules & Shifts
apiRouter.get('/schedules', requireAuth, opsCtrl.listSchedules);
apiRouter.post('/schedules/assignments', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'), trackApiHandler(opsCtrl.createShiftAssignment));

// Tasks & Workload
apiRouter.get('/tasks', requireAuth, opsCtrl.listTasksAndWorkload);
apiRouter.post('/tasks', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'), trackApiHandler(opsCtrl.createTask));
apiRouter.patch('/tasks/:id', requireAuth, trackApiHandler(opsCtrl.updateTask));

// Contracts
apiRouter.get('/contracts', requireAuth, admCtrl.listContracts);
apiRouter.post('/contracts', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER'), trackApiHandler(admCtrl.createOrRenewContract));
apiRouter.post('/contracts/:id/archive', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER'), trackApiHandler(admCtrl.archiveContract));

// Payroll
apiRouter.get('/payroll', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER', 'EMPLOYEE'), admCtrl.listPayrolls);
apiRouter.post('/payroll/generate', requireAuth, requireRole('HR_MANAGER'), trackApiHandler(admCtrl.generateMonthlyPayroll));
apiRouter.post('/payroll/:id/validate', requireAuth, requireRole('HR_MANAGER'), trackApiHandler(admCtrl.validatePayroll));

// Announcements
apiRouter.get('/announcements', requireAuth, admCtrl.listAnnouncements);
apiRouter.post('/announcements', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'), uploadMiddleware.single('attachment'), trackApiHandler(admCtrl.createAnnouncement));
apiRouter.patch('/announcements/:id/pin', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER'), trackApiHandler(admCtrl.togglePinAnnouncement));
apiRouter.delete('/announcements/:id', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER'), trackApiHandler(admCtrl.deleteAnnouncement));
apiRouter.post('/announcements/:id/comments', requireAuth, trackApiHandler(admCtrl.addAnnouncementComment));
apiRouter.delete('/announcements/:id/comments/:commentId', requireAuth, trackApiHandler(admCtrl.deleteAnnouncementComment));

// Meetings
apiRouter.get('/meetings', requireAuth, admCtrl.listMeetings);
apiRouter.post('/meetings', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'), trackApiHandler(admCtrl.createMeeting));
apiRouter.post('/meetings/:id/cancel', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'), trackApiHandler(admCtrl.cancelMeeting));

// Messaging
apiRouter.get('/messages/workspace', requireAuth, admCtrl.listMessagingWorkspace);
apiRouter.post('/messages/conversations', requireAuth, trackApiHandler(admCtrl.getOrCreatePrivateConversation));
apiRouter.get('/messages/conversations/:id', requireAuth, trackApiHandler(admCtrl.getConversationMessages));
apiRouter.post('/messages/conversations/:id', requireAuth, uploadMiddleware.single('attachment'), trackApiHandler(admCtrl.sendChatMessage));
apiRouter.put('/messages/:messageId', requireAuth, trackApiHandler(admCtrl.editOrDeleteChatMessage));
apiRouter.delete('/messages/:messageId', requireAuth, trackApiHandler(admCtrl.editOrDeleteChatMessage));

// Notifications
apiRouter.get('/notifications', requireAuth, admCtrl.listNotifications);
apiRouter.post('/notifications/:id/read', requireAuth, trackApiHandler(admCtrl.markNotificationRead));
apiRouter.put('/notifications/preferences', requireAuth, trackApiHandler(admCtrl.saveNotificationPreferences));

// Gemini AI Assistant, Analytics & Schedule Suggestion
apiRouter.post('/ai/chat', requireAuth, trackApiHandler(admCtrl.aiAssistantChat));
apiRouter.get('/ai/conversations', requireAuth, admCtrl.listAiConversations);
apiRouter.get('/ai/analytics', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'), admCtrl.getAiAnalytics);
apiRouter.get('/ai/schedule-suggestions', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'), admCtrl.listAiScheduleSuggestions);
apiRouter.post('/ai/schedule-suggest', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'), trackApiHandler(admCtrl.suggestScheduleAi));
apiRouter.post('/ai/schedule-suggestions/:id/decision', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'), trackApiHandler(admCtrl.decideAiScheduleSuggestion));

// Reports & Settings
apiRouter.get('/reports', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER'), admCtrl.generateReport);
apiRouter.get('/settings', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE'), admCtrl.getCompanySettings);
apiRouter.put('/settings', requireAuth, requireRole('COMPANY_ADMIN', 'HR_MANAGER'), trackApiHandler(admCtrl.updateCompanySettings));
