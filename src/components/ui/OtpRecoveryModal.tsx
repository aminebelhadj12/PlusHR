import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, KeyRound, LoaderCircle, Mail, ShieldCheck, X } from 'lucide-react';
import type { AppLang } from '../../types';
import './OtpRecoveryModal.css';

export type OtpRecoveryStep = 'email' | 'verify' | 'reset' | 'success';

export interface OtpRecoveryCopy {
  emailTitle: string;
  verifyTitle: string;
  resetTitle: string;
  successTitle: string;
  emailDescription: string;
  emailLabel: string;
  emailPlaceholder: string;
  sendCode: string;
  sending: string;
  verifyDescription: string;
  codeLabel: string;
  verifyCode: string;
  verifying: string;
  changeEmail: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  confirmPasswordLabel: string;
  resetPassword: string;
  resetting: string;
  passwordRules: string;
  successDescription: string;
  returnToLogin: string;
  close: string;
  invalidEmail: string;
  invalidCode: string;
  weakPassword: string;
  passwordMismatch: string;
  invalidRecovery: string;
  genericError: string;
  emailNotice: string;
}

interface OtpRecoveryModalProps {
  open: boolean;
  lang: AppLang;
  step: OtpRecoveryStep;
  email: string;
  code: string;
  password: string;
  confirmPassword: string;
  busy: boolean;
  error: string;
  notice: string;
  copy: OtpRecoveryCopy;
  onEmailChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onSubmitEmail: React.FormEventHandler<HTMLFormElement>;
  onSubmitCode: React.FormEventHandler<HTMLFormElement>;
  onSubmitPassword: React.FormEventHandler<HTMLFormElement>;
  onBackToEmail: () => void;
  onClose: () => void;
}

function normalizeOtpCode(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) || 0;
    if (codePoint >= 0x0660 && codePoint <= 0x0669) return String(codePoint - 0x0660);
    if (codePoint >= 0x06f0 && codePoint <= 0x06f9) return String(codePoint - 0x06f0);
    return character;
  }).join('').replace(/[^0-9]/g, '').slice(0, 6);
}

export const OtpRecoveryModal: React.FC<OtpRecoveryModalProps> = ({
  open,
  lang,
  step,
  email,
  code,
  password,
  confirmPassword,
  busy,
  error,
  notice,
  copy,
  onEmailChange,
  onCodeChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onSubmitEmail,
  onSubmitCode,
  onSubmitPassword,
  onBackToEmail,
  onClose,
}) => {
  const [present, setPresent] = useState(open);
  const [visible, setVisible] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (open) {
      setPresent(true);
      setVisible(false);
      const frame = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }

    setVisible(false);
    const timeout = window.setTimeout(() => setPresent(false), 220);
    return () => window.clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => {
      const input = dialogRef.current?.querySelector<HTMLElement>('input:not([disabled])');
      (input || dialogRef.current?.querySelector<HTMLElement>('button:not([disabled])'))?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!present || typeof document === 'undefined') return null;

  const title = step === 'email' ? copy.emailTitle
    : step === 'verify' ? copy.verifyTitle
      : step === 'reset' ? copy.resetTitle
        : copy.successTitle;

  return createPortal(
    <div
      className={`plus-otp-overlay${visible ? ' is-visible' : ''}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={`plus-otp-dialog${visible ? ' is-visible' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy}
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
      >
        <div className="plus-otp-halo" aria-hidden="true" />
        <div className="plus-otp-header">
          <div className="plus-otp-mark" aria-hidden="true">
            {step === 'email' && <Mail />}
            {step === 'verify' && <ShieldCheck />}
            {step === 'reset' && <KeyRound />}
            {step === 'success' && <Check />}
          </div>
          <button type="button" className="plus-otp-close" onClick={onClose} aria-label={copy.close}>
            <X aria-hidden="true" />
          </button>
        </div>

        <h2 id={titleId} className="plus-otp-title">{title}</h2>
        {error && <p id="otp-recovery-error" className="plus-otp-message is-error" role="alert">{error}</p>}
        {notice && <p className="plus-otp-message is-notice" role="status" aria-live="polite">{notice}</p>}

        {step === 'email' && (
          <form className="plus-otp-form" noValidate onSubmit={onSubmitEmail}>
            <p className="plus-otp-description">{copy.emailDescription}</p>
            <label className="plus-otp-label" htmlFor="otp-recovery-email">{copy.emailLabel}</label>
            <input
              id="otp-recovery-email"
              className="plus-otp-input"
              type="email"
              name="email"
              dir="ltr"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder={copy.emailPlaceholder}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'otp-recovery-error' : undefined}
            />
            <button type="submit" className="plus-otp-primary" disabled={busy}>
              {busy ? <LoaderCircle className="plus-otp-spinner" aria-hidden="true" /> : <Mail aria-hidden="true" />}
              <span>{busy ? copy.sending : copy.sendCode}</span>
            </button>
          </form>
        )}

        {step === 'verify' && (
          <form className="plus-otp-form" noValidate onSubmit={onSubmitCode}>
            <p className="plus-otp-description">{copy.verifyDescription}</p>
            <label className="plus-otp-label" htmlFor="otp-recovery-code">{copy.codeLabel}</label>
            <input
              id="otp-recovery-code"
              className="plus-otp-input plus-otp-code"
              type="text"
              name="one-time-code"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => onCodeChange(normalizeOtpCode(event.target.value))}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'otp-recovery-error' : undefined}
            />
            <button type="submit" className="plus-otp-primary" disabled={busy}>
              {busy ? <LoaderCircle className="plus-otp-spinner" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
              <span>{busy ? copy.verifying : copy.verifyCode}</span>
            </button>
            <button type="button" className="plus-otp-back" onClick={onBackToEmail} disabled={busy}>
              <ArrowLeft aria-hidden="true" />
              <span>{copy.changeEmail}</span>
            </button>
          </form>
        )}

        {step === 'reset' && (
          <form className="plus-otp-form" noValidate onSubmit={onSubmitPassword}>
            <label className="plus-otp-label" htmlFor="otp-new-password">{copy.passwordLabel}</label>
            <input
              id="otp-new-password"
              className="plus-otp-input"
              type="password"
              name="new-password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder={copy.passwordPlaceholder}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'otp-recovery-error' : 'otp-password-rules'}
            />
            <p id="otp-password-rules" className="plus-otp-hint">{copy.passwordRules}</p>
            <label className="plus-otp-label" htmlFor="otp-confirm-password">{copy.confirmPasswordLabel}</label>
            <input
              id="otp-confirm-password"
              className="plus-otp-input"
              type="password"
              name="confirm-password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => onConfirmPasswordChange(event.target.value)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'otp-recovery-error' : undefined}
            />
            <button type="submit" className="plus-otp-primary" disabled={busy}>
              {busy ? <LoaderCircle className="plus-otp-spinner" aria-hidden="true" /> : <KeyRound aria-hidden="true" />}
              <span>{busy ? copy.resetting : copy.resetPassword}</span>
            </button>
          </form>
        )}

        {step === 'success' && (
          <div className="plus-otp-success">
            <p>{copy.successDescription}</p>
            <button type="button" className="plus-otp-primary" onClick={onClose}>
              <Check aria-hidden="true" />
              <span>{copy.returnToLogin}</span>
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
