import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { trpc } from './trpc';
import { db, type LocalNoteTypeDef } from './db/schema';
import type { NoteTypeDefWithFields } from '@carnet/schemas';

/**
 * Types de note personnalisés du viewer, role-aware (cf. pattern owner=Dexie /
 * confident=tRPC, comme Agenda/Budget) :
 *  - Owner : `db.noteTypeDefs` (offline-first, mirroré par le pull de sync).
 *  - Confident : `trpc.noteTypes.list` (pas de Dexie).
 *
 * Renvoie `defsById` à passer à `resolveNoteTypeConfig(entry, defsById)` /
 * `behaviorOf`. Les écritures (create/update/delete/reorder) passent par les
 * mutations tRPC owner-only, pas par ce hook.
 */
export function useNoteTypeDefs(): { defs: NoteTypeDefWithFields[]; defsById: Record<string, NoteTypeDefWithFields> } {
  const { data: me } = trpc.auth.me.useQuery(undefined, { retry: false, staleTime: 5 * 60_000 });
  const isOwner = me?.role === 'OWNER';

  const local = useLiveQuery<LocalNoteTypeDef[]>(
    () => (isOwner ? db.noteTypeDefs.orderBy('sortOrder').toArray() : Promise.resolve([])),
    [isOwner],
  );
  const { data: remoteRaw } = trpc.noteTypes.list.useQuery(undefined, {
    enabled: !!me && !isOwner,
    staleTime: 5 * 60_000,
  });
  // Cast en amont vers un type peu profond : l'inférence tRPC sur la ligne
  // NoteTypeDef (champ `fields` JSON) explose en profondeur (TS2589) sinon.
  const remote = remoteRaw as unknown as NoteTypeDefWithFields[] | undefined;

  return useMemo(() => {
    const defs = (isOwner ? (local ?? []) : (remote ?? [])) as NoteTypeDefWithFields[];
    const defsById: Record<string, NoteTypeDefWithFields> = {};
    for (const d of defs) defsById[d.id] = d;
    return { defs, defsById };
  }, [isOwner, local, remote]);
}
