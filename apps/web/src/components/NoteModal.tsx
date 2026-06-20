import { useEffect, useRef, useState, type MutableRefObject, type ReactNode, type TouchEvent as ReactTouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { useBackButtonClose } from '../hooks/useBackButtonClose';
import { useModalA11y } from '../hooks/useModalA11y';

export function NoteModal({
  onClose,
  header,
  children,
  fullscreen = false,
  fab,
  footer,
  inline = false,
}: {
  onClose: () => void;
  header: ReactNode;
  children: ReactNode;
  fullscreen?: boolean;
  fab?: ReactNode;
  footer?: ReactNode;
  /** Desktop panel mode: renders as a plain flex column (no portal, no overflow lock) */
  inline?: boolean;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);

  // Don't intercept back button in inline mode (would break page navigation)
  useBackButtonClose(!inline, onClose);

  // Focus-trap + Échap + restauration du focus, uniquement pour les modes portal
  // (le ref n'est PAS posé en mode `inline`, le hook devient alors un no-op).
  const panelRef = useModalA11y<HTMLDivElement>(onClose);

  // Visual viewport tracking — keeps modal above keyboard on mobile (not needed inline)
  const [vp, setVp] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    if (inline) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setVp({ top: vv.offsetTop, height: vv.height });
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [inline]);

  useEffect(() => {
    if (inline) return;
    // Échap est géré par useModalA11y (focus piégé dans la modale).
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => { bodyRef.current?.scrollTo({ top: 0 }); }, 0);
    return () => {
      document.body.style.overflow = prev;
      clearTimeout(t);
    };
  }, [inline]);

  // ── Swipe-to-close (plein écran tactile) ──────────────────────────────────
  // Glisser vers le bas depuis l'en-tête (zone de préhension) ferme la note,
  // geste attendu sur mobile. On translate le conteneur en `transform` (composé,
  // pas de reflow) via le DOM directement pour éviter un re-render par frame.
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Le panneau fullscreen porte à la fois containerRef (swipe) et le ref a11y.
  const setFullscreenRefs = (el: HTMLDivElement | null) => {
    containerRef.current = el;
    (panelRef as MutableRefObject<HTMLDivElement | null>).current = el;
  };
  const dragRef = useRef({ startY: 0, dragging: false, dy: 0 });
  const onGrabTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    dragRef.current = { startY: e.touches[0]!.clientY, dragging: true, dy: 0 };
    const el = containerRef.current;
    if (el) el.style.transition = 'none';
  };
  const onGrabTouchMove = (e: ReactTouchEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d.dragging) return;
    const dy = e.touches[0]!.clientY - d.startY;
    d.dy = dy > 0 ? dy : 0;
    const el = containerRef.current;
    if (el) el.style.transform = d.dy ? `translateY(${d.dy}px)` : '';
  };
  const onGrabTouchEnd = () => {
    const d = dragRef.current;
    if (!d.dragging) return;
    d.dragging = false;
    if (d.dy > 110) { onClose(); return; }
    const el = containerRef.current;
    if (el) {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.style.transition = reduce ? 'none' : 'transform 0.22s var(--ease-cozy, ease)';
      el.style.transform = '';
    }
  };

  // ── Inline mode (desktop read panel) ──────────────────────────────────────
  if (inline) {
    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-text-muted/10">
          {header}
        </div>
        <div ref={bodyRef} className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-soft flex flex-col">
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-text-muted/10 bg-bg-elevated px-4 py-3">
            {footer}
          </div>
        )}
        {fab && (
          <div className="pointer-events-none absolute inset-0 flex items-end justify-end p-5 pb-8 z-10">
            <div className="pointer-events-auto">{fab}</div>
          </div>
        )}
      </div>
    );
  }

  if (fullscreen) {
    return createPortal(
      <div
        ref={setFullscreenRefs}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Note"
        className="fixed inset-0 z-50 flex flex-col bg-bg-primary outline-none"
        style={vp ? { top: vp.top, height: vp.height, bottom: 'auto' } : undefined}
      >
        {/* Header + poignée de préhension — zone de swipe-to-close (tactile) */}
        <div
          className="shrink-0"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
          onTouchStart={onGrabTouchStart}
          onTouchMove={onGrabTouchMove}
          onTouchEnd={onGrabTouchEnd}
          onTouchCancel={onGrabTouchEnd}
        >
          <div className="flex justify-center pt-1.5 pb-0.5 [@media(hover:hover)]:hidden" aria-hidden>
            <span className="h-1 w-9 rounded-full bg-text-muted/25" />
          </div>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-text-muted/10">
            {header}
          </div>
        </div>
        {/* Scrollable body */}
        <div
          ref={bodyRef}
          className={`flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-soft flex flex-col ${footer ? '' : 'pb-[env(safe-area-inset-bottom)]'}`}
        >
          {children}
        </div>
        {/* Sticky footer (e.g. comment composer) */}
        {footer && (
          <div className="shrink-0 border-t border-text-muted/10 bg-bg-elevated px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
        {/* Floating action button */}
        {fab && (
          <div className="pointer-events-none absolute inset-0 flex items-end justify-end p-5 pb-8 z-10">
            <div className="pointer-events-auto">{fab}</div>
          </div>
        )}
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={vp ? { top: vp.top, height: vp.height, bottom: 'auto' } : undefined}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Note"
        className="relative z-10 w-full sm:max-w-2xl bg-bg-elevated rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-full sm:max-h-[88svh] outline-none"
      >
        <div className="shrink-0 flex flex-wrap items-center gap-2 sm:gap-3 px-5 py-3.5 border-b border-text-muted/10">
          {header}
        </div>
        <div ref={bodyRef} className="flex-1 overflow-y-auto overscroll-contain scrollbar-soft">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
