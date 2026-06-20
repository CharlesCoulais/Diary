import { useMemo, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { trpc } from '../lib/trpc';

/**
 * Boutons « favoris / nul » d'une entrée, par utilisateur.
 *
 * Visibilité :
 *  - Owner   : voit toutes les ratings (★ favoris + ⊘ nul) avec le nom des
 *              confidents qui ont voté (en tooltip / popover).
 *  - Guest   : voit la sienne + celle de l'owner (filtré côté serveur dans
 *              le payload `entry.ratings`). Les autres confidents lui restent
 *              cachés.
 *
 * Mutuellement exclusif : cliquer ★ alors qu'on est sur ⊘ bascule.
 * Re-cliquer le même bouton retire la rating.
 */
export interface EntryRating {
  userId: string;
  value: 'FAVORITE' | 'LOW';
  displayName: string | null;
}

interface Props {
  entryId: string;
  currentUserId: string;
  /**
   * Liste de ratings — déjà filtrée côté serveur selon le rôle du viewer :
   *  - Owner : voit toutes les ratings
   *  - Guest : voit la sienne + celle de l'owner
   * On affiche donc tous les noms reçus sans flag additionnel.
   */
  ratings: EntryRating[];
  disabled?: boolean;
}

export function EntryRatingButtons({ entryId, currentUserId, ratings, disabled }: Props) {
  const utils = trpc.useUtils();
  const mine = ratings.find((r) => r.userId === currentUserId)?.value ?? null;

  const { favCount, lowCount, favNames, lowNames } = useMemo(() => {
    const fav: string[] = [];
    const low: string[] = [];
    for (const r of ratings) {
      const name = r.userId === currentUserId ? 'Toi' : (r.displayName ?? '—');
      if (r.value === 'FAVORITE') fav.push(name);
      else low.push(name);
    }
    return { favCount: fav.length, lowCount: low.length, favNames: fav, lowNames: low };
  }, [ratings, currentUserId]);

  const setMutation = trpc.ratings.set.useMutation({
    onSettled: () => {
      // Re-pull Dexie pour owner / invalide les entries.list pour guest
      void utils.entries.list.invalidate();
      void utils.entries.byId.invalidate();
      window.dispatchEvent(new Event('carnet:sse-sync'));
    },
  });

  const onClick = (value: 'FAVORITE' | 'LOW') => {
    if (disabled || setMutation.isPending) return;
    // Re-clic même valeur → on retire ; sinon on bascule (ou pose si vide).
    const next: 'FAVORITE' | 'LOW' | null = mine === value ? null : value;
    setMutation.mutate({ entryId, value: next });
  };

  return (
    // stopPropagation au niveau du wrapper : le clic ne doit jamais
    // ouvrir le mode lecture de la carte parent.
    <div
      className="inline-flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <RatingPill
        active={mine === 'FAVORITE'}
        count={favCount}
        names={favNames}
        onClick={() => onClick('FAVORITE')}
        kind="FAVORITE"
        disabled={disabled || setMutation.isPending}
      />
      <RatingPill
        active={mine === 'LOW'}
        count={lowCount}
        names={lowNames}
        onClick={() => onClick('LOW')}
        kind="LOW"
        disabled={disabled || setMutation.isPending}
      />
    </div>
  );
}

function RatingPill({
  active,
  count,
  names,
  onClick,
  kind,
  disabled,
}: {
  active: boolean;
  count: number;
  names: string[];
  onClick: () => void;
  kind: 'FAVORITE' | 'LOW';
  disabled?: boolean;
}) {
  const [tipOpen, setTipOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  // Long-press mobile : démarre un timer au touchstart, le tooltip s'ouvre
  // après ~450ms. Si l'utilisateur lève le doigt avant, c'est un tap → on
  // bascule la rating. Sinon (long press), on supprime le clic résultant.
  const pressTimerRef = useRef<number | null>(null);
  const longPressedRef = useRef(false);

  const clearTimer = () => {
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  // Calcule la position du tooltip (sous le bouton, ajustée si overflow).
  useEffect(() => {
    if (!tipOpen || !triggerRef.current) {
      setPos(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    // Aligne sous le bouton, mais clamp pour rester visible côté droit.
    const vw = window.innerWidth;
    const left = Math.min(rect.left, vw - 220);
    setPos({ top: rect.bottom + 4, left: Math.max(8, left) });
  }, [tipOpen]);

  // Ferme le tooltip si on tape ailleurs (mobile : sortir du long-press).
  useEffect(() => {
    if (!tipOpen) return;
    const close = () => setTipOpen(false);
    document.addEventListener('touchstart', close, { passive: true });
    return () => document.removeEventListener('touchstart', close);
  }, [tipOpen]);

  const colorActive = kind === 'FAVORITE'
    ? 'bg-amber-400/15 text-amber-500 border-amber-400/40'
    : 'bg-text-muted/15 text-text-muted/80 border-text-muted/30';
  const colorIdle = 'border-transparent text-text-muted/55 hover:text-text-muted hover:bg-text-muted/8';

  const hasNames = count > 0 && names.length > 0;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          // Si on vient d'un long-press, on consomme le clic sans toggle.
          if (longPressedRef.current) {
            longPressedRef.current = false;
            return;
          }
          onClick();
        }}
        disabled={disabled}
        onMouseEnter={() => hasNames && setTipOpen(true)}
        onMouseLeave={() => setTipOpen(false)}
        onTouchStart={(e) => {
          e.stopPropagation();
          if (!hasNames) return;
          longPressedRef.current = false;
          clearTimer();
          pressTimerRef.current = window.setTimeout(() => {
            longPressedRef.current = true;
            setTipOpen(true);
          }, 450);
        }}
        onTouchEnd={() => clearTimer()}
        onTouchMove={() => clearTimer()}
        onTouchCancel={() => clearTimer()}
        title={kind === 'FAVORITE' ? 'Marquer comme favori' : 'Marquer comme à oublier'}
        className={
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[11px] leading-none transition-colors disabled:opacity-50 select-none ' +
          (active ? colorActive : colorIdle)
        }
      >
        {kind === 'FAVORITE' ? <StarIcon filled={active} /> : <NullIcon active={active} />}
        {count > 0 && <span className="font-mono">{count}</span>}
      </button>
      {tipOpen && pos && hasNames && createPortal(
        <div
          className="fixed z-[200] bg-bg-elevated border border-text-muted/15 rounded-lg shadow-lg px-2.5 py-1.5 text-[11px] text-text-primary pointer-events-none max-w-[220px]"
          style={{ top: pos.top, left: pos.left }}
        >
          {names.join(', ')}
        </div>,
        document.body,
      )}
    </>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function NullIcon({ active }: { active: boolean }) {
  // Cercle barré (style "interdit") — discret quand inactif, plus saturé quand actif.
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="5.5" y1="5.5" x2="18.5" y2="18.5" />
    </svg>
  );
}
