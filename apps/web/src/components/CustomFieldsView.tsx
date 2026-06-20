import type { NoteTypeFieldDef } from '@carnet/schemas';
import {
  type CustomFieldValue,
  type CustomFieldValues,
  isFieldFilled,
  formatFieldValue,
} from '../lib/customFields';

/**
 * Vue lecture des champs personnalisés d'une note custom (owner + confident).
 * Présentation pure, compacte : `label : valeur`, uniquement les champs
 * RENSEIGNÉS (`isFieldFilled`). Renvoie `null` si rien n'est rempli.
 *
 * Rendus riches selon le type : rating → étoiles, multiselect → chips,
 * checkbox → « Oui », date → formatée (via `formatFieldValue`).
 */
export function CustomFieldsView({
  fields,
  values,
}: {
  fields: NoteTypeFieldDef[];
  values: CustomFieldValues;
}) {
  const filled = fields.filter((f) => isFieldFilled(f, values[f.id] ?? null));
  if (filled.length === 0) return null;

  return (
    <dl className="flex flex-col gap-2 mb-4 rounded-xl border border-text-muted/10 bg-bg-primary/40 px-3.5 py-3">
      {filled.map((field) => (
        <div key={field.id} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
          <dt className="text-xs text-text-muted/70 shrink-0 sm:w-32">{field.label}</dt>
          <dd className="flex-1 min-w-0 text-sm text-text-primary">
            <FieldValue field={field} value={values[field.id] ?? null} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

const STAR_VALUES = [1, 2, 3, 4, 5];

function FieldValue({ field, value }: { field: NoteTypeFieldDef; value: CustomFieldValue }) {
  if (field.type === 'rating' && typeof value === 'number') {
    return (
      <span className="inline-flex gap-0.5" aria-label={`${value} sur 5`}>
        {STAR_VALUES.map((n) => (
          <span
            key={n}
            className={n <= value ? 'opacity-100' : 'opacity-20'}
            style={{ color: 'var(--color-accent)' }}
          >
            ★
          </span>
        ))}
      </span>
    );
  }

  if (field.type === 'multiselect' && Array.isArray(value)) {
    return (
      <span className="inline-flex flex-wrap gap-1.5">
        {value.map((opt) => (
          <span key={opt} className="text-xs bg-text-muted/8 text-text-muted px-2 py-0.5 rounded-full">
            {opt}
          </span>
        ))}
      </span>
    );
  }

  // checkbox → « Oui », date → formatée, reste → texte (cf. formatFieldValue).
  return <>{formatFieldValue(field, value)}</>;
}
