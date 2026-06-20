/**
 * Regroupement des polices par humeur d'écriture — l'idée est que tu choisis
 * une police selon **comment tu te sens en écrivant**, pas selon sa classification
 * typographique. Les groupes sont volontairement émotionnels.
 */
export type FontMood = 'calme' | 'joie' | 'tendresse' | 'intime' | 'reverie' | 'intensite';

export const MOOD_LABELS: Record<FontMood, string> = {
  calme: 'Calme',
  joie: 'Joie',
  tendresse: 'Tendresse',
  intime: 'Intime',
  reverie: 'Rêverie',
  intensite: 'Intensité',
};

export const MOOD_DESCRIPTIONS: Record<FontMood, string> = {
  calme: 'Pour les notes posées, la réflexion, le quotidien neutre',
  joie: 'Pour les bons moments, les petits bonheurs, les fêtes',
  tendresse: 'Pour les mots d\'amour, les souvenirs doux',
  intime: 'Pour écrire vraiment à soi, comme dans un cahier',
  reverie: 'Pour la nostalgie, la mélancolie, les rêves éveillés',
  intensite: 'Pour la colère, l\'urgence, ce qui ne peut plus attendre',
};

/** Ordre d'affichage des groupes dans le picker (du plus neutre au plus marqué). */
export const MOOD_ORDER: FontMood[] = ['calme', 'joie', 'tendresse', 'intime', 'reverie', 'intensite'];

export interface DiaryFont {
  key: string;
  label: string;
  family: string;
  googleFont: string | null;
  mood: FontMood;
}

const EMOJI_FALLBACK = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

const e = EMOJI_FALLBACK;

export const DIARY_FONTS: DiaryFont[] = [
  // ── Calme : neutre, posée, pour les notes du quotidien ───────────────────
  {
    key: 'serif',
    label: 'Classique',
    family: `Georgia, "Times New Roman", serif, ${e}`,
    googleFont: null,
    mood: 'calme',
  },
  {
    key: 'nunito',
    label: 'Nunito',
    family: `Nunito, sans-serif, ${e}`,
    googleFont: 'Nunito:wght@400;500',
    mood: 'calme',
  },
  {
    key: 'dosis',
    label: 'Dosis',
    family: `Dosis, sans-serif, ${e}`,
    googleFont: 'Dosis:wght@300;400;500',
    mood: 'calme',
  },

  // ── Joie : pétillante, légère, célébrative ───────────────────────────────
  {
    key: 'fredoka',
    label: 'Fredoka',
    family: `Fredoka, sans-serif, ${e}`,
    googleFont: 'Fredoka:wght@400;500;600',
    mood: 'joie',
  },
  {
    key: 'pacifico',
    label: 'Pacifico',
    family: `'Pacifico', cursive, ${e}`,
    googleFont: 'Pacifico',
    mood: 'joie',
  },
  {
    key: 'twinkle-star',
    label: 'Twinkle Star',
    family: `'Twinkle Star', cursive, ${e}`,
    googleFont: 'Twinkle+Star',
    mood: 'joie',
  },
  {
    key: 'butterfly-kids',
    label: 'Butterfly Kids',
    family: `'Butterfly Kids', cursive, ${e}`,
    googleFont: 'Butterfly+Kids',
    mood: 'joie',
  },
  {
    key: 'puppies-play',
    label: 'Puppies Play',
    family: `'Puppies Play', cursive, ${e}`,
    googleFont: 'Puppies+Play',
    mood: 'joie',
  },
  {
    key: 'sevillana',
    label: 'Sevillana',
    family: `'Sevillana', cursive, ${e}`,
    googleFont: 'Sevillana',
    mood: 'joie',
  },
  {
    key: 'berkshire-swash',
    label: 'Berkshire Swash',
    family: `'Berkshire Swash', cursive, ${e}`,
    googleFont: 'Berkshire+Swash',
    mood: 'joie',
  },
  {
    key: 'croissant-one',
    label: 'Croissant One',
    family: `'Croissant One', cursive, ${e}`,
    googleFont: 'Croissant+One',
    mood: 'joie',
  },
  {
    key: 'akaya-kanadaka',
    label: 'Akaya Kanadaka',
    family: `'Akaya Kanadaka', system-ui, cursive, ${e}`,
    googleFont: 'Akaya+Kanadaka',
    mood: 'joie',
  },

  // ── Tendresse : amour, affection, douceur ────────────────────────────────
  {
    key: 'lavishly',
    label: 'Lavishly',
    family: `'Lavishly Yours', cursive, ${e}`,
    googleFont: 'Lavishly+Yours',
    mood: 'tendresse',
  },
  {
    key: 'dancing-script',
    label: 'Dancing Script',
    family: `'Dancing Script', cursive, ${e}`,
    googleFont: 'Dancing+Script:wght@400;500;700',
    mood: 'tendresse',
  },
  {
    key: 'montez',
    label: 'Montez',
    family: `'Montez', cursive, ${e}`,
    googleFont: 'Montez',
    mood: 'tendresse',
  },
  {
    key: 'shantell',
    label: 'Shantell',
    family: `'Shantell Sans', cursive, ${e}`,
    googleFont: 'Shantell+Sans:ital,wght@0,400;0,500;1,400',
    mood: 'tendresse',
  },

  // Nouvelles
  {
    key: 'oooh-baby',
    label: 'Oooh Baby',
    family: `'Oooh Baby', cursive, ${e}`,
    googleFont: 'Oooh+Baby',
    mood: 'tendresse',
  },
  {
    key: 'parisienne',
    label: 'Parisienne',
    family: `'Parisienne', cursive, ${e}`,
    googleFont: 'Parisienne',
    mood: 'tendresse',
  },
  {
    key: 'engagement',
    label: 'Engagement',
    family: `'Engagement', cursive, ${e}`,
    googleFont: 'Engagement',
    mood: 'tendresse',
  },
  {
    key: 'gwendolyn',
    label: 'Gwendolyn',
    family: `'Gwendolyn', cursive, ${e}`,
    googleFont: 'Gwendolyn:wght@400;700',
    mood: 'tendresse',
  },
  {
    key: 'updock',
    label: 'Updock',
    family: `'Updock', cursive, ${e}`,
    googleFont: 'Updock',
    mood: 'tendresse',
  },
  {
    key: 'allura',
    label: 'Allura',
    family: `'Allura', cursive, ${e}`,
    googleFont: 'Allura',
    mood: 'tendresse',
  },
  {
    key: 'great-vibes',
    label: 'Great Vibes',
    family: `'Great Vibes', cursive, ${e}`,
    googleFont: 'Great+Vibes',
    mood: 'tendresse',
  },
  {
    key: 'marck-script',
    label: 'Marck Script',
    family: `'Marck Script', cursive, ${e}`,
    googleFont: 'Marck+Script',
    mood: 'tendresse',
  },
  {
    key: 'ms-madi',
    label: 'Ms Madi',
    family: `'Ms Madi', cursive, ${e}`,
    googleFont: 'Ms+Madi',
    mood: 'tendresse',
  },
  {
    key: 'send-flowers',
    label: 'Send Flowers',
    family: `'Send Flowers', cursive, ${e}`,
    googleFont: 'Send+Flowers',
    mood: 'tendresse',
  },
  {
    key: 'sacramento',
    label: 'Sacramento',
    family: `'Sacramento', cursive, ${e}`,
    googleFont: 'Sacramento',
    mood: 'tendresse',
  },
  {
    key: 'clicker-script',
    label: 'Clicker Script',
    family: `'Clicker Script', cursive, ${e}`,
    googleFont: 'Clicker+Script',
    mood: 'tendresse',
  },
  {
    key: 'grand-hotel',
    label: 'Grand Hotel',
    family: `'Grand Hotel', cursive, ${e}`,
    googleFont: 'Grand+Hotel',
    mood: 'tendresse',
  },
  {
    key: 'style-script',
    label: 'Style Script',
    family: `'Style Script', cursive, ${e}`,
    googleFont: 'Style+Script',
    mood: 'tendresse',
  },
  {
    key: 'montecarlo',
    label: 'MonteCarlo',
    family: `'MonteCarlo', cursive, ${e}`,
    googleFont: 'MonteCarlo',
    mood: 'tendresse',
  },
  {
    key: 'euphoria-script',
    label: 'Euphoria Script',
    family: `'Euphoria Script', cursive, ${e}`,
    googleFont: 'Euphoria+Script',
    mood: 'tendresse',
  },
  {
    key: 'norican',
    label: 'Norican',
    family: `'Norican', cursive, ${e}`,
    googleFont: 'Norican',
    mood: 'tendresse',
  },

  // ── Intime : journal personnel, écriture à la main ───────────────────────
  {
    key: 'indie',
    label: 'Indie Flower',
    family: `'Indie Flower', cursive, ${e}`,
    googleFont: 'Indie+Flower',
    mood: 'intime',
  },
  {
    key: 'kalam',
    label: 'Kalam',
    family: `Kalam, cursive, ${e}`,
    googleFont: 'Kalam:wght@300;400;700',
    mood: 'intime',
  },
  {
    key: 'playpen-sans',
    label: 'Playpen Sans',
    family: `'Playpen Sans', cursive, ${e}`,
    googleFont: 'Playpen+Sans:wght@400;500;600',
    mood: 'intime',
  },
  {
    key: 'playwrite-fr-moderne',
    label: 'Manuscrit FR',
    family: `'Playwrite FR Moderne', cursive, ${e}`,
    googleFont: 'Playwrite+FR+Moderne',
    mood: 'intime',
  },

  // Nouvelles
  {
    key: 'patrick-hand',
    label: 'Patrick Hand',
    family: `'Patrick Hand', cursive, ${e}`,
    googleFont: 'Patrick+Hand',
    mood: 'intime',
  },
  {
    key: 'handlee',
    label: 'Handlee',
    family: `'Handlee', cursive, ${e}`,
    googleFont: 'Handlee',
    mood: 'intime',
  },
  {
    key: 'paprika',
    label: 'Paprika',
    family: `'Paprika', cursive, ${e}`,
    googleFont: 'Paprika',
    mood: 'intime',
  },
  {
    key: 'lumanosimo',
    label: 'Lumanosimo',
    family: `'Lumanosimo', cursive, ${e}`,
    googleFont: 'Lumanosimo',
    mood: 'intime',
  },
  {
    key: 'fredericka-the-great',
    label: 'Fredericka the Great',
    family: `'Fredericka the Great', cursive, ${e}`,
    googleFont: 'Fredericka+the+Great',
    mood: 'intime',
  },

  // ── Rêverie : nostalgie, souvenirs, contemplation ────────────────────────
  {
    key: 'cormorant',
    label: 'Cormorant',
    family: `'Cormorant Garamond', serif, ${e}`,
    googleFont: 'Cormorant+Garamond:ital,wght@0,400;0,500;1,400',
    mood: 'reverie',
  },
  {
    key: 'crimson-pro',
    label: 'Crimson Pro',
    family: `'Crimson Pro', serif, ${e}`,
    googleFont: 'Crimson+Pro:ital,wght@0,400;0,500;1,400;1,500',
    mood: 'reverie',
  },
  {
    key: 'cinzel',
    label: 'Cinzel',
    family: `Cinzel, serif, ${e}`,
    googleFont: 'Cinzel:wght@400;500;600',
    mood: 'reverie',
  },
  {
    key: 'courier',
    label: 'Courier',
    family: `'Courier Prime', monospace, ${e}`,
    googleFont: 'Courier+Prime:ital,wght@0,400;1,400',
    mood: 'reverie',
  },

  // Nouvelles
  {
    key: 'caveat',
    label: 'Caveat',
    family: `'Caveat', cursive, ${e}`,
    googleFont: 'Caveat:wght@400;500;600;700',
    mood: 'reverie',
  },
  {
    key: 'shadows-into-light',
    label: 'Shadows Into Light',
    family: `'Shadows Into Light', cursive, ${e}`,
    googleFont: 'Shadows+Into+Light',
    mood: 'reverie',
  },
  {
    key: 'eb-garamond',
    label: 'EB Garamond',
    family: `'EB Garamond', serif, ${e}`,
    googleFont: 'EB+Garamond:ital,wght@0,400;0,500;1,400',
    mood: 'reverie',
  },
  {
    key: 'spectral',
    label: 'Spectral',
    family: `'Spectral', serif, ${e}`,
    googleFont: 'Spectral:ital,wght@0,400;0,500;1,400',
    mood: 'reverie',
  },
  {
    key: 'waterfall',
    label: 'Waterfall',
    family: `'Waterfall', cursive, ${e}`,
    googleFont: 'Waterfall',
    mood: 'reverie',
  },
  {
    key: 'fleur-de-leah',
    label: 'Fleur De Leah',
    family: `'Fleur De Leah', cursive, ${e}`,
    googleFont: 'Fleur+De+Leah',
    mood: 'reverie',
  },
  {
    key: 'windsong',
    label: 'WindSong',
    family: `'WindSong', cursive, ${e}`,
    googleFont: 'WindSong:wght@400;500',
    mood: 'reverie',
  },
  {
    key: 'stalemate',
    label: 'Stalemate',
    family: `'Stalemate', cursive, ${e}`,
    googleFont: 'Stalemate',
    mood: 'reverie',
  },
  {
    key: 'princess-sofia',
    label: 'Princess Sofia',
    family: `'Princess Sofia', cursive, ${e}`,
    googleFont: 'Princess+Sofia',
    mood: 'reverie',
  },
  {
    key: 'akronim',
    label: 'Akronim',
    family: `'Akronim', cursive, ${e}`,
    googleFont: 'Akronim',
    mood: 'reverie',
  },

  // ── Intensité : colère, urgence, passion, pulsion ────────────────────────
  {
    key: 'permanent-marker',
    label: 'Permanent Marker',
    family: `'Permanent Marker', cursive, ${e}`,
    googleFont: 'Permanent+Marker',
    mood: 'intensite',
  },
  {
    key: 'sedgwick-ave-display',
    label: 'Sedgwick Ave',
    family: `'Sedgwick Ave Display', cursive, ${e}`,
    googleFont: 'Sedgwick+Ave+Display',
    mood: 'intensite',
  },
  {
    key: 'oregano',
    label: 'Oregano',
    family: `'Oregano', cursive, ${e}`,
    googleFont: 'Oregano:ital@0;1',
    mood: 'intensite',
  },
  {
    key: 'momo-signature',
    label: 'Momo Signature',
    family: `'Momo Signature', cursive, ${e}`,
    googleFont: 'Momo+Signature',
    mood: 'intensite',
  },
  {
    key: 'srisakdi',
    label: 'Srisakdi',
    family: `'Srisakdi', cursive, ${e}`,
    googleFont: 'Srisakdi',
    mood: 'intensite',
  },

  // Nouvelles
  {
    key: 'caveat-brush',
    label: 'Caveat Brush',
    family: `'Caveat Brush', cursive, ${e}`,
    googleFont: 'Caveat+Brush',
    mood: 'intensite',
  },
  {
    key: 'rock-salt',
    label: 'Rock Salt',
    family: `'Rock Salt', cursive, ${e}`,
    googleFont: 'Rock+Salt',
    mood: 'intensite',
  },
  {
    key: 'kaushan-script',
    label: 'Kaushan Script',
    family: `'Kaushan Script', cursive, ${e}`,
    googleFont: 'Kaushan+Script',
    mood: 'intensite',
  },
];

/** Retourne les polices regroupées par humeur, dans l'ordre `MOOD_ORDER`. */
export function getFontsByMood(): { mood: FontMood; label: string; fonts: DiaryFont[] }[] {
  return MOOD_ORDER.map((mood) => ({
    mood,
    label: MOOD_LABELS[mood],
    fonts: DIARY_FONTS.filter((f) => f.mood === mood),
  })).filter((g) => g.fonts.length > 0);
}

// Clés renommées — maintenir la rétrocompatibilité
const KEY_ALIASES: Record<string, string> = { caveat: 'lavishly' };

/**
 * Facteur d'agrandissement par police. Les scriptes calligraphiques ont une
 * hauteur d'x bien plus petite que les sans-serif : à taille de base égale,
 * elles paraissent minuscules. On compense pour une lisibilité homogène —
 * la valeur stockée (ex. 17px) reste la « taille de base » choisie, ce facteur
 * n'est qu'un ajustement visuel propre à chaque police.
 * Valeurs empiriques, ajustables. Toute police absente = 1 (taille inchangée).
 */
const FONT_SCALE: Record<string, number> = {
  // Tendresse (scriptes fines, très petites)
  lavishly: 1.55, 'oooh-baby': 1.5, parisienne: 1.35, engagement: 1.45,
  gwendolyn: 1.7, updock: 1.5, allura: 1.4, 'great-vibes': 1.4, montez: 1.3,
  'marck-script': 1.15, 'ms-madi': 1.5, 'send-flowers': 1.5, sacramento: 1.3,
  'clicker-script': 1.35, 'grand-hotel': 1.2, 'style-script': 1.45,
  montecarlo: 1.5, 'euphoria-script': 1.4, norican: 1.25,
  // Joie / divers scriptes
  'twinkle-star': 1.3, 'dancing-script': 1.1, pacifico: 1.05,
  'butterfly-kids': 1.7, 'puppies-play': 1.4, sevillana: 1.4,
  'berkshire-swash': 1.1, 'croissant-one': 1.05, 'akaya-kanadaka': 1.05,
  // Intime / manuscrites
  indie: 1.05, 'playwrite-fr-moderne': 1.05, handlee: 1.05,
  paprika: 1.1, lumanosimo: 1.4, 'fredericka-the-great': 1.15,
  // Rêverie
  'shadows-into-light': 1.2, cinzel: 1.1, cormorant: 1.1, 'crimson-pro': 1.05, 'eb-garamond': 1.05,
  waterfall: 1.7, 'fleur-de-leah': 1.6, windsong: 1.5, stalemate: 1.45,
  'princess-sofia': 1.4, akronim: 1.3,
  // Intensité
  'momo-signature': 1.15, srisakdi: 1.3, oregano: 1.1, 'kaushan-script': 1.15,
};

/**
 * Facteur d'agrandissement d'une police (1 par défaut).
 * `resolveAlias` : applique les clés renommées (legacy). À DÉSACTIVER pour le
 * picker — il liste les polices actuelles par leur vraie clé, et la clé
 * `caveat` (vraie police Caveat) ne doit pas hériter du facteur de `lavishly`
 * via l'alias de rétrocompat.
 */
export function getFontScale(key: string | null | undefined, resolveAlias = true): number {
  if (!key) return 1;
  const resolved = resolveAlias ? (KEY_ALIASES[key] ?? key) : key;
  return FONT_SCALE[resolved] ?? 1;
}

/**
 * Applique le facteur d'agrandissement d'une police à une taille de base (px)
 * et renvoie la taille effective en `Npx`. `base` accepte une string CSS
 * (« 17px ») ou un nombre ; fallback à 17 si non parsable.
 *
 * `minPx` : plancher de lisibilité optionnel. Utilisé sur les **aperçus** de
 * cartes (côté confident) pour garantir une taille lisible même quand l'owner
 * a écrit la note dans une petite police — la pleine lecture, elle, reste
 * fidèle à la taille choisie (pas de plancher).
 */
export function scaledFontSize(
  key: string | null | undefined,
  base: string | number | null | undefined,
  minPx?: number,
): string {
  const px = typeof base === 'number' ? base : parseFloat(base ?? '') || 17;
  const scaled = Math.round(px * getFontScale(key));
  return `${minPx != null ? Math.max(minPx, scaled) : scaled}px`;
}

const loadedFonts = new Set<string>();

export function loadFont(key: string): void {
  const resolved = KEY_ALIASES[key] ?? key;
  if (resolved === 'serif' || loadedFonts.has(resolved)) return;
  const font = DIARY_FONTS.find((f) => f.key === resolved);
  if (!font?.googleFont) return;
  loadedFonts.add(resolved);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${font.googleFont}&display=swap`;
  document.head.appendChild(link);
}

// Police par défaut quand l'owner n'a pas choisi explicitement : Nunito,
// préchargée dans index.html (pas de FOUT). Sans-serif chaleureuse et lisible,
// alignée avec l'esthétique cocoa du journal.
const DEFAULT_FAMILY = `Nunito, system-ui, -apple-system, "Segoe UI", sans-serif, ${EMOJI_FALLBACK}`;

export function getFontFamily(key: string | null | undefined): string {
  if (!key) return DEFAULT_FAMILY;
  const resolved = KEY_ALIASES[key] ?? key;
  return DIARY_FONTS.find((f) => f.key === resolved)?.family ?? DEFAULT_FAMILY;
}
