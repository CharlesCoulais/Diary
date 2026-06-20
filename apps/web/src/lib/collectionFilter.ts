import { behaviorOf, type NoteTypeDefLike } from '@carnet/schemas';
import type { LocalEntry } from './db/schema';
import { isPlaylist } from './musicTracks';

/**
 * Source de vérité pour "est-ce qu'une entrée apparaît dans la page Collection".
 *
 * Conditions cumulées :
 *   - non supprimée
 *   - pas un COMPORTEMENT JOURNAL (donc BOOK / SERIES / MOVIE / MUSIC / OUTING / etc.)
 *   - pas un comportement fonctionnel AGENDA / FINANCE (ce ne sont pas des médias
 *     « possédés » — elles vivent dans le Journal/Timeline, pas la Collection)
 *   - ET soit un `mediaMeta.subject` (titre du média rempli),
 *     soit un comportement MUSIC en mode playlist (peut avoir un nom de playlist
 *     sans subject, ex: « Mon top de l'été »)
 *
 * Le test porte sur le COMPORTEMENT effectif (`behaviorOf`) et non sur
 * `noteType` brut : un type custom héritant de BOOK/MOVIE/SERIES/MUSIC est
 * collectionnable, un custom héritant de JOURNAL/AGENDA/FINANCE ne l'est pas.
 * `defsById` (les définitions des types custom) est nécessaire pour résoudre ce
 * comportement ; il peut être vide (aucun type custom) sans changer les
 * built-in.
 *
 * Utilisé par la page Collection elle-même ET par les compteurs sidebar /
 * topbar pour rester synchrones — sans ça le compteur affichait 0 alors
 * que la page contenait 59 titres (l'ancien filtre comptait uniquement les
 * entrées `collectionOnly: true`, ratant toutes les vraies notes media).
 */
export function isCollectionEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  e: LocalEntry | any,
  defsById: Record<string, NoteTypeDefLike> = {},
): boolean {
  if (!e) return false;
  if (e.deletedAt) return false;
  const behavior = behaviorOf(e, defsById);
  if (behavior === 'JOURNAL') return false;
  if (behavior === 'AGENDA' || behavior === 'FINANCE') return false;
  const m = e.mediaMeta;
  if (m && typeof m === 'object' && 'subject' in m && m.subject) return true;
  if (behavior === 'MUSIC' && isPlaylist(m)) return true;
  return false;
}
