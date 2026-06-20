import { z } from 'zod';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import {
  createEntryInput,
  updateEntryInput,
  listEntriesInput,
  byIdInput,
} from '@carnet/schemas';
import { router, ownerProcedure, authedProcedure } from '../trpc.js';
import { canRead } from '../lib/permissions.js';
import { recordAudit } from '../lib/audit.js';
import { DRAFT_GRACE_MS } from '../lib/visibility.js';

// Champs renvoyés au client pour toutes les procédures.
// Les shares sont inclus pour le calcul des permissions et l'UI Owner.
const ENTRY_SELECT = {
  id: true,
  authorId: true,
  date: true,
  createdAt: true,
  updatedAt: true,
  section: true,
  title: true,
  contentMd: true,
  mood: true,
  sleepHours: true,
  weather: true,
  timeLabel: true,
  noteType: true,
  customTypeId: true,
  mediaMeta: true,
  font: true,
  fontSize: true,
  visibility: true,
  isDraft: true,
  isForConfidant: true,
  isSecret: true,
  isAdult: true,
  adultQuestion: true,
  adultAnswerHash: true,
  adultHints: true,
  adultMercyAnswer: true,
  readGatePrompt: true,
  readGateAcceptedResponses: true,
  unlockAt: true,
  capsuleSpoiler: true,
  hideUntilAt: true,
  collectionOnly: true,
  links: true,
  commentsLocked: true,
  version: true,
  shares: {
    select: { receiverId: true, canComment: true },
  },
  // Notations favoris/nul par utilisateur. Filtrées côté serveur après fetch
  // (cf. `filterRatingsForUser`) : un confident ne reçoit que sa propre
  // notation et celle de l'owner.
  ratings: {
    select: {
      userId: true,
      value: true,
      user: { select: { displayName: true, email: true } },
    },
  },
  // Tags : renvoyés sous forme aplatie `tagNames: string[]` (cf. mapping après
  // findMany). Sans cette inclusion, le fallback serveur côté client (Home.tsx
  // → `utils.entries.list.fetch`) hydrate Dexie avec un tableau vide et écrase
  // les tags réellement stockés en base.
  tags: { select: { tag: { select: { name: true } } } },
  _count: {
    select: { comments: { where: { deletedAt: null } } },
  },
} as const;

/**
 * Aplatit la jointure `tags → tag.name` en `tagNames: string[]` pour rester
 * cohérent avec la shape exposée par `sync.pull` / `sync.push`. Toutes les
 * routes qui retournent un Entry via ENTRY_SELECT doivent passer par ce
 * helper avant de renvoyer côté client.
 */
function flattenEntryTags<T extends { tags: { tag: { name: string } }[] }>(e: T): Omit<T, 'tags'> & { tagNames: string[] } {
  const { tags, ...rest } = e;
  return { ...rest, tagNames: tags.map((et) => et.tag.name) };
}

/**
 * Fenêtres temporelles des Souvenirs (« il y a une semaine / un mois / un an »)
 * calculées à partir de `now`. Partagé par `onThisDay` (aperçu) et
 * `onThisDayPeriod` (liste complète du panneau) pour garantir des bornes
 * identiques entre les deux.
 *  - semaine : fenêtre glissante J-14 → J-7
 *  - mois    : mois calendaire précédent (hors fenêtre semaine pour éviter les doublons)
 *  - année   : année calendaire précédente
 */
function souvenirWindows(now: Date) {
  function dateAgo(days: number): string {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }
  const currentYear = now.getFullYear();
  return {
    today: now.toISOString().slice(0, 10),
    week: { from: dateAgo(14), to: dateAgo(7) },
    month: {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10),
      end: new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10),
    },
    year: { start: `${currentYear - 1}-01-01`, end: `${currentYear - 1}-12-31` },
  };
}

/**
 * Prédicat SQL « ce viewer a le droit de lire cette note » pour les Souvenirs,
 * partagé par `onThisDay` / `onThisDayPeriod`. Renvoie un fragment `Prisma.Sql`
 * à insérer dans la clause WHERE (la table est aliasée `"Entry"`).
 *
 *  - OWNER     : ses propres notes (capsules ouvertes uniquement).
 *  - GUEST     : on RESTE volontairement strict pour un aperçu propre — on
 *    exclut tout ce qui s'afficherait rédacté (secret, 18+, read-gate, capsule
 *    non ouverte, publication différée) puis on applique la portée de partage
 *    selon `guestAccess` (CONFIDANT voit tout le reste, ALL voit SHARED_ALL +
 *    ses SHARED_SPECIFIC, SPECIFIC voit seulement ses SHARED_SPECIFIC).
 */
function souvenirAccessSql(
  user: { id: string; role: string; guestAccess?: string | null },
  draftThreshold: Date,
): Prisma.Sql {
  if (user.role === 'OWNER') {
    return Prisma.sql`
      "authorId" = ${user.id}
      AND "deletedAt" IS NULL
      AND ("unlockAt" IS NULL OR "unlockAt" <= now())
    `;
  }

  // Base guest : rien de rédacté ne remonte dans l'aperçu Souvenirs.
  const base = Prisma.sql`
    "deletedAt" IS NULL
    AND "collectionOnly" = false
    AND "isSecret" = false
    AND "isAdult" = false
    AND "readGatePrompt" IS NULL
    AND ("unlockAt" IS NULL OR "unlockAt" <= now())
    AND ("hideUntilAt" IS NULL OR "hideUntilAt" <= now())
    AND ("isDraft" = false OR "createdAt" <= ${draftThreshold})
  `;

  const sharedToMe = Prisma.sql`
    EXISTS (SELECT 1 FROM "EntryShare" es WHERE es."entryId" = "Entry".id AND es."receiverId" = ${user.id})
  `;

  if (user.guestAccess === 'CONFIDANT') return base;
  if (user.guestAccess === 'ALL') {
    return Prisma.sql`${base} AND ("visibility" = 'SHARED_ALL' OR ("visibility" = 'SHARED_SPECIFIC' AND ${sharedToMe}))`;
  }
  // SPECIFIC (ou guestAccess absent) : uniquement les notes explicitement partagées.
  return Prisma.sql`${base} AND "visibility" = 'SHARED_SPECIFIC' AND ${sharedToMe}`;
}

/**
 * Colonnes sélectionnées pour une note de Souvenir, incluant le nombre de
 * commentaires et l'agrégat de réactions (emoji → compte, trié décroissant).
 * Partagé par `onThisDay` et `onThisDayPeriod` (la table est aliasée `"Entry"`).
 */
const SOUVENIR_SELECT_COLS = Prisma.sql`
  id, title, date, "contentMd", mood, "noteType", "customTypeId", "createdAt", "mediaMeta",
  (SELECT COUNT(*) FROM "Comment" c WHERE c."entryId" = "Entry".id AND c."deletedAt" IS NULL)::int AS "commentCount",
  COALESCE((
    SELECT json_agg(json_build_object('emoji', rr.emoji, 'count', rr.cnt) ORDER BY rr.cnt DESC)
    FROM (
      SELECT emoji, COUNT(*)::int AS cnt
      FROM "Reaction"
      WHERE "entryId" = "Entry".id
      GROUP BY emoji
    ) rr
  ), '[]'::json) AS reactions
`;

/**
 * Filtre + aplatit les ratings d'une entry selon le rôle du viewer :
 *  - OWNER  : voit toutes les ratings
 *  - GUEST  : voit la sienne + celle de l'auteur (owner)
 *
 * Renvoie une shape stable `{ userId, value, displayName }` (le `displayName`
 * tombe sur le préfixe email si l'utilisateur n'a pas de displayName défini).
 * Cette shape est commune avec `sync.pull` pour faciliter la consommation
 * côté client (offline owner via Dexie + guests online via entries.list).
 */
type RawRating = {
  userId: string;
  value: 'FAVORITE' | 'LOW';
  user: { displayName: string | null; email: string };
};
type MappedRating = { userId: string; value: 'FAVORITE' | 'LOW'; displayName: string | null };

function filterRatingsForUser(
  ratings: RawRating[],
  viewer: { id: string; role: 'OWNER' | 'GUEST' },
  authorId: string,
): MappedRating[] {
  const visible = viewer.role === 'OWNER'
    ? ratings
    : ratings.filter((r) => r.userId === viewer.id || r.userId === authorId);
  return visible.map((r) => ({
    userId: r.userId,
    value: r.value,
    displayName: r.user.displayName ?? r.user.email.split('@')[0] ?? null,
  }));
}

/** Redacte le contenu d'une entrée scellée (unlockAt dans le futur). */
function sealRedact<T extends { unlockAt: Date | null; contentMd: string; mood: string | null; links: unknown; mediaMeta: unknown }>(e: T): T {
  if (e.unlockAt && e.unlockAt > new Date()) {
    return { ...e, contentMd: '', mood: null, links: null, mediaMeta: null };
  }
  return e;
}

/**
 * Retire les champs « solution » d'un quiz (`correct` / `accepted` / `explanation`)
 * du mediaMeta envoyé aux confidents. Sans ça, un confident pourrait lire les
 * bonnes réponses via DevTools. La correction est faite côté serveur (`quiz.submit`)
 * et les solutions ne sont révélées qu'après soumission.
 */
function redactQuizForGuest<T>(mediaMeta: T): T {
  if (!mediaMeta || typeof mediaMeta !== 'object') return mediaMeta;
  const mm = mediaMeta as { quizQuestions?: unknown };
  if (!Array.isArray(mm.quizQuestions)) return mediaMeta;
  return {
    ...mm,
    quizQuestions: mm.quizQuestions.map((q) => {
      if (!q || typeof q !== 'object') return q;
      const rest = { ...(q as Record<string, unknown>) };
      delete rest.correct;
      delete rest.accepted;
      delete rest.explanation;
      return rest;
    }),
  } as T;
}

function buildDateFilter(input: { date?: string; from?: string; to?: string }) {
  if (input.date) {
    return { date: new Date(input.date) };
  }
  if (input.from || input.to) {
    return {
      date: {
        ...(input.from ? { gte: new Date(input.from) } : {}),
        ...(input.to ? { lte: new Date(input.to) } : {}),
      },
    };
  }
  return {};
}

export const entriesRouter = router({
  create: ownerProcedure
    .input(createEntryInput)
    .mutation(async ({ ctx, input }) => {
      const created = await ctx.db.entry.create({
        data: {
          authorId: ctx.user.id,
          date: new Date(input.date),
          section: input.section,
          title: input.title,
          contentMd: input.contentMd,
          mood: input.mood,
          sleepHours: input.sleepHours,
          weather: input.weather,
          timeLabel: input.timeLabel ?? null,
          noteType: input.noteType ?? 'JOURNAL',
          customTypeId: (input.noteType ?? 'JOURNAL') === 'CUSTOM' ? (input.customTypeId ?? null) : null,
          mediaMeta: input.mediaMeta ?? undefined,
          font: input.font ?? null,
          fontSize: input.fontSize ?? null,
          visibility: input.visibility,
          collectionOnly: input.collectionOnly ?? false,
        },
        select: ENTRY_SELECT,
      });
      return flattenEntryTags(created);
    }),

  list: authedProcedure
    .input(listEntriesInput)
    .query(async ({ ctx, input }) => {
      const { user } = ctx;
      const dateFilter = buildDateFilter(input);
      const dir = input.order;
      const orderBy = [{ date: dir as 'asc' | 'desc' }, { createdAt: dir as 'asc' | 'desc' }];
      const take = input.limit;

      if (user.role === 'OWNER') {
        // L'owner voit toujours son contenu — pas de redaction capsule.
        // collectionOnly exclu : les items de Collection ne sont pas des notes
        // du journal et ne doivent pas apparaître dans la Timeline.
        const entries = await ctx.db.entry.findMany({
          where: { authorId: user.id, deletedAt: null, collectionOnly: false, ...dateFilter },
          orderBy,
          take,
          select: ENTRY_SELECT,
        });
        // Aplatir la shape des ratings (cf. `filterRatingsForUser`) et normaliser
        // les champs de redaction guest à `null` pour que le type de retour de
        // `entries.list` reste uniforme entre Owner et Guest (sinon TS unifie en
        // intersection et perd `adultLength` / `adultHasMedia` / `readGateStatus`).
        return entries.map((e) => ({
          ...flattenEntryTags(e),
          ratings: filterRatingsForUser(e.ratings, user, e.authorId),
          adultLength: null as number | null,
          adultHasMedia: null as boolean | null,
          readGateStatus: null as string | null,
        }));
      }

      /**
       * Pour les guests : masque hash + contenu + media meta + titre des entrées 18+.
       * Aucun bypass possible via le DOM : la cover image et le contenu ne sont pas envoyés
       * tant que la gate n'est pas franchie via unlockAdultContent.
       *
       * Indices de forme conservés (ne révèlent rien du contenu) :
       *   - adultLength  : longueur approx. du contenu, pour calibrer le squelette
       *   - adultHasMedia: y a-t-il une cover/media meta, pour afficher un bloc image
       */
      const guestRedact = <T extends { isAdult: boolean; adultAnswerHash: unknown; adultMercyAnswer?: unknown; contentMd: string; links: unknown; title?: string | null; mediaMeta?: unknown; readGateAcceptedResponses?: unknown; shares?: { receiverId: string; canComment: boolean }[] }>(e: T): T & { adultLength: number | null; adultHasMedia: boolean | null } => {
        // Champs qui ne doivent JAMAIS partir côté confident :
        //   - `adultAnswerHash` : permet un brute-force offline du verrou 18+
        //   - `adultMercyAnswer` : la réponse de clémence en clair
        //   - `readGateAcceptedResponses` : la liste des bonnes réponses du
        //     verrou de lecture. Sans ce redact, un confident pouvait lire
        //     les réponses attendues via DevTools et bypasser le gate en
        //     envoyant une chaîne valide à `readGate.respond`.
        //   - `shares` : la liste complète des destinataires d'une entry
        //     SHARED_SPECIFIC. Un confident n'a pas à connaître la cohorte —
        //     on ne lui renvoie que sa propre ligne s'il y est, pour qu'il
        //     puisse savoir s'il peut commenter.
        const filteredShares = (e.shares ?? []).filter((s) => s.receiverId === user.id);
        const base = {
          ...e,
          adultAnswerHash: null,
          adultMercyAnswer: null,
          readGateAcceptedResponses: [] as string[],
          shares: filteredShares,
          // Masque les bonnes réponses du quiz aux confidents (correction serveur).
          mediaMeta: redactQuizForGuest(e.mediaMeta),
        };
        if (e.isAdult) {
          return {
            ...base,
            contentMd: '',
            links: null,
            title: null,
            mediaMeta: null,
            adultLength: (e.contentMd ?? '').length,
            adultHasMedia: !!e.mediaMeta,
          };
        }
        return { ...base, adultLength: null, adultHasMedia: null };
      };

      // Délai de grâce sur les brouillons : pendant DRAFT_GRACE_MS après création, ils
      // ne sont visibles que de l'owner (cf. lib/visibility.ts pour la valeur).
      const draftThreshold = new Date(Date.now() - DRAFT_GRACE_MS);
      const now = new Date();
      // Combine la grâce sur brouillon + minuteur de publication (`hideUntilAt`) :
      // l'owner peut publier mais retarder l'apparition côté guest (anti "guet à la seconde").
      const guestDraftFilter = {
        AND: [
          {
            OR: [
              { isDraft: false },
              { createdAt: { lte: draftThreshold } },
            ],
          },
          {
            OR: [
              { hideUntilAt: null },
              { hideUntilAt: { lte: now } },
            ],
          },
        ],
      };

      /**
       * Trace une lecture en lot (listing) côté guest dans l'AuditLog.
       * Une seule ligne par appel `list` plutôt qu'une par entry (sinon
       * bruit non exploitable). Fire-and-forget : ne bloque jamais la
       * réponse.
       *
       * CLAUDE.md exige que toute action guest produise un AuditLog —
       * jusqu'ici seul `byId` traçait. Sans ça, un confident pouvait
       * balayer toute la timeline sans laisser de trace.
       */
      const logGuestListBatch = (count: number) => {
        void ctx.db.auditLog.create({
          data: {
            userId: user.id,
            action: 'GUEST_LIST',
            ipHash: ctx.ipHash,
            userAgent: ctx.userAgent,
            metadata: {
              count,
              date: input.date ?? null,
              from: input.from ?? null,
              to: input.to ?? null,
              includeCollectionOnly: input.includeCollectionOnly ?? false,
            },
          },
        }).catch(() => null);
      };

      // Helper : applique le read gate — redacte le contenu si le guest n'a pas répondu/été approuvé.
      const applyReadGate = async <T extends { id: string; readGatePrompt: string | null }>(
        redacted: T[],
        guestId: string,
      ) => {
        const gateEntryIds = redacted.filter((e) => e.readGatePrompt).map((e) => e.id);
        const gateResponses = gateEntryIds.length > 0
          ? await ctx.db.readGateResponse.findMany({
              where: { guestId, entryId: { in: gateEntryIds } },
              select: { entryId: true, approved: true },
            })
          : [];
        const gateMap = new Map(gateResponses.map((r) => [r.entryId, r.approved]));
        return redacted.map((e) => {
          if (!e.readGatePrompt) return { ...e, readGateStatus: null as string | null };
          const approved = gateMap.get(e.id);
          const readGateStatus = approved === true ? 'approved' : approved === false ? 'rejected' : approved === null ? 'pending' : 'awaiting';
          if (readGateStatus === 'approved') return { ...e, readGateStatus };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return { ...(e as any), contentMd: '', links: null, title: null, mediaMeta: null, readGateStatus } as typeof e & { readGateStatus: string };
        });
      };

      // Confident : voit toutes les entrées, mais les secrets sont rédactés (contenu retiré côté serveur).
      // collectionOnly exclu par défaut (Timeline) ; inclus quand la page
      // Collection le demande via `includeCollectionOnly`.
      if (user.guestAccess === 'CONFIDANT') {
        const entries = await ctx.db.entry.findMany({
          where: {
            deletedAt: null,
            ...(input.includeCollectionOnly ? {} : { collectionOnly: false }),
            ...dateFilter,
            ...guestDraftFilter,
          },
          orderBy,
          take,
          select: ENTRY_SELECT,
        });
        const redacted = entries.map((e) => {
          const filtered = { ...flattenEntryTags(e), ratings: filterRatingsForUser(e.ratings, user, e.authorId) };
          return e.isSecret
            ? guestRedact({ ...filtered, contentMd: '', title: null, links: null })
            : guestRedact(sealRedact(filtered));
        });
        logGuestListBatch(redacted.length);
        return applyReadGate(redacted, user.id);
      }

      // Guest avec accès global : SHARED_ALL + ses SHARED_SPECIFIC
      if (user.guestAccess === 'ALL') {
        const entries = await ctx.db.entry.findMany({
          where: {
            deletedAt: null,
            collectionOnly: false,
            ...dateFilter,
            AND: [
              guestDraftFilter,
              {
                OR: [
                  { visibility: 'SHARED_ALL' },
                  { visibility: 'SHARED_SPECIFIC', shares: { some: { receiverId: user.id } } },
                ],
              },
            ],
          },
          orderBy,
          take,
          select: ENTRY_SELECT,
        });
        const redacted = entries.map((e) =>
          guestRedact(sealRedact({ ...flattenEntryTags(e), ratings: filterRatingsForUser(e.ratings, user, e.authorId) })),
        );
        logGuestListBatch(redacted.length);
        return applyReadGate(redacted, user.id);
      }

      // Guest avec accès restreint : uniquement ses SHARED_SPECIFIC
      const entries = await ctx.db.entry.findMany({
        where: {
          deletedAt: null,
          collectionOnly: false,
          ...dateFilter,
          ...guestDraftFilter,
          visibility: 'SHARED_SPECIFIC',
          shares: { some: { receiverId: user.id } },
        },
        orderBy,
        take,
        select: ENTRY_SELECT,
      });
      const redactedSpecific = entries.map((e) =>
        guestRedact(sealRedact({ ...flattenEntryTags(e), ratings: filterRatingsForUser(e.ratings, user, e.authorId) })),
      );
      logGuestListBatch(redactedSpecific.length);
      return applyReadGate(redactedSpecific, user.id);
    }),

  /**
   * Agrégat léger d'un type de note (AGENDA / FINANCE) pour les pages dashboard
   * `/agenda` et `/budget` : renvoie `{ id, title, mediaMeta }` de TOUTES les
   * notes du type, sans pagination (contrairement à `list`, ordonné + limité).
   *
   * Indispensable pour le **confident** : il n'a pas de sync Dexie, donc ces
   * pages (qui lisent `db.entries` côté owner) seraient vides sans ce chemin
   * serveur. Owner → ses propres notes ; confident → celles de l'owner invitant,
   * filtrées par `canRead` (secret / visibilité / partage), et hors notes 18+,
   * capsules encore scellées, publication différée, brouillons et verrou de
   * lecture (on n'agrège jamais du contenu que le confident ne peut pas lire).
   */
  aggregateByType: authedProcedure
    .input(z.object({ type: z.enum(['AGENDA', 'FINANCE']) }))
    .query(async ({ ctx, input }) => {
      const { user } = ctx;
      // Le propriétaire des notes agrégées : l'owner lui-même, ou l'owner invitant
      // pour un confident. On agrège AUSSI les notes CUSTOM dont le comportement
      // hérité === input.type (un type custom « Échéances » héritant d'AGENDA doit
      // apparaître dans l'agrégat Agenda).
      const ownerId = user.role === 'OWNER' ? user.id : user.invitedById;
      if (!ownerId) return [];
      const customIds = (await ctx.db.noteTypeDef.findMany({
        where: { ownerId, behavior: input.type },
        select: { id: true },
      })).map((d) => d.id);
      // Filtre de type : built-in input.type, plus les customs au bon comportement.
      const typeFilter = customIds.length > 0
        ? { OR: [{ noteType: input.type }, { customTypeId: { in: customIds } }] }
        : { noteType: input.type };

      if (user.role === 'OWNER') {
        const rows = await ctx.db.entry.findMany({
          where: { authorId: ownerId, deletedAt: null, ...typeFilter },
          select: { id: true, title: true, mediaMeta: true, updatedAt: true },
          orderBy: { createdAt: 'asc' },
        });
        return rows.map((e) => ({ id: e.id, title: e.title, mediaMeta: e.mediaMeta, updatedAt: e.updatedAt }));
      }
      const now = new Date();
      const rows = await ctx.db.entry.findMany({
        where: {
          authorId: ownerId,
          deletedAt: null,
          ...typeFilter,
          isDraft: false,
          isAdult: false,
          AND: [
            { OR: [{ unlockAt: null }, { unlockAt: { lte: now } }] },
            { OR: [{ hideUntilAt: null }, { hideUntilAt: { lte: now } }] },
            { OR: [{ readGatePrompt: null }, { readGatePrompt: '' }] },
          ],
        },
        select: {
          id: true,
          title: true,
          mediaMeta: true,
          updatedAt: true,
          authorId: true,
          visibility: true,
          isSecret: true,
          shares: { select: { receiverId: true, canComment: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
      return rows
        .filter((e) => canRead(user, e))
        .map((e) => ({ id: e.id, title: e.title, mediaMeta: redactQuizForGuest(e.mediaMeta), updatedAt: e.updatedAt }));
    }),

  /**
   * Données de la page Calendrier (`/calendrier`) : toutes les notes lisibles
   * du viewer, champs minimaux (date, humeur, sommeil, type, titre, aperçu) pour
   * colorer la grille + le détail du jour. Sans pagination (le calendrier couvre
   * tout l'historique — `list` est plafonné à 200).
   *
   * Confident : pas de sync Dexie → ce chemin serveur est indispensable (mêmes
   * symptômes que `/agenda` et `/budget`). Filtré par `canRead` (les notes
   * **secrètes** sont déjà exclues par `canRead`), hors brouillons et
   * publications différées ; titre + contenu **rédactés** pour les notes 18+,
   * capsules encore scellées et notes sous verrou de lecture (on ne laisse pas
   * fuiter leur libellé via la grille).
   */
  calendarData: authedProcedure.query(async ({ ctx }) => {
    const { user } = ctx;
    if (user.role === 'OWNER') {
      const ownRows = await ctx.db.entry.findMany({
        where: { authorId: user.id, deletedAt: null, collectionOnly: false },
        select: { id: true, date: true, mood: true, noteType: true, customTypeId: true, sleepHours: true, timeLabel: true, title: true, contentMd: true, isSecret: true, isDraft: true, mediaMeta: true },
        orderBy: { date: 'asc' },
      });
      // `date` est un DateTime @db.Date → on le renvoie en "YYYY-MM-DD" (comme la
      // clé Dexie côté owner), sinon le groupage par jour côté client ne matche pas.
      return ownRows.map((e) => ({ ...e, date: e.date.toISOString().slice(0, 10) }));
    }
    const ownerId = user.invitedById;
    if (!ownerId) return [];
    const now = new Date();
    const rows = await ctx.db.entry.findMany({
      where: {
        authorId: ownerId,
        deletedAt: null,
        collectionOnly: false,
        isDraft: false,
        OR: [{ hideUntilAt: null }, { hideUntilAt: { lte: now } }],
      },
      select: {
        id: true, date: true, mood: true, noteType: true, customTypeId: true, sleepHours: true, timeLabel: true, title: true, contentMd: true, mediaMeta: true,
        authorId: true, visibility: true, isSecret: true, isAdult: true, unlockAt: true, readGatePrompt: true,
        shares: { select: { receiverId: true, canComment: true } },
      },
    });
    return rows
      .filter((e) => canRead(user, e))
      .map((e) => {
        const hidden = e.isAdult || (e.unlockAt != null && e.unlockAt.getTime() > now.getTime()) || !!e.readGatePrompt;
        return {
          id: e.id,
          date: e.date.toISOString().slice(0, 10), // DateTime @db.Date → "YYYY-MM-DD" (clé de groupage client)
          mood: e.mood,
          noteType: e.noteType,
          customTypeId: e.customTypeId,
          sleepHours: e.sleepHours,
          timeLabel: e.timeLabel,
          title: hidden ? null : e.title,
          contentMd: hidden ? '' : e.contentMd,
          mediaMeta: hidden ? null : redactQuizForGuest(e.mediaMeta),
          isSecret: false as boolean,
          isDraft: false as boolean,
        };
      });
  }),

  byId: authedProcedure
    .input(byIdInput)
    .query(async ({ ctx, input }) => {
      const rawEntry = await ctx.db.entry.findFirst({
        where: { id: input.id, deletedAt: null },
        select: ENTRY_SELECT,
      });

      if (!rawEntry) throw new TRPCError({ code: 'NOT_FOUND', message: 'Entrée introuvable.' });

      // Filtre les ratings selon le rôle du viewer dès que possible — owner
      // voit tout, guest ne voit que la sienne + celle de l'auteur.
      // `flattenEntryTags` aplatit `tags: { tag: { name } }[]` en `tagNames: string[]`
      // pour exposer la même shape que `sync.pull/push`.
      const entry = { ...flattenEntryTags(rawEntry), ratings: filterRatingsForUser(rawEntry.ratings, ctx.user, rawEntry.authorId) };

      // Boîte de Pandore : un CONFIDANT voit l'entrée secrète mais avec contenu rédacté
      const isConfidantOnSecret =
        entry.isSecret &&
        ctx.user.role === 'GUEST' &&
        ctx.user.guestAccess === 'CONFIDANT';

      if (!isConfidantOnSecret && !canRead(ctx.user, entry)) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Entrée introuvable.' });
      }

      if (ctx.user.role === 'GUEST') {
        await ctx.db.auditLog.create({
          data: {
            userId: ctx.user.id,
            action: 'GUEST_VIEW',
            entryId: entry.id,
            ipHash: ctx.ipHash,
            userAgent: ctx.userAgent,
          },
        });
      }

      // Read gate check for guests
      let readGateStatus: 'awaiting' | 'pending' | 'approved' | 'rejected' | null = null;
      if (ctx.user.role === 'GUEST' && entry.readGatePrompt) {
        const gateResponse = await ctx.db.readGateResponse.findUnique({
          where: { entryId_guestId: { entryId: entry.id, guestId: ctx.user.id } },
          select: { approved: true },
        });
        const approved = gateResponse?.approved;
        readGateStatus = approved === true ? 'approved' : approved === false ? 'rejected' : approved === null ? 'pending' : 'awaiting';
      }

      const adultLengthHint = entry.isAdult ? (entry.contentMd ?? '').length : null;
      const adultHasMediaHint = entry.isAdult ? !!entry.mediaMeta : null;

      // Shape constant : toujours les mêmes champs pour éviter les unions trop profondes côté TS
      const finalize = (e: typeof entry) => ({
        ...e,
        adultAnswerHash: null as string | null,
        adultLength: adultLengthHint,
        adultHasMedia: adultHasMediaHint,
        readGateStatus,
      });

      // L'owner voit toujours son propre contenu (hash retiré quand même).
      // `readGateAcceptedResponses` reste exposé : l'owner doit pouvoir les
      // relire/éditer depuis son composer.
      if (ctx.user.role === 'OWNER') return finalize(entry);

      // Côté guest : neutraliser les champs sensibles qui ne doivent jamais
      // partir côté confident (cf. doc dans `guestRedact` du `list`).
      //   - readGateAcceptedResponses : permettrait de bypasser le verrou
      //   - adultMercyAnswer : réponse de clémence en clair
      //   - shares : on ne renvoie que la ligne du viewer (s'il y est)
      const guestSafe = <T extends typeof entry>(e: T): T => ({
        ...e,
        readGateAcceptedResponses: [] as string[],
        adultMercyAnswer: null,
        shares: (e.shares ?? []).filter((s) => s.receiverId === ctx.user.id),
        // Masque les bonnes réponses du quiz (correction serveur).
        mediaMeta: redactQuizForGuest(e.mediaMeta),
      });

      // CONFIDANT sur secret : on rédacte titre/contenu/links
      if (isConfidantOnSecret) {
        return finalize(guestSafe({
          ...entry,
          contentMd: '',
          title: null,
          links: null,
          ...(entry.isAdult ? { mediaMeta: null } : {}),
        }));
      }

      // Guests : masquer hash, contenu, titre, mediaMeta des entrées 18+
      const redacted = sealRedact(entry);
      if (redacted.isAdult) {
        return finalize(guestSafe({ ...redacted, contentMd: '', links: null, title: null, mediaMeta: null }));
      }
      // Read gate : redacte si le guest n'est pas approuvé
      if (readGateStatus && readGateStatus !== 'approved') {
        return finalize(guestSafe({ ...redacted, contentMd: '', links: null, title: null, mediaMeta: null }));
      }
      return finalize(guestSafe(redacted));
    }),

  update: ownerProcedure
    .input(updateEntryInput)
    .mutation(async ({ ctx, input }) => {
      const { id, version, date, ...fields } = input;

      return ctx.db.$transaction(async (tx) => {
        const current = await tx.entry.findFirst({
          where: { id, authorId: ctx.user.id, deletedAt: null },
          select: { id: true, version: true, contentMd: true },
        });

        if (!current) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Entrée introuvable.' });
        }

        if (current.version !== version) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: "Conflit de version — l'entrée a été modifiée entre-temps.",
          });
        }

        if (fields.contentMd !== undefined && fields.contentMd !== current.contentMd) {
          await tx.entryRevision.create({
            data: {
              entryId: id,
              contentMd: current.contentMd,
              authorId: ctx.user.id,
              reason: 'manual_save',
            },
          });
        }

        const updated = await tx.entry.update({
          where: { id },
          data: {
            section: fields.section,
            title: fields.title,
            contentMd: fields.contentMd,
            mood: fields.mood,
            sleepHours: fields.sleepHours,
            weather: fields.weather,
            timeLabel: fields.timeLabel ?? null,
            noteType: fields.noteType ?? undefined,
            mediaMeta: fields.mediaMeta ?? undefined,
            font: fields.font !== undefined ? (fields.font ?? null) : undefined,
            fontSize: fields.fontSize !== undefined ? (fields.fontSize ?? null) : undefined,
            visibility: fields.visibility,
            ...(fields.unlockAt !== undefined ? { unlockAt: fields.unlockAt ? new Date(fields.unlockAt) : null } : {}),
            ...(fields.hideUntilAt !== undefined ? { hideUntilAt: fields.hideUntilAt ? new Date(fields.hideUntilAt) : null } : {}),
            ...(fields.collectionOnly !== undefined ? { collectionOnly: fields.collectionOnly } : {}),
            ...(date !== undefined ? { date: new Date(date) } : {}),
            version: { increment: 1 },
          },
          select: ENTRY_SELECT,
        });
        return flattenEntryTags(updated);
      });
    }),

  /** Scelle ou descelle une entrée (capsule temporelle). */
  seal: ownerProcedure
    .input(z.object({
      id: z.string().min(1).max(64),
      unlockAt: z.string().datetime().nullable(),
      capsuleSpoiler: z.string().max(500).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Lit l'unlockAt actuel pour savoir s'il a changé : si oui, on reset
      // `capsuleNotifSentAt` (le cron repartira pour la nouvelle date). Sinon
      // on laisse le marqueur intact pour éviter un double-envoi (ex: modif du
      // seul spoiler d'une capsule déjà ouverte).
      const previous = await ctx.db.entry.findFirst({
        where: { id: input.id, authorId: ctx.user.id, deletedAt: null },
        select: { unlockAt: true },
      });
      const newUnlockAt = input.unlockAt ? new Date(input.unlockAt) : null;
      const unlockChanged = (previous?.unlockAt?.getTime() ?? null) !== (newUnlockAt?.getTime() ?? null);
      await ctx.db.entry.update({
        where: { id: input.id, authorId: ctx.user.id, deletedAt: null },
        data: {
          unlockAt: newUnlockAt,
          ...(input.capsuleSpoiler !== undefined ? { capsuleSpoiler: input.capsuleSpoiler } : {}),
          ...(unlockChanged ? { capsuleNotifSentAt: null } : {}),
        },
      });
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.user.id,
          action: input.unlockAt ? 'ENTRY_SEALED' : 'ENTRY_UNSEALED',
          ipHash: ctx.ipHash,
          userAgent: ctx.userAgent,
          metadata: { entryId: input.id, unlockAt: input.unlockAt },
        },
      });
      return { ok: true };
    }),

  /** Toutes les capsules temporelles de l'owner (unlockAt non null). */
  listCapsules: ownerProcedure
    .query(async ({ ctx }) => {
      const capsules = await ctx.db.entry.findMany({
        where: { authorId: ctx.user.id, deletedAt: null, unlockAt: { not: null } },
        orderBy: { unlockAt: 'asc' },
        take: 500,
        select: ENTRY_SELECT,
      });
      return capsules.map(flattenEntryTags);
    }),

  confidantReadIds: ownerProcedure
    .query(async ({ ctx }) => {
      const rows = await ctx.db.entryReadStatus.findMany({
        where: {
          user: { invitedById: ctx.user.id, role: 'GUEST', revokedAt: null },
        },
        select: { entryId: true },
        distinct: ['entryId'],
      });
      return rows.map((r) => r.entryId);
    }),

  readIds: authedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== 'GUEST') return [];
      const rows = await ctx.db.entryReadStatus.findMany({
        where: { userId: ctx.user.id },
        select: { entryId: true },
      });
      return rows.map((r) => r.entryId);
    }),

  markRead: authedProcedure
    .input(z.object({ entryId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'GUEST') return { ok: true };
      const entry = await ctx.db.entry.findFirst({
        where: { id: input.entryId, deletedAt: null },
        select: { authorId: true, visibility: true, isSecret: true, unlockAt: true, shares: { select: { receiverId: true, canComment: true } } },
      });
      if (!entry || !canRead(ctx.user, entry)) throw new TRPCError({ code: 'NOT_FOUND' });
      // Une capsule encore scellée ne peut pas être « lue » : son contenu est
      // redacté côté serveur (cf. sealRedact). On n'enregistre donc aucun statut
      // de lecture tant que la date d'ouverture n'est pas atteinte.
      if (entry.unlockAt && entry.unlockAt > new Date()) return { ok: true };
      await ctx.db.entryReadStatus.upsert({
        where: { userId_entryId: { userId: ctx.user.id, entryId: input.entryId } },
        create: { userId: ctx.user.id, entryId: input.entryId },
        update: {},
      });
      return { ok: true };
    }),

  markUnread: authedProcedure
    .input(z.object({ entryId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'GUEST') return { ok: true };
      const entry = await ctx.db.entry.findFirst({
        where: { id: input.entryId, deletedAt: null },
        select: { authorId: true, visibility: true, isSecret: true, shares: { select: { receiverId: true, canComment: true } } },
      });
      if (!entry || !canRead(ctx.user, entry)) throw new TRPCError({ code: 'NOT_FOUND' });
      await ctx.db.entryReadStatus.deleteMany({
        where: { userId: ctx.user.id, entryId: input.entryId },
      });
      return { ok: true };
    }),

  /**
   * Journalise l'ouverture d'une note par un confident (audit `ENTRY_OPENED`).
   * Émis par le client à chaque ouverture réelle (modal/panneau), indépendamment
   * du statut « lu ». No-op pour l'owner (on ne trace pas ses propres ouvertures)
   * et silencieux si la note n'est pas lisible par l'appelant (anti-pollution).
   */
  logOpen: authedProcedure
    .input(z.object({ entryId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'GUEST') return { ok: true };
      const entry = await ctx.db.entry.findFirst({
        where: { id: input.entryId, deletedAt: null },
        select: { authorId: true, title: true, visibility: true, isSecret: true, shares: { select: { receiverId: true, canComment: true } } },
      });
      if (!entry || !canRead(ctx.user, entry)) return { ok: true };
      recordAudit(ctx, 'ENTRY_OPENED', { entryId: input.entryId, metadata: { title: entry.title } });
      return { ok: true };
    }),

  fetchLinkMeta: ownerProcedure
    .input(z.object({
      url: z.string().url().max(2000).refine(
        (u) => u.startsWith('https://') || u.startsWith('http://'),
        'HTTP/HTTPS uniquement',
      ),
    }))
    .query(async ({ input }) => {
      // SSRF protection : rejeter les IPs/hosts privés ou locaux
      const { hostname } = new URL(input.url);
      const isPrivate =
        /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0)$/i.test(hostname) ||
        /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
        /^192\.168\.\d+\.\d+$/.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(hostname) ||
        /^169\.254\.\d+\.\d+$/.test(hostname) ||
        /^(::1|fc00:|fd[0-9a-f]{2}:)/i.test(hostname);
      if (isPrivate) throw new TRPCError({ code: 'BAD_REQUEST', message: 'URL non autorisée.' });

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(input.url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DiaryBot/1.0)' },
        });
        clearTimeout(timer);
        const html = await res.text();

        function getMeta(prop: string): string | null {
          const r1 = html.match(new RegExp(`<meta[^>]*(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i'));
          if (r1?.[1]) return r1[1];
          const r2 = html.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i'));
          return r2?.[1] ?? null;
        }

        const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const hostname = new URL(input.url).hostname.replace(/^www\./, '');
        const rawImage = getMeta('og:image') || null;
        const image = rawImage?.startsWith('//') ? `https:${rawImage}` : rawImage;

        return {
          url: input.url,
          title: getMeta('og:title') || titleTag?.[1]?.trim() || null,
          image,
          siteName: getMeta('og:site_name') || hostname,
        };
      } catch {
        const hostname = new URL(input.url).hostname.replace(/^www\./, '');
        return { url: input.url, title: null, image: null, siteName: hostname };
      }
    }),

  setVisibility: ownerProcedure
    .input(z.object({ id: z.string(), visibility: z.enum(['PRIVATE', 'SHARED_ALL', 'SHARED_SPECIFIC']) }))
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db.entry.findFirst({
        where: { id: input.id, authorId: ctx.user.id, deletedAt: null },
        select: { id: true },
      });
      if (!entry) throw new TRPCError({ code: 'NOT_FOUND' });
      await ctx.db.entry.update({
        where: { id: input.id },
        data: { visibility: input.visibility },
      });
      return { ok: true };
    }),

  setShares: ownerProcedure
    .input(z.object({ id: z.string(), guestIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db.entry.findFirst({
        where: { id: input.id, authorId: ctx.user.id, deletedAt: null },
        select: { id: true },
      });
      if (!entry) throw new TRPCError({ code: 'NOT_FOUND' });

      // Validate that all guestIds belong to guests invited by this owner
      // (et non révoqués — on ne partage pas à un confident soft-deleted).
      const validGuests = await ctx.db.user.findMany({
        where: { id: { in: input.guestIds }, role: 'GUEST', invitedById: ctx.user.id, revokedAt: null },
        select: { id: true, guestCanComment: true },
      });

      await ctx.db.$transaction([
        ctx.db.entryShare.deleteMany({ where: { entryId: input.id } }),
        ...validGuests.map((guest) =>
          ctx.db.entryShare.create({
            data: { entryId: input.id, receiverId: guest.id, canComment: guest.guestCanComment },
          }),
        ),
      ]);
      return { ok: true };
    }),

  setForConfidant: ownerProcedure
    .input(z.object({ id: z.string(), isForConfidant: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db.entry.findFirst({
        where: { id: input.id, authorId: ctx.user.id, deletedAt: null },
        select: { id: true },
      });
      if (!entry) throw new TRPCError({ code: 'NOT_FOUND' });
      await ctx.db.entry.update({
        where: { id: input.id },
        data: { isForConfidant: input.isForConfidant },
      });
      return { ok: true };
    }),

  setSecret: ownerProcedure
    .input(z.object({ id: z.string(), isSecret: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db.entry.findFirst({
        where: { id: input.id, authorId: ctx.user.id, deletedAt: null },
        select: { id: true },
      });
      if (!entry) throw new TRPCError({ code: 'NOT_FOUND' });
      await ctx.db.entry.update({
        where: { id: input.id },
        data: { isSecret: input.isSecret },
      });
      return { ok: true };
    }),

  // Endpoint léger pour détecter les changements de secrets côté confident
  // Retourne un token (count + dernière update) sans renvoyer de contenu
  secretsChecksum: authedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== 'GUEST' || ctx.user.guestAccess !== 'CONFIDANT') {
        return { checksum: '' };
      }
      const agg = await ctx.db.entry.aggregate({
        where: { deletedAt: null, isSecret: true },
        _count: { id: true },
        _max: { updatedAt: true },
      });
      const count = agg._count.id;
      const lastUpdate = agg._max.updatedAt?.getTime() ?? 0;
      return { checksum: `${count}:${lastUpdate}` };
    }),

  /**
   * Déverouille une entrée 18+ : vérifie la réponse côté serveur et renvoie le contenu réel si correct.
   * Le contenu n'est jamais envoyé au client sans cette vérification.
   */
  unlockAdultContent: authedProcedure
    .input(z.object({ id: z.string(), answer: z.string().max(500) }))
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db.entry.findFirst({
        where: { id: input.id, deletedAt: null },
        select: {
          adultAnswerHash: true,
          adultMercyAnswer: true,
          authorId: true,
          visibility: true,
          isAdult: true,
          contentMd: true,
          links: true,
          title: true,
          mediaMeta: true,
          shares: { select: { receiverId: true } },
        },
      });
      if (!entry || !entry.isAdult) throw new TRPCError({ code: 'NOT_FOUND' });
      if (ctx.user.role !== 'OWNER' && !canRead(ctx.user, entry as any)) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      const normalize = (s: string) =>
        s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const newHash = createHash('sha256').update(normalize(input.answer)).digest('hex');
      const legacyHash = createHash('sha256').update(input.answer.trim().toLowerCase()).digest('hex');
      const ok = entry.adultAnswerHash === newHash || entry.adultAnswerHash === legacyHash;

      // ── Logique de clémence (mercy) ──────────────────────────────────────
      // Si l'owner a défini `adultMercyAnswer` ET que le confident a déjà
      // soumis 100 réponses UNIQUES ratées, on accorde l'accès et on révèle
      // la bonne réponse. Owner exclu (il n'est pas censé attaquer son propre
      // verrou). Indépendant du résultat actuel — la mercy se déclenche dès le
      // 100e essai, même si celui-ci est faux.
      const MERCY_THRESHOLD = 100;
      let mercyTriggered = false;
      let mercyAnswerToReveal: string | null = null;
      if (!ok && ctx.user.role === 'GUEST' && entry.adultMercyAnswer) {
        const allAttempts = await ctx.db.auditLog.findMany({
          where: { userId: ctx.user.id, entryId: input.id, action: 'adult_attempt' },
          select: { metadata: true },
        });
        const uniqueWrong = new Set<string>();
        for (const a of allAttempts) {
          const meta = a.metadata as { success?: boolean; answer?: string } | null;
          if (meta?.success === false && typeof meta.answer === 'string') {
            uniqueWrong.add(meta.answer);
          }
        }
        // L'essai courant compte aussi (il est forcément faux ici)
        uniqueWrong.add(input.answer);
        if (uniqueWrong.size >= MERCY_THRESHOLD) {
          mercyTriggered = true;
          mercyAnswerToReveal = entry.adultMercyAnswer;
        }
      }

      if (ctx.user.role === 'GUEST') {
        await ctx.db.auditLog.create({
          data: {
            userId: ctx.user.id,
            action: 'adult_attempt',
            entryId: input.id,
            metadata: { success: ok || mercyTriggered, answer: input.answer, mercy: mercyTriggered || undefined },
          },
        });
      }

      if (!ok && !mercyTriggered) {
        return { ok: false as const, mercy: false as const, contentMd: null, links: null, title: null, mediaMeta: null };
      }
      return {
        ok: true as const,
        // `mercy: true` permet au client d'afficher un bandeau "L'auteur t'a accordé
        // l'accès après tes nombreuses tentatives" + la réponse révélée.
        mercy: mercyTriggered,
        mercyAnswer: mercyAnswerToReveal,
        contentMd: entry.contentMd,
        links: entry.links,
        title: entry.title,
        mediaMeta: entry.mediaMeta,
      };
    }),

  adultAttemptStats: ownerProcedure
    .input(z.object({ entryId: z.string() }))
    .query(async ({ ctx, input }) => {
      const logs = await ctx.db.auditLog.findMany({
        where: { entryId: input.entryId, action: 'adult_attempt' },
        include: { user: { select: { displayName: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return {
        total: logs.length,
        attempts: logs.map((log) => {
          const meta = log.metadata as { success?: boolean; answer?: string } | null;
          return {
            userName: log.user?.displayName ?? 'Inconnu',
            answer: meta?.answer ?? '—',
            success: meta?.success ?? false,
            at: log.createdAt,
          };
        }),
      };
    }),

  setAdult: ownerProcedure
    .input(z.object({
      id: z.string(),
      isAdult: z.boolean(),
      adultQuestion: z.string().max(500).nullable(),
      adultAnswerHash: z.string().max(64).nullable(),
      adultHints: z.array(z.string().max(500)).max(5).default([]),
      // Réponse révélée au confident après 100 essais ratés uniques. Null = feature off.
      adultMercyAnswer: z.string().max(500).nullable().default(null),
    }))
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db.entry.findFirst({
        where: { id: input.id, authorId: ctx.user.id, deletedAt: null },
        select: { id: true },
      });
      if (!entry) throw new TRPCError({ code: 'NOT_FOUND' });
      await ctx.db.entry.update({
        where: { id: input.id },
        data: {
          isAdult: input.isAdult,
          adultQuestion: input.isAdult ? input.adultQuestion : null,
          adultAnswerHash: input.isAdult ? input.adultAnswerHash : null,
          adultHints: input.isAdult ? input.adultHints.filter(Boolean) : [],
          adultMercyAnswer: input.isAdult ? (input.adultMercyAnswer || null) : null,
        },
      });
      return { ok: true };
    }),

  setLinks: ownerProcedure
    .input(z.object({ id: z.string(), links: z.array(z.object({
      url: z.string().url().max(2000),
      title: z.string().max(500).nullable(),
      image: z.string().max(2000).nullable(),
      siteName: z.string().max(200).nullable(),
    })).nullable() }))
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db.entry.findFirst({
        where: { id: input.id, authorId: ctx.user.id, deletedAt: null },
        select: { id: true },
      });
      if (!entry) throw new TRPCError({ code: 'NOT_FOUND' });
      await ctx.db.entry.update({
        where: { id: input.id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { links: (input.links ?? undefined) as any },
      });
      return { ok: true };
    }),

  delete: ownerProcedure
    .input(byIdInput)
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db.entry.findFirst({
        where: { id: input.id, authorId: ctx.user.id, deletedAt: null },
        select: { id: true },
      });

      if (!entry) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Entrée introuvable.' });
      }

      await ctx.db.entry.update({
        where: { id: input.id },
        data: { deletedAt: new Date() },
      });

      return { ok: true };
    }),

  // ── TASK-1 : Full-text search (Postgres tsvector) ──────────────────────────
  search: ownerProcedure
    .input(z.object({ query: z.string().min(1).max(200) }))
    .query(async ({ ctx, input }) => {
      // Convertit la requête en to_tsquery : tokenise sur les espaces et joint avec &
      // Les mots courts (<3 chars) sont ignorés par le dictionnaire french — toléré.
      const tokens = input.query
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((t) => t.replace(/[^a-zA-ZÀ-ÿ0-9''-]/g, '').trim())
        .filter((t) => t.length > 0);

      if (tokens.length === 0) return [];

      // Requête prefix sur chaque token (ajout de :*) pour la recherche en temps réel
      const tsQueryStr = tokens.map((t) => `${t}:*`).join(' & ');

      type Row = {
        id: string;
        title: string | null;
        date: Date;
        contentMd: string;
        mood: string | null;
        noteType: string;
        createdAt: Date;
        updatedAt: Date;
        section: string | null;
        timeLabel: string | null;
        visibility: string;
        isDraft: boolean;
        isForConfidant: boolean;
        isSecret: boolean;
        version: number;
      };

      const rows = await ctx.db.$queryRaw<Row[]>`
        SELECT id, title, date, "contentMd", mood, "noteType", "createdAt", "updatedAt",
               section, "timeLabel", visibility, "isDraft", "isForConfidant", "isSecret", version
        FROM "Entry"
        WHERE "authorId" = ${ctx.user.id}
          AND "deletedAt" IS NULL
          AND "searchVector" @@ to_tsquery('french', ${tsQueryStr})
        ORDER BY ts_rank("searchVector", to_tsquery('french', ${tsQueryStr})) DESC
        LIMIT 30
      `;

      return rows.map((r) => ({
        ...r,
        date: r.date.toISOString().slice(0, 10),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }));
    }),

  // ── TASK-2 : Souvenirs "en cascade" (semaine → mois → année) ────────────────
  // Aperçu : un échantillon ALÉATOIRE par chargement (seed envoyée par le client,
  // tirée au hasard à chaque montage de la page) pour ne pas re-servir les mêmes
  // notes plusieurs jours d'affilée. La liste complète d'une période passe par
  // `onThisDayPeriod`.
  onThisDay: authedProcedure
    .input(
      z
        .object({
          seed: z.string().max(64).optional(),
          limit: z.number().int().min(1).max(12).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      // OWNER : ses notes. GUEST : les notes qu'il peut lire (cf. souvenirAccessSql).
      if (ctx.user.role !== 'OWNER' && ctx.user.role !== 'GUEST') return [];

      const now = new Date();
      const w = souvenirWindows(now);
      // Seed du tirage : valeur client (aléatoire par chargement) sinon fallback
      // déterministe sur la date du jour.
      const seed = input?.seed && input.seed.length > 0 ? input.seed : w.today;
      const limit = input?.limit ?? 5;
      const draftThreshold = new Date(now.getTime() - DRAFT_GRACE_MS);
      const access = souvenirAccessSql(ctx.user, draftThreshold);
      const nonEmpty = Prisma.sql`(length(btrim("contentMd")) > 0 OR title IS NOT NULL OR "mediaMeta" IS NOT NULL)`;

      type EntryRow = {
        id: string;
        title: string | null;
        date: Date;
        contentMd: string;
        mood: string | null;
        noteType: string;
        customTypeId: string | null;
        createdAt: Date;
        mediaMeta: Record<string, unknown> | null;
        commentCount: number;
        reactions: Array<{ emoji: string; count: number }>;
      };

      type Period = 'week' | 'month' | 'year';

      const results: Array<{ period: Period; entry: EntryRow; totalForDate: number }> = [];

      // ── 1. Il y a une semaine : fenêtre J-14 → J-7 ──────────────────────
      const weekWhere = Prisma.sql`${access} AND ${nonEmpty}
        AND date >= ${w.week.from}::date AND date <= ${w.week.to}::date`;
      const weekCount = await ctx.db.$queryRaw<Array<{ c: bigint }>>`
        SELECT COUNT(*) AS c FROM "Entry" WHERE ${weekWhere}
      `;
      const weekTotal = Number(weekCount[0]?.c ?? 0);
      if (weekTotal > 0) {
        const weekEntries = await ctx.db.$queryRaw<EntryRow[]>`
          SELECT ${SOUVENIR_SELECT_COLS}
          FROM "Entry" WHERE ${weekWhere}
          ORDER BY hashtext(id || ${seed})
          LIMIT ${limit}
        `;
        for (const e of weekEntries) results.push({ period: 'week', entry: e, totalForDate: weekTotal });
      }

      // ── 2. Il y a un mois : mois calendaire précédent, hors fenêtre semaine ──
      // On exclut les dates déjà couvertes par la fenêtre semaine (J-14 → J-7)
      // pour éviter les doublons quand le mois précédent chevauche cette plage.
      const monthWhere = Prisma.sql`${access} AND ${nonEmpty}
        AND date >= ${w.month.start}::date AND date <= ${w.month.end}::date
        AND NOT (date >= ${w.week.from}::date AND date <= ${w.week.to}::date)`;
      const monthCount = await ctx.db.$queryRaw<Array<{ c: bigint }>>`
        SELECT COUNT(*) AS c FROM "Entry" WHERE ${monthWhere}
      `;
      const monthTotal = Number(monthCount[0]?.c ?? 0);
      if (monthTotal > 0) {
        const monthEntries = await ctx.db.$queryRaw<EntryRow[]>`
          SELECT ${SOUVENIR_SELECT_COLS}
          FROM "Entry" WHERE ${monthWhere}
          ORDER BY hashtext(id || ${seed})
          LIMIT ${limit}
        `;
        for (const e of monthEntries) results.push({ period: 'month', entry: e, totalForDate: monthTotal });
      }

      // ── 3. Il y a un an : année calendaire précédente ───────────────────
      const yearWhere = Prisma.sql`${access} AND ${nonEmpty}
        AND date >= ${w.year.start}::date AND date <= ${w.year.end}::date`;
      const yearCount = await ctx.db.$queryRaw<Array<{ c: bigint }>>`
        SELECT COUNT(*) AS c FROM "Entry" WHERE ${yearWhere}
      `;
      const yearTotal = Number(yearCount[0]?.c ?? 0);
      if (yearTotal > 0) {
        const yearEntries = await ctx.db.$queryRaw<EntryRow[]>`
          SELECT ${SOUVENIR_SELECT_COLS}
          FROM "Entry" WHERE ${yearWhere}
          ORDER BY hashtext(id || ${seed})
          LIMIT ${limit}
        `;
        for (const e of yearEntries) results.push({ period: 'year', entry: e, totalForDate: yearTotal });
      }

      return results.map(({ period, entry: e, totalForDate }) => ({
        period,
        totalForDate,
        id: e.id,
        title: e.title,
        date: e.date.toISOString().slice(0, 10),
        contentMd: e.contentMd,
        mood: e.mood,
        noteType: e.noteType,
        customTypeId: e.customTypeId,
        createdAt: e.createdAt.toISOString(),
        mediaMeta: (e.mediaMeta ?? null) as { subject?: string } | null,
        commentCount: e.commentCount,
        reactions: e.reactions ?? [],
      }));
    }),

  // ── Liste complète d'une période de Souvenirs (panneau « voir tout ») ───────
  // Renvoie TOUTES les notes de la période demandée, en ordre chronologique
  // décroissant (plus récent d'abord). Alimente le drawer/bottom-sheet ouvert
  // depuis l'aperçu `OnThisDay`.
  onThisDayPeriod: authedProcedure
    .input(z.object({ period: z.enum(['week', 'month', 'year']) }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== 'OWNER' && ctx.user.role !== 'GUEST') return [];

      const now = new Date();
      const w = souvenirWindows(now);
      const draftThreshold = new Date(now.getTime() - DRAFT_GRACE_MS);
      const access = souvenirAccessSql(ctx.user, draftThreshold);
      const nonEmpty = Prisma.sql`(length(btrim("contentMd")) > 0 OR title IS NOT NULL OR "mediaMeta" IS NOT NULL)`;

      type EntryRow = {
        id: string;
        title: string | null;
        date: Date;
        contentMd: string;
        mood: string | null;
        noteType: string;
        customTypeId: string | null;
        createdAt: Date;
        mediaMeta: Record<string, unknown> | null;
        commentCount: number;
        reactions: Array<{ emoji: string; count: number }>;
      };

      let dateClause: Prisma.Sql;
      if (input.period === 'week') {
        dateClause = Prisma.sql`date >= ${w.week.from}::date AND date <= ${w.week.to}::date`;
      } else if (input.period === 'month') {
        dateClause = Prisma.sql`date >= ${w.month.start}::date AND date <= ${w.month.end}::date
          AND NOT (date >= ${w.week.from}::date AND date <= ${w.week.to}::date)`;
      } else {
        dateClause = Prisma.sql`date >= ${w.year.start}::date AND date <= ${w.year.end}::date`;
      }

      const rows = await ctx.db.$queryRaw<EntryRow[]>`
        SELECT ${SOUVENIR_SELECT_COLS}
        FROM "Entry"
        WHERE ${access} AND ${nonEmpty} AND ${dateClause}
        ORDER BY date DESC, "createdAt" DESC
        LIMIT 300
      `;

      return rows.map((e) => ({
        period: input.period,
        id: e.id,
        title: e.title,
        date: e.date.toISOString().slice(0, 10),
        contentMd: e.contentMd,
        mood: e.mood,
        noteType: e.noteType,
        customTypeId: e.customTypeId,
        createdAt: e.createdAt.toISOString(),
        mediaMeta: (e.mediaMeta ?? null) as { subject?: string } | null,
        commentCount: e.commentCount,
        reactions: e.reactions ?? [],
      }));
    }),

  // ── TASK-3 : Vue calendrier (compact par jour) ───────────────────────────────
  byMonth: authedProcedure
    .input(z.object({
      year: z.number().int().min(2000).max(2100),
      month: z.number().int().min(1).max(12),
    }))
    .query(async ({ ctx, input }) => {
      const { user } = ctx;
      const start = new Date(Date.UTC(input.year, input.month - 1, 1));
      const end = new Date(Date.UTC(input.year, input.month, 1)); // exclusive

      type Row = { date: Date; noteType: string };

      let rows: Row[];

      if (user.role === 'OWNER') {
        rows = await ctx.db.entry.findMany({
          where: {
            authorId: user.id,
            deletedAt: null,
            date: { gte: start, lt: end },
          },
          select: { date: true, noteType: true },
          orderBy: { date: 'asc' },
        });
      } else {
        // Guest : filtrer selon canRead
        const all = await ctx.db.entry.findMany({
          where: {
            deletedAt: null,
            date: { gte: start, lt: end },
          },
          select: {
            date: true,
            noteType: true,
            authorId: true,
            visibility: true,
            isSecret: true,
            shares: { select: { receiverId: true, canComment: true } },
          },
          orderBy: { date: 'asc' },
        });
        rows = all.filter((e) => canRead(user, e));
      }

      // Grouper par date ISO (YYYY-MM-DD)
      const byDate = new Map<string, string[]>();
      for (const row of rows) {
        const key = row.date.toISOString().slice(0, 10);
        const types = byDate.get(key) ?? [];
        if (!types.includes(row.noteType)) types.push(row.noteType);
        byDate.set(key, types);
      }

      return Array.from(byDate.entries()).map(([date, types]) => ({ date, types }));
    }),

  correctText: authedProcedure
    .input(z.object({ text: z.string().max(100_000) }))
    .mutation(async ({ input }) => {
      const ltUrl = process.env.LANGUAGETOOL_URL;
      if (!ltUrl) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'LanguageTool non configuré.' });

      // Découpe le markdown en segments texte / markup pour que LT ignore le HTML,
      // les entités, le code, les liens, les markers markdown, etc.
      const markupRe = /<\/?[a-zA-Z][^>]*>|&(?:[a-zA-Z][a-zA-Z0-9]*|#\d+);|```[\s\S]*?```|`[^`\n]+`|!\[[^\]]*\]\([^)]+\)|\[[^\]]*\]\([^)]+\)|^#{1,6}\s+|^>+\s+|^[-*+]\s+|^\d+\.\s+|:::\w*|\*\*|__|~~/gm;
      type Seg = { text: string } | { markup: string };
      const annotation: Seg[] = [];
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = markupRe.exec(input.text)) !== null) {
        if (m.index > last) annotation.push({ text: input.text.slice(last, m.index) });
        annotation.push({ markup: m[0] });
        last = m.index + m[0].length;
      }
      if (last < input.text.length) annotation.push({ text: input.text.slice(last) });

      // LT public refuse les annotations contenant uniquement du markup ou des
      // segments text vides — on filtre les édges cases pour éviter des 400.
      const cleanAnnotation = annotation.filter((s) => 'markup' in s ? s.markup.length > 0 : s.text.length > 0);
      if (!cleanAnnotation.some((s) => 'text' in s && s.text.trim().length > 0)) {
        return { correctedText: input.text, count: 0, details: [] };
      }

      const res = await fetch(`${ltUrl}/v2/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: JSON.stringify({ annotation: cleanAnnotation }), language: 'fr', enabledOnly: 'false' }).toString(),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `LanguageTool a renvoyé ${res.status}${body ? ' : ' + body.slice(0, 200) : ''}`,
        });
      }

      const data = await res.json() as {
        matches: Array<{
          message: string;
          shortMessage: string;
          offset: number;
          length: number;
          replacements: Array<{ value: string }>;
          context: { text: string; offset: number; length: number };
          rule: { id: string; description: string };
        }>;
      };

      const matches = data.matches.filter((m) => m.replacements.length > 0);

      // Apply corrections right-to-left to preserve offsets
      let corrected = input.text;
      const sorted = [...matches].sort((a, b) => b.offset - a.offset);
      for (const m of sorted) {
        const rep = m.replacements[0]!.value;
        corrected = corrected.slice(0, m.offset) + rep + corrected.slice(m.offset + m.length);
      }

      const details = matches.map((m) => ({
        offset: m.offset,
        length: m.length,
        original: input.text.slice(m.offset, m.offset + m.length),
        replacement: m.replacements[0]!.value,
        message: m.shortMessage || m.message,
        ruleId: m.rule.id,
      }));

      return { correctedText: corrected, count: matches.length, details };
    }),

  setReadGate: ownerProcedure
    .input(z.object({
      id: z.string(),
      readGatePrompt: z.string().max(1000).nullable(),
      readGateAcceptedResponses: z.array(z.string().max(500)).max(20).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db.entry.findFirst({
        where: { id: input.id, authorId: ctx.user.id, deletedAt: null },
        select: { id: true },
      });
      if (!entry) throw new TRPCError({ code: 'NOT_FOUND' });
      await ctx.db.entry.update({
        where: { id: input.id },
        data: {
          readGatePrompt: input.readGatePrompt || null,
          readGateAcceptedResponses: input.readGatePrompt
            ? input.readGateAcceptedResponses.map((r) => r.trim()).filter(Boolean)
            : [],
        },
      });
      if (!input.readGatePrompt) {
        await ctx.db.readGateResponse.deleteMany({ where: { entryId: input.id } });
      }
      return { ok: true };
    }),

  /**
   * Trouve la première vidéo YouTube correspondant à une requête (titre + artiste).
   * Scrape la page de résultats public — pas d'API key, mais fragile aux changements
   * HTML de YouTube. Renvoie null si rien trouvé.
   */
  findYouTubeForTrack: ownerProcedure
    .input(z.object({
      title: z.string().min(1).max(200),
      artist: z.string().max(200).optional(),
    }))
    .query(async ({ input }) => {
      const q = input.artist ? `${input.artist} ${input.title}` : input.title;
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
          },
        });
        clearTimeout(timer);
        if (!res.ok) return null;
        const html = await res.text();
        // Le premier "videoId":"XXXXXXX" dans ytInitialData est presque toujours le 1er résultat vidéo.
        // On filtre les videoId qui seraient en fait des shorts publicitaires en
        // préférant la 1re occurrence — la plus pertinente d'après l'algorithme YT.
        const match = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
        if (!match) return null;
        const videoId = match[1]!;
        return { videoId, url: `https://www.youtube.com/watch?v=${videoId}` };
      } catch {
        return null;
      }
    }),
});
