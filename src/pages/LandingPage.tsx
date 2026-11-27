import { useEffect, type CSSProperties } from 'react';
import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  Check,
  Clock3,
  FileText,
  Fingerprint,
  Globe2,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  Wallet,
} from 'lucide-react';
import { BrandLogo } from '../components/ui/BrandLogo';
import { LoginPage } from './LoginPage';
import { useApp } from '../contexts/AppContext';
import type { AppLang } from '../types';
import { landingCopy } from '../utils/landingCopy';
import './LandingPage.css';

const languageNames: Record<AppLang, string> = { fr: 'Français', en: 'English', ar: 'العربية' };
const roleIcons = [Globe2, Building2, Fingerprint, UserRound, UsersRound];
const moduleIcons = [UsersRound, Clock3, CalendarDays, FileText, Wallet, CalendarDays, Sparkles, BarChart3];
const featureIcons = [
  Building2,
  UsersRound,
  Clock3,
  CalendarDays,
  Wallet,
  CalendarDays,
  Sparkles,
  UsersRound,
  BarChart3,
  ShieldCheck,
];
const workflowIcons = [Building2, UsersRound, BarChart3];

export function LandingPage() {
  const { lang, setLang } = useApp();
  const copy = landingCopy[lang];

  useEffect(() => {
    const revealItems = document.querySelectorAll<HTMLElement>('[data-reveal]');
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const root = document.documentElement;
    const previousScrollBehavior = root.style.scrollBehavior;
    const syncScrollBehavior = () => {
      root.style.scrollBehavior = motionPreference.matches ? 'auto' : 'smooth';
    };
    syncScrollBehavior();
    motionPreference.addEventListener('change', syncScrollBehavior);

    let observer: IntersectionObserver | null = null;
    if (motionPreference.matches || !('IntersectionObserver' in window)) {
      revealItems.forEach((item) => item.classList.add('is-visible'));
    } else {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer?.unobserve(entry.target);
          }
        });
      }, { threshold: 0.16, rootMargin: '0px 0px -7% 0px' });

      revealItems.forEach((item) => observer?.observe(item));
    }

    return () => {
      observer?.disconnect();
      motionPreference.removeEventListener('change', syncScrollBehavior);
      root.style.scrollBehavior = previousScrollBehavior;
    };
  }, []);

  return (
    <div className="plus-landing" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="plus-landing-backdrop" aria-hidden="true" />
      <header className="plus-landing-header" id="top">
        <nav className="plus-landing-nav" aria-label={copy.navigationLabel}>
          <a href="#top" className="plus-landing-brand" aria-label={copy.homeLabel}>
            <BrandLogo variant="icon" />
            <span>+HR</span>
          </a>

          <div className="plus-landing-nav-links">
            <a href="#top">{copy.home}</a>
            <a href="#features">{copy.featuresNav}</a>
            <a href="#how-it-works">{copy.howNav}</a>
            <a href="#security">{copy.securityNav}</a>
          </div>

          <div className="plus-landing-nav-actions">
            <div className="plus-landing-languages" role="group" aria-label={copy.languageLabel}>
              {(['fr', 'en', 'ar'] as AppLang[]).map((nextLang) => (
                <button
                  key={nextLang}
                  type="button"
                  aria-label={languageNames[nextLang]}
                  aria-pressed={lang === nextLang}
                  onClick={() => setLang(nextLang)}
                >
                  {nextLang.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </nav>
      </header>

      <main>
        <section className="plus-landing-hero" aria-labelledby="plus-landing-title">
          <div className="plus-landing-hero-glow plus-landing-hero-glow-coral" aria-hidden="true" />
          <div className="plus-landing-hero-glow plus-landing-hero-glow-teal" aria-hidden="true" />
          <div className="plus-landing-hero-grid">
            <div className="plus-landing-hero-copy">
              <div className="plus-landing-kicker" data-reveal>
                <span><Sparkles size={14} aria-hidden="true" /></span>
                {copy.heroEyebrow}
              </div>
              <h1 id="plus-landing-title" data-reveal style={{ '--reveal-delay': '70ms' } as CSSProperties}>
                {copy.headlineBefore}
                <span className="plus-landing-highlight">
                  {copy.headlineAccent}
                  <svg viewBox="0 0 220 18" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M4 13C46 4 120 3 216 10" />
                  </svg>
                </span>
                {copy.headlineAfter}
              </h1>
              <p className="plus-landing-hero-description" data-reveal style={{ '--reveal-delay': '140ms' } as CSSProperties}>
                {copy.description}
              </p>

              <ul className="plus-landing-benefits" data-reveal style={{ '--reveal-delay': '210ms' } as CSSProperties}>
                {copy.benefits.map((benefit) => (
                  <li key={benefit}><span><Check size={14} aria-hidden="true" /></span>{benefit}</li>
                ))}
              </ul>

              <div className="plus-landing-role-panel" data-reveal style={{ '--reveal-delay': '280ms' } as CSSProperties}>
                <div>
                  <span className="plus-landing-role-label">{copy.rolesLabel}</span>
                  <h2>{copy.rolesTitle}</h2>
                </div>
                <ul className="plus-landing-roles">
                  {copy.roles.map((role, index) => {
                    const Icon = roleIcons[index];
                    return (
                      <li key={role} title={role}>
                        <span className={`plus-landing-role-icon plus-landing-role-icon-${index + 1}`}>
                          <Icon size={16} aria-hidden="true" />
                        </span>
                        <span>{role}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            <div className="plus-landing-auth-wrap" data-reveal style={{ '--reveal-delay': '120ms' } as CSSProperties}>
              <div className="plus-landing-auth-halo" aria-hidden="true" />
              <LoginPage embedded />
            </div>
          </div>
          <a className="plus-landing-scroll-cue" href="#modules" aria-label={copy.discover}>
            <ArrowDown size={16} aria-hidden="true" />
          </a>
        </section>

        <section className="plus-landing-marquee-section" id="modules" aria-label={copy.modulesLabel}>
          <p>{copy.modulesLabel}</p>
          <div className="plus-landing-marquee-viewport">
            <div className="plus-landing-marquee-track">
              {[0, 1].map((repeat) => (
                <div className="plus-landing-marquee-group" key={repeat} aria-hidden={repeat === 1}>
                  {copy.modules.map((module, index) => {
                    const Icon = moduleIcons[index];
                    return (
                      <span className="plus-landing-module" key={module}>
                        <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                        {module}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="plus-landing-section plus-landing-features" id="features">
          <div className="plus-landing-section-heading">
            <span className="plus-landing-eyebrow" data-reveal>{copy.featuresEyebrow}</span>
            <h2 data-reveal style={{ '--reveal-delay': '70ms' } as CSSProperties}>{copy.featuresHeading}</h2>
            <p data-reveal style={{ '--reveal-delay': '140ms' } as CSSProperties}>{copy.featuresDescription}</p>
          </div>
          <div className="plus-landing-feature-grid">
            {copy.features.map((feature, index) => {
              const Icon = featureIcons[index];
              return (
                <article
                  className="plus-landing-feature-card"
                  key={feature.title}
                  data-reveal
                  style={{ '--reveal-delay': `${(index % 5) * 55}ms` } as CSSProperties}
                >
                  <span className="plus-landing-feature-icon"><Icon size={21} strokeWidth={1.8} aria-hidden="true" /></span>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="plus-landing-section plus-landing-workflow" id="how-it-works">
          <div className="plus-landing-section-heading">
            <span className="plus-landing-eyebrow" data-reveal>{copy.workflowEyebrow}</span>
            <h2 data-reveal style={{ '--reveal-delay': '70ms' } as CSSProperties}>{copy.workflowHeading}</h2>
            <p data-reveal style={{ '--reveal-delay': '140ms' } as CSSProperties}>{copy.workflowDescription}</p>
          </div>
          <div className="plus-landing-workflow-grid">
            {copy.workflowSteps.map((step, index) => {
              const Icon = workflowIcons[index];
              return (
                <article className="plus-landing-workflow-card" key={step.title} data-reveal style={{ '--reveal-delay': `${index * 85}ms` } as CSSProperties}>
                  <div className="plus-landing-workflow-topline"><span>0{index + 1}</span><Icon size={20} aria-hidden="true" /></div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="plus-landing-section plus-landing-security" id="security">
          <div className="plus-landing-security-card">
            <div className="plus-landing-security-copy">
              <span className="plus-landing-eyebrow" data-reveal>{copy.securityEyebrow}</span>
              <h2 data-reveal style={{ '--reveal-delay': '70ms' } as CSSProperties}>{copy.securityHeading}</h2>
              <p data-reveal style={{ '--reveal-delay': '140ms' } as CSSProperties}>{copy.securityDescription}</p>
              <ul className="plus-landing-security-points" data-reveal style={{ '--reveal-delay': '210ms' } as CSSProperties}>
                {copy.securityPoints.map((point) => (
                  <li key={point}><Check size={15} aria-hidden="true" />{point}</li>
                ))}
              </ul>
            </div>
            <div className="plus-landing-security-art" aria-hidden="true">
              <div className="plus-landing-security-ring plus-landing-security-ring-outer" />
              <div className="plus-landing-security-ring plus-landing-security-ring-inner" />
              <div className="plus-landing-security-shield"><ShieldCheck size={46} strokeWidth={1.45} /></div>
              <span className="plus-landing-security-chip plus-landing-security-chip-one"><LockKeyhole size={15} /></span>
              <span className="plus-landing-security-chip plus-landing-security-chip-two"><Building2 size={15} /></span>
              <span className="plus-landing-security-chip plus-landing-security-chip-three"><Fingerprint size={15} /></span>
            </div>
          </div>
        </section>

        <section className="plus-landing-section plus-landing-cta" id="access">
          <div className="plus-landing-cta-card">
            <div className="plus-landing-cta-glow plus-landing-cta-glow-coral" aria-hidden="true" />
            <div className="plus-landing-cta-glow plus-landing-cta-glow-teal" aria-hidden="true" />
            <span className="plus-landing-cta-mark"><BrandLogo variant="icon" /></span>
            <h2 data-reveal>{copy.ctaHeading}</h2>
            <p data-reveal style={{ '--reveal-delay': '80ms' } as CSSProperties}>{copy.ctaDescription}</p>
            <div className="plus-landing-cta-actions" data-reveal style={{ '--reveal-delay': '160ms' } as CSSProperties}>
              <a href="#features" className="plus-landing-button plus-landing-button-secondary">
                {copy.discover}<ArrowRight size={16} aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="plus-landing-footer">
        <a href="#top" className="plus-landing-brand" aria-label={copy.homeLabel}>
          <BrandLogo variant="icon" />
          <span>+HR</span>
        </a>
        <p>{copy.copyright}</p>
      </footer>
    </div>
  );
}
