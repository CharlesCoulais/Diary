export type EmbedPlatform = 'youtube' | 'spotify' | 'soundcloud' | 'deezer';

export interface EmbedInfo {
  platform: EmbedPlatform;
  embedUrl: string;
  height: number;
  videoId?: string;
  originalUrl: string;
}

export function parseEmbedUrl(url: string): EmbedInfo | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, '');

    // YouTube
    if (host === 'youtube.com' || host === 'youtu.be') {
      let videoId: string | null | undefined = null;
      if (host === 'youtu.be') {
        videoId = u.pathname.slice(1);
      } else {
        videoId = u.searchParams.get('v');
        if (!videoId && u.pathname.startsWith('/shorts/')) {
          videoId = u.pathname.split('/shorts/')[1];
        }
      }
      if (!videoId) return null;
      return {
        platform: 'youtube',
        embedUrl: `https://www.youtube.com/embed/${videoId}?rel=0`,
        height: 220,
        videoId,
        originalUrl: url,
      };
    }

    // Spotify
    if (host === 'open.spotify.com') {
      const embedPath = u.pathname.replace(/^\/intl-[a-z]+\//, '/');
      return {
        platform: 'spotify',
        embedUrl: `https://open.spotify.com/embed${embedPath}?utm_source=generator&theme=0`,
        height: 80,
        originalUrl: url,
      };
    }

    // SoundCloud
    if (host === 'soundcloud.com') {
      return {
        platform: 'soundcloud',
        embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23a89080&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false`,
        height: 120,
        originalUrl: url,
      };
    }

    // Deezer
    if (host === 'deezer.com') {
      const match = u.pathname.match(/^\/(track|album|playlist)\/(\d+)/);
      if (!match) return null;
      return {
        platform: 'deezer',
        embedUrl: `https://widget.deezer.com/widget/dark/${match[1]}/${match[2]}`,
        height: 92,
        originalUrl: url,
      };
    }

    return null;
  } catch {
    return null;
  }
}
