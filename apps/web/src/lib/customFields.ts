import type { NoteTypeFieldDef } from '@carnet/schemas';
import { formatDateLong } from './dateHelpers';

/**
 * Champs meta personnalisés des types de note custom — helpers purs (valeur par
 * défaut, test « rempli », formatage texte). Source unique partagée par
 * l'éditeur (CustomFieldsEditor), la lecture (CustomFieldsView) et les tests.
 *
 * Une valeur est typée selon le widget du champ :
 *  - string  : text / longtext / date (ISO) / select
 *  - number  : number / rating (1-5)
 *  - boolean : checkbox
 *  - string[]: multiselect
 */
export type CustomFieldValue = string | number | boolean | string[] | null;
export type CustomFieldValues = Record<string, CustomFieldValue>;

/** Valeur initiale d'un champ vide selon son type. */
export function defaultFieldValue(field: NoteTypeFieldDef): CustomFieldValue {
  switch (field.type) {
    case 'checkbox': return false;
    case 'multiselect': return [];
    case 'number':
    case 'rating': return null;
    default: return '';
  }
}

/** Un champ a-t-il une valeur « renseignée » (pour décider de l'afficher) ?
 *  Une case décochée (false) compte comme NON renseignée. */
export function isFieldFilled(field: NoteTypeFieldDef, value: CustomFieldValue): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'boolean') return value === true;
  return true; // number / rating
}

/** Rendu texte d'une valeur (résumés compacts, export, tests). La View peut
 *  rendre des widgets plus riches (étoiles, chips) mais s'appuie sur la même
 *  logique de formatage. */
export function formatFieldValue(field: NoteTypeFieldDef, value: CustomFieldValue): string {
  if (!isFieldFilled(field, value)) return '';
  switch (field.type) {
    case 'checkbox': return value ? 'Oui' : 'Non';
    case 'rating': return typeof value === 'number' ? `${value}/5` : '';
    case 'multiselect': return Array.isArray(value) ? value.join(', ') : '';
    case 'date': return typeof value === 'string' ? formatDateLong(value) : '';
    default: return String(value);
  }
}

/** Le type custom a-t-il des champs DÉFINIS ? (pour monter l'éditeur). */
export function hasCustomFieldDefs(def: { fields?: NoteTypeFieldDef[] } | undefined): boolean {
  return (def?.fields?.length ?? 0) > 0;
}

/** Au moins un champ RENSEIGNÉ ? (pour monter la vue lecture, ne rien afficher de vide). */
export function hasFilledCustomFields(
  fields: NoteTypeFieldDef[] | undefined,
  values: CustomFieldValues | undefined,
): boolean {
  if (!fields?.length || !values) return false;
  return fields.some((f) => isFieldFilled(f, values[f.id] ?? null));
}
