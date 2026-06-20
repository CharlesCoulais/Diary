import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { trpc } from '../lib/trpc';
import { useModalA11y } from '../hooks/useModalA11y';
import { resolveNoteTypeConfig } from './NoteTypePicker';
import type { NoteType } from './NoteTypePicker';
import { useNoteTypeDefs } from '../lib/useNoteTypeDefs';
import { buildPreview, getContentFallback } from './CompactEntryCard';

export type Period = 'week' | 'month' | 'year';

/** Métadonnées partagées par période — libellés + couleur d'accent (différenciation
 *  visuelle semaine / mois / année). Réutilisé par OnThisDay et le panneau. */
export const PERIOD_META: Record<Period, { label: string; short: string; accent: string }> = {
  week:  { label: 'Il y a une semaine', short: '1 semaine', accent: '#6f9a5e' }, // vert sauge
  month: { label: 'Il y a un mois',     short: '1 mois',    accent: '#c2873f' }, // ambre
  year:  { label: 'Il y a un an',       short: '1 an',      accent: '#9a6b9d' }, // mauve
};

type Reaction = { emoji: string; count: number };

type Item = {
  period: string;
  id: string;
  title: string | null;
  date: string;
  contentMd: string;
  mood: string | null;
  noteType: string;
  customTypeId?: string | null;
  mediaMeta: { subject?: string } | null;
  commentCount: number;
  reactions: Reaction[];
};

/** Pied de note des Souvenirs : humeur + nb de commentaires + réactions.
 *  Partagé par OnThisDay (cartes/liste) et le panneau. Rend `null` si vide. */
export function SouvenirMeta({
  mood,
  commentCount = 0,
  reactions = [],
  className = '',
}: {
  mood?: string | null;
  commentCount?: number;
  reactions?: Reaction[];
  className?: string;
}) {
  if (!mood && commentCount <= 0 && reactions.length === 0) return null;
  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      {mood && <span className="text-sm leading-none">{mood}</span>}
      {commentCount > 0 && (
        <span className="inline-flex items-center gap-0.5 text-[11px] text-text-muted/55">💬 {commentCount}</span>
      )}
      {reactions.slice(0, 3).map((r) => (
        <span key={r.emoji} className="inline-flex items-center gap-0.5 text-[11px] text-text-muted/55">
          <span className="leading-none">{r.emoji}</span>
          {r.count > 1 && <span>{r.count}</span>}
        </span>
      ))}
    </div>
  );
}

function previewOf(item: Item): { text: string; italic: boolean } | null {
  const text = buildPreview(item.contentMd).slice(0, 140);
  if (text) return { text, italic: false };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tracks = (item.mediaMeta as any)?.tracks;
  const isPlaylist = Array.isArray(tracks) && tracks.length > 0;
  return getContentFallback(item.noteType as NoteType, item.contentMd, isPlaylist);
}

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Panneau « voir tout » d'une période de Souvenirs. Drawer latéral droit sur
 * desktop, plein écran sur mobile. Liste TOUTES les notes de la période ;
 * cliquer sur une note appelle `onOpenEntry` (ouvre le reader, sans changement
 * de route). Échap / clic backdrop ferme.
 */
export function SouvenirsPanel({
  period,
  onClose,
  onOpenEntry,
}: {
  period: Period;
  onClose: () => void;
  onOpenEntry: (id: string) => void;
}) {
  const meta = PERIOD_META[period];
  const { defsById } = useNoteTypeDefs();
  const { data: items = [], isLoading } = trpc.entries.onThisDayPeriod.useQuery(
    { period },
    { staleTime: 60_000, refetchOnWindowFocus: false },
  );

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
    <div className="fixed inset-0 z-[140] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="souvenirs-panel-title"
        className="relative h-full w-full sm:max-w-[440px] bg-bg-primary shadow-2xl flex flex-col animate-slide-in-right outline-none"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-text-muted/10 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: meta.accent }} />
            <div className="min-w-0">
              <h2 id="souvenirs-panel-title" className="font-serif italic text-xl text-text-primary leading-tight truncate">{meta.label}</h2>
              <p className="text-[11px] font-mono tracking-widest uppercase text-text-muted/50">
                Souvenirs · {items.length} note{items.length > 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-9 h-9 rounded-full flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Liste */}
        <div className="overflow-y-auto overscroll-contain flex-1 px-3 py-2">
          {isLoading ? (
            <p className="text-text-muted font-serif italic text-sm px-2 py-4">Chargement…</p>
          ) : items.length === 0 ? (
            <p className="text-text-muted/60 font-serif italic text-sm px-2 py-4">Aucune note pour cette période.</p>
          ) : (
            items.map((item) => {
              const cfg = resolveNoteTypeConfig({ noteType: item.noteType as NoteType, customTypeId: item.customTypeId ?? null }, defsById);
              const displayTitle = item.title || item.mediaMeta?.subject;
              const preview = displayTitle ? null : previewOf(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpenEntry(item.id)}
                  className="w-full text-left px-2.5 py-3 rounded-xl hover:bg-bg-elevated transition-colors group flex items-start gap-3"
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-2" style={{ backgroundColor: cfg.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-[11px] uppercase tracking-widest" style={{ color: cfg.color }}>
                        {cfg.label}
                      </span>
                      <span className="text-[11px] text-text-muted/45 ml-auto shrink-0">{formatDate(item.date)}</span>
                    </div>
                    {displayTitle ? (
                      <p className="text-sm font-medium text-text-primary leading-snug line-clamp-2 group-hover:text-accent transition-colors">
                        {displayTitle}
                      </p>
                    ) : preview ? (
                      <p className={`text-sm leading-snug line-clamp-2 ${preview.italic ? 'text-text-muted/60 italic' : 'text-text-muted/80'}`}>{preview.text}</p>
                    ) : (
                      <p className="text-sm text-text-muted/55 italic">Sans titre</p>
                    )}
                    <SouvenirMeta mood={item.mood} commentCount={item.commentCount} reactions={item.reactions} className="mt-1.5" />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
