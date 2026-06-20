import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Système de dialogues impératifs — remplaçant des natifs `window.confirm` et
 * `window.alert`.
 *
 * Pourquoi : les natifs sont moches, hors charte (typo système, contraste cru),
 * et bloquent **tout** le thread. Ici on a :
 *   - un design propre cocoa (cohérent avec le reste de l'app),
 *   - support clavier (`Esc` pour annuler, `Entrée` pour confirmer),
 *   - support mobile (tap backdrop = annuler).
 *
 * Usage :
 *   import { confirmDialog, notifyDialog } from '../lib/dialog';
 *   if (!(await confirmDialog({ title: 'Supprimer ?', tone: 'danger' }))) return;
 *   await notifyDialog({ title: 'Erreur', message: '…' });
 *
 * Important : un et un seul `<DialogHost />` doit être monté quelque part au
 * niveau racine (cf. `App.tsx`). Si non monté, les promesses se résolvent
 * immédiatement à `false` / `undefined` (fallback safe).
 */

type Tone = 'default' | 'danger' | 'warning' | 'success';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone; // colore le bouton de confirmation
}

interface NotifyOptions {
  title: string;
  message?: string;
  okLabel?: string;
  tone?: Tone; // colore l'icône + bordure
}

interface PromptOptions {
  title: string;
  message?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  inputType?: 'text' | 'url' | 'email';
  tone?: Tone;
}

interface OpenState {
  kind: 'confirm' | 'notify' | 'prompt';
  options: ConfirmOptions | NotifyOptions | PromptOptions;
  resolve: (value: boolean | string | null | undefined) => void;
}

// Un seul host à la fois — on garde une référence module-level pour éviter de
// passer par un Context (les helpers `confirmDialog`/`notifyDialog` sont appelés
// depuis du code imperatif, parfois hors composant React).
type Setter = (state: OpenState | null) => void;
let hostSetter: Setter | null = null;

function setHost(setter: Setter | null) {
  hostSetter = setter;
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!hostSetter) {
      // Filet de sécurité : si jamais le host n'est pas encore mounté, on
      // tombe sur le natif plutôt que de bloquer l'action.
      resolve(window.confirm(options.title));
      return;
    }
    hostSetter({
      kind: 'confirm',
      options,
      resolve: (v) => resolve(v === true),
    });
  });
}

export function notifyDialog(options: NotifyOptions): Promise<void> {
  return new Promise((resolve) => {
    if (!hostSetter) {
      window.alert(`${options.title}${options.message ? `\n\n${options.message}` : ''}`);
      resolve();
      return;
    }
    hostSetter({
      kind: 'notify',
      options,
      resolve: () => resolve(),
    });
  });
}

/**
 * Demande un texte à l'utilisateur. Résout à `null` si annulé.
 * Remplace `window.prompt`.
 */
export function promptDialog(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    if (!hostSetter) {
      const v = window.prompt(options.title, options.initialValue ?? '');
      resolve(v);
      return;
    }
    hostSetter({
      kind: 'prompt',
      options,
      resolve: (v) => resolve(typeof v === 'string' ? v : null),
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant host — à monter une fois au niveau racine.
// ─────────────────────────────────────────────────────────────────────────────

export function DialogHost() {
  const [state, setState] = useState<OpenState | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHost(setState);
    return () => setHost(null);
  }, []);

  // Initialise la valeur de l'input quand on ouvre un prompt + autofocus.
  useEffect(() => {
    if (!state) return;
    if (state.kind === 'prompt') {
      setPromptValue((state.options as PromptOptions).initialValue ?? '');
      // microtask : laisse le DOM se monter avant le focus.
      queueMicrotask(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    } else {
      confirmBtnRef.current?.focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      } else if (e.key === 'Enter' && state.kind !== 'prompt') {
        // Pour le prompt, c'est le formulaire qui gère Enter (évite double-soumission).
        e.preventDefault();
        close(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const close = (confirmed: boolean) => {
    if (!state) return;
    const current = state;
    setState(null);
    if (current.kind === 'confirm') {
      current.resolve(confirmed);
    } else if (current.kind === 'prompt') {
      current.resolve(confirmed ? promptValue : null);
    } else {
      current.resolve(undefined);
    }
  };

  if (!state) return null;

  const { kind, options } = state;
  const tone: Tone =
    (options as ConfirmOptions).tone ?? (kind === 'confirm' ? 'default' : 'default');

  const toneBtnClass: Record<Tone, string> = {
    default: 'bg-accent text-bg-primary hover:opacity-95',
    danger: 'bg-danger text-white hover:opacity-95',
    warning: 'bg-warning text-bg-primary hover:opacity-95',
    success: 'bg-success text-bg-primary hover:opacity-95',
  };
  const toneIconBg: Record<Tone, string> = {
    default: 'bg-accent/15 text-accent',
    danger: 'bg-danger/15 text-danger',
    warning: 'bg-warning/15 text-warning',
    success: 'bg-success/15 text-success',
  };

  // Icône par défaut adaptée au ton — uniquement visuel, pas critique fonctionnel.
  const Icon = () => {
    if (tone === 'danger') {
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        </svg>
      );
    }
    if (tone === 'warning') {
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    }
    if (tone === 'success') {
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
    }
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    );
  };

  const confirmLabel =
    kind === 'confirm'
      ? ((options as ConfirmOptions).confirmLabel ?? 'Confirmer')
      : kind === 'prompt'
        ? ((options as PromptOptions).confirmLabel ?? 'Valider')
        : ((options as NotifyOptions).okLabel ?? 'OK');
  const cancelLabel =
    kind === 'prompt'
      ? ((options as PromptOptions).cancelLabel ?? 'Annuler')
      : ((options as ConfirmOptions).cancelLabel ?? 'Annuler');

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      // z-[200] : passe au-dessus de tout (chat z-[55], BackToTop z-40, lock screen z-[999] reste au-dessus mais OK car les dialogs ne s'affichent pas quand verrouillé).
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-bg-primary/70 backdrop-blur-sm"
      onClick={() => close(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-bg-elevated rounded-2xl shadow-2xl border border-text-muted/10 p-5 sm:p-6"
      >
        <div className="flex items-start gap-3 sm:gap-4">
          <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${toneIconBg[tone]}`}>
            <Icon />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h2 id="dialog-title" className="text-base font-semibold text-text-primary leading-snug">
              {options.title}
            </h2>
            {options.message && (
              <p className="mt-1.5 text-sm text-text-muted leading-relaxed whitespace-pre-wrap">
                {options.message}
              </p>
            )}
          </div>
        </div>

        {kind === 'prompt' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              close(true);
            }}
            className="mt-4"
          >
            <input
              ref={inputRef}
              type={(options as PromptOptions).inputType ?? 'text'}
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              placeholder={(options as PromptOptions).placeholder}
              className="w-full bg-bg-primary/60 border border-text-muted/15 rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/55 outline-none focus:border-accent/40 transition-colors"
            />
          </form>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          {(kind === 'confirm' || kind === 'prompt') && (
            <button
              type="button"
              onClick={() => close(false)}
              className="px-3.5 py-1.5 rounded-lg text-sm text-text-muted hover:text-text-primary hover:bg-text-muted/10 transition-colors"
            >
              {cancelLabel}
            </button>
          )}
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={() => close(true)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-opacity ${toneBtnClass[tone]}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
