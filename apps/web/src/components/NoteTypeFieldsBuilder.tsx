import type { NoteTypeFieldDef, NoteTypeFieldType } from '@carnet/schemas';
import { useBufferedInput } from '../hooks/useBufferedInput';
import { SelectMenu, type SelectMenuOption } from './SelectMenu';

/**
 * Constructeur de champs perso d'un type de note (Réglages → Types de notes).
 *
 * Chaque type custom peut porter des **champs définis par l'owner** (`fields`)
 * qui apparaissent ensuite sur chaque note de ce type. Ce composant édite la
 * liste : une rangée par champ (libellé + widget + options pour les listes),
 * avec ajout / suppression / réordonnancement (flèches ↑/↓).
 *
 * Contrôlé : lit `fields`, remonte chaque modif via `onChange`. Les champs texte
 * sont **tamponnés** (`useBufferedInput`, commit au blur) comme les autres
 * builders (Agenda/Budget) pour éviter les sauts de curseur et casser la
 * composition des touches mortes.
 */

const MAX_FIELDS = 40;
const MAX_OPTIONS = 30;

/** Libellés FR des widgets, dans l'ordre du select. */
const FIELD_TYPE_OPTIONS: SelectMenuOption<NoteTypeFieldType>[] = [
  { value: 'text', label: 'Texte' },
  { value: 'longtext', label: 'Texte long' },
  { value: 'number', label: 'Nombre' },
  { value: 'date', label: 'Date' },
  { value: 'checkbox', label: 'Case à cocher' },
  { value: 'rating', label: 'Note' },
  { value: 'select', label: 'Liste déroulante' },
  { value: 'multiselect', label: 'Liste multi-choix' },
];

/** Vrai pour les widgets qui portent une liste d'options éditable. */
function hasOptions(type: NoteTypeFieldType): boolean {
  return type === 'select' || type === 'multiselect';
}

export function NoteTypeFieldsBuilder({
  fields,
  onChange,
}: {
  fields: NoteTypeFieldDef[];
  onChange: (next: NoteTypeFieldDef[]) => void;
}) {
  const patch = (id: string, p: Partial<NoteTypeFieldDef>) =>
    onChange(fields.map((f) => (f.id === id ? { ...f, ...p } : f)));

  const add = () => {
    if (fields.length >= MAX_FIELDS) return;
    onChange([...fields, { id: crypto.randomUUID().slice(0, 8), label: '', type: 'text' }]);
  };

  const remove = (id: string) => onChange(fields.filter((f) => f.id !== id));

  // Échange deux rangées → modifie l'ordre d'affichage des champs sur la note.
  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    const a = next[index]!;
    next[index] = next[target]!;
    next[target] = a;
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-mono uppercase tracking-widest text-text-muted/55">Champs perso</p>
      <p className="text-[11px] text-text-muted/55 -mt-0.5">
        Ces champs apparaissent sur chaque note de ce type. Tu peux en ajouter autant que tu veux.
      </p>

      {fields.length === 0 ? (
        <p className="text-xs text-text-muted/55 italic mt-0.5">Aucun champ pour l'instant.</p>
      ) : (
        <div className="flex flex-col gap-2 mt-0.5">
          {fields.map((field, index) => (
            <FieldRow
              key={field.id}
              field={field}
              onPatch={(p) => patch(field.id, p)}
              onRemove={() => remove(field.id)}
              canUp={index > 0}
              canDown={index < fields.length - 1}
              onMoveUp={() => move(index, -1)}
              onMoveDown={() => move(index, 1)}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={add}
        disabled={fields.length >= MAX_FIELDS}
        className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-accent/10 text-accent border border-accent/20 hover:bg-accent/15 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        Ajouter un champ
      </button>
    </div>
  );
}

/** Une rangée de champ — libellé tamponné (commit au blur), type immédiat. */
function FieldRow({
  field,
  onPatch,
  onRemove,
  canUp,
  canDown,
  onMoveUp,
  onMoveDown,
}: {
  field: NoteTypeFieldDef;
  onPatch: (p: Partial<NoteTypeFieldDef>) => void;
  onRemove: () => void;
  canUp: boolean;
  canDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const label = useBufferedInput(field.label, (v) => onPatch({ label: v.slice(0, 40) }));

  // Changer de widget : on conserve `options` seulement quand le nouveau type en
  // a besoin (sinon on purge pour ne pas traîner des données invisibles).
  const changeType = (type: NoteTypeFieldType) => {
    if (hasOptions(type)) {
      onPatch({ type, options: field.options ?? [] });
    } else {
      onPatch({ type, options: undefined });
    }
  };

  return (
    <div className="rounded-xl border border-text-muted/12 bg-bg-primary/40 p-2.5 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {/* Réordonner */}
        <div className="shrink-0 flex flex-col -my-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canUp}
            aria-label="Monter le champ"
            className="w-6 h-5 flex items-center justify-center rounded text-text-muted/60 hover:text-accent hover:bg-text-muted/8 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-text-muted/60 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canDown}
            aria-label="Descendre le champ"
            className="w-6 h-5 flex items-center justify-center rounded text-text-muted/60 hover:text-accent hover:bg-text-muted/8 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-text-muted/60 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </button>
        </div>

        <input
          {...label}
          maxLength={40}
          placeholder="Nom du champ…"
          className="flex-1 min-w-0 bg-transparent text-sm text-text-primary placeholder:text-text-muted/40 outline-none border-b border-text-muted/10 focus:border-accent/30 pb-1 transition-colors"
        />

        <button
          type="button"
          onClick={onRemove}
          aria-label="Supprimer le champ"
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-text-muted/55 hover:text-danger hover:bg-danger/10 transition-colors"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 pl-8">
        <div className="inline-flex items-center gap-1.5 text-[11px] text-text-muted">
          <span className="shrink-0">Type</span>
          <SelectMenu
            value={field.type}
            options={FIELD_TYPE_OPTIONS}
            onChange={(t) => changeType(t)}
            ariaLabel="Type de champ"
            buttonClassName="inline-flex items-center justify-between gap-2 min-w-[140px] bg-bg-primary border border-text-muted/15 rounded-lg px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-accent/30 hover:border-text-muted/30 transition-colors"
          />
        </div>
      </div>

      {hasOptions(field.type) && (
        <div className="pl-8">
          <OptionsEditor
            options={field.options ?? []}
            onChange={(opts) => onPatch({ options: opts })}
          />
        </div>
      )}
    </div>
  );
}

/** Éditeur d'options d'une liste (chips supprimables + saisie d'une option). */
function OptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (next: string[]) => void;
}) {
  const draft = useBufferedInput('', () => undefined);

  const addOption = (raw: string) => {
    const v = raw.trim().slice(0, 60);
    if (!v || options.length >= MAX_OPTIONS) return;
    if (options.some((o) => o.toLowerCase() === v.toLowerCase())) return;
    onChange([...options, v]);
  };

  const removeOption = (index: number) => onChange(options.filter((_, i) => i !== index));

  const commitDraft = () => {
    addOption(draft.value);
    draft.onChange({ target: { value: '' } } as React.ChangeEvent<HTMLInputElement>);
  };

  return (
    <div className="flex flex-col gap-2">
      {options.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {options.map((opt, i) => (
            <span
              key={`${opt}-${i}`}
              className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs bg-text-muted/8 text-text-primary"
            >
              <span className="max-w-[160px] truncate">{opt}</span>
              <button
                type="button"
                onClick={() => removeOption(i)}
                aria-label={`Retirer ${opt}`}
                className="w-5 h-5 flex items-center justify-center rounded-full text-text-muted/60 hover:text-danger hover:bg-danger/10 transition-colors"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          {...draft}
          maxLength={60}
          placeholder={options.length >= MAX_OPTIONS ? 'Maximum atteint' : 'Ajouter une option…'}
          disabled={options.length >= MAX_OPTIONS}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitDraft();
            }
          }}
          onBlur={(e) => {
            draft.onBlur();
            if (e.target.value.trim()) commitDraft();
          }}
          className="flex-1 min-w-0 bg-bg-primary border border-text-muted/15 rounded-lg px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted/40 outline-none focus:border-accent/30 disabled:opacity-50 transition-colors"
        />
        <button
          type="button"
          onClick={commitDraft}
          disabled={!draft.value.trim() || options.length >= MAX_OPTIONS}
          className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-text-muted/10 text-text-primary hover:bg-text-muted/15 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Ajouter
        </button>
      </div>
    </div>
  );
}
