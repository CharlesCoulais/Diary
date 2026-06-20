import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Système de toasts (snackbars) impératifs — pour les retours non bloquants :
 * confirmation d'une action, annulation (undo) après une suppression, erreur
 * réseau silencieuse rattrapée…
 *
 * Différence avec `lib/dialog` : un toast n'interrompt PAS le flux (pas de
 * backdrop, auto-disparition), là où `confirmDialog`/`notifyDialog` bloquent et
 * demandent une décision. Règle d'usage :
 *   - décision requise / destructif → `confirmDialog`
 *   - simple notification / undo réversible → `showToast`
 *
 * Usage :
 *   import { showToast } from '../lib/toast';
 *   showToast({ message: 'Tâche supprimée', action: { label: 'Annuler', onClick: restore } });
 *   showToast({ message: e.message, tone: 'danger' });
 *
 * Un seul `<ToastHost />` doit être monté au niveau racine (cf. App.tsx). Sans
 * host monté, `showToast` est un no-op silencieux (le toast est non critique).
 */

type ToastTone = 'default' | 'success' | 'danger' | 'warning';

interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  action?: ToastAction;
  /** Durée d'affichage en ms. Défaut : 4 s (6 s s'il y a une action à saisir). */
  duration?: number;
}

interface ActiveToast extends ToastOptions {
  id: number;
}

// Référence module-level (même pattern que lib/dialog) : permet d'appeler
// showToast depuis du code impératif, hors composant React.
let pushToast: ((t: ActiveToast) => void) | null = null;
let counter = 0;

export function showToast(options: ToastOptions): void {
  if (!pushToast) return; // host non monté → no-op (toast non critique)
  counter += 1;
  pushToast({ id: counter, ...options });
}

const TONE_RING: Record<ToastTone, string> = {
  default: 'border-text-muted/15',
  success: 'border-success/35',
  danger: 'border-danger/35',
  warning: 'border-warning/35',
};
const TONE_DOT: Record<ToastTone, string> = {
  default: 'bg-text-muted/40',
  success: 'bg-success',
  danger: 'bg-danger',
  warning: 'bg-warning',
};

function ToastCard({ toast, onDismiss }: { toast: ActiveToast; onDismiss: () => void }) {
  const tone = toast.tone ?? 'default';
  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto w-full max-w-sm flex items-center gap-3 bg-bg-elevated border ${TONE_RING[tone]} shadow-lg rounded-xl px-4 py-3 toast-enter`}
    >
      <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${TONE_DOT[tone]}`} aria-hidden />
      <span className="flex-1 min-w-0 text-sm text-text-primary leading-snug">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action!.onClick();
            onDismiss();
          }}
          className="shrink-0 text-sm font-semibold text-accent hover:opacity-80 transition-opacity tap"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fermer"
        className="shrink-0 text-text-muted/55 hover:text-text-primary transition-colors leading-none text-base"
      >
        ✕
      </button>
    </div>
  );
}

export function ToastHost() {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  useEffect(() => {
    pushToast = (t) => {
      setToasts((prev) => [...prev, t]);
      const duration = t.duration ?? (t.action ? 6000 : 4000);
      const timer = setTimeout(() => dismiss(t.id), duration);
      timers.current.set(t.id, timer);
    };
    return () => {
      pushToast = null;
    };
  }, [dismiss]);

  // Nettoie tous les timers au démontage du host.
  const timersRef = timers;
  useEffect(() => () => timersRef.current.forEach((t) => clearTimeout(t)), [timersRef]);

  if (toasts.length === 0) return null;

  return createPortal(
    <div
      // z-[210] : au-dessus du BottomNav (z-20), du chat (z-[55]) et des dialogs
      // (z-[200]) pour que l'undo reste toujours atteignable.
      className="fixed inset-x-0 z-[210] flex flex-col items-center gap-2 px-4 pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)' }}
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>,
    document.body,
  );
}
