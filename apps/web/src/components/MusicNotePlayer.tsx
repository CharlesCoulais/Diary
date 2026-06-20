import { useEffect, useRef, useState } from 'react';
import type { MediaMeta, MediaTrack } from '../lib/db/schema';
import { getTracks, isPlaylist } from '../lib/musicTracks';
import { MediaPlayer } from './MediaPlayer';
import { CarouselJumpPopover } from './CarouselJumpPopover';

interface MusicNotePlayerProps {
  meta: MediaMeta | null | undefined;
  /** Variante compacte (preview dans EntryCard). */
  compact?: boolean;
  /** Index initial du morceau actif (utile pour ouvrir une track précise depuis Collection). */
  initialIndex?: number;
  /** Cache l'iframe player (utile en preview côté confident : nav entre tracks visible mais pas de lecture). */
  hidePlayer?: boolean;
}

/**
 * Affiche les morceaux d'une note MUSIC : player + paroles éventuelles.
 *
 * Mono (legacy) : pas d'en-tête (l'EntryCard rend déjà cover/titre/artiste), juste le `MediaPlayer`
 *   + une section paroles dépliable si la note en contient.
 * Playlist (`tracks` >= 1) : en-tête (cover/playlistName/titre/artiste de la track active) avec
 *   contrôles ‹ N/M ›, swipe gauche/droite, player de la track active, paroles dépliables.
 */
export function MusicNotePlayer({ meta, compact = false, initialIndex, hidePlayer = false }: MusicNotePlayerProps) {
  const tracks = getTracks(meta);
  const playlist = isPlaylist(meta);
  const [index, setIndex] = useState(initialIndex ?? 0);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [lyricsTab, setLyricsTab] = useState<'original' | 'translation'>('original');
  const [jumpOpen, setJumpOpen] = useState(false);
  const jumpBtnRef = useRef<HTMLButtonElement>(null);

  // Si l'index sort des bornes (track supprimée en édition), on resette
  useEffect(() => {
    if (index >= tracks.length) setIndex(Math.max(0, tracks.length - 1));
  }, [tracks.length, index]);

  // Reset onglet paroles quand on change de morceau
  useEffect(() => { setLyricsTab('original'); }, [index]);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    touchStartX.current = t.clientX;
    touchStartY.current = t.clientY;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    if (!t || touchStartX.current === null || touchStartY.current === null) return;
    const dx = t.clientX - touchStartX.current;
    const dy = t.clientY - touchStartY.current;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0 && index < tracks.length - 1) setIndex(index + 1);
      else if (dx > 0 && index > 0) setIndex(index - 1);
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  if (tracks.length === 0) return null;

  const safeIndex = Math.min(index, tracks.length - 1);
  const active = tracks[safeIndex] ?? {};

  return (
    <div
      className={compact ? 'mt-2' : 'mt-3'}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* En-tête (playlist uniquement — pour mono, l'EntryCard rend déjà cover/titre) */}
      {playlist && (
        <div className="flex gap-3 items-start mb-2">
          {active.coverUrl && (
            <img
              src={active.coverUrl}
              alt=""
              className={`${compact ? 'h-14' : 'h-16'} w-auto rounded object-cover shrink-0 shadow-sm`}
            />
          )}
          <div className="flex-1 min-w-0">
            {meta?.playlistName && (
              <p className={`text-text-muted/60 ${compact ? 'text-[11px]' : 'text-xs'} uppercase tracking-wide truncate`}>
                {meta.playlistName}
              </p>
            )}
            {active.subject && (
              <p className="text-text-primary font-medium text-sm truncate">{active.subject}</p>
            )}
            {active.trackTitle && (
              <p className={`text-text-muted ${compact ? 'text-[11px]' : 'text-xs'} truncate`}>
                {active.trackTitle}
              </p>
            )}
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {active.creator && (
                <span className={`text-text-muted ${compact ? 'text-[11px]' : 'text-xs'} truncate`}>
                  {active.creator}
                </span>
              )}
              {active.rating && (
                <span className="text-xs text-accent">
                  {'★'.repeat(active.rating)}{'☆'.repeat(5 - active.rating)}
                </span>
              )}
            </div>
          </div>

          {/* Contrôles nav */}
          <div className="flex items-center gap-1 shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setIndex(Math.max(0, safeIndex - 1))}
              disabled={safeIndex === 0}
              aria-label="Morceau précédent"
              className="p-1 rounded-md text-text-muted hover:text-text-primary disabled:opacity-25 disabled:hover:text-text-muted transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <button
              ref={jumpBtnRef}
              type="button"
              onClick={() => setJumpOpen((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={jumpOpen}
              aria-label="Aller à un morceau"
              className={`${compact ? 'text-[11px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'} bg-text-muted/10 hover:bg-text-muted/20 text-text-muted font-medium tabular-nums rounded-full transition-colors cursor-pointer`}
            >
              {safeIndex + 1}<span className="opacity-50">/{tracks.length}</span>
            </button>
            {jumpOpen && (
              <CarouselJumpPopover
                count={tracks.length}
                activeIndex={safeIndex}
                triggerRef={jumpBtnRef}
                onSelect={setIndex}
                onClose={() => setJumpOpen(false)}
                renderItem={(i) => (
                  <span className="text-sm truncate block">{tracks[i]?.subject || 'Sans titre'}</span>
                )}
              />
            )}
            <button
              type="button"
              onClick={() => setIndex(Math.min(tracks.length - 1, safeIndex + 1))}
              disabled={safeIndex === tracks.length - 1}
              aria-label="Morceau suivant"
              className="p-1 rounded-md text-text-muted hover:text-text-primary disabled:opacity-25 disabled:hover:text-text-muted transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        </div>
      )}

      {/* Player (caché en mode preview confident) */}
      {!hidePlayer && (active.streamUrl ? (
        <MediaPlayer key={`${safeIndex}-${active.streamUrl}`} url={active.streamUrl} />
      ) : playlist ? (
        <p className="text-xs text-text-muted/50 italic">Pas de lien pour ce morceau</p>
      ) : null)}

      {/* Indicateur de position (playlist) */}
      {playlist && (tracks.length <= 10 ? (
        /* Dots cliquables pour les petites playlists */
        <div className="flex items-center justify-center gap-1 mt-2.5" onClick={(e) => e.stopPropagation()}>
          {tracks.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Morceau ${i + 1}`}
              className={`rounded-full transition-all duration-200 ${
                i === safeIndex
                  ? 'w-4 h-1.5 bg-text-primary/60'
                  : 'w-1.5 h-1.5 bg-text-muted/25 hover:bg-text-muted/50'
              }`}
            />
          ))}
        </div>
      ) : (
        /* Barre de progression pour les grandes playlists */
        <div className="mt-2.5 px-1" onClick={(e) => e.stopPropagation()}>
          <div className="h-1 w-full bg-text-muted/15 rounded-full overflow-hidden">
            <div
              className="h-full bg-text-muted/50 rounded-full transition-all duration-300"
              style={{ width: `${((safeIndex + 1) / tracks.length) * 100}%` }}
            />
          </div>
        </div>
      ))}

      {/* Paroles */}
      <LyricsSection track={active} open={lyricsOpen} setOpen={setLyricsOpen} tab={lyricsTab} setTab={setLyricsTab} />
    </div>
  );
}

function LyricsSection({
  track,
  open,
  setOpen,
  tab,
  setTab,
}: {
  track: MediaTrack;
  open: boolean;
  setOpen: (v: boolean) => void;
  tab: 'original' | 'translation';
  setTab: (v: 'original' | 'translation') => void;
}) {
  const hasOriginal = !!track.lyrics?.trim();
  const hasTranslation = !!track.lyricsTranslation?.trim();
  if (!hasOriginal && !hasTranslation) return null;

  const visibleTab = tab === 'translation' && !hasTranslation ? 'original' : tab === 'original' && !hasOriginal ? 'translation' : tab;
  const content = visibleTab === 'translation' ? track.lyricsTranslation : track.lyrics;

  return (
    <div className="mt-3" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-text-muted hover:text-text-primary transition-colors text-xs"
      >
        <span className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
        <span>Paroles</span>
        {hasOriginal && hasTranslation && <span className="text-text-muted/55">· original + traduction</span>}
        {hasOriginal && !hasTranslation && <span className="text-text-muted/55">· original</span>}
        {!hasOriginal && hasTranslation && <span className="text-text-muted/55">· traduction</span>}
      </button>
      {open && (
        <div className="mt-2 rounded-lg bg-bg-primary/40 border border-text-muted/10 overflow-hidden">
          {hasOriginal && hasTranslation && (
            <div className="flex border-b border-text-muted/10">
              <button
                type="button"
                onClick={() => setTab('original')}
                className={`flex-1 py-1.5 text-xs font-medium transition-colors ${visibleTab === 'original' ? 'text-accent bg-accent/5' : 'text-text-muted hover:text-text-primary'}`}
              >
                Original
              </button>
              <button
                type="button"
                onClick={() => setTab('translation')}
                className={`flex-1 py-1.5 text-xs font-medium transition-colors ${visibleTab === 'translation' ? 'text-accent bg-accent/5' : 'text-text-muted hover:text-text-primary'}`}
              >
                Traduction
              </button>
            </div>
          )}
          <pre className="text-xs text-text-primary/90 whitespace-pre-wrap leading-relaxed font-sans px-3 py-2 max-h-[40vh] overflow-y-auto scrollbar-soft">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}
