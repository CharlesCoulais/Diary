import { useEffect, useRef, useState } from 'react';

function formatTime(s: number): string {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

interface AudioPlayerProps {
  src: string;
  filename?: string;
  /** Auto-play à l'apparition (utile pour le passage à la piste suivante dans une playlist). */
  autoPlay?: boolean;
  /** Callback déclenché à la fin de la piste — utilisé par BulkAudioPlayer pour enchaîner. */
  onEnded?: () => void;
}

export function AudioPlayer({ src, filename, autoPlay = false, onEnded }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [dragging, setDragging] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  const displayName = filename ?? src.split('/').pop() ?? 'Audio';

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => { if (!dragging) setCurrentTime(el.currentTime); };
    const onDur = () => setDuration(el.duration);
    const onEnd = () => { setPlaying(false); onEnded?.(); };
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onDur);
    el.addEventListener('durationchange', onDur);
    el.addEventListener('ended', onEnd);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onDur);
      el.removeEventListener('durationchange', onDur);
      el.removeEventListener('ended', onEnd);
    };
  }, [dragging, onEnded]);

  // Auto-play à l'arrivée d'une nouvelle source (changement de piste dans
  // BulkAudioPlayer notamment). Sans interaction utilisateur, certains
  // navigateurs vont refuser silencieusement le play() — mais avec un click
  // sur "piste suivante" l'autoplay est généralement autorisé.
  useEffect(() => {
    if (!autoPlay) return;
    const el = audioRef.current;
    if (!el) return;
    el.play().then(() => setPlaying(true)).catch(() => { /* gesture required */ });
  }, [src, autoPlay]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { el.play().then(() => setPlaying(true)).catch(() => {}); }
  };

  const seekTo = (clientX: number) => {
    const bar = barRef.current;
    const el = audioRef.current;
    if (!bar || !el || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const t = ratio * duration;
    el.currentTime = t;
    setCurrentTime(t);
  };

  const handleVolume = (v: number) => {
    const el = audioRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(1, v));
    el.volume = clamped;
    el.muted = clamped === 0;
    setVolume(clamped);
    setMuted(clamped === 0);
  };

  const toggleMute = () => {
    const el = audioRef.current;
    if (!el) return;
    if (muted) {
      const restored = volume === 0 ? 1 : volume;
      el.muted = false;
      el.volume = restored;
      setMuted(false);
      setVolume(restored);
    } else {
      el.muted = true;
      setMuted(true);
    }
  };

  const progress = duration > 0 ? currentTime / duration : 0;
  const displayVolume = muted ? 0 : volume;

  return (
    <div className="audio-player">
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play / pause */}
      <button
        type="button"
        onClick={toggle}
        className="audio-play-btn"
        aria-label={playing ? 'Pause' : 'Lecture'}
      >
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5,3 19,12 5,21" />
          </svg>
        )}
      </button>

      {/* Info + progress */}
      <div className="audio-center">
        <span className="audio-filename">{displayName}</span>
        <div
          ref={barRef}
          className="audio-bar"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragging(true);
            seekTo(e.clientX);
          }}
          onPointerMove={(e) => { if (dragging) seekTo(e.clientX); }}
          onPointerUp={(e) => { seekTo(e.clientX); setDragging(false); }}
        >
          <div className="audio-bar-track">
            <div className="audio-bar-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="audio-bar-thumb" style={{ left: `${progress * 100}%` }} />
        </div>
        <div className="audio-times">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Download */}
      <a
        href={src}
        download={displayName}
        className="audio-mute-btn"
        aria-label="Télécharger"
        title="Télécharger"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </a>

      {/* Volume */}
      <div className="audio-volume">
        <button
          type="button"
          onClick={toggleMute}
          className="audio-mute-btn"
          aria-label={muted ? 'Activer le son' : 'Couper le son'}
        >
          {displayVolume === 0 ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          ) : displayVolume < 0.5 ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          )}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={displayVolume}
          onChange={(e) => handleVolume(parseFloat(e.target.value))}
          className="audio-volume-slider"
          style={{ '--val': `${Math.round(displayVolume * 100)}` } as React.CSSProperties}
          aria-label="Volume"
        />
      </div>
    </div>
  );
}
