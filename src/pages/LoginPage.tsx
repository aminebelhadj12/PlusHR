import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, LifeBuoy, Lock, Mail, ShieldCheck } from 'lucide-react';
import { BrandLogo } from '../components/ui/BrandLogo';
import { OtpRecoveryModal, type OtpRecoveryCopy, type OtpRecoveryStep } from '../components/ui/OtpRecoveryModal';
import { useApp } from '../contexts/AppContext';
import { apiRequest } from '../services/api';
import type { AppLang, AuthUser } from '../types';

const loginCopy = {
  fr: {
    title: "Connexion sécurisée",
    subtitle: "Accédez à votre espace entreprise avec votre email professionnel ou matricule.",
    welcomeTitle: "Bienvenue sur +HR",
    welcomeSubtitle: "Connectez-vous à votre espace professionnel.",
    identifier: "Identifiant professionnel ou matricule",
    professionalIdentifier: "Identifiant professionnel",
    identifierPlaceholder: "ex: superadmin@plushr.ma ou SA-001",
    password: "Mot de passe",
    passwordPlaceholder: "Votre mot de passe",
    showPassword: "Afficher le mot de passe",
    hidePassword: "Masquer le mot de passe",
    remember: "Se souvenir de moi",
    forgot: "Mot de passe oublié ?",
    submit: "Se connecter",
    submitting: "Connexion…",
    or: "Ou",
    recover: "Récupération par email",
    support: "Assistance d’accès",
    supportHint: "Contactez votre Direction RH",
    note: "Inscription publique désactivée : les comptes employés sont créés et validés par votre Direction RH.",
    administrationNote: "Votre compte est créé et géré par votre administration RH.",
    label: "Plateforme RH intelligente",
    heading: "Pilotez vos talents, présences, congés et plannings en toute sérénité.",
    description: "Architecture SaaS Multi-Entreprises, isolation stricte par entreprise, validations sécurisées et assistance RH intelligente.",
    illustration: "Une équipe RH collabore autour d’un ordinateur, avec un calendrier et un tableau de bord en arrière-plan.",
    demo: "Comptes de démonstration (Mode développement uniquement)",
  },
  en: {
    title: "Secure sign-in",
    subtitle: "Access your company workspace with your work email or employee ID.",
    welcomeTitle: "Welcome to +HR",
    welcomeSubtitle: "Sign in to your professional workspace.",
    identifier: "Work email or employee ID",
    professionalIdentifier: "Work identifier",
    identifierPlaceholder: "e.g. superadmin@plushr.ma or SA-001",
    password: "Password",
    passwordPlaceholder: "Your password",
    showPassword: "Show password",
    hidePassword: "Hide password",
    remember: "Remember me",
    forgot: "Forgot password?",
    submit: "Sign in",
    submitting: "Signing in…",
    or: "Or",
    recover: "Email recovery",
    support: "Access support",
    supportHint: "Contact your HR department",
    note: "Public registration is disabled. Employee accounts are created and approved by your HR department.",
    administrationNote: "Your account is created and managed by your HR administration.",
    label: "Intelligent HR platform",
    heading: "Manage your people, attendance, time off, and schedules with confidence.",
    description: "Multi-company SaaS architecture, strict company isolation, secure approvals, and intelligent HR assistance.",
    illustration: "An HR team works together around a laptop, with a calendar and dashboard in the background.",
    demo: "Demo accounts (development mode only)",
  },
  ar: {
    title: "تسجيل دخول آمن",
    subtitle: "ادخل إلى مساحة شركتك باستخدام بريدك الإلكتروني المهني أو رقمك الوظيفي.",
    welcomeTitle: "مرحبًا بك في +HR",
    welcomeSubtitle: "سجّل الدخول إلى مساحة عملك المهنية.",
    identifier: "البريد الإلكتروني المهني أو الرقم الوظيفي",
    professionalIdentifier: "المعرّف المهني",
    identifierPlaceholder: "مثال: superadmin@plushr.ma أو SA-001",
    password: "كلمة المرور",
    passwordPlaceholder: "كلمة مرورك",
    showPassword: "إظهار كلمة المرور",
    hidePassword: "إخفاء كلمة المرور",
    remember: "تذكّرني",
    forgot: "هل نسيت كلمة المرور؟",
    submit: "تسجيل الدخول",
    submitting: "جارٍ تسجيل الدخول…",
    or: "أو",
    recover: "الاستعادة عبر البريد الإلكتروني",
    support: "مساعدة في الوصول",
    supportHint: "تواصل مع إدارة الموارد البشرية",
    note: "التسجيل العام معطّل. تتولى إدارة الموارد البشرية إنشاء حسابات الموظفين واعتمادها.",
    administrationNote: "يُنشأ حسابك وتديره إدارة الموارد البشرية في مؤسستك.",
    label: "منصة ذكية للموارد البشرية",
    heading: "أدر المواهب والحضور والإجازات والجداول بكل ثقة.",
    description: "بنية سحابية متعددة الشركات، وعزل صارم لبيانات كل شركة، واعتمادات آمنة، ومساعدة ذكية للموارد البشرية.",
    illustration: "فريق موارد بشرية يتعاون حول حاسوب محمول، مع تقويم ولوحة معلومات في الخلفية.",
    demo: "حسابات تجريبية (وضع التطوير فقط)",
  },
};

const otpCopy: Record<AppLang, OtpRecoveryCopy> = {
  fr: {
    emailTitle: 'Réinitialiser votre mot de passe',
    verifyTitle: 'Vérifiez votre adresse e-mail',
    resetTitle: 'Choisissez un nouveau mot de passe',
    successTitle: 'Mot de passe mis à jour',
    emailDescription: 'Saisissez votre adresse e-mail professionnelle. Si un compte actif y est associé, un code valable 5 minutes vous sera envoyé.',
    emailLabel: 'Adresse e-mail professionnelle',
    emailPlaceholder: 'nom@entreprise.ma',
    sendCode: 'Envoyer le code',
    sending: 'Envoi du code…',
    verifyDescription: 'Saisissez le code à 6 chiffres envoyé à cette adresse.',
    codeLabel: 'Code de vérification',
    verifyCode: 'Vérifier le code',
    verifying: 'Vérification…',
    changeEmail: 'Modifier l’adresse e-mail',
    passwordLabel: 'Nouveau mot de passe',
    passwordPlaceholder: 'Saisissez votre nouveau mot de passe',
    confirmPasswordLabel: 'Confirmer le mot de passe',
    resetPassword: 'Réinitialiser le mot de passe',
    resetting: 'Réinitialisation…',
    passwordRules: '8 caractères minimum, une majuscule, une minuscule et un chiffre (72 octets maximum).',
    successDescription: 'Votre mot de passe a été réinitialisé. Vous pouvez maintenant vous connecter à votre espace +HR.',
    returnToLogin: 'Retour à la connexion',
    close: 'Fermer la fenêtre de récupération',
    invalidEmail: 'Saisissez une adresse e-mail professionnelle valide.',
    invalidCode: 'Saisissez le code de vérification à 6 chiffres.',
    weakPassword: 'Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule et un chiffre, avec un maximum de 72 octets.',
    passwordMismatch: 'Les mots de passe ne correspondent pas.',
    invalidRecovery: 'Le code ou la demande de réinitialisation est invalide ou expiré.',
    genericError: 'La récupération est temporairement indisponible. Réessayez plus tard.',
    emailNotice: 'Si un compte actif est associé à cette adresse, vous recevrez un code de réinitialisation par e-mail.',
  },
  en: {
    emailTitle: 'Reset your password',
    verifyTitle: 'Verify your email address',
    resetTitle: 'Choose a new password',
    successTitle: 'Password updated',
    emailDescription: 'Enter your work email. If it is associated with an active account, a code valid for 5 minutes will be sent.',
    emailLabel: 'Work email address',
    emailPlaceholder: 'name@company.com',
    sendCode: 'Send code',
    sending: 'Sending code…',
    verifyDescription: 'Enter the 6-digit code sent to this address.',
    codeLabel: 'Verification code',
    verifyCode: 'Verify code',
    verifying: 'Verifying…',
    changeEmail: 'Change email address',
    passwordLabel: 'New password',
    passwordPlaceholder: 'Enter your new password',
    confirmPasswordLabel: 'Confirm password',
    resetPassword: 'Reset password',
    resetting: 'Resetting…',
    passwordRules: 'At least 8 characters, one uppercase letter, one lowercase letter, and one number (maximum 72 bytes).',
    successDescription: 'Your password has been reset. You can now sign in to your +HR workspace.',
    returnToLogin: 'Return to sign in',
    close: 'Close password recovery',
    invalidEmail: 'Enter a valid work email address.',
    invalidCode: 'Enter the 6-digit verification code.',
    weakPassword: 'Use at least 8 characters, one uppercase letter, one lowercase letter, and one number (maximum 72 bytes).',
    passwordMismatch: 'The passwords do not match.',
    invalidRecovery: 'The code or password reset request is invalid or has expired.',
    genericError: 'Password recovery is temporarily unavailable. Please try again later.',
    emailNotice: 'If an active account is associated with this address, you will receive a reset code by email.',
  },
  ar: {
    emailTitle: 'إعادة تعيين كلمة المرور',
    verifyTitle: 'تحقق من عنوان بريدك الإلكتروني',
    resetTitle: 'اختر كلمة مرور جديدة',
    successTitle: 'تم تحديث كلمة المرور',
    emailDescription: 'أدخل بريدك الإلكتروني المهني. إذا كان مرتبطًا بحساب نشط، فسيُرسل رمز صالح لمدة 5 دقائق.',
    emailLabel: 'عنوان البريد الإلكتروني المهني',
    emailPlaceholder: 'name@company.com',
    sendCode: 'إرسال الرمز',
    sending: 'جارٍ إرسال الرمز…',
    verifyDescription: 'أدخل الرمز المكوّن من 6 أرقام الذي أُرسل إلى هذا العنوان.',
    codeLabel: 'رمز التحقق',
    verifyCode: 'تحقق من الرمز',
    verifying: 'جارٍ التحقق…',
    changeEmail: 'تغيير عنوان البريد الإلكتروني',
    passwordLabel: 'كلمة المرور الجديدة',
    passwordPlaceholder: 'أدخل كلمة المرور الجديدة',
    confirmPasswordLabel: 'تأكيد كلمة المرور',
    resetPassword: 'إعادة تعيين كلمة المرور',
    resetting: 'جارٍ إعادة التعيين…',
    passwordRules: '8 أحرف على الأقل، وحرف كبير وحرف صغير ورقم واحد (بحد أقصى 72 بايت).',
    successDescription: 'تمت إعادة تعيين كلمة المرور. يمكنك الآن تسجيل الدخول إلى مساحة +HR.',
    returnToLogin: 'العودة إلى تسجيل الدخول',
    close: 'إغلاق نافذة استعادة كلمة المرور',
    invalidEmail: 'أدخل عنوان بريد إلكتروني مهني صالحًا.',
    invalidCode: 'أدخل رمز التحقق المكوّن من 6 أرقام.',
    weakPassword: 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل، وحرف كبير وحرف صغير ورقم واحد (بحد أقصى 72 بايت).',
    passwordMismatch: 'كلمتا المرور غير متطابقتين.',
    invalidRecovery: 'الرمز أو طلب إعادة التعيين غير صالح أو انتهت صلاحيته.',
    genericError: 'استعادة كلمة المرور غير متاحة مؤقتًا. حاول مرة أخرى لاحقًا.',
    emailNotice: 'إذا كان هذا العنوان مرتبطًا بحساب نشط، فستتلقى رمز إعادة التعيين عبر البريد الإلكتروني.',
  },
};

function getOtpError(error: unknown, copy: OtpRecoveryCopy): string {
  const message = error instanceof Error ? error.message : '';
  if (/Code ou demande de réinitialisation invalide|invalid or has expired/i.test(message)) {
    return copy.invalidRecovery;
  }
  if (/Le nouveau mot de passe doit contenir|password must contain/i.test(message)) {
    return copy.weakPassword;
  }
  return copy.genericError;
}

const teamIllustration = new URL('../assets/images/login-team-illustration.jpg', import.meta.url).href;
const focusClass = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-300';
const labelClass = 'mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-200';
const fieldIconClass = 'pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-500 dark:text-slate-400';
const fieldClass = 'w-full rounded-xl border border-slate-300 bg-white py-3 ps-10 text-base text-slate-900 placeholder:text-[13px] placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-600/15 sm:text-sm sm:placeholder:text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400';

interface DemoAccount {
  role: string;
  label: string;
  company: string;
  identifier: string;
  password: string;
}

export const LoginPage: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { setSession, addToast, lang } = useApp();
  const copy = loginCopy[lang];
  const recovery = otpCopy[lang];
  const navigate = useNavigate();
  const activeLabelClass = embedded ? 'plus-warm-auth-label' : labelClass;
  const activeFieldIconClass = embedded ? 'plus-warm-auth-field-icon' : fieldIconClass;
  const activeFieldClass = embedded ? 'plus-warm-auth-input' : fieldClass;
  const RootElement = embedded ? 'div' : 'main';

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);

  // OTP Modal state
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpStep, setOtpStep] = useState<OtpRecoveryStep>('email');
  const [otpEmail, setOtpEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpNotice, setOtpNotice] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);

  useEffect(() => {
    if (embedded) return;
    apiRequest<{ enabled: boolean; accounts: DemoAccount[] }>('/api/auth/demo-accounts')
      .then((res) => {
        if (res.enabled && Array.isArray(res.accounts)) setDemoAccounts(res.accounts);
      })
      .catch(() => {});
  }, [embedded]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{ accessToken: string; user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password, rememberMe }),
      });
      setSession(res.user, res.accessToken);
      addToast(`Bienvenue, ${res.user.full_name}`, 'success');
      if (res.user.must_change_password) {
        navigate('/change-password');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError('');
    setOtpNotice('');
    const email = otpEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setOtpError(recovery.invalidEmail);
      return;
    }
    setOtpBusy(true);
    try {
      await apiRequest<{ message: string }>('/api/auth/otp/request', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setOtpEmail(email);
      setOtpNotice(recovery.emailNotice);
      setOtpStep('verify');
    } catch (err) {
      setOtpError(getOtpError(err, recovery));
    } finally {
      setOtpBusy(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError('');
    if (!/^\d{6}$/.test(otpCode)) {
      setOtpError(recovery.invalidCode);
      return;
    }
    setOtpBusy(true);
    try {
      const response = await apiRequest<{ resetToken: string }>('/api/auth/otp/verify-reset', {
        method: 'POST',
        body: JSON.stringify({ email: otpEmail, code: otpCode, verifyOnly: true }),
      });
      setResetToken(response.resetToken);
      setOtpCode('');
      setOtpStep('reset');
    } catch (err) {
      setOtpError(getOtpError(err, recovery));
    } finally {
      setOtpBusy(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError('');
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) ||
        !/[a-z]/.test(newPassword) || !/\d/.test(newPassword) ||
        new TextEncoder().encode(newPassword).length > 72) {
      setOtpError(recovery.weakPassword);
      return;
    }
    if (newPassword !== confirmPassword) {
      setOtpError(recovery.passwordMismatch);
      return;
    }
    setOtpBusy(true);
    try {
      await apiRequest('/api/auth/otp/verify-reset', {
        method: 'POST',
        body: JSON.stringify({ email: otpEmail, resetToken, newPassword }),
      });
      setOtpStep('success');
      setOtpNotice('');
      setOtpError('');
      setResetToken('');
      setOtpCode('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setOtpError(getOtpError(err, recovery));
    } finally {
      setOtpBusy(false);
    }
  };


  const openRecovery = () => {
    setOtpCode('');
    setResetToken('');
    setOtpNotice('');
    setNewPassword('');
    setConfirmPassword('');
    setOtpModalOpen(true);
    setOtpStep('email');
    setOtpError('');
  };

  const closeRecovery = () => {
    setOtpModalOpen(false);
    setOtpStep('email');
    setOtpCode('');
    setResetToken('');
    setNewPassword('');
    setConfirmPassword('');
    setOtpNotice('');
    setOtpError('');
  };

  const backToRecoveryEmail = () => {
    setOtpStep('email');
    setOtpCode('');
    setOtpNotice('');
    setOtpError('');
  };

  return (
    <>
      <RootElement className={embedded ? 'plus-warm-auth-shell' : 'login-screen grid min-h-dvh place-items-center bg-[#f4f7fc] dark:bg-[#0b1120]'}>
        <div className={embedded ? 'plus-warm-auth-frame' : 'login-frame w-full'}>
          <div className={embedded
            ? 'plus-warm-auth-inner'
            : 'grid overflow-hidden rounded-[30px] border border-white bg-white p-2 shadow-[0_24px_70px_-32px_rgba(30,58,138,0.28)] sm:p-3 lg:grid-cols-[42%_58%] dark:border-slate-800 dark:bg-slate-900'}>
            <section
              aria-labelledby="login-heading"
              className={embedded ? 'plus-warm-auth-card' : 'flex min-w-0 flex-col justify-center login-form-panel'}
            >
              {!embedded && <div className="mb-5 sm:mb-6"><BrandLogo /></div>}

              <h1
                id="login-heading"
                className={embedded ? 'plus-warm-auth-title' : 'font-display text-[clamp(1.65rem,min(3vw,4.4dvh),2.25rem)] font-bold leading-tight tracking-tight text-slate-950 dark:text-white'}
              >
                {embedded ? copy.welcomeTitle : copy.title}
              </h1>
              <p className={embedded ? 'plus-warm-auth-subtitle' : 'mt-2.5 max-w-sm text-sm leading-6 text-slate-600 dark:text-slate-300'}>
                {embedded ? copy.welcomeSubtitle : copy.subtitle}
              </p>

              {error && (
                <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} className={embedded ? 'plus-warm-auth-form' : 'mt-5 space-y-3.5 sm:mt-6'}>
                <div>
                  <label htmlFor="login-identifier" className={activeLabelClass}>
                    {embedded ? copy.professionalIdentifier : copy.identifier}
                  </label>
                  <div className="relative">
                    <Mail aria-hidden="true" className={activeFieldIconClass} />
                    <input
                      id="login-identifier"
                      name="username"
                      type="text"
                      autoComplete="username"
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder={copy.identifierPlaceholder}
                      className={`${activeFieldClass} pe-3`}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="login-password" className={activeLabelClass}>{copy.password}</label>
                  <div className="relative">
                    <Lock aria-hidden="true" className={activeFieldIconClass} />
                    <input
                      id="login-password"
                      name="password"
                      type={showPwd ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={copy.passwordPlaceholder}
                      className={`${activeFieldClass} pe-12`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((s) => !s)}
                      className={embedded
                        ? 'plus-warm-auth-focus plus-warm-auth-toggle'
                        : `${focusClass} absolute end-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-slate-500 hover:text-blue-700 dark:text-slate-400 dark:hover:text-blue-300`}
                      aria-label={showPwd ? copy.hidePassword : copy.showPassword}
                      aria-controls="login-password"
                    >
                      {showPwd ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                    </button>
                  </div>
                </div>

                <div className={embedded ? 'plus-warm-auth-options' : 'flex flex-wrap items-center justify-between gap-x-2 text-sm sm:gap-x-4'}>
                  <label className={embedded ? 'plus-warm-auth-remember' : 'inline-flex min-h-11 cursor-pointer items-center gap-2 text-slate-700 dark:text-slate-300'}>
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className={embedded
                        ? 'plus-warm-auth-checkbox plus-warm-auth-focus'
                        : `${focusClass} size-4 shrink-0 rounded accent-blue-600`}
                    />
                    <span>{copy.remember}</span>
                  </label>
                  <button
                    type="button"
                    onClick={openRecovery}
                    aria-haspopup="dialog"
                    className={embedded
                      ? 'plus-warm-auth-forgot plus-warm-auth-focus'
                      : `${focusClass} min-h-11 rounded text-start font-semibold text-blue-700 hover:underline dark:text-blue-300`}
                  >
                    {copy.forgot}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className={embedded
                    ? 'plus-warm-auth-submit plus-warm-auth-focus'
                    : `${focusClass} relative flex min-h-12 w-full items-center justify-center rounded-xl bg-[#2563eb] px-10 py-3 text-sm font-semibold text-white shadow-[0_7px_16px_-6px_rgba(37,99,235,0.65)] transition-colors hover:bg-blue-700 disabled:opacity-60`}
                >
                  {submitting ? copy.submitting : copy.submit}
                  <ArrowRight aria-hidden="true" className={embedded ? 'plus-warm-auth-submit-icon' : 'absolute end-4 size-4 rtl:rotate-180'} />
                </button>
              </form>

              {embedded ? (
                <p className="plus-warm-auth-note">
                  <ShieldCheck aria-hidden="true" />
                  <span>{copy.administrationNote}</span>
                </p>
              ) : (
                <>
                  <div className="my-4 flex items-center gap-3 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <span aria-hidden="true" className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                    <span>{copy.or}</span>
                    <span aria-hidden="true" className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-2">
                    <button
                      type="button"
                      onClick={openRecovery}
                      className={`${focusClass} flex min-h-14 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-2.5 py-2.5 text-sm font-semibold leading-snug text-blue-800 transition-colors hover:bg-blue-50 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-200 dark:hover:bg-blue-950`}
                    >
                      <Mail aria-hidden="true" className="size-4 shrink-0" />
                      {copy.recover}
                    </button>
                    <div className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2.5 text-start text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                      <LifeBuoy aria-hidden="true" className="size-4 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold leading-snug">{copy.support}</p>
                        <p className="mt-0.5 text-[11px] leading-tight">{copy.supportHint}</p>
                      </div>
                    </div>
                  </div>

                  <p className="mt-5 flex items-start gap-2 rounded-xl bg-[#f2f7ff] px-3 py-3 text-xs leading-relaxed text-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
                    <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-blue-700 dark:text-blue-300" />
                    <span>{copy.note}</span>
                  </p>
                </>
              )}
            </section>

            {!embedded && <section
            aria-labelledby="login-illustration-heading"
            className="flex min-w-0 flex-col items-center overflow-hidden rounded-[23px] bg-linear-to-b from-[#e7edfb] via-[#e2eaff] to-[#e9efff] text-center dark:from-[#182b50] dark:via-[#1b315a] dark:to-[#142445]"
          >
            <img
              src={teamIllustration}
              alt={copy.illustration}
              width={1536}
              height={1024}
              className="block aspect-[3/2] h-auto w-full shrink-0 [mask-image:linear-gradient(to_bottom,black_94%,transparent)] dark:opacity-85"
            />
            <div className="flex w-full max-w-[555px] flex-1 flex-col items-center justify-center px-5 pb-8 pt-4 sm:px-8 sm:pb-10 sm:pt-5 lg:pb-12">
              <p className="text-xs font-semibold tracking-wide text-blue-800 dark:text-blue-200">{copy.label}</p>
              <h2 id="login-illustration-heading" className="mt-3 text-balance font-display text-[clamp(1.4rem,min(2.8vw,4dvh),2.35rem)] font-bold leading-[1.16] tracking-tight text-[#12254d] dark:text-white">
                {copy.heading}
              </h2>
              <p className="mx-auto mt-3 max-w-[440px] text-pretty text-sm leading-6 text-[#415674] dark:text-blue-100">
                {copy.description}
              </p>
            </div>
          </section>}
          </div>

          {!embedded && demoAccounts.length > 0 && (
          <section aria-label={copy.demo} className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300">{copy.demo}</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {demoAccounts.map((acc) => (
                <button
                  key={acc.identifier}
                  type="button"
                  onClick={() => {
                    setIdentifier(acc.identifier);
                    setPassword(acc.password);
                  }}
                  className={`${focusClass} min-h-11 rounded-lg border border-slate-200 px-3 py-2 text-start transition-colors hover:border-blue-500 hover:bg-blue-50/40 dark:border-slate-700 dark:hover:bg-blue-950/20`}
                >
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">{acc.label}</div>
                  <div className="break-words font-mono text-[11px] text-slate-600 dark:text-slate-400">
                    <bdi>{acc.identifier}</bdi> · {acc.company}
                  </div>
                </button>
              ))}
            </div>
          </section>
          )}
        </div>
      </RootElement>

      <OtpRecoveryModal
        open={otpModalOpen}
        lang={lang}
        step={otpStep}
        email={otpEmail}
        code={otpCode}
        password={newPassword}
        confirmPassword={confirmPassword}
        busy={otpBusy}
        error={otpError}
        notice={otpNotice}
        copy={recovery}
        onEmailChange={(value) => {
          setOtpEmail(value);
          setOtpError('');
        }}
        onCodeChange={(value) => {
          setOtpCode(value);
          setOtpError('');
        }}
        onPasswordChange={(value) => {
          setNewPassword(value);
          setOtpError('');
        }}
        onConfirmPasswordChange={(value) => {
          setConfirmPassword(value);
          setOtpError('');
        }}
        onSubmitEmail={handleRequestOtp}
        onSubmitCode={handleVerifyOtp}
        onSubmitPassword={handleResetPassword}
        onBackToEmail={backToRecoveryEmail}
        onClose={closeRecovery}
      />
    </>
  );
};
