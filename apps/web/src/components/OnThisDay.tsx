import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { resolveNoteTypeConfig } from './NoteTypePicker';
import type { NoteType } from './NoteTypePicker';
import { useNoteTypeDefs } from '../lib/useNoteTypeDefs';
import { buildPreview, getContentFallback } from './CompactEntryCard';
import { SouvenirsPanel, SouvenirMeta, PERIOD_META, type Period } from './SouvenirsPanel';
import { SouvenirReaderModal } from './SouvenirReaderModal';
import { useCollapsibleSection } from '../hooks/useCollapsibleSection';

/** Aperçu texte + fallback média (« Photo », « Vidéo », « Playlist »…), cohérent
 *  avec les cartes compactes. Renvoie { text, italic } ou null. */
function previewOf(item: { contentMd: string; noteType: string; mediaMeta: { subject?: string } | null }): { text: string; italic: boolean } | null {
  const text = buildPreview(item.contentMd).slice(0, 120);
  if (text) return { text, italic: false };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tracks = (item.mediaMeta as any)?.tracks;
  const isPlaylist = Array.isArray(tracks) && tracks.length > 0;
  return getContentFallback(item.noteType as NoteType, item.contentMd, isPlaylist);
}

type Item = {
  period: string;
  totalForDate: number;
  id: string;
  title: string | null;
  date: string;
  contentMd: string;
  mood: string | null;
  noteType: string;
  customTypeId?: string | null;
  mediaMeta: { subject?: string } | null;
  commentCount: number;
  reactions: { emoji: string; count: number }[];
};

const PERIOD_ORDER: Period[] = ['week', 'month', 'year'];

function randomSeed(): string {
  return Math.floor(Math.random() * 1_000_000_000).toString(36);
}

export function OnThisDay({ variant = 'list' }: { variant?: 'list' | 'cards' }) {
  const { defsById } = useNoteTypeDefs();
  // Repli persistant (localStorage, par navigateur) : le confident peut masquer
  // le bloc et le garder masqué à chaque visite. `showAll` (éphémère) déplie la
  // liste complète depuis l'aperçu « un seul souvenir + bouton plus ».
  const [collapsed, toggleCollapsed] = useCollapsibleSection('souvenirs-onthisday');
  const [showAll, setShowAll] = useState(false);
  // Seed tirée une fois au montage → échantillon aléatoire stable pendant la
  // visite, renouvelé à chaque rechargement de la page (ou via « 🔀 »).
  const [seed, setSeed] = useState(randomSeed);
  const [panelPeriod, setPanelPeriod] = useState<Period | null>(null);
  const [readerId, setReaderId] = useState<string | null>(null);

  const { data: items = [], isLoading } = trpc.entries.onThisDay.useQuery(
    { seed, limit: 5 },
    { staleTime: 5 * 60_000, refetchOnWindowFocus: false },
  );

  // Modals/panneaux montés même si la section est masquée, pour rester ouverts
  // pendant un éventuel refetch.
  const overlays = (
    <>
      {panelPeriod && (
        <SouvenirsPanel
          period={panelPeriod}
          onClose={() => setPanelPeriod(null)}
          onOpenEntry={(id) => setReaderId(id)}
        />
      )}
      {readerId && (
        <SouvenirReaderModal
          entryId={readerId}
          onClose={() => setReaderId(null)}
          zClass={panelPeriod ? 'z-[160]' : 'z-[150]'}
        />
      )}
    </>
  );

  if (isLoading || items.length === 0) return overlays;

  const groups = new Map<Period, Item[]>();
  for (const item of items) {
    const period = item.period as Period;
    if (!groups.has(period)) groups.set(period, []);
    groups.get(period)!.push(item);
  }
  const periods = PERIOD_ORDER.filter((p) => groups.has(p));
  if (periods.length === 0) return overlays;

  const reshuffle = () => setSeed(randomSeed());

  // ── Variante cards (desktop) ──────────────────────────────────────────────
  if (variant === 'cards') {
    return (
      <section className="mb-8">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-serif italic text-2xl text-text-primary">Souvenirs</h2>
          <button
            type="button"
            onClick={reshuffle}
            className="text-sm text-text-muted/50 hover:text-accent transition-colors flex items-center gap-1.5"
            title="Tirer d'autres souvenirs au hasard"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" />
            </svg>
            Mélanger
          </button>
        </div>

        <div className="space-y-5">
          {periods.map((period) => {
            const periodItems = groups.get(period)!;
            const meta = PERIOD_META[period];
            const total = periodItems[0]!.totalForDate;
            const hidden = total - periodItems.length;

            return (
              <div key={period}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: meta.accent }} />
                  <span className="font-mono text-[11px] uppercase tracking-widest font-medium" style={{ color: meta.accent }}>
                    {meta.label}
                  </span>
                  {hidden > 0 && (
                    <button
                      type="button"
                      onClick={() => setPanelPeriod(period)}
                      className="ml-auto text-xs text-text-muted/45 hover:text-accent transition-colors"
                    >
                      voir tout ({total}) →
                    </button>
                  )}
                </div>

                <div className="flex gap-2.5 overflow-x-auto pb-2 hide-scrollbar">
                  {periodItems.map((item) => {
                    const cfg = resolveNoteTypeConfig({ noteType: item.noteType as NoteType, customTypeId: item.customTypeId ?? null }, defsById);
                    const displayTitle = item.title || item.mediaMeta?.subject;
                    const preview = displayTitle ? null : previewOf(item);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setReaderId(item.id)}
                        className="shrink-0 w-52 rounded-2xl bg-bg-elevated p-4 text-left hover:bg-text-muted/8 transition-colors flex flex-col border-l-2"
                        style={{ borderLeftColor: meta.accent }}
                      >
                        <span
                          className="font-mono text-[11px] uppercase tracking-widest font-medium truncate mb-2.5"
                          style={{ color: cfg.color }}
                        >
                          {cfg.label}
                        </span>
                        {displayTitle ? (
                          <p className="font-serif text-sm font-medium text-text-primary leading-snug line-clamp-3">
                            {displayTitle}
                          </p>
                        ) : preview ? (
                          <p className={`text-xs leading-relaxed line-clamp-3 ${preview.italic ? 'text-text-muted/60 italic' : 'text-text-muted/80'}`}>{preview.text}</p>
                        ) : (
                          <p className="text-xs text-text-muted/55 italic">Sans titre</p>
                        )}
                        <SouvenirMeta mood={item.mood} commentCount={item.commentCount} reactions={item.reactions} className="mt-auto pt-2.5" />
                      </button>
                    );
                  })}

                  {hidden > 0 && (
                    <button
                      type="button"
                      onClick={() => setPanelPeriod(period)}
                      className="shrink-0 w-32 rounded-2xl border border-dashed border-text-muted/20 p-4 text-center hover:border-accent/40 hover:text-accent text-text-muted/50 transition-colors flex flex-col items-center justify-center gap-1"
                    >
                      <span className="text-lg leading-none">+{hidden}</span>
                      <span className="text-[11px]">voir tout</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {overlays}
      </section>
    );
  }

  // ── Variante list (mobile, défaut) ────────────────────────────────────────
  // Aperçu compact : un seul souvenir (le plus récent disponible) + un bouton
  // « plus » qui déplie la liste complète. Réduit fortement la hauteur du bloc
  // tout en gardant l'accès à l'ensemble.
  const flatItems = periods.flatMap((p) => groups.get(p)!.map((it) => ({ it, period: p })));
  const grandTotal = periods.reduce((sum, p) => sum + groups.get(p)![0]!.totalForDate, 0);
  const featured = flatItems[0]!;
  const extra = grandTotal - 1;

  // Ligne d'un souvenir — partagée entre l'aperçu et la liste dépliée.
  const renderRow = (item: Item, withTopBorder: boolean) => {
    const cfg = resolveNoteTypeConfig({ noteType: item.noteType as NoteType, customTypeId: item.customTypeId ?? null }, defsById);
    const displayTitle = item.title || item.mediaMeta?.subject;
    const preview = displayTitle ? null : previewOf(item);
    return (
      <>
        {withTopBorder && <div className="h-px bg-text-muted/[0.10] mx-4" />}
        <button
          type="button"
          onClick={() => setReaderId(item.id)}
          className="w-full text-left px-4 py-2.5 hover:bg-bg-primary/40 transition-colors group"
        >
          <div className="flex items-start gap-2.5">
            <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: cfg.color }} />
            <div className="flex-1 min-w-0">
              <span className="font-mono text-[11px] uppercase tracking-widest" style={{ color: cfg.color }}>
                {cfg.label}
              </span>
              {displayTitle ? (
                <p className="text-sm font-medium text-text-primary truncate group-hover:text-accent transition-colors">
                  {displayTitle}
                </p>
              ) : preview ? (
                <p className={`text-sm truncate ${preview.italic ? 'text-text-muted/60 italic' : 'text-text-muted/80'}`}>{preview.text}</p>
              ) : (
                <p className="text-sm text-text-muted/55 italic truncate">Sans titre</p>
              )}
              <SouvenirMeta mood={item.mood} commentCount={item.commentCount} reactions={item.reactions} className="mt-1" />
            </div>
          </div>
        </button>
      </>
    );
  };

  return (
    // Panneau plat, sans ombre et avec liseré complet — délibérément distinct des
    // cartes d'articles (bg-bg-elevated + shadow-soft + border-l coloré).
    <section className="rounded-2xl border border-text-muted/[0.14] bg-text-muted/[0.035] mb-6 overflow-hidden">
      {/* En-tête éditorial (serif italic + ✦) — autre registre que les cartes */}
      <div className="w-full flex items-center justify-between pl-4 pr-2 py-2.5">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          className="flex items-center gap-2 flex-1 text-left min-w-0"
        >
          <span className="text-accent/45 text-[13px] leading-none" aria-hidden>✦</span>
          <span className="font-serif italic text-[15px] text-text-primary leading-none">Souvenirs</span>
          {collapsed && grandTotal > 0 && (
            <span className="font-mono text-[11px] text-text-muted/55 tabular-nums">{grandTotal}</span>
          )}
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={`text-text-muted/45 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {!collapsed && (
          <button
            type="button"
            onClick={reshuffle}
            aria-label="Mélanger les souvenirs"
            className="p-1.5 text-text-muted/55 hover:text-accent transition-colors shrink-0"
            title="Tirer d'autres souvenirs au hasard"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Aperçu replié : un seul souvenir + bouton « plus » ───────────────── */}
      {!collapsed && !showAll && (
        <div className="border-t border-text-muted/[0.10]">
          <div className="flex items-center gap-2 px-4 pt-2.5 pb-0.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PERIOD_META[featured.period].accent }} />
            <span className="font-mono text-[11px] uppercase tracking-widest font-medium" style={{ color: PERIOD_META[featured.period].accent }}>
              {PERIOD_META[featured.period].label}
            </span>
          </div>
          {renderRow(featured.it, false)}
          {extra > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2 border-t border-text-muted/[0.08] text-[12px] text-text-muted/55 hover:text-accent transition-colors"
            >
              + {extra} autre{extra > 1 ? 's' : ''} souvenir{extra > 1 ? 's' : ''}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* ── Liste complète (dépliée) ────────────────────────────────────────── */}
      {!collapsed && showAll && (
        <div className="border-t border-text-muted/[0.10]">
          {periods.map((period, pi) => {
            const periodItems = groups.get(period)!;
            const meta = PERIOD_META[period];
            const total = periodItems[0]!.totalForDate;
            const hidden = total - periodItems.length;
            return (
              <div key={period}>
                {/* En-tête de période, coloré */}
                <div className={`flex items-center gap-2 px-4 pt-3 pb-1.5 ${pi > 0 ? 'border-t border-text-muted/[0.08] mt-1' : ''}`}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: meta.accent }} />
                  <span className="font-mono text-[11px] uppercase tracking-widest font-medium" style={{ color: meta.accent }}>
                    {meta.label}
                  </span>
                  {hidden > 0 && (
                    <button
                      type="button"
                      onClick={() => setPanelPeriod(period)}
                      className="ml-auto text-[11px] text-text-muted/45 hover:text-accent transition-colors"
                    >
                      voir tout ({total}) →
                    </button>
                  )}
                </div>
                {periodItems.map((item, ii) => (
                  <div key={item.id}>{renderRow(item, ii > 0)}</div>
                ))}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2 border-t border-text-muted/[0.10] text-[12px] text-text-muted/55 hover:text-accent transition-colors"
          >
            Réduire
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rotate-180">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      )}
      {overlays}
    </section>
  );
}
