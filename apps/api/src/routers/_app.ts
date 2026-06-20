import { router } from '../trpc.js';
import { authRouter } from './auth.js';
import { entriesRouter } from './entries.js';
import { syncRouter } from './sync.js';
import { tagsRouter } from './tags.js';
import { guestsRouter } from './guests.js';
import { commentsRouter } from './comments.js';
import { notificationsRouter } from './notifications.js';
import { imagesRouter } from './images.js';
import { audiosRouter } from './audios.js';
import { statsRouter } from './stats.js';
import { tasksRouter } from './tasks.js';
import { apiKeysRouter } from './apikeys.js';
import { systemRouter } from './system.js';
import { twofaRouter } from './twofa.js';
import { reactionsRouter } from './reactions.js';
import { ratingsRouter } from './ratings.js';
import { quizRouter } from './quiz.js';
import { topicRequestsRouter } from './topicRequests.js';
import { dailyLogRouter } from './dailyLog.js';
import { coupleDayRouter } from './coupleDay.js';
import { directMessagesRouter } from './directMessages.js';
import { gifsRouter } from './gifs.js';
import { readGateRouter } from './readGate.js';
import { videosRouter } from './videos.js';
import { souvenirsRouter } from './souvenirs.js';
import { logsRouter } from './logs.js';
import { aiRouter } from './ai.js';
import { contactsRouter } from './contacts.js';
import { noteTypesRouter } from './noteTypes.js';

export const appRouter = router({
  system: systemRouter,
  twofa: twofaRouter,
  auth: authRouter,
  entries: entriesRouter,
  sync: syncRouter,
  tags: tagsRouter,
  guests: guestsRouter,
  comments: commentsRouter,
  notifications: notificationsRouter,
  images: imagesRouter,
  audios: audiosRouter,
  stats: statsRouter,
  tasks: tasksRouter,
  apiKeys: apiKeysRouter,
  reactions: reactionsRouter,
  ratings: ratingsRouter,
  quiz: quizRouter,
  topicRequests: topicRequestsRouter,
  dailyLog: dailyLogRouter,
  coupleDay: coupleDayRouter,
  directMessages: directMessagesRouter,
  gifs: gifsRouter,
  readGate: readGateRouter,
  videos: videosRouter,
  souvenirs: souvenirsRouter,
  logs: logsRouter,
  ai: aiRouter,
  contacts: contactsRouter,
  noteTypes: noteTypesRouter,
});

export type AppRouter = typeof appRouter;
