import { useState } from 'react';
import { createPortal } from 'react-dom';
import { trpc } from '../lib/trpc';

type CorrectionDetail = {
  offset: number;
  length: number;
  original: string;
  replacement: string;
  message: string;
  ruleId: string;
};

interface SpellCheckButtonProps {
  /** Lit le texte à corriger au moment du clic. */
  getText: () => string;
  /** Appelé avec le texte corrigé final quand l'utilisateur applique. */
  onApply: (correctedText: string) => void;
  /** "sm" = bouton compact (toolbars discrètes), "md" = avec label. */
  size?: 'sm' | 'md';
}

export function SpellCheckButton({ getText, onApply, size = 'md' }: SpellCheckButtonProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'none' | 'error'>('idle');
  const [pending, setPending] = useState<{ originalText: string; details: CorrectionDetail[]; count: number } | null>(null);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const correct = trpc.entries.correctText.useMutation();

  const handleCheck = async () => {
    const text = getText();
    if (!text.trim()) return;
    setStatus('loading');
    try {
      const result = await correct.mutateAsync({ text });
      if (result.count === 0) {
        setStatus('none');
        setTimeout(() => setStatus('idle'), 2500);
      } else {
        setPending({ originalText: text, details: result.details, count: result.count });
        setSkipped(new Set());
        setStatus('done');
      }
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const applyCorrections = () => {
    if (!pending) return;
    let out = pending.originalText;
    const toApply = pending.details.filter((_, i) => !skipped.has(i));
    const sorted = [...toApply].sort((a, b) => b.offset - a.offset);
    for (const d of sorted) {
      out = out.slice(0, d.offset) + d.replacement + out.slice(d.offset + d.length);
    }
    onApply(out);
    setPending(null);
    setSkipped(new Set());
    setStatus('idle');
  };

  const toggleSkip = (i: number) => setSkipped((prev) => {
    const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next;
  });

  const dismiss = () => { setPending(null); setSkipped(new Set()); setStatus('idle'); };

  const isCompact = size === 'sm';
  const btnLabel = status === 'none' ? 'OK' : status === 'error' ? 'Erreur' : status === 'done' && pending ? `${pending.count} correction${pending.count > 1 ? 's' : ''}` : 'Corriger';

  return (
    <div className="relative">
      <button
        type="button"
        title="Corriger l'orthographe et la grammaire"
        disabled={status === 'loading'}
        onPointerDown={(e) => { e.preventDefault(); if (status === 'idle' || status === 'error') void handleCheck(); }}
        className={
          (isCompact
            ? 'px-2 py-0.5 text-xs rounded h-6 '
            : 'flex items-center gap-1 px-1.5 h-7 rounded text-xs ') +
          'transition-colors duration-100 ' +
          (status === 'done'
            ? 'bg-warning/15 text-warning'
            : status === 'none'
              ? 'bg-success/15 text-success'
              : status === 'error'
                ? 'bg-danger/15 text-danger'
                : 'text-text-muted hover:text-text-primary hover:bg-text-muted/10') +
          (status === 'loading' ? ' opacity-50 cursor-wait' : '')
        }
      >
        {status === 'loading' ? (
          <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
          </svg>
        ) : status === 'none' ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
            <path d="M10 13l-2 2 2 2" /><path d="M14 13l2 2-2 2" />
          </svg>
        )}
        {!isCompact && <span className="hidden sm:inline">{btnLabel}</span>}
      </button>

      {status === 'done' && pending && createPortal(
        <>
          {/* Portal vers document.body : sinon un parent du panneau de détail
              (transform / will-change sur certains layouts desktop) capture
              le `position: fixed` localement et la modale n'est centrée que
              sur la moitié de l'écran, avec backdrop qui ne couvre pas tout. */}
          <div className="fixed inset-0 z-[200] bg-black/30 backdrop-blur-sm" onPointerDown={dismiss} />
          <div className="fixed left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-[201] bg-bg-elevated border border-text-muted/15 rounded-2xl shadow-2xl flex flex-col w-[min(92vw,30rem)] max-h-[75dvh]">
            <div className="flex items-center justify-between px-3 py-2 border-b border-text-muted/10 shrink-0">
              <span className="text-xs text-text-muted">
                {pending.count - skipped.size} / {pending.count} correction{pending.count > 1 ? 's' : ''}
              </span>
              <button
                type="button"
                onPointerDown={(e) => { e.preventDefault(); dismiss(); }}
                className="text-text-muted/50 hover:text-text-muted transition-colors text-sm leading-none"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>
            <ul className="overflow-y-auto scrollbar-soft divide-y divide-text-muted/10 flex-1">
              {pending.details.map((d, i) => {
                const isSkipped = skipped.has(i);
                return (
                  <li key={i} className={`px-3 py-2 ${isSkipped ? 'opacity-40' : ''}`}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0 text-xs">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`font-medium ${isSkipped ? 'text-text-muted' : 'text-danger line-through'} break-all`}>
                            {d.original || '∅'}
                          </span>
                          <span className="text-text-muted/55">→</span>
                          <span className={`font-medium break-all ${isSkipped ? 'text-text-muted' : 'text-success'}`}>
                            {d.replacement || '∅'}
                          </span>
                        </div>
                        {d.message && (
                          <p className="text-[11px] text-text-muted/60 mt-0.5">{d.message}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onPointerDown={(e) => { e.preventDefault(); toggleSkip(i); }}
                        className="shrink-0 text-[11px] px-2 py-0.5 rounded-md border border-text-muted/15 text-text-muted/70 hover:text-text-primary hover:border-text-muted/40 transition-colors"
                      >
                        {isSkipped ? 'Garder' : 'Ignorer'}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-text-muted/10 shrink-0">
              <button
                type="button"
                onPointerDown={(e) => { e.preventDefault(); dismiss(); }}
                className="text-xs text-text-muted/70 hover:text-text-primary transition-colors px-2 py-1"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={pending.count - skipped.size === 0}
                onPointerDown={(e) => { e.preventDefault(); applyCorrections(); }}
                className="px-3 py-1 rounded-lg text-xs font-medium bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-40 transition-colors"
              >
                Appliquer
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
