import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { AvatarSection } from '../components/AvatarSection';
import { PinSection } from '../components/PinSection';
import { NotificationSettings } from '../components/NotificationSettings';
import { GuestDisplayPrefsSection } from '../components/DisplayPrefsSection';
import { FontSizeSection } from '../components/FontSizeSection';
import { TwoFactorSection } from '../components/TwoFactorSection';
import { ActiveSessionsSection } from '../components/ActiveSessionsSection';
import { AppVersionSection } from '../components/AppVersionSection';
import { GuestBottomNav } from '../components/BottomNav';
import { BackToTop } from '../components/BackToTop';
import { GuestTopBar } from '../components/GuestTopBar';
import { useHasUnseenChangelog, ChangelogContent } from './Changelog';
import { HelpIndexContent } from './Help';

// ─── Registre des sections ───────────────────────────────────────────────────

type SectionId =
  | 'profile' | 'pin' | '2fa' | 'sessions'
  | 'notifications'
  | 'display-notes' | 'display-fontsize'
  | 'help' | 'changelog' | 'version'
  | 'logout';

type GroupId = 'Compte' | 'Notifications' | 'Affichage' | 'À propos' | 'Session';

interface SectionDef {
  id: SectionId;
  group: GroupId;
  label: string;
  description: string;
  iconPath: string;
  render: () => ReactNode;
  /** Si true, le label/icône passent en rouge (danger) dans la liste. */
  danger?: boolean;
}

// ── Icônes simplifiées (mêmes paths que Settings.tsx) ──
const I = {
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  lock: 'M3 11h18v11H3z M7 11V7a5 5 0 0 1 10 0v4',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  monitor: 'M2 4h20v13H2z M8 21h8 M12 17v4',
  bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M13.73 21a2 2 0 0 1-3.46 0',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  bookOpen: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
  sparkles: 'M12 3l1.9 5.7L20 10l-5.7 1.9L12 17l-1.9-5.1L5 10l5.7-1.7L12 3z M19 16l.95 2.85L23 20l-3.05.95L19 24l-.95-3.05L16 20l3.05-1.15z',
  info: 'M12 16v-4 M12 8h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  type: 'M4 7V4h16v3 M9 20h6 M12 4v16',
};

function Icon({ d, className = '' }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />
    </svg>
  );
}

/** Contenu de la section "Déconnexion" — affiché dans la colonne droite. */
function LogoutSection() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      navigate('/login', { replace: true });
    },
  });
  return (
    <section className="bg-bg-elevated rounded-2xl px-6 py-5 shadow-soft">
      <h2 className="text-sm font-medium text-text-muted uppercase tracking-wide mb-2">Se déconnecter</h2>
      <p className="text-xs text-text-muted/70 mb-4 leading-relaxed">
        Tu seras renvoyé à l'écran de connexion. Tes notes locales restent sur l'appareil.
      </p>
      <button
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-danger/10 text-danger hover:bg-danger/15 transition-colors disabled:opacity-40"
      >
        <Icon d={I.logout} className="w-4 h-4" />
        {logout.isPending ? 'Déconnexion…' : 'Se déconnecter'}
      </button>
    </section>
  );
}

/** Centre d'aide embarqué : récupère le rôle via trpc.auth.me. */
function EmbeddedHelp() {
  const { data: me } = trpc.auth.me.useQuery();
  const role = me?.role === 'OWNER' ? 'OWNER' : 'GUEST';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const guestAccess = me?.guestAccess as any;
  return <HelpIndexContent role={role} guestAccess={guestAccess} />;
}

const GROUP_ORDER: GroupId[] = ['Compte', 'Notifications', 'Affichage', 'À propos', 'Session'];

/** Sections qui basculent en plein écran sur mobile au lieu de l'accordéon. */
const FULLSCREEN_MOBILE_SECTIONS = new Set<SectionId>(['help', 'changelog']);

// ─── Page ────────────────────────────────────────────────────────────────────

export function GuestSettingsPage() {
  const { data: me } = trpc.auth.me.useQuery();
  const isConfidant = me?.guestAccess === 'CONFIDANT';
  const { hasUnseen } = useHasUnseenChangelog();
  const [searchParams, setSearchParams] = useSearchParams();

  // Construction de la liste — on garde `isConfidant` dans la closure pour
  // pouvoir l'injecter dans GuestDisplayPrefsSection.
  const SECTIONS: SectionDef[] = [
    { id: 'profile',  group: 'Compte', label: 'Profil',                  description: 'Photo et identité', iconPath: I.user,    render: () => <AvatarSection /> },
    { id: 'pin',      group: 'Compte', label: 'Code PIN',                description: 'Verrouillage local', iconPath: I.lock,   render: () => <PinSection /> },
    { id: '2fa',      group: 'Compte', label: 'Double authentification', description: 'Sécurité du compte', iconPath: I.shield, render: () => <TwoFactorSection /> },
    { id: 'sessions', group: 'Compte', label: 'Appareils connectés',     description: 'Sessions actives', iconPath: I.monitor,  render: () => <ActiveSessionsSection /> },
    { id: 'notifications', group: 'Notifications', label: 'Notifications', description: 'Push, modes, programmation', iconPath: I.bell, render: () => <NotificationSettings /> },
    { id: 'display-fontsize', group: 'Affichage', label: 'Taille du texte', description: "Échelle de l'interface (par appareil)", iconPath: I.type, render: () => <FontSizeSection /> },
    { id: 'display-notes', group: 'Affichage', label: 'Notes', description: 'Filtres et vue par défaut', iconPath: I.eye, render: () => <GuestDisplayPrefsSection isConfidant={isConfidant} /> },
    { id: 'help',      group: 'À propos', label: "Centre d'aide", description: 'Documentation',          iconPath: I.bookOpen, render: () => <EmbeddedHelp /> },
    { id: 'changelog', group: 'À propos', label: 'Nouveautés',    description: "Mises à jour de l'app", iconPath: I.sparkles, render: () => <ChangelogContent /> },
    { id: 'version',   group: 'À propos', label: 'Version',       description: 'Build courant',         iconPath: I.info,     render: () => <AppVersionSection /> },
    { id: 'logout',    group: 'Session',  label: 'Se déconnecter', description: 'Retour à l\'écran de connexion', iconPath: I.logout, render: () => <LogoutSection />, danger: true },
  ];

  const sectionId = searchParams.get('s') as SectionId | null;
  const selected = SECTIONS.find((s) => s.id === sectionId) ?? null;
  const isFullscreenSelected = !!selected && FULLSCREEN_MOBILE_SECTIONS.has(selected.id);

  // Track le breakpoint
  const [isLg, setIsLg] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsLg(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (selected && (isLg || isFullscreenSelected)) window.scrollTo({ top: 0 });
  }, [selected, isLg, isFullscreenSelected]);

  const selectSection = (id: SectionId | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('s', id);
    else next.delete('s');
    setSearchParams(next, { replace: false });
  };

  const handleSelect = (id: SectionId) => {
    if (!isLg && !FULLSCREEN_MOBILE_SECTIONS.has(id) && selected?.id === id) {
      selectSection(null);
    } else {
      selectSection(id);
    }
  };

  // ─── Liste ──────────────────────────────────────────────────────────────────
  const list = (
    <>
      <div className="lg:hidden sticky top-0 z-[11] -mx-6 px-6 pt-5 pb-4 mb-6 bg-bg-primary/90 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-1">
          <p className="font-mono text-[11px] tracking-widest uppercase text-text-muted/50 select-none">Réglages</p>
          <GuestTopBar />
        </div>
        <h1 className="font-serif text-4xl text-text-primary tracking-tight text-center">Réglages</h1>
      </div>

      <div className="hidden lg:block sticky top-0 z-[11] -mx-8 px-8 pt-10 pb-6 mb-2 bg-bg-primary/90 backdrop-blur-sm">
        <p className="font-mono text-[11px] tracking-widest uppercase text-text-muted/50 select-none mb-2">Réglages</p>
        <h1 className="font-serif text-3xl text-text-primary tracking-tight">Préférences</h1>
      </div>

      <div className="flex flex-col gap-6">
        {GROUP_ORDER.map((group) => {
          const items = SECTIONS.filter((s) => s.group === group);
          if (items.length === 0) return null;
          return (
            <section key={group}>
              <p className="text-[11px] font-mono uppercase tracking-widest text-text-muted/55 mb-2 px-1">{group}</p>
              <div className="bg-bg-elevated rounded-2xl shadow-soft overflow-hidden">
                {items.map((section, i) => {
                  const isActive = selected?.id === section.id;
                  const isFullscreen = FULLSCREEN_MOBILE_SECTIONS.has(section.id);
                  const showInlineExpansion = isActive && !isFullscreen && !isLg;
                  const showsBadge = section.id === 'changelog' && hasUnseen;
                  const danger = !!section.danger;
                  return (
                    <div key={section.id} className={`${i > 0 ? 'border-t border-text-muted/[0.12]' : ''}`}>
                      <button
                        type="button"
                        onClick={() => handleSelect(section.id)}
                        aria-expanded={showInlineExpansion}
                        className={`block w-full text-left transition-colors ${isActive ? (danger ? 'bg-danger/[0.04]' : 'bg-accent/[0.04]') : 'hover:bg-text-muted/5'}`}
                      >
                        <div className="flex items-center gap-3 px-4 py-3">
                          <span className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                            danger
                              ? (isActive ? 'bg-danger/15 text-danger' : 'bg-danger/10 text-danger/70')
                              : (isActive ? 'bg-accent/15 text-accent' : 'bg-text-muted/8 text-text-muted')
                          }`}>
                            <Icon d={section.iconPath} className="w-4 h-4" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium flex items-center gap-2 ${
                              danger
                                ? (isActive ? 'text-danger' : 'text-danger/80')
                                : (isActive ? 'text-accent' : 'text-text-primary')
                            }`}>
                              {section.label}
                              {showsBadge && (
                                <span className="text-[11px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-accent/15 text-accent">Nouveau</span>
                              )}
                            </p>
                            <p className="text-[11px] text-text-muted/60 truncate">{section.description}</p>
                          </div>
                          <svg
                            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                            className={`shrink-0 transition-all duration-150 ${
                              danger
                                ? (isActive ? 'text-danger' : 'text-danger/40')
                                : (isActive ? 'text-accent' : 'text-text-muted/45')
                            } ${showInlineExpansion ? 'rotate-90' : ''}`}
                          >
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </div>
                      </button>
                      {showInlineExpansion && (
                        <div className="border-t border-text-muted/[0.12] px-4 py-4 bg-bg-primary/30">
                          {section.render()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );

  // ─── Détail (colonne droite desktop, ou plein écran mobile pour help/changelog) ───
  const detail = selected ? (
    <>
      <div className="lg:hidden sticky top-0 z-[11] -mx-6 px-6 pt-5 pb-4 mb-6 bg-bg-primary/90 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-1">
          <button
            type="button"
            onClick={() => selectSection(null)}
            aria-label="Retour"
            className="-ml-2 p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-text-muted/10 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <p className="font-mono text-[11px] tracking-widest uppercase text-text-muted/50 select-none">Réglages</p>
        </div>
        <h1 className="font-serif text-3xl text-text-primary tracking-tight">{selected.label}</h1>
        <p className="text-xs text-text-muted/60 mt-1">{selected.description}</p>
      </div>

      <div className="hidden lg:block sticky top-0 z-[10] px-8 pt-10 pb-6 mb-2 bg-bg-primary/90 backdrop-blur-sm">
        <p className="font-mono text-[11px] tracking-widest uppercase text-text-muted/50 select-none mb-2">{selected.group}</p>
        <h1 className="font-serif text-4xl text-text-primary tracking-tight">{selected.label}</h1>
        <p className="text-sm text-text-muted/70 mt-1">{selected.description}</p>
      </div>

      <div className="flex flex-col gap-6 lg:px-8 pb-8">
        {selected.render()}
      </div>
    </>
  ) : null;

  const hideListOnMobile = isFullscreenSelected;
  const showDetailOnMobile = isFullscreenSelected;

  return (
    <div className="min-h-dvh pb-48 sm:pb-56 lg:pb-0 max-w-2xl mx-auto [overflow-x:clip] lg:max-w-none lg:px-0 lg:flex lg:items-start lg:h-dvh lg:overflow-hidden">
      {/* Colonne gauche : liste (+ accordéons mobile) */}
      <div className={`px-6 lg:px-8 lg:w-[360px] lg:shrink-0 lg:h-dvh lg:overflow-y-auto lg:border-r lg:border-text-muted/[0.08] hide-scrollbar ${hideListOnMobile ? 'hidden lg:block' : 'block'}`}>
        {list}
      </div>

      {/* Colonne droite : détail (ou empty state). Mobile : seulement fullscreen sections. */}
      <div className={`flex-1 px-6 lg:px-0 lg:h-dvh lg:overflow-y-auto hide-scrollbar ${showDetailOnMobile ? 'block' : 'hidden lg:flex lg:flex-col'} ${!selected ? 'lg:items-center lg:justify-center' : ''}`}>
        {detail ?? (
          <div className="hidden lg:flex flex-col items-center gap-3 text-text-muted/55 select-none">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <p className="text-sm italic">Sélectionne une catégorie</p>
          </div>
        )}
      </div>

      <BackToTop />
      <GuestBottomNav />
    </div>
  );
}
