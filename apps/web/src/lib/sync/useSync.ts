import { useCallback, useEffect, useState } from 'react';
import { liveQuery, type Table } from 'dexie';
import { db, type LocalEntry, type LocalTask, type LocalDailyLog, type LocalCoupleDay, type LocalNoteTypeDef, type MediaMeta, type EntryLink } from '../db/schema';
import { apiClient, trpc } from '../trpc';
import { showToast } from '../toast';

type ServerEntry = {
  id: string;
  authorId: string;
  date: string;
  createdAt: string;
  updatedAt: string;
  section: LocalEntry['section'];
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
  visibility: LocalEntry['visibility'];
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
  unlockAt: string | null;
  capsuleSpoiler: string | null;
  hideUntilAt: string | null;
  collectionOnly: boolean;
  links: EntryLink[] | null;
  commentsLocked: boolean;
  version: number;
  deletedAt: string | null;
  tagNames: string[];
  ratings?: Array<{ userId: string; value: 'FAVORITE' | 'LOW'; displayName: string | null }>;
  commentsCount: number;
};

type ServerTask = {
  id: string;
  ownerId: string;
  title: string;
  notes: string | null;
  status: LocalTask['status'];
  dueDate: string | null;
  completedAt: string | null;
  category: string | null;
  taskType: string | null;
  priority: string | null;
  sortOrder: number | null;
  createdBy: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

function toLocalEntry(s: ServerEntry): LocalEntry {
  return {
    id: s.id,
    authorId: s.authorId,
    date: s.date.slice(0, 10),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    section: s.section,
    title: s.title,
    contentMd: s.contentMd,
    mood: s.mood,
    sleepHours: s.sleepHours,
    weather: s.weather,
    timeLabel: s.timeLabel ?? null,
    noteType: (s.noteType ?? 'JOURNAL') as LocalEntry['noteType'],
    customTypeId: s.customTypeId ?? null,
    mediaMeta: (s.mediaMeta ?? null) as MediaMeta | null,
    font: s.font ?? null,
    fontSize: (s as any).fontSize ?? null,
    visibility: s.visibility,
    isDraft: s.isDraft ?? false,
    isForConfidant: s.isForConfidant ?? false,
    isSecret: s.isSecret ?? false,
    isAdult: s.isAdult ?? false,
    adultQuestion: s.adultQuestion ?? null,
    adultAnswerHash: s.adultAnswerHash ?? null,
    adultHints: (s as any).adultHints ?? [],
    adultMercyAnswer: (s as any).adultMercyAnswer ?? null,
    readGatePrompt: (s as any).readGatePrompt ?? null,
    readGateAcceptedResponses: (s as any).readGateAcceptedResponses ?? [],
    unlockAt: (s as any).unlockAt ?? null,
    capsuleSpoiler: (s as any).capsuleSpoiler ?? null,
    hideUntilAt: (s as any).hideUntilAt ?? null,
    collectionOnly: (s as any).collectionOnly ?? false,
    links: (s.links ?? null) as EntryLink[] | null,
    commentsLocked: s.commentsLocked,
    version: s.version,
    deletedAt: s.deletedAt,
    tagNames: s.tagNames ?? [],
    ratings: s.ratings ?? [],
    commentsCount: s.commentsCount ?? 0,
    _dirty: false,
  };
}

type ServerDailyLog = {
  date: string;
  mood: string | null;
  sleepHours: number | null;
  weather: string | null;
  energy: number | null;
  anxiety: number | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

function toLocalDailyLog(s: ServerDailyLog): LocalDailyLog {
  return {
    date: s.date.slice(0, 10),
    mood: s.mood,
    sleepHours: s.sleepHours,
    weather: s.weather,
    energy: s.energy,
    anxiety: s.anxiety,
    version: s.version,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    deletedAt: s.deletedAt,
    _dirty: false,
  };
}

function toSyncDailyLogPayload(local: LocalDailyLog) {
  return {
    date: local.date,
    mood: local.mood,
    sleepHours: local.sleepHours,
    weather: local.weather,
    energy: local.energy,
    anxiety: local.anxiety,
    version: local.version,
    createdAt: local.createdAt,
    updatedAt: local.updatedAt,
    deletedAt: local.deletedAt,
  };
}

type ServerCoupleDay = {
  date: string;
  color: 'RED' | 'BLUE' | 'GREEN' | 'RED_GREEN';
  setAt: string | null;
  linkedEntryIds: string[] | null;
  awayLabel: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

function toLocalCoupleDay(s: ServerCoupleDay): LocalCoupleDay {
  return {
    date: s.date.slice(0, 10),
    color: s.color,
    setAt: s.setAt,
    linkedEntryIds: s.linkedEntryIds ?? [],
    awayLabel: s.awayLabel,
    version: s.version,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    deletedAt: s.deletedAt,
    _dirty: false,
  };
}

function toSyncCoupleDayPayload(local: LocalCoupleDay) {
  return {
    date: local.date,
    color: local.color,
    setAt: local.setAt,
    linkedEntryIds: local.linkedEntryIds,
    awayLabel: local.awayLabel,
    version: local.version,
    createdAt: local.createdAt,
    updatedAt: local.updatedAt,
    deletedAt: local.deletedAt,
  };
}

function toLocalTask(s: ServerTask): LocalTask {
  return {
    id: s.id,
    ownerId: s.ownerId,
    title: s.title,
    notes: s.notes,
    status: s.status,
    dueDate: s.dueDate ? s.dueDate.slice(0, 10) : null,
    completedAt: s.completedAt,
    category: s.category ?? null,
    taskType: s.taskType ?? null,
    priority: (s.priority ?? null) as LocalTask['priority'],
    sortOrder: s.sortOrder ?? null,
    createdBy: s.createdBy ?? null,
    version: s.version,
    createdAt: s.createdAt ?? s.updatedAt,
    updatedAt: s.updatedAt,
    deletedAt: s.deletedAt,
    _dirty: false,
  };
}

function toSyncEntryPayload(local: LocalEntry) {
  return {
    id: local.id,
    date: local.date,
    section: local.section,
    title: local.title,
    contentMd: local.contentMd,
    mood: local.mood,
    sleepHours: local.sleepHours,
    weather: local.weather,
    timeLabel: local.timeLabel,
    noteType: local.noteType,
    customTypeId: local.customTypeId ?? null,
    mediaMeta: local.mediaMeta,
    font: local.font ?? null,
    fontSize: local.fontSize ?? null,
    visibility: local.visibility,
    isDraft: local.isDraft ?? false,
    isForConfidant: local.isForConfidant ?? false,
    isSecret: local.isSecret ?? false,
    isAdult: local.isAdult ?? false,
    adultQuestion: local.adultQuestion ?? null,
    adultAnswerHash: local.adultAnswerHash ?? null,
    adultHints: local.adultHints ?? [],
    adultMercyAnswer: local.adultMercyAnswer ?? null,
    readGatePrompt: local.readGatePrompt ?? null,
    readGateAcceptedResponses: local.readGateAcceptedResponses ?? [],
    unlockAt: local.unlockAt ?? null,
    capsuleSpoiler: local.capsuleSpoiler ?? null,
    hideUntilAt: local.hideUntilAt ?? null,
    collectionOnly: local.collectionOnly ?? false,
    links: local.links ?? null,
    version: local.version,
    createdAt: local.createdAt,
    updatedAt: local.updatedAt,
    deletedAt: local.deletedAt,
    tagNames: local.tagNames,
  };
}

function toSyncTaskPayload(local: LocalTask) {
  return {
    id: local.id,
    title: local.title,
    notes: local.notes,
    status: local.status,
    dueDate: local.dueDate,
    completedAt: local.completedAt,
    category: local.category,
    taskType: local.taskType,
    priority: local.priority,
    sortOrder: local.sortOrder,
    createdBy: local.createdBy,
    version: local.version,
    createdAt: local.createdAt,
    updatedAt: local.updatedAt,
    deletedAt: local.deletedAt,
  };
}

// Module-level : un seul sync à la fois. Si un sync est demandé pendant qu'un autre tourne,
// on mémorise la demande et on la rejoue dès la fin du sync en cours.
let _inFlight = false;
let _pending = false;
// Dé-duplication des toasts d'erreur de sync : on ne ré-affiche que si le
// message change (sinon un toast à chaque retry de l'intervalle 30 s). Remis à
// null après un sync réussi → un futur échec re-notifie.
let _lastSyncErrorMsg: string | null = null;

/**
 * Mappe une liste en IGNORANT les éléments qui font planter le mapping (au lieu
 * de laisser l'exception remonter et faire échouer tout le pull — ce qui, après
 * une réinstallation, laisserait la base locale vide). Renvoie les éléments OK
 * + le nombre d'échecs.
 */
function safeMap<I, O>(items: I[], fn: (item: I) => O): { ok: O[]; failed: number } {
  const ok: O[] = [];
  let failed = 0;
  for (const it of items) {
    try { ok.push(fn(it)); } catch (err) { failed++; console.error('[sync] mapping ignoré:', err); }
  }
  return { ok, failed };
}

/** `bulkPut` résilient : si le lot entier échoue, réessaie élément par élément. Renvoie le nb d'échecs. */
async function safeBulkPut<T>(table: Table<T>, rows: T[]): Promise<number> {
  if (rows.length === 0) return 0;
  try { await table.bulkPut(rows); return 0; }
  catch (err) {
    console.error('[sync] bulkPut a échoué, réécriture une-par-une:', err);
    let failed = 0;
    for (const r of rows) { try { await table.put(r); } catch (e2) { failed++; console.error('[sync] put ignoré:', e2); } }
    return failed;
  }
}

export function useSync() {
  const [syncing, setSyncing] = useState(false);
  const { data: me } = trpc.auth.me.useQuery(undefined, { retry: false });
  const isOwner = me?.role === 'OWNER';

  const sync = useCallback(async () => {
    if (!isOwner) return; // sync.pull/push sont ownerProcedure — no-op pour guests
    if (_inFlight) { _pending = true; return; }
    _inFlight = true;
    setSyncing(true);

    // Garde-fou anti-blocage. Sur mobile, une requête peut se figer sans jamais
    // répondre NI échouer (connexion perdue silencieusement), et l'écriture
    // IndexedDB peut elle aussi se bloquer. Dans ces cas, l'`AbortController` ne
    // suffit pas (le client tRPC peut ignorer le signal ; un blocage Dexie n'est
    // pas annulable) → la promesse ne se résout jamais → le `finally` ne tourne
    // pas → spinner infini, aucun toast. Ce **watchdog** force donc la sortie au
    // bout de TIMEOUT_MS : il arrête le spinner et affiche l'erreur même si
    // l'opération en cours ne se terminera jamais. `finished` évite que l'opé
    // orpheline (qui finit éventuellement « dans le vide ») retraite l'état.
    const controller = new AbortController();
    const TIMEOUT_MS = 30_000;
    let finished = false;
    const timeoutId = setTimeout(() => {
      if (finished) return;
      finished = true;
      controller.abort(); // best-effort : annule le réseau si le client l'honore
      console.error('[sync] timeout — abandon forcé après', TIMEOUT_MS, 'ms');
      _inFlight = false;
      _pending = false;
      setSyncing(false);
      const msg = 'délai dépassé (connexion lente ou bloquée). Nouvel essai bientôt…';
      if (msg !== _lastSyncErrorMsg) {
        _lastSyncErrorMsg = msg;
        showToast({ message: `Synchro échouée : ${msg}`, tone: 'danger', duration: 15000 });
      }
      // Le prochain tick d'intervalle (30 s) relancera un sync automatiquement.
    }, TIMEOUT_MS);

    try {
      const meta = await db.syncMeta.get('singleton');
      const since = meta?.lastSyncAt ?? undefined;

      // 1. Pull — serverNow capturé côté serveur AVANT la query pour éviter la race condition :
      // si on le capturait après, des entrées pushées entre la query et serverNow seraient
      // manquées définitivement (leur updatedAt < nouveau since).
      // Cast explicite : l'inférence tRPC explose en profondeur (TS2589).
      // On reste sur du unknown[] et on remappe ensuite.
      type PullPage = {
        entries: unknown[];
        tasks: unknown[];
        dailyLogs: unknown[];
        coupleDays: unknown[];
        noteTypeDefs: unknown[];
        serverNow: string;
        nextCursor: { updatedAt: string; id: string } | null;
      };

      // 2. Merge — RÉSILIENT : un enregistrement qui casse le mapping ou
      // l'écriture est ignoré (et compté dans `skipped`) au lieu de faire
      // échouer tout le pull (ce qui laisserait la base locale vide après une
      // réinstallation). Les dirty locales ne sont pas écrasées.
      let skipped = 0;
      const dirtyEntryIds = new Set(
        await db.entries.filter((e) => e._dirty).primaryKeys(),
      );

      // Pull PAGINÉ des entrées (pages de 150 via curseur) plutôt qu'un seul gros
      // payload — un gros payload peut figer la connexion mobile (spinner infini).
      // tasks/dailyLogs/coupleDays (petits) arrivent à la 1re page. Le serverNow
      // de la 1re page sert de nouveau curseur `since` : une modif survenue
      // pendant la pagination a updatedAt > serverNow → reprise au prochain sync.
      let cursor: { updatedAt: string; id: string } | null = null;
      let firstServerNow: string | null = null;
      let serverTasks: unknown[] = [];
      let serverDailyLogs: unknown[] = [];
      let serverCoupleDays: unknown[] = [];
      let serverNoteTypeDefs: unknown[] = [];
      let pageGuard = 0;
      do {
        const page = await apiClient.sync.pull.query(
          { since, cursor, limit: 150 },
          { signal: controller.signal },
        ) as PullPage;
        if (firstServerNow === null) {
          firstServerNow = page.serverNow;
          serverTasks = page.tasks;
          serverDailyLogs = page.dailyLogs;
          serverCoupleDays = page.coupleDays;
          serverNoteTypeDefs = page.noteTypeDefs;
        }
        const mapped = safeMap(
          (page.entries as ServerEntry[]).filter((e) => !dirtyEntryIds.has(e.id)),
          toLocalEntry,
        );
        skipped += mapped.failed + await safeBulkPut(db.entries, mapped.ok);
        cursor = page.nextCursor;
      } while (cursor && ++pageGuard < 1000);

      const serverNow = firstServerNow ?? new Date().toISOString();

      const dirtyTaskIds = new Set(
        await db.tasks.filter((t) => t._dirty).primaryKeys(),
      );
      const mappedTasks = safeMap(
        (serverTasks as ServerTask[]).filter((t) => !dirtyTaskIds.has(t.id)),
        toLocalTask,
      );
      skipped += mappedTasks.failed + await safeBulkPut(db.tasks, mappedTasks.ok);

      const dirtyDailyLogDates = new Set(
        await db.dailyLogs.filter((dl) => dl._dirty).primaryKeys(),
      );
      const mappedLogs = safeMap(
        (serverDailyLogs as ServerDailyLog[]).filter((dl) => !dirtyDailyLogDates.has(dl.date.slice(0, 10))),
        toLocalDailyLog,
      );
      skipped += mappedLogs.failed + await safeBulkPut(db.dailyLogs, mappedLogs.ok);

      const dirtyCoupleDayDates = new Set(
        await db.coupleDays.filter((cd) => cd._dirty).primaryKeys(),
      );
      const mappedCouple = safeMap(
        (serverCoupleDays as ServerCoupleDay[]).filter((cd) => !dirtyCoupleDayDates.has(cd.date.slice(0, 10))),
        toLocalCoupleDay,
      );
      skipped += mappedCouple.failed + await safeBulkPut(db.coupleDays, mappedCouple.ok);

      // Types de note custom : server-authoritative (aucune écriture locale, pas
      // de _dirty). On remplace tout (clear + put) → reflète aussi les suppressions.
      // ⚠️ Le clear + put DOIT être ATOMIQUE (une seule transaction). Sinon la
      // liveQuery `db.noteTypeDefs` émet un état VIDE transitoire entre les deux,
      // et le comportement effectif de toute note custom retombe alors sur JOURNAL
      // puis rebascule à chaque sync → le panneau structuré monte/démonte en
      // boucle (effet « sapin de Noël » + sync en boucle). Une transaction ne
      // publie qu'au commit : l'état vide n'est jamais observé.
      await db.transaction('rw', db.noteTypeDefs, async () => {
        await db.noteTypeDefs.clear();
        await db.noteTypeDefs.bulkPut(serverNoteTypeDefs as LocalNoteTypeDef[]);
      });

      // 3. Push
      const dirtyEntries = await db.entries.filter((e) => e._dirty).toArray();
      const dirtyTasks = await db.tasks.filter((t) => t._dirty).toArray();
      const dirtyDailyLogs = await db.dailyLogs.filter((dl) => dl._dirty).toArray();
      const dirtyCoupleDays = await db.coupleDays.filter((cd) => cd._dirty).toArray();

      if (dirtyEntries.length > 0 || dirtyTasks.length > 0 || dirtyDailyLogs.length > 0 || dirtyCoupleDays.length > 0) {
        // Cast explicite : l'inférence tRPC explose en profondeur (TS2589) sur
        // le destructuring. Le type local suffit — validation runtime via Zod.
        type PushResult = {
          entries: unknown[];
          tasks: unknown[];
          dailyLogs: unknown[];
          coupleDays: unknown[];
        };
        const { entries: resolvedEntries, tasks: resolvedTasks, dailyLogs: resolvedDailyLogs, coupleDays: resolvedCoupleDays } =
          await apiClient.sync.push.mutate({
            entries: dirtyEntries.map(toSyncEntryPayload),
            tasks: dirtyTasks.map(toSyncTaskPayload),
            dailyLogs: dirtyDailyLogs.map(toSyncDailyLogPayload),
            coupleDays: dirtyCoupleDays.map(toSyncCoupleDayPayload),
          }, { signal: controller.signal }) as PushResult;

        if (resolvedEntries.length > 0) {
          await db.entries.bulkPut(
            (resolvedEntries as ServerEntry[]).map((e) => ({ ...toLocalEntry(e), _dirty: false })),
          );
        }
        if (resolvedTasks.length > 0) {
          await db.tasks.bulkPut(
            (resolvedTasks as ServerTask[]).map((t) => ({ ...toLocalTask(t), _dirty: false })),
          );
        }
        if (resolvedDailyLogs.length > 0) {
          await db.dailyLogs.bulkPut(
            (resolvedDailyLogs as ServerDailyLog[]).map((dl) => ({ ...toLocalDailyLog(dl), _dirty: false })),
          );
        }
        if (resolvedCoupleDays.length > 0) {
          await db.coupleDays.bulkPut(
            (resolvedCoupleDays as ServerCoupleDay[]).map((cd) => ({ ...toLocalCoupleDay(cd), _dirty: false })),
          );
        }
      }

      // 4. Met à jour le curseur
      await db.syncMeta.put({ id: 'singleton', lastSyncAt: serverNow });

      // Sync OK → on réarme la notification d'erreur. Si des enregistrements ont
      // été ignorés (corrompus), on le signale sans bloquer : le reste est à jour.
      _lastSyncErrorMsg = null;
      if (skipped > 0) {
        showToast({
          message: `Synchro : ${skipped} élément(s) ignoré(s) (illisibles). Le reste est à jour.`,
          tone: 'warning',
          duration: 12000,
        });
      }
    } catch (e) {
      // Le watchdog a déjà tout géré (abandon forcé) → ne pas re-traiter une
      // rejection tardive de l'opération orpheline.
      if (finished) return;
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[sync] failed:', e);
      // Erreur rendue VISIBLE (au lieu d'un échec muet qui laisse l'app « vide »).
      // Dé-dupliquée : ré-affichée seulement si le message change (anti-spam 30 s).
      if (msg !== _lastSyncErrorMsg) {
        _lastSyncErrorMsg = msg;
        showToast({ message: `Synchro échouée : ${msg}`, tone: 'danger', duration: 15000 });
      }
    } finally {
      clearTimeout(timeoutId);
      // Si le watchdog a déjà forcé la sortie, ne pas re-toucher l'état (un autre
      // sync a pu démarrer entre-temps).
      if (!finished) {
        finished = true;
        _inFlight = false;
        setSyncing(false);
        if (_pending) {
          _pending = false;
          sync();
        }
      }
    }
  }, [isOwner]);

  useEffect(() => {
    sync();
  }, [sync]);

  useEffect(() => {
    const handle = () => sync();
    window.addEventListener('online', handle);
    return () => window.removeEventListener('online', handle);
  }, [sync]);

  // Sync quand l'onglet reprend le focus (ex: retour après avoir créé une note sur téléphone)
  useEffect(() => {
    const handle = () => { if (document.visibilityState === 'visible') sync(); };
    document.addEventListener('visibilitychange', handle);
    return () => document.removeEventListener('visibilitychange', handle);
  }, [sync]);

  // Sync périodique toutes les 60s si l'onglet est visible
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') sync();
    }, 60_000);
    return () => clearInterval(id);
  }, [sync]);

  useEffect(() => {
    const handle = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_REQUESTED') sync();
    };
    navigator.serviceWorker?.addEventListener('message', handle);
    return () => navigator.serviceWorker?.removeEventListener('message', handle);
  }, [sync]);

  // Sync déclenchée par le SSE (événement `sync`) : les données Dexie de l'owner
  // ont été modifiées depuis un autre de ses appareils → re-pull immédiat.
  useEffect(() => {
    const handle = () => sync();
    window.addEventListener('carnet:sse-sync', handle);
    return () => window.removeEventListener('carnet:sse-sync', handle);
  }, [sync]);

  // Toute écriture locale `_dirty` (note, tâche, suivi quotidien, baromètre)
  // déclenche une sync rapprochée (debounce 1,5 s) → la donnée part vers le
  // serveur — et vers les confidents via SSE — sans attendre l'intervalle 30 s.
  useEffect(() => {
    if (!isOwner) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const sub = liveQuery(async () => {
      const [e, t, d, c] = await Promise.all([
        db.entries.filter((x) => x._dirty).count(),
        db.tasks.filter((x) => x._dirty).count(),
        db.dailyLogs.filter((x) => x._dirty).count(),
        db.coupleDays.filter((x) => x._dirty).count(),
      ]);
      return e + t + d + c;
    }).subscribe((dirtyCount) => {
      if (dirtyCount > 0) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => sync(), 1500);
      }
    });
    return () => {
      sub.unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [isOwner, sync]);

  return { sync, syncing };
}
