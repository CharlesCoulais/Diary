/**
 * Petit bouton chevron utilisé pour replier/déplier un bloc de filtres.
 * S'aligne visuellement avec les boutons icônes des barres de filtres
 * (8×8 / w-8 h-8, rounded-xl).
 */
export function ChevronToggle({
  collapsed,
  onClick,
  className = '',
  expandLabel = 'Afficher les filtres',
  collapseLabel = 'Masquer les filtres',
}: {
  collapsed: boolean;
  onClick: () => void;
  className?: string;
  expandLabel?: string;
  collapseLabel?: string;
}) {
  const label = collapsed ? expandLabel : collapseLabel;
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-expanded={!collapsed}
      className={`flex items-center justify-center w-8 h-8 [@media(pointer:coarse)]:min-w-[40px] [@media(pointer:coarse)]:min-h-[40px] rounded-xl text-text-muted hover:text-text-primary hover:bg-text-muted/8 transition-colors shrink-0 ${className}`}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`transition-transform duration-150 ${collapsed ? '' : 'rotate-180'}`}
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
}
