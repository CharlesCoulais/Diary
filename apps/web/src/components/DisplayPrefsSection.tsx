import { NOTE_TYPE_CONFIG, noteTint, type NoteType } from './NoteTypePicker';
import { Switch } from './Switch';
import { useOwnerDisplayPrefs, useGuestDisplayPrefs, useTaskDisplayPrefs, type GuestFocus, type FilDefaultView, type SortMode } from '../lib/displayPrefs';
import type { LocalTask } from '../lib/db/schema';

const SORT_MODE_OPTIONS: { value: SortMode; label: string; helper: string }[] = [
  { value: 'time-desc',    label: 'Heure récente',      helper: "Plus récent d'abord (date + heure d'écriture)." },
  { value: 'time-asc',     label: 'Heure ancienne',     helper: "Plus ancien d'abord." },
  { value: 'updated-desc', label: 'Modification récente', helper: 'Notes éditées récemment en haut — vue à plat.' },
  { value: 'updated-asc',  label: 'Modification ancienne', helper: 'Notes non touchées depuis longtemps en haut.' },
];

function SortModePicker({ value, onChange }: { value: SortMode; onChange: (v: SortMode) => void }) {
  return (
    <div className="mt-4">
      <p className="text-xs text-text-muted/60">Tri par défaut — Journal</p>
      <p className="text-[11px] text-text-muted/55 mt-0.5">
        Réappliqué à chaque ouverture du Journal. Si tu changes le tri via la barre de filtres,
        le choix reste valable jusqu'au prochain refresh. (Aujourd'hui garde son propre tri persisté.)
      </p>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {SORT_MODE_OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              title={opt.helper}
              className={
                'px-3 py-1.5 rounded-full text-xs border transition-all duration-150 ' +
                (active
                  ? 'border-accent/40 bg-accent/10 text-accent font-medium'
                  : 'border-text-muted/15 text-text-muted hover:border-text-muted/30')
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-text-muted/50 mt-1.5 italic">
        {SORT_MODE_OPTIONS.find((o) => o.value === value)?.helper}
      </p>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  // Wrapper texte + Switch partagé (cf. components/Switch.tsx).
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-sm text-text-primary">{label}</span>
      <Switch checked={checked} onChange={onChange} aria-label={label} />
    </div>
  );
}

function TypePills({ selected, onToggle, multi }: { selected: NoteType[]; onToggle: (t: NoteType) => void; multi: boolean }) {
  const isAll = selected.length === 0;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {!multi && (
        <button
          type="button"
          onClick={() => selected.forEach((t) => onToggle(t))}
          className={`px-3 py-1.5 rounded-full text-xs border transition-all duration-150 ${
            isAll ? 'border-accent/40 bg-accent/10 text-accent font-medium' : 'border-text-muted/15 text-text-muted hover:border-text-muted/30'
          }`}
        >
          Tous
        </button>
      )}
      {NOTE_TYPE_CONFIG.map((cfg) => {
        const active = selected.includes(cfg.value);
        return (
          <button
            key={cfg.value}
            type="button"
            onClick={() => onToggle(cfg.value)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-all duration-150 ${
              active
                ? 'border-transparent font-medium'
                : 'border-text-muted/15 text-text-muted hover:border-text-muted/30'
            }`}
            style={active ? { backgroundColor: noteTint(cfg.color, 13), color: cfg.color, borderColor: noteTint(cfg.color, 31) } : {}}
          >
            <cfg.Icon className="w-3.5 h-3.5 shrink-0" /> {cfg.label}
          </button>
        );
      })}
      {multi && !isAll && (
        <button
          type="button"
          onClick={() => selected.forEach((t) => onToggle(t))}
          className="px-3 py-1.5 rounded-full text-xs border border-text-muted/15 text-text-muted/50 hover:text-text-muted transition-colors"
        >
          Tout afficher
        </button>
      )}
    </div>
  );
}

export function OwnerDisplayPrefsSection() {
  const [prefs, update] = useOwnerDisplayPrefs();

  const toggleType = (t: NoteType) => {
    const next = prefs.defaultTypes.includes(t)
      ? prefs.defaultTypes.filter((x) => x !== t)
      : [...prefs.defaultTypes, t];
    update({ defaultTypes: next });
  };

  return (
    <section className="bg-bg-elevated rounded-2xl px-6 py-5 shadow-soft">
      <h2 className="text-sm font-medium text-text-muted uppercase tracking-wide mb-1">Affichage par défaut</h2>
      <p className="text-xs text-text-muted/60 mb-3">S'applique à l'ouverture du journal.</p>

      <div className="divide-y divide-text-muted/8">
        <Toggle
          label="Masquer les brouillons"
          checked={prefs.hideDrafts}
          onChange={(v) => update({ hideDrafts: v })}
        />
        <Toggle
          label="Masquer le contenu 18+"
          checked={prefs.hideAdult}
          onChange={(v) => update({ hideAdult: v })}
        />
        <Toggle
          label="Masquer mes notes « à oublier »"
          checked={prefs.hideMyForgotten}
          onChange={(v) => update({ hideMyForgotten: v })}
        />
        {/* Mode compact par page — synchronisé avec le bouton de toggle dans la
            barre de filtres de chaque page. */}
        <Toggle
          label="Mode compact — Aujourd'hui"
          checked={prefs.compactToday}
          onChange={(v) => update({ compactToday: v })}
        />
        <Toggle
          label="Mode compact — Journal"
          checked={prefs.compactJournal}
          onChange={(v) => update({ compactJournal: v })}
        />
      </div>

      <div className="mt-3">
        <p className="text-xs text-text-muted/60">Types de notes à afficher</p>
        <p className="text-[11px] text-text-muted/55 mt-0.5">Vide = tous les types</p>
        <TypePills
          selected={prefs.defaultTypes}
          onToggle={toggleType}
          multi={true}
        />
      </div>

      <SortModePicker
        value={prefs.defaultSortMode}
        onChange={(v) => update({ defaultSortMode: v })}
      />

      <FilDefaultViewPicker
        value={prefs.filDefaultView}
        onChange={(v) => update({ filDefaultView: v })}
      />
    </section>
  );
}

export function GuestDisplayPrefsSection({ isConfidant }: { isConfidant: boolean }) {
  const [prefs, update] = useGuestDisplayPrefs();

  const toggleType = (t: NoteType) => {
    const next = prefs.defaultTypes.includes(t)
      ? prefs.defaultTypes.filter((x) => x !== t)
      : [...prefs.defaultTypes, t];
    update({ defaultTypes: next });
  };

  return (
    <section className="bg-bg-elevated rounded-2xl px-6 py-5 shadow-soft">
      <h2 className="text-sm font-medium text-text-muted uppercase tracking-wide mb-1">Affichage par défaut</h2>
      <p className="text-xs text-text-muted/60 mb-3">S'applique à l'ouverture du journal.</p>

      <div className="divide-y divide-text-muted/8">
        <Toggle
          label="Masquer les brouillons"
          checked={prefs.hideDrafts}
          onChange={(v) => update({ hideDrafts: v })}
        />
        <Toggle
          label="Masquer le contenu 18+"
          checked={prefs.hideAdult}
          onChange={(v) => update({ hideAdult: v })}
        />
        <Toggle
          label="Masquer mes notes « à oublier »"
          checked={prefs.hideMyForgotten}
          onChange={(v) => update({ hideMyForgotten: v })}
        />
        {/* Mode compact par page côté confident — Aujourd'hui = GuestDay, Journal = GuestHome. */}
        <Toggle
          label="Mode compact — Aujourd'hui"
          checked={prefs.compactToday}
          onChange={(v) => update({ compactToday: v })}
        />
        <Toggle
          label="Mode compact — Journal"
          checked={prefs.compactJournal}
          onChange={(v) => update({ compactJournal: v })}
        />
      </div>

      <div className="mt-4">
        <p className="text-xs text-text-muted/60">Focus à l'ouverture</p>
        <p className="text-[11px] text-text-muted/55 mt-0.5">Tu peux affiner ensuite avec les pills sur la page.</p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {([
            { value: 'all', label: 'Tout' },
            { value: 'unread', label: 'Non lus' },
            { value: 'edits', label: 'Avec ajouts récents' },
            ...(isConfidant ? [{ value: 'forMe' as const, label: 'Pour moi' }] : []),
          ] as { value: GuestFocus; label: string }[]).map((opt) => {
            const active = prefs.focus === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => update({ focus: opt.value })}
                className={
                  'px-3 py-1.5 rounded-full text-xs border transition-all duration-150 ' +
                  (active
                    ? 'border-accent/40 bg-accent/10 text-accent font-medium'
                    : 'border-text-muted/15 text-text-muted hover:border-text-muted/30')
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3">
        <p className="text-xs text-text-muted/60">Types de notes à afficher</p>
        <p className="text-[11px] text-text-muted/55 mt-0.5">Vide = tous les types</p>
        <TypePills
          selected={prefs.defaultTypes}
          onToggle={toggleType}
          multi={true}
        />
      </div>

      <SortModePicker
        value={prefs.defaultSortMode}
        onChange={(v) => update({ defaultSortMode: v })}
      />

      <FilDefaultViewPicker
        value={prefs.filDefaultView}
        onChange={(v) => update({ filDefaultView: v })}
      />
    </section>
  );
}

function FilDefaultViewPicker({ value, onChange }: { value: FilDefaultView; onChange: (v: FilDefaultView) => void }) {
  const opts: { value: FilDefaultView; label: string }[] = [
    { value: 'all', label: 'Tous' },
    { value: 'to-reply', label: 'À répondre' },
    { value: 'replied', label: 'Répondu' },
    { value: 'closed', label: 'Fermé' },
  ];
  return (
    <div className="mt-4">
      <p className="text-xs text-text-muted/60">Vue par défaut sur le Fil</p>
      <p className="text-[11px] text-text-muted/55 mt-0.5">Filtre actif à l'ouverture de la page Fil.</p>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {opts.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={
                'px-3 py-1.5 rounded-full text-xs border transition-all duration-150 ' +
                (active
                  ? 'border-accent/40 bg-accent/10 text-accent font-medium'
                  : 'border-text-muted/15 text-text-muted hover:border-text-muted/30')
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const STATUS_FILTER_OPTIONS: { value: LocalTask['status']; label: string }[] = [
  { value: 'OPEN', label: 'Ouvert' },
  { value: 'SCHEDULED', label: 'Planifié' },
  { value: 'IN_PROGRESS', label: 'En cours' },
  { value: 'LOCAL_DONE', label: 'Local' },
  { value: 'DEPLOYED', label: 'Déployé' },
  { value: 'TO_TEST', label: 'Test' },
  { value: 'DONE', label: 'Fait' },
  { value: 'CANCELLED', label: 'Annulé' },
];

const PRIORITY_FILTER_OPTIONS: { value: 'HIGH' | 'MEDIUM' | 'LOW' | '__none__'; label: string }[] = [
  { value: 'HIGH', label: '↑ Haute' },
  { value: 'MEDIUM', label: '→ Moy.' },
  { value: 'LOW', label: '↓ Basse' },
  { value: '__none__', label: 'Aucune' },
];

const PILL_BASE = 'px-3 py-1.5 rounded-full text-xs border transition-all duration-150';
const PILL_INACTIVE_DP = 'border-text-muted/15 text-text-muted hover:border-text-muted/30';
const PILL_ACTIVE_DP = 'border-accent/40 bg-accent/10 text-accent font-medium';

export function TaskDisplayPrefsSection() {
  const [prefs, update] = useTaskDisplayPrefs();

  const toggleStatus = (value: LocalTask['status']) => {
    const next = prefs.defaultStatusFilter.includes(value)
      ? prefs.defaultStatusFilter.filter((v) => v !== value)
      : [...prefs.defaultStatusFilter, value];
    update({ defaultStatusFilter: next });
  };

  const togglePriority = (value: 'HIGH' | 'MEDIUM' | 'LOW' | '__none__') => {
    const next = prefs.defaultPriorityFilter.includes(value)
      ? prefs.defaultPriorityFilter.filter((v) => v !== value)
      : [...prefs.defaultPriorityFilter, value];
    update({ defaultPriorityFilter: next });
  };

  return (
    <section className="bg-bg-elevated rounded-2xl px-6 py-5 shadow-soft">
      <h2 className="text-sm font-medium text-text-muted uppercase tracking-wide mb-1">Tâches — affichage par défaut</h2>
      <p className="text-xs text-text-muted/60 mb-3">S'applique à l'ouverture de la page tâches.</p>

      <div className="divide-y divide-text-muted/8">
        <Toggle
          label="Masquer les terminées / annulées"
          checked={prefs.hideCompleted}
          onChange={(v) => update({ hideCompleted: v })}
        />
      </div>

      <div className="mt-4">
        <p className="text-xs text-text-muted/60 mb-2">Filtre statut par défaut</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => update({ defaultStatusFilter: [] })}
            className={`${PILL_BASE} ${prefs.defaultStatusFilter.length === 0 ? PILL_ACTIVE_DP : PILL_INACTIVE_DP}`}
          >
            Tout
          </button>
          {STATUS_FILTER_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => toggleStatus(value)}
              className={`${PILL_BASE} ${prefs.defaultStatusFilter.includes(value) ? PILL_ACTIVE_DP : PILL_INACTIVE_DP}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs text-text-muted/60 mb-2">Filtre priorité par défaut</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => update({ defaultPriorityFilter: [] })}
            className={`${PILL_BASE} ${prefs.defaultPriorityFilter.length === 0 ? PILL_ACTIVE_DP : PILL_INACTIVE_DP}`}
          >
            Toutes
          </button>
          {PRIORITY_FILTER_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => togglePriority(value)}
              className={`${PILL_BASE} ${prefs.defaultPriorityFilter.includes(value) ? PILL_ACTIVE_DP : PILL_INACTIVE_DP}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
