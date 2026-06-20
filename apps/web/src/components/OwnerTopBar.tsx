import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { trpc } from '../lib/trpc';
import { db } from '../lib/db/schema';
import { isCollectionEntry } from '../lib/collectionFilter';
import { useTheme } from '../lib/theme';
import { usePinContext } from '../contexts/PinContext';
import { useDropdownAlign } from '../lib/useDropdownAlign';
import { useHasUnseenChangelog } from '../lib/changelogSeen';
import { useFilToReplyCount } from '../lib/filActivity';

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

/**
 * Bouton avatar + dropdown pour l'owner — visible sur mobile uniquement (lg:hidden).
 * Se rend null si l'utilisateur n'est pas OWNER.
 */
export function OwnerTopBar() {
  const { data: me } = trpc.auth.me.useQuery();
  const { theme, toggle: toggleTheme } = useTheme();
  const { hasPinSet, lockNow } = usePinContext();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { panelRef, panelStyle } = useDropdownAlign(open);
  const navigate = useNavigate();

  const { data: pendingCount = 0 } = trpc.topicRequests.pendingCount.useQuery(undefined, {
    enabled: me?.role === 'OWNER',
    staleTime: 15_000,
    refetchInterval: 180_000,
  });
  const filToReply = useFilToReplyCount(me?.role === 'OWNER');

  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => navigate('/login'),
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  if (me?.role !== 'OWNER') return null;

  const initial = (me?.displayName ?? me?.email ?? '?').charAt(0).toUpperCase();

  const today = new Date().toISOString().slice(0, 10);
  const taskActiveCount = useLiveQuery(
    () => db.tasks.filter((t) => !t.deletedAt && !['DONE', 'MIGRATED', 'CANCELLED'].includes(t.status)).count(),
    [],
  );
  const taskOverdueCount = useLiveQuery(
    () => db.tasks.filter((t) => !t.deletedAt && !!t.dueDate && t.dueDate < today && ['OPEN', 'SCHEDULED', 'IN_PROGRESS', 'LOCAL_DONE', 'DEPLOYED', 'TO_TEST'].includes(t.status)).count(),
    [],
  );
  const todayEntriesCount = useLiveQuery(
    () => db.entries.filter((e) => !e.deletedAt && !e.collectionOnly && e.date === today).count(),
    [today],
  );
  const journalCount = useLiveQuery(
    () => db.entries.filter((e) => !e.deletedAt && !e.collectionOnly).count(),
    [],
  );
  const collectionCount = useLiveQuery(
    () => db.entries.filter((e) => isCollectionEntry(e)).count(),
    [],
  );
  const draftCount = useLiveQuery(
    () => db.entries.filter((e) => !!e.isDraft && !e.deletedAt && !e.collectionOnly).count(),
    [],
  );
  const { hasUnseen: hasUnseenChangelog } = useHasUnseenChangelog();

  // Tous les compteurs en `count` (mono à droite) pour alignement cohérent.
  const navLinks: Array<{ to: string; label: string; icon?: string; badge?: number; count?: number; overdue?: boolean }> = [
    { to: '/aujourd-hui', label: "Aujourd'hui", icon: 'M3 4h18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M2 10h20', count: todayEntriesCount && todayEntriesCount > 0 ? todayEntriesCount : undefined },
    { to: '/',            label: 'Diary',       icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', count: journalCount && journalCount > 0 ? journalCount : undefined },
    { to: '/fil',         label: 'Fil',         icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z', count: filToReply > 0 ? filToReply : undefined },
    { to: '/demandes',    label: 'Demandes',    count: pendingCount > 0 ? pendingCount : undefined },
    { to: '/tasks', label: 'Tâches', icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11', count: taskActiveCount, overdue: !!taskOverdueCount && taskOverdueCount > 0 },
    { to: '/collection',  label: 'Collection',  icon: 'M2 3h6v18H2zM10 3h6v18h-6zM18 3h4v18h-4z', count: collectionCount && collectionCount > 0 ? collectionCount : undefined },
    { to: '/calendrier',  label: 'Calendrier',  icon: 'M3 4h18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M2 10h20' },
    { to: '/agenda',      label: 'Agenda',      icon: 'M3 4h18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M2 10h20M7 14h.01M11 14h.01M7 17h.01' },
    { to: '/budget',      label: 'Budget',      icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
    { to: '/contacts',    label: 'Contacts',    icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
    { to: '/barometre',   label: 'Baromètre',   icon: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z' },
    { to: '/stats',       label: 'Statistiques', icon: 'M18 20V10M12 20V4M6 20v-6' },
  ];

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {/* Verrouillage rapide — accès direct sur toutes les pages mobile.
          Affiché uniquement quand un PIN est configuré, à gauche de l'avatar. */}
      {hasPinSet && (
        <button
          type="button"
          onClick={() => lockNow()}
          aria-label="Verrouiller maintenant"
          title="Verrouiller"
          className="w-[32px] h-[32px] shrink-0 rounded-full flex items-center justify-center text-text-muted hover:text-accent hover:bg-text-muted/10 transition-colors"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </button>
      )}
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu utilisateur"
        className="w-[32px] h-[32px] shrink-0 rounded-full overflow-hidden bg-accent/20 text-accent font-semibold text-[13px] flex items-center justify-center hover:opacity-85 transition-opacity"
      >
        {me?.avatarImageId ? (
          <img src={`/images/${me.avatarImageId}`} alt="" className="w-full h-full object-cover" />
        ) : (
          initial
        )}
      </button>

      {open && (
        <div ref={panelRef} style={panelStyle} className="absolute right-0 top-full mt-2 z-30 bg-bg-elevated border border-text-muted/[0.12] rounded-xl shadow-lg overflow-hidden min-w-[200px]">
          {/* Identité */}
          <div className="px-4 py-3 border-b border-text-muted/[0.08]">
            <p className="text-sm font-medium text-text-primary truncate">{me?.displayName ?? me?.email}</p>
            <p className="text-[11px] text-text-muted/60 mt-0.5">Owner</p>
          </div>

          {/* Thème + verrouiller */}
          <button
            type="button"
            onClick={() => { toggleTheme(); setOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-muted hover:text-text-primary hover:bg-text-muted/8 transition-colors"
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            {theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
          </button>
          {hasPinSet && (
            <button
              type="button"
              onClick={() => { lockNow(); setOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-muted hover:text-text-primary hover:bg-text-muted/8 transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Verrouiller
            </button>
          )}

          {/* Navigation */}
          <div className="border-t border-text-muted/[0.08]">
            <p className="px-4 pt-2.5 pb-1 text-[11px] font-mono uppercase tracking-widest text-text-muted/55">Navigation</p>
            {navLinks.map(({ to, label, icon, badge, count, overdue }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2 text-sm text-text-muted hover:text-text-primary hover:bg-text-muted/8 transition-colors"
              >
                {icon ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d={icon} />
                  </svg>
                ) : (
                  /* Demandes — icône inbox */
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                  </svg>
                )}
                <span className="flex items-center gap-1.5">
                  {label}
                  {overdue && <span className="w-1.5 h-1.5 rounded-full bg-danger shrink-0" title="Tâches en retard" />}
                </span>
                {!!badge && badge > 0 && (
                  <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-warning text-bg-elevated text-[11px] font-bold flex items-center justify-center leading-none">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
                {count != null && !badge && (
                  <span className="ml-auto font-mono text-[11px] text-text-muted/50">{count}</span>
                )}
              </Link>
            ))}
            {draftCount != null && draftCount > 0 && (
              <Link
                to="/brouillons"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2 text-sm text-text-muted hover:text-text-primary hover:bg-text-muted/8 transition-colors"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
                Brouillons
                <span className="ml-auto font-mono text-[11px] text-text-muted/50">{draftCount}</span>
              </Link>
            )}
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-text-muted hover:text-text-primary hover:bg-text-muted/8 transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Réglages
            </Link>
            <Link
              to="/help"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-text-muted hover:text-text-primary hover:bg-text-muted/8 transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              Centre d'aide
            </Link>
            <Link
              to="/nouveautes"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2 pb-2.5 text-sm text-text-muted hover:text-text-primary hover:bg-text-muted/8 transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9z" />
              </svg>
              <span className="flex items-center gap-1.5">
                Nouveautés
                {hasUnseenChangelog && <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" title="Nouveautés disponibles" />}
              </span>
            </Link>
          </div>

          {/* Déconnexion */}
          <div className="border-t border-text-muted/[0.08]">
            <button
              type="button"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-muted hover:text-text-primary hover:bg-text-muted/8 transition-colors disabled:opacity-40"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              {logout.isPending ? 'Déconnexion…' : 'Se déconnecter'}
            </button>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
