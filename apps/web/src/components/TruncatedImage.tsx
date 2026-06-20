import { useState } from 'react';
import { ImageLightbox } from './ImageLightbox';

/**
 * Affiche une image en card-preview : si l'image est très haute (ratio H/L
 * > 1.5), elle est croppée au top avec un dégradé fadeout pour ne pas
 * écraser le layout. Tap → ouvre une lightbox fullscreen où l'image est
 * visible en taille naturelle (scrollable verticalement, lisible).
 *
 * Pourquoi on ne se contente pas de `max-h + object-contain` : sur une
 * image style "screenshot d'une liste de 100 items" (très haute), le
 * `object-contain` la shrink à la taille de la card → texte illisible.
 * Solution : afficher seulement le haut, et garantir que le tap permet de
 * lire le reste sans être contraint par la modale.
 */

const TALL_RATIO = 1.5;

interface Props {
  src: string;
  alt?: string;
  /** Hauteur max de la preview en card. Au-delà l'image est croppée. */
  maxHeightClass?: string;
  /** Classe CSS appliquée au wrapper bouton (rounded, margin…). */
  className?: string;
  /** Largeur max en px définie par l'utilisateur via redimensionnement. */
  width?: number | null;
  /**
   * Ancrage du crop quand l'image est trop haute.
   * - `center` (défaut) : montre le centre — aperçu propre pour une photo.
   * - `top` : montre le haut — utile pour une capture d'écran (lire depuis le début).
   */
  cropPosition?: 'top' | 'center';
  /** Légende affichée sous l'image (texte court). */
  caption?: string;
}

export function TruncatedImage({
  src,
  alt = '',
  maxHeightClass = 'max-h-[70vh]',
  className = '',
  width,
  cropPosition = 'center',
  caption,
}: Props) {
  const [isTall, setIsTall] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  return (
    <>
      <figure className={className} style={{ width: '100%', ...(width ? { maxWidth: `${width}px` } : {}) }}>
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        className="relative block w-full overflow-hidden rounded-xl group"
        aria-label="Agrandir l'image"
      >
        <img
          src={src}
          alt={alt}
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth > 0) {
              setIsTall(img.naturalHeight / img.naturalWidth > TALL_RATIO);
            }
          }}
          className={`block w-full h-auto ${maxHeightClass} ${
            isTall ? `object-cover ${cropPosition === 'center' ? 'object-center' : 'object-top'}` : 'object-contain'
          }`}
        />
        {/* Fade-out + indicateur "tap pour agrandir" — seulement si croppée. */}
        {isTall && (
          <>
            {cropPosition === 'center' && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-bg-primary/70 to-transparent"
              />
            )}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-bg-primary via-bg-primary/60 to-transparent"
            />
            <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg-elevated/95 backdrop-blur text-[11px] text-text-primary shadow-soft border border-text-muted/15">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h6v6" /><path d="M9 21H3v-6" />
                <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
              </svg>
              Image tronquée — taper pour agrandir
            </div>
          </>
        )}
      </button>
        {caption && caption.trim() && (
          <figcaption className="mt-1.5 text-sm text-text-muted/90 text-center italic px-2">{caption}</figcaption>
        )}
      </figure>

      {lightboxOpen && <ImageLightbox src={src} alt={alt} onClose={() => setLightboxOpen(false)} />}
    </>
  );
}
