import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, KeyRound, LifeBuoy, Lock, Mail, ShieldCheck } from 'lucide-react';
import { BrandLogo } from '../components/ui/BrandLogo';
import { Modal } from '../components/ui/ConfirmModal';
import { useApp } from '../contexts/AppContext';
import { apiRequest } from '../services/api';
import type { AuthUser } from '../types';

const loginCopy = {
  fr: {
    title: "Connexion sécurisée",
    subtitle: "Accédez à votre espace entreprise avec votre email professionnel ou matricule.",
    identifier: "Identifiant professionnel ou matricule",
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
    label: "Plateforme RH intelligente",
    heading: "Pilotez vos talents, présences, congés et plannings en toute sérénité.",
    description: "Architecture SaaS Multi-Entreprises, isolation stricte par entreprise, validations sécurisées et assistance RH intelligente.",
    illustration: "Une équipe RH collabore autour d’un ordinateur, avec un calendrier et un tableau de bord en arrière-plan.",
    demo: "Comptes de démonstration (Mode développement uniquement)",
  },
  en: {
    title: "Secure sign-in",
    subtitle: "Access your company workspace with your work email or employee ID.",
    identifier: "Work email or employee ID",
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
    label: "Intelligent HR platform",
    heading: "Manage your people, attendance, time off, and schedules with confidence.",
    description: "Multi-company SaaS architecture, strict company isolation, secure approvals, and intelligent HR assistance.",
    illustration: "An HR team works together around a laptop, with a calendar and dashboard in the background.",
    demo: "Demo accounts (development mode only)",
  },
  ar: {
    title: "تسجيل دخول آمن",
    subtitle: "ادخل إلى مساحة شركتك باستخدام بريدك الإلكتروني المهني أو رقمك الوظيفي.",
    identifier: "البريد الإلكتروني المهني أو الرقم الوظيفي",
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
    label: "منصة ذكية للموارد البشرية",
    heading: "أدر المواهب والحضور والإجازات والجداول بكل ثقة.",
    description: "بنية سحابية متعددة الشركات، وعزل صارم لبيانات كل شركة، واعتمادات آمنة، ومساعدة ذكية للموارد البشرية.",
    illustration: "فريق موارد بشرية يتعاون حول حاسوب محمول، مع تقويم ولوحة معلومات في الخلفية.",
    demo: "حسابات تجريبية (وضع التطوير فقط)",
  },
};

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

export const LoginPage: React.FC = () => {
  const { setSession, addToast, lang } = useApp();
  const copy = loginCopy[lang];
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);

  // OTP Modal state
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpStep, setOtpStep] = useState<'email' | 'verify' | 'reset'>('email');
  const [otpEmail, setOtpEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpNotice, setOtpNotice] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);

  useEffect(() => {
    apiRequest<{ enabled: boolean; accounts: DemoAccount[] }>('/api/auth/demo-accounts')
      .then((res) => {
        if (res.enabled && Array.isArray(res.accounts)) setDemoAccounts(res.accounts);
      })
      .catch(() => {});
  }, []);

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
    setOtpBusy(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/otp/request', {
        method: 'POST',
        body: JSON.stringify({ email: otpEmail }),
      });
      setOtpNotice(res.message);
      setOtpStep('verify');
    } catch (err) {
      setOtpError((err as Error).message);
    } finally {
      setOtpBusy(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError('');
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
      setOtpError((err as Error).message);
    } finally {
      setOtpBusy(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError('');
    if (newPassword !== confirmPassword) {
      setOtpError('Les mots de passe ne correspondent pas.');
      return;
    }
    setOtpBusy(true);
    try {
      await apiRequest('/api/auth/otp/verify-reset', {
        method: 'POST',
        body: JSON.stringify({ email: otpEmail, resetToken, newPassword }),
      });
      addToast('Mot de passe réinitialisé. Connectez-vous maintenant.', 'success');
      setOtpModalOpen(false);
      setOtpStep('email');
      setResetToken('');
      setOtpCode('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setOtpError((err as Error).message);
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

  return (
    <main className="login-screen grid min-h-dvh place-items-center bg-[#f4f7fc] dark:bg-[#0b1120]">
      <div className="login-frame w-full">
        <div className="grid overflow-hidden rounded-[30px] border border-white bg-white p-2 shadow-[0_24px_70px_-32px_rgba(30,58,138,0.28)] sm:p-3 lg:grid-cols-[42%_58%] dark:border-slate-800 dark:bg-slate-900">
          <section aria-labelledby="login-heading" className="flex min-w-0 flex-col justify-center login-form-panel">
            <div className="mb-5 sm:mb-6">
              <BrandLogo />
            </div>

            <h1 id="login-heading" className="font-display text-[clamp(1.65rem,min(3vw,4.4dvh),2.25rem)] font-bold leading-tight tracking-tight text-slate-950 dark:text-white">
              {copy.title}
            </h1>
            <p className="mt-2.5 max-w-sm text-sm leading-6 text-slate-600 dark:text-slate-300">
              {copy.subtitle}
            </p>

            {error && (
              <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="mt-5 space-y-3.5 sm:mt-6">
              <div>
                <label htmlFor="login-identifier" className={labelClass}>{copy.identifier}</label>
                <div className="relative">
                  <Mail aria-hidden="true" className={fieldIconClass} />
                  <input
                    id="login-identifier"
                    name="username"
                    type="text"
                    autoComplete="username"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={copy.identifierPlaceholder}
                    className={`${fieldClass} pe-3`}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="login-password" className={labelClass}>{copy.password}</label>
                <div className="relative">
                  <Lock aria-hidden="true" className={fieldIconClass} />
                  <input
                    id="login-password"
                    name="password"
                    type={showPwd ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={copy.passwordPlaceholder}
                    className={`${fieldClass} pe-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((s) => !s)}
                    className={`${focusClass} absolute end-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-slate-500 hover:text-blue-700 dark:text-slate-400 dark:hover:text-blue-300`}
                    aria-label={showPwd ? copy.hidePassword : copy.showPassword}
                    aria-controls="login-password"
                  >
                    {showPwd ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-x-2 text-sm sm:gap-x-4">
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className={`${focusClass} size-4 shrink-0 rounded accent-blue-600`}
                  />
                  <span>{copy.remember}</span>
                </label>
                <button type="button" onClick={openRecovery} className={`${focusClass} min-h-11 rounded text-start font-semibold text-blue-700 hover:underline dark:text-blue-300`}>
                  {copy.forgot}
                </button>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className={`${focusClass} relative flex min-h-12 w-full items-center justify-center rounded-xl bg-[#2563eb] px-10 py-3 text-sm font-semibold text-white shadow-[0_7px_16px_-6px_rgba(37,99,235,0.65)] transition-colors hover:bg-blue-700 disabled:opacity-60`}
              >
                {submitting ? copy.submitting : copy.submit}
                <ArrowRight aria-hidden="true" className="absolute end-4 size-4 rtl:rotate-180" />
              </button>
            </form>

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
          </section>

          <section
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
          </section>
        </div>

        {demoAccounts.length > 0 && (
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

      {/* OTP Password Recovery Modal */}
      <Modal open={otpModalOpen} title="Récupération par code OTP" onClose={() => {
        setOtpModalOpen(false);
        setResetToken('');
        setOtpCode('');
      }}>
        {otpError && (
          <div className="mb-3 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
            {otpError}
          </div>
        )}
        {otpNotice && (
          <div className="mb-3 p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-xs text-blue-700 dark:text-blue-300">
            {otpNotice}
          </div>
        )}

        {otpStep === 'email' && (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Saisissez votre adresse e-mail professionnelle. Le code envoyé par e-mail est valable 5 minutes.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Email professionnel</label>
              <input
                type="email"
                required
                value={otpEmail}
                onChange={(e) => setOtpEmail(e.target.value)}
                placeholder="nom@entreprise.ma"
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800"
              />
            </div>
            <button
              type="submit"
              disabled={otpBusy}
              className="w-full py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {otpBusy ? 'Envoi…' : 'Envoyer le code OTP'}
            </button>
          </form>
        )}

        {otpStep === 'verify' && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Code à 6 chiffres</label>
              <input
                type="text"
                required
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                autoComplete="one-time-code"
                className="w-full px-3 py-2 text-center font-mono text-lg tracking-widest border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800"
              />
            </div>
            <button
              type="submit"
              disabled={otpBusy}
              className="w-full py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Vérifier le code
            </button>
          </form>
        )}

        {otpStep === 'reset' && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Nouveau mot de passe</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 8 caractères, 1 majuscule, 1 chiffre"
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Confirmer le mot de passe</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800"
              />
            </div>
            <button
              type="submit"
              disabled={otpBusy}
              className="w-full py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <KeyRound className="w-4 h-4" />
              <span>Réinitialiser le mot de passe</span>
            </button>
          </form>
        )}
      </Modal>
    </main>
  );
};
