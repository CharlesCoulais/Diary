import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, Link } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { resolveNoteTypeConfig } from './NoteTypePicker';
import type { NoteType } from './NoteTypePicker';
import { useNoteTypeDefs } from '../lib/useNoteTypeDefs';
import { useBackButtonClose } from '../hooks/useBackButtonClose';

function formatTime(d: string | Date) {
  const date = new Date(d);
  const now = new Date();
  const diffH = (now.getTime() - date.getTime()) / 3_600_000;
  if (diffH < 1) return `${Math.max(1, Math.round(diffH * 60))} min`;
  if (diffH < 24) return `${Math.round(diffH)} h`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

type TaskMeta = {
  status?: { from: string | null; to: string | null };
  priority?: { from: string | null; to: string | null };
};

type ReactionMeta = {
  emoji?: string;
  reactorId?: string;
};

type NotifItem = {
  id: string;
  type: string;
  read: boolean;
  createdAt: string | Date;
  commentId?: string | null;
  taskId?: string | null;
  entryId?: string | null;
  meta?: TaskMeta | ReactionMeta | { response?: string; guestName?: string; ownerName?: string; approved?: boolean } | { status?: 'DONE' | 'REJECTED' } | null;
  comment?: {
    id: string;
    content: string;
    anchorText?: string | null;
    parentId?: string | null;
    author?: { id: string; displayName: string | null; email: string } | null;
    entry?: {
      id: string;
      date: string | Date;
      noteType?: string | null;
      customTypeId?: string | null;
      title?: string | null;
      mediaMeta?: unknown;
    } | null;
  } | null;
  entry?: {
    id: string;
    date: string | Date;
    noteType?: string | null;
    customTypeId?: string | null;
    title?: string | null;
    mediaMeta?: unknown;
  } | null;
  task?: {
    id: string;
    title: string;
    status: string;
    priority: string | null;
    deletedAt: string | Date | null;
  } | null;
};

const TASK_STATUS_LABELS: Record<string, string> = {
  OPEN: 'À faire',
  IN_PROGRESS: 'En cours',
  DONE: 'Fait',
  LOCAL_DONE: 'Local',
  TO_TEST: 'Test',
  DEPLOYED: 'Déployé',
  MIGRATED: 'Migré',
  CANCELLED: 'Annulée',
  SCHEDULED: 'Planifiée',
};

const TASK_PRIORITY_LABELS: Record<string, string> = {
  HIGH: 'haute',
  MEDIUM: 'moyenne',
  LOW: 'basse',
};

function authorName(a: { displayName: string | null; email: string } | undefined | null): string {
  if (!a) return '?';
  return a.displayName || a.email.split('@')[0] || a.email;
}

function entryLabel(entry: NonNullable<NotifItem['comment']>['entry']): string {
  if (!entry) return '';
  const m = entry.mediaMeta as { subject?: string } | null;
  if (m?.subject) return m.subject;
  if (entry.title) return entry.title;
  return formatDate(entry.date);
}

function describeTaskChange(meta: TaskMeta | null | undefined): string {
  if (!meta) return 'mise à jour';
  const parts: string[] = [];
  if (meta.status) {
    const to = meta.status.to ? (TASK_STATUS_LABELS[meta.status.to] ?? meta.status.to) : null;
    if (to) parts.push(`statut → ${to}`);
  }
  if (meta.priority) {
    const to = meta.priority.to;
    if (to) parts.push(`priorité → ${TASK_PRIORITY_LABELS[to] ?? to}`);
    else parts.push('priorité retirée');
  }
  return parts.join(' · ') || 'mise à jour';
}

function NotifCard({
  n,
  archived,
  onArchive,
  onUnarchive,
  onClick,
}: {
  n: NotifItem;
  archived: boolean;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onClick: () => void;
}) {
  const { defsById } = useNoteTypeDefs();
  const isTask = n.type === 'TASK_UPDATED';
  const isReaction = n.type === 'REACTION_NEW';
  const isEntryNew = n.type === 'ENTRY_NEW';
  const isEntryEdit = n.type === 'ENTRY_EDIT';
  const isRequestTreated = n.type === 'REQUEST_TREATED';
  const isReadGateResponse = n.type === 'READ_GATE_RESPONSE';
  const isReadGateDecided = n.type === 'READ_GATE_DECIDED';
  const isReadGate = isReadGateResponse || isReadGateDecided;
  const isCapsuleUnlocked = n.type === 'CAPSULE_UNLOCKED';
  const isMention = n.type === 'MENTION_NEW';
  const entry = n.comment?.entry ?? n.entry;
  const author = n.comment?.author;
  const reactionMeta = isReaction ? (n.meta as ReactionMeta | null) : null;
  const requestMeta = isRequestTreated ? (n.meta as { status?: 'DONE' | 'REJECTED' } | null) : null;
  const readGateMeta = isReadGate
    ? (n.meta as { response?: string; guestName?: string; ownerName?: string; approved?: boolean; autoApproved?: boolean } | null)
    : null;
  const label = isTask
    ? 'Tâche mise à jour'
    : isReaction
      ? `Réaction ${reactionMeta?.emoji ?? '👍'}${n.commentId ? ' sur ton commentaire' : ''}`
      : isEntryNew
        ? 'Nouvelle note publiée'
        : isEntryEdit
          ? 'Ajout sur une note'
          : isRequestTreated
            ? (requestMeta?.status === 'REJECTED' ? 'Demande refusée' : 'Demande traitée')
            : isReadGateResponse
              ? (readGateMeta?.autoApproved
                  ? `${readGateMeta?.guestName ?? 'Quelqu\'un'} a déverrouillé ✦`
                  : `${readGateMeta?.guestName ?? 'Quelqu\'un'} a répondu au verrou`)
              : isReadGateDecided
                ? (readGateMeta?.approved
                    ? `${readGateMeta?.ownerName ?? 'L\'auteur'} a accepté ta réponse`
                    : `${readGateMeta?.ownerName ?? 'L\'auteur'} a refusé ta réponse`)
                : isCapsuleUnlocked
                  ? 'Capsule ouverte ✦'
                  : isMention
                  ? (author ? `${authorName(author)} t'a mentionné·e ✦` : 'Tu as été mentionné·e ✦')
                  : n.type === 'COMMENT_NEW'
                  ? `${authorName(author)} a commenté`
                  : n.type === 'THREAD_REOPENED'
                    ? `${authorName(author)} a rouvert le fil`
                    : `${authorName(author)} a répondu`;
  const anchor = n.comment?.anchorText;
  const preview = n.comment?.content?.slice(0, 120);
  const eLabel = entryLabel(entry);
  const taskTitle = n.task?.title;
  const taskChange = isTask ? describeTaskChange(n.meta as TaskMeta | null) : null;

  return (
    <div className={`flex items-stretch border-b border-text-muted/5 last:border-0 ${n.read ? 'opacity-60' : ''}`}>
      {/* Contenu principal cliquable */}
      <button
        type="button"
        onClick={onClick}
        className="flex-1 min-w-0 text-left px-4 py-3 hover:bg-bg-primary transition-colors"
      >
        {/* Top row: action + time + unread dot */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-text-primary flex-1 min-w-0 truncate">{label}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] text-text-muted/55">{formatTime(n.createdAt)}</span>
            {!n.read && <span className="w-2 h-2 rounded-full bg-accent shrink-0" />}
          </div>
        </div>

        {/* Task context */}
        {isTask && taskTitle && (
          <div className="flex items-center gap-1 mb-1.5">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 shrink-0 text-text-muted/50" aria-hidden>
              <rect x="3" y="2" width="10" height="12" rx="1" />
              <path d="M6 2v2h4V2M5 8h6M5 10.5h4" />
            </svg>
            <span className="text-[11px] text-text-muted/60 truncate">{taskTitle}</span>
          </div>
        )}

        {/* Task change summary */}
        {isTask && taskChange && (
          <p className="text-xs text-text-muted line-clamp-2 leading-relaxed">{taskChange}</p>
        )}

        {/* Entry context */}
        {!isTask && entry && eLabel && (
          <div className="flex items-center gap-1 mb-1.5">
            {(() => { const c = resolveNoteTypeConfig({ noteType: (entry.noteType ?? 'JOURNAL') as NoteType, customTypeId: entry.customTypeId ?? null }, defsById); return <c.Glyph className="w-3 h-3 shrink-0" style={{ color: c.color }} />; })()}
            <span className="text-[11px] text-text-muted/60 truncate">{eLabel}</span>
          </div>
        )}

        {/* Anchor text */}
        {!isTask && anchor && (
          <p className="text-[11px] text-text-muted/50 italic mb-1 line-clamp-1">« {anchor} »</p>
        )}

        {/* Comment preview */}
        {!isTask && preview && (
          <p className="text-xs text-text-muted line-clamp-2 leading-relaxed">{preview}</p>
        )}

        {/* Read-gate response preview (côté owner ou confident) */}
        {isReadGate && readGateMeta?.response && (
          <p className="text-xs text-text-muted line-clamp-2 leading-relaxed italic">
            « {readGateMeta.response} »
          </p>
        )}
      </button>

      {/* Bouton archiver — colonne fixe à droite, toujours accessible */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); archived ? onUnarchive?.() : onArchive?.(); }}
        className="shrink-0 w-10 flex items-center justify-center text-text-muted/45 hover:text-text-muted hover:bg-bg-primary transition-colors"
        aria-label={archived ? 'Désarchiver' : 'Archiver'}
      >
        <span className="text-sm">{archived ? '↩' : '✕'}</span>
      </button>
    </div>
  );
}

export function NotificationBell({ dropUp = false }: { dropUp?: boolean }) {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const { data: me } = trpc.auth.me.useQuery(undefined, { retry: false });
  // placeholderData = on garde la dernière liste connue pendant le refetch (évite un flash "vide" sur reload réseau)
  // gcTime élevé = la liste survit aux remontages (PWA recovery, reload via "Recharger l'app", etc.)
  const { data, isLoading: notifsLoading, isError: notifsError, refetch: refetchNotifs } = trpc.notifications.list.useQuery(
    { limit: 50 },
    {
      // Le temps réel (SSE) rafraîchit instantanément ; ce poll n'est qu'un filet
      // de sécurité espacé au cas où la connexion SSE tombe.
      refetchInterval: 180_000,
      // gcTime élevé = la donnée en cache survit aux remontages (PWA recovery, reload, etc.)
      // → pas de flash "vide" pendant qu'un nouveau fetch est en vol
      gcTime: 60 * 60 * 1000,
      staleTime: 0,
      retry: 2,
    },
  );
  const { data: pushSettings } = trpc.notifications.getSettings.useQuery(undefined, { staleTime: 60_000 });
  const { data: archivedData } = trpc.notifications.listArchived.useQuery(
    { limit: 50 },
    {
      enabled: false,
      staleTime: 60_000,
      gcTime: 60 * 60 * 1000,
    },
  );

  const markRead = trpc.notifications.markRead.useMutation({
    // Optimistic : on marque comme lu localement sans flush la liste (évite la disparition transitoire)
    onMutate: async ({ id }) => {
      await utils.notifications.list.cancel();
      const prev = utils.notifications.list.getData({ limit: 50 });
      if (prev) {
        utils.notifications.list.setData({ limit: 50 }, {
          ...prev,
          notifications: prev.notifications.map((n: any) => n.id === id ? { ...n, read: true } : n),
          unreadCount: Math.max(0, prev.unreadCount - 1),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) utils.notifications.list.setData({ limit: 50 }, ctx.prev); },
    onSettled: () => utils.notifications.list.invalidate(),
  });
  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => utils.notifications.list.invalidate(),
  });
  const archive = trpc.notifications.archive.useMutation({
    onSuccess: () => { utils.notifications.list.invalidate(); utils.notifications.listArchived.invalidate(); },
  });
  const archiveAllRead = trpc.notifications.archiveAllRead.useMutation({
    onSuccess: () => { utils.notifications.list.invalidate(); utils.notifications.listArchived.invalidate(); },
  });
  const unarchive = trpc.notifications.unarchive.useMutation({
    onSuccess: () => { utils.notifications.list.invalidate(); utils.notifications.listArchived.invalidate(); },
  });

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  type Category = 'all' | 'comments' | 'mentions' | 'reactions' | 'entries' | 'tasks' | 'requests' | 'readGate' | 'capsules';
  const [filter, setFilter] = useState<Category>('all');

  // Ancrage du panneau au bouton (portal → on doit calculer la position en `fixed` depuis le rect).
  // En desktop on s'aligne sur le bouton et on bascule en "drop-up" si la place manque dessous.
  // En mobile (dropUp prop), on conserve le panneau plein écran ancré au bas.
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties | null>(null);
  useLayoutEffect(() => {
    if (!open || dropUp) { setPanelStyle(null); return; }
    const compute = () => {
      const el = buttonRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const panelW = 320; // ~ w-80
      const margin = 8;
      // Place de chaque côté du bouton
      const spaceBelow = vh - r.bottom - margin;
      const spaceAbove = r.top - margin;
      const flipUp = spaceBelow < 320 && spaceAbove > spaceBelow;
      // Aligne le bord droit du panneau sur le bord droit du bouton, contraint à la viewport
      let left = r.right - panelW;
      if (left < margin) left = margin;
      if (left + panelW > vw - margin) left = vw - panelW - margin;
      const maxH = Math.min(560, flipUp ? spaceAbove : spaceBelow);
      const style: React.CSSProperties = {
        position: 'fixed',
        left,
        width: panelW,
        maxHeight: maxH,
      };
      if (flipUp) style.bottom = vh - r.top + margin; else style.top = r.bottom + margin;
      setPanelStyle(style);
    };
    compute();
    // Le scroll de la page (hors panneau) ferme le panneau plutôt que de le
    // re-positionner en continu (re-calcul jittery + panneau qui « colle » au
    // bouton qui défile). Le scroll interne de la liste est ignoré.
    const onScroll = (e: Event) => {
      if (panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, dropUp]);

  // Ferme le panneau avec Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const unread = data?.unreadCount ?? 0;
  const notifs = (data?.notifications ?? []) as unknown as NotifItem[];
  const archived = (archivedData?.notifications ?? []) as unknown as NotifItem[];
  const hasRead = notifs.some((n) => n.read);

  const handleOpen = () => {
    setOpen((v) => !v);
  };

  // Back natif (Android/iOS) → ferme le panneau notifs (qui prend ~tout l'écran mobile).
  useBackButtonClose(open, () => setOpen(false));

  const handleTabChange = (t: 'active' | 'archived') => {
    setTab(t);
    if (t === 'archived') {
      utils.notifications.listArchived.fetch({ limit: 50 });
    }
  };

  const handleNotifClick = (n: NotifItem) => {
    if (!n.read) markRead.mutate({ id: n.id });
    setOpen(false);
    if (n.type === 'TASK_UPDATED') {
      navigate('/tasks');
      return;
    }
    if (n.type === 'REQUEST_TREATED' && !n.entry) {
      navigate('/demandes');
      return;
    }
    const entry = n.comment?.entry ?? n.entry;
    if (!entry) return;
    const entryId = entry.id as string;
    const commentId = n.commentId ?? n.comment?.id;
    const date = typeof entry.date === 'string'
      ? entry.date.slice(0, 10)
      : new Date(entry.date as Date).toISOString().slice(0, 10);
    const commentParam = commentId ? `&commentId=${commentId}` : '';
    if (me?.role === 'GUEST') {
      navigate(`/?entryId=${entryId}${commentParam}`);
    } else {
      navigate(`/?date=${date}&entryId=${entryId}${commentParam}`);
    }
  };

  function matchesFilter(n: NotifItem): boolean {
    if (filter === 'all') return true;
    if (filter === 'comments') return n.type === 'COMMENT_NEW' || n.type === 'COMMENT_REPLY' || n.type === 'THREAD_REOPENED';
    if (filter === 'mentions') return n.type === 'MENTION_NEW';
    if (filter === 'reactions') return n.type === 'REACTION_NEW';
    if (filter === 'entries') return n.type === 'ENTRY_NEW' || n.type === 'ENTRY_EDIT';
    if (filter === 'tasks') return n.type === 'TASK_UPDATED';
    if (filter === 'requests') return n.type === 'REQUEST_TREATED';
    if (filter === 'readGate') return n.type === 'READ_GATE_RESPONSE' || n.type === 'READ_GATE_DECIDED';
    if (filter === 'capsules') return n.type === 'CAPSULE_UNLOCKED';
    return true;
  }
  const baseList = tab === 'active' ? notifs : archived;
  const displayed = filter === 'all' ? baseList : baseList.filter(matchesFilter);

  // Deux compteurs distincts :
  //  - `counts` : total par catégorie (sert à décider la visibilité du pill)
  //  - `unreadCounts` : non-lus par catégorie côté actif (pastille à droite du pill)
  // Cette distinction évite que les catégories disparaissent dès que tout est lu —
  // sinon on ne peut plus filtrer pour relire ses anciennes notifs.
  const counts: Record<Category, number> = { all: 0, comments: 0, mentions: 0, reactions: 0, entries: 0, tasks: 0, requests: 0, readGate: 0, capsules: 0 };
  const unreadCounts: Record<Category, number> = { all: 0, comments: 0, mentions: 0, reactions: 0, entries: 0, tasks: 0, requests: 0, readGate: 0, capsules: 0 };
  for (const n of baseList) {
    const isUnread = tab === 'active' && !n.read;
    counts.all++;
    if (isUnread) unreadCounts.all++;
    let cat: Category | null = null;
    if (n.type === 'COMMENT_NEW' || n.type === 'COMMENT_REPLY' || n.type === 'THREAD_REOPENED') cat = 'comments';
    else if (n.type === 'MENTION_NEW') cat = 'mentions';
    else if (n.type === 'REACTION_NEW') cat = 'reactions';
    else if (n.type === 'ENTRY_NEW' || n.type === 'ENTRY_EDIT') cat = 'entries';
    else if (n.type === 'TASK_UPDATED') cat = 'tasks';
    else if (n.type === 'REQUEST_TREATED') cat = 'requests';
    else if (n.type === 'READ_GATE_RESPONSE' || n.type === 'READ_GATE_DECIDED') cat = 'readGate';
    else if (n.type === 'CAPSULE_UNLOCKED') cat = 'capsules';
    if (cat) {
      counts[cat]++;
      if (isUnread) unreadCounts[cat]++;
    }
  }
  const CATEGORIES: { value: Category; label: string }[] = [
    { value: 'all', label: 'Tout' },
    { value: 'comments', label: 'Commentaires' },
    { value: 'mentions', label: 'Mentions' },
    { value: 'reactions', label: 'Réactions' },
    { value: 'entries', label: 'Notes' },
    { value: 'tasks', label: 'Tâches' },
    { value: 'requests', label: 'Demandes' },
    { value: 'readGate', label: 'Verrous' },
    { value: 'capsules', label: 'Capsules' },
  ];
  const visibleCategories = CATEGORIES.filter((c) => c.value === 'all' || counts[c.value] > 0);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleOpen}
        className="relative p-1.5 rounded-lg text-text-muted hover:text-text-primary transition-colors outline-none"
        aria-label="Notifications"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 bg-accent rounded-full text-[11px] leading-none text-bg-primary inline-flex items-center justify-center font-semibold tabular-nums">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            className={`z-50 bg-bg-elevated rounded-2xl shadow-soft border border-text-muted/10 overflow-hidden flex flex-col ${dropUp ? 'fixed bottom-16 left-4 right-4 w-auto max-h-[70vh]' : ''}`}
            style={dropUp ? undefined : (panelStyle ?? { position: 'fixed', opacity: 0, pointerEvents: 'none' })}
          >
            {/* Header */}
            <div className="border-b border-text-muted/10">
              {/* Tabs */}
              <div className="flex items-center gap-4 px-4 pt-3">
                <button
                  type="button"
                  onClick={() => handleTabChange('active')}
                  className={`pb-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'active' ? 'text-text-primary border-accent' : 'text-text-muted/50 border-transparent hover:text-text-muted'}`}
                >
                  Notifications
                  {unread > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-accent text-[11px] leading-none text-bg-primary font-semibold tabular-nums">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleTabChange('archived')}
                  className={`pb-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'archived' ? 'text-text-primary border-accent' : 'text-text-muted/50 border-transparent hover:text-text-muted'}`}
                >
                  Archives
                </button>
              </div>
              {/* Filtre par catégorie — affiché dès qu'il y a au moins une catégorie spécifique
                  peuplée (en plus de "Tout"). Profitable au confident dont les notifs sont souvent
                  concentrées sur un ou deux types (commentaires + verrous décidés, etc.). */}
              {visibleCategories.length > 1 && (
                <div className="relative pt-2 pb-1">
                  <div className="flex gap-1 px-3 overflow-x-auto hide-scrollbar">
                    {visibleCategories.map((c) => {
                      const active = filter === c.value;
                      const unread = unreadCounts[c.value];
                      return (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => setFilter(c.value)}
                          className={`shrink-0 inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] border transition-all duration-150 ${active ? 'bg-accent/15 border-accent/40 text-accent font-medium' : 'border-text-muted/15 text-text-muted hover:border-text-muted/30'}`}
                        >
                          {c.label}
                          {unread > 0 && c.value !== 'all' && (
                            <span className={`text-[11px] font-bold leading-none ${active ? 'opacity-80' : 'opacity-60'}`}>{unread}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {/* Fade gauche/droite : signale qu'il y a du contenu débordant (visible seulement si scrollable) */}
                  <div aria-hidden className="pointer-events-none absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-bg-elevated to-transparent" />
                  <div aria-hidden className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-bg-elevated to-transparent" />
                </div>
              )}
              {/* Actions */}
              {tab === 'active' && (unread > 0 || hasRead) && (
                <div className="flex items-center justify-end gap-3 px-4 py-1.5">
                  {unread > 0 && (
                    <button type="button" onClick={() => markAllRead.mutate()} className="text-xs text-accent hover:opacity-70 transition-opacity">
                      Tout lire
                    </button>
                  )}
                  {hasRead && (
                    <button type="button" onClick={() => archiveAllRead.mutate()} className="text-xs text-text-muted/50 hover:text-text-muted transition-colors">
                      Archiver lues
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* List — flex-1 : la hauteur du panneau (maxHeight inline desktop /
                max-h-[70vh] mobile) est l'unique autorité, plus de double cap. */}
            <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar">
              {/* État de chargement/erreur distinct de "vide" pour éviter l'illusion de perte de données */}
              {tab === 'active' && notifsLoading && !data && (
                <p className="text-sm text-text-muted italic text-center py-6">Chargement…</p>
              )}
              {tab === 'active' && notifsError && (
                <div className="flex flex-col items-center gap-2 py-6">
                  <p className="text-sm text-danger/70 italic">Connexion perdue.</p>
                  <button type="button" onClick={() => refetchNotifs()} className="text-xs text-accent hover:underline">Réessayer</button>
                </div>
              )}
              {!notifsLoading && !notifsError && displayed.length === 0 && (
                <p className="text-sm text-text-muted italic text-center py-6">
                  {filter !== 'all'
                    ? 'Aucune notification de ce type'
                    : tab === 'active' ? 'Aucune notification' : 'Aucune notification archivée'}
                </p>
              )}
              {displayed.map((n) => (
                <NotifCard
                  key={n.id}
                  n={n}
                  archived={tab === 'archived'}
                  onArchive={() => archive.mutate({ id: n.id })}
                  onUnarchive={() => unarchive.mutate({ id: n.id })}
                  onClick={() => handleNotifClick(n)}
                />
              ))}
            </div>

            {/* Push prompt */}
            {pushSettings && !pushSettings.enabled && (
              <div className="border-t border-text-muted/10 px-4 py-2.5 flex items-center justify-between">
                <p className="text-[11px] text-text-muted/50">Notif push désactivées</p>
                <Link
                  to={me?.role === 'GUEST' ? '/reglages' : '/settings'}
                  onClick={() => setOpen(false)}
                  className="text-[11px] text-accent hover:opacity-70 transition-opacity"
                >
                  Activer →
                </Link>
              </div>
            )}
          </div>
        </>
      , document.body)}
    </div>
  );
}
