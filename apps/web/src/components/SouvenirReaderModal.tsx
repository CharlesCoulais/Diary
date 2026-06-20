import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { trpc } from '../lib/trpc';
import { AnnotatedReader } from './AnnotatedReader';
import { useModalA11y } from '../hooks/useModalA11y';

/**
 * Modal de lecture d'une note ouverte depuis un Souvenir (aperçu « il y a un
 * an », panneau « voir tout », Collection). Charge la note via `entries.byId`
 * et la rend en lecture seule, SANS changement de route. Échap / clic backdrop
 * pour fermer.
 *
 * `zClass` permet d'empiler ce modal au-dessus d'un panneau déjà ouvert
 * (SouvenirsPanel est en z-[140], le reader passe alors en z-[160]).
 */
export function SouvenirReaderModal({
  entryId,
  onClose,
  zClass = 'z-[150]',
}: {
  entryId: string;
  onClose: () => void;
  zClass?: string;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: entry } = trpc.entries.byId.useQuery({ id: entryId }) as { data: any };

  // Focus-trap + Échap + restauration du focus (le hook gère Échap).
  const panelRef = useModalA11y<HTMLDivElement>(onClose);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div
      className={`fixed inset-0 ${zClass} bg-black/70 flex items-end sm:items-center justify-center`}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={entry?.title || 'Lecture d’une note'}
        className="bg-bg-primary w-full max-w-2xl max-h-[90vh] rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-text-muted/10 shrink-0">
          <div>
            {entry?.title && <p className="font-medium text-text-primary text-sm">{entry.title}</p>}
            <p className="text-xs text-text-muted">
              {entry?.date
                ? new Date(entry.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                : '…'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-8 h-8 rounded-full flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Contenu */}
        <div className="overflow-y-auto overscroll-contain flex-1 px-6 py-4">
          {!entry ? (
            <p className="text-text-muted font-serif italic text-sm">Chargement…</p>
          ) : (
            <AnnotatedReader
              entryId={entryId}
              contentMd={entry.contentMd ?? ''}
              commentsLocked={entry.commentsLocked ?? false}
              fontSize={entry.fontSize}
              fontKey={entry.font}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
