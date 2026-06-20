import { z } from 'zod';
import { router, authedProcedure, ownerProcedure } from '../trpc.js';
import { db } from '../db.js';
import { canRead } from '../lib/permissions.js';

// ── Extraction des médias souvenir depuis le markdown ─────────────────────────

interface RawMedia {
  src: string;
  type: 'image' | 'video';
  label: string;
  spoiler: boolean;
}

function extractSouvenirMedia(contentMd: string): RawMedia[] {
  const items: RawMedia[] = [];
  for (const m of contentMd.matchAll(/^:::img\s+"([^"]*)"\s+"([^"]*)"(?:\s+\d+)?\s+souvenir$/gm))
    items.push({ src: m[1]!, type: 'image', label: m[2]!, spoiler: false });
  for (const m of contentMd.matchAll(/^\|\|:::img\s+"([^"]*)"\s+"([^"]*)"(?:\s+\d+)?\s+souvenir\|\|$/gm))
    items.push({ src: m[1]!, type: 'image', label: m[2]!, spoiler: true });
  for (const m of contentMd.matchAll(/^:::video\s+"([^"]*)"\s+"([^"]*)"[ \t]+souvenir$/gm))
    items.push({ src: m[1]!, type: 'video', label: m[2]!, spoiler: false });
  for (const m of contentMd.matchAll(/^\|\|:::video\s+"([^"]*)"\s+"([^"]*)"[ \t]+souvenir\|\|$/gm))
    items.push({ src: m[1]!, type: 'video', label: m[2]!, spoiler: true });
  return items;
}

// ── Router ────────────────────────────────────────────────────────────────────

export const souvenirsRouter = router({

  list: authedProcedure.query(async ({ ctx }) => {
    const { user } = ctx;
    const now = new Date();

    const ownerId = user.role === 'OWNER' ? user.id : user.invitedById;
    if (!ownerId) return [];

    // Tags de l'owner — visibles par le owner et ses guests (les guests ne taguent pas mais voient les labels)
    const tagMap = new Map<string, string[]>();
    const tagRows = await db.souvenirTag.findMany({
      where: { authorId: ownerId },
      select: { mediaSrc: true, tag: true },
    });
    for (const t of tagRows) {
      const arr = tagMap.get(t.mediaSrc) ?? [];
      arr.push(t.tag);
      tagMap.set(t.mediaSrc, arr);
    }

    const buildItem = (
      m: RawMedia,
      entry: { id: string; date: Date; title: string | null; isAdult: boolean; adultQuestion: string | null },
      sealedUntil: string | null,
    ) => ({
      ...m,
      entryId: entry.id,
      entryDate: entry.date.toISOString(),
      entryTitle: entry.title,
      isAdult: entry.isAdult,
      adultQuestion: entry.adultQuestion,
      sealedUntil,
      tags: tagMap.get(m.src) ?? [],
    });

    if (user.role === 'OWNER') {
      const entries = await db.entry.findMany({
        where: { authorId: ownerId, deletedAt: null },
        select: { id: true, date: true, title: true, contentMd: true, isAdult: true, adultQuestion: true, unlockAt: true, visibility: true, isSecret: true },
        orderBy: { date: 'desc' },
      });
      const result = [];
      for (const entry of entries) {
        const media = extractSouvenirMedia(entry.contentMd);
        if (!media.length) continue;
        const sealedUntil = entry.unlockAt && entry.unlockAt > now ? entry.unlockAt.toISOString() : null;
        for (const m of media) result.push(buildItem(m, entry, sealedUntil));
      }
      return result;
    }

    // Guest
    const entries = await db.entry.findMany({
      where: { authorId: ownerId, deletedAt: null },
      select: { id: true, authorId: true, date: true, title: true, contentMd: true, isAdult: true, adultQuestion: true, unlockAt: true, visibility: true, isSecret: true, shares: { select: { receiverId: true, canComment: true } } },
      orderBy: { date: 'desc' },
    });
    const result = [];
    for (const entry of entries) {
      if (!canRead(user, entry)) continue;
      if (entry.unlockAt && entry.unlockAt > now) continue;
      const media = extractSouvenirMedia(entry.contentMd);
      if (!media.length) continue;
      for (const m of media) result.push(buildItem(m, entry, null));
    }
    return result;
  }),

  // Remplace tous les tags d'un média souvenir
  setTags: ownerProcedure
    .input(z.object({
      mediaSrc: z.string().max(500),
      entryId:  z.string(),
      tags:     z.array(z.string().trim().min(1).max(80)).max(20),
    }))
    .mutation(async ({ ctx, input }) => {
      const { mediaSrc, entryId, tags } = input;
      const authorId = ctx.user.id;
      const unique = [...new Set(tags.map((t) => t.toLowerCase()))];

      await db.$transaction([
        db.souvenirTag.deleteMany({ where: { authorId, mediaSrc } }),
        ...(unique.length
          ? [db.souvenirTag.createMany({
              data: unique.map((tag) => ({ authorId, mediaSrc, entryId, tag })),
            })]
          : []),
      ]);
      return { ok: true };
    }),

  // Tous les tags distincts de l'owner (pour le filtre)
  allTags: ownerProcedure.query(async ({ ctx }) => {
    const rows = await db.souvenirTag.findMany({
      where: { authorId: ctx.user.id },
      select: { tag: true },
      distinct: ['tag'],
      orderBy: { tag: 'asc' },
    });
    return rows.map((r) => r.tag);
  }),
});
