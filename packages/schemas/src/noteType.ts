import { z } from 'zod';
import type { NoteType } from './entry.js';

/**
 * Types de note personnalisés (NoteTypeDef) — définis par l'owner au runtime.
 *
 * Un type custom n'invente pas de comportement : il **hérite** d'un des 11
 * comportements built-in (`behavior`). Le branchement structuré (vues/éditeurs)
 * se fait sur le **comportement effectif** résolu par `behaviorOf`, jamais sur
 * `noteType === 'CUSTOM'` directement.
 */

/** Comportements built-in qu'un type custom peut hériter (CUSTOM exclu). */
export const noteTypeBehavior = z.enum([
  'JOURNAL', 'BOOK', 'SERIES', 'MOVIE', 'MUSIC', 'OUTING', 'SHOPPING', 'DEV', 'QUIZZ', 'AGENDA', 'FINANCE',
]);
export type NoteTypeBehavior = z.infer<typeof noteTypeBehavior>;

/** Champs meta personnalisés : types de widget supportés. */
export const noteTypeFieldType = z.enum([
  'text', 'longtext', 'number', 'date', 'checkbox', 'rating', 'select', 'multiselect',
]);
export type NoteTypeFieldType = z.infer<typeof noteTypeFieldType>;

/** Définition d'un champ perso d'un type de note (libellé + widget). Les listes
 *  (`select`/`multiselect`) portent leurs `options` définies par l'owner. */
export const noteTypeFieldDef = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(40),
  type: noteTypeFieldType,
  options: z.array(z.string().min(1).max(60)).max(30).optional(),
});
export type NoteTypeFieldDef = z.infer<typeof noteTypeFieldDef>;

// Champs de base d'un type custom (sans défaut, pour que l'update partiel ne
// réécrive pas `behavior`/`fields` quand ils sont omis).
const noteTypeDefBase = {
  label: z.string().min(1).max(40).trim(),
  labelPlural: z.string().min(1).max(40).trim(),
  volumeLabel: z.string().min(1).max(40).trim(),
  icon: z.string().min(1).max(40),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  behavior: noteTypeBehavior,
  fields: z.array(noteTypeFieldDef).max(40),
};

export const createNoteTypeDefInput = z.object({
  ...noteTypeDefBase,
  behavior: noteTypeBehavior.default('JOURNAL'),
  fields: z.array(noteTypeFieldDef).max(40).default([]),
});
export type CreateNoteTypeDefInput = z.infer<typeof createNoteTypeDefInput>;

// Update : tous les champs optionnels (pas de défaut → champ omis = inchangé).
export const updateNoteTypeDefInput = z.object(noteTypeDefBase).partial().extend({
  id: z.string().min(1).max(64),
});
export type UpdateNoteTypeDefInput = z.infer<typeof updateNoteTypeDefInput>;

export const reorderNoteTypeDefsInput = z.object({
  ids: z.array(z.string().min(1).max(64)).max(100),
});

/** Forme minimale d'un type custom nécessaire à la résolution (front + back). */
export interface NoteTypeDefLike {
  id: string;
  behavior: NoteTypeBehavior;
  label: string;
  labelPlural: string;
  volumeLabel: string;
  icon: string;
  colorHex: string;
}

/** Def + ses champs perso (ce que `useNoteTypeDefs` expose aux composants). */
export type NoteTypeDefWithFields = NoteTypeDefLike & { fields: NoteTypeFieldDef[] };

/**
 * Comportement built-in effectif d'une note : pour un type custom, le `behavior`
 * de sa définition ; sinon le type lui-même. Un custom orphelin (def supprimée)
 * retombe sur JOURNAL.
 */
export function behaviorOf(
  entry: { noteType: NoteType; customTypeId?: string | null },
  defsById: Record<string, NoteTypeDefLike>,
): NoteTypeBehavior {
  if (entry.noteType === 'CUSTOM') {
    const def = entry.customTypeId ? defsById[entry.customTypeId] : undefined;
    return def ? def.behavior : 'JOURNAL';
  }
  return entry.noteType;
}
