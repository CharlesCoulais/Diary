import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { useTheme } from '../lib/theme';
import { usePinContext } from '../contexts/PinContext';
import { useDropdownAlign } from '../lib/useDropdownAlign';
import { countToReply } from '../lib/filActivity';

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
 * Bouton avatar + dropdown, format identique au owner sur mobile.
 * Self-contained : se rend null si l'utilisateur n'est pas guest.
 */
export function GuestTopBar() {
  const { data: me } = trpc.auth.me.useQuery();
  const { theme, toggle: toggleTheme } = useTheme();
  const { hasPinSet, lockNow } = usePinContext();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { panelRef, panelStyle } = useDropdownAlign(open);
  const navigate = useNavigate();

  const isGuest = me?.role === 'GUEST';
  const isConfidant = me?.guestAccess === 'CONFIDANT';

  const { data: pendingCount = 0 } = trpc.topicRequests.pendingCount.useQuery(undefined, {
    enabled: isGuest && isConfidant,
    staleTime: 15_000,
    refetchInterval: 180_000,
  });

  // Propres tâches du confident (ownerId = confident.id), pas les tâches de l'owner
  const { data: myTasks = [] } = trpc.tasks.myTasks.useQuery(undefined, {
    enabled: isConfidant,
    staleTime: 30_000,
    refetchInterval: 180_000,
  });
  const today = new Date().toISOString().slice(0, 10);
  const taskActiveCount = myTasks.filter((t) => !t.deletedAt && !['DONE', 'MIGRATED', 'CANCELLED'].includes(t.status)).length;
  const taskOverdue = myTasks.some((t) => !t.deletedAt && !!t.dueDate && t.dueDate.slice(0, 10) < today && ['OPEN', 'SCHEDULED', 'IN_PROGRESS', 'LOCAL_DONE', 'DEPLOYED', 'TO_TEST'].includes(t.status));

  // Comptes pour les autres menus — réutilise le cache des queries de GuestHome (dedupe TanStack)
  const { data: journalEntries = [] } = trpc.entries.list.useQuery(
    { limit: 200, order: 'desc' },
    { enabled: isGuest, staleTime: 30_000, refetchInterval: 180_000, gcTime: 60 * 60 * 1000 },
  );
  // "Aujourd'hui" : nombre de non-lues du jour (pertinent côté confident)
  const { data: readIdsData = [] } = trpc.entries.readIds.useQuery(undefined, {
    enabled: isGuest && isConfidant,
    staleTime: 30_000,
    refetchInterval: 60_000,
    gcTime: 60 * 60 * 1000,
  });
  const readSet = new Set(readIdsData);
  // L'API renvoie `date` comme ISO complet — on slice avant la comparaison.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const todayUnreadCount = (journalEntries as any[]).filter((e) => {
    const d = typeof e.date === 'string' ? e.date.slice(0, 10) : new Date(e.date).toISOString().slice(0, 10);
    return d === today && !e.isSecret && !readSet.has(e.id);
  }).length;
  // "Journal" : non-lues TOTAL (actionnable) plutôt que le total brut (qui
  // ressemblait à du bruit, mélangé aux compteurs actionnables).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const journalUnreadCount = (journalEntries as any[]).filter((e) => !e.isSecret && !readSet.has(e.id)).length;
  const { data: collectionEntries = [] } = trpc.entries.list.useQuery(
    { limit: 200, order: 'desc', includeCollectionOnly: true },
    { enabled: isGuest && isConfidant, staleTime: 60_000, refetchInterval: 180_000, gcTime: 60 * 60 * 1000 },
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const collectionCount = collectionEntries.filter((e: any) => !!e.collectionOnly).length;
  const { data: activityData } = trpc.comments.activity.useQuery(undefined, {
    enabled: isGuest,
    staleTime: 30_000,
    refetchInterval: 180_000,
  });
  // Compte les fils « à répondre » pour moi — helper partagé avec le sidebar
  // desktop et le BottomNav (source unique, dédupliqué par anchor).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filCount = countToReply(activityData as any[] | undefined, me?.id ?? '');

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

  if (!isGuest) return null;

  const initial = (me?.displayName ?? me?.email ?? '?').charAt(0).toUpperCase();
  const roleLabel = isConfidant ? 'Confident' : 'Invité';

  // Tous les compteurs utilisent `count` (mono à droite) pour l'alignement.
  // `badge` (pastille colorée) est réservé aux notifs réellement critiques.
  const navLinks: Array<{ to: string; label: string; icon: string; badge?: number; count?: number; overdue?: boolean }> = [
    { to: '/aujourd-hui', label: "Aujourd'hui", icon: 'M3 4h18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M2 10h20', count: todayUnreadCount > 0 ? todayUnreadCount : undefined },
    { to: '/', label: 'Diary', icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', count: isConfidant && journalUnreadCount > 0 ? journalUnreadCount : undefined },
    { to: '/fil', label: 'Fil', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z', count: filCount > 0 ? filCount : undefined },
    ...(isConfidant ? [
      { to: '/demandes', label: 'Demandes', icon: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z', count: pendingCount > 0 ? pendingCount : undefined },
      { to: '/collection', label: 'Collection', icon: 'M2 3h6v18H2zM10 3h6v18h-6zM18 3h4v18h-4z', count: collectionCount > 0 ? collectionCount : undefined },
      { to: '/tasks', label: 'Tâches', icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11', count: taskActiveCount > 0 ? taskActiveCount : undefined, overdue: taskOverdue },
      { to: '/stats', label: 'Statistiques', icon: 'M18 20V10M12 20V4M6 20v-6' },
      { to: '/barometre', label: 'Baromètre', icon: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z' },
      // Calendrier / Agenda / Budget : visibles seulement si l'owner a accordé
      // l'accès à ce confident (mêmes toggles que le sidebar desktop).
      ...(me?.guestCanViewCalendar ? [{ to: '/calendrier', label: 'Calendrier', icon: 'M3 4h18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M2 10h20' }] : []),
      ...(me?.guestCanViewAgenda ? [{ to: '/agenda', label: 'Agenda', icon: 'M3 4h18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M2 10h20M7 14h.01M11 14h.01M7 17h.01' }] : []),
      ...(me?.guestCanViewBudget ? [{ to: '/budget', label: 'Budget', icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' }] : []),
      { to: '/contacts', label: 'Contacts', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
    ] : []),
  ];

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {/* Verrouillage rapide — accès direct sur toutes les pages mobile. */}
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
            <p className="text-[11px] text-text-muted/60 mt-0.5">{roleLabel}</p>
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
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d={icon} />
                </svg>
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
            <Link
              to="/reglages"
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
              className="flex items-center gap-3 px-4 py-2 pb-2.5 text-sm text-text-muted hover:text-text-primary hover:bg-text-muted/8 transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              Centre d'aide
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
