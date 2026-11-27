import { useEffect, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Bot,
  Building2,
  CalendarDays,
  Clock3,
  FileText,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import { LandingGlobe } from '../components/LandingGlobe';
import { BrandLogo } from '../components/ui/BrandLogo';
import { useApp } from '../contexts/AppContext';
import type { AppLang } from '../types';
import { landingCopy } from '../utils/landingCopy';
import './LandingPage.css';

const languageNames: Record<AppLang, string> = { fr: 'Français', en: 'English', ar: 'العربية' };
const featureIcons = [
  Building2,
  Users,
  Clock3,
  CalendarDays,
  Wallet,
  FileText,
  Sparkles,
  MessageSquare,
  BarChart3,
  ShieldCheck,
];
const diagramIcons = [Users, Clock3, Wallet, Bot];

export function LandingPage() {
  const { lang, setLang } = useApp();
  const copy = landingCopy[lang];

  useEffect(() => {
    const revealItems = document.querySelectorAll<HTMLElement>('[data-reveal]');
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const root = document.documentElement;
    const previousScrollBehavior = root.style.scrollBehavior;
    const syncScrollBehavior = () => {
      root.style.scrollBehavior = motionPreference.matches ? 'auto' : previousScrollBehavior;
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
      }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });

      revealItems.forEach((item) => observer?.observe(item));
    }

    return () => {
      observer?.disconnect();
      motionPreference.removeEventListener('change', syncScrollBehavior);
      root.style.scrollBehavior = previousScrollBehavior;
    };
  }, []);

  return (
    <div className="plus-landing">
      <div className="plus-landing-backdrop" aria-hidden="true" />
      <LandingGlobe />

      <header className="plus-landing-hero" id="top">
        <nav className="plus-landing-nav" aria-label={copy.navigationLabel}>
          <Link to="/" className="plus-landing-brand" aria-label={copy.homeLabel}>
            <BrandLogo variant="icon" />
            <span>+HR</span>
          </Link>

          <div className="plus-landing-nav-links">
            <a href="#features">{copy.featuresNav}</a>
            <a href="#platform">{copy.platformNav}</a>
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
            <Link to="/login" className="plus-landing-nav-login">{copy.login}</Link>
          </div>
        </nav>

        <div className="plus-landing-hero-copy">
          <div className="plus-landing-kicker" data-reveal style={{ '--reveal-delay': '0ms' } as CSSProperties}>
            <span className="plus-landing-kicker-mark"><Sparkles size={14} aria-hidden="true" /></span>
            <span>{copy.productTitle}</span>
          </div>
          <h1 data-reveal style={{ '--reveal-delay': '60ms' } as CSSProperties}>{copy.headline}</h1>
          <p data-reveal style={{ '--reveal-delay': '180ms' } as CSSProperties}>{copy.description}</p>
          <div className="plus-landing-hero-actions" data-reveal style={{ '--reveal-delay': '300ms' } as CSSProperties}>
            <Link to="/login" className="plus-landing-button plus-landing-button-primary">
              {copy.login}<ArrowRight size={17} aria-hidden="true" />
            </Link>
            <a href="#features" className="plus-landing-button plus-landing-button-secondary">
              {copy.discover}<ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="plus-landing-capabilities" data-reveal style={{ '--reveal-delay': '420ms' } as CSSProperties}>
          <span>{copy.features[0].title}</span>
          <i aria-hidden="true" />
          <span>{copy.features[2].title}</span>
          <i aria-hidden="true" />
          <span>{copy.features[6].title}</span>
          <i aria-hidden="true" />
          <span>{copy.features[9].title}</span>
        </div>
        <a className="plus-landing-scroll-cue" href="#features" aria-label={copy.discover}>
          <span />
        </a>
      </header>

      <main>
        <section className="plus-landing-section plus-landing-features" id="features">
          <div className="plus-landing-section-heading">
            <span className="plus-landing-eyebrow" data-reveal>{copy.featureEyebrow}</span>
            <h2 data-reveal style={{ '--reveal-delay': '80ms' } as CSSProperties}>{copy.featureHeading}</h2>
            <p data-reveal style={{ '--reveal-delay': '160ms' } as CSSProperties}>{copy.featureDescription}</p>
          </div>

          <div className="plus-landing-feature-grid">
            {copy.features.map((feature, index) => {
              const Icon = featureIcons[index];
              return (
                <article
                  className="plus-landing-feature-card"
                  key={feature.title}
                  data-reveal
                  style={{ '--reveal-delay': `${(index % 5) * 70}ms` } as CSSProperties}
                >
                  <span className="plus-landing-feature-icon"><Icon size={22} strokeWidth={1.7} aria-hidden="true" /></span>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="plus-landing-section plus-landing-platform" id="platform">
          <div className="plus-landing-platform-copy">
            <span className="plus-landing-eyebrow" data-reveal>{copy.platformEyebrow}</span>
            <h2 data-reveal style={{ '--reveal-delay': '90ms' } as CSSProperties}>{copy.platformHeading}</h2>
            <p data-reveal style={{ '--reveal-delay': '180ms' } as CSSProperties}>{copy.platformDescription}</p>
            <Link to="/login" className="plus-landing-text-link" data-reveal style={{ '--reveal-delay': '270ms' } as CSSProperties}>
              {copy.login}<ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>

          <div className="plus-landing-orbit-panel" data-reveal style={{ '--reveal-delay': '160ms' } as CSSProperties}>
            <div className="plus-landing-orbit-heading">
              <span className="plus-landing-orbit-brand"><BrandLogo variant="icon" /> <b>+HR</b></span>
              <span className="plus-landing-orbit-caption">{copy.workspaceLabel}</span>
              <span className="plus-landing-orbit-signal" aria-hidden="true"><i /></span>
            </div>
            <div className="plus-landing-orbit-system" aria-hidden="true">
              <div className="plus-landing-orbit-rings"><span /><span /></div>
              <div className="plus-landing-orbit-core"><BrandLogo variant="icon" /></div>
              {copy.diagramNodes.map((label, index) => {
                const Icon = diagramIcons[index];
                return (
                  <div className={`plus-landing-orbit-node plus-landing-orbit-node-${index + 1}`} key={label}>
                    <span><Icon size={19} strokeWidth={1.7} /></span>
                    <b>{label}</b>
                  </div>
                );
              })}
            </div>
            <div className="plus-landing-orbit-foot">
              <span>{copy.pillars[0].title}</span>
              <span>{copy.pillars[1].title}</span>
              <span>{copy.pillars[2].title}</span>
            </div>
          </div>

          <div className="plus-landing-pillars">
            {copy.pillars.map((pillar, index) => (
              <article key={pillar.title} data-reveal style={{ '--reveal-delay': `${index * 80}ms` } as CSSProperties}>
                <span>0{index + 1}</span>
                <div><h3>{pillar.title}</h3><p>{pillar.description}</p></div>
              </article>
            ))}
          </div>
        </section>

        <section className="plus-landing-section plus-landing-cta" id="access">
          <div className="plus-landing-cta-card">
            <div className="plus-landing-cta-glow" aria-hidden="true" />
            <span className="plus-landing-eyebrow" data-reveal>{copy.accessEyebrow}</span>
            <h2 data-reveal style={{ '--reveal-delay': '80ms' } as CSSProperties}>{copy.accessHeading}</h2>
            <p data-reveal style={{ '--reveal-delay': '160ms' } as CSSProperties}>{copy.accessDescription}</p>
            <div className="plus-landing-hero-actions" data-reveal style={{ '--reveal-delay': '240ms' } as CSSProperties}>
              <Link to="/login" className="plus-landing-button plus-landing-button-primary">
                {copy.login}<ArrowRight size={17} aria-hidden="true" />
              </Link>
              <a href="#top" className="plus-landing-button plus-landing-button-secondary">{copy.discover}</a>
            </div>
          </div>

          <footer className="plus-landing-footer">
            <Link to="/" className="plus-landing-brand" aria-label={copy.homeLabel}>
              <BrandLogo variant="icon" />
              <span>+HR</span>
            </Link>
            <p>{copy.copyright}</p>
            <Link to="/login">{copy.login}</Link>
            <span className="plus-landing-copyright">© {new Date().getFullYear()} +HR</span>
          </footer>
        </section>
      </main>
    </div>
  );
}
