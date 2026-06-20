import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useBackButtonClose } from '../hooks/useBackButtonClose';
import { useModalA11y } from '../hooks/useModalA11y';
import { DatePicker } from './DatePicker';
import { TimeInput } from './TimeInput';

const PRESETS: { label: string; ms: number | null }[] = [
  { label: 'Maintenant', ms: 0 },
  { label: '30 min', ms: 30 * 60_000 },
  { label: '1 heure', ms: 60 * 60_000 },
  { label: '3 heures', ms: 3 * 60 * 60_000 },
  { label: '12 heures', ms: 12 * 60 * 60_000 },
  { label: '24 heures', ms: 24 * 60 * 60_000 },
  { label: 'Personnalisé…', ms: null },
];

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  open: boolean;
  onCancel: () => void;
  /** hideUntilAt en ISO, ou null pour publier sans délai. */
  onConfirm: (hideUntilAt: string | null) => void;
}

/**
 * Picker affiché au moment de publier une note (sortie du mode brouillon).
 * Permet de choisir un délai pendant lequel la note restera invisible au confident.
 */
export function PublishDelayPicker({ open, onCancel, onConfirm }: Props) {
  // Back natif → ferme le picker (s'empile au-dessus de la modale d'édition).
  useBackButtonClose(open, onCancel);
  if (!open) return null;
  // Le contenu est monté uniquement à l'ouverture → l'état se réinitialise à la
  // fermeture (démontage) et `useModalA11y` s'active bien au montage.
  return <PublishDelayDialog onCancel={onCancel} onConfirm={onConfirm} />;
}

function PublishDelayDialog({ onCancel, onConfirm }: Omit<Props, 'open'>) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customDate, setCustomDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [customTime, setCustomTime] = useState<string>(() => {
    const d = new Date(Date.now() + 60 * 60_000);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });

  // Focus-trap + Échap + restauration du focus (le hook gère Échap).
  const panelRef = useModalA11y<HTMLDivElement>(onCancel);

  const handlePreset = (ms: number | null) => {
    if (ms === null) { setCustomOpen(true); return; }
    if (ms === 0) { onConfirm(null); return; }
    onConfirm(new Date(Date.now() + ms).toISOString());
  };

  const handleCustomConfirm = () => {
    if (!customDate) { onConfirm(null); return; }
    const d = new Date(`${customDate}T${customTime || '00:00'}`);
    if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) { onConfirm(null); return; }
    onConfirm(d.toISOString());
  };

  // Render via portal to <body> pour échapper au stacking context du parent
  // (les `transform` / `transition` sur l'EntryCard créent un contexte
  // d'empilement qui peut emprisonner les éléments `fixed` enfants et les
  // faire passer derrière la colonne droite en split-view desktop).
  return createPortal(
    <div
      // z-[80] : passe au-dessus du panneau desktop sticky de la colonne droite
      // (qui peut être à z-auto + sticky) et de la NoteModal (z-50).
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: 'rgba(0, 0, 0, 0.4)', paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      onClick={onCancel}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-delay-title"
        className="bg-bg-elevated rounded-2xl shadow-soft w-full max-w-sm p-5 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="publish-delay-title" className="text-base font-medium text-text-primary mb-1">
          Publier la note
        </h3>
        <p className="text-xs text-text-muted/70 mb-4 leading-relaxed">
          Quand le confident doit-il pouvoir la voir ? Pendant ce délai, la note reste invisible pour lui (toi tu la vois normalement).
        </p>

        {!customOpen ? (
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => handlePreset(p.ms)}
                className={
                  'px-3 py-2.5 rounded-xl text-sm border transition-colors ' +
                  (p.ms === 0
                    ? 'bg-accent/15 border-accent/30 text-accent font-medium hover:bg-accent/25'
                    : 'bg-bg-primary border-text-muted/15 text-text-primary hover:border-accent/30 hover:text-accent')
                }
              >
                {p.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <span className="text-xs text-text-muted/70">Visible à partir du</span>
              <div className="mt-1.5 flex items-center gap-2">
                <DatePicker
                  value={customDate}
                  onChange={setCustomDate}
                  min={new Date().toISOString().slice(0, 10)}
                  placeholder="Date…"
                  className="flex-1"
                />
                <TimeInput value={customTime} onChange={setCustomTime} />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCustomOpen(false)}
                className="flex-1 px-3 py-2 rounded-xl text-sm text-text-muted hover:text-text-primary border border-text-muted/15"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={handleCustomConfirm}
                className="flex-1 px-3 py-2 rounded-xl text-sm font-medium bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25"
              >
                Publier
              </button>
            </div>
          </div>
        )}

        {!customOpen && (
          <button
            type="button"
            onClick={onCancel}
            className="mt-4 w-full text-xs text-text-muted/60 hover:text-text-primary py-2"
          >
            Annuler
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
