import { useRef, useState } from 'react';
import { TruncatedImage } from './TruncatedImage';
import { CarouselJumpPopover } from './CarouselJumpPopover';

/**
 * Galerie pour N images consécutives dans une note (>= 2).
 *
 * UX : une image principale en grand au centre (qui hérite du
 * comportement TruncatedImage : crop + tap pour zoom lightbox), une
 * rangée de miniatures horizontale en dessous, navigation par flèches
 * gauche/droite, compteur de position.
 *
 * Évite d'empiler 8 images les unes en dessous des autres en lecture
 * quand l'utilisateur poste un carrousel de captures ou photos d'un événement.
 */

interface GalleryItem {
  src: string;
  alt?: string;
}

interface Props {
  items: GalleryItem[];
}

export function ImageGallery({ items }: Props) {
  const [index, setIndex] = useState(0);
  const [jumpOpen, setJumpOpen] = useState(false);
  const jumpBtnRef = useRef<HTMLButtonElement>(null);
  if (items.length === 0) return null;
  const safeIndex = Math.min(index, items.length - 1);
  const active = items[safeIndex]!;

  const prev = () => setIndex((safeIndex - 1 + items.length) % items.length);
  const next = () => setIndex((safeIndex + 1) % items.length);

  return (
    <div className="my-3 rounded-2xl bg-bg-primary/40 border border-text-muted/10 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-text-muted/8 bg-bg-elevated/60">
        <span className="text-xs font-medium text-text-muted">
          🖼 {items.length} image{items.length > 1 ? 's' : ''}
        </span>
        <button
          ref={jumpBtnRef}
          type="button"
          onClick={() => setJumpOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={jumpOpen}
          aria-label="Aller à une image"
          className="text-[11px] tabular-nums text-text-muted/60 hover:text-text-primary rounded px-1 -mx-1 transition-colors cursor-pointer"
        >
          {safeIndex + 1} / {items.length}
        </button>
        {jumpOpen && (
          <CarouselJumpPopover
            count={items.length}
            activeIndex={safeIndex}
            triggerRef={jumpBtnRef}
            onSelect={setIndex}
            onClose={() => setJumpOpen(false)}
            renderItem={(i) => (
              <span className="flex items-center gap-2">
                <img src={items[i]!.src} alt="" className="w-8 h-8 rounded object-cover shrink-0" loading="lazy" />
                <span className="text-sm truncate text-text-muted">{items[i]!.alt || `Image ${i + 1}`}</span>
              </span>
            )}
          />
        )}
      </div>

      {/* Image principale + flèches de navigation. La TruncatedImage gère
          déjà la lightbox au tap → on ne ré-implémente pas le zoom ici. */}
      <div className="relative">
        <TruncatedImage
          key={active.src}
          src={active.src}
          alt={active.alt ?? ''}
          maxHeightClass="max-h-[70vh]"
          cropPosition="center"
        />
        {items.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); prev(); }}
              aria-label="Image précédente"
              className="tap-abs absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-bg-elevated/90 backdrop-blur shadow-soft border border-text-muted/15 flex items-center justify-center text-text-primary hover:bg-bg-elevated transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); next(); }}
              aria-label="Image suivante"
              className="tap-abs absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-bg-elevated/90 backdrop-blur shadow-soft border border-text-muted/15 flex items-center justify-center text-text-primary hover:bg-bg-elevated transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Légende de l'image active (champ `alt`) — sous l'image, au-dessus des miniatures. */}
      {active.alt?.trim() && (
        <figcaption className="px-4 py-2 text-sm text-text-muted text-center italic border-t border-text-muted/8 bg-bg-elevated/40">
          {active.alt}
        </figcaption>
      )}

      {/* Miniatures — rangée horizontale scrollable. Hidden si une seule image
          (cas borderline, on filtre déjà N < 2 côté pré-traitement). */}
      {items.length > 1 && (
        <div className="flex gap-1.5 px-3 py-2 overflow-x-auto hide-scrollbar bg-bg-elevated/40 border-t border-text-muted/8">
          {items.map((item, i) => {
            const isActive = i === safeIndex;
            return (
              <button
                key={`${item.src}-${i}`}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Image ${i + 1}`}
                aria-current={isActive ? 'true' : undefined}
                className={`shrink-0 relative w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                  isActive
                    ? 'border-accent scale-105'
                    : 'border-transparent opacity-60 hover:opacity-100'
                }`}
              >
                <img
                  src={item.src}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
