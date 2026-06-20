import { z } from 'zod';
import { syncEntryInput, syncTaskInput, syncDailyLogInput, syncCoupleDayInput, type SyncEntryInput, type SyncTaskInput, type SyncDailyLogInput, type SyncCoupleDayInput, type NoteTypeBehavior } from '@carnet/schemas';
import { router, ownerProcedure } from '../trpc.js';
import type { PrismaClient, Prisma } from '@prisma/client';
import { canRead } from '../lib/permissions.js';
import { sendPushToUser, displayName } from '../lib/push.js';
import { emitToUser, emitToOwnerCircle } from '../lib/events.js';
import { DRAFT_GRACE_MS } from '../lib/visibility.js';
import { recordAudit } from '../lib/audit.js';
import { notifyEntryMentions } from '../lib/mentions.js';

const NOTE_TYPE_LABEL: Record<string, string> = {
  JOURNAL: 'note',
  BOOK: 'lecture',
  SERIES: 'note série',
  MOVIE: 'note film',
  MUSIC: 'note musique',
  OUTING: 'sortie',
  SHOPPING: 'note shopping',
  DEV: 'note dev',
};

/**
 * Notifie les guests éligibles d'un événement sur une entrée (publication ou ajout edit).
 * Appelé après la transaction de push, en fire-and-forget.
 */
export async function notifyGuestsOfEntryEvent(
  db: PrismaClient,
  entryId: string,
  authorId: string,
  kind: 'ENTRY_NEW' | 'ENTRY_EDIT',
) {
  const entry = await db.entry.findUnique({
    where: { id: entryId },
    select: {
      id: true,
      authorId: true,
      visibility: true,
      isSecret: true,
      noteType: true,
      customTypeId: true,
      title: true,
      mediaMeta: true,
      date: true,
      shares: { select: { receiverId: true, canComment: true } },
    },
  });
  if (!entry) return;

  // Comportement effectif de la note : pour une note CUSTOM, on résout le
  // comportement hérité de sa définition (et on garde son libellé pour le push).
  // Un confident qui suit un built-in (ex. BOOK) est ainsi notifié d'une note
  // d'un type custom héritant de ce comportement. Une def introuvable retombe
  // sur JOURNAL (cf. behaviorOf).
  let effectiveType: typeof entry.noteType = entry.noteType;
  let customLabel: string | null = null;
  if (entry.noteType === 'CUSTOM' && entry.customTypeId) {
    const def = await db.noteTypeDef.findFirst({
      where: { id: entry.customTypeId, ownerId: authorId },
      select: { behavior: true, label: true },
    });
    if (def) {
      effectiveType = def.behavior as NoteTypeBehavior;
      customLabel = def.label;
    } else {
      effectiveType = 'JOURNAL';
    }
  }

  // Tous les guests de l'auteur. On fait UNE requête puis on sépare en JS :
  //  - `readers`    : ceux qui peuvent lire l'entrée → événement SSE `entry`
  //    (rafraîchit leur timeline en temps réel, indépendamment des préférences
  //    de notification — désactiver le push ne doit pas figer l'app).
  //  - `candidates` : sous-ensemble ayant activé les notifs pour ce type
  //    → notification (cloche) + push.
  const allGuests = await db.user.findMany({
    where: { role: 'GUEST', invitedById: authorId, revokedAt: null },
    select: {
      id: true, role: true, guestAccess: true, guestCanComment: true,
      notifEnabled: true, notifyOnNewEntry: true, notifyEntryTypes: true,
    },
  });
  const readers = allGuests.filter((g) =>
    canRead({ id: g.id, role: g.role, guestAccess: g.guestAccess, guestCanComment: g.guestCanComment }, entry),
  );
  const candidates = readers.filter(
    (g) => g.notifyOnNewEntry && g.notifyEntryTypes.includes(effectiveType),
  );
  if (candidates.length === 0) return;

  const owner = await db.user.findUnique({
    where: { id: authorId },
    select: { displayName: true, email: true },
  });
  const ownerName = owner ? displayName(owner) : 'L\'auteur';
  // Libellé du push : pour une note CUSTOM, son propre libellé ; sinon le libellé
  // built-in (fallback 'note').
  const label = customLabel ?? NOTE_TYPE_LABEL[entry.noteType] ?? 'note';
  const headline = entry.title?.trim()
    || (entry.mediaMeta as { subject?: string } | null)?.subject
    || new Date(entry.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

  const pushTitle = kind === 'ENTRY_NEW'
    ? `${ownerName} a publié une ${label}`
    : `${ownerName} a ajouté à une ${label}`;

  for (const guest of candidates) {
    await db.notification.create({
      data: {
        id: crypto.randomUUID(),
        userId: guest.id,
        type: kind,
        entryId: entry.id,
      },
    }).catch(() => null);
    // Temps réel : rafraîchit la cloche du confident sans polling.
    emitToUser(guest.id, 'notification');
    if (guest.notifEnabled) {
      void sendPushToUser(db, guest.id, {
        title: pushTitle,
        body: headline,
        url: `/?entryId=${entry.id}`,
      }, { kind: 'entry' });
    }
  }
}

/** Type compatible avec PrismaClient ET le client de transaction interactif. */
type TxOrDb = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

const SYNC_ENTRY_SELECT = {
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
  deletedAt: true,
  tags: { select: { tag: { select: { name: true } } } },
  ratings: {
    select: {
      userId: true,
      value: true,
      user: { select: { displayName: true, email: true } },
    },
  },
  _count: { select: { comments: { where: { deletedAt: null } } } },
} as const;

const SYNC_TASK_SELECT = {
  id: true,
  ownerId: true,
  title: true,
  notes: true,
  status: true,
  dueDate: true,
  completedAt: true,
  category: true,
  taskType: true,
  priority: true,
  sortOrder: true,
  createdBy: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

const SYNC_DAILY_LOG_SELECT = {
  date: true,
  mood: true,
  sleepHours: true,
  weather: true,
  energy: true,
  anxiety: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

const SYNC_COUPLE_DAY_SELECT = {
  date: true,
  color: true,
  setAt: true,
  linkedEntryIds: true,
  awayLabel: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

type EntryWithTags = {
  tags: { tag: { name: string } }[];
  ratings: Array<{
    userId: string;
    value: 'FAVORITE' | 'LOW';
    user: { displayName: string | null; email: string };
  }>;
  _count: { comments: number };
  id: string;
  authorId: string;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
  section: string | null;
  title: string | null;
  contentMd: string;
  mood: string | null;
  sleepHours: number | null;
  weather: string | null;
  timeLabel: string | null;
  noteType: string;
  customTypeId: string | null;
  mediaMeta: Record<string, unknown> | null;
  font: string | null;
  fontSize: string | null;
  visibility: string;
  isDraft: boolean;
  isForConfidant: boolean;
  isSecret: boolean;
  isAdult: boolean;
  adultQuestion: string | null;
  adultAnswerHash: string | null;
  adultHints: string[];
  adultMercyAnswer: string | null;
  readGatePrompt: string | null;
  readGateAcceptedResponses: string[];
  unlockAt: Date | null;
  capsuleSpoiler: string | null;
  hideUntilAt: Date | null;
  collectionOnly: boolean;
  links: unknown;
  commentsLocked: boolean;
  version: number;
  deletedAt: Date | null;
};

function mapEntry(e: EntryWithTags) {
  return {
    id: e.id,
    authorId: e.authorId,
    date: e.date,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    section: e.section,
    title: e.title,
    contentMd: e.contentMd,
    mood: e.mood,
    sleepHours: e.sleepHours,
    weather: e.weather,
    timeLabel: e.timeLabel,
    noteType: e.noteType,
    customTypeId: e.customTypeId,
    mediaMeta: e.mediaMeta as Record<string, unknown> | null,
    font: e.font,
    fontSize: e.fontSize,
    visibility: e.visibility,
    isDraft: e.isDraft,
    isForConfidant: e.isForConfidant,
    isSecret: e.isSecret,
    isAdult: e.isAdult,
    adultQuestion: e.adultQuestion,
    adultAnswerHash: e.adultAnswerHash,
    adultHints: e.adultHints,
    adultMercyAnswer: e.adultMercyAnswer,
    readGatePrompt: e.readGatePrompt,
    readGateAcceptedResponses: e.readGateAcceptedResponses,
    unlockAt: e.unlockAt,
    capsuleSpoiler: e.capsuleSpoiler,
    hideUntilAt: e.hideUntilAt,
    collectionOnly: e.collectionOnly,
    links: e.links as Record<string, unknown>[] | null,
    commentsLocked: e.commentsLocked,
    version: e.version,
    deletedAt: e.deletedAt,
    tagNames: e.tags.map((et) => et.tag.name),
    ratings: e.ratings.map((r) => ({
      userId: r.userId,
      value: r.value,
      displayName: r.user.displayName ?? r.user.email.split('@')[0] ?? null,
    })),
    commentsCount: e._count.comments,
  };
}

function countEditBlocks(md: string): number {
  return (md.match(/^:::edit\b/gm) ?? []).length;
}

async function upsertEntry(
  db: TxOrDb,
  authorId: string,
  clientEntry: SyncEntryInput,
): Promise<{
  raw: unknown; published: boolean; editAdded: boolean; created: boolean; deleted: boolean; restored: boolean;
  locksRemoved: string[]; locksAdded: string[];
  sealed: { unlockAt: string } | null; unsealed: boolean;
  visibilityChanged: { from: string; to: string } | null;
  edited: { title: boolean; content: boolean; charDelta: number } | null;
}> {
  const existing = await db.entry.findFirst({
    where: { id: clientEntry.id, authorId },
    select: {
      id: true, contentMd: true, unlockAt: true, isDraft: true, createdAt: true, deletedAt: true,
      // État AVANT la mutation — pour tracer verrous, visibilité, sceau, édition.
      isSecret: true, isAdult: true, adultQuestion: true, readGatePrompt: true,
      visibility: true, title: true,
    },
  });

  const commonData = {
    date: new Date(clientEntry.date),
    section: clientEntry.section,
    title: clientEntry.title,
    contentMd: clientEntry.contentMd,
    mood: clientEntry.mood,
    sleepHours: clientEntry.sleepHours,
    weather: clientEntry.weather,
    timeLabel: clientEntry.timeLabel ?? null,
    noteType: clientEntry.noteType ?? 'JOURNAL',
    // customTypeId n'a de sens que pour un type CUSTOM ; on le purge sinon (évite
    // un id périmé après un changement de type built-in ↔ custom).
    customTypeId: (clientEntry.noteType ?? 'JOURNAL') === 'CUSTOM' ? (clientEntry.customTypeId ?? null) : null,
    mediaMeta: clientEntry.mediaMeta ?? undefined,
    font: clientEntry.font ?? null,
    fontSize: clientEntry.fontSize ?? null,
    visibility: clientEntry.visibility,
    isDraft: clientEntry.isDraft ?? false,
    isForConfidant: clientEntry.isForConfidant ?? false,
    isSecret: clientEntry.isSecret ?? false,
    isAdult: clientEntry.isAdult ?? false,
    adultQuestion: clientEntry.adultQuestion ?? null,
    adultAnswerHash: clientEntry.adultAnswerHash ?? null,
    adultHints: clientEntry.adultHints ?? [],
    adultMercyAnswer: clientEntry.adultMercyAnswer ?? null,
    readGatePrompt: clientEntry.readGatePrompt ?? null,
    readGateAcceptedResponses: clientEntry.readGateAcceptedResponses ?? [],
    unlockAt: clientEntry.unlockAt ? new Date(clientEntry.unlockAt) : null,
    capsuleSpoiler: clientEntry.capsuleSpoiler ?? null,
    hideUntilAt: clientEntry.hideUntilAt ? new Date(clientEntry.hideUntilAt) : null,
    collectionOnly: clientEntry.collectionOnly ?? false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    links: (clientEntry.links ?? undefined) as any,
    deletedAt: clientEntry.deletedAt ? new Date(clientEntry.deletedAt) : null,
  };

  // Protection capsule : si l'entrée est scellée côté serveur, on préserve le contenu réel
  // (le client a reçu contentMd='' lors du pull et ne doit pas écraser le vrai contenu)
  const isSealed = existing?.unlockAt && existing.unlockAt > new Date();
  if (isSealed && clientEntry.contentMd === '') {
    commonData.contentMd = existing!.contentMd;
  }

  let entryId: string;

  if (!existing) {
    const created = await db.entry.create({
      data: {
        id: clientEntry.id,
        authorId,
        createdAt: new Date(clientEntry.createdAt),
        ...commonData,
        version: 1,
      },
      select: { id: true },
    });
    entryId = created.id;
  } else {
    if (clientEntry.contentMd !== existing.contentMd && !isSealed) {
      await db.entryRevision.create({
        data: {
          entryId: existing.id,
          contentMd: existing.contentMd,
          authorId,
          reason: 'pre_sync',
        },
      });
    }

    // Si l'unlockAt change, on reset le marqueur de notif capsule pour que le
    // cron puisse renvoyer une notif à la nouvelle échéance.
    const newUnlockAt = commonData.unlockAt;
    const unlockChanged = (existing.unlockAt?.getTime() ?? null) !== (newUnlockAt?.getTime() ?? null);

    await db.entry.update({
      where: { id: existing.id },
      data: {
        ...commonData,
        version: { increment: 1 },
        ...(unlockChanged ? { capsuleNotifSentAt: null } : {}),
      },
    });
    entryId = existing.id;
  }

  // Réconcilie les tags : upsert par nom, puis set exact des EntryTag
  const tagNames = clientEntry.tagNames ?? [];
  if (tagNames.length > 0) {
    const tags = await Promise.all(
      tagNames.map((name) =>
        db.tag.upsert({
          where: { ownerId_name_kind: { ownerId: authorId, name, kind: 'OTHER' } },
          create: { ownerId: authorId, name, kind: 'OTHER' },
          update: {},
          select: { id: true },
        }),
      ),
    );

    await db.entryTag.deleteMany({ where: { entryId } });
    if (tags.length > 0) {
      await db.entryTag.createMany({
        data: tags.map((t) => ({ entryId, tagId: t.id })),
        skipDuplicates: true,
      });
    }
  } else {
    await db.entryTag.deleteMany({ where: { entryId } });
  }

  // Détection d'un événement de publication : on notifie les guests une seule fois,
  // au moment où l'entrée passe de "brouillon / inexistant" à "publié visible".
  const willBeDraft = clientEntry.isDraft ?? false;
  const willBeSecret = clientEntry.isSecret ?? false;
  const willBeDeleted = !!clientEntry.deletedAt;
  const willBeSealed = clientEntry.unlockAt ? new Date(clientEntry.unlockAt) > new Date() : false;
  // Minuteur post-publication : tant que hideUntilAt est dans le futur, on ne notifie pas
  // les guests (le but du minuteur est précisément qu'ils ne sachent pas qu'une note arrive).
  // C'est le cron `revealDeferred` qui prendra le relais à l'échéance.
  const willBeHidden = clientEntry.hideUntilAt ? new Date(clientEntry.hideUntilAt) > new Date() : false;
  // Un item de Collection (collectionOnly) n'est jamais "publié" — il ne déclenche
  // aucune notif et reste hors Timeline/Fil tant qu'il n'est pas converti en note.
  const willBeCollectionOnly = clientEntry.collectionOnly ?? false;
  const publishable = !willBeDraft && !willBeSecret && !willBeDeleted && !willBeSealed && !willBeHidden && !willBeCollectionOnly;
  // La note était-elle déjà visible aux guests avant cette mutation ?
  // Oui si : (déjà publiée) OU (en brouillon mais grâce expirée, donc déjà accessible au confident).
  const wasVisibleBefore = existing
    ? !existing.isDraft || (Date.now() - existing.createdAt.getTime() >= DRAFT_GRACE_MS)
    : false;
  const published = publishable && !wasVisibleBefore;

  // Détection d'un ajout de bloc :::edit sur une entrée déjà visible.
  // (Notifie une fois par push qui contient ≥ 1 nouveau bloc.)
  const editAdded = !!existing
    && wasVisibleBefore
    && publishable
    && countEditBlocks(clientEntry.contentMd) > countEditBlocks(existing.contentMd);

  // Transitions de cycle de vie pour le journal d'activité (audit).
  // On distingue création / suppression / restauration d'une note ; les simples
  // éditions ne sont PAS loguées (le sync tournant en continu, ce serait du bruit).
  const wasDeleted = !!existing?.deletedAt;
  const created = !existing && !willBeDeleted;
  const deleted = willBeDeleted && !wasDeleted;
  const restored = !!existing && wasDeleted && !willBeDeleted;

  // Traçabilité des changements sur une note existante (journalisés par le
  // handler). Un retrait de verrou est souvent le symptôme d'un clobber par un
  // client obsolète (sync dernier-écrivain-gagne). La capsule passe par
  // SEALED/UNSEALED (pas par les verrous) pour un libellé dédié.
  const locksRemoved: string[] = [];
  const locksAdded: string[] = [];
  let sealed: { unlockAt: string } | null = null;
  let unsealed = false;
  let visibilityChanged: { from: string; to: string } | null = null;
  let edited: { title: boolean; content: boolean; charDelta: number } | null = null;
  if (existing) {
    if (existing.isSecret && !commonData.isSecret) locksRemoved.push('secret');
    if (existing.isAdult && !commonData.isAdult) locksRemoved.push('adult');
    if (existing.readGatePrompt != null && commonData.readGatePrompt == null) locksRemoved.push('readGate');
    if (!existing.isSecret && commonData.isSecret) locksAdded.push('secret');
    if (!existing.isAdult && commonData.isAdult) locksAdded.push('adult');
    if (existing.readGatePrompt == null && commonData.readGatePrompt != null) locksAdded.push('readGate');
    const exUnlock = existing.unlockAt ? existing.unlockAt.getTime() : null;
    const newUnlock = commonData.unlockAt ? commonData.unlockAt.getTime() : null;
    if (newUnlock != null && exUnlock !== newUnlock) sealed = { unlockAt: commonData.unlockAt!.toISOString() };
    if (exUnlock != null && newUnlock == null) unsealed = true;
    if (existing.visibility !== commonData.visibility) {
      visibilityChanged = { from: existing.visibility, to: commonData.visibility };
    }
    // Édition de contenu/titre — hors items de collection (syncs mécaniques) et
    // hors mise sous scellé (l'évènement SEALED prime). Throttlé dans le handler.
    if (!commonData.collectionOnly && !willBeSealed) {
      const titleChanged = (existing.title ?? null) !== (commonData.title ?? null);
      const contentChanged = existing.contentMd !== commonData.contentMd;
      if (titleChanged || contentChanged) {
        edited = { title: titleChanged, content: contentChanged, charDelta: commonData.contentMd.length - existing.contentMd.length };
      }
    }
  }

  const raw = await db.entry.findUniqueOrThrow({
    where: { id: entryId },
    select: SYNC_ENTRY_SELECT,
  });
  return { raw, published, editAdded, created, deleted, restored, locksRemoved, locksAdded, sealed, unsealed, visibilityChanged, edited };
}

type TaskChange = {
  taskId: string;
  meta: Prisma.InputJsonValue;
  /** Si défini, ce userId (guest créateur ≠ owner) doit aussi recevoir la notif TASK_UPDATED. */
  guestRecipient?: string;
};

/** Évènement de cycle de vie d'une tâche à journaliser (audit). */
type TaskAudit = {
  action: 'TASK_CREATED' | 'TASK_DELETED' | 'TASK_RESTORED' | 'TASK_STATUS_CHANGED';
  title: string;
  from?: string;
  to?: string;
};

async function upsertTask(
  db: TxOrDb,
  ownerId: string,
  t: SyncTaskInput,
) {
  const existing = await db.task.findFirst({
    where: { id: t.id, ownerId },
    select: { id: true, status: true, priority: true, createdBy: true, deletedAt: true },
  });

  const commonData = {
    title: t.title,
    notes: t.notes,
    status: t.status,
    dueDate: t.dueDate ? new Date(t.dueDate) : null,
    completedAt: t.completedAt ? new Date(t.completedAt) : null,
    category: t.category ?? null,
    taskType: t.taskType ?? null,
    priority: t.priority ?? null,
    sortOrder: t.sortOrder ?? null,
    createdBy: t.createdBy ?? null,
    deletedAt: t.deletedAt ? new Date(t.deletedAt) : null,
  };

  if (!existing) {
    const task = await db.task.create({
      data: {
        id: t.id,
        ownerId,
        ...commonData,
        createdAt: new Date(t.createdAt),
        version: 1,
      },
      select: SYNC_TASK_SELECT,
    });
    const taskAudit: TaskAudit = { action: t.deletedAt ? 'TASK_DELETED' : 'TASK_CREATED', title: t.title };
    return { task, change: null, taskAudit };
  }

  const task = await db.task.update({
    where: { id: existing.id },
    data: { ...commonData, version: { increment: 1 } },
    select: SYNC_TASK_SELECT,
  });

  const statusChanged = t.status !== existing.status;
  const priorityChanged = (t.priority ?? null) !== existing.priority;
  // Le guest créateur reçoit aussi la notif si la tâche passe en DONE/CANCELLED et qu'il n'est pas l'owner
  const guestRecipient = statusChanged
    && (t.status === 'DONE' || t.status === 'CANCELLED')
    && existing.createdBy
    && existing.createdBy !== ownerId
    ? existing.createdBy
    : undefined;
  const change: TaskChange | null = (statusChanged || priorityChanged) ? {
    taskId: task.id,
    meta: {
      ...(statusChanged ? { status: { from: existing.status, to: t.status } } : {}),
      ...(priorityChanged ? { priority: { from: existing.priority, to: t.priority ?? null } } : {}),
    } as Prisma.InputJsonValue,
    guestRecipient,
  } : null;

  const wasDeleted = !!existing.deletedAt;
  const nowDeleted = !!t.deletedAt;
  let taskAudit: TaskAudit | null = null;
  if (nowDeleted && !wasDeleted) {
    taskAudit = { action: 'TASK_DELETED', title: t.title };
  } else if (!nowDeleted && wasDeleted) {
    taskAudit = { action: 'TASK_RESTORED', title: t.title };
  } else if (!nowDeleted && statusChanged) {
    taskAudit = { action: 'TASK_STATUS_CHANGED', title: t.title, from: existing.status, to: t.status };
  }

  return { task, change, taskAudit };
}

async function upsertDailyLog(db: TxOrDb, ownerId: string, dl: SyncDailyLogInput) {
  const date = new Date(dl.date + 'T00:00:00.000Z');
  const data = {
    mood: dl.mood,
    sleepHours: dl.sleepHours,
    weather: dl.weather,
    energy: dl.energy,
    anxiety: dl.anxiety,
    deletedAt: dl.deletedAt ? new Date(dl.deletedAt) : null,
  };
  const existing = await db.dailyLog.findFirst({ where: { ownerId, date }, select: { id: true } });
  if (!existing) {
    return db.dailyLog.create({
      data: {
        ownerId,
        date,
        ...data,
        createdAt: new Date(dl.createdAt),
        version: 1,
      },
      select: SYNC_DAILY_LOG_SELECT,
    });
  }
  return db.dailyLog.update({
    where: { id: existing.id },
    data: { ...data, version: { increment: 1 } },
    select: SYNC_DAILY_LOG_SELECT,
  });
}

async function upsertCoupleDay(db: TxOrDb, ownerId: string, cd: SyncCoupleDayInput) {
  const date = new Date(cd.date + 'T00:00:00.000Z');
  const data = {
    color: cd.color,
    setAt: cd.setAt ? new Date(cd.setAt) : null,
    linkedEntryIds: cd.linkedEntryIds as Prisma.InputJsonValue,
    awayLabel: cd.awayLabel,
    deletedAt: cd.deletedAt ? new Date(cd.deletedAt) : null,
  };
  const existing = await db.coupleDay.findFirst({ where: { ownerId, date }, select: { id: true } });
  if (!existing) {
    return db.coupleDay.create({
      data: { ownerId, date, ...data, createdAt: new Date(cd.createdAt), version: 1 },
      select: SYNC_COUPLE_DAY_SELECT,
    });
  }
  return db.coupleDay.update({
    where: { id: existing.id },
    data: { ...data, version: { increment: 1 } },
    select: SYNC_COUPLE_DAY_SELECT,
  });
}

export const syncRouter = router({
  pull: ownerProcedure
    .input(z.object({
      since: z.string().datetime().optional(),
      // Pagination par curseur sur les ENTRIES : évite un payload géant qui peut
      // figer la connexion mobile (→ spinner de sync infini côté client). Le
      // client récent envoie `limit` (ex. 150) + `cursor` et boucle jusqu'à
      // `nextCursor: null`. Un client ANCIEN (sans `limit`) garde l'ancien
      // comportement : un seul gros lot (take 2000), `nextCursor` toujours null.
      cursor: z.object({ updatedAt: z.string().datetime(), id: z.string() }).nullish(),
      limit: z.number().int().min(1).max(2000).default(2000),
    }))
    .query(async ({ ctx, input }) => {
      // Capturer serverNow AVANT la query : toute entrée poussée après ce timestamp
      // aura updatedAt > serverNow et sera donc incluse dans le prochain pull.
      const serverNow = new Date().toISOString();
      const sinceFilter = input.since ? { updatedAt: { gt: new Date(input.since) } } : {};
      const isFirstPage = !input.cursor;

      // ── Entries : page par curseur (updatedAt, id) croissants ──────────────
      const entryWhere = input.cursor
        ? {
            authorId: ctx.user.id,
            OR: [
              { updatedAt: { gt: new Date(input.cursor.updatedAt) } },
              { updatedAt: new Date(input.cursor.updatedAt), id: { gt: input.cursor.id } },
            ],
          }
        : { authorId: ctx.user.id, ...sinceFilter };
      const rawEntries = await ctx.db.entry.findMany({
        where: entryWhere,
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: input.limit + 1, // +1 = sonde « y a-t-il une page suivante ? »
        select: SYNC_ENTRY_SELECT,
      });
      const hasMore = rawEntries.length > input.limit;
      const pageEntries = hasMore ? rawEntries.slice(0, input.limit) : rawEntries;
      const last = pageEntries[pageEntries.length - 1] as { updatedAt: Date; id: string } | undefined;
      const nextCursor = hasMore && last
        ? { updatedAt: last.updatedAt.toISOString(), id: last.id }
        : null;

      // ── tasks / dailyLogs / coupleDays : seulement à la 1re page (petits) ───
      let tasks: unknown[] = [];
      let dailyLogs: unknown[] = [];
      let coupleDays: unknown[] = [];
      // Types de note custom : renvoyés EN ENTIER à chaque 1re page (pas de filtre
      // `since`), le client fait clear+put → reflète aussi les suppressions.
      let noteTypeDefs: unknown[] = [];
      if (isFirstPage) {
        const [rawTasks, rawDailyLogs, rawCoupleDays] = await Promise.all([
          ctx.db.task.findMany({
            where: { ownerId: ctx.user.id, ...sinceFilter },
            orderBy: { updatedAt: 'asc' }, take: 2000, select: SYNC_TASK_SELECT,
          }),
          ctx.db.dailyLog.findMany({
            where: { ownerId: ctx.user.id, ...sinceFilter },
            orderBy: { updatedAt: 'asc' }, take: 2000, select: SYNC_DAILY_LOG_SELECT,
          }),
          ctx.db.coupleDay.findMany({
            where: { ownerId: ctx.user.id, ...sinceFilter },
            orderBy: { updatedAt: 'asc' }, take: 2000, select: SYNC_COUPLE_DAY_SELECT,
          }),
        ]);
        tasks = rawTasks;
        dailyLogs = rawDailyLogs.map((dl) => ({ ...dl, date: dl.date.toISOString().slice(0, 10) }));
        coupleDays = rawCoupleDays.map((cd) => ({ ...cd, date: cd.date.toISOString().slice(0, 10) }));
        const rawNoteTypeDefs = await ctx.db.noteTypeDef.findMany({
          where: { ownerId: ctx.user.id },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        });
        noteTypeDefs = rawNoteTypeDefs.map((d) => ({
          ...d,
          createdAt: d.createdAt.toISOString(),
          updatedAt: d.updatedAt.toISOString(),
        }));
      }

      return {
        entries: (pageEntries as EntryWithTags[]).map(mapEntry),
        tasks,
        dailyLogs,
        coupleDays,
        noteTypeDefs,
        serverNow,
        nextCursor,
      };
    }),

  push: ownerProcedure
    .input(
      z.object({
        entries: z.array(syncEntryInput).max(500),
        tasks: z.array(syncTaskInput).max(500).default([]),
        dailyLogs: z.array(syncDailyLogInput).max(500).default([]),
        coupleDays: z.array(syncCoupleDayInput).max(500).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Transaction globale : si un upsert échoue, rien n'est committé.
      // Timeout généreux car jusqu'à 500 entrées × ~6 requêtes chacune.
      const taskChanges: TaskChange[] = [];

      const publishedEntryIds: string[] = [];
      const editedEntryIds: string[] = [];
      // Évènements de cycle de vie des notes à journaliser après la transaction.
      const noteAudits: Array<{ entryId: string; action: string; title: string | null; noteType: string }> = [];
      // Changements à journaliser (verrous ±, sceau, visibilité). `metadata` est
      // fusionné tel quel dans le log (jamais de contenu, seulement des flags).
      const changeAudits: Array<{ entryId: string; action: string; title: string | null; noteType: string; metadata: Record<string, unknown> }> = [];
      // Éditions (titre/contenu) — émises après coup avec un throttle anti-bruit.
      const editedAudits: Array<{ entryId: string; title: string | null; noteType: string; metadata: Record<string, unknown> }> = [];
      // Idem pour les tâches (création / suppression / restauration / changement de statut).
      const taskAudits: Array<{ taskId: string } & TaskAudit> = [];
      // Vrai dès qu'une entrée visible par les confidents est touchée — y compris
      // une simple édition de contenu (≠ publication / bloc d'édition différé).
      let confidentVisibleChange = false;
      // Mentions @ à notifier (notes créées ou dont le contenu a changé) — émises
      // après la transaction. La porte d'accès (canRead) est vérifiée dans le helper :
      // une note secrète ne notifiera jamais le confident.
      const mentionWork: Array<{ entryId: string; content: string }> = [];

      const { entries: resolvedEntries, tasks: resolvedTasks, dailyLogs: resolvedDailyLogs, coupleDays: resolvedCoupleDays } =
        await ctx.db.$transaction(async (tx) => {
          const entries = [];
          for (const clientEntry of input.entries) {
            const { raw, published, editAdded, created, deleted, restored, locksRemoved, locksAdded, sealed, unsealed, visibilityChanged, edited } = await upsertEntry(tx, ctx.user.id, clientEntry);
            entries.push(mapEntry(raw as EntryWithTags));
            if (published) publishedEntryIds.push(clientEntry.id);
            else if (editAdded) editedEntryIds.push(clientEntry.id);
            const aTitle = clientEntry.title ?? null;
            const aNoteType = clientEntry.noteType ?? 'JOURNAL';
            const pushChange = (action: string, metadata: Record<string, unknown>) =>
              changeAudits.push({ entryId: clientEntry.id, action, title: aTitle, noteType: aNoteType, metadata });
            if (locksRemoved.length > 0) pushChange('ENTRY_LOCK_REMOVED', { locks: locksRemoved });
            if (locksAdded.length > 0) pushChange('ENTRY_LOCK_ADDED', { locks: locksAdded });
            if (sealed) pushChange('ENTRY_SEALED', { unlockAt: sealed.unlockAt });
            if (unsealed) pushChange('ENTRY_UNSEALED', {});
            if (visibilityChanged) pushChange('ENTRY_VISIBILITY_CHANGED', { from: visibilityChanged.from, to: visibilityChanged.to });
            if (edited) {
              const fields = [edited.title ? 'titre' : null, edited.content ? 'contenu' : null].filter(Boolean);
              editedAudits.push({ entryId: clientEntry.id, title: aTitle, noteType: aNoteType, metadata: { fields, charDelta: edited.charDelta } });
            }
            if (created || (edited && edited.content)) {
              mentionWork.push({ entryId: clientEntry.id, content: clientEntry.contentMd });
            }
            const lifecycle = created ? 'ENTRY_CREATED' : deleted ? 'ENTRY_DELETED' : restored ? 'ENTRY_RESTORED' : null;
            if (lifecycle) {
              noteAudits.push({
                entryId: clientEntry.id,
                action: lifecycle,
                title: clientEntry.title ?? null,
                noteType: clientEntry.noteType ?? 'JOURNAL',
              });
            }
            // Un CONFIDANT voit TOUTES les notes — `PRIVATE` ne le masque pas
            // (cf. canRead). Les items de Collection (collectionOnly) sont aussi
            // visibles par lui (page Collection). Seuls secrets et brouillons
            // l'excluent → on ne filtre que là-dessus.
            const e = raw as { isDraft?: boolean; isSecret?: boolean };
            if (!e.isDraft && !e.isSecret) {
              confidentVisibleChange = true;
            }
          }

          const tasks = [];
          for (const syncTask of input.tasks) {
            const { task, change, taskAudit } = await upsertTask(tx, ctx.user.id, syncTask);
            tasks.push(task);
            if (change) taskChanges.push(change);
            if (taskAudit) taskAudits.push({ taskId: syncTask.id, ...taskAudit });
          }

          const dailyLogs = [];
          for (const dl of input.dailyLogs) {
            const raw = await upsertDailyLog(tx, ctx.user.id, dl);
            dailyLogs.push({ ...raw, date: raw.date.toISOString().slice(0, 10) });
          }

          const coupleDays = [];
          for (const cd of input.coupleDays) {
            const raw = await upsertCoupleDay(tx, ctx.user.id, cd);
            coupleDays.push({ ...raw, date: raw.date.toISOString().slice(0, 10) });
          }

          return { entries, tasks, dailyLogs, coupleDays };
        }, { timeout: 60_000 });

      // Mentions @ dans les notes : notif + push (fire-and-forget après transaction).
      for (const { entryId, content } of mentionWork) {
        notifyEntryMentions(ctx.db as PrismaClient, ctx.user, entryId, content).catch(() => null);
      }

      // Notifs ENTRY_NEW / ENTRY_EDIT : fire-and-forget après transaction
      if (publishedEntryIds.length > 0 || editedEntryIds.length > 0) {
        const ownerId = ctx.user.id;
        for (const entryId of publishedEntryIds) {
          notifyGuestsOfEntryEvent(ctx.db as PrismaClient, entryId, ownerId, 'ENTRY_NEW').catch(() => null);
        }
        for (const entryId of editedEntryIds) {
          notifyGuestsOfEntryEvent(ctx.db as PrismaClient, entryId, ownerId, 'ENTRY_EDIT').catch(() => null);
        }
      }

      // Créer les notifications de mise à jour après la transaction (fire & forget)
      if (taskChanges.length > 0) {
        const ownerId = ctx.user.id;
        // 1) Notif pour l'owner (history dans la cloche)
        ctx.db.notification.createMany({
          data: taskChanges.map(({ taskId, meta }) => ({
            id: crypto.randomUUID(),
            userId: ownerId,
            type: 'TASK_UPDATED' as const,
            taskId,
            meta: meta as Prisma.InputJsonValue,
          })),
        }).catch(() => null);

        // 2) Notif + push pour le guest créateur quand la tâche passe DONE/CANCELLED
        const guestNotifs = taskChanges.filter((c) => !!c.guestRecipient);
        if (guestNotifs.length > 0) {
          const db = ctx.db as PrismaClient;
          (async () => {
            const owner = await db.user.findUnique({
              where: { id: ownerId },
              select: { displayName: true, email: true },
            });
            const ownerName = owner ? displayName(owner) : 'L\'auteur';
            for (const { taskId, meta, guestRecipient } of guestNotifs) {
              const guest = await db.user.findUnique({
                where: { id: guestRecipient! },
                select: { id: true, notifEnabled: true, notifyOnTaskUpdate: true },
              });
              if (!guest || !guest.notifyOnTaskUpdate) continue;
              await db.notification.create({
                data: {
                  id: crypto.randomUUID(),
                  userId: guest.id,
                  type: 'TASK_UPDATED',
                  taskId,
                  meta: meta as Prisma.InputJsonValue,
                },
              }).catch(() => null);
              if (guest.notifEnabled) {
                const m = meta as { status?: { to?: string } };
                const verb = m.status?.to === 'DONE' ? 'traité' : 'annulé';
                const task = await db.task.findUnique({ where: { id: taskId }, select: { title: true } });
                void sendPushToUser(db, guest.id, {
                  title: `${ownerName} a ${verb} ta tâche`,
                  body: task?.title ?? 'Tâche',
                  url: '/tasks',
                }, { kind: 'task' });
              }
            }
          })().catch(() => null);
        }
      }

      // Journal d'activité : création / suppression / restauration de notes.
      for (const a of noteAudits) {
        recordAudit(ctx, a.action, { entryId: a.entryId, metadata: { title: a.title, noteType: a.noteType } });
      }
      // … changements de note (verrous ±, sceau, visibilité). L'IP et le
      // user-agent sont ajoutés automatiquement par recordAudit → on peut
      // identifier quel appareil l'a provoqué (ex. clobber par client obsolète).
      for (const a of changeAudits) {
        recordAudit(ctx, a.action, {
          entryId: a.entryId,
          metadata: { title: a.title, noteType: a.noteType, ...a.metadata },
        });
      }
      // … éditions de note, throttlées : un seul ENTRY_EDITED par note par
      // fenêtre de 10 min (le sync tourne en continu → sinon du bruit).
      const editThrottleSince = new Date(Date.now() - 10 * 60_000);
      for (const a of editedAudits) {
        const recent = await ctx.db.auditLog.findFirst({
          where: { entryId: a.entryId, action: 'ENTRY_EDITED', createdAt: { gte: editThrottleSince } },
          select: { id: true },
        }).catch(() => null);
        if (recent) continue;
        recordAudit(ctx, 'ENTRY_EDITED', {
          entryId: a.entryId,
          metadata: { title: a.title, noteType: a.noteType, ...a.metadata },
        });
      }
      // … et des tâches.
      for (const a of taskAudits) {
        recordAudit(ctx, a.action, {
          metadata: {
            title: a.title,
            ...(a.from !== undefined ? { from: a.from } : {}),
            ...(a.to !== undefined ? { to: a.to } : {}),
          },
        });
      }

      // Temps réel multi-appareils : les autres appareils de l'owner re-pullent
      // leur base Dexie. (L'appareil émetteur re-pulle aussi — inoffensif.)
      emitToUser(ctx.user.id, 'sync');

      // Temps réel confidents : un événement par domaine touché par ce push.
      // L'owner est exclu (déjà couvert par `sync`). `entries.list` reste filtré
      // par `canRead` côté confident.
      const me = ctx.user.id;
      if (confidentVisibleChange) void emitToOwnerCircle(ctx.db, me, 'entry', me).catch(() => null);
      if (input.tasks.length > 0) void emitToOwnerCircle(ctx.db, me, 'task', me).catch(() => null);
      if (input.dailyLogs.length > 0) void emitToOwnerCircle(ctx.db, me, 'dailyLog', me).catch(() => null);
      if (input.coupleDays.length > 0) void emitToOwnerCircle(ctx.db, me, 'coupleDay', me).catch(() => null);

      return {
        entries: resolvedEntries,
        tasks: resolvedTasks,
        dailyLogs: resolvedDailyLogs,
        coupleDays: resolvedCoupleDays,
        serverNow: new Date().toISOString(),
      };
    }),
});
