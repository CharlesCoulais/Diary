import path from 'node:path';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const _require = createRequire(import.meta.url);
// archiver v8 uses class-based API; @types/archiver@7 is stale — bypass with cast
const { ZipArchive } = _require('archiver') as {
  ZipArchive: new (opts?: { zlib?: { level?: number } }) => import('archiver').Archiver;
};
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cron from 'node-cron';
import webpush from 'web-push';
import { VAPID_PUBLIC, sendPushToUser } from './lib/push.js';
import { isR2Configured, r2Upload, r2PresignedUrl, r2Delete } from './lib/r2.js';
import { canRead } from './lib/permissions.js';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import staticPlugin from '@fastify/static';
import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from '@trpc/server/adapters/fastify';
import { env, isDev, isProd } from './env.js';
import { appRouter, type AppRouter } from './routers/_app.js';
import { notifyGuestsOfEntryEvent } from './routers/sync.js';
import { createContext } from './context.js';
import { db } from './db.js';
import { getSessionCookie } from './auth/cookies.js';
import { validateSession } from './auth/session.js';
import { aiAvailable, AI_MODELS, type AiModel } from './routers/ai.js';
import { streamRecap } from './lib/aiText.js';
import { buildMonthDigest, monthLabel } from './lib/recapDigest.js';
import { subscribeUser, markUserOnline, markUserOffline, emitToOwnerCircle } from './lib/events.js';
import { canInteract } from './lib/permissions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { SERVER_STARTED_AT } from './startup.js';
import { computeStatsForAuthor } from './lib/stats.js';
import { noteType as noteTypeSchema, mediaMeta as mediaMetaSchema } from '@carnet/schemas';

async function main() {
  const app = Fastify({
    logger: isDev
      ? {
          level: 'warn',
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
          },
        }
      : { level: 'info' },
    // Coupe les 2 logs auto par requête (incoming + completed) : avec le batching tRPC,
    // une seule URL fait plusieurs Ko et noyait la console. On garde app.log.error/warn
    // pour les vraies erreurs.
    disableRequestLogging: true,
    trustProxy: true,
    bodyLimit: 45 * 1024 * 1024, // 45 MB pour les uploads (audio jusqu'à 30 MB en base64)
    // tRPC enregistre /trpc/:path et passe l'URL batchée entière comme paramètre.
    // Avec 20+ routes en batch, on dépasse facilement les 100 chars par défaut → 404.
    maxParamLength: 5000,
  });

  // Parser pour les uploads vidéo binaires — bodyLimit rehaussé à 550 Mo pour cette route.
  // Le parser reçoit le payload comme Readable stream et le passe tel quel au handler.
  const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;
  app.addContentTypeParser(
    VIDEO_MIME_TYPES as unknown as string[],
    { bodyLimit: 550 * 1024 * 1024 },
    (_req, payload, done) => done(null, payload),
  );

  const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'videos');
  // Dossier d'upload disque : utilisé uniquement en dev (sans R2). En prod le
  // système de fichiers du conteneur peut être read-only → un mkdir au boot
  // ferait planter le démarrage. On ne le crée donc qu'en dev, en best-effort.
  if (isDev) {
    try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch { /* best-effort */ }
  }

  await app.register(helmet, {
    // YouTube (et d'autres embeds) refusent de lire la vidéo sans Referer.
    // Helmet pose no-referrer par défaut → on bascule sur l'équivalent navigateur
    // standard : on transmet l'origine en cross-origin HTTPS, rien en HTTP downgrade.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],

        // Le script inline de détection du thème (index.html) est autorisé
        // via son hash SHA-256 exact — tout autre script inline sera bloqué.
        scriptSrc: [
          "'self'",
          "'sha256-gjABmjITz9W8ZW1kW7/79OQG0GUCii4bhyKhjVllt7s='",
        ],

        // 'unsafe-inline' nécessaire pour les style={{ }} React (couleurs dynamiques)
        // et la feuille de Google Fonts.
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
        ],

        fontSrc:   ["'self'", "https://fonts.gstatic.com"],

        // https: autorise les covers (livres, musique), thumbnails YouTube,
        // images OG des liens shopping (Amazon, Fnac…) — sources impossibles à énumérer.
        imgSrc:    ["'self'", "data:", "blob:", "https:"],

        // Les players embarqués (YouTube, Spotify, SoundCloud, Deezer) streament
        // leur propre audio/vidéo depuis leurs CDN ; pas besoin de les lister ici
        // car le mediaSrc du parent ne s'applique pas aux iframes (elles ont leur CSP propre).
        mediaSrc:  ["'self'", "blob:", ...(env.R2_ENDPOINT ? [env.R2_ENDPOINT] : [])],

        // 'self' = trpc + API ; les autres domaines = APIs publiques utilisées pour la recherche de média
        // (films/séries via TMDB, livres via Open Library + Google Books, musique via iTunes,
        // paroles via LRCLIB).
        connectSrc: [
          "'self'",
          "https://api.themoviedb.org",
          "https://openlibrary.org",
          "https://covers.openlibrary.org",
          "https://www.googleapis.com",
          "https://itunes.apple.com",
          "https://catalogue.bnf.fr",
          "https://lrclib.net",
          // AniList — recherche manga/anime (description souvent absente sur Open Library)
          "https://graphql.anilist.co",
          // MangaDex — couvertures par tome (mangas mal indexés sur Open Library)
          "https://api.mangadex.org",
          // oEmbed musical — pré-remplissage titre/artiste au collage d'une URL
          // d'écoute dans une note Musique (cf. handleStreamUrlChange dans
          // MediaMetaPanel). Distinct du frameSrc des players : ici c'est un fetch.
          "https://open.spotify.com",
          "https://www.youtube.com",
          "https://soundcloud.com",
          "https://api.deezer.com",
        ],

        // Iframes des players embarqués : chaque domaine correspond à un embed utilisé.
        frameSrc: [
          "'self'",
          "https://www.youtube.com",
          "https://open.spotify.com",
          "https://w.soundcloud.com",
          "https://widget.deezer.com",
        ],

        // blob: pour le service worker PWA (VitePWA injectManifest)
        workerSrc: ["'self'", "blob:"],
        manifestSrc: ["'self'"],

        frameAncestors: ["'none'"],
        objectSrc:  ["'none'"],
        baseUri:    ["'self'"],
        formAction: ["'self'"],

        // En production : forcer HTTPS pour les sous-ressources
        ...(isProd ? { upgradeInsecureRequests: [] } : {}),
      },
    },
  });

  // En prod : X-Robots-Tag sur toutes les réponses pour empêcher l'indexation
  if (isProd) {
    app.addHook('onSend', (_req, reply, payload, done) => {
      reply.header('X-Robots-Tag', 'noindex, nofollow');
      done(null, payload);
    });
  }

  await app.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true,
  });

  await app.register(cookie, {
    secret: env.COOKIE_SECRET,
  });

  await app.register(rateLimit, {
    max: isDev ? 2000 : 600,
    timeWindow: '1 minute',
    allowList: isDev ? ['127.0.0.1', '::1', '::ffff:127.0.0.1'] : [],
    // Clé par utilisateur si connecté, sinon par IP — évite que plusieurs guests
    // derrière la même IP (CGNAT mobile, etc.) ne se bloquent mutuellement.
    keyGenerator: (req) => {
      const token = getSessionCookie(req);
      if (token) return `s:${token.slice(0, 32)}`;
      return req.ip;
    },
  });

  // Serving d'images — authentification par cookie de session + contrôle de propriété
  app.get('/images/:id', async (req, reply) => {
    const token = getSessionCookie(req);
    if (!token) return reply.code(401).send({ error: 'Unauthorized' });
    const session = await validateSession(token);
    if (!session) return reply.code(401).send({ error: 'Unauthorized' });

    const { id } = req.params as { id: string };
    const image = await db.image.findUnique({ where: { id }, select: { data: true, mimeType: true, authorId: true, directMessageId: true, commentId: true } });
    if (!image) return reply.code(404).send({ error: 'Not found' });

    // L'image appartient soit à l'owner lui-même, soit à l'owner qui a invité ce guest.
    // Un guest peut aussi voir ses propres images (ex : sa photo de profil).
    // Cas messagerie : une image attachée à un message est visible par les deux
    // participants de la conversation. Cas commentaire : visible par quiconque
    // peut interagir avec l'entrée commentée (l'auteur peut être un confident).
    const allowedAuthorId = session.user.role === 'OWNER'
      ? session.user.id
      : session.user.invitedById;
    let allowed = image.authorId === allowedAuthorId || image.authorId === session.user.id;
    if (!allowed && image.directMessageId) {
      const msg = await db.directMessage.findUnique({
        where: { id: image.directMessageId },
        select: { senderId: true, recipientId: true },
      });
      allowed = !!msg && (msg.senderId === session.user.id || msg.recipientId === session.user.id);
    }
    if (!allowed && image.commentId) {
      const comment = await db.comment.findUnique({
        where: { id: image.commentId },
        select: {
          entry: {
            select: { authorId: true, visibility: true, isSecret: true, shares: { select: { receiverId: true, canComment: true } } },
          },
        },
      });
      allowed = !!comment && canInteract(session.user, comment.entry);
    }
    // Cas avatar : une image utilisée comme photo de profil par un utilisateur
    // du cercle (l'owner + tous ses confidents) est visible par tous les
    // membres du cercle. Sans ça, le owner ne pouvait pas voir l'avatar de
    // ses confidents (le confident peut voir le sien car le `authorId` ≡
    // `invitedById` de l'owner pour l'avatar de l'owner).
    if (!allowed) {
      const avatarOwner = await db.user.findFirst({
        where: { avatarImageId: id },
        select: { id: true, invitedById: true },
      });
      if (avatarOwner) {
        const circleOwnerId = session.user.role === 'OWNER' ? session.user.id : session.user.invitedById;
        if (avatarOwner.id === session.user.id) allowed = true;
        else if (avatarOwner.id === circleOwnerId) allowed = true; // avatar de l'owner du cercle
        else if (avatarOwner.invitedById === circleOwnerId) allowed = true; // avatar d'un confident du même owner
      }
    }
    if (!allowed) return reply.code(403).send({ error: 'Forbidden' });

    const buf = Buffer.from(image.data, 'base64');
    return reply
      .header('Content-Type', image.mimeType)
      .header('Cache-Control', 'private, max-age=31536000, immutable')
      .send(buf);
  });

  // Serving audio — authentification par cookie de session + contrôle de propriété
  app.get('/audios/:id', async (req, reply) => {
    const token = getSessionCookie(req);
    if (!token) return reply.code(401).send({ error: 'Unauthorized' });
    const session = await validateSession(token);
    if (!session) return reply.code(401).send({ error: 'Unauthorized' });

    const { id } = req.params as { id: string };
    const audio = await db.audio.findUnique({ where: { id }, select: { data: true, mimeType: true, filename: true, authorId: true } });
    if (!audio) return reply.code(404).send({ error: 'Not found' });

    // L'audio appartient soit à l'owner lui-même, soit à l'owner qui a invité ce guest
    const allowedAuthorId = session.user.role === 'OWNER'
      ? session.user.id
      : session.user.invitedById;
    if (audio.authorId !== allowedAuthorId) return reply.code(403).send({ error: 'Forbidden' });

    const buf = Buffer.from(audio.data, 'base64');
    return reply
      .header('Content-Type', audio.mimeType)
      .header('Content-Disposition', `inline; filename="${encodeURIComponent(audio.filename)}"`)
      .header('Cache-Control', 'private, max-age=31536000, immutable')
      .send(buf);
  });

  // Récap mensuel IA — synthèse d'un mois de notes (owner only, privé).
  // Réponse en streaming NDJSON (annulable) : une ligne JSON par évènement —
  // {t:'delta',text} au fil de la génération, puis {t:'done',text} avec le texte
  // complet (qui fait foi côté client), ou {t:'error',message}. Le digest du mois
  // est construit côté serveur (cf. lib/recapDigest.ts) ; le récap généré est
  // persisté (AiRecap, un par mois) à la fin pour être relisible cross-device.
  app.post('/ai/recap', async (req, reply) => {
    const token = getSessionCookie(req);
    if (!token) return reply.code(401).send({ error: 'Unauthorized' });
    const session = await validateSession(token);
    if (!session) return reply.code(401).send({ error: 'Unauthorized' });
    if (session.user.role !== 'OWNER') return reply.code(403).send({ error: 'Forbidden' });
    if (!aiAvailable()) return reply.code(503).send({ error: "Le récap IA n'est pas configuré." });

    const body = req.body as { period?: unknown; model?: unknown };
    const period = typeof body?.period === 'string' && /^\d{4}-\d{2}$/.test(body.period) ? body.period : null;
    const isModel = (v: unknown): v is AiModel => (AI_MODELS as readonly unknown[]).includes(v);
    const model: AiModel = isModel(body?.model) ? body.model : isModel(env.AI_TEXT_MODEL) ? env.AI_TEXT_MODEL : 'sonnet';
    if (!period) return reply.code(400).send({ error: 'Mois invalide.' });

    const built = await buildMonthDigest(session.user.id, db, period);
    if (!built || built.entryCount === 0) {
      return reply.code(422).send({ error: 'Aucune note à résumer pour ce mois.' });
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    });
    const send = (obj: Record<string, unknown>) => { reply.raw.write(JSON.stringify(obj) + '\n'); };

    const ac = new AbortController();
    req.raw.on('close', () => ac.abort());

    try {
      const { text: final, usage } = await streamRecap({
        digest: built.digest,
        monthLabel: monthLabel(period),
        model,
        signal: ac.signal,
        onDelta: (chunk) => send({ t: 'delta', text: chunk }),
      });
      // Persistance : un récap par (owner, mois), régénérable.
      await db.aiRecap.upsert({
        where: { ownerId_period: { ownerId: session.user.id, period } },
        create: { ownerId: session.user.id, period, contentMd: final, model, entryCount: built.entryCount },
        update: { contentMd: final, model, entryCount: built.entryCount, generatedAt: new Date() },
      }).catch((err) => { req.log.error({ err }, '[ai/recap] persist failed'); });
      send({ t: 'done', text: final, usage, entryCount: built.entryCount });
    } catch (err) {
      if (!ac.signal.aborted) {
        req.log.error({ err }, '[ai/recap]');
        send({ t: 'error', message: "Impossible de générer le récap — vérifie le token Claude (plan Max) côté serveur." });
      }
    } finally {
      reply.raw.end();
    }
  });

  // Upload vidéo pour les notes — stream vers disque, limite 500 Mo
  app.post('/videos/upload', async (req, reply) => {
    const token = getSessionCookie(req);
    if (!token) return reply.code(401).send({ error: 'Unauthorized' });
    const session = await validateSession(token);
    if (!session) return reply.code(401).send({ error: 'Unauthorized' });
    if (session.user.role !== 'OWNER') return reply.code(403).send({ error: 'Forbidden' });

    const mimeType = req.headers['content-type']?.split(';')[0]?.trim() ?? '';
    if (!VIDEO_MIME_TYPES.includes(mimeType as typeof VIDEO_MIME_TYPES[number])) {
      return reply.code(400).send({ error: 'Format non supporté (MP4, WebM ou MOV).' });
    }

    const rawFilename = req.headers['x-filename'];
    const filename = typeof rawFilename === 'string'
      ? decodeURIComponent(rawFilename).replace(/[/\\]/g, '_').slice(0, 255)
      : 'video';
    const entryId = typeof req.headers['x-entry-id'] === 'string'
      ? req.headers['x-entry-id']
      : null;

    const videoId = crypto.randomUUID();
    const ext = mimeType === 'video/quicktime' ? 'mov' : mimeType === 'video/webm' ? 'webm' : 'mp4';
    const filePath = `uploads/videos/${videoId}.${ext}`;
    const videoStream = req.body as NodeJS.ReadableStream;
    let bytesWritten = 0;

    if (isR2Configured()) {
      // Prod : stream vers R2 (multipart automatique pour les gros fichiers)
      try {
        const { PassThrough } = await import('node:stream');
        const counter = new PassThrough();
        counter.on('data', (chunk: Buffer) => { bytesWritten += chunk.length; });
        videoStream.pipe(counter);
        await r2Upload(filePath, counter, mimeType);
      } catch {
        return reply.code(500).send({ error: 'Erreur lors de l\'upload.' });
      }
    } else if (isDev) {
      // Dev : écriture sur disque local
      const absolutePath = path.join(UPLOADS_DIR, `${videoId}.${ext}`);
      const writeStream = fs.createWriteStream(absolutePath);
      try {
        await pipeline(videoStream, writeStream);
        bytesWritten = fs.statSync(absolutePath).size;
      } catch {
        fs.rmSync(absolutePath, { force: true });
        return reply.code(500).send({ error: 'Erreur lors de l\'upload.' });
      }
      const MAX_SIZE = 500 * 1024 * 1024;
      if (bytesWritten > MAX_SIZE) {
        fs.rmSync(absolutePath, { force: true });
        return reply.code(413).send({ error: 'Vidéo trop lourde (max 500 Mo).' });
      }
    } else {
      // Ni R2 ni dev : aucun stockage vidéo disponible. On refuse proprement
      // (le client masque déjà le bouton — ceci est une défense en profondeur).
      return reply.code(503).send({ error: 'Upload vidéo désactivé (stockage non configuré).' });
    }

    const video = await db.video.create({
      data: {
        id: videoId,
        filePath,
        mimeType,
        filename,
        size: bytesWritten,
        authorId: session.user.id,
        entryId: entryId ?? null,
      },
      select: { id: true },
    });

    return reply.code(201).send({ id: video.id, src: `/videos/${video.id}` });
  });

  // Serving vidéo — auth cookie, range requests pour le seeking
  app.get('/videos/:id', async (req, reply) => {
    const token = getSessionCookie(req);
    if (!token) return reply.code(401).send({ error: 'Unauthorized' });
    const session = await validateSession(token);
    if (!session) return reply.code(401).send({ error: 'Unauthorized' });

    const { id } = req.params as { id: string };
    const video = await db.video.findUnique({
      where: { id },
      select: { data: true, filePath: true, mimeType: true, filename: true, authorId: true, directMessageId: true },
    });
    if (!video) return reply.code(404).send({ error: 'Not found' });

    const allowedAuthorId = session.user.role === 'OWNER'
      ? session.user.id
      : session.user.invitedById;
    let allowed = video.authorId === allowedAuthorId;
    if (!allowed && video.directMessageId) {
      const msg = await db.directMessage.findUnique({
        where: { id: video.directMessageId },
        select: { senderId: true, recipientId: true },
      });
      allowed = !!msg && (msg.senderId === session.user.id || msg.recipientId === session.user.id);
    }
    if (!allowed) return reply.code(403).send({ error: 'Forbidden' });

    // DM legacy : base64 en mémoire, sans range support
    if (video.data && !video.filePath) {
      const buf = Buffer.from(video.data, 'base64');
      return reply
        .header('Content-Type', video.mimeType)
        .header('Content-Disposition', `inline; filename="${encodeURIComponent(video.filename)}"`)
        .header('Cache-Control', 'private, max-age=31536000, immutable')
        .send(buf);
    }

    // Vidéo sur fichier (disque local ou R2)
    if (!video.filePath) return reply.code(404).send({ error: 'Not found' });

    if (isR2Configured()) {
      // Prod : redirect vers une URL présignée R2 (expire dans 1h)
      // R2 gère nativement les Range requests → seeking vidéo fonctionnel
      const url = await r2PresignedUrl(video.filePath);
      return reply.redirect(url, 302);
    }

    // Dev : stream depuis le disque avec support Range
    const absolutePath = path.join(__dirname, '..', video.filePath);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(absolutePath);
    } catch {
      return reply.code(404).send({ error: 'Not found' });
    }

    const fileSize = stat.size;
    const rangeHeader = req.headers['range'];

    reply
      .header('Content-Type', video.mimeType)
      .header('Content-Disposition', `inline; filename="${encodeURIComponent(video.filename)}"`)
      .header('Accept-Ranges', 'bytes')
      .header('Cache-Control', 'private, max-age=31536000, immutable');

    if (rangeHeader) {
      const [startStr, endStr] = rangeHeader.replace('bytes=', '').split('-');
      const start = parseInt(startStr ?? '0', 10);
      const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      reply
        .code(206)
        .header('Content-Range', `bytes ${start}-${end}/${fileSize}`)
        .header('Content-Length', String(chunkSize));
      return reply.send(fs.createReadStream(absolutePath, { start, end }));
    }

    reply.header('Content-Length', String(fileSize));
    return reply.send(fs.createReadStream(absolutePath));
  });

  // ── SSE : flux temps réel (notifications, commentaires, entrées…) ──────────
  // Évite le polling : le client ouvre un EventSource et reçoit un `kind` à
  // chaque changement le concernant, puis recharge la donnée via tRPC.
  app.get('/events', { config: { rateLimit: false } }, async (req, reply) => {
    const token = getSessionCookie(req);
    if (!token) return reply.code(401).send({ error: 'Unauthorized' });
    const session = await validateSession(token);
    if (!session) return reply.code(401).send({ error: 'Unauthorized' });

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // désactive le buffering proxy
    });
    // Écriture sûre : ne tente rien si la connexion est déjà fermée.
    const write = (chunk: string) => {
      if (!reply.raw.writableEnded) {
        try { reply.raw.write(chunk); } catch { /* connexion coupée */ }
      }
    };
    write(': connected\n\n');

    const unsubscribe = subscribeUser(session.user.id, (event) => write(`data: ${JSON.stringify(event)}\n\n`));
    // Heartbeat — empêche les proxies (Railway) de fermer une connexion idle.
    const heartbeat = setInterval(() => write(': ping\n\n'), 45_000);

    // ── Présence : on est "en ligne" tant que cette connexion SSE est ouverte.
    // Le cercle (owner + ses confidents) est notifié via `presence` lors de
    // chaque transition 0↔1 onglet, pour mettre à jour les indicateurs UI.
    const justWentOnline = markUserOnline(session.user.id);
    if (justWentOnline) {
      const ownerId = session.user.role === 'OWNER' ? session.user.id : (session.user.invitedById ?? null);
      if (ownerId) emitToOwnerCircle(db, ownerId, 'presence').catch(() => null);
    }

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      const justWentOffline = markUserOffline(session.user.id);
      if (justWentOffline) {
        const ownerId = session.user.role === 'OWNER' ? session.user.id : (session.user.invitedById ?? null);
        if (ownerId) emitToOwnerCircle(db, ownerId, 'presence').catch(() => null);
      }
    });
  });

  // ── API key auth helper ────────────────────────────────────────────────────
  const { createHash: _hash } = await import('node:crypto');

  async function resolveApiOwner(req: { headers: Record<string, string | string[] | undefined> }) {
    const authHeader = req.headers['authorization'];
    const bearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;
    if (!bearer) return null;
    const hash = _hash('sha256').update(bearer).digest('hex');
    return db.user.findUnique({ where: { apiKeyHash: hash }, select: { id: true } });
  }

  const VALID_TASK_STATUSES = ['OPEN','IN_PROGRESS','DONE','LOCAL_DONE','TO_TEST','DEPLOYED','MIGRATED','CANCELLED','SCHEDULED'] as const;

  const TASK_SELECT = {
    id: true, title: true, status: true, taskType: true, priority: true,
    category: true, notes: true, dueDate: true, createdAt: true, updatedAt: true,
  } as const;

  // ── GET /api/tasks ─────────────────────────────────────────────────────────
  app.get('/api/tasks', async (req, reply) => {
    const owner = await resolveApiOwner(req);
    if (!owner) { reply.code(401); return { error: 'Unauthorized' }; }

    const tasks = await db.task.findMany({
      where: { deletedAt: null, ownerId: owner.id },
      orderBy: [{ category: 'asc' }, { createdAt: 'asc' }],
      select: TASK_SELECT,
    });

    const grouped = tasks.reduce<Record<string, typeof tasks>>((acc, t) => {
      const key = t.category ?? '(sans catégorie)';
      if (!acc[key]) acc[key] = [];
      acc[key].push(t);
      return acc;
    }, {});

    return {
      summary: {
        total: tasks.length,
        byStatus: tasks.reduce<Record<string, number>>((acc, t) => { acc[t.status] = (acc[t.status] ?? 0) + 1; return acc; }, {}),
        byType: tasks.reduce<Record<string, number>>((acc, t) => { const k = t.taskType ?? '(sans type)'; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {}),
      },
      grouped,
    };
  });

  // ── POST /api/tasks ────────────────────────────────────────────────────────
  app.post('/api/tasks', async (req, reply) => {
    const owner = await resolveApiOwner(req);
    if (!owner) { reply.code(401); return { error: 'Unauthorized' }; }

    const b = req.body as Record<string, unknown>;
    if (!b?.title || typeof b.title !== 'string' || !b.title.trim()) {
      reply.code(400); return { error: 'title is required' };
    }

    const task = await db.task.create({
      data: {
        id: crypto.randomUUID(),
        ownerId: owner.id,
        title: (b.title as string).trim(),
        notes: typeof b.notes === 'string' ? b.notes.trim() || null : null,
        status: (typeof b.status === 'string' ? b.status : 'OPEN') as never,
        dueDate: typeof b.dueDate === 'string' ? new Date(b.dueDate) : null,
        completedAt: null,
        category: typeof b.category === 'string' ? b.category.trim() || null : null,
        taskType: typeof b.taskType === 'string' ? b.taskType.trim() || null : null,
        priority: typeof b.priority === 'string' && ['HIGH', 'MEDIUM', 'LOW'].includes(b.priority) ? b.priority : null,
        createdBy: owner.id,
        version: 1,
        deletedAt: null,
      },
      select: TASK_SELECT,
    });

    sendPushToUser(db, owner.id, {
      title: '📋 Nouvelle tâche créée',
      body: task.title.length > 60 ? task.title.slice(0, 57) + '…' : task.title,
      url: '/tasks',
    }, { respectPref: 'notifyOwnerTaskChanges', kind: 'task' }).catch(() => null);

    reply.code(201);
    return task;
  });

  // ── PATCH /api/tasks/:id ───────────────────────────────────────────────────
  app.patch('/api/tasks/:id', async (req, reply) => {
    const owner = await resolveApiOwner(req);
    if (!owner) { reply.code(401); return { error: 'Unauthorized' }; }

    const { id } = req.params as { id: string };
    const existing = await db.task.findFirst({ where: { id, ownerId: owner.id, deletedAt: null } });
    if (!existing) { reply.code(404); return { error: 'Not found' }; }

    const b = req.body as Record<string, unknown>;
    const data: Record<string, unknown> = { version: { increment: 1 } };
    if (typeof b.title === 'string') data.title = b.title.trim();
    if (typeof b.notes === 'string') data.notes = b.notes.trim() || null;
    if ('notes' in b && b.notes === null) data.notes = null;
    if (typeof b.status === 'string' && (VALID_TASK_STATUSES as readonly string[]).includes(b.status)) data.status = b.status;
    if (typeof b.category === 'string') data.category = b.category.trim() || null;
    if ('category' in b && b.category === null) data.category = null;
    if (typeof b.taskType === 'string') data.taskType = b.taskType.trim() || null;
    if ('taskType' in b && b.taskType === null) data.taskType = null;
    if (typeof b.priority === 'string' && ['HIGH', 'MEDIUM', 'LOW'].includes(b.priority)) data.priority = b.priority;
    if ('priority' in b && b.priority === null) data.priority = null;
    if (typeof b.dueDate === 'string') data.dueDate = new Date(b.dueDate);
    if ('dueDate' in b && b.dueDate === null) data.dueDate = null;

    const task = await db.task.update({ where: { id }, data: data as never, select: TASK_SELECT });

    // Notif in-app
    const meta: Record<string, unknown> = {};
    if (typeof b.status === 'string' && b.status !== existing.status) {
      meta.status = { from: existing.status, to: b.status };
    }
    if ('priority' in b && b.priority !== existing.priority) {
      meta.priority = { from: existing.priority, to: b.priority ?? null };
    }
    db.notification.create({
      data: {
        id: crypto.randomUUID(),
        userId: owner.id,
        type: 'TASK_UPDATED',
        taskId: id,
        meta: Object.keys(meta).length > 0 ? (meta as import('@prisma/client').Prisma.InputJsonValue) : undefined,
      },
    }).catch(() => null);

    sendPushToUser(db, owner.id, {
      title: '📋 Tâche mise à jour',
      body: task.title.length > 60 ? task.title.slice(0, 57) + '…' : task.title,
      url: '/tasks',
    }, { respectPref: 'notifyOwnerTaskChanges', kind: 'task' }).catch(() => null);

    return task;
  });

  // ── Entries API ────────────────────────────────────────────────────────────

  const ENTRY_SELECT = {
    id: true, date: true, section: true, title: true, contentMd: true,
    noteType: true, mood: true, sleepHours: true, weather: true, timeLabel: true,
    mediaMeta: true, font: true, fontSize: true, visibility: true,
    isDraft: true, isForConfidant: true, links: true, commentsLocked: true,
    version: true, createdAt: true, updatedAt: true, deletedAt: true,
    tags: { select: { tag: { select: { name: true } } } },
  } as const;

  function formatEntry(e: Awaited<ReturnType<typeof db.entry.findFirst>> & { tags?: { tag: { name: string } }[] }) {
    if (!e) return null;
    return { ...e, tagNames: (e.tags ?? []).map((t) => t.tag.name), tags: undefined };
  }

  // GET /api/entries
  app.get('/api/entries', async (req, reply) => {
    const owner = await resolveApiOwner(req);
    if (!owner) { reply.code(401); return { error: 'Unauthorized' }; }

    const q = req.query as Record<string, string>;
    // collectionOnly exclu : l'API REST expose les notes du journal, pas les items de Collection.
    const where: Record<string, unknown> = { authorId: owner.id, deletedAt: null, collectionOnly: false };
    if (q.from)     where.date = { ...(where.date as object ?? {}), gte: new Date(q.from) };
    if (q.to)       where.date = { ...(where.date as object ?? {}), lte: new Date(q.to) };
    if (q.noteType) where.noteType = q.noteType;
    if (q.isDraft !== undefined) where.isDraft = q.isDraft === 'true';
    if (q.visibility) where.visibility = q.visibility;
    const limit = Math.min(parseInt(q.limit ?? '50', 10) || 50, 200);
    const offset = parseInt(q.offset ?? '0', 10) || 0;

    const [entries, total] = await Promise.all([
      db.entry.findMany({ where: where as never, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: limit, skip: offset, select: ENTRY_SELECT }),
      db.entry.count({ where: where as never }),
    ]);

    return { total, limit, offset, entries: entries.map((e) => formatEntry(e as never)) };
  });

  // GET /api/entries/:id
  app.get('/api/entries/:id', async (req, reply) => {
    const owner = await resolveApiOwner(req);
    if (!owner) { reply.code(401); return { error: 'Unauthorized' }; }

    const { id } = req.params as { id: string };
    const entry = await db.entry.findFirst({ where: { id, authorId: owner.id, deletedAt: null }, select: ENTRY_SELECT });
    if (!entry) { reply.code(404); return { error: 'Not found' }; }
    return formatEntry(entry as never);
  });

  // Valide + normalise le `mediaMeta` reçu via l'API REST.
  //  - Types non-QUIZZ : passthrough (comportement historique inchangé).
  //  - QUIZZ : on auto-génère les `id` de questions manquants (DX : le client
  //    n'a pas à les gérer) puis on valide tout le mediaMeta avec le schéma
  //    Zod partagé — un quizz mal formé est refusé (400) plutôt que stocké
  //    cassé, ce qui protège la correction côté serveur et la redaction confident.
  function normalizeApiMediaMeta(noteTypeVal: string, raw: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
    if (raw == null) return { ok: true, value: undefined };
    if (typeof raw !== 'object') return { ok: false, error: 'mediaMeta doit être un objet' };
    if (noteTypeVal !== 'QUIZZ') return { ok: true, value: raw };
    const mm: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
    if (Array.isArray(mm.quizQuestions)) {
      mm.quizQuestions = mm.quizQuestions.map((q) => {
        const qq: Record<string, unknown> = (q && typeof q === 'object') ? { ...(q as Record<string, unknown>) } : {};
        if (typeof qq.id !== 'string' || !qq.id) qq.id = crypto.randomUUID();
        return qq;
      });
    }
    const parsed = mediaMetaSchema.safeParse(mm);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return { ok: false, error: `mediaMeta invalide${first ? ` : ${first.path.join('.') || '(racine)'} — ${first.message}` : ''}` };
    }
    return { ok: true, value: parsed.data };
  }

  // POST /api/entries
  app.post('/api/entries', async (req, reply) => {
    const owner = await resolveApiOwner(req);
    if (!owner) { reply.code(401); return { error: 'Unauthorized' }; }

    const b = req.body as Record<string, unknown>;
    if (!b?.date || typeof b.date !== 'string') { reply.code(400); return { error: 'date (YYYY-MM-DD) is required' }; }
    if (typeof b.contentMd !== 'string') { reply.code(400); return { error: 'contentMd is required' }; }

    const noteTypeVal = typeof b.noteType === 'string' ? b.noteType : 'JOURNAL';
    if (!noteTypeSchema.safeParse(noteTypeVal).success) {
      reply.code(400); return { error: `noteType invalide. Valeurs acceptées : ${noteTypeSchema.options.join(', ')}` };
    }
    const mmResult = normalizeApiMediaMeta(noteTypeVal, b.mediaMeta);
    if (!mmResult.ok) { reply.code(400); return { error: mmResult.error }; }

    const tagNames = Array.isArray(b.tagNames) ? (b.tagNames as string[]) : [];
    const id = crypto.randomUUID();

    const entry = await db.entry.create({
      data: {
        id,
        authorId: owner.id,
        date: new Date(b.date as string),
        section: (typeof b.section === 'string' ? b.section : null) as never,
        title: typeof b.title === 'string' ? b.title.trim() || null : null,
        contentMd: b.contentMd as string,
        noteType: noteTypeVal as never,
        mood: typeof b.mood === 'string' ? b.mood || null : null,
        sleepHours: typeof b.sleepHours === 'number' ? b.sleepHours : null,
        weather: typeof b.weather === 'string' ? b.weather || null : null,
        timeLabel: typeof b.timeLabel === 'string' ? b.timeLabel || null : null,
        mediaMeta: mmResult.value !== undefined ? (mmResult.value as never) : undefined,
        font: typeof b.font === 'string' ? b.font || null : null,
        fontSize: typeof b.fontSize === 'string' ? b.fontSize || null : null,
        visibility: (typeof b.visibility === 'string' ? b.visibility : 'PRIVATE') as never,
        isDraft: typeof b.isDraft === 'boolean' ? b.isDraft : false,
        isForConfidant: typeof b.isForConfidant === 'boolean' ? b.isForConfidant : false,
        commentsLocked: false,
        version: 1,
      },
      select: ENTRY_SELECT,
    });

    if (tagNames.length > 0) {
      const tags = await Promise.all(
        tagNames.map((name) => db.tag.upsert({
          where: { ownerId_name_kind: { ownerId: owner.id, name, kind: 'OTHER' } },
          create: { ownerId: owner.id, name, kind: 'OTHER' },
          update: {},
          select: { id: true },
        }))
      );
      await db.entryTag.createMany({ data: tags.map((t) => ({ entryId: id, tagId: t.id })), skipDuplicates: true });
    }

    const full = await db.entry.findUniqueOrThrow({ where: { id }, select: ENTRY_SELECT });
    reply.code(201);
    return formatEntry(full as never);
  });

  // PATCH /api/entries/:id
  app.patch('/api/entries/:id', async (req, reply) => {
    const owner = await resolveApiOwner(req);
    if (!owner) { reply.code(401); return { error: 'Unauthorized' }; }

    const { id } = req.params as { id: string };
    const existing = await db.entry.findFirst({ where: { id, authorId: owner.id, deletedAt: null } });
    if (!existing) { reply.code(404); return { error: 'Not found' }; }

    const b = req.body as Record<string, unknown>;

    if (typeof b.noteType === 'string' && !noteTypeSchema.safeParse(b.noteType).success) {
      reply.code(400); return { error: `noteType invalide. Valeurs acceptées : ${noteTypeSchema.options.join(', ')}` };
    }
    // mediaMeta : validé/normalisé selon le type effectif (nouveau si fourni, sinon l'existant).
    let mediaMetaPatch: unknown | undefined; // undefined = ne pas toucher ; null = effacer
    if ('mediaMeta' in b) {
      if (b.mediaMeta === null) {
        mediaMetaPatch = null;
      } else {
        const effectiveType = typeof b.noteType === 'string' ? b.noteType : existing.noteType;
        const mmResult = normalizeApiMediaMeta(effectiveType, b.mediaMeta);
        if (!mmResult.ok) { reply.code(400); return { error: mmResult.error }; }
        mediaMetaPatch = mmResult.value ?? null;
      }
    }

    if (b.contentMd !== undefined && typeof b.contentMd === 'string' && b.contentMd !== existing.contentMd) {
      await db.entryRevision.create({ data: { entryId: id, contentMd: existing.contentMd, authorId: owner.id, reason: 'api_patch' } });
    }

    const data: Record<string, unknown> = { version: { increment: 1 } };
    if (typeof b.title === 'string') data.title = b.title.trim() || null;
    if ('title' in b && b.title === null) data.title = null;
    if (typeof b.contentMd === 'string') data.contentMd = b.contentMd;
    if (typeof b.section === 'string') data.section = b.section;
    if ('section' in b && b.section === null) data.section = null;
    if (typeof b.noteType === 'string') data.noteType = b.noteType;
    if (typeof b.mood === 'string') data.mood = b.mood || null;
    if ('mood' in b && b.mood === null) data.mood = null;
    if (typeof b.sleepHours === 'number') data.sleepHours = b.sleepHours;
    if ('sleepHours' in b && b.sleepHours === null) data.sleepHours = null;
    if (typeof b.weather === 'string') data.weather = b.weather || null;
    if ('weather' in b && b.weather === null) data.weather = null;
    if (typeof b.visibility === 'string') data.visibility = b.visibility;
    if (typeof b.isDraft === 'boolean') data.isDraft = b.isDraft;
    if (typeof b.isForConfidant === 'boolean') data.isForConfidant = b.isForConfidant;
    if (typeof b.font === 'string') data.font = b.font || null;
    if (mediaMetaPatch !== undefined) data.mediaMeta = mediaMetaPatch;

    await db.entry.update({ where: { id }, data: data as never });

    if (Array.isArray(b.tagNames)) {
      const tagNames = b.tagNames as string[];
      const tags = tagNames.length > 0
        ? await Promise.all(tagNames.map((name) => db.tag.upsert({
            where: { ownerId_name_kind: { ownerId: owner.id, name, kind: 'OTHER' } },
            create: { ownerId: owner.id, name, kind: 'OTHER' },
            update: {},
            select: { id: true },
          })))
        : [];
      await db.entryTag.deleteMany({ where: { entryId: id } });
      if (tags.length > 0) await db.entryTag.createMany({ data: tags.map((t) => ({ entryId: id, tagId: t.id })), skipDuplicates: true });
    }

    const full = await db.entry.findUniqueOrThrow({ where: { id }, select: ENTRY_SELECT });
    return formatEntry(full as never);
  });

  // ── GET /api/tags ──────────────────────────────────────────────────────────
  app.get('/api/tags', async (req, reply) => {
    const owner = await resolveApiOwner(req);
    if (!owner) { reply.code(401); return { error: 'Unauthorized' }; }

    const q = req.query as Record<string, string>;
    const where: Record<string, unknown> = { ownerId: owner.id };
    if (q.q) where.name = { contains: q.q, mode: 'insensitive' };

    const tags = await db.tag.findMany({
      where: where as never,
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, kind: true, color: true,
        _count: { select: { entries: true } },
      },
    });

    return tags.map(({ _count, ...t }) => ({ ...t, entryCount: _count.entries }));
  });

  // ── GET /api/export — ZIP streaming (owner only, cookie session) ──────────
  app.get('/api/export', async (req, reply) => {
    // Auth par cookie de session (pas API key — owner uniquement)
    const token = getSessionCookie(req);
    if (!token) return reply.code(401).send({ error: 'Unauthorized' });
    const session = await validateSession(token);
    if (!session || session.user.role !== 'OWNER') {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    const ownerId = session.user.id;

    // Récupérer toutes les entrées non supprimées + ratings (favoris/à oublier)
    // pour les inclure dans le frontmatter — archive complète des marquages.
    const entries = await db.entry.findMany({
      where: { authorId: ownerId, deletedAt: null },
      include: {
        tags: { include: { tag: true } },
        ratings: {
          select: {
            userId: true,
            value: true,
            user: { select: { displayName: true, email: true } },
          },
        },
      },
      orderBy: { date: 'asc' },
    });

    // Récupérer images et audios
    const images = await db.image.findMany({ where: { authorId: ownerId } });
    const audios = await db.audio.findMany({ where: { authorId: ownerId } });

    // Manifest index
    const manifest: Record<string, { date: string; noteType: string; file: string; images: string[]; audios: string[] }> = {};

    reply.raw.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="carnet-export-${new Date().toISOString().slice(0, 10)}.zip"`,
      'Cache-Control': 'no-store',
    });

    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.pipe(reply.raw);

    // ── Entrées en Markdown ─────────────────────────────────────────────────
    for (const entry of entries) {
      const dateStr = entry.date.toISOString().slice(0, 10);
      const filename = `entries/${dateStr}_${entry.id}.md`;

      const mediaMeta = entry.mediaMeta as Record<string, unknown> | null;
      const tags = entry.tags.map((t) => t.tag.name);

      // Notations favoris / à oublier — incluses dans le frontmatter avec
      // displayName de chaque votant pour archivage complet. Le owner reçoit
      // toutes les ratings via cette query (pas de filtre par rôle ici).
      const ratingsLine = entry.ratings.length > 0
        ? `ratings:\n${entry.ratings.map((r) => {
            const name = (r.user.displayName ?? r.user.email.split('@')[0] ?? '—').replace(/"/g, '\\"');
            return `  - { user: "${name}", value: ${r.value} }`;
          }).join('\n')}`
        : null;

      const frontmatter = [
        '---',
        `id: ${entry.id}`,
        `date: ${dateStr}`,
        `noteType: ${entry.noteType}`,
        entry.title       ? `title: "${entry.title.replace(/"/g, '\\"')}"` : null,
        entry.mood        ? `mood: "${entry.mood.replace(/"/g, '\\"')}"` : null,
        entry.section     ? `section: ${entry.section}` : null,
        entry.timeLabel   ? `timeLabel: ${entry.timeLabel}` : null,
        entry.sleepHours  != null ? `sleepHours: ${entry.sleepHours}` : null,
        entry.weather     ? `weather: "${entry.weather}"` : null,
        mediaMeta?.rating ? `rating: ${mediaMeta.rating}` : null,
        mediaMeta?.subject ? `subject: "${String(mediaMeta.subject).replace(/"/g, '\\"')}"` : null,
        mediaMeta?.creator ? `creator: "${String(mediaMeta.creator).replace(/"/g, '\\"')}"` : null,
        entry.visibility  !== 'PRIVATE' ? `visibility: ${entry.visibility}` : null,
        entry.isDraft     ? `draft: true` : null,
        tags.length > 0   ? `tags: [${tags.map((t) => `"${t}"`).join(', ')}]` : null,
        ratingsLine,
        '---',
        '',
      ].filter(Boolean).join('\n');

      const content = frontmatter + entry.contentMd;
      archive.append(content, { name: filename });

      manifest[entry.id] = { date: dateStr, noteType: entry.noteType, file: filename, images: [], audios: [] };
    }

    // ── Images ──────────────────────────────────────────────────────────────
    for (const img of images) {
      const ext = img.mimeType.split('/')[1] ?? 'bin';
      const filename = `images/${img.id}.${ext}`;
      const buf = Buffer.from(img.data, 'base64');
      archive.append(buf, { name: filename });
      if (img.entryId && manifest[img.entryId]) {
        manifest[img.entryId]!.images.push(filename);
      }
    }

    // ── Audios ──────────────────────────────────────────────────────────────
    for (const audio of audios) {
      const ext = audio.mimeType.split('/')[1] ?? 'bin';
      const filename = `audios/${audio.id}.${ext}`;
      const buf = Buffer.from(audio.data, 'base64');
      archive.append(buf, { name: filename });
      if (audio.entryId && manifest[audio.entryId]) {
        manifest[audio.entryId]!.audios.push(filename);
      }
    }

    // ── Manifest ────────────────────────────────────────────────────────────
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

    await archive.finalize();
  });

  // ── GET /api/stats ─────────────────────────────────────────────────────────
  app.get('/api/stats', async (req, reply) => {
    const owner = await resolveApiOwner(req);
    if (!owner) { reply.code(401); return { error: 'Unauthorized' }; }
    return computeStatsForAuthor(owner.id, db);
  });

  app.get('/health', async (_req, reply) => {
    reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    return { ok: true, env: env.NODE_ENV, startedAt: SERVER_STARTED_AT, deploymentId: process.env['RAILWAY_DEPLOYMENT_ID'] ?? null };
  });

  // En prod : servir le build Vite et fallback SPA
  if (isProd) {
    const webDist = path.resolve(__dirname, '../../web/dist');

    // Hook appliqué sur toutes les réponses statiques
    app.addHook('onSend', (_req, reply, payload, done) => {
      const url = _req.url.split('?')[0] ?? '';
      const isHtml = url === '/' || url === '/index.html' || (!url.includes('.') && !url.startsWith('/trpc') && !url.startsWith('/images') && !url.startsWith('/audios') && !url.startsWith('/api/') && url !== '/health');
      const isSw   = url === '/sw.js';
      if (isHtml || isSw) {
        reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
        reply.header('Pragma', 'no-cache');
        reply.header('Expires', '0');
      } else if (url.startsWith('/assets/')) {
        reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      }
      done(null, payload);
    });

    await app.register(staticPlugin, { root: webDist, wildcard: false });

    app.setNotFoundHandler((_req, reply) => reply.sendFile('index.html', webDist));
  }

  await app.register(fastifyTRPCPlugin<AppRouter>, {
    prefix: '/trpc',
    trpcOptions: {
      router: appRouter,
      createContext,
      onError({ path, error }) {
        // Les erreurs « attendues » sont des erreurs *client* (utilisateur non
        // connecté, ressource absente, validation refusée…), pas des pannes
        // serveur : on les logue en `warn` pour ne pas polluer le flux d'erreurs.
        // Cas courant : `directMessages.*` lancées sur l'écran de login AVANT
        // authentification → UNAUTHORIZED parfaitement normal. `error` reste
        // réservé aux vraies erreurs serveur (INTERNAL_SERVER_ERROR…).
        const EXPECTED = new Set([
          'UNAUTHORIZED',
          'FORBIDDEN',
          'NOT_FOUND',
          'BAD_REQUEST',
          'CONFLICT',
          'TOO_MANY_REQUESTS',
        ]);
        const payload = { path, code: error.code, message: error.message };
        if (EXPECTED.has(error.code)) app.log.warn(payload, 'tRPC error (client)');
        else app.log.error(payload, 'tRPC error');
      },
      // Pour les requêtes batchées : si au moins une route a réussi, on force 200
      // (les erreurs individuelles restent dans le body). Évite qu'un seul NOT_FOUND
      // ne fasse passer tout le batch en 404 et casse `auth.me` côté client.
      responseMeta({ data, errors }) {
        if (data.length > 1 && errors.length < data.length) return { status: 200 };
        return {};
      },
    } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
  });

  // Cron de rappel quotidien — toutes les minutes, on vérifie si c'est l'heure de quelqu'un
  if (VAPID_PUBLIC) {
    cron.schedule('* * * * *', async () => {
      const now = new Date();
      // Les heures de rappel (`notifReminderTime`) sont saisies par l'utilisateur
      // en heure locale (Europe/Paris). Le serveur tourne en UTC : on compare donc
      // explicitement à l'heure de Paris, sinon les rappels sont décalés (UTC+1/+2).
      const hhmm = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Paris',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(now);
      const users = await db.user.findMany({
        where: { notifEnabled: true, notifReminderTime: hhmm },
        select: { id: true, role: true, pushSubscriptions: true },
      });
      for (const user of users) {
        const unread = await db.notification.count({
          where: { userId: user.id, read: false, archived: false },
        });
        // Les guests ne reçoivent pas de rappel d'écriture — seulement les commentaires
        if (user.role === 'GUEST' && unread === 0) continue;
        const payload = JSON.stringify({
          title: 'Journal',
          body: unread > 0
            ? `${unread} commentaire${unread > 1 ? 's' : ''} en attente`
            : 'C\'est l\'heure d\'écrire dans ton journal ✦',
          url: unread > 0 ? '/fil' : '/',
          timestamp: now.getTime(),
        });
        for (const sub of user.pushSubscriptions) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload,
            );
          } catch {
            // Subscription expirée — on la supprime
            await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => null);
          }
        }
      }

      // ── "Il y a un an" : notif à 9h00 pour les owners ────────────────────
      if (hhmm === '09:00') {
        const dayNow = now;
        const month = dayNow.getMonth() + 1;
        const day = dayNow.getDate();
        const currentYear = dayNow.getFullYear();

        // Trouver les owners avec notif activée
        const owners = await db.user.findMany({
          where: { notifEnabled: true, role: 'OWNER' },
          select: { id: true, pushSubscriptions: true },
        });

        for (const owner of owners) {
          if (owner.pushSubscriptions.length === 0) continue;

          // Cherche des entrées la semaine passée, le mois passé, ou il y a un an
          const weekDate = new Date(dayNow); weekDate.setDate(weekDate.getDate() - 7);
          const weekStr = weekDate.toISOString().slice(0, 10);

          const monthDate = new Date(dayNow); monthDate.setMonth(monthDate.getMonth() - 1);
          const monthStr = monthDate.toISOString().slice(0, 10);

          // Souvenirs : on exclut uniquement les notes que **l'owner lui-même**
          // a marquées « à oublier ». Les notations des confidents n'influencent
          // pas la sélection des souvenirs — c'est une catégorisation perso.
          const countResult = await db.$queryRaw<Array<{ count: bigint }>>`
            SELECT COUNT(*) as count FROM "Entry" e
            WHERE e."authorId" = ${owner.id}
              AND e."deletedAt" IS NULL
              AND (
                e.date = ${weekStr}::date
                OR e.date = ${monthStr}::date
                OR (EXTRACT(MONTH FROM e.date) = ${month} AND EXTRACT(DAY FROM e.date) = ${day} AND EXTRACT(YEAR FROM e.date) < ${currentYear})
              )
              AND NOT EXISTS (
                SELECT 1 FROM "EntryRating" r
                WHERE r."entryId" = e.id
                  AND r."userId" = ${owner.id}
                  AND r.value = 'LOW'
              )
          `;
          const total = Number(countResult[0]?.count ?? 0);
          if (total === 0) continue;

          const body = total === 1
            ? 'Un souvenir t\'attend dans ton journal ✦'
            : `${total} souvenirs t\'attendent dans ton journal ✦`;

          const payload = JSON.stringify({ title: 'Souvenir', body, url: '/', timestamp: now.getTime() });

          for (const sub of owner.pushSubscriptions) {
            try {
              await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                payload,
              );
            } catch {
              await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => null);
            }
          }
        }
      }

      // ── Rappel du suivi quotidien : notifier l'owner SI son suivi est vide ───
      // Distinct du rappel d'écriture (notifReminderTime) : on ne pousse que si
      // aucun DailyLog n'existe encore pour aujourd'hui (dans le fuseau de
      // l'owner). Heure saisie en local (Europe/Paris, comme l'autre rappel).
      const dailyReminderOwners = await db.user.findMany({
        where: { notifEnabled: true, role: 'OWNER', revokedAt: null, dailyLogReminderAt: hhmm },
        select: { id: true, timezone: true, pushSubscriptions: true },
      });
      for (const owner of dailyReminderOwners) {
        if (owner.pushSubscriptions.length === 0) continue;
        // Date « aujourd'hui » dans le fuseau de l'owner (en-CA → YYYY-MM-DD).
        const todayStr = new Intl.DateTimeFormat('en-CA', {
          timeZone: owner.timezone ?? 'Europe/Paris',
        }).format(now);
        // Les DailyLog sont stockés à minuit UTC (cf. dailyLog.list / sync).
        const existing = await db.dailyLog.findUnique({
          where: { ownerId_date: { ownerId: owner.id, date: new Date(todayStr + 'T00:00:00.000Z') } },
          select: { id: true, deletedAt: true },
        });
        if (existing && existing.deletedAt === null) continue; // déjà rempli aujourd'hui
        const payload = JSON.stringify({
          title: 'Suivi du jour',
          body: 'Tu n\'as pas encore noté ton ressenti du jour 🌙',
          url: '/',
          timestamp: now.getTime(),
        });
        for (const sub of owner.pushSubscriptions) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload,
            );
          } catch {
            await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => null);
          }
        }
      }

      // ── Capsules temporelles : notifier owner + confidents quand unlockAt expire ─
      // Détecte chaque entry avec un unlockAt passé ET dont la notif n'a jamais
      // été envoyée. Marque `capsuleNotifSentAt` après envoi pour éviter le double
      // déclenchement. Owner + chaque guest avec `canRead` reçoivent une notif
      // in-app + push (respectant `notifyOnCapsuleUnlock`).
      const dueCapsules = await db.entry.findMany({
        where: {
          deletedAt: null,
          isDraft: false,
          unlockAt: { not: null, lte: now },
          capsuleNotifSentAt: null,
        },
        select: {
          id: true, authorId: true, title: true, date: true,
          visibility: true, isSecret: true,
          shares: { select: { receiverId: true, canComment: true } },
          author: { select: { displayName: true, email: true } },
        },
      });
      for (const e of dueCapsules) {
        try {
          const ownerName = e.author.displayName ?? e.author.email.split('@')[0] ?? 'L\'auteur';
          const titleText = e.title || `Capsule du ${e.date}`;
          const bodyOwner = `Ta capsule « ${titleText} » s'est ouverte ✦`;
          const bodyGuest = `${ownerName} a ouvert une capsule : « ${titleText} » ✦`;

          // 1. Owner
          await db.notification.create({
            data: {
              userId: e.authorId,
              type: 'CAPSULE_UNLOCKED',
              entryId: e.id,
            },
          });
          await sendPushToUser(db, e.authorId, {
            title: 'Capsule ouverte',
            body: bodyOwner,
            url: `/?entryId=${e.id}`,
          }, { respectPref: 'notifyOnCapsuleUnlock', kind: 'capsule' });

          // 2. Confidents qui peuvent lire (visibility != PRIVATE et non-secret)
          //    On utilise canRead pour la cohérence avec le reste du système.
          if (!e.isSecret && e.visibility !== 'PRIVATE') {
            const guests = await db.user.findMany({
              where: { role: 'GUEST', revokedAt: null },
              select: { id: true, guestAccess: true, guestCanComment: true },
            });
            for (const g of guests) {
              const allowed = canRead(
                { id: g.id, role: 'GUEST', guestAccess: g.guestAccess, guestCanComment: g.guestCanComment },
                { authorId: e.authorId, visibility: e.visibility, shares: e.shares, isSecret: e.isSecret },
              );
              if (!allowed) continue;
              await db.notification.create({
                data: {
                  userId: g.id,
                  type: 'CAPSULE_UNLOCKED',
                  entryId: e.id,
                },
              });
              await sendPushToUser(db, g.id, {
                title: 'Capsule ouverte',
                body: bodyGuest,
                url: `/?entryId=${e.id}`,
              }, { respectPref: 'notifyOnCapsuleUnlock', kind: 'capsule' });
            }
          }

          await db.entry.update({
            where: { id: e.id },
            data: { capsuleNotifSentAt: new Date() },
          });
        } catch (err) {
          app.log.error({ err, entryId: e.id }, '[cron] capsuleUnlock failed');
        }
      }

      // ── Publication différée : révéler les notes dont le minuteur expire ─────
      // Pour chaque entry où hideUntilAt ≤ now et qu'on n'a pas encore notifiée,
      // on envoie la notif "nouvelle publication" et on marque hiddenNotifSentAt.
      // Les guests reçoivent ainsi un signal **au moment où la note devient visible**,
      // pas au moment où l'owner a cliqué "Publier".
      const dueReveal = await db.entry.findMany({
        where: {
          deletedAt: null,
          isDraft: false,
          isSecret: false,
          hideUntilAt: { not: null, lte: now },
          hiddenNotifSentAt: null,
        },
        select: { id: true, authorId: true },
      });
      for (const e of dueReveal) {
        try {
          await notifyGuestsOfEntryEvent(db, e.id, e.authorId, 'ENTRY_NEW');
          await db.entry.update({
            where: { id: e.id },
            data: { hiddenNotifSentAt: new Date() },
          });
        } catch (err) {
          app.log.error({ err, entryId: e.id }, '[cron] revealDeferred failed');
        }
      }

      // ── Auto-close des fils de discussion inactifs (1×/jour à 03:00 Paris) ──
      // Clôt les fils qui n'ont reçu AUCUN nouveau commentaire (de l'owner ni
      // d'un confident) depuis 5 jours. Le cron tourne toutes les minutes ; on
      // déclenche ce traitement seulement dans la fenêtre 03:00-03:00 pour
      // garantir une exécution par jour, à une heure creuse côté trafic.
      if (hhmm === '03:00') {
        try {
          const STALE_THREAD_DAYS = 5;
          const cutoff = new Date(now.getTime() - STALE_THREAD_DAYS * 24 * 60 * 60 * 1000);
          // Entrées non résolues, avec au moins un commentaire vivant, mais
          // aucun commentaire vivant créé depuis le `cutoff`. La requête est
          // entièrement déclarative — Prisma traduit en un seul SQL.
          const staleEntries = await db.entry.findMany({
            where: {
              deletedAt: null,
              commentsResolved: false,
              comments: { some: { deletedAt: null } },
              NOT: {
                comments: {
                  some: { deletedAt: null, createdAt: { gt: cutoff } },
                },
              },
            },
            select: { id: true },
          });
          if (staleEntries.length > 0) {
            const ids = staleEntries.map((e) => e.id);
            // Bump `updatedAt` en même temps : la sync incrémentale côté client
            // les redescend avec `commentsResolved: true`, le badge "à répondre"
            // disparaît du Fil sans avoir besoin de refresh manuel.
            await db.entry.updateMany({
              where: { id: { in: ids } },
              data: { commentsResolved: true, updatedAt: new Date() },
            });
            app.log.info(
              { count: ids.length, cutoff: cutoff.toISOString() },
              '[cron] autoCloseStaleThreads — fils fermés',
            );
          }
        } catch (err) {
          app.log.error({ err }, '[cron] autoCloseStaleThreads failed');
        }
      }
    });
  }

  // Purge quotidienne du journal d'activité : on ne conserve que 90 jours
  // d'`AuditLog` (largement suffisant pour le debug, borne la croissance de la
  // table). 04:30 — heure creuse. Indépendant du push (pas dans le guard VAPID).
  cron.schedule('30 4 * * *', async () => {
    try {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const { count } = await db.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
      if (count > 0) app.log.info({ count, cutoff: cutoff.toISOString() }, '[cron] auditLog purge (>90j)');
    } catch (err) {
      app.log.error({ err }, '[cron] auditLog purge failed');
    }
  });

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    app.log.info(`API ready on http://localhost:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
