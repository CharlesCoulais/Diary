import type React from 'react';

/**
 * Bibliothèque d'icônes SVG pour les types de note personnalisés.
 *
 * Jeu curé et varié (~50) au style « trait » (Lucide/Feather) : `viewBox 0 0 24 24`,
 * `fill="none"`, `stroke="currentColor"`, `strokeWidth=2`, bouts/jointures arrondis.
 * Le poids visuel correspond aux icônes built-in de `NoteTypePicker` (IconJournal…).
 *
 * `NoteTypeIcon` rend l'icône de la clé donnée ; si la clé n'existe pas (cas d'un
 * ancien type custom créé avec un emoji), elle retombe sur un rendu texte centré
 * (équivalent à l'ancien `makeGlyph`) → rétrocompatibilité.
 */

export type IconProps = { className?: string; style?: React.CSSProperties };

// Wrapper commun : applique le style trait partagé par toutes les icônes.
function svg(children: React.ReactNode) {
  return ({ className, style }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden
    >
      {children}
    </svg>
  );
}

/**
 * Jeu d'icônes — clés en slug court (`'map-pin'`). L'ordre d'insertion regroupe
 * par thème (création, nature, voyage, gourmand, jeux/sport, vie quotidienne…)
 * et devient l'ordre stable de la grille du picker.
 */
export const NOTE_TYPE_ICONS: Record<string, (p: IconProps) => React.ReactElement> = {
  // ── Création / médias ──────────────────────────────────────────────────────
  tag: svg(<>
    <path d="M3 11l8-8 10 10-8 8z" />
    <circle cx="7.5" cy="7.5" r="1.25" />
  </>),
  sparkles: svg(<>
    <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
    <path d="M18 14l.7 1.8L20.5 16.5l-1.8.7L18 19l-.7-1.8L15.5 16.5l1.8-.7z" />
  </>),
  palette: svg(<>
    <path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1 .8-1.5 1.7-1.5H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z" />
    <circle cx="7.5" cy="11" r="1" />
    <circle cx="10" cy="7" r="1" />
    <circle cx="14.5" cy="7" r="1" />
    <circle cx="17" cy="11" r="1" />
  </>),
  brush: svg(<>
    <path d="M14 3l7 7-4 1-5 5" />
    <path d="M12 16l-2-2" />
    <path d="M9 14c-2 0-4 1.5-4 4 0 1-1 2-2 2 1.5 1.5 3.5 2 5 2 2.2 0 4-1.8 4-4 0-2.5-1.5-4-3-4z" />
  </>),
  pencil: svg(<>
    <path d="M12 20H4v-4L16 4l4 4z" />
    <path d="M13 7l4 4" />
  </>),
  feather: svg(<>
    <path d="M20 4c-4 0-8 1.5-10.5 4S5 14 5 18l-2 2" />
    <path d="M20 4c0 6-4 11-11 12" />
    <path d="M9 13h6" />
  </>),
  camera: svg(<>
    <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <circle cx="12" cy="13" r="3.5" />
  </>),
  film: svg(<>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M3 15h18M8 4v16M16 4v16" />
  </>),
  music: svg(<>
    <path d="M9 18V6l11-2v12" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="17" cy="16" r="3" />
  </>),
  book: svg(<>
    <path d="M4 4h13a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2z" />
    <path d="M4 17a2 2 0 0 1 2-2h13" />
  </>),
  bookmark: svg(<>
    <path d="M6 3h12v18l-6-4-6 4z" />
  </>),
  headphones: svg(<>
    <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
    <path d="M4 14a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2z" />
    <path d="M20 14a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2 2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2z" />
  </>),

  // ── Nature / météo ─────────────────────────────────────────────────────────
  leaf: svg(<>
    <path d="M5 19c0-9 7-14 15-14 0 9-6 14-13 14a4 4 0 0 1-2-.5z" />
    <path d="M8 16c2-3 5-5 9-6" />
  </>),
  tree: svg(<>
    <path d="M12 3l5 7h-3l4 5H6l4-5H7z" />
    <path d="M12 15v6" />
  </>),
  flower: svg(<>
    <circle cx="12" cy="12" r="2.5" />
    <path d="M12 9.5C12 7 13 5 14.5 5S17 7 14.5 9.5" />
    <path d="M14.5 12c2.5 0 4.5 1 4.5 2.5S17 17 14.5 14.5" />
    <path d="M12 14.5C12 17 11 19 9.5 19S7 17 9.5 14.5" />
    <path d="M9.5 12C7 12 5 11 5 9.5S7 7 9.5 9.5" />
  </>),
  sun: svg(<>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
  </>),
  moon: svg(<>
    <path d="M20 14a8 8 0 0 1-10-10 8 8 0 1 0 10 10z" />
  </>),
  star: svg(<>
    <path d="M12 3l2.6 5.6L21 9.5l-4.5 4.4L17.6 21 12 17.8 6.4 21l1.1-7.1L3 9.5l6.4-.9z" />
  </>),
  cloud: svg(<>
    <path d="M7 18a4 4 0 0 1-.5-8A5 5 0 0 1 16 9.5a3.5 3.5 0 0 1 .5 8.5z" />
  </>),
  mountain: svg(<>
    <path d="M3 20l6-12 4 7 2-3 6 8z" />
    <circle cx="8" cy="6" r="1.5" />
  </>),
  droplet: svg(<>
    <path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z" />
  </>),
  flame: svg(<>
    <path d="M12 3c1 3 5 5 5 9a5 5 0 0 1-10 0c0-1.5.5-2.5 1.5-3.5C9 10 10 8 10 6c1 1 2 0 2-3z" />
  </>),
  snowflake: svg(<>
    <path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19" />
    <path d="M12 6l-2-2M12 6l2-2M12 18l-2 2M12 18l2 2M6 12l-2-2M6 12l-2 2M18 12l2-2M18 12l2 2" />
  </>),
  paw: svg(<>
    <circle cx="7" cy="9" r="1.8" />
    <circle cx="12" cy="7" r="1.8" />
    <circle cx="17" cy="9" r="1.8" />
    <path d="M12 11c-2.5 0-5 2-5 4.5C7 17.5 9 19 12 19s5-1.5 5-3.5C17 13 14.5 11 12 11z" />
  </>),

  // ── Voyage / lieux ─────────────────────────────────────────────────────────
  plane: svg(<>
    <path d="M10 4.5a1.5 1.5 0 0 1 3 0V11l8 4.5v2l-8-2.5v4l2 1.5v2l-3.5-1L8 22v-2l2-1.5v-4L2 17.5v-2L10 11z" />
  </>),
  car: svg(<>
    <path d="M3 13l2-5a2 2 0 0 1 2-1.5h10A2 2 0 0 1 19 8l2 5v4h-2M5 17H3v-4" />
    <path d="M3 13h18" />
    <circle cx="7.5" cy="17" r="1.5" />
    <circle cx="16.5" cy="17" r="1.5" />
  </>),
  'map-pin': svg(<>
    <path d="M12 21c4-4 7-7.5 7-11a7 7 0 1 0-14 0c0 3.5 3 7 7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </>),
  compass: svg(<>
    <circle cx="12" cy="12" r="9" />
    <path d="M15.5 8.5l-2 5-5 2 2-5z" />
  </>),
  globe: svg(<>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
  </>),
  tent: svg(<>
    <path d="M12 4l9 16H3z" />
    <path d="M12 4v16M12 20l5-9M12 20l-5-9" />
  </>),
  anchor: svg(<>
    <circle cx="12" cy="5" r="2" />
    <path d="M12 7v13" />
    <path d="M6 11H4c0 5 3.5 8 8 8s8-3 8-8h-2" />
    <path d="M8 13l-2-2-2 2" />
    <path d="M16 13l2-2 2 2" />
  </>),
  ticket: svg(<>
    <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4z" />
    <path d="M14 6v12" />
  </>),

  // ── Gourmand ───────────────────────────────────────────────────────────────
  coffee: svg(<>
    <path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
    <path d="M17 9h2a2 2 0 0 1 0 5h-2" />
    <path d="M7 3c-.5 1 .5 2 0 3M11 3c-.5 1 .5 2 0 3" />
  </>),
  utensils: svg(<>
    <path d="M6 3v7a2 2 0 0 0 4 0V3M8 10v11" />
    <path d="M16 3c-1.5 0-2.5 2-2.5 4.5S15 12 16 12v9" />
  </>),
  cup: svg(<>
    <path d="M5 4h14l-1.5 14a2 2 0 0 1-2 1.8H8.5a2 2 0 0 1-2-1.8z" />
    <path d="M5.5 9h13" />
  </>),
  cake: svg(<>
    <path d="M4 21v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7z" />
    <path d="M4 16c1.5 1.5 3 1.5 4 0s2.5-1.5 4 0 2.5 1.5 4 0" />
    <path d="M12 8V5M9 8V6M15 8V6" />
  </>),

  // ── Jeux / sport ───────────────────────────────────────────────────────────
  dumbbell: svg(<>
    <path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12" />
  </>),
  bike: svg(<>
    <circle cx="6" cy="17" r="3" />
    <circle cx="18" cy="17" r="3" />
    <path d="M6 17l4-8h5l3 8M10 9l2-4h3M14 9h-4" />
  </>),
  trophy: svg(<>
    <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
    <path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3" />
    <path d="M12 13v4M9 20h6M10 17h4l.5 3h-5z" />
  </>),
  target: svg(<>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" />
  </>),
  gamepad: svg(<>
    <path d="M7 8h10a4 4 0 0 1 4 4l-.7 4.5a2.5 2.5 0 0 1-4.4 1L14 15h-4l-1.9 2.5a2.5 2.5 0 0 1-4.4-1L3 12a4 4 0 0 1 4-4z" />
    <path d="M7.5 11v3M6 12.5h3" />
    <path d="M16 11h.01M18 13h.01" />
  </>),
  dice: svg(<>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01" />
  </>),
  puzzle: svg(<>
    <path d="M10 4a2 2 0 0 1 4 0c0 1 .5 1.5 1.5 1.5H18a2 2 0 0 1 2 2v2.5C20 11 19.5 11.5 18.5 11.5a2 2 0 0 0 0 4c1 0 1.5.5 1.5 1.5V20H15c-1 0-1.5-.5-1.5-1.5a2 2 0 0 0-4 0C9.5 19.5 9 20 8 20H4v-4.5C4 14.5 4.5 14 5.5 14a2 2 0 0 0 0-4C4.5 10 4 9.5 4 8.5V6h4c1 0 1.5-.5 1.5-1.5z" />
  </>),
  shapes: svg(<>
    <path d="M12 3l4 7H8z" />
    <circle cx="17" cy="17" r="4" />
    <rect x="3" y="13" width="7" height="7" rx="1" />
  </>),

  // ── Vie quotidienne ────────────────────────────────────────────────────────
  heart: svg(<>
    <path d="M12 20S4 15 4 9a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 6-8 11-8 11z" />
  </>),
  gift: svg(<>
    <rect x="4" y="9" width="16" height="11" rx="1" />
    <path d="M4 13h16M12 9v11" />
    <path d="M12 9c-1-3-5-4-5-1.5C7 9 10 9 12 9zM12 9c1-3 5-4 5-1.5C17 9 14 9 12 9z" />
  </>),
  home: svg(<>
    <path d="M4 11l8-7 8 7" />
    <path d="M6 10v10h12V10" />
    <path d="M10 20v-5h4v5" />
  </>),
  briefcase: svg(<>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" />
  </>),
  'shopping-bag': svg(<>
    <path d="M5 8h14l-1 12H6z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </>),
  key: svg(<>
    <circle cx="8" cy="8" r="4" />
    <path d="M11 11l8 8M16 16l2-2M18 18l2-2" />
  </>),
  lock: svg(<>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </>),
  bell: svg(<>
    <path d="M6 16V10a6 6 0 0 1 12 0v6l2 2H4z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </>),
  calendar: svg(<>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 9h18M8 3v4M16 3v4" />
  </>),
  clock: svg(<>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>),
  flag: svg(<>
    <path d="M5 21V4M5 4h12l-2 4 2 4H5" />
  </>),
  lightbulb: svg(<>
    <path d="M9 17a6 6 0 1 1 6 0v1H9z" />
    <path d="M10 21h4M9.5 18.5h5" />
  </>),
  smile: svg(<>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 14a4 4 0 0 0 7 0" />
    <path d="M9 9.5h.01M15 9.5h.01" />
  </>),
  scissors: svg(<>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="6" cy="18" r="2.5" />
    <path d="M8 8l12 10M8 16L20 6" />
  </>),
  wrench: svg(<>
    <path d="M14 6a4 4 0 0 0 5 5l-9 9a2.8 2.8 0 0 1-4-4z" />
    <path d="M14 6l-3 3" />
  </>),
  flask: svg(<>
    <path d="M9 3h6M10 3v6l-5 8a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-8V3" />
    <path d="M7.5 14h9" />
  </>),
  'graduation-cap': svg(<>
    <path d="M2 9l10-4 10 4-10 4z" />
    <path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" />
    <path d="M22 9v5" />
  </>),
  'heart-pulse': svg(<>
    <path d="M12 20S4 15 4 9a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 6-8 11-8 11z" />
    <path d="M4.5 12h3l1.5-3 2 5 1.5-3h3.5" />
  </>),
  brain: svg(<>
    <path d="M9 4a2.5 2.5 0 0 0-2.5 2.5A2.5 2.5 0 0 0 5 11a2.5 2.5 0 0 0 1 4.5 2.5 2.5 0 0 0 3 2.5V4z" />
    <path d="M15 4a2.5 2.5 0 0 1 2.5 2.5A2.5 2.5 0 0 1 19 11a2.5 2.5 0 0 1-1 4.5A2.5 2.5 0 0 1 15 18V4z" />
    <path d="M9 4h6M9 18h6" />
  </>),
  coin: svg(<>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v10M14.5 9.2C13.8 8.5 13 8.2 12 8.2c-1.5 0-2.5.7-2.5 1.8 0 2.2 5 1.2 5 3.5 0 1.1-1 1.8-2.5 1.8-1 0-1.8-.3-2.5-1" />
  </>),
  dollar: svg(<>
    <path d="M12 2v20" />
    <path d="M16.5 6.5C15.3 5.5 13.7 5 12 5c-2.5 0-4.5 1.2-4.5 3.2 0 4 9 2.3 9 6.6 0 2-2 3.2-4.5 3.2-1.7 0-3.3-.5-4.5-1.5" />
  </>),

  // ── Tech / informatique ─────────────────────────────────────────────────────
  laptop: svg(<>
    <rect x="4" y="5" width="16" height="11" rx="1.5" />
    <path d="M2 19h20M9 19l.5-1.5h5L15 19" />
  </>),
  code: svg(<>
    <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />
    <path d="M13 5l-2 14" />
  </>),
  terminal: svg(<>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7 9l3 3-3 3M13 15h4" />
  </>),
  cpu: svg(<>
    <rect x="6" y="6" width="12" height="12" rx="1.5" />
    <rect x="9" y="9" width="6" height="6" rx="0.5" />
    <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
  </>),
  smartphone: svg(<>
    <rect x="7" y="2" width="10" height="20" rx="2.5" />
    <path d="M10.5 18.5h3" />
  </>),
  keyboard: svg(<>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 15h8" />
  </>),
  mouse: svg(<>
    <rect x="6" y="3" width="12" height="18" rx="6" />
    <path d="M12 7v4" />
  </>),
  server: svg(<>
    <rect x="3" y="3" width="18" height="8" rx="1.5" />
    <rect x="3" y="13" width="18" height="8" rx="1.5" />
    <path d="M7 7h.01M7 17h.01M11 7h6M11 17h6" />
  </>),
  database: svg(<>
    <path d="M4 6c0 1.7 3.6 3 8 3s8-1.3 8-3-3.6-3-8-3-8 1.3-8 3z" />
    <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
    <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
  </>),
  wifi: svg(<>
    <path d="M2 8.5a15 15 0 0 1 20 0" />
    <path d="M5 12a10 10 0 0 1 14 0" />
    <path d="M8.5 15.5a5 5 0 0 1 7 0" />
    <path d="M12 19h.01" />
  </>),
  bug: svg(<>
    <rect x="8" y="6" width="8" height="12" rx="4" />
    <path d="M8 6a4 4 0 0 1 8 0" />
    <path d="M3 9h3M18 9h3M3 13h3M18 13h3M3 17h4M17 17h4M12 6V3" />
  </>),
  monitor: svg(<>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M9 20h6M12 16v4" />
  </>),
  robot: svg(<>
    <rect x="5" y="8" width="14" height="11" rx="2.5" />
    <path d="M12 4v4M12 4h.01" />
    <circle cx="9.5" cy="13" r="1" />
    <circle cx="14.5" cy="13" r="1" />
    <path d="M9 16.5h6M3 12v3M21 12v3" />
  </>),
  plug: svg(<>
    <path d="M9 2v6M15 2v6" />
    <path d="M7 8h10v2a5 5 0 0 1-10 0z" />
    <path d="M12 15v7" />
  </>),
  battery: svg(<>
    <rect x="2" y="7" width="17" height="10" rx="2" />
    <path d="M22 11v2" />
    <path d="M6 10v4M9 10v4" />
  </>),
  usb: svg(<>
    <circle cx="12" cy="20" r="1.5" />
    <path d="M12 18.5V5" />
    <path d="M9 8l3-3 3 3" />
    <path d="M12 11l4-2v-2M16 9l1.5.8M12 13l-4-2.5v-2M8 8.5L6.5 9.3" />
  </>),
  circuit: svg(<>
    <path d="M4 12h4M16 12h4M12 4v4M12 16v4" />
    <rect x="8" y="8" width="8" height="8" rx="1" />
    <circle cx="4" cy="12" r="1.5" />
    <circle cx="20" cy="12" r="1.5" />
    <circle cx="12" cy="4" r="1.5" />
    <circle cx="12" cy="20" r="1.5" />
  </>),
  rocket: svg(<>
    <path d="M12 3c3 1.5 5 5 5 9l-2 4H9l-2-4c0-4 2-7.5 5-9z" />
    <circle cx="12" cy="9" r="1.5" />
    <path d="M9 16l-3 3M15 16l3 3M10 19h4" />
  </>),

  // ── Enfance / bébé ──────────────────────────────────────────────────────────
  baby: svg(<>
    <circle cx="12" cy="6" r="3" />
    <path d="M9 6h.01M15 6h.01M10.5 8a2 2 0 0 0 3 0" />
    <path d="M6 21v-3a6 6 0 0 1 12 0v3" />
  </>),
  stroller: svg(<>
    <path d="M5 11a7 7 0 0 1 7-7v7z" />
    <path d="M4 11h16l-1.5 5h-13z" />
    <circle cx="7" cy="19" r="2" />
    <circle cx="17" cy="19" r="2" />
    <path d="M20 11V5" />
  </>),
  balloon: svg(<>
    <path d="M12 3a5 5 0 0 1 5 5c0 3.5-3 6-5 6s-5-2.5-5-6a5 5 0 0 1 5-5z" />
    <path d="M12 14l-1 1.5 1 1.5 1-1.5-1-1.5M12 17v4" />
  </>),
  'teddy-bear': svg(<>
    <circle cx="7" cy="5" r="2" />
    <circle cx="17" cy="5" r="2" />
    <circle cx="12" cy="11" r="5" />
    <path d="M10.5 10h.01M13.5 10h.01M11 13a1.5 1.5 0 0 0 2 0" />
    <path d="M8 15.5l-2 5M16 15.5l2 5" />
  </>),
  blocks: svg(<>
    <rect x="3" y="13" width="8" height="8" rx="1" />
    <rect x="13" y="13" width="8" height="8" rx="1" />
    <rect x="8" y="3" width="8" height="8" rx="1" />
    <path d="M6 13v-1M16 13v-1M11 3V2M13 3V2" />
  </>),
  'baby-bottle': svg(<>
    <path d="M10 2l4 4-1 1-4-4z" />
    <path d="M9.5 6.5l5 5-1 9a1.5 1.5 0 0 1-1.5 1.3H10a1.5 1.5 0 0 1-1.5-1.3l-1-7.5a3 3 0 0 1 3-6.5z" />
    <path d="M8.5 12h6" />
  </>),
  pacifier: svg(<>
    <circle cx="12" cy="14" r="3" />
    <path d="M9 14H6a2 2 0 0 0 0 4h.5M15 14h3a2 2 0 0 1 0 4h-.5" />
    <circle cx="12" cy="7" r="3" />
    <path d="M12 10v1" />
  </>),
  kite: svg(<>
    <path d="M12 2l7 7-7 7-7-7z" />
    <path d="M12 2v14M5 9h14" />
    <path d="M12 16c0 3-1 4-3 6M12 16l1 2-1 1 1 2" />
  </>),
  'ice-cream': svg(<>
    <path d="M8 9a4 4 0 0 1 8 0c0 1-.5 2-1 2.5H9C8.5 11 8 10 8 9z" />
    <path d="M8.5 11.5L12 21l3.5-9.5" />
    <path d="M9.5 14h5" />
  </>),
  candy: svg(<>
    <circle cx="12" cy="12" r="4" />
    <path d="M8 12L4 9v6zM16 12l4-3v6z" />
    <path d="M4 9l3 1.5M4 15l3-1.5M20 9l-3 1.5M20 15l-3-1.5" />
  </>),
  backpack: svg(<>
    <path d="M6 8a6 6 0 0 1 12 0v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" />
    <path d="M9 8a3 3 0 0 1 6 0" />
    <path d="M9 13h6M10 13v3h4v-3" />
  </>),
  'rocking-horse': svg(<>
    <path d="M5 9l4-2 6 1 3-2-1 4 2 2-4 1-2 3-2-3-4-1z" />
    <circle cx="9" cy="8" r="0.6" />
    <path d="M4 20c2-2 5-3 8-3s6 1 8 3" />
    <path d="M7 14l-2 5M16 14l2 5" />
  </>),
  duck: svg(<>
    <circle cx="9" cy="7" r="3" />
    <path d="M8 6h.01" />
    <path d="M12 7h4l-1.5 1.5" />
    <path d="M6 10c-2 0-3.5 1.5-3.5 3.5S5 18 8 18h6c3 0 5-2 5-4.5 0-1.5-1-2.5-2.5-2.5" />
  </>),
  crayon: svg(<>
    <path d="M9 3h6v4l-1 13h-4L9 7z" />
    <path d="M9 7h6M12 3v4" />
  </>),
};

/** Clés dans l'ordre d'insertion (= ordre de groupe par thème). */
export const NOTE_TYPE_ICON_KEYS: string[] = Object.keys(NOTE_TYPE_ICONS);

/**
 * Rend l'icône de la clé `name`. Si la clé existe dans la bibliothèque → SVG ;
 * sinon (ancien type custom stocké avec un emoji/glyph) → rendu texte centré
 * (équivalent à l'ancien `makeGlyph`) pour la rétrocompatibilité.
 */
export function NoteTypeIcon({
  name,
  className,
  style,
}: { name: string } & IconProps): React.ReactElement {
  const Comp = NOTE_TYPE_ICONS[name];
  if (Comp) return <Comp className={className} style={style} />;
  return (
    <span
      className={className}
      style={{
        ...style,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
      }}
      aria-hidden
    >
      {name}
    </span>
  );
}
