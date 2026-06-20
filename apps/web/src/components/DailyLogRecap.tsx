import { Link } from 'react-router-dom';

export interface DailyLogRecapData {
  mood?: string | null;
  sleepHours?: number | null;
  weather?: string | null;
  energy?: number | null;
  anxiety?: number | null;
}

interface DailyLogRecapProps {
  log: DailyLogRecapData | undefined;
  date: string;
  /** Si true, le badge devient un Link qui ouvre Home à la date (pour l'owner). Sinon, juste un span. */
  editable?: boolean;
  /** Classes CSS supplémentaires à fusionner sur le conteneur (ex: "w-full" pour pleine largeur). */
  className?: string;
}

/** Mini badge horizontal des champs renseignés du daily log. */
export function DailyLogRecap({ log, date, editable = false, className: extraClassName }: DailyLogRecapProps) {
  if (!log) return null;
  const hasData = !!(
    log.mood ||
    log.sleepHours != null ||
    log.weather ||
    log.energy != null ||
    log.anxiety != null
  );
  if (!hasData) return null;

  const content = (
    <>
      {log.mood && <span className="text-base leading-none">{log.mood}</span>}
      {log.weather && <span className="text-base leading-none">{log.weather}</span>}
      {log.sleepHours != null && (
        <span className="flex items-center gap-1">
          <span className="text-sm leading-none">😴</span>
          <span className="font-mono text-[11px] text-text-primary/70">{log.sleepHours}h</span>
        </span>
      )}
      {log.energy != null && (
        <span className="flex items-center gap-0.5">
          <span className="text-sm leading-none">⚡</span>
          <span className="font-mono text-[11px] text-text-primary/70">{log.energy}/5</span>
        </span>
      )}
      {log.anxiety != null && (
        <span className="flex items-center gap-0.5">
          <span className="text-sm leading-none">🌀</span>
          <span className="font-mono text-[11px] text-text-primary/70">{log.anxiety}/5</span>
        </span>
      )}
    </>
  );
  const className = `inline-flex items-center justify-center gap-2.5 flex-wrap text-sm text-text-muted bg-bg-elevated rounded-xl px-3 py-1.5 border border-text-muted/[0.08]${extraClassName ? ` ${extraClassName}` : ''}`;

  if (editable) {
    return (
      <Link to={`/?date=${date}`} title="Modifier le ressenti du jour" className={`${className} hover:bg-bg-elevated transition-colors`}>
        {content}
      </Link>
    );
  }
  return <span className={className}>{content}</span>;
}
