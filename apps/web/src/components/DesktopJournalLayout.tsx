import { useEffect, useRef, useState } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { trpc } from '../lib/trpc';
import { db, type LocalEntry } from '../lib/db/schema';
import { isCollectionEntry } from '../lib/collectionFilter';
import { scaledFontSize } from '../lib/fonts';
import { resolveNoteTypeConfig } from './NoteTypePicker';
import { useNoteTypeDefs } from '../lib/useNoteTypeDefs';
import { parsePreviewRuns, PreviewRuns } from '../lib/previewRuns';
import { NotificationBell } from './NotificationBell';
import { ChatPanel } from './ChatPanel';
import { useTheme } from '../lib/theme';
import { usePinContext } from '../contexts/PinContext';
import { countToReply } from '../lib/filActivity';

// ─── Sidebar verticale ───────────────────────────────────────────────────────

function SidebarItem({
  to,
  label,
  activeRoutes,
  count,
  badge,
  end,
  overdue,
  onClick,
}: {
  to: string;
  label: string;
  activeRoutes: string[];
  count?: number;
  badge?: number;
  end?: boolean;
  overdue?: boolean;
  onClick?: () => void;
}) {
  const { pathname } = useLocation();
  const isActive = activeRoutes.some((r) =>
    r === '/' ? pathname === '/' : pathname.startsWith(r),
  );
  return (
    <NavLink
      to={to}
      onClick={onClick}
      end={end}
      className={
        'flex items-center justify-between px-3 py-[7px] rounded-lg text-sm transition-all duration-150 ' +
        (isActive ? 'bg-accent/12 text-accent font-medium' : 'text-text-muted hover:text-text-primary hover:bg-text-muted/8')
      }
    >
      <span className="flex items-center gap-1.5">
        {label}
        {overdue && (
          <span className="w-1.5 h-1.5 rounded-full bg-danger shrink-0" title="Tâches en retard" />
        )}
      </span>
      {badge != null && badge > 0 && (
        <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-bg-elevated text-[11px] font-bold flex items-center justify-center leading-none">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      {count != null && (badge == null || badge === 0) && (
        <span className={`font-mono text-[11px] ml-2 ${isActive ? 'text-accent/70' : 'text-text-muted/50'}`}>
          {count}
        </span>
      )}
    </NavLink>
  );
}

export function DesktopSidebar() {
  const navigate = useNavigate();
  const { data: me } = trpc.auth.me.useQuery(undefined, { retry: false });
  const { data: pendingRequests = 0 } = trpc.topicRequests.pendingCount.useQuery(undefined, {
    staleTime: 15_000,
    refetchInterval: 180_000,
  });
  const { data: activityData } = trpc.comments.activity.useQuery(undefined, {
    staleTime: 30_000,
    refetchInterval: 180_000,
  });
  const filBadge = countToReply(activityData, me?.id ?? '');

  const [chatOpen, setChatOpen] = useState(false);
  const { data: conversations } = trpc.directMessages.conversations.useQuery(undefined, { retry: false });
  const { data: chatUnread = 0 } = trpc.directMessages.unreadCount.useQuery(undefined, { retry: false });

  const today = new Date().toISOString().slice(0, 10);
  const journalCount = useLiveQuery(
    () => db.entries.filter((e) => !e.deletedAt && !e.collectionOnly).count(),
    [],
  );
  // Total des entrées du jour (owner) — toutes confondues (publiées + brouillons),
  // hors items de Collection et hors corbeille.
  const todayEntriesCount = useLiveQuery(
    () => db.entries.filter((e) => !e.deletedAt && !e.collectionOnly && e.date === today).count(),
    [today],
  );
  // Compte les entrées qui apparaissent réellement sur la page Collection
  // (notes media avec subject + playlists music + items collection-only).
  // L'ancien filtre `collectionOnly: true` ne comptait que les items
  // ajoutés via "Ajouter un titre" et ratait toutes les vraies notes
  // → affichait 0 dans la sidebar malgré une page pleine.
  const collectionCount = useLiveQuery(
    () => db.entries.filter((e) => isCollectionEntry(e)).count(),
    [],
  );
  const taskActiveCount = useLiveQuery(
    () => db.tasks.filter((t) => !t.deletedAt && !['DONE', 'MIGRATED', 'CANCELLED'].includes(t.status)).count(),
    [],
  );
  const taskOverdueCount = useLiveQuery(
    () => db.tasks.filter((t) => !t.deletedAt && !!t.dueDate && t.dueDate < today && ['OPEN', 'SCHEDULED', 'IN_PROGRESS', 'LOCAL_DONE', 'DEPLOYED', 'TO_TEST'].includes(t.status)).count(),
    [],
  );

  const initial = me?.displayName?.[0]?.toUpperCase() ?? '?';
  const { theme, toggle: toggleTheme } = useTheme();
  const { hasPinSet, lockNow } = usePinContext();
  const utils = trpc.useUtils();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: async () => { await utils.auth.me.invalidate(); navigate('/login', { replace: true }); },
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <aside className="w-[232px] h-full flex flex-col bg-bg-elevated border-r border-text-muted/10">
      {/* User info + menu */}
      <div ref={menuRef} className="relative flex items-center">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex-1 min-w-0 pl-4 pr-2 pt-5 pb-3 flex items-center gap-2.5 hover:bg-text-muted/5 transition-colors rounded-t-none"
        >
          <div className="w-8 h-8 rounded-full overflow-hidden bg-accent/20 text-accent flex items-center justify-center text-sm font-semibold shrink-0 select-none">
            {me?.avatarImageId
              ? <img src={`/images/${me.avatarImageId}`} alt="" className="w-full h-full object-cover" />
              : initial}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-medium text-text-primary truncate leading-tight">{me?.displayName ?? '…'}</p>
            <p className="text-[11px] font-mono uppercase tracking-widest text-text-muted/50 leading-tight mt-0.5">owner</p>
          </div>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`text-text-muted/45 shrink-0 transition-transform duration-150 ${menuOpen ? 'rotate-180' : ''}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {/* Verrouillage rapide — accès direct sans passer par le dropdown */}
        {hasPinSet && (
          <button
            type="button"
            onClick={() => lockNow()}
            aria-label="Verrouiller maintenant"
            title="Verrouiller"
            className="shrink-0 mr-2 mt-1.5 w-8 h-8 rounded-lg flex items-center justify-center text-text-muted/60 hover:text-accent hover:bg-text-muted/8 transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </button>
        )}

        {menuOpen && (
          <div className="absolute left-3 right-3 top-full z-30 bg-bg-elevated border border-text-muted/[0.12] rounded-xl shadow-xl overflow-hidden">
            {/* Thème */}
            <button
              type="button"
              onClick={() => { toggleTheme(); setMenuOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-muted hover:text-text-primary hover:bg-text-muted/8 transition-colors"
            >
              {theme === 'dark' ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
              {theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
            </button>

            {/* Verrouiller */}
            {hasPinSet && (
              <button
                type="button"
                onClick={() => { lockNow(); setMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-muted hover:text-text-primary hover:bg-text-muted/8 transition-colors"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Verrouiller
              </button>
            )}

            {/* Réglages */}
            <div className="border-t border-text-muted/[0.08]">
              <Link
                to="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-muted hover:text-text-primary hover:bg-text-muted/8 transition-colors"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Réglages
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

      {/* Écrire button */}
      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={() => navigate('/?create=1')}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-accent text-bg-elevated font-medium text-sm hover:opacity-90 active:scale-[0.98] transition-all duration-200"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Écrire
          <span className="font-mono text-[11px] opacity-50 ml-auto">⌘N</span>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 px-3 flex-1 overflow-y-auto scrollbar-soft">
        <SidebarItem
          to="/"
          label="Aujourd'hui"
          activeRoutes={['/']}
          end
          count={todayEntriesCount}
          // Re-cliquer « Aujourd'hui » alors qu'on y est déjà est un no-op côté
          // router (même route → pas de remount). On signale donc explicitement
          // à HomePage de refermer le panneau desktop et de revenir au jour même.
          onClick={() => window.dispatchEvent(new Event('home:reset-today'))}
        />
        <SidebarItem to="/timeline" label="Diary" activeRoutes={['/timeline', '/brouillons']} count={journalCount} />

        <div className="h-px bg-text-muted/8 my-1.5" />

        <SidebarItem to="/fil" label="Fil" activeRoutes={['/fil']} count={filBadge > 0 ? filBadge : undefined} />
        <SidebarItem to="/demandes" label="Demandes" activeRoutes={['/demandes']} count={pendingRequests > 0 ? pendingRequests : undefined} />

        <div className="h-px bg-text-muted/8 my-1.5" />

        <SidebarItem to="/collection" label="Collection" activeRoutes={['/collection']} count={collectionCount} />
        <SidebarItem to="/tasks" label="Tâches" activeRoutes={['/tasks']} count={taskActiveCount} overdue={!!taskOverdueCount && taskOverdueCount > 0} />

        <div className="h-px bg-text-muted/8 my-1.5" />

        <SidebarItem to="/stats" label="Statistiques" activeRoutes={['/stats']} />
        <SidebarItem to="/barometre" label="Baromètre" activeRoutes={['/barometre']} />
        <SidebarItem to="/calendrier" label="Calendrier" activeRoutes={['/calendrier']} />
        <SidebarItem to="/agenda" label="Agenda" activeRoutes={['/agenda']} />
        <SidebarItem to="/budget" label="Budget" activeRoutes={['/budget']} />
        <SidebarItem to="/contacts" label="Contacts" activeRoutes={['/contacts']} />
      </nav>

      {/* Bottom: settings + chat + notifications */}
      <div className="px-3 py-3.5 border-t border-text-muted/10 flex items-center justify-between gap-2">
        <NavLink
          to="/settings"
          className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-text-muted/50 hover:text-text-muted transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Réglages
        </NavLink>
        <div className="flex items-center gap-1.5 ml-auto">
          {conversations && conversations.length > 0 && (
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              aria-label="Messagerie"
              className="relative w-7 h-7 flex items-center justify-center rounded-lg text-text-muted/50 hover:text-text-muted hover:bg-text-muted/8 transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.38 8.38 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
              </svg>
              {chatUnread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-danger text-white text-[11px] font-bold flex items-center justify-center leading-none">
                  {chatUnread > 9 ? '9+' : chatUnread}
                </span>
              )}
            </button>
          )}
          <NotificationBell />
        </div>
      </div>

      {chatOpen && conversations && (
        <ChatPanel
          conversations={conversations}
          initialConversationId={null}
          onClose={() => setChatOpen(false)}
        />
      )}
    </aside>
  );
}

// ─── Sidebar verticale (guest/confident) ─────────────────────────────────────

export function GuestDesktopSidebar() {
  const navigate = useNavigate();
  const { data: me } = trpc.auth.me.useQuery(undefined, { retry: false });
  const isConfidant = me?.guestAccess === 'CONFIDANT';

  // Messagerie directe (confident ↔ owner) — symétrique avec le DesktopSidebar owner.
  const [chatOpen, setChatOpen] = useState(false);
  const { data: conversations } = trpc.directMessages.conversations.useQuery(undefined, { retry: false });
  const { data: chatUnread = 0 } = trpc.directMessages.unreadCount.useQuery(undefined, { retry: false });

  const { data: pendingRequests = 0 } = trpc.topicRequests.pendingCount.useQuery(undefined, {
    enabled: isConfidant,
    staleTime: 15_000,
    refetchInterval: 180_000,
  });
  const { data: activityData } = trpc.comments.activity.useQuery(undefined, {
    staleTime: 30_000,
    refetchInterval: 180_000,
  });
  const filBadge = countToReply(activityData, me?.id ?? '');

  // Propres tâches du confident (ownerId = confident.id), pas les tâches de l'owner
  const { data: myTasks = [] } = trpc.tasks.myTasks.useQuery(undefined, {
    enabled: isConfidant,
    staleTime: 30_000,
    refetchInterval: 180_000,
  });
  const today = new Date().toISOString().slice(0, 10);
  const _DONE = ['DONE', 'MIGRATED', 'CANCELLED'];
  const _OVERDUE_ACTIVE = ['OPEN', 'SCHEDULED', 'IN_PROGRESS', 'LOCAL_DONE', 'DEPLOYED', 'TO_TEST'];
  const taskActiveCount = myTasks.filter((t) => !t.deletedAt && !_DONE.includes(t.status)).length || undefined;
  const taskOverdueCount = myTasks.filter((t) => !t.deletedAt && !!t.dueDate && t.dueDate.slice(0, 10) < today && _OVERDUE_ACTIVE.includes(t.status)).length;

  // Counts pour les autres entrées du menu — partagent le cache des queries déjà
  // utilisées par GuestHome (TanStack dedupe les mêmes options).
  const { data: journalEntries = [] } = trpc.entries.list.useQuery(
    { limit: 200, order: 'desc' },
    { staleTime: 30_000, refetchInterval: 180_000, gcTime: 60 * 60 * 1000 },
  );
  // Pour "Aujourd'hui" : on affiche le nombre de **non-lues** du jour (pertinent
  // pour le confident — savoir d'un coup d'œil ce qui reste à découvrir).
  // NB: l'API renvoie `date` comme ISO complet (ex: "2026-05-21T00:00:00.000Z"),
  // d'où le `.slice(0, 10)` côté comparaison.
  const { data: readIdsData = [] } = trpc.entries.readIds.useQuery(undefined, {
    enabled: isConfidant,
    staleTime: 30_000,
    refetchInterval: 60_000,
    gcTime: 60 * 60 * 1000,
  });
  const readSet = new Set(readIdsData);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const todayUnreadCount = (journalEntries as any[]).filter((e) => {
    const d = typeof e.date === 'string' ? e.date.slice(0, 10) : new Date(e.date).toISOString().slice(0, 10);
    return d === today && !e.isSecret && !readSet.has(e.id);
  }).length || undefined;
  // "Journal" : non-lues TOTAL (actionnable) plutôt que le total brut (qui
  // ressemblait à du bruit). Affiché seulement au confident (suivi de lecture).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const journalUnreadCount = isConfidant
    ? ((journalEntries as any[]).filter((e) => !e.isSecret && !readSet.has(e.id)).length || undefined)
    : undefined;
  // Items de collection (confident only — l'owner les expose via includeCollectionOnly côté serveur)
  const { data: collectionEntries = [] } = trpc.entries.list.useQuery(
    { limit: 200, order: 'desc', includeCollectionOnly: true },
    { enabled: isConfidant, staleTime: 60_000, refetchInterval: 180_000, gcTime: 60 * 60 * 1000 },
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const collectionCount = collectionEntries.filter((e: any) => !!e.collectionOnly).length || undefined;

  const initial = me?.displayName?.[0]?.toUpperCase() ?? '?';
  const { theme, toggle: toggleTheme } = useTheme();
  const { hasPinSet, lockNow } = usePinContext();
  const utils = trpc.useUtils();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: async () => { await utils.auth.me.invalidate(); navigate('/login', { replace: true }); },
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <aside className="w-[232px] h-full flex flex-col bg-bg-elevated border-r border-text-muted/10">
      {/* User info + dropdown */}
      <div ref={menuRef} className="relative flex items-center">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex-1 min-w-0 pl-4 pr-2 pt-5 pb-3 flex items-center gap-2.5 hover:bg-text-muted/5 transition-colors"
        >
          <div className="w-8 h-8 rounded-full overflow-hidden bg-accent/20 text-accent flex items-center justify-center text-sm font-semibold shrink-0 select-none">
            {me?.avatarImageId
              ? <img src={`/images/${me.avatarImageId}`} alt="" className="w-full h-full object-cover" />
              : initial}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-medium text-text-primary truncate leading-tight">{me?.displayName ?? '…'}</p>
            <p className="text-[11px] font-mono uppercase tracking-widest text-text-muted/50 leading-tight mt-0.5">
              {isConfidant ? 'confident' : 'invité'}
            </p>
          </div>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`text-text-muted/45 shrink-0 transition-transform duration-150 ${menuOpen ? 'rotate-180' : ''}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {/* Verrouillage rapide — accès direct sans passer par le dropdown */}
        {hasPinSet && (
          <button
            type="button"
            onClick={() => lockNow()}
            aria-label="Verrouiller maintenant"
            title="Verrouiller"
            className="shrink-0 mr-2 mt-1.5 w-8 h-8 rounded-lg flex items-center justify-center text-text-muted/60 hover:text-accent hover:bg-text-muted/8 transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </button>
        )}

        {menuOpen && (
          <div className="absolute left-3 right-3 top-full z-30 bg-bg-elevated border border-text-muted/[0.12] rounded-xl shadow-xl overflow-hidden">
            {/* Thème */}
            <button
              type="button"
              onClick={() => { toggleTheme(); setMenuOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-muted hover:text-text-primary hover:bg-text-muted/8 transition-colors"
            >
              {theme === 'dark' ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
              {theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
            </button>

            {/* Verrouiller */}
            {hasPinSet && (
              <button
                type="button"
                onClick={() => { lockNow(); setMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-muted hover:text-text-primary hover:bg-text-muted/8 transition-colors"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Verrouiller
              </button>
            )}

            {/* Centre d'aide */}
            <div className="border-t border-text-muted/[0.08]">
              <Link
                to="/help"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-muted hover:text-text-primary hover:bg-text-muted/8 transition-colors"
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

      {/* Nav — tous les compteurs utilisent `count` (mono à droite) pour l'alignement
          cohérent. `badge` (pastille colorée) est réservé aux notifs critiques. */}
      <nav className="flex flex-col gap-0.5 px-3 flex-1 overflow-y-auto scrollbar-soft pt-1">
        <SidebarItem to="/aujourd-hui" label="Aujourd'hui" activeRoutes={['/aujourd-hui']} end count={todayUnreadCount} />
        <SidebarItem to="/" label="Diary" activeRoutes={['/']} end count={journalUnreadCount} />

        <div className="h-px bg-text-muted/8 my-1.5" />

        <SidebarItem to="/fil" label="Fil" activeRoutes={['/fil']} count={filBadge > 0 ? filBadge : undefined} />
        <SidebarItem to="/demandes" label="Demandes" activeRoutes={['/demandes']} count={isConfidant && pendingRequests > 0 ? pendingRequests : undefined} />

        {isConfidant && (
          <>
            <div className="h-px bg-text-muted/8 my-1.5" />
            <SidebarItem to="/collection" label="Collection" activeRoutes={['/collection']} count={collectionCount} />
            <SidebarItem to="/tasks" label="Tâches" activeRoutes={['/tasks']} count={taskActiveCount} overdue={!!taskOverdueCount && taskOverdueCount > 0} />
            <div className="h-px bg-text-muted/8 my-1.5" />
            <SidebarItem to="/stats" label="Statistiques" activeRoutes={['/stats']} />
            <SidebarItem to="/barometre" label="Baromètre" activeRoutes={['/barometre']} />
            {me?.guestCanViewCalendar && <SidebarItem to="/calendrier" label="Calendrier" activeRoutes={['/calendrier']} />}
            {me?.guestCanViewAgenda && <SidebarItem to="/agenda" label="Agenda" activeRoutes={['/agenda']} />}
            {me?.guestCanViewBudget && <SidebarItem to="/budget" label="Budget" activeRoutes={['/budget']} />}
            <SidebarItem to="/contacts" label="Contacts" activeRoutes={['/contacts']} />
          </>
        )}
      </nav>

      {/* Bottom: settings + chat + notifications */}
      <div className="px-3 py-3.5 border-t border-text-muted/10 flex items-center gap-2">
        <NavLink
          to="/reglages"
          className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-text-muted/50 hover:text-text-muted transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Réglages
        </NavLink>
        <div className="flex items-center gap-1.5 ml-auto">
          {conversations && conversations.length > 0 && (
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              aria-label="Messagerie"
              className="relative w-7 h-7 flex items-center justify-center rounded-lg text-text-muted/50 hover:text-text-muted hover:bg-text-muted/8 transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.38 8.38 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
              </svg>
              {chatUnread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-danger text-white text-[11px] font-bold flex items-center justify-center leading-none">
                  {chatUnread > 9 ? '9+' : chatUnread}
                </span>
              )}
            </button>
          )}
          <NotificationBell />
        </div>
      </div>

      {chatOpen && conversations && (
        <ChatPanel
          conversations={conversations}
          initialConversationId={null}
          onClose={() => setChatOpen(false)}
        />
      )}
    </aside>
  );
}

// ─── Ligne compacte pour la liste desktop ────────────────────────────────────

function DeskNoteRow({
  entry,
  active,
  onClick,
}: {
  entry: LocalEntry;
  active: boolean;
  onClick: () => void;
}) {
  const { defsById } = useNoteTypeDefs();
  const cfg = resolveNoteTypeConfig(entry, defsById);
  const timeDisplay = entry.timeLabel
    ? entry.timeLabel
    : new Date(entry.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const previewRuns = parsePreviewRuns(entry.contentMd);
  const hasPreview = previewRuns.length > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'w-full text-left px-4 py-3 border-b border-line-soft transition-colors ' +
        (active ? 'bg-accent/10' : 'hover:bg-text-muted/5')
      }
    >
      <div className="flex items-center justify-between mb-1">
        <span
          className="font-mono text-[11px] uppercase tracking-wider font-medium"
          style={{ color: cfg.color }}
        >
          {cfg.label}
          {entry.isDraft && <span className="ml-1 text-warning">· brouillon</span>}
        </span>
        <span className="font-mono text-[11px] text-text-muted/60">{timeDisplay}</span>
      </div>
      {entry.title && (
        <p className="font-serif text-[14px] text-text-primary leading-snug mb-0.5 line-clamp-1">
          {entry.title}
        </p>
      )}
      {hasPreview && (
        <p className="text-text-secondary text-[12px] leading-relaxed line-clamp-2">
          <PreviewRuns runs={previewRuns} />
        </p>
      )}
    </button>
  );
}

// ─── Panneau de détail ────────────────────────────────────────────────────────

function EntryDetailPane({ entry }: { entry: LocalEntry }) {
  const { defsById } = useNoteTypeDefs();
  const cfg = resolveNoteTypeConfig(entry, defsById);
  const timeDisplay = entry.timeLabel
    ? entry.timeLabel
    : new Date(entry.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const previewRuns = parsePreviewRuns(entry.contentMd);
  const { data: rawComments = [] } = trpc.comments.list.useQuery({ entryId: entry.id });
  const { data: me } = trpc.auth.me.useQuery();

  return (
    <div className="flex-1 overflow-y-auto scrollbar-soft px-10 py-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <span
            className="font-mono text-[11px] uppercase tracking-wider font-medium"
            style={{ color: cfg.color }}
          >
            {cfg.label}
          </span>
          <span className="font-mono text-[11px] text-text-muted/50">{timeDisplay}</span>
          {entry.isDraft && (
            <span className="font-mono text-[11px] uppercase tracking-wider text-warning">brouillon</span>
          )}
        </div>

        {/* Titre */}
        {entry.title && (
          <h1 className="font-serif text-[38px] font-normal leading-tight text-text-primary mb-6">
            {entry.title}
          </h1>
        )}

        {/* Contenu */}
        {previewRuns.length > 0 ? (
          <div
            className="font-serif text-[18px] leading-[1.65] text-text-primary"
            style={{
              fontFamily: entry.font ? getFontFamily(entry.font) : undefined,
              fontSize: scaledFontSize(entry.font, entry.fontSize ?? '18px'),
            }}
          >
            <PreviewRuns runs={previewRuns} />
          </div>
        ) : (
          <p className="font-serif italic text-text-muted/50 text-[18px]">Aucun contenu.</p>
        )}

        {/* Commentaires */}
        {rawComments.length > 0 && (
          <div className="mt-10 pt-6 border-t border-line-soft">
            <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted/50 mb-4">
              commentaires · {rawComments.length}
            </p>
            <div className="flex flex-col gap-3">
              {rawComments.map((c: { id: string; authorName?: string; content: string; createdAt: string }) => {
                const isMine = me && ('authorId' in c ? (c as { authorId?: string }).authorId === me.id : false);
                return (
                  <div
                    key={c.id}
                    className={`px-4 py-3 rounded-xl text-sm ${isMine ? 'bg-accent/15 ml-8' : 'bg-text-muted/8 mr-8'}`}
                  >
                    <p className="font-mono text-[11px] text-text-muted/60 mb-1">
                      {c.authorName ?? 'Inconnu'} · {new Date(c.createdAt).toLocaleDateString('fr-FR')}
                    </p>
                    <p className="text-text-primary leading-relaxed">{c.content}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getFontFamily(font: string | null): string | undefined {
  if (!font || font === 'default') return undefined;
  const map: Record<string, string> = {
    serif: 'Lora, Georgia, serif',
    mono: '"JetBrains Mono", monospace',
    lavishly: '"Lavishly Yours", cursive',
  };
  return map[font];
}

// ─── Export : layout complet ─────────────────────────────────────────────────

export function DesktopJournalLayout({
  grouped,
}: {
  grouped: Array<{ date: string; entries: LocalEntry[] }>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    grouped[0]?.entries[0]?.id ?? null,
  );

  const selectedEntry = grouped
    .flatMap((g) => g.entries)
    .find((e) => e.id === selectedId) ?? null;

  function formatDateShort(isoDate: string): string {
    return new Date(isoDate + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <DesktopSidebar />

      {/* Col liste — 320 px */}
      <div className="w-80 shrink-0 border-r border-line flex flex-col overflow-hidden">
        <div className="px-4 py-4 border-b border-line-soft">
          <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted/50">mes notes</p>
          <h2 className="font-serif text-2xl text-text-primary mt-0.5">Diary</h2>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-soft">
          {grouped.map(({ date, entries }) => (
            <div key={date}>
              <div className="px-4 py-2 sticky top-0 bg-bg-primary/95 backdrop-blur-sm border-b border-line-soft">
                <p className="font-serif italic text-xs text-text-muted capitalize">
                  {formatDateShort(date)}
                </p>
              </div>
              {entries.map((entry) => (
                <DeskNoteRow
                  key={entry.id}
                  entry={entry}
                  active={entry.id === selectedId}
                  onClick={() => setSelectedId(entry.id)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Col détail */}
      {selectedEntry ? (
        <EntryDetailPane entry={selectedEntry} />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="font-serif italic text-text-muted/55 text-lg">Sélectionne une note</p>
        </div>
      )}
    </div>
  );
}
