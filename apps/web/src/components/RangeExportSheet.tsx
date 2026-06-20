import { useEffect, useState } from 'react';
import { DatePicker } from './DatePicker';
import { exportRangeToPdf } from '../lib/exportPdf';
import { isoToday, shiftDate } from '../lib/dateHelpers';
import { useBackButtonClose } from '../hooks/useBackButtonClose';

const MAX_RANGE_DAYS = 92;

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pré-remplissage éventuel (ex: depuis le filtre « Période » de la Timeline). */
  initialFrom?: string;
  initialTo?: string;
}

/**
 * Sélecteur de plage de dates pour l'export PDF d'une période (ressenti du jour
 * + toutes les notes). Rendu client-side (fenêtre d'impression).
 */
export function RangeExportSheet({ open, onClose, initialFrom, initialTo }: Props) {
  const today = isoToday();
  const monthStart = today.slice(0, 7) + '-01';
  const [from, setFrom] = useState(initialFrom || monthStart);
  const [to, setTo] = useState(initialTo || today);

  // Resynchronise sur (ré)ouverture avec le pré-remplissage courant.
  useEffect(() => {
    if (!open) return;
    setFrom(initialFrom || monthStart);
    setTo(initialTo || today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useBackButtonClose(open, onClose);
  if (!open) return null;

  const valid = !!from && !!to && from <= to;
  const span = valid ? Math.round((new Date(to + 'T12:00:00').getTime() - new Date(from + 'T12:00:00').getTime()) / 86_400_000) : 0;
  const tooLong = span > MAX_RANGE_DAYS;

  const presets: { label: string; from: string; to: string }[] = [
    { label: 'Ce mois-ci', from: monthStart, to: today },
    { label: '30 derniers jours', from: shiftDate(today, -29), to: today },
    { label: 'Cette année', from: today.slice(0, 4) + '-01-01', to: today },
  ];

  const doExport = () => {
    if (!valid || tooLong) return;
    void exportRangeToPdf(from, to);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="range-export-title"
    >
      <div
        className="bg-bg-elevated rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3">
          <h3 id="range-export-title" className="text-base font-medium text-text-primary">Exporter une période en PDF</h3>
          <p className="text-xs text-text-muted/70 mt-1">
            Un PDF chronologique : pour chaque jour, le ressenti du jour puis toutes tes notes (contenu, commentaires, réactions).
          </p>
        </div>

        {/* Presets */}
        <div className="px-5 pb-3 flex flex-wrap gap-1.5">
          {presets.map((p) => {
            const active = from === p.from && to === p.to;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => { setFrom(p.from); setTo(p.to); }}
                className={
                  'px-2.5 py-1 rounded-full text-xs border transition-colors ' +
                  (active ? 'border-accent/40 bg-accent/10 text-accent' : 'border-text-muted/15 text-text-muted hover:border-text-muted/30')
                }
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Du / Au */}
        <div className="px-5 pb-2 flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-text-muted/60 mb-1">Du</p>
            <DatePicker value={from} onChange={setFrom} max={to || today} placeholder="Du…" portal />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-text-muted/60 mb-1">Au</p>
            <DatePicker value={to} onChange={setTo} min={from || undefined} max={today} placeholder="Au…" portal />
          </div>
        </div>

        <p className="px-5 text-[11px] text-text-muted/50">
          {tooLong
            ? <span className="text-warning">Période trop longue ({span} j) — maximum {MAX_RANGE_DAYS} jours.</span>
            : valid ? `${span + 1} jour${span > 0 ? 's' : ''}.` : 'Choisis une date de début et de fin.'}
        </p>

        <div className="px-5 pt-3 pb-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-3 py-2 rounded-xl text-sm text-text-muted hover:text-text-primary border border-text-muted/15"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={doExport}
            disabled={!valid || tooLong}
            className="flex-1 px-3 py-2 rounded-xl text-sm font-medium bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Exporter le PDF
          </button>
        </div>
      </div>
    </div>
  );
}
