import { useMemo, useState } from 'react';
import { parseEmbedUrl } from '../lib/mediaEmbed';

const PLATFORM_LABEL: Record<string, string> = {
  youtube:    'YouTube',
  spotify:    'Spotify',
  soundcloud: 'SoundCloud',
  deezer:     'Deezer',
};

interface MediaPlayerProps {
  url: string;
}

function YouTubePlayer({ videoId, embedUrl, originalUrl }: { videoId: string; embedUrl: string; originalUrl: string }) {
  const [playing, setPlaying] = useState(false);
  const thumb = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  if (playing) {
    return (
      <div className="relative aspect-video">
        <iframe
          src={`${embedUrl}&autoplay=1`}
          frameBorder="0"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          className="absolute inset-0 w-full h-full block"
          title="YouTube player"
        />
      </div>
    );
  }

  return (
    <div className="relative aspect-video cursor-pointer" onClick={() => setPlaying(true)}>
      <img src={thumb} alt="YouTube" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors">
        <svg viewBox="0 0 68 48" className="w-16 h-12">
          <path d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55c-2.93.78-4.63 3.26-5.42 6.19C.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z" fill="#f00"/>
          <path d="M45 24 27 14v20" fill="#fff"/>
        </svg>
      </div>
      <a
        href={originalUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-2 right-2 text-xs text-white/80 hover:text-white bg-black/50 px-2 py-1 rounded"
      >
        Ouvrir sur YouTube ↗
      </a>
    </div>
  );
}

export function MediaPlayer({ url }: MediaPlayerProps) {
  const embed = useMemo(() => parseEmbedUrl(url), [url]);

  if (!embed) return null;

  if (embed.platform === 'youtube' && embed.videoId) {
    return (
      <div className="mt-3 rounded-xl overflow-hidden max-w-lg mx-auto">
        <YouTubePlayer videoId={embed.videoId} embedUrl={embed.embedUrl} originalUrl={embed.originalUrl} />
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl overflow-hidden w-full max-w-lg mx-auto">
      <iframe
        src={embed.embedUrl}
        width="100%"
        height={embed.height}
        frameBorder="0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        title={`${PLATFORM_LABEL[embed.platform] ?? embed.platform} player`}
        className="block w-full max-w-full"
        style={{ minWidth: 0 }}
      />
    </div>
  );
}
