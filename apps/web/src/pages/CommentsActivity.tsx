import { useEffect, useRef, useState } from 'react';
import { trpc } from '../lib/trpc';
import { AnnotatedReader } from '../components/AnnotatedReader';
import { HScroll } from '../components/HScroll';

import { resolveNoteTypeConfig } from '../components/NoteTypePicker';
import { useNoteTypeDefs } from '../lib/useNoteTypeDefs';
import { BottomNav, GuestBottomNav } from '../components/BottomNav';
import { BackToTop } from '../components/BackToTop';
import { PageHeader } from '../components/PageHeader';
import { getOwnerDisplayPrefs, getGuestDisplayPrefs, type FilDefaultView } from '../lib/displayPrefs';

type FilterStatus = FilDefaultView;

function stripToPlainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/!\[.*?\]\([^)]+\)/g, '')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/\n+/g, ' ')
    .trim();
}

function timeAgo(date: string | Date): string {
  const ms = Date.now() - new Date(date).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `il y a ${d} j`;
  return new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function formatDate(d: string | Date) {
  const iso = typeof d === 'string' ? d : d.toISOString();
  return new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getThreadStatus(item: any, currentUserId: string): FilterStatus {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((item.entry as any).commentsResolved) return 'closed';
  // « À répondre » = le dernier message n'est pas de moi → un todo qui persiste
  // jusqu'à ce que je réponde (je deviens le dernier auteur) ou que je clore le
  // fil. Lire ne le retire PAS (cf. BUG-04 : la lecture pilote le point « non
  // lu », pas le statut).
  return item.author.id === currentUserId ? 'replied' : 'to-reply';
}

/**
 * « Non lu » : le dernier message n'est pas de moi ET est postérieur à ma
 * dernière lecture du fil. Indépendant du statut (un fil « à répondre » peut
 * être déjà lu). Pilote le point d'indicateur ; effacé à l'ouverture (BUG-04).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isThreadUnread(item: any, currentUserId: string): boolean {
  if (item.author.id === currentUserId) return false;
  const readAt = item.myReadAt ? new Date(item.myReadAt).getTime() : 0;
  return new Date(item.createdAt).getTime() > readAt;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ActivityItem({ item, currentUserId, canResolve, isActive = false, onSelect, onMarkRead }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  item: any;
  currentUserId: string;
  canResolve: boolean;
  isActive?: boolean;
  onSelect: () => void;
  /** Marque le fil comme lu (appelé à l'ouverture si non lu) → efface le point. */
  onMarkRead: () => void;
}) {
  const { defsById } = useNoteTypeDefs();
  const [mobileOpen, setMobileOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entry = item.entry as any;
  const cfg = resolveNoteTypeConfig({ noteType: entry.noteType, customTypeId: entry.customTypeId ?? null }, defsById);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = (entry.mediaMeta ?? {}) as any;
  const authorName = item.author.displayName ?? item.author.email.split('@')[0];
  const threadCount: number = item.threadCount ?? 1;
  const status = getThreadStatus(item, currentUserId);
  // Point « non lu » : seulement sur les fils non clos (un fil clos est traité).
  const unread = status !== 'closed' && isThreadUnread(item, currentUserId);
  const lastCommentIsMine = item.author.id === currentUserId;

  const utils = trpc.useUtils();
  const resolve = trpc.comments.resolve.useMutation({
    onSuccess: () => utils.comments.activity.invalidate(),
  });

  const statusBadgeMap: Record<FilterStatus, { label: string; cls: string }> = {
    'to-reply': { label: '● À répondre', cls: 'bg-warning/15 text-warning' },
    replied:    { label: '✓ Répondu',    cls: 'bg-success/15 text-success' },
    closed:     { label: '— Fermé',      cls: 'bg-text-muted/10 text-text-muted/50' },
    all:        { label: '',             cls: '' },
  };
  const statusBadge = statusBadgeMap[status];

  function handleClick() {
    const opening = window.innerWidth >= 1024 ? true : !mobileOpen;
    if (window.innerWidth >= 1024) onSelect();
    else setMobileOpen((v) => !v);
    // Ouvrir un fil non lu = le lire → efface le point « non lu » (mais le garde
    // en « à répondre » tant que je n'ai pas répondu, cf. BUG-04).
    if (opening && unread) onMarkRead();
  }

  return (
    <div
      className={`bg-bg-elevated rounded-2xl shadow-soft border-l-[3px] overflow-hidden transition-all duration-200 ${status === 'closed' ? 'opacity-60' : ''}`}
      style={{
        borderLeftColor: cfg.color,
        ...(isActive ? {
          boxShadow: `inset 0 0 0 2px ${cfg.color.startsWith('var(') ? `color-mix(in srgb, ${cfg.color} 55%, transparent)` : `${cfg.color}8c`}, var(--shadow-soft)`,
        } : {}),
      }}
    >
      {/* Header cliquable */}
      <button
        type="button"
        onClick={handleClick}
        className="w-full text-left px-5 py-4 flex items-start gap-3"
      >
        <cfg.Glyph className="w-5 h-5 mt-0.5 shrink-0" style={{ color: cfg.color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="text-xs text-text-muted flex items-center gap-1.5">
              {unread && (
                <span
                  className="w-2 h-2 rounded-full bg-accent shrink-0"
                  aria-label="Nouveau message non lu"
                  title="Nouveau message non lu"
                />
              )}
              {formatDate(entry.date)}
            </span>
            <span className="text-xs text-text-muted/60 shrink-0 flex items-center gap-1">
              {item.updatedAt && new Date(item.updatedAt).getTime() - new Date(item.createdAt).getTime() > 5000 && (
                <span className="text-[11px] italic text-text-muted/50" title={`Modifié ${timeAgo(item.updatedAt)}`}>modifié</span>
              )}
              {timeAgo(item.createdAt)}
            </span>
          </div>
          {m.subject && (
            <p className="text-sm font-medium text-text-primary truncate mb-0.5">{m.subject}</p>
          )}
          {/* Dernier commentaire preview */}
          <div className="flex items-baseline gap-1.5">
            <span
              className="text-xs font-medium shrink-0"
              style={{ color: lastCommentIsMine ? 'var(--color-accent)' : 'var(--color-guest)' }}
            >
              {lastCommentIsMine ? 'Moi' : authorName}
            </span>
            {item.anchorText && (
              <span className="text-xs text-text-muted/50 italic truncate">
                « {item.anchorText.slice(0, 40)}{item.anchorText.length > 40 ? '…' : ''} »
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted line-clamp-2 mt-0.5">{stripToPlainText(item.content)}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full ${statusBadge.cls}`}>
            {statusBadge.label}
          </span>
          <span className="inline-flex items-center gap-1 text-[12px] text-text-muted/70">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {threadCount}
          </span>
          {/* Chevron mobile / flèche desktop */}
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            className={`text-text-muted/55 transition-transform duration-200 lg:hidden ${mobileOpen ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            className="hidden lg:block text-text-muted/45"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </button>

      {/* Accordéon mobile uniquement */}
      {mobileOpen && (
        <div className="lg:hidden px-5 pb-4 border-t border-text-muted/10 pt-3">
          {canResolve && (
            <div className="flex justify-end mb-3">
              <button
                type="button"
                onClick={() => resolve.mutate({ entryId: entry.id, resolved: !entry.commentsResolved })}
                disabled={resolve.isPending}
                className={`text-[11px] px-3 py-1 rounded-full border transition-colors ${
                  entry.commentsResolved
                    ? 'border-accent/40 text-accent hover:bg-accent/10'
                    : 'border-text-muted/20 text-text-muted/60 hover:border-text-muted/40 hover:text-text-muted'
                }`}
              >
                {entry.commentsResolved ? '↩ Rouvrir' : '✓ Clore ce fil'}
              </button>
            </div>
          )}
          <AnnotatedReader
            entryId={entry.id}
            contentMd={entry.contentMd ?? ''}
            commentsLocked={entry.commentsLocked ?? false}
            defaultOpenAnchor={item.anchorText ?? 'general'}
          />
        </div>
      )}
    </div>
  );
}

const FILTERS: { value: FilterStatus; label: string }[] = [
  { value: 'all',      label: 'Tous' },
  { value: 'to-reply', label: 'À répondre' },
  { value: 'replied',  label: 'Répondu' },
  { value: 'closed',   label: 'Fermé' },
];

export function CommentsActivityPage() {
  const { data, isLoading } = trpc.comments.activity.useQuery(undefined, {
    refetchInterval: 180_000,
  });
  const { data: me } = trpc.auth.me.useQuery();
  const { defsById } = useNoteTypeDefs();
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [activeDesktopItemId, setActiveDesktopItemId] = useState<string | null>(null);
  const userTouchedRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll à l'ouverture d'un fil : on vise le **passage annoté** ouvert
  // (`.bg-annotation-open`) plutôt que le bas absolu — sinon on saute par-dessus
  // l'extrait qui a motivé l'ouverture (FEED-05). Repli sur le bas pour un fil
  // « général » (pas d'ancre). On observe la croissance du contenu (commentaires
  // chargés en async, images) pendant 2s pour garder la cible en vue.
  useEffect(() => {
    if (!activeDesktopItemId) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const scrollToTarget = () => {
      const anchor = el.querySelector('.bg-annotation-open');
      if (anchor) anchor.scrollIntoView({ block: 'center', behavior: 'auto' });
      else el.scrollTop = el.scrollHeight;
    };
    scrollToTarget();
    const observer = new ResizeObserver(scrollToTarget);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    const timeout = setTimeout(() => observer.disconnect(), 2000);
    return () => { observer.disconnect(); clearTimeout(timeout); };
  }, [activeDesktopItemId]);

  const currentUserId = me?.id ?? '';
  const isOwner = me?.role === 'OWNER';
  const canResolve = isOwner || (me?.role === 'GUEST' && me?.guestAccess === 'CONFIDANT');

  useEffect(() => {
    if (!me || userTouchedRef.current) return;
    const def = me.role === 'OWNER'
      ? getOwnerDisplayPrefs().filDefaultView
      : getGuestDisplayPrefs().filDefaultView;
    if (def && def !== filter) setFilter(def);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.role]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = data ?? [];

  // Déduplique par (entryId, anchorText) — plusieurs threads "général" sur la même
  // entrée ne doivent produire qu'une seule carte (la plus récente).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deduped: any[] = [];
  const seenKey = new Set<string>();
  for (const item of items) {
    const key = `${item.entry.id}::${item.anchorText ?? '__general__'}`;
    if (!seenKey.has(key)) { seenKey.add(key); deduped.push(item); }
  }

  // Lire un fil ne change plus son statut (seul le point « non lu » bouge), donc
  // pas besoin d'épingler le fil ouvert : il reste naturellement dans son filtre.
  const filtered = filter === 'all'
    ? deduped
    : deduped.filter((item) => getThreadStatus(item, currentUserId) === filter);

  const counts = data ? {
    'to-reply': deduped.filter((i) => getThreadStatus(i, currentUserId) === 'to-reply').length,
    replied:    deduped.filter((i) => getThreadStatus(i, currentUserId) === 'replied').length,
    closed:     deduped.filter((i) => getThreadStatus(i, currentUserId) === 'closed').length,
  } : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeItem: any = activeDesktopItemId
    ? (items.find((i) => i.threadRootId === activeDesktopItemId) ?? null)
    : null;

  const utils = trpc.useUtils();
  const resolve = trpc.comments.resolve.useMutation({
    onSuccess: () => utils.comments.activity.invalidate(),
  });
  // Marque un fil lu (optimiste, sans invalidation immédiate pour ne pas réordonner
  // la liste pendant la lecture — le serveur pose le même `readAt`). BUG-04.
  const markRead = trpc.comments.markThreadRead.useMutation({
    onMutate: ({ threadRootId }) => {
      const prev = utils.comments.activity.getData();
      if (prev) {
        const now = new Date().toISOString();
        // Cast via any[] : le type de sortie de l'activity est trop profond pour
        // que tsc infère le .map (TS2589).
        const next = (prev as unknown as Array<{ threadRootId: string }>).map((i) =>
          i.threadRootId === threadRootId ? { ...i, myReadAt: now } : i,
        );
        utils.comments.activity.setData(undefined, next as unknown as typeof prev);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) utils.comments.activity.setData(undefined, ctx.prev);
    },
  });

  return (
    <div className="min-h-dvh pb-48 sm:pb-56 max-w-2xl mx-auto [overflow-x:clip] lg:max-w-none lg:px-0 lg:pb-0 lg:flex lg:items-start">

      {/* ── Colonne gauche ──────────────────────────────────────────────────── */}
      <div className={`lg:px-12 lg:pb-16 lg:min-h-dvh lg:min-w-0 ${activeDesktopItemId ? 'lg:w-[520px] lg:shrink-0' : 'lg:flex-1'}`}>

        <PageHeader
          title="Fil"
          kicker={counts ? `${deduped.filter((i) => getThreadStatus(i, currentUserId) !== 'closed').length} fil${deduped.filter((i) => getThreadStatus(i, currentUserId) !== 'closed').length !== 1 ? 's' : ''} ouvert${deduped.filter((i) => getThreadStatus(i, currentUserId) !== 'closed').length !== 1 ? 's' : ''}` : 'Fil'}
          backTo="/"
        />

        <div className="px-6">

        {/* Filtres */}
        <HScroll className="pb-4 flex gap-2" fadeFrom="var(--color-bg-primary)">
          {FILTERS.map(({ value, label }) => {
            const count = value !== 'all' && counts ? counts[value as keyof typeof counts] : null;
            const isActive = filter === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => { userTouchedRef.current = true; setFilter(value); }}
                className={`shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  isActive
                    ? 'bg-accent/15 border-accent/30 text-accent font-medium'
                    : 'border-text-muted/15 text-text-muted/60 hover:text-text-muted hover:border-text-muted/30'
                }`}
              >
                {label}
                {count !== null && count > 0 && (() => {
                  // Coral réservé à « À répondre » (action attendue) ; vert pour
                  // « Répondu », neutre pour « Fermé » — sinon faux signal d'urgence.
                  const counterColor = value === 'to-reply'
                    ? 'var(--color-guest)'
                    : value === 'replied'
                      ? 'var(--color-success)'
                      : 'var(--color-text-muted)';
                  return (
                    <span
                      className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[11px] font-semibold"
                      style={{ backgroundColor: `color-mix(in srgb, ${counterColor} 18%, transparent)`, color: counterColor }}
                    >
                      {count}
                    </span>
                  );
                })()}
              </button>
            );
          })}
        </HScroll>

        {isLoading && (
          <p className="text-text-muted text-sm">Chargement…</p>
        )}

        {!isLoading && (!filtered || filtered.length === 0) && (
          <div className="text-center py-12">
            <p className="font-serif text-text-muted/55 text-2xl mb-2">✦</p>
            <p className="font-serif text-text-muted italic text-sm">
              {filter === 'all' ? "Aucun commentaire pour l'instant." : 'Aucun fil dans cette catégorie.'}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {filtered?.map((item) => (
            <ActivityItem
              key={(item as never as { threadRootId: string }).threadRootId}
              item={item}
              currentUserId={currentUserId}
              canResolve={canResolve}
              isActive={activeDesktopItemId === item.threadRootId}
              onSelect={() => setActiveDesktopItemId(item.threadRootId)}
              onMarkRead={() => markRead.mutate({ threadRootId: item.threadRootId })}
            />
          ))}
        </div>

        <BackToTop panelOpen={!!activeDesktopItemId} />
        {isOwner ? <BottomNav /> : <GuestBottomNav />}
        </div>{/* /px-6 */}
      </div>

      {/* ── Panneau droit desktop ────────────────────────────────────────────── */}
      {activeItem && (
        <div data-right-panel className="hidden lg:flex lg:flex-col lg:flex-1 lg:sticky lg:top-0 lg:self-start lg:h-dvh lg:border-l lg:border-text-muted/10 lg:overflow-hidden">
          {/* En-tête du panneau */}
          {(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const entry = activeItem.entry as any;
            const cfg = resolveNoteTypeConfig({ noteType: entry.noteType, customTypeId: entry.customTypeId ?? null }, defsById);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const m = (entry.mediaMeta ?? {}) as any;
            const status = getThreadStatus(activeItem, currentUserId);
            const statusBadgeMap: Record<FilterStatus, { label: string; cls: string }> = {
              'to-reply': { label: '● À répondre', cls: 'bg-warning/15 text-warning' },
              replied:    { label: '✓ Répondu',    cls: 'bg-success/15 text-success' },
              closed:     { label: '— Fermé',      cls: 'bg-text-muted/10 text-text-muted/50' },
              all:        { label: '',             cls: '' },
            };
            const statusBadge = statusBadgeMap[status];
            return (
              <>
                {/* En-tête fixe du panneau */}
                <div className="shrink-0 flex items-center gap-3 px-6 pt-6 pb-4 border-b border-text-muted/10">
                  <cfg.Glyph className="w-5 h-5 shrink-0" style={{ color: cfg.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-text-muted/60 mb-0.5">{formatDate(entry.date)}</p>
                    {m.subject
                      ? <p className="text-sm font-medium text-text-primary truncate">{m.subject}</p>
                      : <p className="text-sm text-text-muted truncate italic">{cfg.label}</p>
                    }
                  </div>
                  <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${statusBadge.cls}`}>
                    {statusBadge.label}
                  </span>
                  {canResolve && (
                    <button
                      type="button"
                      onClick={() => resolve.mutate({ entryId: entry.id, resolved: !entry.commentsResolved })}
                      disabled={resolve.isPending}
                      className={`text-[11px] px-3 py-1 rounded-full border transition-colors shrink-0 ${
                        entry.commentsResolved
                          ? 'border-accent/40 text-accent hover:bg-accent/10'
                          : 'border-text-muted/20 text-text-muted/60 hover:border-text-muted/40 hover:text-text-muted'
                      }`}
                    >
                      {entry.commentsResolved ? '↩ Rouvrir' : '✓ Clore ce fil'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveDesktopItemId(null)}
                    className="text-text-muted/55 hover:text-text-muted transition-colors shrink-0"
                    aria-label="Fermer"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                {/* Contenu + commentaires scrollables — structure identique à EntryCard/NoteModal inline */}
                <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-soft flex flex-col [&_img]:max-h-72 [&_img]:w-auto [&_img]:rounded-lg [&_video]:max-h-72 [&_video]:w-auto [&_audio]:w-full">
                  <div className="px-6 pt-4 pb-0 flex-1 flex flex-col">
                    <div className="flex-1 flex flex-col min-h-0">
                      <AnnotatedReader
                        key={activeItem.threadRootId}
                        entryId={entry.id}
                        contentMd={entry.contentMd ?? ''}
                        commentsLocked={entry.commentsLocked ?? false}
                        defaultOpenAnchor={activeItem.anchorText ?? 'general'}
                        className="flex-1 flex flex-col min-h-0"
                        fullWidthComposer
                      />
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Pas de placeholder quand rien n'est sélectionné : la colonne gauche
          prend toute la largeur, comme dans le Journal. */}
    </div>
  );
}
