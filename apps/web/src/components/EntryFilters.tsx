import { useState, useRef, useEffect, type ReactNode } from 'react';
import { NOTE_TYPE_CONFIG, noteTint, resolveDefConfig, type NoteType } from './NoteTypePicker';
import { SortPicker, type SortMode } from '../pages/Home';
import { useDropdownAlign } from '../lib/useDropdownAlign';
import { useNoteTypeDefs } from '../lib/useNoteTypeDefs';
import { DatePicker } from './DatePicker';

type Visibility = 'PRIVATE' | 'SHARED_ALL' | 'SHARED_SPECIFIC';

/**
 * Clé sélectionnable du filtre de type : un type built-in (`NoteType`) ou un type
 * personnalisé encodé `custom:<id>`. Permet de filtrer sur un type custom précis
 * sans le confondre avec son comportement hérité.
 */
export type TypeFilterKey = NoteType | `custom:${string}`;

/**
 * Statuts d'une note verrouillée par un verrou de lecture.
 *  - approved   : la réponse du confident a été acceptée
 *  - rejected   : la réponse a été refusée
 *  - pending    : le confident a répondu, en attente de validation owner
 *  - unanswered : aucune réponse encore (ni du confident, ni traitée)
 *
 * Côté owner, c'est un set agrégé (plusieurs confidents possibles).
 * Côté confident, c'est l'unique statut personnel.
 */
export type ReadGateStatus = 'approved' | 'rejected' | 'pending' | 'unanswered';

/**
 * Statut d'une capsule temporelle.
 *  - locked   : encore scellée (unlockAt > maintenant)
 *  - unlocked : ouverte (unlockAt ≤ maintenant)
 * Note : seules les entries avec `unlockAt` non null sont des capsules.
 */
export type CapsuleStatus = 'locked' | 'unlocked';

export interface FilterState {
  /** Types sélectionnés : built-ins (`NoteType`) et/ou customs (`custom:<id>`). */
  types: TypeFilterKey[];
  tags: string[];
  moods: string[];                // graphemes emoji à matcher (OR)
  from: string;   // ISO date 'YYYY-MM-DD' ou ''
  to: string;
  isDraft: boolean | null;        // null = tous, true = brouillons
  visibility: Visibility | null;  // null = toutes
  isForConfidant: boolean | null; // null = tous, true = "Pour toi" (confident)
  isSecret: boolean | null;       // null = tous, true = boîte de Pandore
  readGateStatuses: ReadGateStatus[]; // multi-select OR ; [] = pas de filtre verrou
  capsuleStatuses: CapsuleStatus[];   // multi-select OR ; [] = pas de filtre capsule
  /**
   * Filtre sur les notations FAVORITE visibles par le viewer :
   *   null     = pas de filtre
   *   'any'    = au moins une notation FAVORITE visible (n'importe qui)
   *   'mine'   = l'utilisateur courant a marqué FAVORITE
   *   'others' = au moins un autre utilisateur (≠ moi) a marqué FAVORITE
   *              (côté Owner : « favoris des confidents »)
   *   'owner'  = l'auteur de l'entry (= owner du journal) a marqué FAVORITE
   *              (côté Guest : « favoris du owner »)
   */
  favoritesFilter: 'any' | 'mine' | 'others' | 'owner' | null;
  /** Filtre symétrique pour les notations LOW (« nul »). Mêmes 4 modes que
   *  favoritesFilter — null par défaut. */
  lowFilter: 'any' | 'mine' | 'others' | 'owner' | null;
}

export const EMPTY_FILTERS: FilterState = { types: [], tags: [], moods: [], from: '', to: '', isDraft: null, visibility: null, isForConfidant: null, isSecret: null, readGateStatuses: [], capsuleStatuses: [], favoritesFilter: null, lowFilter: null };

/**
 * Helper partagé entre `applyFilters` (utilisé par Timeline / GuestHome /
 * GuestDay via EntryFilters) et `Home.passesFilters` (qui a un état de filtre
 * dénormalisé en useState locaux mais doit appliquer la même logique de
 * rating pour rester cohérent).
 *
 * `mode` peut être null (pas de filtre actif, on accepte tout) ou un des
 * 4 modes définis par `favoritesFilter` / `lowFilter`. `value` est le type
 * de notation à matcher (FAVORITE ou LOW).
 *
 * Centraliser ici évite que les deux call sites divergent en cas d'ajout
 * d'un mode ou de changement de sémantique (audit Sprint 2 — risque réel).
 */
export function ratingMatchesFilter(
  entry: { authorId?: string; ratings?: Array<{ userId: string; value: 'FAVORITE' | 'LOW' }> },
  mode: 'any' | 'mine' | 'others' | 'owner' | null,
  value: 'FAVORITE' | 'LOW',
  currentUserId?: string,
): boolean {
  if (mode === null || !currentUserId) return true; // fail-open
  const ratings = entry.ratings ?? [];
  const matches = (r: { value: 'FAVORITE' | 'LOW' }) => r.value === value;
  switch (mode) {
    case 'any':
      return ratings.some(matches);
    case 'mine':
      return ratings.some((r) => r.userId === currentUserId && matches(r));
    case 'others':
      return ratings.some((r) => r.userId !== currentUserId && matches(r));
    case 'owner':
      return !!entry.authorId && ratings.some((r) => r.userId === entry.authorId && matches(r));
  }
}

/**
 * Sentinel ajouté au tableau `filters.tags` pour filtrer les entrées
 * SANS tag. Choix `__none__` (préfixé d'underscores) pour éviter toute
 * collision avec un vrai nom de tag (les vrais tags sont stockés trimés
 * et un nom vide est rejeté côté API). Cumulable avec une sélection de
 * tags réels en logique OR.
 */
export const NO_TAG_SENTINEL = '__none__';

export function isFiltered(f: FilterState) {
  return f.types.length > 0 || f.tags.length > 0 || f.moods.length > 0 || !!f.from || !!f.to || f.isDraft !== null || f.visibility !== null || f.isForConfidant !== null || f.isSecret !== null || f.readGateStatuses.length > 0 || f.capsuleStatuses.length > 0 || f.favoritesFilter !== null || f.lowFilter !== null;
}

/** Extrait les graphemes (emojis) d'une string mood — réutilisé pour le filtre et le compteur dispo */
function extractMoodGraphemes(mood: string): string[] {
  const seg = new Intl.Segmenter();
  const out: string[] = [];
  for (const { segment } of seg.segment(mood)) {
    if (segment.trim()) out.push(segment);
  }
  return out;
}

// ─── Shared dropdown wrapper ──────────────────────────────────────────────────

function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { panelRef, panelStyle } = useDropdownAlign(open);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return { open, setOpen, ref, panelRef, panelStyle };
}

// ─── Type filter dropdown ─────────────────────────────────────────────────────

export function TypeFilterButton({
  availableTypes,
  selected: selectedProp,
  onChange: onChangeProp,
}: {
  availableTypes: NoteType[];
  /** Clés sélectionnées (built-ins et/ou `custom:<id>`). Compatible `NoteType[]`
   *  (les built-ins en sont un sous-ensemble) pour les call sites qui n'utilisent
   *  que des types built-in (ex. l'état local de Home). */
  selected: NoteType[];
  onChange: (types: NoteType[]) => void;
}) {
  const { open, setOpen, ref, panelRef, panelStyle } = useDropdown();
  // Types custom du viewer → options de filtre supplémentaires (clé `custom:<id>`).
  const { defs } = useNoteTypeDefs();

  // En interne on raisonne sur des `TypeFilterKey` (les clés `custom:<id>` ne sont
  // pas des `NoteType`). Le cast est sûr : on ne fabrique que des clés valides et
  // les built-ins restent inchangés.
  const selected = selectedProp as TypeFilterKey[];
  const onChange = onChangeProp as (types: TypeFilterKey[]) => void;

  const toggle = (t: TypeFilterKey) =>
    onChange(selected.includes(t) ? selected.filter((x) => x !== t) : [...selected, t]);

  // Libellé d'une clé sélectionnée (built-in ou custom) pour le trigger.
  const keyLabel = (key: TypeFilterKey): string => {
    if (typeof key === 'string' && key.startsWith('custom:')) {
      const id = key.slice('custom:'.length);
      return defs.find((d) => d.id === id)?.label ?? 'Type';
    }
    return NOTE_TYPE_CONFIG.find((c) => c.value === key)?.label ?? 'Type';
  };

  const active = selected.length > 0;
  const label = active
    ? selected.length === 1
      ? keyLabel(selected[0]!)
      : `Types · ${selected.length}`
    : 'Types';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 ' +
          (active
            ? 'bg-accent/15 border-accent/40 text-accent font-medium'
            : open
              ? 'border-text-muted/20 text-text-muted bg-text-muted/8'
              : 'border-text-muted/15 text-text-muted/60 hover:border-text-muted/30 hover:text-text-muted')
        }
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <rect x="2" y="3" width="6" height="6" rx="1" /><rect x="9" y="3" width="13" height="6" rx="1" />
          <rect x="2" y="13" width="6" height="6" rx="1" /><rect x="9" y="13" width="13" height="6" rx="1" />
        </svg>
        {label}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform duration-100 ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div ref={panelRef} style={panelStyle} className="absolute left-0 top-full mt-1.5 z-50 bg-bg-elevated border border-text-muted/15 rounded-xl shadow-soft overflow-hidden min-w-[160px]">
          <div className="py-1">
            {NOTE_TYPE_CONFIG.filter((c) => availableTypes.includes(c.value)).map((cfg) => {
              const isActive = selected.includes(cfg.value);
              return (
                <button
                  key={cfg.value}
                  type="button"
                  onClick={() => toggle(cfg.value)}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors hover:bg-text-muted/5"
                >
                  <span
                    className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors`}
                    style={isActive ? { backgroundColor: noteTint(cfg.color, 19), borderColor: noteTint(cfg.color, 50) } : { borderColor: 'rgba(var(--color-text-muted), 0.3)' }}
                  >
                    {isActive && (
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: cfg.color }}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  <cfg.Icon className="w-3.5 h-3.5 shrink-0" style={{ color: isActive ? cfg.color : undefined }} />
                  <span className={isActive ? 'font-medium' : 'text-text-primary'} style={isActive ? { color: cfg.color } : {}}>{cfg.label}</span>
                </button>
              );
            })}
            {/* Types custom — clé composite `custom:<id>`, rendus via le config résolu. */}
            {defs.length > 0 && <div className="my-1 mx-3 border-t border-text-muted/10" />}
            {defs.map((def) => {
              const cfg = resolveDefConfig(def);
              const key = cfg.value as TypeFilterKey;
              const isActive = selected.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggle(key)}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors hover:bg-text-muted/5"
                >
                  <span
                    className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors`}
                    style={isActive ? { backgroundColor: noteTint(cfg.color, 19), borderColor: noteTint(cfg.color, 50) } : { borderColor: 'rgba(var(--color-text-muted), 0.3)' }}
                  >
                    {isActive && (
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: cfg.color }}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  <cfg.Glyph className="w-3.5 h-3.5 shrink-0" style={{ color: isActive ? cfg.color : undefined }} />
                  <span className={isActive ? 'font-medium' : 'text-text-primary'} style={isActive ? { color: cfg.color } : {}}>{cfg.label}</span>
                </button>
              );
            })}
          </div>
          {active && (
            <div className="border-t border-text-muted/10 px-3 py-1.5">
              <button
                type="button"
                onClick={() => { onChange([]); setOpen(false); }}
                className="text-[11px] text-text-muted/50 hover:text-text-muted transition-colors"
              >
                Effacer
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Visibility filter dropdown ───────────────────────────────────────────────

const VISIBILITY_OPTIONS = [
  { value: null,             label: 'Toutes',     icon: null },
  { value: 'PRIVATE' as const,        label: 'Privé',      icon: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0" aria-hidden>
      <rect x="3" y="8" width="10" height="6" rx="1" /><path d="M5 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  )},
  { value: 'SHARED_ALL' as const,     label: 'Partagé',    icon: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0" aria-hidden>
      <circle cx="8" cy="8" r="6" /><path d="M2 8h12M8 2c-1.5 2-2.5 3.8-2.5 6s1 4 2.5 6M8 2c1.5 2 2.5 3.8 2.5 6s-1 4-2.5 6" />
    </svg>
  )},
  { value: 'SHARED_SPECIFIC' as const, label: 'Spécifique', icon: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0" aria-hidden>
      <circle cx="6" cy="5" r="2" /><path d="M2 13v-1a4 4 0 0 1 8 0v1" /><path d="M12 7l1.5 1.5L16 6" />
    </svg>
  )},
] as const;

export function VisibilityFilterButton({
  value,
  onChange,
}: {
  value: Visibility | null;
  onChange: (v: Visibility | null) => void;
}) {
  const { open, setOpen, ref, panelRef, panelStyle } = useDropdown();
  const active = value !== null;
  const current = VISIBILITY_OPTIONS.find((o) => o.value === value) ?? VISIBILITY_OPTIONS[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 ' +
          (active
            ? 'bg-accent/15 border-accent/40 text-accent font-medium'
            : open
              ? 'border-text-muted/20 text-text-muted bg-text-muted/8'
              : 'border-text-muted/15 text-text-muted/60 hover:border-text-muted/30 hover:text-text-muted')
        }
      >
        {active && current.icon}
        {active ? current.label : 'Visibilité'}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform duration-100 ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div ref={panelRef} style={panelStyle} className="absolute left-0 top-full mt-1.5 z-50 bg-bg-elevated border border-text-muted/15 rounded-xl shadow-soft overflow-hidden min-w-[140px]">
          <div className="py-1">
            {VISIBILITY_OPTIONS.map((opt) => {
              const isActive = value === opt.value;
              return (
                <button
                  key={opt.value ?? 'all'}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors hover:bg-text-muted/5 ${isActive ? 'text-accent font-medium' : 'text-text-primary'}`}
                >
                  <span className={`w-3.5 h-3.5 rounded-full border flex-shrink-0 flex items-center justify-center transition-colors ${isActive ? 'bg-accent border-accent' : 'border-text-muted/30'}`}>
                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                  {opt.icon && <span className={isActive ? 'text-accent' : 'text-text-muted'}>{opt.icon}</span>}
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tag popover ─────────────────────────────────────────────────────────────

export function TagFilterButton({
  availableTags,
  selected,
  onChange,
  counts,
}: {
  availableTags: string[];
  selected: string[];
  onChange: (tags: string[]) => void;
  counts?: Record<string, number>;
}) {
  const { open, setOpen, ref, panelRef, panelStyle } = useDropdown();
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { setSearch(''); return; }
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const filtered = search.trim()
    ? availableTags.filter((t) => t.toLowerCase().includes(search.toLowerCase()))
    : availableTags;

  const toggle = (tag: string) => {
    onChange(selected.includes(tag) ? selected.filter((x) => x !== tag) : [...selected, tag]);
  };

  const isNoTagSelected = selected.includes(NO_TAG_SENTINEL);
  const toggleNoTag = () => {
    onChange(
      isNoTagSelected
        ? selected.filter((t) => t !== NO_TAG_SENTINEL)
        : [...selected, NO_TAG_SENTINEL],
    );
  };

  // Le dropdown a du sens dès qu'il y a au moins un tag dans le journal
  // (sinon "Sans tag" ramènerait toutes les entrées, donc inutile). Si on
  // n'a aucun tag mais que l'utilisateur a déjà coché "Sans tag" auparavant,
  // on garde le bouton visible pour pouvoir le décocher.
  if (availableTags.length === 0 && !isNoTagSelected) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 ' +
          (selected.length > 0
            ? 'bg-accent/15 border-accent/40 text-accent font-medium'
            : open
              ? 'border-text-muted/20 text-text-muted bg-text-muted/8'
              : 'border-text-muted/15 text-text-muted/60 hover:border-text-muted/30 hover:text-text-muted')
        }
      >
        <span className={selected.length > 0 ? '' : 'opacity-60'}>#</span>
        Tags
        {selected.length > 0 && (
          <span className="ml-0.5 bg-accent text-bg-primary rounded-full px-1.5 py-px text-[11px] font-bold leading-none">
            {selected.length}
          </span>
        )}
      </button>

      {open && (
        <div ref={panelRef} style={panelStyle} className="absolute left-0 top-full mt-1.5 z-50 w-52 bg-bg-elevated border border-text-muted/15 rounded-xl shadow-soft flex flex-col overflow-hidden">
          {availableTags.length > 6 && (
            <div className="px-3 pt-2.5 pb-1.5 border-b border-text-muted/10">
              <input
                ref={inputRef}
                type="text"
                placeholder="Rechercher…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-xs bg-bg-primary rounded-lg px-2.5 py-1.5 text-text-primary placeholder:text-text-muted/50 outline-none"
              />
            </div>
          )}
          <div className="overflow-y-auto max-h-52 py-1 scrollbar-soft">
            {/* "Sans tag" — toujours affiché en tête, indépendant de la recherche. */}
            <button
              type="button"
              onClick={toggleNoTag}
              className={
                'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ' +
                (isNoTagSelected ? 'text-accent font-medium' : 'text-text-muted hover:bg-text-muted/5')
              }
            >
              <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${isNoTagSelected ? 'bg-accent border-accent' : 'border-text-muted/30'}`}>
                {isNoTagSelected && (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </span>
              <span className="italic">Sans tag</span>
            </button>
            {/* Séparateur entre "Sans tag" et la liste des tags réels — masqué
                quand il n'y a aucun tag réel pour rester épuré. */}
            {availableTags.length > 0 && <div className="my-1 mx-3 border-t border-text-muted/10" />}
            {availableTags.length === 0 ? null : filtered.length === 0 ? (
              <p className="text-xs text-text-muted/50 text-center py-3">Aucun tag</p>
            ) : (
              filtered.map((tag) => {
                const active = selected.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggle(tag)}
                    className={
                      'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ' +
                      (active ? 'text-accent font-medium' : 'text-text-primary hover:bg-text-muted/5')
                    }
                  >
                    <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${active ? 'bg-accent border-accent' : 'border-text-muted/30'}`}>
                      {active && (
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                    <span className="opacity-50 flex-shrink-0">#</span>
                    <span className="truncate">{tag}</span>
                    {counts && counts[tag] !== undefined && (
                      <span className="ml-auto text-text-muted/55 text-[11px]">({counts[tag]})</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-text-muted/10 px-3 py-1.5">
              <button
                type="button"
                onClick={() => { onChange([]); setOpen(false); }}
                className="text-[11px] text-text-muted/50 hover:text-text-muted transition-colors"
              >
                Effacer la sélection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Mood popover ────────────────────────────────────────────────────────────

export function MoodFilterButton({
  availableMoods,
  selected,
  onChange,
  counts,
}: {
  availableMoods: string[];
  selected: string[];
  onChange: (moods: string[]) => void;
  counts?: Record<string, number>;
}) {
  const { open, setOpen, ref, panelRef, panelStyle } = useDropdown();

  const toggle = (mood: string) => {
    onChange(selected.includes(mood) ? selected.filter((x) => x !== mood) : [...selected, mood]);
  };

  if (availableMoods.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 ' +
          (selected.length > 0
            ? 'bg-accent/15 border-accent/40 text-accent font-medium'
            : open
              ? 'border-text-muted/20 text-text-muted bg-text-muted/8'
              : 'border-text-muted/15 text-text-muted/60 hover:border-text-muted/30 hover:text-text-muted')
        }
      >
        <span className={selected.length > 0 ? '' : 'opacity-60'}>☺︎</span>
        Mood
        {selected.length > 0 && (
          <span className="ml-0.5 bg-accent text-bg-primary rounded-full px-1.5 py-px text-[11px] font-bold leading-none">
            {selected.length}
          </span>
        )}
      </button>

      {open && (
        <div ref={panelRef} style={panelStyle} className="absolute left-0 top-full mt-1.5 z-50 w-60 bg-bg-elevated border border-text-muted/15 rounded-xl shadow-soft flex flex-col overflow-hidden">
          <div className="flex flex-wrap gap-1 p-2 max-h-52 overflow-y-auto scrollbar-soft">
            {availableMoods.map((mood) => {
              const active = selected.includes(mood);
              return (
                <button
                  key={mood}
                  type="button"
                  onClick={() => toggle(mood)}
                  className={
                    'text-lg leading-none p-1.5 rounded-lg transition-all ' +
                    (active ? 'bg-accent/15 ring-1 ring-accent/40' : 'hover:bg-text-muted/10 opacity-70 hover:opacity-100')
                  }
                  aria-pressed={active}
                  title={counts ? `${mood} (${counts[mood] ?? 0})` : mood}
                >
                  {mood}
                </button>
              );
            })}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-text-muted/10 px-3 py-1.5">
              <button
                type="button"
                onClick={() => { onChange([]); setOpen(false); }}
                className="text-[11px] text-text-muted/50 hover:text-text-muted transition-colors"
              >
                Effacer la sélection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Section filter dropdown ──────────────────────────────────────────────────

const SECTION_ORDER = ['MORNING', 'LATE_MORNING', 'NOON', 'AFTERNOON', 'LATE_AFTERNOON', 'EARLY_EVENING', 'EVENING', 'NIGHT', 'FREE'];
const SECTION_LABELS: Record<string, string> = {
  MORNING: 'Matin',
  LATE_MORNING: 'Fin de matinée',
  NOON: 'Midi',
  AFTERNOON: 'Après-midi',
  LATE_AFTERNOON: "Fin d'après-midi",
  EARLY_EVENING: 'Début de soirée',
  EVENING: 'Soirée',
  NIGHT: 'Nuit',
  FREE: 'Libre',
};

export function SectionFilterButton({
  availableSections,
  selected,
  onChange,
}: {
  availableSections: Array<{ value: string; count: number }>;
  selected: string[];
  onChange: (sections: string[]) => void;
}) {
  const { open, setOpen, ref, panelRef, panelStyle } = useDropdown();

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((x) => x !== value) : [...selected, value]);
  };

  const active = selected.length > 0;
  const firstSelected = selected[0];
  const label = active
    ? selected.length === 1
      ? (firstSelected !== undefined ? (SECTION_LABELS[firstSelected] ?? 'Moment') : 'Moment')
      : `Moment · ${selected.length}`
    : 'Moment';

  const sorted = [...availableSections].sort(
    (a, b) => SECTION_ORDER.indexOf(a.value) - SECTION_ORDER.indexOf(b.value),
  );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 ' +
          (active
            ? 'bg-accent/15 border-accent/40 text-accent font-medium'
            : open
              ? 'border-text-muted/20 text-text-muted bg-text-muted/8'
              : 'border-text-muted/15 text-text-muted/60 hover:border-text-muted/30 hover:text-text-muted')
        }
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
        {label}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform duration-100 ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div ref={panelRef} style={panelStyle} className="absolute left-0 top-full mt-1.5 z-50 bg-bg-elevated border border-text-muted/15 rounded-xl shadow-soft overflow-hidden min-w-[160px]">
          <div className="py-1">
            {sorted.map(({ value, count }) => {
              const isActive = selected.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggle(value)}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors hover:bg-text-muted/5"
                >
                  <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${isActive ? 'bg-accent border-accent' : 'border-text-muted/30'}`}>
                    {isActive && (
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  <span className={isActive ? 'text-accent font-medium' : 'text-text-primary'}>
                    {SECTION_LABELS[value] ?? value}
                  </span>
                  <span className="ml-auto text-text-muted/55 text-[11px]">({count})</span>
                </button>
              );
            })}
          </div>
          {active && (
            <div className="border-t border-text-muted/10 px-3 py-1.5">
              <button
                type="button"
                onClick={() => { onChange([]); setOpen(false); }}
                className="text-[11px] text-text-muted/50 hover:text-text-muted transition-colors"
              >
                Effacer
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Read-gate filter dropdown ───────────────────────────────────────────────

const READ_GATE_OPTIONS: { value: ReadGateStatus; label: string; dot: string }[] = [
  { value: 'approved',   label: 'Accepté',     dot: 'bg-success' },
  { value: 'rejected',   label: 'Refusé',      dot: 'bg-danger' },
  { value: 'pending',    label: 'En attente',  dot: 'bg-warning' },
  { value: 'unanswered', label: 'Non répondu', dot: 'bg-text-muted/40' },
];

export function ReadGateFilterButton({
  selected,
  onChange,
  /** Masque l'option "non répondu" si non pertinent (ex: owner sans note verrouillée vierge). */
  hideUnanswered = false,
  /** Nombre d'entrées par statut, affiché en suffixe de chaque option. */
  counts,
}: {
  selected: ReadGateStatus[];
  onChange: (s: ReadGateStatus[]) => void;
  hideUnanswered?: boolean;
  counts?: Partial<Record<ReadGateStatus, number>>;
}) {
  const { open, setOpen, ref, panelRef, panelStyle } = useDropdown();
  const active = selected.length > 0;
  const options = hideUnanswered ? READ_GATE_OPTIONS.filter((o) => o.value !== 'unanswered') : READ_GATE_OPTIONS;

  const toggle = (s: ReadGateStatus) => {
    onChange(selected.includes(s) ? selected.filter((x) => x !== s) : [...selected, s]);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 ' +
          (active
            ? 'bg-accent/15 border-accent/40 text-accent font-medium'
            : open
              ? 'border-text-muted/20 text-text-muted bg-text-muted/8'
              : 'border-text-muted/15 text-text-muted/60 hover:border-text-muted/30 hover:text-text-muted')
        }
        title="Filtrer les notes verrouillées par statut"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 shrink-0" aria-hidden>
          <rect x="3" y="7" width="10" height="7" rx="1" /><path d="M5 7V5a3 3 0 0 1 6 0v2" />
        </svg>
        Verrou
        {selected.length > 0 && (
          <span className="ml-0.5 bg-accent text-bg-primary rounded-full px-1.5 py-px text-[11px] font-bold leading-none">
            {selected.length}
          </span>
        )}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform duration-100 ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div ref={panelRef} style={panelStyle} className="absolute left-0 top-full mt-1.5 z-50 bg-bg-elevated border border-text-muted/15 rounded-xl shadow-soft overflow-hidden min-w-[170px]">
          <div className="py-1">
            {options.map((opt) => {
              const isActive = selected.includes(opt.value);
              const count = counts?.[opt.value];
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggle(opt.value)}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors hover:bg-text-muted/5 ${isActive ? 'text-accent font-medium' : 'text-text-primary'}`}
                >
                  <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${isActive ? 'bg-accent border-accent' : 'border-text-muted/30'}`}>
                    {isActive && (
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${opt.dot}`} aria-hidden />
                  <span className="flex-1">{opt.label}</span>
                  {typeof count === 'number' && (
                    <span className={`text-[11px] tabular-nums ${isActive ? 'opacity-80' : 'text-text-muted/50'}`}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-text-muted/10 px-3 py-1.5">
              <button
                type="button"
                onClick={() => { onChange([]); setOpen(false); }}
                className="text-[11px] text-text-muted/50 hover:text-text-muted transition-colors"
              >
                Effacer la sélection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Capsule filter dropdown ─────────────────────────────────────────────────

const CAPSULE_OPTIONS: { value: CapsuleStatus; label: string; dot: string }[] = [
  { value: 'locked',   label: 'Scellée',   dot: 'bg-sealed' },
  { value: 'unlocked', label: 'Ouverte',   dot: 'bg-success' },
];

export function CapsuleFilterButton({
  selected,
  onChange,
  /** Nombre d'entrées par statut, affiché en suffixe de chaque option. */
  counts,
}: {
  selected: CapsuleStatus[];
  onChange: (s: CapsuleStatus[]) => void;
  counts?: Partial<Record<CapsuleStatus, number>>;
}) {
  const { open, setOpen, ref, panelRef, panelStyle } = useDropdown();
  const active = selected.length > 0;

  const toggle = (s: CapsuleStatus) => {
    onChange(selected.includes(s) ? selected.filter((x) => x !== s) : [...selected, s]);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 ' +
          (active
            ? 'bg-sealed/15 border-sealed/40 text-sealed font-medium'
            : open
              ? 'border-text-muted/20 text-text-muted bg-text-muted/8'
              : 'border-text-muted/15 text-text-muted/60 hover:border-text-muted/30 hover:text-text-muted')
        }
        title="Filtrer les capsules temporelles par statut"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
        Capsules
        {selected.length > 0 && (
          <span className="ml-0.5 bg-sealed text-bg-primary rounded-full px-1.5 py-px text-[11px] font-bold leading-none">
            {selected.length}
          </span>
        )}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform duration-100 ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div ref={panelRef} style={panelStyle} className="absolute left-0 top-full mt-1.5 z-50 bg-bg-elevated border border-text-muted/15 rounded-xl shadow-soft overflow-hidden min-w-[150px]">
          <div className="py-1">
            {CAPSULE_OPTIONS.map((opt) => {
              const isActive = selected.includes(opt.value);
              const count = counts?.[opt.value];
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggle(opt.value)}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors hover:bg-text-muted/5 ${isActive ? 'text-sealed font-medium' : 'text-text-primary'}`}
                >
                  <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${isActive ? 'bg-sealed border-sealed' : 'border-text-muted/30'}`}>
                    {isActive && (
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${opt.dot}`} aria-hidden />
                  <span className="flex-1">{opt.label}</span>
                  {typeof count === 'number' && (
                    <span className={`text-[11px] tabular-nums ${isActive ? 'opacity-80' : 'text-text-muted/50'}`}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-text-muted/10 px-3 py-1.5">
              <button
                type="button"
                onClick={() => { onChange([]); setOpen(false); }}
                className="text-[11px] text-text-muted/50 hover:text-text-muted transition-colors"
              >
                Effacer la sélection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Favorites filter dropdown ────────────────────────────────────────────────

type FavoritesMode = 'any' | 'mine' | 'others' | 'owner';

/**
 * Dropdown « Favoris » — options adaptées au rôle du viewer.
 *
 * Côté Owner :
 *  - Tous les favoris
 *  - Mes favoris
 *  - Favoris des confidents
 *
 * Côté Guest (qui voit seulement sien + owner) :
 *  - Tous les favoris (sien + owner)
 *  - Mes favoris
 *  - Favoris du owner
 */
export function FavoritesFilterButton({
  value,
  onChange,
  viewerIsOwner,
  counts,
}: {
  value: FavoritesMode | null;
  onChange: (v: FavoritesMode | null) => void;
  viewerIsOwner: boolean;
  /** Counts optionnels par option (any / mine / others / owner). */
  counts?: Partial<Record<FavoritesMode, number>>;
}) {
  const { open, setOpen, ref, panelRef, panelStyle } = useDropdown();

  const options: Array<{ value: FavoritesMode; label: string }> = viewerIsOwner
    ? [
        { value: 'any',    label: 'Tous les favoris' },
        { value: 'mine',   label: 'Mes favoris' },
        { value: 'others', label: 'Favoris des confidents' },
      ]
    : [
        { value: 'any',   label: 'Tous les favoris' },
        { value: 'mine',  label: 'Mes favoris' },
        { value: 'owner', label: "Favoris de l'owner" },
      ];

  const active = value !== null;
  const currentLabel = value !== null
    ? (options.find((o) => o.value === value)?.label ?? 'Favoris')
    : 'Favoris';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 ' +
          (active
            ? 'bg-amber-400/15 border-amber-400/40 text-sealed font-medium'
            : open
              ? 'border-text-muted/20 text-text-muted bg-text-muted/8'
              : 'border-text-muted/15 text-text-muted/60 hover:border-text-muted/30 hover:text-text-muted')
        }
      >
        <svg viewBox="0 0 16 16" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 shrink-0" aria-hidden>
          <polygon points="8 1.5 10 6 14.5 6.5 11 9.5 12 14 8 11.5 4 14 5 9.5 1.5 6.5 6 6 8 1.5" />
        </svg>
        {currentLabel}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform duration-100 ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div ref={panelRef} style={panelStyle} className="absolute left-0 top-full mt-1.5 z-50 bg-bg-elevated border border-text-muted/15 rounded-xl shadow-soft overflow-hidden min-w-[180px]">
          <div className="py-1">
            {options.map((opt) => {
              const isActive = value === opt.value;
              const c = counts?.[opt.value];
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(isActive ? null : opt.value); setOpen(false); }}
                  className={
                    'w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors ' +
                    (isActive ? 'text-sealed font-medium bg-amber-400/8' : 'text-text-primary hover:bg-text-muted/5')
                  }
                >
                  <span
                    className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${isActive ? 'bg-amber-400/30 border-amber-400/80' : 'border-text-muted/30'}`}
                  >
                    {isActive && (
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="text-sealed">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  <span className="flex-1">{opt.label}</span>
                  {typeof c === 'number' && c > 0 && (
                    <span className="text-text-muted/55 text-[11px]">{c}</span>
                  )}
                </button>
              );
            })}
            {active && (
              <button
                type="button"
                onClick={() => { onChange(null); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-[11px] text-text-muted/60 hover:text-text-muted hover:bg-text-muted/5 border-t border-text-muted/10 mt-1"
              >
                ✕ Effacer le filtre
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── « Nul » filter dropdown ──────────────────────────────────────────────────

/**
 * Dropdown « Nul » — miroir de `FavoritesFilterButton` mais pour les LOW.
 * Options adaptées au rôle (owner : « des confidents » ; guest : « du owner »).
 */
export function LowFilterButton({
  value,
  onChange,
  viewerIsOwner,
  counts,
}: {
  value: FavoritesMode | null;
  onChange: (v: FavoritesMode | null) => void;
  viewerIsOwner: boolean;
  counts?: Partial<Record<FavoritesMode, number>>;
}) {
  const { open, setOpen, ref, panelRef, panelStyle } = useDropdown();

  // Trigger « À oublier » — dans le dropdown les labels sont contextualisés
  // (le contexte « à oublier » est implicite via le label du bouton parent).
  const options: Array<{ value: FavoritesMode; label: string }> = viewerIsOwner
    ? [
        { value: 'any',    label: 'Toutes' },
        { value: 'mine',   label: 'Les miennes' },
        { value: 'others', label: 'Des confidents' },
      ]
    : [
        { value: 'any',   label: 'Toutes' },
        { value: 'mine',  label: 'Les miennes' },
        { value: 'owner', label: "De l'owner" },
      ];

  const active = value !== null;
  const currentLabel = value !== null
    ? `À oublier — ${(options.find((o) => o.value === value)?.label ?? '').toLowerCase()}`
    : 'À oublier';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 ' +
          (active
            ? 'bg-text-muted/15 border-text-muted/40 text-text-muted/90 font-medium'
            : open
              ? 'border-text-muted/20 text-text-muted bg-text-muted/8'
              : 'border-text-muted/15 text-text-muted/60 hover:border-text-muted/30 hover:text-text-muted')
        }
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 shrink-0" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <line x1="5.5" y1="5.5" x2="18.5" y2="18.5" />
        </svg>
        {currentLabel}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform duration-100 ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div ref={panelRef} style={panelStyle} className="absolute left-0 top-full mt-1.5 z-50 bg-bg-elevated border border-text-muted/15 rounded-xl shadow-soft overflow-hidden min-w-[180px]">
          <div className="py-1">
            {options.map((opt) => {
              const isActive = value === opt.value;
              const c = counts?.[opt.value];
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(isActive ? null : opt.value); setOpen(false); }}
                  className={
                    'w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors ' +
                    (isActive ? 'text-text-muted/90 font-medium bg-text-muted/8' : 'text-text-primary hover:bg-text-muted/5')
                  }
                >
                  <span
                    className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${isActive ? 'bg-text-muted/30 border-text-muted/60' : 'border-text-muted/30'}`}
                  >
                    {isActive && (
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-primary">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  <span className="flex-1">{opt.label}</span>
                  {typeof c === 'number' && c > 0 && (
                    <span className="text-text-muted/55 text-[11px]">{c}</span>
                  )}
                </button>
              );
            })}
            {active && (
              <button
                type="button"
                onClick={() => { onChange(null); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-[11px] text-text-muted/60 hover:text-text-muted hover:bg-text-muted/5 border-t border-text-muted/10 mt-1"
              >
                ✕ Effacer le filtre
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── « Options » multi-select dropdown ─────────────────────────────────────────

/**
 * Dropdown multi-sélection qui consolide les anciens pills binaires :
 *   - Brouillons (filters.isDraft)
 *   - Pour toi   (filters.isForConfidant)
 *   - Secret     (filters.isSecret)
 *   - 18+        (externe — via `adultOnly` / `onAdultOnlyChange`)
 *
 * Chaque option ajoute une contrainte AND (la note doit matcher tous les flags
 * cochés). Le label du trigger reflète l'état :
 *   - 0 actif : « Options » (pas de filtre)
 *   - 1 actif : libellé de l'option
 *   - 2+ actifs : « Options · N »
 *
 * Les options « Pour toi » et « Secret » peuvent être masquées par contexte
 * (`hideForConfidant`, `hideSecret`) pour ne pas polluer l'UI côté confident.
 * L'option « 18+ » n'apparaît que si `onAdultOnlyChange` est fourni.
 */
export function StatesFilterButton({
  filters,
  onChange,
  hideForConfidant = false,
  hideSecret = false,
  adultOnly,
  onAdultOnlyChange,
  counts,
}: {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  hideForConfidant?: boolean;
  hideSecret?: boolean;
  adultOnly?: boolean;
  onAdultOnlyChange?: (v: boolean) => void;
  counts?: { draft?: number; forConfidant?: number; secret?: number; adult?: number };
}) {
  const { open, setOpen, ref, panelRef, panelStyle } = useDropdown();
  const showAdult = !!onAdultOnlyChange;

  type Opt = { key: 'draft' | 'forConfidant' | 'secret' | 'adult'; label: string; active: boolean; toggle: () => void; count?: number };
  const opts: Opt[] = [];
  opts.push({
    key: 'draft', label: 'Brouillons', active: filters.isDraft === true,
    toggle: () => onChange({ ...filters, isDraft: filters.isDraft === true ? null : true }),
    count: counts?.draft,
  });
  if (!hideForConfidant) {
    opts.push({
      key: 'forConfidant', label: 'Pour toi', active: filters.isForConfidant === true,
      toggle: () => onChange({ ...filters, isForConfidant: filters.isForConfidant === true ? null : true }),
      count: counts?.forConfidant,
    });
  }
  if (!hideSecret) {
    opts.push({
      key: 'secret', label: 'Secret', active: filters.isSecret === true,
      toggle: () => onChange({ ...filters, isSecret: filters.isSecret === true ? null : true }),
      count: counts?.secret,
    });
  }
  if (showAdult) {
    opts.push({
      key: 'adult', label: '18+', active: !!adultOnly,
      toggle: () => onAdultOnlyChange!(!adultOnly),
      count: counts?.adult,
    });
  }

  const activeOpts = opts.filter((o) => o.active);
  const triggerLabel = activeOpts.length === 0
    ? 'Options'
    : activeOpts.length === 1
      ? (activeOpts[0]?.label ?? 'Options')
      : `Options · ${activeOpts.length}`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 ' +
          (activeOpts.length > 0
            ? 'bg-accent/15 border-accent/40 text-accent font-medium'
            : open
              ? 'border-text-muted/20 text-text-muted bg-text-muted/8'
              : 'border-text-muted/15 text-text-muted/60 hover:border-text-muted/30 hover:text-text-muted')
        }
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 shrink-0" aria-hidden>
          <path d="M3 4h10M3 8h10M3 12h6" />
        </svg>
        {triggerLabel}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform duration-100 ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div ref={panelRef} style={panelStyle} className="absolute left-0 top-full mt-1.5 z-50 bg-bg-elevated border border-text-muted/15 rounded-xl shadow-soft overflow-hidden min-w-[180px]">
          <div className="py-1">
            {opts.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={opt.toggle}
                className={
                  'w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors ' +
                  (opt.active ? 'text-accent font-medium bg-accent/8' : 'text-text-primary hover:bg-text-muted/5')
                }
              >
                <span
                  className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${opt.active ? 'bg-accent/30 border-accent/60' : 'border-text-muted/30'}`}
                >
                  {opt.active && (
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                <span className="flex-1">{opt.label}</span>
                {typeof opt.count === 'number' && opt.count > 0 && !opt.active && (
                  <span className="text-text-muted/55 text-[11px]">{opt.count}</span>
                )}
              </button>
            ))}
            {activeOpts.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onChange({ ...filters, isDraft: null, isForConfidant: null, isSecret: null });
                  if (onAdultOnlyChange) onAdultOnlyChange(false);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-[11px] text-text-muted/60 hover:text-text-muted hover:bg-text-muted/5 border-t border-text-muted/10 mt-1"
              >
                ✕ Tout désélectionner
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main filters component ───────────────────────────────────────────────────

interface EntryFiltersProps {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  availableTypes: NoteType[];
  availableTags: string[];
  /** Comptes par tag (tag → nb d'entrées) affichés dans le dropdown du filtre. */
  tagCounts?: Record<string, number>;
  availableMoods?: string[];
  sortMode: SortMode;
  onSortChange: (m: SortMode) => void;
  /** Masquer le pill "Pour toi" (utile côté guest qui a déjà un toggle "Pour moi"). */
  hideForConfidantPill?: boolean;
  /** Masquer le pill "Secret" (côté confident, non pertinent). */
  hideSecretPill?: boolean;
  /** Masquer le dropdown "Visibilité" (côté confident, non pertinent). */
  hideVisibilityFilter?: boolean;
  /** Pills extra dans le bloc 2 (ex: Capsules, 18+). */
  quickPillsSlot?: ReactNode;
  /** Bloc 3 optionnel entre les quick pills et le bouton Filtres (ex: Lu / Non lu). */
  readPillsSlot?: ReactNode;
  /** Counts optionnels affichés dans les pills fixes (Brouillons, Pour toi, Secret). */
  counts?: { draft?: number; forConfidant?: number; secret?: number };
  /** Compteurs pour le dropdown Favoris (any/mine/others/owner). */
  favoritesCounts?: Partial<Record<'any' | 'mine' | 'others' | 'owner', number>>;
  /** Compteurs pour le dropdown Nul (any/mine/others/owner). */
  lowCounts?: Partial<Record<'any' | 'mine' | 'others' | 'owner', number>>;
  /** Si true, les dropdowns Favoris/Nul affichent les options « ... des
   *  confidents » ; si false, « ... du owner ». Défaut : true (Owner). */
  viewerIsOwner?: boolean;
  /** Liaison externe du filtre 18+ — si `onAdultOnlyChange` est fourni, l'option
   *  « 18+ » apparaît dans le dropdown Options. */
  adultOnly?: boolean;
  onAdultOnlyChange?: (v: boolean) => void;
  /** Compte d'entrées 18+ (affiché à droite de l'option dans le dropdown). */
  adultCount?: number;
  /** Masquer le SortPicker (si la page le gère elle-même dans sa search row). */
  hideSortPicker?: boolean;
  /** Afficher le dropdown "Verrou" (statut des notes verrouillées). */
  showReadGateFilter?: boolean;
  /** Masquer l'option "non répondu" dans le dropdown verrou (rare cas owner). */
  readGateHideUnanswered?: boolean;
  /** Counts par statut pour le dropdown verrou. */
  readGateCounts?: Partial<Record<ReadGateStatus, number>>;
  /** Afficher le dropdown "Capsules" (statut des capsules temporelles). */
  showCapsuleFilter?: boolean;
  /** Counts par statut pour le dropdown capsules. */
  capsuleCounts?: Partial<Record<CapsuleStatus, number>>;
}

export function EntryFilters({ filters, onChange, availableTypes, availableTags, tagCounts, availableMoods = [], sortMode, onSortChange, hideForConfidantPill = false, hideSecretPill = false, hideVisibilityFilter = false, quickPillsSlot, readPillsSlot, counts, favoritesCounts, lowCounts, viewerIsOwner = true, adultOnly, onAdultOnlyChange, adultCount, hideSortPicker = false, showReadGateFilter = false, readGateHideUnanswered = false, readGateCounts, showCapsuleFilter = false, capsuleCounts }: EntryFiltersProps) {
  const [dateOpen, setDateOpen] = useState(false);
  const hasDateFilter = !!filters.from || !!filters.to;

  const reset = () => { onChange(EMPTY_FILTERS); setDateOpen(false); };

  if (availableTypes.length === 0) return null;

  const PILL_INACTIVE = 'border-text-muted/15 text-text-muted/60 hover:border-text-muted/30 hover:text-text-muted';
  const quickPill = (active: boolean, activeClass: string) =>
    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 ' +
    (active ? activeClass : PILL_INACTIVE);

  return (
    <div className="flex flex-col gap-2">

      {/* ── Ligne principale ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 flex-wrap">

        {/* Date */}
        <button type="button" onClick={() => setDateOpen((v) => !v)} aria-label="Filtrer par date"
          className={
            'p-1.5 rounded-lg border transition-all duration-150 ' +
            (hasDateFilter ? 'border-accent/40 bg-accent/10 text-accent'
              : dateOpen ? 'border-text-muted/20 text-text-muted bg-text-muted/8'
              : 'border-transparent text-text-muted/50 hover:text-text-muted')
          }
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </button>

        {/* Types dropdown — `filters.types` peut contenir des clés `custom:<id>` ;
            le composant les gère en interne (cf. cast dans TypeFilterButton). */}
        <TypeFilterButton
          availableTypes={availableTypes}
          selected={filters.types as NoteType[]}
          onChange={(types) => onChange({ ...filters, types: types as TypeFilterKey[] })}
        />

        {/* Visibilité dropdown */}
        {!hideVisibilityFilter && (
          <VisibilityFilterButton
            value={filters.visibility}
            onChange={(visibility) => onChange({ ...filters, visibility })}
          />
        )}

        {/* Tags + Mood */}
        {availableTags.length > 0 && (
          <TagFilterButton availableTags={availableTags} selected={filters.tags} onChange={(tags) => onChange({ ...filters, tags })} counts={tagCounts} />
        )}
        {availableMoods.length > 0 && (
          <MoodFilterButton availableMoods={availableMoods} selected={filters.moods} onChange={(moods) => onChange({ ...filters, moods })} />
        )}

        {/* Verrou de lecture (statut) */}
        {showReadGateFilter && (
          <ReadGateFilterButton
            selected={filters.readGateStatuses}
            onChange={(readGateStatuses) => onChange({ ...filters, readGateStatuses })}
            hideUnanswered={readGateHideUnanswered}
            counts={readGateCounts}
          />
        )}

        {/* Capsules temporelles (statut) */}
        {showCapsuleFilter && (
          <CapsuleFilterButton
            selected={filters.capsuleStatuses}
            onChange={(capsuleStatuses) => onChange({ ...filters, capsuleStatuses })}
            counts={capsuleCounts}
          />
        )}

        {/* Favoris — dropdown (options adaptées au rôle du viewer) */}
        <FavoritesFilterButton
          value={filters.favoritesFilter}
          onChange={(favoritesFilter) => onChange({ ...filters, favoritesFilter })}
          viewerIsOwner={viewerIsOwner}
          counts={favoritesCounts}
        />

        {/* Nul — dropdown miroir de Favoris (LOW ratings) */}
        <LowFilterButton
          value={filters.lowFilter}
          onChange={(lowFilter) => onChange({ ...filters, lowFilter })}
          viewerIsOwner={viewerIsOwner}
          counts={lowCounts}
        />

        {/* États — dropdown multi-select (Brouillons / Pour toi / Secret / 18+) */}
        <StatesFilterButton
          filters={filters}
          onChange={onChange}
          hideForConfidant={hideForConfidantPill}
          hideSecret={hideSecretPill}
          adultOnly={adultOnly}
          onAdultOnlyChange={onAdultOnlyChange}
          counts={{
            draft: counts?.draft,
            forConfidant: counts?.forConfidant,
            secret: counts?.secret,
            adult: adultCount,
          }}
        />

        {/* Pills contextuelles inlinées (Lu/Non lu) */}
        {readPillsSlot}

        {/* Pills extras (Capsules…) */}
        {quickPillsSlot}

        {/* Sort — poussé à droite */}
        {!hideSortPicker && (
          <div className="ml-auto">
            <SortPicker mode={sortMode} onChange={onSortChange} />
          </div>
        )}
      </div>

      {/* ── Date inputs (si ouvert) ───────────────────────────────────────── */}
      {(dateOpen || hasDateFilter) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <DatePicker
            value={filters.from}
            onChange={(v) => onChange({ ...filters, from: v })}
            max={filters.to || undefined}
            placeholder="Depuis…"
            variant="pill"
          />
          <span className="text-xs text-text-muted/45">—</span>
          <DatePicker
            value={filters.to}
            onChange={(v) => onChange({ ...filters, to: v })}
            min={filters.from || undefined}
            placeholder="Jusqu'à…"
            variant="pill"
          />
          {hasDateFilter && (
            <button type="button" onClick={() => { onChange({ ...filters, from: '', to: '' }); setDateOpen(false); }} className="text-xs text-text-muted/50 hover:text-text-muted transition-colors">✕</button>
          )}
        </div>
      )}

      {/* Reset global */}
      {isFiltered(filters) && (
        <button type="button" onClick={reset} className="text-xs text-text-muted/50 hover:text-text-muted transition-colors self-start">
          Réinitialiser
        </button>
      )}
    </div>
  );
}

export function applyFilters<T extends { id: string; date: string; authorId?: string; noteType: NoteType; customTypeId?: string | null; tagNames?: string[]; isDraft?: boolean; visibility?: string; isForConfidant?: boolean; isSecret?: boolean; mood?: string | null; readGatePrompt?: string | null; unlockAt?: string | null; ratings?: Array<{ userId: string; value: 'FAVORITE' | 'LOW' }> }>(
  entries: T[],
  filters: FilterState,
  /**
   * Optionnel : pour chaque entrée verrouillée, retourne le set des statuts.
   *  - Owner : agrégat des réponses reçues (peut être vide → 'unanswered')
   *  - Confident : son propre statut (un seul)
   * Si non fourni mais qu'un filtre `readGateStatuses` est actif, les notes
   * verrouillées sont conservées sans filtrage statut (fail-open prudent).
   */
  gateStatusOf?: (e: T) => Set<ReadGateStatus>,
  /**
   * ID de l'utilisateur courant — requis pour `filters.favoritesFilter`. Si non
   * fourni alors qu'un filtre est actif, le filtre est ignoré (fail-open).
   */
  currentUserId?: string,
): T[] {
  return entries.filter((e) => {
    if (filters.types.length > 0) {
      // Une entrée matche si sa clé built-in (`noteType`) OU sa clé custom
      // (`custom:<customTypeId>`) est sélectionnée. Les built-ins restent
      // strictement identiques (jamais de customTypeId pour eux).
      const customKey = e.customTypeId ? (`custom:${e.customTypeId}` as TypeFilterKey) : null;
      const matches = filters.types.includes(e.noteType) || (customKey != null && filters.types.includes(customKey));
      if (!matches) return false;
    }
    if (filters.from && e.date < filters.from) return false;
    if (filters.to && e.date > filters.to) return false;
    if (filters.tags.length > 0) {
      const entryTags = e.tagNames ?? [];
      // Sentinel `__none__` : matche les entrées sans aucun tag. Cumulable
      // avec une sélection de tags réels (logique OR — l'entrée passe si
      // elle est sans tag OU si elle a l'un des tags choisis).
      const wantsNoTag = filters.tags.includes(NO_TAG_SENTINEL);
      const realSelected = filters.tags.filter((t) => t !== NO_TAG_SENTINEL);
      const noTagMatch = wantsNoTag && entryTags.length === 0;
      const realMatch = realSelected.length > 0 && realSelected.some((t) => entryTags.includes(t));
      if (!noTagMatch && !realMatch) return false;
    }
    if (filters.moods.length > 0) {
      if (!e.mood) return false;
      const graphemes = extractMoodGraphemes(e.mood);
      if (!filters.moods.some((m) => graphemes.includes(m))) return false;
    }
    if (filters.isDraft !== null && !!e.isDraft !== filters.isDraft) return false;
    if (filters.visibility !== null && e.visibility !== filters.visibility) return false;
    if (filters.isForConfidant !== null && !!e.isForConfidant !== filters.isForConfidant) return false;
    if (filters.isSecret !== null && !!e.isSecret !== filters.isSecret) return false;

    // Filtre capsule : exclut les non-capsules, puis matche sur statut (OR).
    if (filters.capsuleStatuses.length > 0) {
      if (!e.unlockAt) return false;
      const unlocked = new Date(e.unlockAt).getTime() <= Date.now();
      const status: CapsuleStatus = unlocked ? 'unlocked' : 'locked';
      if (!filters.capsuleStatuses.includes(status)) return false;
    }

    // Filtres favoris + à oublier — logique centralisée dans
    // `ratingMatchesFilter` pour rester en phase avec `Home.passesFilters`.
    if (!ratingMatchesFilter(e, filters.favoritesFilter, 'FAVORITE', currentUserId)) return false;
    if (!ratingMatchesFilter(e, filters.lowFilter, 'LOW', currentUserId)) return false;

    // Filtre verrou : exclut les non-verrouillées, puis matche sur statut (OR).
    if (filters.readGateStatuses.length > 0) {
      if (!e.readGatePrompt) return false;
      if (gateStatusOf) {
        const statuses = gateStatusOf(e);
        const hasUnanswered = statuses.size === 0;
        const wantUnanswered = filters.readGateStatuses.includes('unanswered');
        if (hasUnanswered) {
          if (!wantUnanswered) return false;
        } else {
          if (!filters.readGateStatuses.some((s) => statuses.has(s))) return false;
        }
      }
    }
    return true;
  });
}

/** Construit la liste des moods uniques rencontrés dans les entrées (triée par fréquence desc) */
export function collectAvailableMoods<T extends { mood?: string | null }>(entries: T[]): string[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    if (!e.mood) continue;
    for (const g of extractMoodGraphemes(e.mood)) {
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m);
}
