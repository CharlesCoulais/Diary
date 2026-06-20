/**
 * Switch / toggle binaire partagé.
 *
 * Design unique pour toute l'app — au lieu des 4 variantes qui existaient
 * (Toggle dans DisplayPrefsSection, ToggleRow + 2 toggles inline dans
 * NotificationSettings) :
 *   - track : `w-10 h-6 rounded-full`
 *   - thumb : `w-5 h-5 rounded-full bg-white`, positionné en absolu
 *     (`translate-x-0` / `translate-x-4` selon l'état)
 *   - couleur active : `bg-accent` par défaut, surchargeable via `activeClass`
 *
 * Pas de label intégré : le composant ne rend que le bouton. Le call site
 * gère le wrapping (`<div className="flex justify-between"><span>label</span>
 * <Switch /></div>` etc.) — ça reste plus flexible pour les variantes
 * `<label>` cliquables vs `<button>` standalone.
 *
 * A11y : `role="switch"` + `aria-checked` toujours présents. Si le composant
 * n'est pas dans un `<label>` contextuellement clair, fournir `aria-label`.
 */

interface SwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  /** Classe Tailwind à appliquer au track quand actif. Défaut : `bg-accent`. */
  activeClass?: string;
  /** Label accessibilité si l'élément n'est pas wrappé dans un `<label>`. */
  'aria-label'?: string;
  disabled?: boolean;
}

export function Switch({
  checked,
  onChange,
  activeClass = 'bg-accent',
  'aria-label': ariaLabel,
  disabled = false,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={
        `relative shrink-0 w-10 h-6 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          checked ? activeClass : 'bg-text-muted/20'
        }`
      }
    >
      <span
        className={
          `absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`
        }
      />
    </button>
  );
}
