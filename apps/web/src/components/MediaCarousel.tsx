import { useRef, useState } from 'react';
import { CarouselJumpPopover } from './CarouselJumpPopover';

export type MediaItem =
  | { type: 'image'; src: string; alt?: string; spoiler?: boolean }
  | { type: 'video'; src: string; filename: string; spoiler?: boolean };

interface Props {
  items: MediaItem[];
}

function NavBtn({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tap w-8 h-8 flex items-center justify-center rounded-full bg-text-muted/10 hover:bg-text-muted/20 text-text-muted transition-colors shrink-0"
      aria-label={label}
    >
      {children}
    </button>
  );
}

export function MediaCarousel({ items }: Props) {
  const [active, setActive] = useState(0);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [jumpOpen, setJumpOpen] = useState(false);
  const jumpBtnRef = useRef<HTMLButtonElement>(null);

  if (items.length === 0) return null;

  const reveal = (i: number) => setRevealed((prev) => new Set([...prev, i]));
  const total = items.length;
  const current = items[active]!;
  const isHidden = !!(current.spoiler && !revealed.has(active));

  const prev = () => setActive((a) => (a - 1 + total) % total);
  const next = () => setActive((a) => (a + 1) % total);

  const label = current.type === 'video' ? current.filename : (current.alt ?? '');

  return (
    <div className="space-y-1.5">
      {/* Zone média */}
      <div className="relative rounded-lg overflow-hidden">
        {current.type === 'image' ? (
          <img
            key={active}
            src={current.src}
            alt={current.alt ?? ''}
            className={`w-full max-h-[280px] object-contain bg-black/10 transition-[filter,opacity] duration-300 select-none${isHidden ? ' blur-xl opacity-30 pointer-events-none' : ''}`}
            draggable={false}
          />
        ) : (
          <video
            key={active}
            src={current.src}
            controls={!isHidden}
            preload="metadata"
            className={`video-node-player transition-[filter,opacity] duration-300${isHidden ? ' blur-xl opacity-30 pointer-events-none' : ''}`}
            title={current.filename}
          />
        )}

        {/* Overlay spoiler */}
        {isHidden && (
          <div
            className="absolute inset-0 flex items-center justify-center cursor-pointer"
            onClick={() => reveal(active)}
          >
            <span className="spoiler-img-badge">🙈 Spoiler — toucher pour révéler</span>
          </div>
        )}
      </div>

      {/* Barre de navigation (seulement si plusieurs éléments) */}
      {total > 1 && (
        <>
          <div className="flex items-center gap-2 px-1">
            <NavBtn onClick={prev} label="Précédent">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </NavBtn>

            <span className="flex-1 min-w-0 text-[11px] text-text-muted/70 truncate">
              {label}
            </span>

            <button
              ref={jumpBtnRef}
              type="button"
              onClick={() => setJumpOpen((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={jumpOpen}
              aria-label="Aller à un élément"
              className="text-[11px] text-text-muted/50 hover:text-text-primary shrink-0 tabular-nums rounded px-1 -mx-1 transition-colors cursor-pointer"
            >
              {active + 1} / {total}
            </button>
            {jumpOpen && (
              <CarouselJumpPopover
                count={total}
                activeIndex={active}
                triggerRef={jumpBtnRef}
                onSelect={setActive}
                onClose={() => setJumpOpen(false)}
                renderItem={(i) => {
                  const it = items[i]!;
                  const hidden = !!it.spoiler && !revealed.has(i);
                  if (it.type === 'video') {
                    return <span className="text-sm truncate text-text-muted block">🎬 {it.filename}</span>;
                  }
                  return (
                    <span className="flex items-center gap-2">
                      {hidden ? (
                        <span className="w-8 h-8 rounded bg-text-muted/15 flex items-center justify-center text-xs shrink-0">🙈</span>
                      ) : (
                        <img src={it.src} alt="" className="w-8 h-8 rounded object-cover shrink-0" loading="lazy" />
                      )}
                      <span className="text-sm truncate text-text-muted">{hidden ? 'Spoiler' : (it.alt || `Image ${i + 1}`)}</span>
                    </span>
                  );
                }}
              />
            )}

            <NavBtn onClick={next} label="Suivant">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </NavBtn>
          </div>

          {/* Points — visuel w-1.5 dans un bouton paddé (cible tactile élargie sans
              chevauchement, cf. COLL-03). */}
          {total <= 10 && (
            <div className="flex items-center justify-center gap-0.5">
              {items.map((item, i) => {
                const isSpoilerHidden = item.spoiler && !revealed.has(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActive(i)}
                    aria-label={`Élément ${i + 1}`}
                    className="p-1.5 rounded-full flex items-center justify-center"
                  >
                    <span className={[
                      'block w-1.5 h-1.5 rounded-full transition-all',
                      i === active
                        ? 'bg-accent scale-125'
                        : isSpoilerHidden
                        ? 'bg-transparent ring-1 ring-text-muted/50'
                        : 'bg-text-muted/30',
                    ].join(' ')} />
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
