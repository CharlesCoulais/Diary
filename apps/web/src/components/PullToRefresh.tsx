import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSyncContext } from '../lib/sync/SyncProvider';
import { trpc } from '../lib/trpc';

// Distance de pull (après easing) à atteindre pour déclencher le refresh.
// Bumpé à 95 pour exiger un geste plus explicite — l'ancien 70 se déclenchait
// trop facilement quand l'utilisateur essayait juste de scroller.
const THRESHOLD = 95;
const MAX_PULL = 140;
// Le touchstart doit avoir lieu dans la zone supérieure de l'écran pour être
// interprété comme intention de pull-to-refresh. Si l'utilisateur pose le
// doigt au milieu ou en bas et drag, c'est clairement une intention de
// scroller — pas de tirer pour rafraîchir.
const TOP_TOUCH_ZONE_PX = 150;
// Easing : delta réel × ce coefficient = pull affiché. Plus bas = pull plus
// dur. 0.4 (vs 0.5 avant) demande ~240px de mouvement réel pour atteindre
// THRESHOLD — clairement intentionnel.
const EASE = 0.4;

export function PullToRefresh() {
  const { sync } = useSyncContext();
  const queryClient = useQueryClient();
  const { data: me } = trpc.auth.me.useQuery(undefined, { retry: false });
  const isOwner = me?.role === 'OWNER';
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const syncRef = useRef(sync);
  syncRef.current = sync;
  const isOwnerRef = useRef(isOwner);
  isOwnerRef.current = isOwner;
  pullRef.current = pull;
  refreshingRef.current = refreshing;

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (window.scrollY > 0) return;
      const t = e.touches[0];
      if (!t) return;
      // Le geste doit DÉMARRER près du haut de l'écran. Si l'utilisateur
      // touche au milieu/bas et drag, c'est du scroll normal — pas du pull.
      if (t.clientY > TOP_TOUCH_ZONE_PX) return;
      startY.current = t.clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (refreshingRef.current || startY.current === null) return;
      const t = e.touches[0];
      if (!t) return;
      const delta = t.clientY - startY.current;
      if (delta <= 0) { if (pullRef.current !== 0) setPull(0); return; }
      const eased = Math.min(MAX_PULL, delta * EASE);
      setPull(eased);
    };
    const onTouchEnd = async () => {
      if (refreshingRef.current) return;
      const triggered = pullRef.current >= THRESHOLD;
      startY.current = null;
      if (triggered) {
        setRefreshing(true);
        setPull(THRESHOLD);
        try {
          await Promise.all([
            isOwnerRef.current ? syncRef.current() : Promise.resolve(),
            queryClient.invalidateQueries(),
          ]);
        } finally {
          setRefreshing(false);
          setPull(0);
        }
      } else {
        setPull(0);
      }
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [queryClient]);

  const progress = Math.min(1, pull / THRESHOLD);
  const visible = pull > 0 || refreshing;

  return (
    <div
      aria-hidden
      className="fixed inset-x-0 top-0 z-[60] flex justify-center pointer-events-none"
      style={{
        transform: `translateY(${Math.max(0, pull - 30)}px)`,
        opacity: visible ? 1 : 0,
        transition: startY.current === null ? 'transform 200ms ease-out, opacity 200ms ease-out' : 'none',
      }}
    >
      <div className="mt-2 w-10 h-10 rounded-full bg-bg-elevated shadow-soft flex items-center justify-center">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className={`text-accent ${refreshing ? 'animate-spin' : ''}`}
          style={{ transform: refreshing ? undefined : `rotate(${progress * 270}deg)`, transition: 'transform 80ms linear' }}
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      </div>
    </div>
  );
}
