import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { trpc } from '../lib/trpc';
import { EmojiPicker } from './EmojiPicker';

interface ReactionUser {
  id: string;
  displayName: string | null;
  email: string;
}

interface AggregatedReaction {
  emoji: string;
  count: number;
  userIds: string[];
  users: ReactionUser[];
}

function userName(u: ReactionUser): string {
  return u.displayName || u.email.split('@')[0] || u.email;
}

/** Tooltip affichant la liste des personnes ayant réagi. Rendu en portal et
 *  clampé au viewport (comme `RatingPill`) pour ne pas déborder sur un bord
 *  (cf. BUG-10). */
function ReactionTooltip({ users, mine, pos }: { users: ReactionUser[]; mine: boolean; pos: { top: number; left: number } }) {
  const names = users.map(userName);
  let text: string;
  if (names.length === 1) {
    text = mine ? 'Toi' : names[0]!;
  } else if (mine) {
    // `users` arrive avec "Toi" déjà placé en tête (cf. tooltipUsers dans ReactionPill).
    const rest = names.slice(1);
    text = rest.length > 0 ? `Toi et ${rest.join(', ')}` : 'Toi';
  } else {
    text = names.join(', ');
  }

  return createPortal(
    <div
      className="fixed z-[200] px-2.5 py-1.5 rounded-lg bg-bg-elevated border border-text-muted/15 shadow-lg text-xs text-text-primary pointer-events-none max-w-[220px]"
      style={{ top: pos.top, left: pos.left }}
    >
      {text}
    </div>,
    document.body,
  );
}

/** Position clampée du tooltip sous le déclencheur (partagé compact/normal). */
function useReactionTooltipPos(open: boolean, triggerRef: React.RefObject<HTMLButtonElement>) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    if (!open || !triggerRef.current) { setPos(null); return; }
    const rect = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const left = Math.min(rect.left, vw - 220);
    setPos({ top: rect.bottom + 4, left: Math.max(8, left) });
  }, [open, triggerRef]);
  return pos;
}

/** Pill de réaction avec tooltip au hover. */
export function ReactionPill({
  reaction,
  currentUserId,
  onToggle,
  disabled,
  size = 'normal',
}: {
  reaction: AggregatedReaction;
  currentUserId: string;
  onToggle: () => void;
  disabled?: boolean;
  size?: 'normal' | 'compact';
}) {
  const [hovered, setHovered] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipPos = useReactionTooltipPos(hovered, triggerRef);
  const mine = reaction.userIds.includes(currentUserId);
  const hasUsers = reaction.users.length > 0;

  // Construire le texte du tooltip avec "Toi" si l'utilisateur courant a réagi
  const tooltipUsers: ReactionUser[] = mine
    ? [
        { id: currentUserId, displayName: 'Toi', email: '' },
        ...reaction.users.filter((u) => u.id !== currentUserId),
      ]
    : reaction.users;

  // Long-press tactile : sur mobile il n'y a pas de hover, donc on ouvre le
  // tooltip « qui a réagi » après un appui long (~450 ms). Un appui court reste
  // un tap → toggle de la réaction. Même pattern que RatingPill (favoris).
  const pressTimerRef = useRef<number | null>(null);
  const longPressedRef = useRef(false);
  const clearTimer = () => {
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };
  useEffect(() => {
    if (!hovered) return;
    const close = () => setHovered(false);
    document.addEventListener('touchstart', close, { passive: true });
    return () => document.removeEventListener('touchstart', close);
  }, [hovered]);
  const handleClick = () => {
    if (longPressedRef.current) { longPressedRef.current = false; return; }
    onToggle();
  };
  const touchHandlers = {
    onTouchStart: () => {
      if (!hasUsers) return;
      longPressedRef.current = false;
      clearTimer();
      pressTimerRef.current = window.setTimeout(() => { longPressedRef.current = true; setHovered(true); }, 450);
    },
    onTouchEnd: clearTimer,
    onTouchMove: clearTimer,
    onTouchCancel: clearTimer,
  };

  if (size === 'compact') {
    return (
      <div className="relative" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onClick={handleClick}
          {...touchHandlers}
          className={[
            'flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs transition-colors border',
            mine
              ? 'bg-accent/15 border-accent/60 text-accent'
              : 'bg-bg-primary border-text-muted/15 text-text-muted/60 hover:border-accent/40',
          ].join(' ')}
        >
          <span className="text-[13px] leading-none">{reaction.emoji}</span>
          {reaction.count > 1 && (
            <span className="font-medium tabular-nums">{reaction.count}</span>
          )}
        </button>
        {hovered && tooltipPos && reaction.users.length > 0 && (
          <ReactionTooltip users={tooltipUsers} mine={mine} pos={tooltipPos} />
        )}
      </div>
    );
  }

  return (
    <div className="relative" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={handleClick}
        {...touchHandlers}
        className={[
          'flex items-center gap-1 px-2 py-0.5 rounded-full text-sm transition-colors border',
          mine
            ? 'bg-accent/15 border-accent text-accent'
            : 'bg-bg-primary border-text-muted/20 text-text-muted/70 hover:border-accent/50',
        ].join(' ')}
      >
        <span>{reaction.emoji}</span>
        <span className="font-medium tabular-nums text-xs">{reaction.count}</span>
      </button>
      {hovered && tooltipPos && reaction.users.length > 0 && (
        <ReactionTooltip users={tooltipUsers} mine={mine} pos={tooltipPos} />
      )}
    </div>
  );
}

/* ─────────────────────── Barre de réactions (lecture / commentaires) ─────────────────────── */

interface BaseProps {
  reactions: AggregatedReaction[];
  currentUserId: string;
  onToggle: (emoji: string) => void;
  disabled?: boolean;
  openPicker?: boolean;
}

function ReactionBar({ reactions, currentUserId, onToggle, disabled, openPicker }: BaseProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (openPicker) setPickerOpen(true);
  }, [openPicker]);

  return (
    <div className="flex flex-wrap items-center gap-1 relative">
      {reactions.map((r) => (
        <ReactionPill
          key={r.emoji}
          reaction={r}
          currentUserId={currentUserId}
          onToggle={() => onToggle(r.emoji)}
          disabled={disabled}
          size="normal"
        />
      ))}

      {/* Bouton + — toujours visible : sur tactile (pas de hover) c'est le seul
          moyen d'ajouter une réaction, notamment sur une capsule scellée où la
          barre de réactions est le canal de soutien. */}
      {!disabled && (
        <div className="relative">
          <button
            ref={pickerBtnRef}
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="flex items-center justify-center w-6 h-6 [@media(pointer:coarse)]:w-8 [@media(pointer:coarse)]:h-8 rounded-full border border-dashed border-text-muted/25 text-text-muted/50 hover:border-accent/50 hover:text-accent transition-colors text-sm leading-none"
            title="Ajouter une réaction"
          >
            +
          </button>
          {pickerOpen && (
            <EmojiPicker
              triggerRef={pickerBtnRef}
              onSelect={onToggle}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── Entry reactions ─────────────────────────────── */

interface EntryReactionsProps {
  entryId: string;
  currentUserId: string;
  disabled?: boolean;
}

export function EntryReactions({ entryId, currentUserId, disabled }: EntryReactionsProps) {
  const utils = trpc.useUtils();
  const { data: reactions = [] } = trpc.reactions.forEntry.useQuery(
    { entryId },
    { refetchInterval: () => (document.visibilityState === 'visible' ? 180_000 : false) },
  );
  const toggle = trpc.reactions.toggleEntry.useMutation({
    // ── Optimistic UI : on update la liste immédiatement avant la réponse serveur ──
    onMutate: async ({ emoji }) => {
      await utils.reactions.forEntry.cancel({ entryId });
      const previous = utils.reactions.forEntry.getData({ entryId }) ?? [];
      const existing = previous.find((r) => r.emoji === emoji);
      const mine = existing?.userIds.includes(currentUserId);
      let next: AggregatedReaction[];
      if (mine && existing) {
        // retirer ma réaction
        const newCount = existing.count - 1;
        next = newCount <= 0
          ? previous.filter((r) => r.emoji !== emoji)
          : previous.map((r) => r.emoji === emoji
              ? { ...r, count: newCount, userIds: r.userIds.filter((u) => u !== currentUserId), users: r.users.filter((u) => u.id !== currentUserId) }
              : r);
      } else if (existing) {
        // ajouter ma réaction à une existante
        next = previous.map((r) => r.emoji === emoji
          ? { ...r, count: r.count + 1, userIds: [...r.userIds, currentUserId], users: [...r.users, { id: currentUserId, displayName: 'Toi', email: '' }] }
          : r);
      } else {
        // nouvelle réaction
        next = [...previous, { emoji, count: 1, userIds: [currentUserId], users: [{ id: currentUserId, displayName: 'Toi', email: '' }] }];
      }
      utils.reactions.forEntry.setData({ entryId }, next);
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      // Rollback si erreur
      if (ctx?.previous) utils.reactions.forEntry.setData({ entryId }, ctx.previous);
      console.error('[reaction] toggleEntry failed:', err.message);
    },
    onSettled: () => utils.reactions.forEntry.invalidate({ entryId }),
  });

  return (
    <ReactionBar
      reactions={reactions}
      currentUserId={currentUserId}
      onToggle={(emoji) => toggle.mutate({ entryId, emoji })}
      disabled={disabled}
    />
  );
}

/* ─────────────────────────────── Comment reactions ─────────────────────────────── */

interface CommentReactionsProps {
  commentId: string;
  currentUserId: string;
  disabled?: boolean;
  openPicker?: boolean;
}

export function CommentReactions({ commentId, currentUserId, disabled, openPicker }: CommentReactionsProps) {
  const utils = trpc.useUtils();
  const { data: reactions = [] } = trpc.reactions.forComment.useQuery({ commentId });
  const toggle = trpc.reactions.toggleComment.useMutation({
    onMutate: async ({ emoji }) => {
      await utils.reactions.forComment.cancel({ commentId });
      const previous = utils.reactions.forComment.getData({ commentId }) ?? [];
      const existing = previous.find((r) => r.emoji === emoji);
      const mine = existing?.userIds.includes(currentUserId);
      let next: AggregatedReaction[];
      if (mine && existing) {
        const newCount = existing.count - 1;
        next = newCount <= 0
          ? previous.filter((r) => r.emoji !== emoji)
          : previous.map((r) => r.emoji === emoji
              ? { ...r, count: newCount, userIds: r.userIds.filter((u) => u !== currentUserId), users: r.users.filter((u) => u.id !== currentUserId) }
              : r);
      } else if (existing) {
        next = previous.map((r) => r.emoji === emoji
          ? { ...r, count: r.count + 1, userIds: [...r.userIds, currentUserId], users: [...r.users, { id: currentUserId, displayName: 'Toi', email: '' }] }
          : r);
      } else {
        next = [...previous, { emoji, count: 1, userIds: [currentUserId], users: [{ id: currentUserId, displayName: 'Toi', email: '' }] }];
      }
      utils.reactions.forComment.setData({ commentId }, next);
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) utils.reactions.forComment.setData({ commentId }, ctx.previous);
      console.error('[reaction] toggleComment failed:', err.message);
    },
    onSettled: () => utils.reactions.forComment.invalidate({ commentId }),
  });

  return (
    <ReactionBar
      reactions={reactions}
      currentUserId={currentUserId}
      onToggle={(emoji) => toggle.mutate({ commentId, emoji })}
      disabled={disabled}
      openPicker={openPicker}
    />
  );
}

/* ───────────────────── Card preview — compact entry reactions ───────────────────── */

export function CardEntryReactions({ entryId }: { entryId: string }) {
  const utils = trpc.useUtils();
  const { data: me } = trpc.auth.me.useQuery();
  const { data: reactions = [] } = trpc.reactions.forEntry.useQuery(
    { entryId },
    {
      staleTime: 30_000,
      refetchInterval: () => (document.visibilityState === 'visible' ? 180_000 : false),
    },
  );
  const toggle = trpc.reactions.toggleEntry.useMutation({
    onMutate: async ({ emoji }) => {
      if (!me) return;
      await utils.reactions.forEntry.cancel({ entryId });
      const previous = utils.reactions.forEntry.getData({ entryId }) ?? [];
      const existing = previous.find((r) => r.emoji === emoji);
      const mine = existing?.userIds.includes(me.id);
      let next: AggregatedReaction[];
      if (mine && existing) {
        const newCount = existing.count - 1;
        next = newCount <= 0
          ? previous.filter((r) => r.emoji !== emoji)
          : previous.map((r) => r.emoji === emoji
              ? { ...r, count: newCount, userIds: r.userIds.filter((u) => u !== me.id), users: r.users.filter((u) => u.id !== me.id) }
              : r);
      } else if (existing) {
        next = previous.map((r) => r.emoji === emoji
          ? { ...r, count: r.count + 1, userIds: [...r.userIds, me.id], users: [...r.users, { id: me.id, displayName: 'Toi', email: '' }] }
          : r);
      } else {
        next = [...previous, { emoji, count: 1, userIds: [me.id], users: [{ id: me.id, displayName: 'Toi', email: '' }] }];
      }
      utils.reactions.forEntry.setData({ entryId }, next);
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) utils.reactions.forEntry.setData({ entryId }, ctx.previous);
      console.error('[reaction] CardEntryReactions toggle failed:', err.message);
    },
    onSettled: () => utils.reactions.forEntry.invalidate({ entryId }),
  });

  const [pickerOpen, setPickerOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  if (!me) return null;

  const hasReactions = reactions.length > 0;

  return (
    <div
      className="flex items-center gap-1 flex-wrap relative"
      onClick={(e) => e.stopPropagation()}
    >
      {reactions.map((r) => (
        <ReactionPill
          key={r.emoji}
          reaction={r}
          currentUserId={me.id}
          onToggle={() => toggle.mutate({ entryId, emoji: r.emoji })}
          disabled={toggle.isPending}
          size="compact"
        />
      ))}

      {/* Bouton + */}
      <div className="relative">
        <button
          ref={btnRef}
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className={[
            'flex items-center justify-center rounded-full border transition-colors text-xs leading-none',
            hasReactions
              ? 'w-5 h-5 border-dashed border-text-muted/20 text-text-muted/35 hover:border-accent/50 hover:text-accent'
              : 'px-1.5 py-0.5 border-dashed border-text-muted/20 text-text-muted/55 hover:border-accent/50 hover:text-accent gap-0.5',
          ].join(' ')}
          title="Réagir"
        >
          {hasReactions ? (
            '+'
          ) : (
            <>
              <span className="text-[13px] leading-none">😊</span>
              <span>+</span>
            </>
          )}
        </button>
        {pickerOpen && (
          <EmojiPicker
            triggerRef={btnRef}
            onSelect={(emoji) => {
              toggle.mutate({ entryId, emoji });
              setPickerOpen(false);
            }}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
