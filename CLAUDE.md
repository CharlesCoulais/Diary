# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**Journal Cozy** — a personal, private diary app with an asymmetric user model: one Owner who writes, and optional Guests who read/comment. Built as a pnpm monorepo.

## Compatibilité plateformes (règle non négociable)

L'application est utilisée quotidiennement sur **desktop (web)**, **iOS** (Safari + PWA homescreen) et **Android** (Chrome + PWA homescreen). Toute modification doit fonctionner sur les trois cibles, à la fois :

- **Fonctionnellement** : tester systématiquement les fonctionnalités tactiles, le clavier virtuel, les permissions (push, fichiers, caméra/micro), les APIs Web qui diffèrent entre Safari/Chrome (drag & drop, viewport, scroll, IndexedDB, service worker, `safe-area-inset-*`…). Quand une API HTML5 n'est pas supportée en tactile sur mobile (ex: drag & drop natif), prévoir un polyfill ou un fallback — pas de fonctionnalité "desktop only" silencieuse.
- **Responsive** : layouts qui marchent du téléphone portrait (~360 px) au desktop large. Utiliser les breakpoints Tailwind (`sm:`, `md:`, `lg:`). Penser aux interactions sans `:hover` stable sur tactile (utiliser `@media (hover: hover)` quand un comportement dépend du hover). Respecter `safe-area-inset` pour le notch / barre dynamique iOS. Tester le BottomNav, les modales, les inputs (zoom auto Safari si `font-size < 16px`), les images plein écran, le scroll horizontal.
- **PWA** : penser au mode standalone (sans barre d'URL), au service worker (cache + push), et aux comportements offline.

Avant de marquer une tâche UI/UX comme terminée : vérifier explicitement (browser desktop + au moins une simulation iOS ou Android) et dire honnêtement si seule une partie a été testée.

## Commands

### Root (run from `Diary/`)

```bash
pnpm dev              # start all apps in parallel (web + api)
pnpm build            # build all packages
pnpm typecheck        # typecheck all packages
pnpm lint             # lint all packages
pnpm test             # run unit tests (Vitest) across packages

pnpm db:up            # start PostgreSQL via Docker Compose
pnpm db:down          # stop PostgreSQL
pnpm db:migrate       # prisma migrate dev (creates migration files)
pnpm db:generate      # regenerate Prisma client after schema changes
pnpm db:studio        # open Prisma Studio
```

### Per-package

```bash
# API only
pnpm --filter @carnet/api dev
pnpm --filter @carnet/api test        # Vitest (watch: test:watch)
pnpm --filter @carnet/api db:deploy   # prod-safe migration (no file creation)
pnpm --filter @carnet/api db:reset    # reset DB + reapply all migrations

# Web only
pnpm --filter @carnet/web dev
pnpm --filter @carnet/web build
```

> Node ≥22 and pnpm ≥9 are required.

## Monorepo structure

```
apps/api/       Fastify + tRPC backend (@carnet/api)
apps/web/       Vite + React frontend (@carnet/web)
packages/schemas/  Shared Zod schemas (@carnet/schemas)
```

`packages/schemas` is the only shared package currently — import it with `@carnet/schemas`. The web app imports the API router type (`AppRouter`) from `@carnet/api` for end-to-end type safety via tRPC.

## Codebase map

### apps/web/src

- `App.tsx`, `main.tsx` — racine, routing, providers
- `pages/` — vues React Router (Home, Timeline, Calendar, Barometre, Collection, Tasks, Stats, Settings, GuestHome…). **Pages d'agrégat** `Agenda` (`/agenda`) et `Budget` (`/budget`) : tableaux de bord qui agrègent **toutes** les notes AGENDA / FINANCE — l'Agenda fusionne tous les `mediaMeta.events[]` (liste + calendrier mensuel), le Budget somme tous les `mediaMeta.budgetItems[]` (solde de départ `User.budgetOpeningBalance` + total entrées/sorties + solde courant + catégories + récap par note). **Chemin de données role-aware** : owner → `useLiveQuery(db.entries)` (offline-first) ; **confident → `trpc.entries.aggregateByType`** (le confident **n'a pas de sync Dexie**, donc `db.entries` est vide pour lui — cf. la règle « Routing par rôle » et [[project-confident-no-dexie]]). `aggregateByType` renvoie toutes les notes du type lisibles par le viewer (`canRead`, hors 18+/scellées/différées/brouillons/verrou). Accès confident gaté par les toggles `User.guestCanViewAgenda`/`Budget` (`GuestFeatureGuard`). Clic sur un item → `navigate('/?entryId=…')`. Liens de nav (4 surfaces) : sidebar owner + sidebar guest (`DesktopJournalLayout`), `OwnerTopBar`, `GuestTopBar`. La page **`Calendrier`** (`/calendrier`) suit le **même pattern role-aware** : owner → Dexie, confident → `trpc.entries.calendarData` (toutes les notes lisibles, sans la limite 200 de `entries.list`) + `dailyLog.list`. Son header **mobile** doit rendre `GuestTopBar` pour le confident (pas seulement `OwnerTopBar`). **Page `Contacts`** (`/contacts`, `ConfidantGuard`) : carnet d'adresses **séparé du journal** (pas une note, pas de sync Dexie) — lit `trpc.contacts.list` (owner ET confident CONFIDANT, **même chemin serveur** car le confident n'a pas de Dexie). L'owner ajoute/édite/supprime (modale `ContactFormModal`) ; le confident est en **lecture seule** (boutons masqués via `me.role`). Accent propre `#A8736A`.
- `components/` — composants UI partagés (EntryCard, EntryFilters, EntrySheet, CommentThread, AudioPlayer, MediaSearchInput, BottomNav, PageHeader, ChatFab/ChatPanel/GifPicker pour la messagerie directe…). `CarouselJumpPopover` : popover « aller à l'élément N » (saisie d'un numéro + liste cliquable via `renderItem`, rendu en **portal** ancré au compteur) réutilisé par tous les carrousels (`MusicNotePlayer`, `ImageGallery`, `MediaCarousel`, `VideoCarousel`). `ImageLightbox` : **visionneuse plein écran partagée et zoomable** (pinch 2 doigts + double-tap + molette + double-clic, pan au drag, clamp ; `createPortal`, Échap, lock scroll) — **source unique** pour agrandir une image (notes via `TruncatedImage`, Collection, messagerie `ChatPanel`). ⚠️ Le pinch natif est désactivé globalement (`maximum-scale=1` du viewport, anti-zoom-input iOS) → le zoom image est géré en JS dans ce composant. Ne pas recréer une lightbox ailleurs : réutiliser `ImageLightbox`
- `components/editor/` — éditeur Tiptap (EditorToolbar, ChatDisplay…) et `extensions/` pour les blocs custom
- `components/editor/extensions/` — nodes Tiptap : `Branch` (pensées imbriquées), `Chat` (conversations), `EditBlock` (ajouts différés), `Excerpt` (extraits/citations repliables — 1 node paramétré par `kind` : livre/paroles/film-série, tags markdown `:::book`/`:::lyrics`/`:::movie` + `{json}` de métadonnées ; config partagée `editor/excerptKinds.tsx` (libellé/couleur/icône/champs/résumé), nodeview `ExcerptNodeView`, rendu lecture `ExcerptReadBlock` dans `AnnotatedReader`, styles `.excerpt-*` pilotés par `--excerpt-color`), `AudioNode`, `VideoNode` (vidéos souvenirs jusqu'à 500 Mo, R2 en prod / disque en dev), `Mermaid` (diagrammes — bloc atom `:::mermaid … :::`, rendu via le composant partagé `components/MermaidRender.tsx` qui **lazy-load** la lib `mermaid` ; chunk Vite dédié `vendor-mermaid` exclu du precache PWA), marks `FontFamily`/`FontSize`, extension `SpoilerShortcut` (raccourci ⌘⇧S qui wrap la sélection avec `||...||`), `Mention` (mentions @ : node inline atom + plugin `@tiptap/suggestion` → popup `MentionList`. Sérialisation markdown canonique `[@Label](mention:id)` ; au chargement une règle inline markdown-it le re-rend en `<span data-mention-id>` via `html:true`, capté par `parseHTML`. Liste alimentée par `setMentionItems` depuis `DiaryEditor`. Côté serveur cf. `lib/mentions.ts`), extension `HeadingFold` (repli des sections par titre **en édition** — chevron + décorations ProseMirror ; l'état repliable vit dans l'état du plugin, **jamais dans le document**, donc ni sérialisé ni synchronisé. Le repli côté **lecture** est géré séparément dans `AnnotatedReader` via un state `collapsedHeadings` + indices masqués)
- `components/Switch.tsx` — toggle binaire partagé (track w-10/h-6, thumb absolu) — source unique pour tous les réglages
- `components/SettingsCard.tsx` — carte standard d'une **section de Réglages** (`bg-bg-elevated rounded-2xl px-6 py-5 shadow-soft`), convention unique partagée par Settings **et** GuestSettings. **Pas de `<h2>` de titre principal** : le titre de section vient du chrome de la page (libellé de la ligne + en-tête `<h1>` de la colonne détail) — évite le doublon h1/h2. Le prop `title` est réservé aux **sous-sections** d'une page multi-cartes (ex. la sous-carte « Pause des push confident »). Toute nouvelle section de réglages doit l'utiliser.
- `components/WritingIdeasPanel.tsx` — bloc « Notes à venir » sur Aujourd'hui (Owner : édition complète via Dexie ; `GuestWritingIdeasView` : lecture seule via tRPC `tasks.writingIdeas`)
- `lib/db/schema.ts` — schéma Dexie (entries, tasks, dailyLogs, syncMeta) + migrations versionnées
- `lib/sync/useSync.ts` — protocole sync bidirectionnel (pull/push avec `_dirty` + `version`)
- `lib/trpc.ts` — client tRPC + React Query + helpers `RouterOutputs` / `RouterInputs`
- `lib/useDropdownAlign.ts` — hook partagé qui repositionne automatiquement un panneau de dropdown s'il déborde du viewport (mobile). Utilisé par les filtres, TimeSelector, TagInput, etc. (cf. **Patterns récurrents → Dropdowns viewport-safe**)
- `lib/useNoteTypeDefs.ts` + `components/NoteTypePicker.tsx` (`resolveNoteTypeConfig`, `resolveDefConfig`) — **types de note personnalisés** définis par l'owner. Un type custom = `noteType === 'CUSTOM'` + `Entry.customTypeId` → modèle Prisma `NoteTypeDef`, qui **hérite d'un comportement built-in** (`behavior`). ⚠️ Tout le rendu/branchement structuré doit passer par le **comportement effectif** `resolveNoteTypeConfig(entry, defsById).behavior` (côté serveur : `behaviorOf` de `@carnet/schemas`), **jamais** par `noteType === 'CUSTOM'`. Affichage (libellé/couleur/glyph) via le `cfg` résolu (`cfg.Glyph`, pas `cfg.Icon`). `useNoteTypeDefs()` est **role-aware** (owner → Dexie `noteTypeDefs`, mirrorée par le pull ; confident → `trpc.noteTypes.list`). Gestion : `Réglages → Affichage → Types de notes` (`NoteTypesManagerSection`) + création inline « + Type » dans le picker. cf. **Patterns récurrents → Types de note personnalisés**.
- `lib/dateHelpers.ts` — helpers date partagés (`isoToday`, `shiftDate`, `formatDateLong`, `relativeLabel`, `formatDateKicker`, `formatTimestamp`). Toutes les dates ISO (YYYY-MM-DD) ancrées à `T12:00:00` pour éviter les bugs de timezone.
- `lib/spoilers.tsx` — détection et rendu des `||texte||` (helpers `renderSpoilersInHtml` / `renderSpoilersInReact` / `stripSpoilers` / `hasSpoiler`) + hook `useGlobalSpoilerHandler` qui pose un seul listener click sur document
- `lib/{parseChat,previewRuns,mediaSearch,imageUpload,audioUpload,videoUpload,exportPdf,pin}.ts` — utilitaires de domaine
- `lib/useCommentMutations.ts` + `lib/commentAuthor.ts` — **source unique** partagée par les **2 surfaces de fil** (`AnnotatedReader`, surface ancrée au texte ; `CommentThread`, surface sans ancrage des capsules scellées / cartes secrètes). Le hook porte `add`/`edit`/`delete` avec le **toast de concurrence optimiste (`CONFLICT`)** qui doit rester identique des deux côtés ; flag `syncLocalCount` pour le bump du compteur `Entry.commentsCount` (IndexedDB) côté owner. `commentAuthorName` = nom d'affichage. **Ne pas re-dupliquer cette logique dans une 3e surface** — réutiliser le hook. (Les 2 fils restent volontairement séparés : fusionner traînerait le moteur markdown + sélection sur du contenu sans texte.)
- `lib/changelogSeen.ts` — suivi « dernière version vue » du changelog (léger, sans `marked`) : `useHasUnseenChangelog` (badge « non lu ») + `markChangelogSeen`. Importable dans le shell toujours chargé (top bars) ; `pages/Changelog.tsx` le réexporte pour Settings/GuestSettings.
- `lib/filActivity.ts` — **source unique** du compteur « à répondre » du Fil partagé par toutes les surfaces de nav : `countToReply(items, userId)` (pur — dédup par `(entryId, anchorText)`, fil non résolu, dernier auteur ≠ moi, **même logique que `CommentsActivity`**) + hook `useFilToReplyCount(enabled?)` (query `comments.activity` + compte, même cache React Query que la page Fil). Utilisé par `BottomNav`, `OwnerTopBar`, `GuestTopBar`, `DesktopJournalLayout`. Ne pas re-dupliquer ce calcul ailleurs.
- `lib/dialog.tsx` / `lib/toast.tsx` — feedback UI impératif partagé (un seul host monté dans `App.tsx`). **Dialog** (`confirmDialog`/`notifyDialog`/`promptDialog` + `<DialogHost />`) : bloquant, pour une décision (remplace `window.confirm/alert/prompt`). **Toast** (`showToast` + `<ToastHost />`) : non bloquant, auto-disparition, pour une notification ou un **undo** réversible (snackbar `Annuler` après une suppression). Règle : décision/destructif → dialog ; notification/undo → toast.
- `lib/skileyImport.ts` — import d'une playlist dans une note MUSIC depuis un export **Skiley** (`.json`, qui exporte les playlists Spotify). `parseSkileyExport` mappe vers `MediaTrack[]` (titre/artiste/album/`trackUrl`) **sans l'API Spotify** (verrouillée pour les particuliers) ; `lookupItunesCover` (pochettes iTunes, détecte le rate-limit) et `lookupLrclibLyrics` (paroles lrclib, **partagé** avec le bouton « Récupérer » de l'éditeur) complètent après coup. UI : `SkileyImportDialog.tsx` (modale de **sélection** des morceaux + options : pochettes, paroles, lien d'écoute **Spotify ou YouTube**). Branché dans `MediaMetaPanel` : bouton « ⇪ Importer » → parse → modale → insertion non destructive (clamp à `MAX_PLAYLIST_TRACKS`) + `runEnrichment` en arrière-plan (concurrence bornée, backoff iTunes ; le lien YouTube est résolu via l'endpoint **serveur** `entries.findYouTubeForTrack` — scrape de la page de résultats YT, **sans clé API** — avec repli sur le lien Spotify). Clé stable titre+artiste+album pour le flush idempotent (le streamUrl peut changer Spotify→YouTube).
- `lib/seriesProgress.ts` — helpers purs pour le suivi saison/épisode des **séries TV** de la Collection. Source de vérité `mediaMeta.seasonsWatched` (`[{ number, episodes, watched: n° d'ép. vus 1-based, title? }]`) ; les champs plats `season`/`progressCurrent`/`progressTotal`/`totalSeasons` et le `status`/`seriesStatus` en sont **dérivés** à chaque écriture (rétrocompat). `seriesStats`/`seriesGroupProgress` alimentent les cartes Collection ; le composant `SeasonEpisodeTracker` (cases par épisode, monté dans `EntrySheet` et `MediaMetaPanel`) écrit via le même chemin Dexie (`_dirty`). Remplissage auto depuis TMDB via `fetchTVDetails`/`fetchTVSeasonEpisodes` (cf. `AddCollectionItemSheet`).
- `lib/agendaEvents.ts` + `lib/budget.ts` — helpers **purs** des notes **AGENDA** (`mediaMeta.events[]` : `date`/`time` de début + `endDate`/`endTime` optionnels ; `sortEvents` trie par date puis heure, **sans-heure en fin de journée**, et à égalité = **ordre manuel** du tableau, réordonnable via les flèches du `AgendaEventBuilder` ; `splitUpcomingPast` à venir/passés ; `groupByDate` ; `eventsByDate` index calendrier ; `formatEventEnd` libellé de plage « → 15:30 » / « → 12 juin 16:00 ») et **FINANCE** (`mediaMeta.budgetItems[]` + `currency` : totaux entrées/sorties, solde, répartition par catégorie, `formatAmount`). Édition via `AgendaEventBuilder`/`BudgetBuilder` (montés dans `MediaMetaPanel` par early-return dédié) ; lecture via `AgendaView` (liste groupée + bascule mini-calendrier mensuel) et `BudgetView` (totaux + barres catégories), rendues dans `EntryCard`. ⚠️ **Ordre du mode édition (`EntryCard.tsx`, IIFE `isJournal`) :** pour **tous les types sauf JOURNAL**, le contenu structuré (`MediaMetaPanel`, et le cas échéant `MusicNotePlayer`/`ShoppingLinksEditor`) est rendu **AVANT** le `DiaryEditor`, et le texte n'est **pas** autofocus. Raison : l'éditeur est en `flex-1` — rendu en premier, son corps vide remplit tout le panneau et repousse les panneaux structurés tout en bas (gros vide au-dessus). C'est aligné sur le **mode lecture** (média / quiz / agenda / budget / liens rendus avant le contenu texte). **JOURNAL** est le seul cas éditeur-d'abord + autofocus (le texte EST le contenu, aucun panneau structuré). Tout nouveau type de note suit la règle « structuré d'abord » par défaut. Ces 2 types sont **fonctionnels** (pas des médias) → exclus de la Collection (`collectionFilter.ts`).
- `lib/devSeries.ts` — propagation des métadonnées structurelles entre notes **DEV** d'un même thème (Dexie, offline-first). Éditer le thème (rename), un total (parties/chapitres) ou le nom d'une partie sur une note met à jour les notes sœurs (`seriesName` = thème, `volume` = n° partie, `partName`, `totalVolumes`, `totalChapters`). Aussi : `devThemeTotals`/`devPartNameForVolume` pour l'autocomplétion (remplir totaux/n°). Appelé depuis `MediaMetaPanel` (via prop `entryId` pour s'auto-exclure). **Les notes QUIZZ réutilisent le même mécanisme** (helpers `renameQuizTheme`/`propagateQuizTotal`/`quizThemeTotal`) : `seriesName` = thème, `volume` = n° du quizz, `totalVolumes` = total visé (cible « X / total quizz » dans la Collection)
- `styles/tokens.css` — design tokens (palette cocoa : `--color-bg-primary`, `--color-accent`, `--color-text-muted`)
- `styles/globals.css` — base Tailwind + classes scopées (`.branch-*`, `.edit-block-*`, `.audio-*`, `.hide-scrollbar`, `.scrollbar-soft`)

### apps/api/src

- `server.ts` — bootstrap Fastify (helmet, CORS, rate-limit, montage tRPC)
- `trpc.ts` — context + 3 procédures (`publicProcedure`, `authedProcedure`, `ownerProcedure`)
- `db.ts` — singleton Prisma
- `env.ts` — validation Zod des env vars
- `routers/_app.ts` — composition de tous les routers
- `routers/` — un fichier par domaine : `auth` (incl. `changePassword`), `entries`, `sync`, `comments` (avec concurrence optimiste via `Comment.version` ; **statut du Fil** = pur dernier auteur : « à répondre » si le dernier commentaire n'est pas de moi (todo qui persiste jusqu'à ma réponse ou la clôture), « répondu » sinon. **Indicateur « non lu »** (point bleu, séparé du statut) : modèle `CommentThreadRead { userId, threadRootId, readAt }` mis à jour par `markThreadRead` à l'ouverture d'un fil, `activity` renvoie `myReadAt` → un fil non clos dont le dernier commentaire n'est pas de moi ET postérieur à `myReadAt` est « non lu ». Lire efface le point mais ne change PAS le statut), `reactions`, `ratings` (favoris / à oublier par utilisateur), `quiz` (notes QUIZZ : `submit`/`selfCorrect`/`reset`/`getOwn` en `authedProcedure` + `listForEntry` en `ownerProcedure` ; correction **côté serveur** depuis `mediaMeta.quizQuestions`, dont les bonnes réponses sont retirées du payload confident via `redactQuizForGuest` dans `entries.ts` ; état par-utilisateur dans le modèle `QuizResponse`), `tags`, `tasks` (incl. `writingIdeas` pour le panel Notes à venir + helper `privacyFilter` qui cache `taskType: 'writing-idea'` aux guests dans la liste principale), `dailyLog`, `coupleDay`, `directMessages` (messagerie directe owner ↔ confident), `gifs` (recherche Giphy, partagée messagerie/commentaires), `images`, `audios`, `videos` (upload + delete, stockage R2 en prod), `guests` (incl. `regeneratePassword` qui pose `mustChangePassword: true` sur le confident, et `listMentionable` — personnes mentionnables @ pour le viewer : owner→confidents, confident→owner+frères), `notifications`, `stats`, `apikeys`, `twofa`, `topicRequests`, `logs` (lecture seule des `AuditLog`, owner only — alimente la page `/logs`), `ai` (récap mensuel IA. tRPC : `status` (dispo + modèles) + lecture des récaps `getRecap`/`listRecapPeriods` (owner ET confident CONFIDANT en lecture seule, via `recapOwnerIdFor`) + `logRecapOpen`. La **génération** passe par la route REST **streaming** `POST /ai/recap` dans `server.ts` (NDJSON `delta`/`done`/`error`, **owner only**, annulable — le `done` fait foi). Génération dans `lib/aiText.ts` (`streamRecap`) : chemin **rapide** = API Messages d'Anthropic **directe** via `@anthropic-ai/sdk`, authentifiée par le token OAuth du **plan Max** (`CLAUDE_CODE_OAUTH_TOKEN` + beta header `oauth-2025-04-20`), aucun coût API. ⚠️ Le `system` DOIT rester la signature exacte `You are Claude Code, Anthropic's official CLI for Claude.` (y injecter des consignes custom fait rejeter le token : `rate_limit_error`) ; nos vraies consignes vont donc dans le **message utilisateur** (`buildRecapMessage`). Fallback `@anthropic-ai/claude-agent-sdk` (login Claude Code local) si pas de token (dev). Modèle choisi par requête (haiku/sonnet/opus → `AI_MODEL_IDS`). Digest du mois construit côté serveur par `lib/recapDigest.ts`), `contacts` (carnet d'adresses owner, page `/contacts` — modèle Prisma `Contact`, **PAS une note** : pas de sync Dexie. `list` en `authedProcedure` renvoie le carnet de l'owner pour l'owner ET le confident CONFIDANT (propriété résolue via `invitedById`, sinon `FORBIDDEN`), en **lecture seule** ; `upsert`/`delete` en `ownerProcedure`, bornés à `ownerId` via `updateMany`/`deleteMany`), `noteTypes` (types de note personnalisés — modèle `NoteTypeDef` ; `list` owner + confident CONFIDANT en lecture seule via `invitedById`, CRUD `ownerProcedure`, `delete` **bloqué (CONFLICT)** si des notes l'utilisent encore ; mirroré dans Dexie via le pull `sync`), `system`
- `lib/permissions.ts` — fonctions d'autorisation (`canRead`, `canInteract`, `canComment`, `canReact`) — **source unique de vérité**
- `lib/audit.ts` — helper `recordAudit(ctx, action, { entryId?, metadata? })` : écrit une ligne `AuditLog` en fire-and-forget (n'échoue ni ne ralentit jamais l'action métier ; `ctx.user` optionnel → mutations publiques loguées en anonyme). Deux niveaux de journalisation :
  1. **Logs sémantiques** (libellé FR + `entryId`/metadata riches) posés à la main dans les routers pour les évènements importants : connexions/sécurité, accès confidents, cycle de vie + changements des notes via `sync.push` (`ENTRY_CREATED/DELETED/RESTORED` ; `ENTRY_EDITED` — titre/contenu, **throttlé à 1/note/10 min**, hors items de collection et hors notes scellées, sinon bruit car sync continu ; `ENTRY_LOCK_ADDED`/`ENTRY_LOCK_REMOVED` — secret/adulte/read‑gate ; `ENTRY_SEALED`/`ENTRY_UNSEALED` — capsule ; `ENTRY_VISIBILITY_CHANGED` — from→to ; détection avant/après dans `upsertEntry`, émission après transaction dans le handler `push`), des tâches (`TASK_*` — via `tasks.*` pour le confident ET `sync.push` pour l'owner), demandes (`REQUEST_*`), réactions (`REACTION_*`), ratings (`RATING_*`), quiz (`QUIZ_SUBMITTED`/`QUIZ_RESET`), commentaires (`COMMENT_ADDED`), messages (`MESSAGE_SENT`), sceau de capsule (`ENTRY_SEALED/UNSEALED`), ouverture d'une note par un confident (`ENTRY_OPENED` — via `entries.logOpen`, émis par le client à chaque ouverture réelle ; `markRead` est skip car redondant), lecture du récap mensuel par un confident (`RECAP_OPENED` — via `ai.logRecapOpen`, émis par le client une fois par mois consulté).
  2. **Logs automatiques** : le middleware `autoAuditMiddleware` dans [`trpc.ts`](apps/api/src/trpc.ts) logue **toute mutation** non couverte ci-dessus sous l'action `rpc.<router>.<proc>` (chemin + succès/échec uniquement, **jamais le contenu de l'input**). Les **queries ne sont pas loguées**. La liste `SKIP_AUTO_AUDIT` exclut les chemins déjà sémantiques (anti-doublon) et les signaux éphémères (`typing`). Toute nouvelle mutation est donc loguée automatiquement, sans rien câbler.
  Rétention : un cron quotidien (04:30, dans `server.ts`) purge les `AuditLog` de plus de **90 jours**. Lecture owner-only via `routers/logs.ts` → page `/logs` (filtre multi-select par type, groupé par catégorie ; les `rpc.*` tombent dans « Technique / autres »).
- `lib/push.ts` — notifications push web (`sendPushToUser`) ; gère les modes discret/silencieux et les types « importants »
- `lib/mentions.ts` — mentions @ : `extractMentionIds` (parse le token canonique `[@Label](mention:id)`) + `notifyEntryMentions`/`notifyCommentMentions` (notif `MENTION_NEW` + push). **Porte d'accès** : `canRead` pour une note (contenu → note secrète ne notifie JAMAIS le confident), `canInteract` pour un commentaire (canal latéral visible même sur note secrète). Idempotent (une notif par personne par note/commentaire), jamais soi-même. Appelé depuis `comments.add`/`edit` et `sync.push` (notes créées/éditées). Liste mentionnable : `guests.listMentionable`.
- `lib/pushSchedule.ts` — `isWithinSchedule` : évalue les plages horaires (modes discret/silencieux) dans le fuseau de l'utilisateur
- `lib/events.ts` — bus d'événements in-process pour le temps réel SSE, consommé par la route `GET /events`. Émetteurs : `emitToUser` (ciblé), `emitToEntryAudience` (auteur + confidents `canRead`), `emitToOwnerCircle` (owner + ses confidents). Tous filtrent `revokedAt: null` côté confidents — un soft-deleted ne reçoit plus de SSE.
- `lib/email.ts` — sender abstrait. Sans config SMTP (par défaut), log le message dans la console (utile en dev). Avec `SMTP_HOST/USER/PASS + EMAIL_FROM`, prêt à brancher nodemailer / Resend (corps à compléter avec le SDK choisi).
- `lib/stats.ts` — calculs d'analytics
- `lib/recapDigest.ts` — construit le « digest » d'un mois (notes + ressenti DailyLog + baromètre couple) envoyé à Claude pour le **récap mensuel IA** (`buildMonthDigest`, `monthLabel`). Exclut les capsules encore scellées et les items de Collection ; **inclut** secret/adulte ; réduit les blocs opaques (médias, code, chat, mermaid) et le HTML inline à des marqueurs ; borne la taille (≈120k chars). Consommé par la route REST streaming `POST /ai/recap` (cf. `server.ts`, **owner only** — seule l'autrice génère) qui persiste le résultat dans `AiRecap` (un par `(ownerId, période)`, régénérable) ; génération via `streamRecap` (`lib/aiText.ts`, via le token du plan Max). Côté front : carte `MonthlyRecapCard.tsx` sur la page Stats. **Lecture** : owner ET confident **CONFIDANT** (`ai.getRecap`/`ai.listRecapPeriods` résolvent l'owner via `recapOwnerIdFor` ; le confident est en **lecture seule**, ne génère pas). ⚠️ **Choix assumé (juin 2026)** : le récap exposé au CONFIDANT inclut le résumé des notes secret/adulte — la garantie « secret invisible au confident » NE s'applique PAS au récap.
- `scripts/` — scripts ponctuels : `seed-media-test.ts`, `cleanup-media-test.ts`, `reset-password.ts` (réinitialise un mot de passe), `db-backup.mjs` / `db-restore.mjs` (sauvegarde/restauration JSON de toute la base)
- `prisma/schema.prisma` — modèle de données

### packages/schemas/src

- Zod schemas partagés front/back, exportés via `@carnet/schemas`

## Architecture

### Backend (apps/api)

- **Fastify** HTTP server with `@fastify/cors`, `@fastify/cookie`, `@fastify/helmet`, `@fastify/rate-limit`.
- **tRPC** adapter mounted at `/trpc`. Routers live in `src/routers/`, composed in `src/routers/_app.ts`.
- **Three procedure types** in `src/trpc.ts`:
  - `publicProcedure` — no auth required
  - `authedProcedure` — any authenticated user (Owner or Guest)
  - `ownerProcedure` — Owner only; throws `FORBIDDEN` for Guests
- **Prisma** ORM; schema at `apps/api/prisma/schema.prisma`. Run `db:generate` after every schema change.
- Auth flow: sessions stored hashed in DB (`Session.tokenHash` = SHA-256); refresh token sent in `HttpOnly; Secure; SameSite=Strict` cookie. Access token short-lived, kept in-memory on the client only.
- Password hashing: Argon2id (via the `argon2` package).

### Frontend (apps/web)

- **Vite** + React 18 + TypeScript.
- **tRPC client** + TanStack Query for server state (`src/lib/trpc.ts`).
- **React Router v6** for routing.
- **Tailwind CSS** with custom design tokens (warm cocoa palette, defined in `src/styles/tokens.css`).

### Shared schemas (packages/schemas)

All Zod schemas used by both front and back live here. Add new domain schemas alongside `auth.ts` and `entry.ts`, then export from `src/index.ts`.

## Patterns récurrents

### Extensions Tiptap (blocs custom)

Tout nouveau bloc d'éditeur suit la même structure (voir `Branch.ts`/`BranchNodeView.tsx` comme référence) :

1. **`extensions/<Nom>.ts`** : `Node.create({ name, group: 'block', addAttributes, parseHTML, renderHTML, addNodeView, addCommands, addStorage })`
2. **`extensions/<Nom>NodeView.tsx`** : composant React enveloppé dans `NodeViewWrapper` ; utilise `updateAttributes` pour les modifs et `data-drag-handle` sur un élément pour activer le drag (avec `draggable: true` sur le node)
3. **Sérialisation Markdown** : dans `addStorage().markdown` — `serialize` (vers `:::nom ...\n:::`) + `parse.setup` (règle markdown-it `md.block.ruler.before('fence', ...)`)
4. **Commande d'insertion** : déclarée via `declare module '@tiptap/core' { interface Commands<ReturnType> { ... } }` puis exposée dans `addCommands`
5. **Si sélection sélectionnée** comme ancre : appliquer la mark `branchAnchor` dans la **même transaction** que l'insert (sinon bug stale state sur mobile — cf. fix dans `Branch.ts`)
6. **CSS scopé** : classes préfixées (`.<type>-*`) dans `globals.css`, partagent la classe `.branch-drag-handle` pour la poignée de drag

### Sync Dexie ↔ API (offline-first)

Le client (`lib/sync/useSync.ts`) maintient `_dirty: boolean` et `version: number` sur chaque entité locale :

- **Pull** : `apiClient.sync.pull.query({ since })` retourne les entrées modifiées depuis le dernier curseur + `serverNow` (capturé **avant** la query pour éviter la race condition). Les entrées dirty locales ne sont pas écrasées.
- **Push** : entrées avec `_dirty: true` sont envoyées via `sync.push.mutate`. Le serveur crée une `EntryRevision` (raison `'auto_recover'`) avant tout overwrite, incrémente `version`, retourne la version résolue.
- **Triggers de sync** : mount, événement `online`, `visibilitychange` (focus tab), interval 30s, message du service worker.
- **Single-flight** : un seul sync à la fois (`_inFlight`), demandes concurrentes mises en attente (`_pending`).
- **Soft delete** : `deletedAt: string | null` au lieu de supprimer.
- **Pull résilient + erreurs visibles** : le merge du pull passe par `safeMap` (ignore et compte un enregistrement qui casse le mapping) + `safeBulkPut` (repli `put` une-par-une si le lot échoue) → **un seul enregistrement corrompu ne peut plus faire échouer tout le pull et laisser la base locale vide** (le piège après une réinstallation de la PWA, où Dexie repart à zéro et fait un pull complet). En cas d'échec, `useSync` **affiche un toast** (`Synchro échouée : …`, dé-dupliqué par message) au lieu d'un `console.error` muet ; si des enregistrements ont été ignorés, un toast `warning` le signale. Ne jamais re-rendre le `catch` du pull silencieux. **Garde-fou anti-blocage (watchdog)** : sur mobile une requête peut se figer sans jamais répondre ni rejeter (le `fetch` attendrait pour toujours), et une écriture IndexedDB peut aussi se bloquer → la promesse ne se résout jamais → le `finally` ne tourne pas → **spinner infini sans erreur**. Un `AbortController` ne suffit pas (le client tRPC peut ignorer le signal ; un blocage Dexie n'est pas annulable). Donc un **watchdog `setTimeout` (30 s, `TIMEOUT_MS`)** force la sortie directement : il appelle `setSyncing(false)` + affiche le toast d'erreur **même si l'opération en cours ne se terminera jamais** (flag `finished` pour que l'opé orpheline ne retraite pas l'état ; abort en best-effort). Le tick d'intervalle (30 s) relance ensuite. ⚠️ Ne pas revenir à un timeout basé uniquement sur l'abort : ça ne débloque pas un `fetch`/Dexie figé. **Pull paginé** : `sync.pull` pagine les **entries** par curseur `(updatedAt, id)` — le client boucle par pages de **150** (`limit`) jusqu'à `nextCursor: null` ; `tasks`/`dailyLogs`/`coupleDays` (petits) ne reviennent qu'à la 1re page ; le `serverNow` de la 1re page devient le nouveau curseur `since`. Évite un payload géant qui fige la connexion mobile au 1er pull complet (après réinstall PWA). **Rétro-compat** : `limit` côté serveur a un défaut de 2000 → un client sans `limit` garde l'ancien comportement (un seul lot, `nextCursor` null).

Toute nouvelle entité synchronisée doit suivre ce contrat : `id`, `version`, `updatedAt`, `deletedAt`, `_dirty`.

> ⚠️ **`mediaMeta` n'est PAS du JSON libre côté serveur.** Le schéma `mediaMeta` (`packages/schemas/src/entry.ts`) est un `z.object` **strict** (pas de `.passthrough()`) : à chaque `sync.push`, **toute clé absente du schéma est silencieusement supprimée**, puis le pull réécrit la version amputée en local → la donnée disparaît. **Tout nouveau champ `mediaMeta`** (côté `lib/db/schema.ts`) **doit être ajouté en parallèle au schéma Zod** `mediaMeta`, sinon il ne survit pas à un aller-retour de sync. (C'est exactement ce qui faisait disparaître les `events`/`budgetItems` des notes Agenda/Finance avant correction.) Pense aussi à l'enum `noteType` (Prisma + `@carnet/schemas` + Dexie) pour un nouveau type.

### Autorisation côté serveur

- **Jamais filtrer silencieusement** dans un router : refuser (404 ou FORBIDDEN). Filtrer masque les bugs d'autorisation.
- Toute lecture/écriture d'entry passe par `canRead`/`canInteract`/`canComment`/`canReact` dans `lib/permissions.ts`.
- **Guest avec `guestAccess === 'CONFIDANT'`** : voit tout indépendamment de `visibility`. À garder en tête pour les tests cross-rôle.
- Toute action Guest (read, comment, login) produit un `AuditLog`.
- **Données par-utilisateur attachées à une entry** (ex: `EntryRating`, `EntryReadStatus`) : pour les renvoyer côté client, le payload de l'entry les inclut filtrées **par rôle du viewer** (helper du type `filterRatingsForUser` dans `entries.ts`). Owner voit tout, Confident voit la sienne + celle de l'owner. **Toujours filtrer côté serveur après fetch** — ne pas faire confiance au client pour redacter.
- **Mutation qui ne touche pas le contenu de l'entry mais doit déclencher un re-pull Dexie** (ex: rating posée par un confident) : bumper explicitement `Entry.updatedAt` dans la même transaction, sinon le pull `since:` ne réémet pas l'entry et le client reste figé.

### Routing par rôle

Quand une route doit afficher des contenus différents selon le rôle (Owner / Guest), suivre le pattern `RoleRouter` / `TodayRouter` dans [`App.tsx`](apps/web/src/App.tsx) :

```tsx
function TodayRouter() {
  const { data, isError, isLoading } = trpc.auth.me.useQuery(undefined, { retry: false });
  if (isLoading) return null;
  if (isError || !data) return <Navigate to="/login" replace />;
  return data.role === 'GUEST' ? <GuestDayPage /> : <HomePage />;
}
```

Ne **jamais** monter une page Guest derrière une route Owner (ou inverse) — typique bug du genre « le menu Owner pointait vers `GuestSettingsPage` ». Vérifier qu'une nouvelle route a bien le bon guard (`OwnerGuard` / `ConfidantGuard`) **et** la bonne page derrière.

> ⚠️ **Le journal du confident (`GuestHome`) rend les notes avec son PROPRE branchement par `noteType`**, distinct de l'`EntryCard` de l'owner. Toute vue de lecture spécifique à un type (MUSIC → `MusicNotePlayer`, QUIZZ → `QuizTaker`, AGENDA → `AgendaView`, FINANCE → `BudgetView`, SHOPPING…) doit être ajoutée **aux deux endroits** : `EntryCard.tsx` (owner) **et** `GuestHome.tsx` (confident). Sinon le confident voit la note **vide** (c'est exactement ce qui faisait apparaître les notes Agenda/Finance vides côté confident — le serveur envoyait bien le `mediaMeta`, mais `GuestHome` n'avait pas de branche pour ces types). Pareil pour le **résumé compact** dans la carte repliée. **Types personnalisés** : une note `CUSTOM` doit être branchée sur son **comportement effectif** (`resolveNoteTypeConfig(entry, defsById).behavior`), pas sur `noteType` brut — sinon elle s'affiche vide côté confident. Les selects serveur lus par le confident (`ENTRY_SELECT`, `calendarData`, `aggregateByType`, `comments.activity`, souvenirs) doivent inclure `customTypeId`.

### Types de note personnalisés (behavior)

L'owner définit des types de note **à la volée** (modèle `NoteTypeDef`, router `noteTypes`). Un type custom porte `noteType: 'CUSTOM'` + `Entry.customTypeId` et **hérite d'un comportement built-in** (`NoteTypeDef.behavior`, l'un des 11 types). **Règle d'or : brancher sur le comportement effectif, jamais sur `noteType === 'CUSTOM'`.**

- **Résolution** : `behaviorOf(entry, defsById)` (pur, `@carnet/schemas`, testé `lib/noteType.test.ts`) → le built-in à brancher ; `resolveNoteTypeConfig(entry, defsById)` (`NoteTypePicker`) → `{ label, color, hex, Glyph, behavior, customId }` à AFFICHER. Utiliser **`cfg.Glyph`** (pas `cfg.Icon`) — il rend le SVG built-in OU l'emoji custom. Un custom orphelin (def supprimée) retombe sur JOURNAL.
- **Données** : `useNoteTypeDefs()` est role-aware (owner → Dexie `noteTypeDefs`, peuplée EN ENTIER à chaque 1re page du pull `sync` — clear+put, pas de `_dirty` ; confident → `trpc.noteTypes.list`). `customTypeId` voyage dans le sync (`syncEntryInput`, `SYNC_ENTRY_SELECT`, mappers `useSync`) et doit figurer dans tout select serveur lu par le confident.
- **Persistance** : le picker émet `{ noteType, customTypeId, behavior }` (built-in → `customTypeId: null`) ; `upsertEntry`/`entries.create` **purgent** `customTypeId` si `noteType !== 'CUSTOM'`.
- **Agrégats / notifs serveur** : pour cibler un comportement (page Agenda/Budget `aggregateByType`, notif par type dans `sync.notifyGuestsOfEntryEvent`), résoudre les `NoteTypeDef.id` dont `behavior === X` puis matcher `OR: [{ noteType: X }, { customTypeId: { in: ids } }]`.
- Tout **nouveau** point qui branche sur `noteType` suit cette règle (sinon les types custom s'affichent/comptent comme JOURNAL). Suppression d'un type **bloquée** (CONFLICT) tant qu'une note l'utilise.
- **Champs meta personnalisés** : un type custom porte une liste `NoteTypeDef.fields` (colonne **JSON**, schéma `noteTypeFieldDef` de `@carnet/schemas` : `{ id, label, type, options? }` ; 8 types : text/longtext/number/date/checkbox/rating/select/multiselect). Les **valeurs** par note vivent dans **`mediaMeta.customFields`** (`Record<fieldId, valeur>` — ⚠️ ajouté au `z.object` strict de `mediaMeta`, sinon stripé au sync). `useNoteTypeDefs()` renvoie `def.fields` ; `lib/customFields.ts` porte les helpers purs (`defaultFieldValue`/`isFieldFilled`/`formatFieldValue`/`hasCustomFieldDefs`/`hasFilledCustomFields`). UI : `NoteTypeFieldsBuilder` (définir, dans `NoteTypesManagerSection`), `CustomFieldsEditor` (remplir, monté dans `EntryCard` édition — ⚠️ early-return JOURNAL **relâché** si le type a des champs — et `EntrySheet`), `CustomFieldsView` (lecture, owner `EntryCard` + confident `GuestHome`). Pas de nouvelle table/endpoint : `fields` ride dans `noteTypes.create/update` + le pull ; `customFields` ride dans `mediaMeta`.

### Gestes tactiles plein écran (lightbox, zoom)

⚠️ **Ne pas utiliser `setPointerCapture` pour des gestes (pinch/pan) sur un overlay plein écran** (cf. `ImageLightbox`). Bug iOS WebKit connu : une capture de pointeur mal libérée **gèle le scroll tactile de TOUTE la page** après fermeture de l'overlay (symptôme : « le scroll ne marche plus, faut kill l'app »). Comme un overlay `fixed inset-0` couvre déjà tout l'écran, le doigt ne sort jamais → la capture est **inutile** : poser les handlers `onPointerDown/Move/Up/Cancel` **sur le conteneur plein écran** (pas sur l'image) suffit. (Le verrou `body.overflow='hidden'` de la lightbox, lui, n'est PAS en cause — il existait déjà avant la version zoomable.)

### Appels d'API externes (CSP)

Toute nouvelle requête HTTP **depuis le client** vers un domaine externe (autre que l'API du projet) doit être ajoutée à la **Content Security Policy** dans [`apps/api/src/server.ts`](apps/api/src/server.ts) (section `helmet.contentSecurityPolicy.directives`) :

- `connectSrc` — pour `fetch`, `XMLHttpRequest`, WebSocket, Server-Sent Events
- `imgSrc` — pour les `<img>` (déjà couvert par `https:` mais à vérifier pour `data:`/`blob:` exotiques)
- `frameSrc` — pour les `<iframe>` (players YouTube, Spotify, etc.)
- `mediaSrc` — pour `<audio>`/`<video>` direct (les iframes embarquent leur propre CSP)
- `fontSrc`, `styleSrc` — pour fonts/CSS externes
- `scriptSrc` — pour les scripts externes (à éviter — pas d'inline sans hash)

**Symptôme typique d'un oubli** : ça marche en dev (helmet désactivé ou tolérant), ça échoue silencieusement en prod (le navigateur bloque la requête, parfois sans message console clair).

Réflexe à avoir avant de merger toute intégration d'API externe ou d'embed : ouvrir `server.ts` et vérifier que le domaine est listé dans la bonne directive.

### Dropdowns viewport-safe

Tout panneau de dropdown ouvert depuis un trigger (filtres, pickers, suggestions) doit utiliser le hook [`useDropdownAlign`](apps/web/src/lib/useDropdownAlign.ts) pour ne pas déborder du viewport sur mobile :

```tsx
const { panelRef, panelStyle } = useDropdownAlign(open);

return (
  <div className="relative" ref={ref}>
    <button onClick={() => setOpen(v => !v)}>…</button>
    {open && (
      <div ref={panelRef} style={panelStyle} className="absolute left-0 top-full …">
        …
      </div>
    )}
  </div>
);
```

Le hook mesure le panneau via `useLayoutEffect` à l'ouverture et applique un `transform: translateX(...)` correcteur si le rect dépasse à droite ou à gauche (padding 8px). Compatible avec `<div>`, `<ul>`, etc. via le générique `useDropdownAlign<T>`.

Pattern composé : pour les dropdowns de filtres dans `EntryFilters.tsx`, c'est le hook local `useDropdown()` qui intègre déjà `useDropdownAlign` — les sous-composants récupèrent juste `panelRef`/`panelStyle` à appliquer sur leur `<div>` panneau.

**Réflexe à avoir** : tout `<div className="absolute left-0 …">` ou `<div className="absolute right-0 …">` ouvert depuis un trigger près d'un bord doit passer par ce hook. Les dropdowns `left-0 right-0` (qui stretchent sur toute la largeur du parent) sont déjà safe et n'ont pas besoin du hook.

### Upload de fichiers volumineux (vidéo)

Les vidéos dans les notes (jusqu'à 500 Mo) utilisent un pattern différent de l'audio (base64 tRPC) :

- **Upload** : endpoint REST `POST /videos/upload` (Fastify), corps binaire brut avec `Content-Type: video/*`, headers `X-Filename` et `X-Entry-Id`. En prod (vars R2 définies) → stream multipart vers Cloudflare R2 via `lib/r2.ts`. En dev → écrit sur disque dans `apps/api/uploads/videos/` (gitignoré).
- **Progression** : `lib/videoUpload.ts` → `uploadVideo()` utilise `XMLHttpRequest` avec `xhr.upload.onprogress` pour reporter le pourcentage à un callback.
- **Serving** : `GET /videos/:id` — en prod : redirect 302 vers une URL présignée R2 (expire 1h, range requests natifs → seeking fonctionnel). En dev : stream depuis le disque avec support `Range:`. Les anciens enregistrements DM (base64 en DB, champ `data`) sont servis sans range dans les deux cas.
- **Suppression** : `routers/videos.ts` → mutation `delete` supprime l'entrée DB et l'objet R2 (ou le fichier disque en dev).
- **Body limit** : un `addContentTypeParser` pour `video/*` avec `bodyLimit: 550 MB` overrides le global 45 MB pour ce type de contenu uniquement.
- **Stockage** : R2 bucket `diary-videos` (Cloudflare) en prod — vars `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. Sans ces vars : fallback disque local (dev uniquement, éphémère en prod).
- **CSP** : `mediaSrc` inclut `R2_ENDPOINT` dynamiquement si défini — nécessaire pour que le navigateur autorise le chargement depuis l'URL présignée.

Différence clé avec l'audio : l'audio passe par tRPC en base64 (30 Mo max), la vidéo passe par un endpoint REST natif Fastify (500 Mo, streaming).

### Spoilers (`||texte||`)

Syntaxe partagée entre **notes** (Tiptap → AnnotatedReader) et **commentaires** (CommentContent tokenizer). Le rendu transforme `||x||` en `<span class="spoiler" data-spoiler="1">x</span>` ; le CSS `.spoiler` (globals.css) floute le contenu, et le hook `useGlobalSpoilerHandler` (lib/spoilers.tsx) câblé une seule fois dans `App.tsx` toggle la classe `.spoiler-revealed` au click.

Helpers dans `lib/spoilers.tsx` :
- `renderSpoilersInHtml(html)` — pour les pipelines markdown→HTML
- `renderSpoilersInReact(text)` — pour les rendus runs
- `stripSpoilers(text)` — version texte brut (preview, recherche)
- `hasSpoiler(text)` — détection booléenne

**Réflexe à avoir** : tout nouveau composant qui rend du markdown utilisateur (notes, commentaires, DMs…) doit soit passer par AnnotatedReader/CommentContent qui gèrent déjà les spoilers, soit appeler un des helpers. En preview courte / texte brut, masquer par `▓▓▓` plutôt que de révéler.

Côté composer :
- **Éditeur Tiptap** : extension `SpoilerShortcut` (⌘⇧S) + bouton dans EditorToolbar
- **Commentaires** : entrée `◐` dans la toolbar `TOOLS` de CommentInput (utilise le helper `insertAround` partagé avec G/I/S/`)

### Données par-utilisateur attachées à une entité

Quand une entité a un champ « par utilisateur » que d'autres utilisateurs ne doivent pas voir (ex: `EntryRating` côté confidents pour les autres confidents, `Task` writing-ideas pour les guests) :

1. Stocker normalement côté DB (`ownerId` + champ user-spécifique).
2. Côté router : **filtrer après fetch** selon le rôle du viewer. Ne pas se reposer sur le client. Exemples :
   - `entries.list` / `entries.byId` : helper `filterRatingsForUser` qui renvoie toutes les ratings pour owner, owner + viewer pour guest.
   - `tasks.list` / `tasks.myTasks` : helper `privacyFilter` qui injecte `taskType: { notIn: ['writing-idea'] }` quand `user.role === 'GUEST'`.
3. Si l'entité voisine (Entry) doit faire apparaître la modification dans un pull Dexie de l'owner, **bumper son `updatedAt`** dans la même transaction (cf. `ratings.set` → `entry.update({ updatedAt: now })`). Sinon le `since` cursor du pull ne récupère pas la modif et l'UI semble figée.

### Concurrence optimiste (Comments)

`Comment.version` incrémenté à chaque update. `comments.edit` accepte un `expectedVersion?: number` optionnel — si fourni et qu'il ne matche pas, throw `CONFLICT`. Sinon fallback : on update et incrémente (rétrocompat avec les anciens clients).

Côté client (CommentThread / AnnotatedReader), `expectedVersion` peut être envoyé pour activer la détection — pour l'instant non câblé, la protection reste dormante.

### Soft-delete des guests

Au lieu de `user.delete` (qui cascade-supprime Comments / Reactions / EntryRating / ReadGateResponse), `guests.revokeGuest` pose `User.revokedAt: now` et supprime les sessions du confident.

**Toute query qui itère les guests doit filtrer `revokedAt: null`** (cf. entries, sync, events, server cron, directMessages). La validation de session (`validateSession`) inclut aussi un check de défense en profondeur : si `session.user.revokedAt != null`, la session est invalide quoi qu'il arrive.

### Reset de mot de passe par l'owner

Pas de flow email — trop d'infrastructure pour ce modèle de trust à 1+N. Le confident demande à l'owner, qui clique « Régén. mdp » dans Réglages → Confidents :
1. `guests.regeneratePassword` génère un mdp lisible 10 chars (alphabet sans ambiguïté `0/O/1/l/I`)
2. Hash + écrit sur User, pose `mustChangePassword: true`, supprime les sessions
3. Retourne le mdp en CLAIR une seule fois (jamais re-fetchable)
4. L'owner transmet par canal de confiance

Au prochain login du confident, `AuthGuard` / `OwnerGuard` / `ConfidantGuard` redirigent vers `/force-change-password` tant que `user.mustChangePassword === true`. L'écran utilise `auth.changePassword({ newPassword })` qui accepte sans currentPassword si le flag est posé.

Pour le owner lui-même : `pnpm --filter @carnet/api reset:password` en CLI.

### Conventions CSS

- Design tokens dans `tokens.css` (variables CSS, palette cocoa chaude).
- Tailwind config étend ces tokens (`bg-bg-primary`, `text-text-muted/60`, `border-text-muted/15`…).
- **Couleurs des types de note** : `--color-note-{journal,book,series,movie,music,outing,shopping,dev,quizz,agenda,finance}` dans `tokens.css`, **déclinées clair (profondes sur le crème) ET sombre (lumineuses sur le bleu nuit)** — teintes réparties ~33° pour qu'aucune paire ne se confonde dans un thème. `journal` = `var(--color-accent)` (suit l'accent). `getNoteTypeConfig().color` renvoie `var(--color-note-X)` (théme-aware, switch instantané sans re-render) ; `.hex` donne le hex clair brut pour les contextes hors-CSS (export PDF). ⚠️ **Ne jamais concaténer** `cfg.color + '20'` (invalide sur une variable) : utiliser `noteTint(cfg.color, pct)` (helper de `NoteTypePicker`, `color-mix`) pour les fonds teintés.
- Classes scopées par bloc : `branch-*`, `edit-block-*`, `audio-*` — définies dans `globals.css`.
- Z-index utilisés : `z-10` pour overlays (badge "Contenu sensible"), `z-20` pour le BottomNav fixe. Tout nouveau fixed-position au-dessus du contenu doit s'y conformer.

### Tests (Vitest)

Premier socle de tests unitaires côté API (`apps/api`, Vitest). Fichiers **colocalisés** `*.test.ts` à côté du code. On cible en priorité la **logique pure et sensible à la sécurité** — pas de couverture exhaustive :

- `lib/permissions.test.ts` — `canRead` (matrice de visibilité, note secret invisible au confident) + `recapOwnerIdFor` (qui lit les récaps).
- `lib/recapDigest.test.ts` — `buildMonthDigest` via un **faux Prisma** (objet mock, pas de vraie DB) : exclusion des capsules scellées, inclusion/tag secret-adulte, `where` (collectionOnly/deletedAt), réduction des blocs opaques.

Réflexe : pour rester testable sans env ni DB, garder les helpers d'autorisation/transformation **purs** (n'importer que des **types** de `@prisma/client`, jamais `env`/`db` qui tirent tout le serveur — `env.ts` fait `process.exit` si l'env manque). Une fonction d'authz va dans `lib/permissions.ts` (source unique), pas dans un router. Lancer : `pnpm --filter @carnet/api test`.

## User model and authorization

Two roles: `OWNER` and `GUEST`.

**Entry visibility**: `PRIVATE` (default) | `SHARED_ALL` | `SHARED_SPECIFIC`. Sharing is always explicit — new entries default to `PRIVATE`.

**Visibility algorithm** (must be enforced server-side in a single `canRead(user, entry)` function, never dispersed):
- Owner whose `id == entry.authorId` → allowed
- Guest + `PRIVATE` → denied
- Guest + `SHARED_ALL` + `guestAccess == ALL` → allowed
- Guest + `SHARED_SPECIFIC` + matching `EntryShare` row → allowed

**Authorization rule**: routers must **refuse** (throw 404 or FORBIDDEN) rather than silently filter. Filtering masks authorization bugs.

## Key constraints

- `Entry` has no unique constraint on `(authorId, date)` — multiple entries per day are intended, ordered by `createdAt`.
- `Comment.content` is Markdown: sanitize strictly server-side (DOMPurify + markdown-it without `html: true`), never render raw HTML from comments.
- `EntryRevision` rows must be created server-side before any content overwrite during sync (reason: `'auto_recover'`).
- Sessions: Owner refresh token expires in 30 days, Guest in 7 days. Refresh token reuse must invalidate the entire session family.
- All Guest actions (reads, comments, login attempts) must produce `AuditLog` entries.
- IPs are stored hashed (HMAC) — never raw.

## Environment

API env vars are in `apps/api/.env` (see `.env.example`). Required: `DATABASE_URL`, `PORT`, `WEB_ORIGIN`, `COOKIE_SECRET`, `NODE_ENV`. Optional: `LANGUAGETOOL_URL` (correcteur), `GIPHY_API_KEY` (recherche de GIF dans la messagerie — sans la clé, l'onglet GIF est masqué), `CLAUDE_CODE_OAUTH_TOKEN` + `AI_TEXT_MODEL` (récap mensuel IA via le plan Claude Max — sans token ni login Claude Code local, la carte récap est masquée).

## Database

PostgreSQL via Docker Compose (`docker-compose.yml` at repo root). Always run `db:deploy` (not `db:migrate`) in production.

**Sauvegarde automatique** : `db:migrate`, `db:deploy` et `db:reset` lancent d'abord `db:backup` (`&&`) — un dump JSON complet de toute la base dans `apps/api/backups/` (horodaté, 20 derniers conservés, dossier gitignoré). Si la sauvegarde échoue, la migration n'est PAS exécutée. Restauration : `pnpm --filter @carnet/api db:restore <fichier>`. Le script `db-backup.mjs` est volontairement en JS pur (lancé par `node`, pas `tsx`) pour fonctionner en prod où les devDependencies sont absentes.

⚠️ `db:reset` (= `prisma migrate reset`) **drop la base entière** — utile en dev, jamais en prod. `db:deploy` est non destructif (applique seulement les migrations en attente).

## Documentation à maintenir

Quatre documents vivants doivent être mis à jour **dans le même commit** que le code qui les rend obsolètes. À considérer systématiquement avant de clôturer une tâche.

### 1. `CLAUDE.md` (ce fichier)

Mettre à jour quand on :
- Ajoute une nouvelle zone du code (nouveau dossier `lib/`, nouveau type de page, nouveau router) → enrichir la **Codebase map**.
- Introduit un nouveau pattern récurrent (nouvelle extension Tiptap, nouveau type d'entité synchronisée, nouvelle convention CSS scopée) → ajouter une entrée dans **Patterns récurrents**.
- Modifie une règle d'autorisation, le modèle utilisateur, le protocole de sync, ou une contrainte forte → mettre à jour la section concernée (**User model**, **Key constraints**…).
- Renomme/supprime/déplace un fichier nommé explicitement dans le doc → corriger les références.

Ne **pas** documenter les détails d'implémentation triviaux (un nouveau composant UI isolé, un fix de bug local). Seulement les choses qu'une session fraîche doit savoir pour ne pas réinventer.

### 2. Changelog — `apps/web/public/changelog.md`

Mettre à jour quand on **livre une fonctionnalité visible par l'utilisateur** (owner ou confident) : nouveau bloc d'éditeur, nouvelle page, nouveau réglage, nouveau type de notification, fix d'un bug observable…

Format : ajouter une nouvelle version en haut (sémantique : patch pour les fix, minor pour les features). Date au format `JJ mois AAAA`. Rédaction côté utilisateur final (pas de jargon technique), regroupée par thème avec emoji optionnel.

**Anti-duplication** : avant d'ajouter une entrée dans un bloc de version existant (ex: enrichissement d'une version déjà publiée le jour même), relire **tout le bloc** et vérifier qu'aucune entrée existante ne couvre déjà le même sujet. Si oui, **consolider** dans l'entrée existante (la rendre plus complète) plutôt que d'ajouter une seconde ligne. Un même sujet ne doit jamais apparaître deux fois dans le même bloc de version — même si la première mention parle de la feature et la seconde d'un fix associé : fusionner dans une seule entrée nuancée.

Ne **pas** changelogger les refactos internes invisibles, les dépendances bumpées, les changements de doc.

### 3. API doc — `apps/web/src/pages/ApiDocs.tsx`

Mettre à jour quand on touche à l'**API REST publique** (routes `/api/*` dans `apps/api/src/routers/` exposées via `apikeys.ts`/token Bearer) :
- Ajout/suppression d'une route → ajouter/retirer une entrée dans `SECTIONS`.
- Changement de signature (nouveau paramètre, body modifié, réponse modifiée) → mettre à jour les `query`/`body`/`response` de l'endpoint.
- Changement d'auth (passage de public à authentifié, ou inverse) → ajuster le flag `auth`.

Ne **pas** documenter les routes tRPC internes (`/trpc/*`) — seules les routes REST publiques sont dans cette page.

### 4. Help center — `apps/web/public/help/*.md`

Mettre à jour quand on **change le comportement d'une feature documentée** :
- Un fichier `.md` existe par feature (`journal.md`, `conversations.md`, `securite.md`, `reglages.md`, `roles.md`, `notifications.md`, `reactions.md`, `stats.md`, `tasks.md`, `timeline.md`, `calendrier.md`, `barometre.md`, `collection.md`, `fil.md`, `demandes.md`, `brouillons.md`, `adulte.md`, `types-notes.md`).
- Si la feature change (nouveau bouton, nouveau réglage, nouveau comportement, nouveau type), mettre à jour l'article correspondant.
- Pour une feature **nouvelle** suffisamment visible : créer un nouveau `.md` dans `public/help/` et l'ajouter à `README.md` (sommaire) et au catalogue dans `pages/Help.tsx` si nécessaire.

Style : tu (pas vous), ton chaleureux, screenshots optionnels via les images existantes. Pas de jargon technique côté utilisateur.

### Règle de pouce

À la fin de toute tâche non-triviale, scanner mentalement : *« est-ce qu'une de ces 4 docs ment maintenant ? »*. Si oui, corriger dans le même commit. Mieux vaut une mise à jour de doc courte qu'une doc obsolète.
