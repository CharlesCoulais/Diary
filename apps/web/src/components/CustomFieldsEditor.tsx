import type { NoteTypeFieldDef } from '@carnet/schemas';
import { useBufferedInput } from '../hooks/useBufferedInput';
import {
  type CustomFieldValue,
  type CustomFieldValues,
  defaultFieldValue,
} from '../lib/customFields';
import { SelectMenu, type SelectMenuOption } from './SelectMenu';
import { Switch } from './Switch';

/**
 * Éditeur des champs personnalisés d'un type de note custom (owner only).
 * Contrôlé : lit `values` (Record<fieldId, valeur>), remonte chaque modif via
 * `onChange` avec un objet `values` neuf. Les valeurs manquantes sont
 * initialisées à la volée via `defaultFieldValue`.
 *
 * Un widget par `field.type` (cf. NoteTypeFieldType) : text/longtext/number/
 * date/checkbox/rating/select/multiselect. Les champs texte/nombre sont
 * **tamponnés** (commit au blur, `useBufferedInput`) pour ne pas casser le
 * curseur ni les touches mortes à chaque frappe.
 *
 * Style aligné sur les panneaux structurés (AgendaEventBuilder/BudgetBuilder) :
 * en-tête « Champs » en `font-mono uppercase`, séparateur supérieur.
 */
export function CustomFieldsEditor({
  fields,
  values,
  onChange,
}: {
  fields: NoteTypeFieldDef[];
  values: CustomFieldValues;
  onChange: (next: CustomFieldValues) => void;
}) {
  if (fields.length === 0) return null;

  const setValue = (id: string, value: CustomFieldValue) => {
    onChange({ ...values, [id]: value });
  };

  return (
    <div className="flex flex-col gap-3 py-3 border-t border-text-muted/10">
      <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted/50">Champs</p>
      <div className="flex flex-col gap-3">
        {fields.map((field) => {
          const value = field.id in values ? values[field.id] : defaultFieldValue(field);
          return (
            <FieldRow
              key={field.id}
              field={field}
              value={value ?? defaultFieldValue(field)}
              onChange={(v) => setValue(field.id, v)}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Un champ : label au-dessus, widget en dessous (lisible en colonne étroite mobile). */
function FieldRow({
  field,
  value,
  onChange,
}: {
  field: NoteTypeFieldDef;
  value: CustomFieldValue;
  onChange: (v: CustomFieldValue) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-text-muted">{field.label}</label>
      <FieldWidget field={field} value={value} onChange={onChange} />
    </div>
  );
}

function FieldWidget({
  field,
  value,
  onChange,
}: {
  field: NoteTypeFieldDef;
  value: CustomFieldValue;
  onChange: (v: CustomFieldValue) => void;
}) {
  switch (field.type) {
    case 'text':
      return <BufferedText value={typeof value === 'string' ? value : ''} onCommit={(v) => onChange(v)} />;

    case 'longtext':
      return <BufferedTextarea value={typeof value === 'string' ? value : ''} onCommit={(v) => onChange(v)} />;

    case 'number':
      return (
        <BufferedNumber
          value={typeof value === 'number' ? value : null}
          onCommit={(v) => onChange(v)}
        />
      );

    case 'date':
      return (
        <input
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || '')}
          className="bg-bg-primary border border-text-muted/15 rounded-lg px-2.5 py-2 text-sm text-text-primary outline-none focus:border-accent/30 transition-colors"
        />
      );

    case 'checkbox':
      return (
        <Switch
          checked={value === true}
          onChange={(v) => onChange(v)}
          aria-label={field.label}
        />
      );

    case 'rating':
      return (
        <StarRatingField
          value={typeof value === 'number' ? value : null}
          onChange={(v) => onChange(v)}
        />
      );

    case 'select': {
      // Option vide en tête (« — » = aucune valeur) + les options définies.
      const selectOptions: SelectMenuOption<string>[] = [
        { value: '', label: '—' },
        ...(field.options ?? []).map((opt) => ({ value: opt, label: opt })),
      ];
      return (
        <div className="self-start min-w-[160px]">
          <SelectMenu
            value={typeof value === 'string' ? value : ''}
            options={selectOptions}
            onChange={(v) => onChange(v || '')}
            ariaLabel={field.label || 'Choisir une valeur'}
            buttonClassName="inline-flex items-center justify-between gap-2 w-full min-w-0 bg-bg-primary border border-text-muted/15 rounded-lg px-2.5 py-2 text-sm text-text-primary outline-none focus:border-accent/30 hover:border-text-muted/30 transition-colors"
          />
        </div>
      );
    }

    case 'multiselect':
      return (
        <MultiSelectChips
          options={field.options ?? []}
          value={Array.isArray(value) ? value : []}
          onChange={(v) => onChange(v)}
        />
      );

    default:
      return null;
  }
}

/** Champ texte tamponné (commit au blur). */
function BufferedText({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const buf = useBufferedInput(value, (v) => onCommit(v));
  return (
    <input
      {...buf}
      type="text"
      className="bg-bg-primary border border-text-muted/15 rounded-lg px-2.5 py-2 text-sm text-text-primary placeholder:text-text-muted/40 outline-none focus:border-accent/30 transition-colors"
    />
  );
}

/** Zone de texte longue tamponnée (commit au blur). */
function BufferedTextarea({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const buf = useBufferedInput(value, (v) => onCommit(v));
  return (
    <textarea
      value={buf.value}
      onChange={(e) => buf.onChange(e as unknown as React.ChangeEvent<HTMLInputElement>)}
      onFocus={buf.onFocus}
      onBlur={buf.onBlur}
      rows={3}
      className="bg-bg-primary border border-text-muted/15 rounded-lg px-2.5 py-2 text-sm text-text-primary placeholder:text-text-muted/40 outline-none focus:border-accent/30 transition-colors resize-y min-h-[68px]"
    />
  );
}

/** Champ nombre tamponné : commit au blur, vide → null. */
function BufferedNumber({ value, onCommit }: { value: number | null; onCommit: (v: number | null) => void }) {
  const buf = useBufferedInput(value, (raw) => {
    const trimmed = raw.trim();
    if (trimmed === '') return onCommit(null);
    const n = Number(trimmed);
    onCommit(Number.isFinite(n) ? n : null);
  });
  return (
    <input
      {...buf}
      type="number"
      inputMode="decimal"
      className="bg-bg-primary border border-text-muted/15 rounded-lg px-2.5 py-2 text-sm text-text-primary placeholder:text-text-muted/40 outline-none focus:border-accent/30 transition-colors w-32"
    />
  );
}

const STAR_VALUES = [1, 2, 3, 4, 5];

/** Note 1-5 par étoiles : clic pour fixer, re-clic sur la même étoile pour effacer. */
function StarRatingField({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex gap-1.5">
      {STAR_VALUES.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          className={
            'text-xl leading-none p-0.5 transition-all duration-100 ' +
            (value != null && n <= value ? 'opacity-100' : 'opacity-20 hover:opacity-50')
          }
          style={{ color: 'var(--color-accent)' }}
          aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

/** Multiselect : chips à bascule (valeur = tableau des options sélectionnées). */
function MultiSelectChips({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (opt: string) => {
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  };
  if (options.length === 0) {
    return <p className="text-xs text-text-muted/50 italic">Aucune option définie.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = value.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={
              'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ' +
              (active
                ? 'bg-accent/15 text-accent border-accent/30'
                : 'bg-bg-primary text-text-muted border-text-muted/15 hover:border-text-muted/30')
            }
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
