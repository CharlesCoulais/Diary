import { useState } from 'react';
import { AudioPlayer } from './AudioPlayer';

/**
 * Player groupé pour plusieurs fichiers audio importés manuellement
 * (`:::audio "src" "filename"` consécutifs dans le markdown).
 *
 * UX : un seul `<AudioPlayer>` actif en haut (la piste en cours d'écoute),
 * et la liste compacte des autres pistes en dessous, cliquables pour
 * sauter. À la fin d'une piste, passe automatiquement à la suivante.
 *
 * Quand l'utilisateur a sélectionné 10 mp3 d'un coup pour son album perso,
 * ça remplace 10 cartes empilées par un seul player + une track-list propre.
 */
interface AudioItem {
  src: string;
  filename: string;
}

interface Props {
  items: AudioItem[];
}

function cleanFilename(name: string): string {
  // Retire l'extension `.mp3` et prefixe numérique du genre "01-1687321-".
  // Sans toucher si le nom est déjà propre (titre "Real Music").
  return name
    .replace(/\.(mp3|m4a|wav|ogg|aac|flac|webm)$/i, '')
    .replace(/^\s*\d{1,3}\s*[-_.\s]\s*\d{6,}\s*[-_.\s]\s*/, '') // "01-1687321-"
    .replace(/^\s*\d{1,3}\s*[-_.\s]\s*/, '') // "01-" ou "01 "
    .trim();
}

export function BulkAudioPlayer({ items }: Props) {
  const [index, setIndex] = useState(0);
  // `userTriggered` = true dès qu'on a switché ou enchaîné automatiquement,
  // pour autoriser l'autoplay (Safari/Chrome n'autorisent pas le play()
  // automatique sans gesture initial — mais une fois qu'on a play une
  // première piste, les suivantes peuvent enchaîner).
  const [userTriggered, setUserTriggered] = useState(false);

  if (items.length === 0) return null;
  const safeIndex = Math.min(index, items.length - 1);
  const active = items[safeIndex]!;

  const goTo = (i: number) => {
    setUserTriggered(true);
    setIndex(i);
  };

  const handleEnded = () => {
    if (safeIndex < items.length - 1) {
      setUserTriggered(true);
      setIndex(safeIndex + 1);
    }
  };

  return (
    <div className="my-3 rounded-2xl bg-bg-primary/40 border border-text-muted/10 overflow-hidden">
      {/* Header : nombre de pistes + position */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-text-muted/8 bg-bg-elevated/60">
        <span className="text-xs font-medium text-text-muted">
          ♬ {items.length} piste{items.length > 1 ? 's' : ''}
        </span>
        <span className="text-[11px] tabular-nums text-text-muted/60">
          {safeIndex + 1} / {items.length}
        </span>
      </div>

      {/* Player de la piste active. `key={active.src}` force un remount à
          chaque changement → React monte un nouveau <audio>, ce qui charge
          la nouvelle source et déclenche l'autoplay si activé. */}
      <div className="px-3 pt-3 pb-2">
        <AudioPlayer
          key={active.src}
          src={active.src}
          filename={cleanFilename(active.filename)}
          autoPlay={userTriggered}
          onEnded={handleEnded}
        />
      </div>

      {/* Liste des pistes — cliquables, ligne par ligne, scrollable si beaucoup. */}
      <ul className="max-h-72 overflow-y-auto scrollbar-soft divide-y divide-text-muted/8">
        {items.map((item, i) => {
          const isActive = i === safeIndex;
          return (
            <li key={`${item.src}-${i}`}>
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-current={isActive ? 'true' : undefined}
                className={`w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${
                  isActive
                    ? 'bg-accent/10 text-accent font-medium'
                    : 'text-text-primary hover:bg-text-muted/5'
                }`}
              >
                <span
                  aria-hidden
                  className={`shrink-0 w-5 text-[11px] font-mono tabular-nums ${
                    isActive ? 'text-accent' : 'text-text-muted/50'
                  }`}
                >
                  {isActive ? '▶' : (i + 1).toString().padStart(2, '0')}
                </span>
                <span className="flex-1 min-w-0 truncate">{cleanFilename(item.filename)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
