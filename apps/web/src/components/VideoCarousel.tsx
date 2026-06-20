import { useRef, useState } from 'react';
import { CarouselJumpPopover } from './CarouselJumpPopover';

interface VideoItem {
  src: string;
  filename: string;
  spoiler?: boolean;
}

interface Props {
  items: VideoItem[];
}

function SpoilerVideo({ src, filename, onReveal }: { src: string; filename: string; onReveal: () => void }) {
  return (
    <div
      className="spoiler-img cursor-pointer"
      onClick={onReveal}
      style={{ display: 'block' }}
    >
      <video
        src={src}
        preload="metadata"
        className="video-node-player"
        style={{ filter: 'blur(18px)', opacity: 0.3, pointerEvents: 'none' }}
        title={filename}
      />
      <div className="spoiler-img-label">
        <span className="spoiler-img-badge">🙈 Spoiler — toucher pour révéler</span>
      </div>
    </div>
  );
}

export function VideoCarousel({ items }: Props) {
  const [active, setActive] = useState(0);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [jumpOpen, setJumpOpen] = useState(false);
  const jumpBtnRef = useRef<HTMLButtonElement>(null);

  if (items.length === 0) return null;

  const reveal = (i: number) => setRevealed((prev) => new Set([...prev, i]));

  // Vidéo unique — rendu simple, pas de navigation
  if (items.length === 1) {
    const v = items[0]!;
    if (v.spoiler && !revealed.has(0)) {
      return <SpoilerVideo src={v.src} filename={v.filename} onReveal={() => reveal(0)} />;
    }
    return (
      <video
        src={v.src}
        controls
        preload="metadata"
        className="video-node-player"
        title={v.filename}
      />
    );
  }

  // Plusieurs vidéos — carousel avec navigation
  const current = items[active]!;
  const total = items.length;

  const prev = () => setActive((a) => (a - 1 + total) % total);
  const next = () => setActive((a) => (a + 1) % total);

  const isSpoilerHidden = current.spoiler && !revealed.has(active);

  return (
    <div className="space-y-1.5">
      {/* Lecteur actif */}
      {isSpoilerHidden ? (
        <SpoilerVideo
          src={current.src}
          filename={current.filename}
          onReveal={() => reveal(active)}
        />
      ) : (
        <video
          key={active}
          src={current.src}
          controls
          preload="metadata"
          className="video-node-player"
          title={current.filename}
        />
      )}

      {/* Barre de navigation */}
      <div className="flex items-center gap-2 px-1">
        <button
          type="button"
          onClick={prev}
          className="tap w-8 h-8 flex items-center justify-center rounded-full bg-text-muted/10 hover:bg-text-muted/20 text-text-muted transition-colors shrink-0"
          aria-label="Vidéo précédente"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <span className="flex-1 min-w-0 text-[11px] text-text-muted/70 truncate flex items-center gap-1">
          {current.spoiler && (
            <span className="text-[11px] opacity-60">🙈</span>
          )}
          {current.filename}
        </span>

        <button
          ref={jumpBtnRef}
          type="button"
          onClick={() => setJumpOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={jumpOpen}
          aria-label="Aller à une vidéo"
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
              return <span className="text-sm truncate text-text-muted block">{hidden ? '🙈 ' : '🎬 '}{it.filename}</span>;
            }}
          />
        )}

        <button
          type="button"
          onClick={next}
          className="tap w-8 h-8 flex items-center justify-center rounded-full bg-text-muted/10 hover:bg-text-muted/20 text-text-muted transition-colors shrink-0"
          aria-label="Vidéo suivante"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Points de navigation */}
      {total <= 10 && (
        <div className="flex justify-center gap-0.5">
          {items.map((item, i) => {
            const hidden = item.spoiler && !revealed.has(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => setActive(i)}
                className="p-1.5 rounded-full flex items-center justify-center leading-none"
                aria-label={`Vidéo ${i + 1}`}
              >
                {hidden ? (
                  <span className="text-[8px] leading-none">🙈</span>
                ) : (
                  <span className={`block w-1.5 h-1.5 rounded-full transition-all ${i === active ? 'bg-accent scale-125' : 'bg-text-muted/30'}`} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
