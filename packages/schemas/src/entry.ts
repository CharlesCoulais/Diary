import { z } from 'zod';

export const entrySection = z.enum(['MORNING', 'LATE_MORNING', 'NOON', 'AFTERNOON', 'LATE_AFTERNOON', 'EARLY_EVENING', 'EVENING', 'NIGHT', 'FREE']);
export const noteType = z.enum(['JOURNAL', 'BOOK', 'SERIES', 'MOVIE', 'MUSIC', 'OUTING', 'SHOPPING', 'DEV', 'QUIZZ', 'AGENDA', 'FINANCE', 'CUSTOM']);

// Nombre max de morceaux dans une note MUSIC (mode playlist). Généreux pour
// couvrir l'import d'une playlist entière (ex: export Skiley), tout en bornant
// la taille du payload de sync. Partagé client/serveur (source unique).
export const MAX_PLAYLIST_TRACKS = 1000;

// Une question de quiz (note QUIZZ). `type` par question : QCM ou réponse libre.
// QCM : `options` + `correct` (indices des bonnes options, 1 ou plusieurs).
// Libre : `accepted` (réponses acceptées, comparées de façon normalisée).
// `correct`/`accepted`/`explanation` sont les données « solution » : retirées du
// payload envoyé aux confidents (cf. entries.ts), la correction se fait côté serveur.
export const quizQuestion = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(['qcm', 'free']),
  prompt: z.string().max(2000),
  // Image illustrant l'énoncé (URL `/images/:id`). Non secret → exposé.
  image: z.string().max(2000).optional(),
  options: z.array(z.string().max(500)).max(12).optional(),
  // Image par option, alignée par index sur `options` ('' = pas d'image). Exposé.
  optionImages: z.array(z.string().max(2000)).max(12).optional(),
  correct: z.array(z.number().int().min(0)).max(12).optional(),
  // `multi` : QCM à réponses multiples (cases à cocher) vs unique (radio). Indice
  // d'UI exposé aux confidents (≠ solution), pour rendre le bon widget.
  multi: z.boolean().optional(),
  accepted: z.array(z.string().max(500)).max(20).optional(),
  explanation: z.string().max(2000).optional(),
});

export const entryLink = z.object({
  url: z.string().url().max(2000),
  title: z.string().max(500).nullable(),
  image: z.string().max(2000).nullable(),
  siteName: z.string().max(200).nullable(),
});

// Une track dans une note MUSIC multi-pistes (playlist)
export const mediaTrack = z.object({
  streamUrl: z.string().url().optional(),
  subject: z.string().max(300).optional(),     // titre du morceau
  creator: z.string().max(200).optional(),     // artiste
  trackTitle: z.string().max(300).optional(),  // album
  coverUrl: z.string().url().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  description: z.string().max(2000).optional(),
  lyrics: z.string().max(20_000).optional(),
  lyricsTranslation: z.string().max(20_000).optional(),
});

export const mediaMeta = z.object({
  subject: z.string().max(300).optional(),
  seriesName: z.string().max(300).optional(), // nom de la série/saga (manga, cycle de romans…)
  trackTitle: z.string().max(300).optional(),
  creator: z.string().max(200).optional(),
  tmdbId: z.number().int().positive().optional(),
  isbn: z.string().max(20).optional(),
  streamUrl: z.string().url().optional(),
  description: z.string().max(2000).optional(),
  progressCurrent: z.number().int().min(0).optional(),
  progressTotal: z.number().int().min(1).optional(),
  chapter: z.number().int().min(1).optional(),
  volume: z.number().int().min(1).optional(),
  totalVolumes: z.number().int().min(1).optional(),
  season: z.number().int().min(1).optional(),
  totalSeasons: z.number().int().min(1).optional(),
  // SERIES TV : suivi détaillé par saison/épisode (collection « vraie collection »).
  // `watched` = n° d'épisodes vus (1-based, sparse) ; permet de cocher au fil du temps
  // sans créer de note. Les champs plats season/progressCurrent/progressTotal restent
  // dérivés de ce tableau pour la rétrocompat des vues existantes.
  seasonsWatched: z.array(z.object({
    number: z.number().int().min(0),                // n° de saison (0 = Spéciaux TMDB)
    // Plafond large : certaines séries (Détective Conan, One Piece…) ont >1000
    // épisodes dans une seule « saison » TMDB.
    episodes: z.number().int().min(0).max(20000),
    watched: z.array(z.number().int().min(1)).max(20000).default([]),
    title: z.string().max(200).optional(),
  })).max(60).optional(),
  coverUrl: z.string().url().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  // Statut unifié pré-lecture + lecture : wishlist/owned avant de commencer,
  // ongoing/finished/abandoned ensuite.
  status: z.enum(['wishlist', 'owned', 'ongoing', 'finished', 'abandoned'])
    .transform((v) => v)
    .or(z.string().transform((v): 'finished' | 'ongoing' | 'wishlist' | 'owned' | 'abandoned' => {
      // Rétrocompat : anciennes valeurs capitalisées (CONSUMED, DONE, READING, WATCHING…)
      const map: Record<string, 'finished' | 'ongoing' | 'wishlist' | 'owned' | 'abandoned'> = {
        CONSUMED: 'finished', DONE: 'finished', FINISHED: 'finished',
        READING: 'ongoing', WATCHING: 'ongoing', PLAYING: 'ongoing', ONGOING: 'ongoing',
        WISHLIST: 'wishlist', OWNED: 'owned', ABANDONED: 'abandoned',
      };
      return map[v] ?? 'finished';
    }))
    .optional(),
  // Statut du tome/saison/film en cours (≠ seriesStatus pour les sagas multi-tomes).
  // Pour une œuvre mono (livre seul, film seul…), seul `status` est utilisé.
  seriesStatus: z.enum(['wishlist', 'owned', 'ongoing', 'finished', 'abandoned'])
    .transform((v) => v)
    .or(z.string().transform((v): 'finished' | 'ongoing' | 'wishlist' | 'owned' | 'abandoned' => {
      const map: Record<string, 'finished' | 'ongoing' | 'wishlist' | 'owned' | 'abandoned'> = {
        CONSUMED: 'finished', DONE: 'finished', FINISHED: 'finished',
        READING: 'ongoing', WATCHING: 'ongoing', PLAYING: 'ongoing', ONGOING: 'ongoing',
        WISHLIST: 'wishlist', OWNED: 'owned', ABANDONED: 'abandoned',
      };
      return map[v] ?? 'finished';
    }))
    .optional(),
  // MUSIC mono : paroles + traduction (en playlist, c'est par track)
  lyrics: z.string().max(20_000).optional(),
  lyricsTranslation: z.string().max(20_000).optional(),
  // MUSIC playlist : si présent, c'est une note multi-morceaux
  tracks: z.array(mediaTrack).max(MAX_PLAYLIST_TRACKS).optional(),
  playlistName: z.string().max(300).optional(),
  // DEV (séries de chapitres) : nom de la partie + nombre total de chapitres.
  partName: z.string().max(300).optional(),
  totalChapters: z.number().int().min(1).optional(),
  // QUIZZ : liste de questions (définition du quiz, éditée par l'owner).
  quizQuestions: z.array(quizQuestion).max(100).optional(),
  // QUIZZ : mélange (à chaque tentative) — non secret, exposé aux confidents.
  quizShuffleQuestions: z.boolean().optional(),
  quizShuffleOptions: z.boolean().optional(),
  // AGENDA : événements datés (vue liste + mini-calendrier).
  events: z.array(z.object({
    id: z.string().min(1).max(64),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    // Fin optionnelle (date et/ou heure). endDate absent ⇒ même jour que `date`.
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    title: z.string().max(500),
    location: z.string().max(300).optional(),
    done: z.boolean().optional(),
  })).max(1000).optional(),
  // FINANCE : lignes de budget (revenus/dépenses) + devise.
  budgetItems: z.array(z.object({
    id: z.string().min(1).max(64),
    label: z.string().max(300),
    amount: z.number(),
    kind: z.enum(['income', 'expense']),
    category: z.string().max(200).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })).max(2000).optional(),
  currency: z.string().max(3).optional(),
  // Champs personnalisés (types de note custom) : valeur par id de champ.
  // string (text/longtext/date/select) | number (number/rating) | boolean
  // (checkbox) | string[] (multiselect). Borné à 100 champs.
  customFields: z.record(
    z.string().max(64),
    z.union([z.string().max(5000), z.number(), z.boolean(), z.array(z.string().max(200)).max(30), z.null()]),
  ).refine((r) => Object.keys(r).length <= 100, { message: 'Trop de champs personnalisés' }).optional(),
}).optional();
export const visibility = z.enum(['PRIVATE', 'SHARED_ALL', 'SHARED_SPECIFIC']);

export const createEntryInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format YYYY-MM-DD'),
  section: entrySection.optional(),
  title: z.string().max(200).trim().optional(),
  contentMd: z.string().max(256_000), // 256 KB
  mood: z.string().max(200).optional(),
  sleepHours: z.number().min(0).max(24).optional(),
  weather: z.string().max(80).optional(),
  timeLabel: z.preprocess((v) => (v === '' ? undefined : v), z.string().regex(/^\d{2}:\d{2}$/).optional()),
  noteType: noteType.default('JOURNAL'),
  // Id du type personnalisé (NoteTypeDef) quand noteType === 'CUSTOM'. Ignoré sinon.
  customTypeId: z.string().min(1).max(64).nullable().optional(),
  mediaMeta,
  font: z.string().max(100).optional(),
  fontSize: z.string().max(10).optional(),
  visibility: visibility.default('PRIVATE'),
  unlockAt: z.string().datetime().nullable().optional(),
  capsuleSpoiler: z.string().max(500).nullable().optional(),
  hideUntilAt: z.string().datetime().nullable().optional(),
  collectionOnly: z.boolean().optional(),
});

export const updateEntryInput = createEntryInput.partial().extend({
  id: z.string().min(1).max(64),
  version: z.number().int().nonnegative(),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format YYYY-MM-DD');

export const listEntriesInput = z.object({
  date: isoDate.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.number().int().min(1).max(200).default(50),
  order: z.enum(['asc', 'desc']).default('desc'),
  // Inclut les items de Collection (entrées collectionOnly) — pour la page
  // Collection côté Confident. Exclus par défaut (Timeline / Journal).
  includeCollectionOnly: z.boolean().optional(),
});

export const byIdInput = z.object({ id: z.string().min(1).max(64) });

// Payload envoyé par le client lors d'un sync push.
// L'id peut être un UUID généré côté client (pas forcément un cuid).
export const syncEntryInput = z.object({
  id: z.string().min(1).max(64),
  date: isoDate,
  section: entrySection.nullable(),
  title: z.string().max(200).trim().nullable(),
  contentMd: z.string().max(256_000),
  mood: z.string().max(200).nullable(),
  sleepHours: z.number().min(0).max(24).nullable(),
  weather: z.string().max(80).nullable(),
  // Normalise '' → null (cas où l'UI envoie une chaîne vide pendant la transition section ↔ heure)
  timeLabel: z.preprocess((v) => (v === '' ? null : v), z.string().regex(/^\d{2}:\d{2}$/).nullable()),
  noteType: noteType.default('JOURNAL'),
  customTypeId: z.string().min(1).max(64).nullable().default(null),
  mediaMeta: mediaMeta.nullable().default(null),
  font: z.string().max(100).nullable(),
  fontSize: z.string().max(10).nullable(),
  visibility: visibility,
  isDraft: z.boolean().default(false),
  isForConfidant: z.boolean().default(false),
  isSecret: z.boolean().default(false),
  isAdult: z.boolean().default(false),
  adultQuestion: z.string().max(500).nullable().default(null),
  adultAnswerHash: z.string().max(64).nullable().default(null),
  adultHints: z.array(z.string().max(500)).max(5).default([]),
  // Réponse de clémence : si définie, accord automatique après 100 essais ratés
  // uniques du même confident. La réponse est aussi révélée. Default null = off.
  adultMercyAnswer: z.string().max(500).nullable().default(null),
  // Verrou de lecture conditionnel (prompt + réponses auto-acceptées).
  readGatePrompt: z.string().max(1000).nullable().default(null),
  readGateAcceptedResponses: z.array(z.string().max(500)).max(20).default([]),
  links: z.array(entryLink).nullable().default(null),
  unlockAt: z.string().datetime().nullable().default(null),
  capsuleSpoiler: z.string().max(500).nullable().default(null),
  hideUntilAt: z.string().datetime().nullable().default(null),
  collectionOnly: z.boolean().default(false),
  version: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
  tagNames: z.array(z.string().min(1).max(50)).max(20).default([]),
});

export type SyncEntryInput = z.infer<typeof syncEntryInput>;
export type NoteType = z.infer<typeof noteType>;
export type EntryLink = z.infer<typeof entryLink>;
export type MediaTrack = z.infer<typeof mediaTrack>;
export type MediaMeta = z.infer<typeof mediaMeta>;
export type QuizQuestion = z.infer<typeof quizQuestion>;

export type CreateEntryInput = z.infer<typeof createEntryInput>;
export type UpdateEntryInput = z.infer<typeof updateEntryInput>;
export type ListEntriesInput = z.infer<typeof listEntriesInput>;
export type EntrySection = z.infer<typeof entrySection>;
export type Visibility = z.infer<typeof visibility>;
