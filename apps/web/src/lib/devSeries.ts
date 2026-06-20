import { db } from './db/schema';

/**
 * Propagation des métadonnées structurelles entre notes DEV d'un même thème.
 *
 * Modèle DEV (cf. `MediaMeta`) : `seriesName` = thème, `volume` = n° de partie,
 * `partName` = nom de la partie, `totalVolumes` = nb total de parties,
 * `chapter` = n° de chapitre, `totalChapters` = nb total de chapitres (thème-wide).
 *
 * Règles voulues :
 *  - Éditer le thème → renomme TOUTES les notes du thème.
 *  - Éditer un total (parties / chapitres) → s'applique à TOUTES les notes du thème.
 *  - Éditer le nom d'une partie → s'applique à toutes les notes du thème ayant le
 *    même n° de partie.
 *
 * Toutes les écritures marquent `_dirty` + `updatedAt` pour repartir au sync.
 */

const now = () => new Date().toISOString();

/** Notes (non supprimées) d'un type + thème donnés, hors la note courante. */
async function siblings(noteType: string, theme: string, selfId?: string) {
  const t = theme.trim();
  if (!t) return [];
  return db.entries
    .filter(
      (e) =>
        e.noteType === noteType &&
        e.deletedAt === null &&
        e.id !== selfId &&
        (e.mediaMeta?.seriesName ?? '').trim() === t,
    )
    .toArray();
}

/** Notes DEV (non supprimées) d'un thème donné, hors la note courante. */
const devSiblings = (theme: string, selfId?: string) => siblings('DEV', theme, selfId);

/** Renomme un thème : toutes les notes DEV de `prevTheme` passent à `nextTheme`. */
export async function renameDevTheme(prevTheme: string, nextTheme: string, selfId?: string): Promise<void> {
  const prev = prevTheme.trim();
  const next = nextTheme.trim();
  if (!prev || !next || prev === next) return;
  const sibs = await devSiblings(prev, selfId);
  if (sibs.length === 0) return;
  const ts = now();
  await Promise.all(
    sibs.map((s) =>
      db.entries.update(s.id, {
        mediaMeta: { ...s.mediaMeta, seriesName: next },
        updatedAt: ts,
        _dirty: true,
      }),
    ),
  );
}

/** Propage les totaux (parties / chapitres) à toutes les notes du thème. */
export async function propagateDevTotals(
  theme: string,
  totals: { totalVolumes?: number; totalChapters?: number },
  selfId?: string,
): Promise<void> {
  const sibs = await devSiblings(theme, selfId);
  if (sibs.length === 0) return;
  const ts = now();
  await Promise.all(
    sibs
      .filter(
        (s) =>
          s.mediaMeta?.totalVolumes !== totals.totalVolumes ||
          s.mediaMeta?.totalChapters !== totals.totalChapters,
      )
      .map((s) =>
        db.entries.update(s.id, {
          mediaMeta: { ...s.mediaMeta, totalVolumes: totals.totalVolumes, totalChapters: totals.totalChapters },
          updatedAt: ts,
          _dirty: true,
        }),
      ),
  );
}

/** Propage le nom d'une partie à toutes les notes du thème ayant le même n° de partie. */
export async function propagateDevPartName(
  theme: string,
  volume: number | undefined,
  partName: string | undefined,
  selfId?: string,
): Promise<void> {
  if (volume == null) return; // sans n° de partie, impossible de regrouper
  const sibs = await devSiblings(theme, selfId);
  if (sibs.length === 0) return;
  const ts = now();
  await Promise.all(
    sibs
      .filter((s) => (s.mediaMeta?.volume ?? null) === volume && s.mediaMeta?.partName !== (partName || undefined))
      .map((s) =>
        db.entries.update(s.id, {
          mediaMeta: { ...s.mediaMeta, partName: partName || undefined },
          updatedAt: ts,
          _dirty: true,
        }),
      ),
  );
}

/** Totaux connus d'un thème (lus depuis une note existante) — pour l'autocomplétion. */
export async function devThemeTotals(theme: string): Promise<{ totalVolumes?: number; totalChapters?: number }> {
  const t = theme.trim();
  if (!t) return {};
  const sibs = await db.entries
    .filter(
      (e) => e.noteType === 'DEV' && e.deletedAt === null && (e.mediaMeta?.seriesName ?? '').trim() === t,
    )
    .toArray();
  for (const s of sibs) {
    if (s.mediaMeta?.totalVolumes != null || s.mediaMeta?.totalChapters != null) {
      return { totalVolumes: s.mediaMeta?.totalVolumes, totalChapters: s.mediaMeta?.totalChapters };
    }
  }
  return {};
}

/** Nom de partie connu pour un (thème, n° de partie) — pour l'autocomplétion par n°. */
export async function devPartNameForVolume(theme: string, volume: number): Promise<string | undefined> {
  const t = theme.trim();
  if (!t) return undefined;
  const sibs = await db.entries
    .filter(
      (e) =>
        e.noteType === 'DEV' &&
        e.deletedAt === null &&
        (e.mediaMeta?.seriesName ?? '').trim() === t &&
        (e.mediaMeta?.volume ?? null) === volume &&
        !!e.mediaMeta?.partName,
    )
    .toArray();
  return sibs[0]?.mediaMeta?.partName;
}

/* ─────────────────────────────────────────────────────────────────────────
 * QUIZZ — même logique que DEV, en plus léger.
 * Modèle : `seriesName` = thème, `volume` = n° du quizz dans le thème,
 * `totalVolumes` = nb total de quizz prévus (cible « X / total »).
 * Règles : renommer le thème renomme tous les quizz du thème ; éditer le total
 * le propage à tous les quizz du thème.
 * ─────────────────────────────────────────────────────────────────────── */

/** Renomme un thème de quizz : tous les quizz de `prevTheme` passent à `nextTheme`. */
export async function renameQuizTheme(prevTheme: string, nextTheme: string, selfId?: string): Promise<void> {
  const prev = prevTheme.trim();
  const next = nextTheme.trim();
  if (!prev || !next || prev === next) return;
  const sibs = await siblings('QUIZZ', prev, selfId);
  if (sibs.length === 0) return;
  const ts = now();
  await Promise.all(
    sibs.map((s) =>
      db.entries.update(s.id, {
        mediaMeta: { ...s.mediaMeta, seriesName: next },
        updatedAt: ts,
        _dirty: true,
      }),
    ),
  );
}

/** Propage le total de quizz (`totalVolumes`) à tous les quizz du thème. */
export async function propagateQuizTotal(theme: string, totalVolumes: number | undefined, selfId?: string): Promise<void> {
  const sibs = await siblings('QUIZZ', theme, selfId);
  if (sibs.length === 0) return;
  const ts = now();
  await Promise.all(
    sibs
      .filter((s) => s.mediaMeta?.totalVolumes !== totalVolumes)
      .map((s) =>
        db.entries.update(s.id, {
          mediaMeta: { ...s.mediaMeta, totalVolumes },
          updatedAt: ts,
          _dirty: true,
        }),
      ),
  );
}

/** Total connu d'un thème de quizz (lu depuis un quizz existant) — pour l'autocomplétion. */
export async function quizThemeTotal(theme: string): Promise<number | undefined> {
  const t = theme.trim();
  if (!t) return undefined;
  const sibs = await db.entries
    .filter(
      (e) => e.noteType === 'QUIZZ' && e.deletedAt === null && (e.mediaMeta?.seriesName ?? '').trim() === t,
    )
    .toArray();
  for (const s of sibs) {
    if (s.mediaMeta?.totalVolumes != null) return s.mediaMeta.totalVolumes;
  }
  return undefined;
}
