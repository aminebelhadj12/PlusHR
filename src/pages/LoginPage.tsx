import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, Lock, Mail, ShieldCheck } from 'lucide-react';
import { BrandLogo } from '../components/ui/BrandLogo';
import { Modal } from '../components/ui/ConfirmModal';
import { useApp } from '../contexts/AppContext';
import { apiRequest } from '../services/api';
import type { AuthUser } from '../types';

interface DemoAccount {
  role: string;
  label: string;
  company: string;
  identifier: string;
  password: string;
}

export const LoginPage: React.FC = () => {
  const { setSession, addToast } = useApp();
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

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[#F8FAFC] dark:bg-[#0B1120]">
      {/* Left Form Panel */}
      <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-10 max-w-xl w-full mx-auto">
        <div className="mb-8">
          <BrandLogo />
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Human Resources, Made Smarter.</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8">
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Connexion sécurisée</h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Accédez à votre espace entreprise avec votre email professionnel ou matricule.
          </p>

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Identifiant professionnel ou matricule
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="ex. ATL-001 ou rh@atlas-industrial.ma"
                  className="w-full ps-9 pe-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Mot de passe
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full ps-9 pe-10 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 absolute end-2 top-1/2 -translate-y-1/2"
                  aria-label={showPwd ? 'Masquer' : 'Afficher'}
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                <span>Se souvenir de moi</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setOtpCode('');
                  setResetToken('');
                  setOtpNotice('');
                  setNewPassword('');
                  setConfirmPassword('');
                  setOtpModalOpen(true);
                  setOtpStep('email');
                  setOtpError('');
                }}
                className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                Mot de passe oublié ?
              </button>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-[#2563EB] hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>

          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Inscription publique désactivée : les comptes employés sont créés et validés par votre Direction RH.</span>
          </p>
        </div>

        {/* Dev-only demo accounts quick fill */}
        {demoAccounts.length > 0 && (
          <div className="mt-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2.5">
              Comptes de démonstration (Mode développement uniquement)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {demoAccounts.map((acc) => (
                <button
                  key={acc.identifier}
                  type="button"
                  onClick={() => {
                    setIdentifier(acc.identifier);
                    setPassword(acc.password);
                  }}
                  className="text-start px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-500 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors"
                >
                  <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">{acc.label}</div>
                  <div className="text-[11px] font-mono text-slate-500 truncate">
                    {acc.identifier} · {acc.company}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right Visual Panel */}
      <div className="hidden lg:block relative bg-[#0F172A] overflow-hidden">
        <img
          src="/src/assets/images/login_hr_workspace_1795643446573.jpg"
          alt="Équipe collaborant dans un espace moderne à Casablanca"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover opacity-85"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0F172A]/95 via-[#0F172A]/40 to-transparent flex flex-col justify-end p-12 text-white">
          <div className="max-w-lg">
            <p className="text-xs font-medium text-blue-300 tracking-wide">Plateforme SaaS Multi-Entreprises</p>
            <h2 className="mt-2 font-display text-3xl font-bold leading-tight text-balance">
              Pilotez vos talents, présences, congés et plannings en toute sérénité.
            </h2>
            <p className="mt-3 text-sm text-slate-300 leading-relaxed">
              Architecture Three-Tier sécurisée, isolation stricte par entreprise, validations en deux étapes et assistance décisionnelle Gemini.
            </p>
          </div>
        </div>
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
    </div>
  );
};
