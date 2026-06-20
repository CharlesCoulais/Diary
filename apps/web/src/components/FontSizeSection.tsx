import { useFontSize, FONT_SIZE_PX, FONT_SIZE_LABELS, type FontSize } from '../lib/fontSize';
import { SettingsCard } from './SettingsCard';

/**
 * Réglage de la taille de police racine.
 *
 * Stocké **par appareil** dans `localStorage` (jamais synchronisé via l'API) :
 * un téléphone d'entrée de gamme peut vouloir « Confort » alors que le desktop
 * reste sur « Normal ». Le réglage scale toute l'interface (rems Tailwind),
 * pas juste le texte.
 */
export function FontSizeSection() {
  const { size, setSize } = useFontSize();

  const OPTIONS: { value: FontSize; helper: string }[] = [
    { value: 'compact', helper: 'Plus dense, gain de surface visible.' },
    { value: 'normal', helper: 'Réglage par défaut de l’app.' },
    { value: 'confort', helper: 'Recommandé sur les petits écrans tactiles.' },
    { value: 'large', helper: 'Très lisible — utile en lumière forte.' },
  ];

  return (
    <SettingsCard>
      <p className="text-xs text-text-muted/60 mb-4">
        S'applique à toute l'interface sur <strong>cet appareil</strong> uniquement.
        Idéal pour ajuster selon la taille d'écran et la luminosité ambiante.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {OPTIONS.map((opt) => {
          const active = size === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSize(opt.value)}
              aria-pressed={active}
              className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border transition-all duration-150 ${
                active
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-text-muted/15 text-text-muted hover:border-text-muted/30 hover:text-text-primary'
              }`}
            >
              {/* Aperçu de la taille relative : la lettre Aa rendue à la taille
                  correspondante (en pixels absolus, pour ne PAS être affectée
                  par le réglage en cours — l'utilisateur compare). */}
              <span
                aria-hidden="true"
                style={{ fontSize: `${FONT_SIZE_PX[opt.value] * 1.15}px`, lineHeight: 1 }}
                className="font-serif"
              >
                Aa
              </span>
              <span className="text-[11px] font-medium">{FONT_SIZE_LABELS[opt.value]}</span>
            </button>
          );
        })}
      </div>

      {/* Petit explicatif sur l'option active. */}
      <p className="text-[11px] text-text-muted/50 mt-3 italic">
        {OPTIONS.find((o) => o.value === size)?.helper}
      </p>
    </SettingsCard>
  );
}
