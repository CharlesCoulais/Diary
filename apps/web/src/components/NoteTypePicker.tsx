import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LocalEntry, LocalNoteTypeDef } from '../lib/db/schema';
import { trpc } from '../lib/trpc';
import { useNoteTypeDefs } from '../lib/useNoteTypeDefs';
import { useDropdownAlign } from '../lib/useDropdownAlign';
import { NoteTypeIcon, NOTE_TYPE_ICON_KEYS } from './noteTypeIcons';
import { SelectMenu, type SelectMenuOption } from './SelectMenu';

export type NoteType = LocalEntry['noteType'];
/** Comportements built-in héritables par un type custom (exclut 'CUSTOM'). */
export type NoteTypeBehavior = LocalNoteTypeDef['behavior'];

type IconProps = { className?: string; style?: React.CSSProperties };

const IconJournal = ({ className, style }: IconProps) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
    <path d="M11 2L14 5L6 13L3 14L4 11L11 2Z" />
    <path d="M9.5 3.5L12.5 6.5" />
  </svg>
);

const IconBook = ({ className, style }: IconProps) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
    <path d="M4 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
    <path d="M6 2v5.5L8 6l2 1.5V2" />
  </svg>
);

const IconSeries = ({ className, style }: IconProps) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
    <rect x="1" y="2" width="14" height="10" rx="1" />
    <path d="M6 12v2M10 12v2M4 14h8" />
  </svg>
);

const IconMovie = ({ className, style }: IconProps) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
    <rect x="1" y="5" width="14" height="9" rx="1" />
    <path d="M1 5l2.5-3.5h9L15 5" />
    <path d="M5 1.5L4 5M8.5 1V5M12 1.5l.5 3.5" />
  </svg>
);

const IconMusic = ({ className, style }: IconProps) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
    <path d="M6 13.5V4l7-1.5v2L6 6" />
    <circle cx="4" cy="13.5" r="2" />
    <circle cx="11" cy="11.5" r="2" />
    <line x1="13" y1="4.5" x2="13" y2="11.5" />
  </svg>
);

const IconOuting = ({ className, style }: IconProps) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
    <path d="M8 1a4.5 4.5 0 0 0 0 9C8 10 8 15 8 15s0-5 0-5A4.5 4.5 0 0 0 8 1z" />
    <circle cx="8" cy="5.5" r="1.5" />
  </svg>
);

const IconShopping = ({ className, style }: IconProps) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    <path d="M2.5 7h11l-1 7h-9l-1-7z" />
  </svg>
);

const IconDev = ({ className, style }: IconProps) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
    <path d="M5 5L2 8l3 3M11 5l3 3-3 3M9.5 4l-3 8" />
  </svg>
);

const IconQuizz = ({ className, style }: IconProps) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
    <circle cx="8" cy="8" r="6.5" />
    <path d="M6.2 6.2a1.9 1.9 0 1 1 2.6 1.8c-.5.25-.8.6-.8 1.2" />
    <path d="M8 11.4h.01" />
  </svg>
);

const IconAgenda = ({ className, style }: IconProps) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
    <rect x="2" y="3" width="12" height="11" rx="1.5" />
    <path d="M2 6h12M5 1.5V4M11 1.5V4" />
    <path d="M5 9h2M9 9h2M5 11.5h2" />
  </svg>
);

const IconFinance = ({ className, style }: IconProps) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
    <circle cx="8" cy="8" r="6.5" />
    <path d="M10 5.5C9.4 5 8.7 4.8 8 4.8c-1.2 0-2 .6-2 1.5 0 2 4 1 4 3 0 .9-.9 1.5-2 1.5-.8 0-1.5-.2-2-.8" />
    <path d="M8 3.6v.9M8 11.4v1" />
  </svg>
);

export interface NoteTypeConfig {
  value: NoteType;
  label: string;
  labelPlural: string;
  /** Mot utilisé pour nommer plusieurs volumes/films/épisodes dans un groupe */
  volumeLabel: string;
  icon: string;
  Icon: (props: IconProps) => React.ReactElement;
  /** Couleur du type — variable CSS théme-aware (clair/sombre, cf. tokens.css).
      Pour les fonds teintés, passer par `noteTint()` (color-mix), jamais de
      concaténation hex `color + '20'` (invalide sur une var). */
  color: string;
  /** Hex clair brut — pour les contextes hors CSS (export PDF, fenêtre isolée). */
  hex: string;
}

export const NOTE_TYPE_CONFIG: NoteTypeConfig[] = [
  { value: 'JOURNAL',  label: 'Journal',  labelPlural: 'Journaux',  volumeLabel: 'entrées',  icon: '✦', Icon: IconJournal,  color: 'var(--color-note-journal)',  hex: '#4f7a85' },
  { value: 'BOOK',     label: 'Livre',    labelPlural: 'Livres',    volumeLabel: 'tomes',    icon: '◎', Icon: IconBook,     color: 'var(--color-note-book)',     hex: '#af2db4' },
  { value: 'SERIES',   label: 'Série',    labelPlural: 'Séries',    volumeLabel: 'saisons',  icon: '▷', Icon: IconSeries,   color: 'var(--color-note-series)',   hex: '#589325' },
  { value: 'MOVIE',    label: 'Film',     labelPlural: 'Films',     volumeLabel: 'films',    icon: '◈', Icon: IconMovie,    color: 'var(--color-note-movie)',    hex: '#938125' },
  { value: 'MUSIC',    label: 'Musique',  labelPlural: 'Musique',   volumeLabel: 'albums',   icon: '♫', Icon: IconMusic,    color: 'var(--color-note-music)',    hex: '#b42d7b' },
  { value: 'OUTING',   label: 'Sortie',   labelPlural: 'Sorties',   volumeLabel: 'sorties',  icon: '⊕', Icon: IconOuting,   color: 'var(--color-note-outing)',   hex: '#b4652d' },
  { value: 'SHOPPING', label: 'Shopping', labelPlural: 'Shopping',  volumeLabel: 'articles', icon: '⊙', Icon: IconShopping, color: 'var(--color-note-shopping)', hex: '#b42d3f' },
  { value: 'DEV',      label: 'Dev',      labelPlural: 'Dev',       volumeLabel: 'chapitres', icon: '⌨', Icon: IconDev,      color: 'var(--color-note-dev)',      hex: '#1890a0' },
  { value: 'QUIZZ',    label: 'Quizz',    labelPlural: 'Quizz',     volumeLabel: 'questions', icon: '?', Icon: IconQuizz,    color: 'var(--color-note-quizz)',    hex: '#342db4' },
  { value: 'AGENDA',   label: 'Agenda',   labelPlural: 'Agendas',   volumeLabel: 'événements', icon: '▦', Icon: IconAgenda,  color: 'var(--color-note-agenda)',   hex: '#702db4' },
  { value: 'FINANCE',  label: 'Finance',  labelPlural: 'Finances',  volumeLabel: 'lignes',    icon: '€', Icon: IconFinance,  color: 'var(--color-note-finance)',  hex: '#3f8a5a' },
];

export function getNoteTypeConfig(type: NoteType): NoteTypeConfig {
  return NOTE_TYPE_CONFIG.find((c) => c.value === type) ?? NOTE_TYPE_CONFIG[0]!;
}

/** Fond teinté d'une couleur de type (compatible variable CSS, contrairement à
    la concaténation hex `color + '20'`). `pct` = opacité en % (ex. 13 ≈ '20'). */
export function noteTint(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

// ── Types personnalisés : résolution du config effectif ────────────────────
// Un type custom hérite d'un comportement built-in (`behavior`) et porte son
// propre libellé/couleur/icône. `resolveNoteTypeConfig` renvoie, pour une note,
// le config à AFFICHER (label/couleur/glyph) + le `behavior` à BRANCHER. Le
// branchement structuré doit utiliser `cfg.behavior`, jamais `noteType === 'CUSTOM'`.

/** Sous-ensemble minimal d'un NoteTypeDef requis pour résoudre l'affichage.
 *  LocalNoteTypeDef (Dexie) et la ligne serveur lui sont tous deux assignables. */
export interface NoteTypeDefLike {
  id: string;
  label: string;
  labelPlural: string;
  volumeLabel: string;
  icon: string;
  colorHex: string;
  behavior: NoteTypeBehavior;
}

export interface ResolvedNoteTypeConfig {
  /** Identité : type built-in OU `custom:<id>`. */
  value: NoteType | `custom:${string}`;
  label: string;
  labelPlural: string;
  volumeLabel: string;
  /** Glyph brut (emoji / symbole). */
  icon: string;
  /** Rendu unifié de l'icône (SVG pour built-in, glyph pour custom). */
  Glyph: (props: IconProps) => React.ReactElement;
  /** Couleur : variable CSS (built-in) ou hex `#rrggbb` (custom). */
  color: string;
  hex: string;
  /** Comportement built-in effectif (jamais 'CUSTOM'). */
  behavior: NoteTypeBehavior;
  /** Id du type custom, ou null pour un built-in. */
  customId: string | null;
}

function builtinResolved(cfg: NoteTypeConfig): ResolvedNoteTypeConfig {
  return {
    value: cfg.value,
    label: cfg.label,
    labelPlural: cfg.labelPlural,
    volumeLabel: cfg.volumeLabel,
    icon: cfg.icon,
    Glyph: cfg.Icon,
    color: cfg.color,
    hex: cfg.hex,
    behavior: cfg.value as NoteTypeBehavior,
    customId: null,
  };
}

/** Config résolu d'un type custom (à partir de sa définition). */
export function resolveDefConfig(def: NoteTypeDefLike): ResolvedNoteTypeConfig {
  return {
    value: `custom:${def.id}`,
    label: def.label,
    labelPlural: def.labelPlural,
    volumeLabel: def.volumeLabel,
    icon: def.icon,
    Glyph: ({ className, style }: IconProps) => <NoteTypeIcon name={def.icon} className={className} style={style} />,
    color: def.colorHex,
    hex: def.colorHex,
    behavior: def.behavior,
    customId: def.id,
  };
}

/** Config résolu d'un type built-in (pour pickers/filtres qui itèrent). */
export function resolveBuiltinConfig(type: NoteType): ResolvedNoteTypeConfig {
  return builtinResolved(getNoteTypeConfig(type));
}

/**
 * Config effectif d'une note : custom → sa définition (ou JOURNAL si la
 * définition a disparu) ; built-in → sa config. `cfg.behavior` pilote le
 * branchement structuré.
 */
export function resolveNoteTypeConfig(
  entry: { noteType: NoteType; customTypeId?: string | null },
  defsById: Record<string, NoteTypeDefLike>,
): ResolvedNoteTypeConfig {
  if (entry.noteType === 'CUSTOM') {
    const def = entry.customTypeId ? defsById[entry.customTypeId] : undefined;
    return def ? resolveDefConfig(def) : builtinResolved(getNoteTypeConfig('JOURNAL'));
  }
  return builtinResolved(getNoteTypeConfig(entry.noteType));
}

// Built-ins seulement (jamais 'CUSTOM') → typés NoteTypeBehavior pour que
// `onChange({ behavior: type })` soit direct.
const QUICK_TYPES: NoteTypeBehavior[] = ['JOURNAL', 'BOOK', 'SERIES', 'MUSIC'];
const SELECT_TYPES: NoteTypeBehavior[] = ['MOVIE', 'OUTING', 'SHOPPING', 'DEV', 'QUIZZ', 'AGENDA', 'FINANCE'];

/** Comportements built-in héritables par un type custom (CUSTOM exclu). */
const BEHAVIORS: NoteTypeBehavior[] = [
  'JOURNAL', 'BOOK', 'SERIES', 'MOVIE', 'MUSIC', 'OUTING', 'SHOPPING', 'DEV', 'QUIZZ', 'AGENDA', 'FINANCE',
];

/** Description de chaque comportement, montrée dans le SelectMenu « Se comporte comme ». */
const BEHAVIOR_DESCRIPTIONS: Record<NoteTypeBehavior, string> = {
  JOURNAL: 'Note texte simple, sans champ structuré.',
  BOOK: 'Champs livre : titre, auteur, couverture, progression, note.',
  SERIES: 'Suivi de série : saisons, épisodes, note.',
  MOVIE: 'Champs film : titre, réalisateur, affiche, note.',
  MUSIC: "Morceau ou playlist : artiste, album, lien d'écoute, paroles.",
  OUTING: 'Sortie : lieu, sujet, lien, note.',
  SHOPPING: "Liste de liens d'achat.",
  DEV: 'Séries de notes : thème, parties, chapitres.',
  QUIZZ: 'Quiz à se faire tester (QCM ou réponse libre).',
  AGENDA: 'Événements datés, vue liste et calendrier.',
  FINANCE: 'Budget : revenus, dépenses, solde, catégories.',
};

/** Options du SelectMenu « Se comporte comme » (libellé built-in + description + glyph). */
const BEHAVIOR_OPTIONS: SelectMenuOption<NoteTypeBehavior>[] = BEHAVIORS.map((b) => {
  const cfg = getNoteTypeConfig(b);
  return {
    value: b,
    label: cfg.label,
    description: BEHAVIOR_DESCRIPTIONS[b],
    icon: <cfg.Icon className="w-4 h-4 shrink-0" style={{ color: cfg.color }} />,
  };
});

/** Palette curée — lisible sur le crème clair ET le bleu nuit. Source unique
    partagée par le quick-create du picker et la page Réglages. Toutes les teintes
    sont à luminosité moyenne (chaudes + froides + quelques profondes + quelques
    douces) pour rester lisibles sur les deux thèmes. La rangée est en `flex-wrap`. */
export const NOTE_TYPE_SWATCHES = [
  // Chaudes (rouge → ambre)
  '#b3543f', '#c0392b', '#d35400', '#c97b3c', '#b5651d', '#c79a17', '#b8860b', '#9a8c1a',
  // Vertes
  '#6f9a5e', '#4a7c59', '#3b9c6e', '#2f8f83', '#2a9d8f',
  // Bleues / cyan
  '#1f8a99', '#3b6ea5', '#2c6fbb', '#2f5d8a', '#4a6fa5',
  // Violettes
  '#6c5cb8', '#7b5ea7', '#8e5fb0', '#9a6b9d',
  // Roses / magenta
  '#b04a7a', '#c2185b', '#b5546f', '#d16b9c',
  // Neutres chaud / froid
  '#8a6d3b', '#7a8290',
] as const;

/** Valeurs d'un type custom éditables dans le formulaire partagé. */
export interface NoteTypeFormValues {
  label: string;
  colorHex: string;
  icon: string;
  behavior: NoteTypeBehavior;
}

/** Valeurs par défaut d'un nouveau type custom. */
export function emptyNoteTypeForm(): NoteTypeFormValues {
  return { label: '', colorHex: NOTE_TYPE_SWATCHES[0], icon: 'sparkles', behavior: 'JOURNAL' };
}

/**
 * Sélecteur d'icône : un bouton montrant l'icône courante (via `NoteTypeIcon`,
 * donc rétrocompatible avec un ancien emoji) qui ouvre une grille de toutes les
 * icônes de la bibliothèque dans un popover (portal, viewport-safe, fermeture au
 * clic dehors). Cibles tactiles ~34px, grille défilante (PWA iOS/Android).
 */
function IconPicker({
  value,
  color,
  onPick,
}: {
  value: string;
  color: string;
  onPick: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { panelRef: alignRef, panelStyle: alignStyle } = useDropdownAlign<HTMLDivElement>(open);

  const openPanel = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const width = 240;
      const overflows = r.right - width < 8;
      // Ancré au coin droit du bouton (l'icône est à droite de la rangée).
      setPos(overflows
        ? { top: r.bottom + 6, left: r.left }
        : { top: r.bottom + 6, right: window.innerWidth - r.right });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-label="Choisir une icône"
        aria-expanded={open}
        className="w-11 h-9 flex items-center justify-center bg-bg-primary/60 border border-text-muted/15 rounded-xl outline-none focus:border-accent/40 hover:border-text-muted/30 transition-colors shrink-0"
      >
        <NoteTypeIcon name={value} className="w-5 h-5" style={{ color }} />
      </button>
      {open && pos && createPortal(
        <div
          ref={(node) => {
            panelRef.current = node;
            (alignRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          }}
          className="fixed z-[202] w-[240px] max-w-[calc(100vw-16px)] bg-bg-elevated border border-text-muted/15 rounded-2xl shadow-xl p-2"
          style={{ top: pos.top, left: pos.left, right: pos.right, ...alignStyle }}
        >
          <div className="grid grid-cols-6 gap-1 max-h-[224px] overflow-y-auto scrollbar-soft">
            {NOTE_TYPE_ICON_KEYS.map((key) => {
              const active = key === value;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => { onPick(key); setOpen(false); }}
                  aria-label={key}
                  aria-pressed={active}
                  className={
                    'w-8 h-8 flex items-center justify-center rounded-lg transition-colors shrink-0 ' +
                    (active ? 'bg-accent/15' : 'hover:bg-text-muted/10')
                  }
                  style={active ? { color } : undefined}
                >
                  <NoteTypeIcon name={key} className="w-[18px] h-[18px]" />
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * Formulaire partagé d'édition d'un type custom (nom, couleur, icône,
 * comportement). Sans bouton de soumission ni mise en page de carte : le
 * conteneur (popover du picker / ligne de Réglages) gère la soumission et
 * l'agencement. Compact pour tenir dans un popover comme dans une liste.
 */
export function NoteTypeForm({
  values,
  onChange,
}: {
  values: NoteTypeFormValues;
  onChange: (next: NoteTypeFormValues) => void;
  /** Conservé pour rétro-compat des appelants ; plus utilisé en interne
      (le SelectMenu n'a pas besoin d'un id de label). */
  idPrefix?: string;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {/* Nom */}
      <input
        type="text"
        value={values.label}
        onChange={(e) => onChange({ ...values, label: e.target.value })}
        maxLength={40}
        placeholder="Nom du type…"
        className="w-full bg-bg-primary/60 border border-text-muted/15 rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/55 outline-none focus:border-accent/40 transition-colors"
      />

      {/* Couleur + icône sur une rangée */}
      <div className="flex items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5 flex-1">
          {NOTE_TYPE_SWATCHES.map((hex) => {
            const active = values.colorHex.toLowerCase() === hex.toLowerCase();
            return (
              <button
                key={hex}
                type="button"
                onClick={() => onChange({ ...values, colorHex: hex })}
                aria-label={`Couleur ${hex}`}
                aria-pressed={active}
                className={`w-6 h-6 rounded-full shrink-0 transition-transform ${active ? 'ring-2 ring-offset-2 ring-offset-bg-elevated scale-110' : 'hover:scale-105'}`}
                style={{ backgroundColor: hex, boxShadow: active ? `0 0 0 2px ${hex}` : undefined }}
              />
            );
          })}
        </div>
        <IconPicker
          value={values.icon}
          color={values.colorHex}
          onPick={(key) => onChange({ ...values, icon: key })}
        />
      </div>

      {/* Comportement hérité */}
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <span className="shrink-0">Se comporte comme</span>
        <div className="flex-1 min-w-0">
          <SelectMenu
            value={values.behavior}
            options={BEHAVIOR_OPTIONS}
            onChange={(b) => onChange({ ...values, behavior: b })}
            ariaLabel="Comportement du type de note"
          />
        </div>
      </div>
    </div>
  );
}

/** Sélection émise par le picker : type + id custom + comportement effectif. */
export interface NoteTypeSelection {
  noteType: NoteType;
  customTypeId: string | null;
  behavior: NoteTypeBehavior;
}

interface NoteTypePickerProps {
  value: NoteType;
  /** Id du type custom actif (quand value === 'CUSTOM'). */
  customTypeId?: string | null;
  onChange: (sel: NoteTypeSelection) => void;
  /** Affiche tous les types en pills inline (pas de dropdown ···) */
  expanded?: boolean;
}

export function NoteTypePicker({ value, customTypeId, onChange, expanded }: NoteTypePickerProps) {
  const { defs } = useNoteTypeDefs();
  const selectActive = (SELECT_TYPES as NoteType[]).includes(value);
  const activeCfg = selectActive ? getNoteTypeConfig(value) : null;
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Helpers d'émission — built-in : behavior === type. Cliquer la pill active
  // (hors JOURNAL) rebascule vers JOURNAL, comme avant.
  const pickBuiltin = (type: NoteTypeBehavior) => {
    if (value === type && type !== 'JOURNAL') {
      onChange({ noteType: 'JOURNAL', customTypeId: null, behavior: 'JOURNAL' });
    } else {
      onChange({ noteType: type, customTypeId: null, behavior: type });
    }
  };
  const pickCustom = (def: NoteTypeDefLike) => {
    onChange({ noteType: 'CUSTOM', customTypeId: def.id, behavior: def.behavior });
  };
  const isCustomActive = (def: NoteTypeDefLike) => value === 'CUSTOM' && customTypeId === def.id;

  // ── Quick-create : popover de création rapide d'un type custom ──────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<NoteTypeFormValues>(emptyNoteTypeForm);
  const createBtnRef = useRef<HTMLButtonElement>(null);
  const createPanelRef = useRef<HTMLDivElement | null>(null);
  const [createPos, setCreatePos] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const { panelRef: createAlignRef, panelStyle: createAlignStyle } = useDropdownAlign<HTMLDivElement>(createOpen);
  const utils = trpc.useUtils();
  const createMut = trpc.noteTypes.create.useMutation();

  const openCreate = () => {
    if (createBtnRef.current) {
      const r = createBtnRef.current.getBoundingClientRect();
      const width = 260;
      const overflows = r.left + width > window.innerWidth - 8;
      setCreatePos(overflows
        ? { top: r.bottom + 6, right: window.innerWidth - r.right }
        : { top: r.bottom + 6, left: r.left });
    }
    setForm(emptyNoteTypeForm());
    setCreateOpen(true);
  };

  const submitCreate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const label = form.label.trim();
    if (!label || createMut.isPending) return;
    const created = await createMut.mutateAsync({
      label,
      labelPlural: label,
      volumeLabel: 'éléments',
      icon: form.icon.trim() || 'sparkles',
      colorHex: form.colorHex,
      behavior: form.behavior,
    });
    await utils.noteTypes.list.invalidate();
    onChange({ noteType: 'CUSTOM', customTypeId: created.id, behavior: created.behavior as NoteTypeBehavior });
    setCreateOpen(false);
  };

  const openDrop = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const dropWidth = 150;
      const overflows = r.left + dropWidth > window.innerWidth - 8;
      setDropPos(overflows
        ? { top: r.bottom + 4, right: window.innerWidth - r.right }
        : { top: r.bottom + 4, left: r.left });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  useEffect(() => {
    if (!createOpen) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (createBtnRef.current?.contains(t) || createPanelRef.current?.contains(t)) return;
      setCreateOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [createOpen]);

  // Pill d'un type custom (réutilisé en inline expanded et dans le dropdown).
  const renderCustomPill = (def: NoteTypeDefLike) => {
    const cfg = resolveDefConfig(def);
    const active = isCustomActive(def);
    return (
      <button
        key={def.id}
        type="button"
        onClick={() => pickCustom(def)}
        className={
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 shrink-0 ' +
          (active ? 'border-transparent font-medium' : 'bg-transparent border-text-muted/15 text-text-muted hover:border-text-muted/30')
        }
        style={active ? { backgroundColor: noteTint(cfg.color, 13), color: cfg.color, borderColor: noteTint(cfg.color, 25) } : {}}
      >
        <cfg.Glyph className="w-3.5 h-3.5 shrink-0" />
        <span>{cfg.label}</span>
      </button>
    );
  };

  const dropdown = open && dropPos && createPortal(
    <div
      ref={panelRef}
      className="fixed z-[200] bg-bg-elevated border border-text-muted/15 rounded-xl shadow-lg py-1 min-w-[150px] max-h-[60vh] overflow-y-auto scrollbar-soft"
      style={{ top: dropPos.top, left: dropPos.left, right: dropPos.right }}
    >
      {SELECT_TYPES.map((type) => {
        const cfg = getNoteTypeConfig(type);
        const active = value === type;
        return (
          <button
            key={type}
            type="button"
            onClick={() => { pickBuiltin(type); setOpen(false); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${active ? 'font-medium' : 'text-text-muted hover:text-text-primary hover:bg-text-muted/5'}`}
            style={active ? { color: cfg.color, backgroundColor: noteTint(cfg.color, 6) } : {}}
          >
            <cfg.Icon className="w-3.5 h-3.5 shrink-0" />
            {cfg.label}
          </button>
        );
      })}
      {/* Types custom après les built-in SELECT */}
      {defs.length > 0 && <div className="my-1 border-t border-text-muted/10" />}
      {defs.map((def) => {
        const cfg = resolveDefConfig(def);
        const active = isCustomActive(def);
        return (
          <button
            key={def.id}
            type="button"
            onClick={() => { pickCustom(def); setOpen(false); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${active ? 'font-medium' : 'text-text-muted hover:text-text-primary hover:bg-text-muted/5'}`}
            style={active ? { color: cfg.color, backgroundColor: noteTint(cfg.color, 6) } : {}}
          >
            <cfg.Glyph className="w-3.5 h-3.5 shrink-0" />
            {cfg.label}
          </button>
        );
      })}
    </div>,
    document.body,
  );

  const createPopover = createOpen && createPos && createPortal(
    <div
      ref={(node) => {
        createPanelRef.current = node;
        (createAlignRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      className="fixed z-[201] w-[260px] max-w-[calc(100vw-16px)] bg-bg-elevated border border-text-muted/15 rounded-2xl shadow-xl p-3"
      style={{ top: createPos.top, left: createPos.left, right: createPos.right, ...createAlignStyle }}
    >
      <form onSubmit={submitCreate} className="flex flex-col gap-3">
        <p className="text-[11px] font-mono uppercase tracking-widest text-text-muted/55">Nouveau type</p>
        <NoteTypeForm values={form} onChange={setForm} />
        <div className="flex items-center justify-end gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => setCreateOpen(false)}
            className="px-3 py-1.5 rounded-xl text-xs text-text-muted/70 hover:text-text-primary transition-colors"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={!form.label.trim() || createMut.isPending}
            className="px-3.5 py-1.5 rounded-xl text-xs font-medium bg-accent text-bg-primary hover:opacity-95 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
          >
            {createMut.isPending ? '…' : 'Créer'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );

  return (
    <div className="flex items-center gap-1.5 flex-nowrap">
      {QUICK_TYPES.map((type) => {
        const cfg = getNoteTypeConfig(type);
        const active = value === type;
        return (
          <button
            key={type}
            type="button"
            onClick={() => pickBuiltin(type)}
            className={
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 shrink-0 ' +
              (active
                ? 'border-transparent font-medium'
                : 'bg-transparent border-text-muted/15 text-text-muted hover:border-text-muted/30')
            }
            style={active ? { backgroundColor: noteTint(cfg.color, 13), color: cfg.color, borderColor: noteTint(cfg.color, 25) } : {}}
          >
            <cfg.Icon className="w-3.5 h-3.5 shrink-0" />
            <span>{cfg.label}</span>
          </button>
        );
      })}

      {/* Mode expanded : types secondaires en pills inline */}
      {expanded && SELECT_TYPES.map((type) => {
        const cfg = getNoteTypeConfig(type);
        const active = value === type;
        return (
          <button
            key={type}
            type="button"
            onClick={() => pickBuiltin(type)}
            className={
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 shrink-0 ' +
              (active ? 'border-transparent font-medium' : 'bg-transparent border-text-muted/15 text-text-muted hover:border-text-muted/30')
            }
            style={active ? { backgroundColor: noteTint(cfg.color, 13), color: cfg.color, borderColor: noteTint(cfg.color, 25) } : {}}
          >
            <cfg.Icon className="w-3.5 h-3.5 shrink-0" />
            <span>{cfg.label}</span>
          </button>
        );
      })}

      {/* Mode expanded : types custom en pills inline */}
      {expanded && defs.map((def) => renderCustomPill(def))}

      {/* Mode compact : dropdown ··· pour les types secondaires + custom */}
      {!expanded && <button
        ref={btnRef}
        type="button"
        onClick={() => open ? setOpen(false) : openDrop()}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 shrink-0"
        style={
          selectActive && activeCfg
            ? { backgroundColor: noteTint(activeCfg.color, 13), color: activeCfg.color, borderColor: noteTint(activeCfg.color, 25) }
            : { background: 'transparent', borderColor: 'color-mix(in srgb, var(--color-text-muted) 15%, transparent)', color: 'var(--color-text-muted)' }
        }
      >
        {selectActive && activeCfg ? (
          <>
            <activeCfg.Icon className="w-3.5 h-3.5 shrink-0" />
            <span>{activeCfg.label}</span>
          </>
        ) : (
          <span>···</span>
        )}
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>}
      {!expanded && dropdown}

      {/* + Type : création rapide d'un type custom */}
      <button
        ref={createBtnRef}
        type="button"
        onClick={() => createOpen ? setCreateOpen(false) : openCreate()}
        aria-label="Créer un type"
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border border-dashed border-text-muted/25 text-text-muted hover:border-text-muted/45 hover:text-text-primary transition-colors shrink-0"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span>Type</span>
      </button>
      {createPopover}
    </div>
  );
}
