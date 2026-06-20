import Dexie, { type Table } from 'dexie';
import type { NoteTypeFieldDef } from '@carnet/schemas';

export interface EntryLink {
  url: string;
  title: string | null;
  image: string | null;
  siteName: string | null;
}

export interface MediaTrack {
  streamUrl?: string;
  subject?: string;     // titre du morceau
  creator?: string;     // artiste
  trackTitle?: string;  // album
  coverUrl?: string;
  rating?: number;      // 1–5
  description?: string;
  lyrics?: string;
  lyricsTranslation?: string;
}

/** Statut unifié d'un média : pré-lecture (wishlist/owned) puis lecture. */
export type MediaStatus = 'wishlist' | 'owned' | 'ongoing' | 'finished' | 'abandoned';

/** SERIES TV : une saison et ses épisodes vus (suivi Collection sans note). */
export interface SeriesSeason {
  number: number;      // n° de saison (0 = Spéciaux)
  episodes: number;    // nb d'épisodes
  watched: number[];   // n° d'épisodes vus (1-based)
  title?: string;
}

export interface MediaMeta {
  subject?: string;
  seriesName?: string;    // nom de la série/saga pour regrouper dans la Collection
  trackTitle?: string;
  creator?: string;
  tmdbId?: number;
  isbn?: string;
  streamUrl?: string;
  description?: string;
  progressCurrent?: number;
  progressTotal?: number;
  chapter?: number;
  volume?: number;       // tome actuel (manga, saga…)
  totalVolumes?: number; // nb total de tomes de la série
  season?: number;
  totalSeasons?: number;
  // SERIES TV : suivi détaillé par saison/épisode. `watched` = n° d'épisodes vus
  // (1-based, sparse). Les champs plats season/progressCurrent/progressTotal en
  // sont dérivés pour la rétrocompat (cf. lib/seriesProgress.ts).
  seasonsWatched?: SeriesSeason[];
  coverUrl?: string;
  rating?: number;           // 1–5
  status?: MediaStatus;       // Statut du tome/saison/film
  seriesStatus?: MediaStatus; // Statut global du groupe (saga/série)
  // MUSIC mono : paroles + traduction (en mode playlist, ces champs vivent sur chaque track)
  lyrics?: string;
  lyricsTranslation?: string;
  // MUSIC playlist : si présent (avec >= 1 track), la note est multi-morceaux.
  // Les champs top-level (subject/creator/streamUrl/...) ne sont pas utilisés dans ce cas.
  tracks?: MediaTrack[];
  playlistName?: string;
  // DEV (séries de chapitres) : `seriesName` = thème, `volume` = n° de partie,
  // `partName` = nom de la partie, `chapter` = n° du chapitre (ordre),
  // `totalChapters` = nombre total de chapitres prévus (ex. 50).
  partName?: string;
  totalChapters?: number;
  // QUIZZ : liste de questions. `correct`/`accepted`/`explanation` sont retirés
  // du payload des confidents (correction côté serveur).
  quizQuestions?: QuizQuestion[];
  quizShuffleQuestions?: boolean; // mélanger l'ordre des questions à chaque tentative
  quizShuffleOptions?: boolean;   // mélanger l'ordre des options à chaque tentative
  // AGENDA : liste d'événements datés (vue liste + mini-calendrier).
  events?: AgendaEvent[];
  // FINANCE : lignes de budget (revenus/dépenses) + devise (défaut « € »).
  budgetItems?: BudgetItem[];
  currency?: string;
  // Champs personnalisés (types de note custom) : valeur par id de champ.
  customFields?: Record<string, string | number | boolean | string[] | null>;
}

export interface AgendaEvent {
  id: string;
  date: string;        // "YYYY-MM-DD" (début)
  time?: string;       // "HH:MM" (début, optionnel)
  endDate?: string;    // "YYYY-MM-DD" (fin, optionnel ; absent ⇒ même jour que `date`)
  endTime?: string;    // "HH:MM" (fin, optionnel)
  title: string;
  location?: string;   // lieu (optionnel)
  done?: boolean;      // événement passé/accompli coché
}

export interface BudgetItem {
  id: string;
  label: string;
  amount: number;                  // montant positif ; le signe vient de `kind`
  kind: 'income' | 'expense';
  category?: string;               // catégorie libre (optionnelle)
  date?: string;                   // "YYYY-MM-DD" (optionnelle)
}

export interface QuizQuestion {
  id: string;
  type: 'qcm' | 'free';
  prompt: string;
  image?: string;            // image de l'énoncé (URL /images/:id) — exposé
  options?: string[];        // QCM
  optionImages?: string[];   // image par option, alignée par index — exposé
  correct?: number[];        // QCM : indices des bonnes options (absent côté confident)
  multi?: boolean;           // QCM : réponses multiples (cases) vs unique (radio) — exposé
  accepted?: string[];       // libre : réponses acceptées (absent côté confident)
  explanation?: string;      // montré après correction (absent côté confident)
}

export interface LocalEntry {
  id: string;
  authorId: string;
  date: string;           // "YYYY-MM-DD"
  createdAt: string;      // ISO
  updatedAt: string;      // ISO
  section: 'MORNING' | 'LATE_MORNING' | 'NOON' | 'AFTERNOON' | 'LATE_AFTERNOON' | 'EARLY_EVENING' | 'EVENING' | 'NIGHT' | 'FREE' | null;
  title: string | null;
  contentMd: string;
  mood: string | null;
  sleepHours: number | null;
  weather: string | null;
  timeLabel: string | null;  // "HH:MM" ou null
  noteType: 'JOURNAL' | 'BOOK' | 'SERIES' | 'MOVIE' | 'MUSIC' | 'OUTING' | 'SHOPPING' | 'DEV' | 'QUIZZ' | 'AGENDA' | 'FINANCE' | 'CUSTOM';
  // Id du type personnalisé (NoteTypeDef) quand noteType === 'CUSTOM' ; sinon null.
  customTypeId: string | null;
  mediaMeta: MediaMeta | null;
  font: string | null;
  fontSize: string | null;  // ex: '14px', '17px', '21px'
  visibility: 'PRIVATE' | 'SHARED_ALL' | 'SHARED_SPECIFIC';
  isDraft: boolean;
  isForConfidant: boolean;
  isSecret: boolean;         // Boîte de Pandore — invisible même au confident
  isAdult: boolean;          // Contenu 18+ — preview floutée + question de vérification
  adultQuestion: string | null;
  adultAnswerHash: string | null;
  adultHints: string[];      // Indices progressifs (jusqu'à 3), révélés à 10/20/30 échecs
  adultMercyAnswer: string | null; // Réponse révélée après 100 essais ratés uniques (null = off)
  unlockAt: string | null;   // Capsule temporelle — ISO datetime ou null
  capsuleSpoiler: string | null;   // Teaser visible avant ouverture de la capsule
  hideUntilAt: string | null;      // Minuteur post-publication — invisible aux guests jusqu'à cet ISO
  links: EntryLink[] | null;
  commentsLocked: boolean;
  readGatePrompt?: string | null;
  readGateAcceptedResponses?: string[];
  readGateStatus?: 'awaiting' | 'pending' | 'approved' | 'rejected' | null;
  version: number;        // 0 = jamais pushé, >0 = version serveur
  deletedAt: string | null; // ISO ou null
  tagNames: string[];
  /**
   * Notations « favoris / nul » par utilisateur (incl. owner et confidents).
   * Côté Owner : on a toutes les ratings (visibles + utiles aux souvenirs).
   * Côté Guest : seulement la sienne + celle de l'owner — le serveur filtre.
   * Mutuellement exclusif par userId (au plus 1 ligne par couple entry/user).
   */
  ratings?: Array<{ userId: string; value: 'FAVORITE' | 'LOW'; displayName: string | null }>;
  commentsCount: number;  // nombre de commentaires (mis à jour à chaque sync)
  collectionOnly: boolean; // true = item de Collection (média possédé/souhaité, pas de note) — masqué Timeline/Journal/Fil
  _dirty: boolean;        // true = doit être pushé au serveur
}

export interface LocalTask {
  id: string;
  ownerId: string;
  title: string;
  notes: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'LOCAL_DONE' | 'TO_TEST' | 'DEPLOYED' | 'MIGRATED' | 'CANCELLED' | 'SCHEDULED';
  dueDate: string | null;  // "YYYY-MM-DD"
  completedAt: string | null; // ISO
  category: string | null;
  taskType: string | null;
  priority: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  sortOrder: number | null;   // null = sort by createdAt
  createdBy: string | null;   // userId of creator
  version: number;
  createdAt: string;       // ISO
  updatedAt: string;       // ISO
  deletedAt: string | null; // ISO ou null
  _dirty: boolean;
}

export interface LocalDailyLog {
  date: string;           // "YYYY-MM-DD" — clé primaire
  mood: string | null;
  sleepHours: number | null;
  weather: string | null;
  energy: number | null;  // 1-5
  anxiety: number | null; // 1-5
  version: number;
  createdAt: string;      // ISO
  updatedAt: string;      // ISO
  deletedAt: string | null;
  _dirty: boolean;
}

/** Baromètre du couple : couleur du jour. RED_GREEN = journée partagée (les deux). */
export type CoupleColor = 'RED' | 'BLUE' | 'GREEN' | 'RED_GREEN';

export interface LocalCoupleDay {
  date: string;              // "YYYY-MM-DD" — clé primaire
  color: CoupleColor;
  setAt: string | null;      // ISO de la pose ; null = neutre auto (toujours éditable)
  linkedEntryIds: string[];  // ids de notes du journal expliquant la couleur
  awayLabel: string | null;  // tooltip d'un jour d'absence ; présent = "pas ensemble"
  version: number;
  createdAt: string;         // ISO
  updatedAt: string;         // ISO
  deletedAt: string | null;
  _dirty: boolean;
}

/** Type de note personnalisé (NoteTypeDef) — défini par l'owner, mirroré en
 *  local via le pull (lecture seule côté Dexie ; les écritures passent par tRPC). */
export interface LocalNoteTypeDef {
  id: string;
  ownerId: string;
  key: string;
  label: string;
  labelPlural: string;
  volumeLabel: string;
  icon: string;
  colorHex: string;
  behavior: 'JOURNAL' | 'BOOK' | 'SERIES' | 'MOVIE' | 'MUSIC' | 'OUTING' | 'SHOPPING' | 'DEV' | 'QUIZZ' | 'AGENDA' | 'FINANCE';
  fields: NoteTypeFieldDef[];  // champs meta perso définis par l'owner
  sortOrder: number;
  createdAt: string;       // ISO
  updatedAt: string;       // ISO
}

export interface SyncMeta {
  id: 'singleton';
  lastSyncAt: string | null; // ISO de la dernière sync réussie
}

export class DiaryDB extends Dexie {
  entries!: Table<LocalEntry>;
  tasks!: Table<LocalTask>;
  dailyLogs!: Table<LocalDailyLog, string>;
  coupleDays!: Table<LocalCoupleDay, string>;
  noteTypeDefs!: Table<LocalNoteTypeDef>;
  syncMeta!: Table<SyncMeta>;

  constructor() {
    super('carnet');
    this.version(1).stores({
      entries: 'id, date, updatedAt, deletedAt',
      syncMeta: 'id',
    });
    this.version(2).stores({
      entries: 'id, date, updatedAt, deletedAt',
      tasks: 'id, status, dueDate, updatedAt, deletedAt',
      syncMeta: 'id',
    }).upgrade((tx) => {
      return tx.table('entries').toCollection().modify((e) => {
        if (!e.tagNames) e.tagNames = [];
      });
    });
    this.version(4).stores({
      entries: 'id, date, updatedAt, deletedAt',
      tasks: 'id, status, dueDate, updatedAt, deletedAt',
      syncMeta: 'id',
    }).upgrade((tx) => {
      return tx.table('entries').toCollection().modify((e) => {
        if (e.timeLabel === undefined) e.timeLabel = null;
        if (!e.noteType) e.noteType = 'JOURNAL';
        if (e.mediaMeta === undefined) e.mediaMeta = null;
      });
    });
    this.version(5).stores({
      entries: 'id, date, updatedAt, deletedAt',
      tasks: 'id, status, dueDate, updatedAt, deletedAt',
      syncMeta: 'id',
    }).upgrade((tx) => {
      return tx.table('entries').toCollection().modify((e) => {
        if (e.font === 'caveat') e.font = 'lavishly';
      });
    });
    this.version(6).stores({
      entries: 'id, date, updatedAt, deletedAt',
      tasks: 'id, status, dueDate, updatedAt, deletedAt',
      syncMeta: 'id',
    }).upgrade((tx) => {
      return tx.table('entries').toCollection().modify((e) => {
        if (e.fontSize === undefined) e.fontSize = null;
      });
    });
    this.version(7).stores({
      entries: 'id, date, updatedAt, deletedAt',
      tasks: 'id, status, dueDate, updatedAt, deletedAt',
      syncMeta: 'id',
    }).upgrade((tx) => {
      return tx.table('entries').toCollection().modify((e) => {
        if (e.isDraft === undefined) e.isDraft = false;
      });
    });
    this.version(8).stores({
      entries: 'id, date, updatedAt, deletedAt',
      tasks: 'id, status, dueDate, updatedAt, deletedAt',
      syncMeta: 'id',
    }).upgrade((tx) => {
      return tx.table('entries').toCollection().modify((e) => {
        if (e.isForConfidant === undefined) e.isForConfidant = false;
        if (e.links === undefined) e.links = null;
      });
    });
    this.version(9).stores({
      entries: 'id, date, updatedAt, deletedAt',
      tasks: 'id, status, dueDate, updatedAt, deletedAt, category',
      syncMeta: 'id',
    }).upgrade((tx) => {
      return tx.table('tasks').toCollection().modify((t) => {
        if (t.category === undefined) t.category = null;
        if (t.createdBy === undefined) t.createdBy = null;
      });
    });
    this.version(10).stores({
      entries: 'id, date, updatedAt, deletedAt',
      tasks: 'id, status, dueDate, updatedAt, deletedAt, category',
      syncMeta: 'id',
    }).upgrade((tx) => {
      return tx.table('tasks').toCollection().modify((t) => {
        if (t.taskType === undefined) t.taskType = null;
      });
    });
    this.version(11).stores({
      entries: 'id, date, updatedAt, deletedAt',
      tasks: 'id, status, dueDate, updatedAt, deletedAt, category',
      syncMeta: 'id',
    }).upgrade((tx) => {
      return tx.table('tasks').toCollection().modify((t) => {
        if (t.priority === undefined) t.priority = null;
        if (t.sortOrder === undefined) t.sortOrder = null;
      });
    });
    this.version(12).stores({
      entries: 'id, date, updatedAt, deletedAt',
      tasks: 'id, status, dueDate, updatedAt, deletedAt, category',
      syncMeta: 'id',
    }).upgrade((tx) => {
      return tx.table('entries').toCollection().modify((e) => {
        if (e.isSecret === undefined) e.isSecret = false;
      });
    });
    this.version(13).stores({
      entries: 'id, date, updatedAt, deletedAt',
      tasks: 'id, status, dueDate, updatedAt, deletedAt, category',
      syncMeta: 'id',
    }).upgrade((tx) => {
      return tx.table('entries').toCollection().modify((e) => {
        if (e.unlockAt === undefined) e.unlockAt = null;
      });
    });
    this.version(14).stores({
      entries: 'id, date, updatedAt, deletedAt',
      tasks: 'id, status, dueDate, updatedAt, deletedAt, category',
      syncMeta: 'id',
    }).upgrade(async (tx) => {
      // Force a full re-sync to populate commentsCount for existing entries
      await tx.table('syncMeta').clear();
      return tx.table('entries').toCollection().modify((e) => {
        if (e.commentsCount === undefined) e.commentsCount = 0;
      });
    });
    this.version(15).stores({
      entries: 'id, date, updatedAt, deletedAt',
      tasks: 'id, status, dueDate, updatedAt, deletedAt, category',
      syncMeta: 'id',
    }).upgrade((tx) => {
      return tx.table('entries').toCollection().modify((e) => {
        if (e.isAdult === undefined) e.isAdult = false;
        if (e.adultQuestion === undefined) e.adultQuestion = null;
        if (e.adultAnswerHash === undefined) e.adultAnswerHash = null;
      });
    });
    this.version(16).stores({
      entries: 'id, date, updatedAt, deletedAt',
      tasks: 'id, status, dueDate, updatedAt, deletedAt, category',
      dailyLogs: 'date, updatedAt, deletedAt',
      syncMeta: 'id',
    });
    this.version(17).stores({
      entries: 'id, date, updatedAt, deletedAt',
      tasks: 'id, status, dueDate, updatedAt, deletedAt, category',
      dailyLogs: 'date, updatedAt, deletedAt',
      syncMeta: 'id',
    }).upgrade((tx) => {
      return tx.table('entries').toCollection().modify((e) => {
        if (e.capsuleSpoiler === undefined) e.capsuleSpoiler = null;
      });
    });
    this.version(18).stores({
      entries: 'id, date, updatedAt, deletedAt',
      tasks: 'id, status, dueDate, updatedAt, deletedAt, category',
      dailyLogs: 'date, updatedAt, deletedAt',
      syncMeta: 'id',
    }).upgrade((tx) => {
      return tx.table('entries').toCollection().modify((e) => {
        if (e.hideUntilAt === undefined) e.hideUntilAt = null;
      });
    });
    this.version(19).stores({
      entries: 'id, date, updatedAt, deletedAt',
      tasks: 'id, status, dueDate, updatedAt, deletedAt, category',
      dailyLogs: 'date, updatedAt, deletedAt',
      collectionItems: 'id, status, noteType, updatedAt, deletedAt',
      syncMeta: 'id',
    });
    // v20 : unification Collection — les items deviennent des Entry avec
    // collectionOnly=true. La table collectionItems est retirée (null = drop).
    this.version(20).stores({
      entries: 'id, date, updatedAt, deletedAt',
      tasks: 'id, status, dueDate, updatedAt, deletedAt, category',
      dailyLogs: 'date, updatedAt, deletedAt',
      collectionItems: null,
      syncMeta: 'id',
    }).upgrade((tx) => {
      return tx.table('entries').toCollection().modify((e) => {
        if (e.collectionOnly === undefined) e.collectionOnly = false;
      });
    });
    // v21 : baromètre du couple — une couleur par jour, clé = date.
    this.version(21).stores({
      entries: 'id, date, updatedAt, deletedAt',
      tasks: 'id, status, dueDate, updatedAt, deletedAt, category',
      dailyLogs: 'date, updatedAt, deletedAt',
      coupleDays: 'date, updatedAt, deletedAt',
      syncMeta: 'id',
    });
    // v22 : indices progressifs pour la porte +18.
    this.version(22).stores({
      entries: 'id, date, updatedAt, deletedAt',
      tasks: 'id, status, dueDate, updatedAt, deletedAt, category',
      dailyLogs: 'date, updatedAt, deletedAt',
      coupleDays: 'date, updatedAt, deletedAt',
      syncMeta: 'id',
    }).upgrade((tx) => {
      return tx.table('entries').toCollection().modify((e) => {
        if (e.adultHints === undefined) e.adultHints = [];
      });
    });
    // v23 : ajout du champ adultMercyAnswer (réponse révélée après 100 essais)
    this.version(23).stores({
      entries: 'id, date, updatedAt, deletedAt',
      tasks: 'id, status, dueDate, updatedAt, deletedAt, category',
      dailyLogs: 'date, updatedAt, deletedAt',
      coupleDays: 'date, updatedAt, deletedAt',
      syncMeta: 'id',
    }).upgrade((tx) => {
      return tx.table('entries').toCollection().modify((e) => {
        if (e.adultMercyAnswer === undefined) e.adultMercyAnswer = null;
      });
    });
    // v24 : types de note personnalisés (NoteTypeDef) + customTypeId sur les
    // entries. On force un re-pull complet (clear syncMeta, cf. v14) pour peupler
    // la table noteTypeDefs et le customTypeId des entrées existantes.
    this.version(24).stores({
      entries: 'id, date, updatedAt, deletedAt',
      tasks: 'id, status, dueDate, updatedAt, deletedAt, category',
      dailyLogs: 'date, updatedAt, deletedAt',
      coupleDays: 'date, updatedAt, deletedAt',
      noteTypeDefs: 'id, sortOrder',
      syncMeta: 'id',
    }).upgrade(async (tx) => {
      await tx.table('syncMeta').clear();
      return tx.table('entries').toCollection().modify((e) => {
        if (e.customTypeId === undefined) e.customTypeId = null;
      });
    });
    // v25 : champs meta perso sur les types custom. Re-pull complet (clear
    // syncMeta, cf. v24) pour peupler `fields` sur les defs existantes.
    this.version(25).stores({
      entries: 'id, date, updatedAt, deletedAt',
      tasks: 'id, status, dueDate, updatedAt, deletedAt, category',
      dailyLogs: 'date, updatedAt, deletedAt',
      coupleDays: 'date, updatedAt, deletedAt',
      noteTypeDefs: 'id, sortOrder',
      syncMeta: 'id',
    }).upgrade(async (tx) => {
      await tx.table('syncMeta').clear();
      return tx.table('noteTypeDefs').toCollection().modify((d) => {
        if (d.fields === undefined) d.fields = [];
      });
    });
  }
}

export const db = new DiaryDB();
