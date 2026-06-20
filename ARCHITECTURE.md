# Journal Cozy — Note d'architecture

> Document de travail. Vise à servir de base de discussion et de référence vivante. À mettre à jour à chaque décision structurante.

---

## 0. Décisions verrouillées (mise à jour 6 mai 2026)

| Sujet | Choix | Détail |
|---|---|---|
| **Modèle d'usage** | Auteur unique + invités lecteurs | Un seul utilisateur écrit (toi). Des invités peuvent lire (tout ou entrées spécifiques) et commenter. |
| **Niveau de chiffrement** | Niveau 1 (TLS + at-rest) | Sécurité forte, pas de zero-knowledge. Le serveur peut techniquement lire mais l'archi minimise les expositions. |
| **Stack frontend** | React + TypeScript + Vite + PWA | Comme prévu initialement. |
| **Stack backend** | **Fastify + tRPC + Prisma + PostgreSQL** | Plus léger que NestJS, typage end-to-end client/serveur, bon ratio puissance/maintenabilité solo. |
| **Hébergement** | VPS Europe + S3-compatible | À choisir entre Hetzner et Scaleway. Backups chiffrés vers un second fournisseur. |
| **Mobile** | PWA d'abord, Capacitor plus tard si besoin store | Une PWA bien faite suffit largement pour ce cas d'usage. |

Tout ce qui suit est aligné sur ces choix.

---

## 1. Philosophie produit (rappel)

Application personnelle, intime, pour écrire chaque jour. Pas un outil de productivité corporate. La sensation à l'ouverture compte autant que les fonctionnalités. L'app doit donner envie d'y revenir, pas de "boucler une todo".

Trois piliers non négociables :

1. **Confidentialité** — l'utilisateur écrit des choses qu'il ne dirait à personne. Le système doit être conçu en partant de cette hypothèse, **même quand des invités sont autorisés**. Le partage est explicite, jamais par défaut.
2. **Continuité** — un journal qu'on perd ou qui devient lent au bout de 3 ans est un échec total. Maintenabilité et durabilité priment sur la nouveauté technique.
3. **Calme** — chaque interaction doit être douce. Aucune notification anxiogène, aucun chiffre culpabilisant, aucune gamification.

---

## 2. Justification des décisions

### 2.1. Pourquoi "auteur unique + invités lecteurs"

Le modèle est asymétrique :

- **Toi (Owner)** : écris, lis, supprimes, partages, gères.
- **Invités (Guest)** : comptes nominatifs créés et gérés par toi. Ne peuvent **jamais** créer ou modifier une entrée. Selon la permission donnée, peuvent lire et/ou commenter.

Trois rôles d'invités, à combiner :

| Rôle | Lecture | Commentaire | Scope |
|---|---|---|---|
| `READER_ALL` | toutes les entrées non-privées | non | global |
| `COMMENTER_ALL` | toutes les entrées non-privées | oui | global |
| `READER_SPECIFIC` | uniquement les entrées explicitement partagées | configurable | restreint |

Chaque entrée a une **visibilité** propre :

- `PRIVATE` : seule toi.
- `SHARED_ALL` : visible aux invités globaux (`READER_ALL`, `COMMENTER_ALL`).
- `SHARED_SPECIFIC` : visible uniquement aux invités explicitement listés sur cette entrée.

Conséquence importante : la visibilité par défaut d'une entrée doit être `PRIVATE`. Le partage est toujours un acte volontaire, jamais un effet de bord d'une création.

### 2.2. Pourquoi niveau 1 de chiffrement

Tu m'as dit "haute sécurité, pas classifié". C'est exactement la zone de pertinence du niveau 1 : TLS partout, BDD chiffrée at-rest, colonnes sensibles chiffrées en colonne via libsodium ou pgcrypto, gestion stricte des secrets et des sessions. Avantages :

- Recherche full-text serveur possible (Postgres `tsvector`).
- Récupération de mot de passe possible.
- IA / résumés futurs faisables sans gymnastique.
- Partage avec invités lecteurs **trivial à implémenter** (sinon il faudrait gérer un échange de clés Signal-like avec chaque invité — gros chantier).

Tu peux toujours ajouter plus tard un mode "coffre-fort" pour quelques entrées ultra-sensibles, en niveau 3 (zero-knowledge), mais ces entrées seraient alors invisibles aux invités par construction. Décision laissée pour plus tard.

### 2.3. Pourquoi Fastify + tRPC + Prisma

NestJS donnerait de la rigueur explicite mais beaucoup de cérémonie pour un projet solo. Sur un solo dev qui veut avancer dans la durée :

- **Fastify** : serveur HTTP rapide, écosystème mature, plugins propres pour CORS, rate limit, helmet, cookies, multipart.
- **tRPC** : tu écris des procédures TypeScript, le client React les appelle avec **typage complet de bout en bout**, sans OpenAPI à maintenir. Évite des classes de bugs entiers (signatures qui dérivent entre front et back).
- **Prisma** : ORM solide, migrations propres, type-safety totale, doc excellente.
- **zod** côté API + côté forms : validation partagée via un package `@app/schemas`.

Bonus : tu gardes la possibilité de migrer un jour vers Next.js si tu veux fusionner front/back, car tRPC est portable.

### 2.4. Pourquoi PWA d'abord

Une PWA bien faite installable sur iOS et Android est indistinguable d'une app native pour ce type d'usage (texte, lecture, formulaires). Les seuls vrais gains de Capacitor seraient (a) la distribution stores, (b) certaines API natives spécifiques. Aucun n'est nécessaire au MVP. Si tu veux distribuer via les stores plus tard, Capacitor enveloppe la PWA existante en quelques jours.

---

## 3. Architecture globale

```
┌──────────────────────────────────────────────────────┐
│  Client PWA (React + Vite + TypeScript)               │
│                                                       │
│  ┌─────────────┐  ┌─────────────────┐  ┌───────────┐ │
│  │ UI Owner    │  │ UI Guest        │  │ Editor    │ │
│  │ (full)      │  │ (read+comment)  │  │ (Tiptap)  │ │
│  └─────────────┘  └─────────────────┘  └───────────┘ │
│  ┌──────────────────────────────────────────────┐   │
│  │ State: TanStack Query + Zustand + Dexie       │   │
│  └──────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────┐   │
│  │ Service Worker (Workbox via vite-plugin-pwa) │   │
│  └──────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────┐   │
│  │ tRPC client (typed end-to-end)               │   │
│  └──────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
                         │ HTTPS (TLS 1.3) — cookie session
                         ▼
┌──────────────────────────────────────────────────────┐
│  Backend (Fastify + tRPC adapter)                     │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────┐ │
│  │ auth     │  │ entries  │  │ sharing  │  │ sync │ │
│  │ router   │  │ router   │  │ router   │  │ rtr  │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────┘ │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ comments │  │ tasks    │  │ media    │           │
│  └──────────┘  └──────────┘  └──────────┘           │
│  ┌──────────────────────────────────────────────┐   │
│  │ Middleware : authz, rate limit, audit, zod   │   │
│  └──────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
   PostgreSQL       Object storage    Backups chiffrés
   (Prisma)         (S3 / MinIO)      (off-site, daily)
```

Principes :

- **Le client est intelligent** côté Owner. Vraie BDD locale (Dexie), fonctionne sans réseau, sync delta.
- **Le client Guest est plus léger.** Pas de BDD locale persistante (ou très limitée), pas d'écriture, juste cache de lecture. Évite de propager du contenu sensible sur des devices d'invités plus que nécessaire.
- **L'API est minimale.** tRPC routers par domaine, validation zod, autorisations centralisées dans un middleware.
- **Médias hors BDD** : S3-compatible avec URLs signées courtes (5-15 min), différenciées Owner/Guest pour pouvoir révoquer un accès Guest sans invalider toutes les URLs.

---

## 4. Modèle de données

```prisma
// === Identité ===

model User {
  id             String   @id @default(cuid())
  email          String   @unique
  passwordHash   String   // Argon2id
  role           UserRole // OWNER ou GUEST
  // Pour les Guests : configuré par l'Owner
  guestAccess    GuestAccess?  // null pour Owner, ALL ou SPECIFIC pour Guest
  guestCanComment Boolean      @default(false)
  // Sécurité
  twoFactorSecret String?
  recoveryCodes   String[] // hashés
  // Métadonnées
  displayName     String?
  invitedAt       DateTime?    // pour les Guests
  invitedById     String?      // pour les Guests, pointe vers l'Owner
  createdAt       DateTime     @default(now())
  // Relations
  entriesAuthored Entry[]      @relation("EntriesAuthored")
  comments        Comment[]
  sharesReceived  EntryShare[] @relation("Receiver")
  sessions        Session[]
}

enum UserRole { OWNER GUEST }
enum GuestAccess { ALL SPECIFIC }

model Session {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash    String   @unique // SHA-256 du refresh token, jamais en clair
  userAgent    String?
  ipHash       String?
  createdAt    DateTime @default(now())
  lastUsedAt   DateTime @default(now())
  expiresAt    DateTime
  revokedAt    DateTime?
  @@index([userId])
}

// === Journal ===

model Entry {
  id          String     @id @default(cuid())
  authorId    String
  author      User       @relation("EntriesAuthored", fields: [authorId], references: [id], onDelete: Cascade)

  // Date "logique" du jour de l'entrée (pour grouper par jour dans la timeline)
  // Pas de contrainte unique : plusieurs entrées par jour possibles.
  date        DateTime   @db.Date
  // Timestamp précis de création (pour ordonner les entrées d'un même jour)
  createdAt   DateTime   @default(now())

  // Section optionnelle pour aider l'UI à grouper visuellement
  // (matin, après-midi, soir, libre…). Purement cosmétique côté UI.
  section     EntrySection?
  title       String?    // optionnel, surtout utile s'il y a plusieurs entrées/jour

  contentMd   String     // Markdown, chiffré en colonne (libsodium ou pgcrypto)

  // Métadonnées rapides (laissées en clair pour stats / dashboard)
  mood        Int?       // 1..5
  energy      Int?
  stress      Int?
  sleepHours  Float?
  weather     String?

  // Partage
  visibility  Visibility @default(PRIVATE)
  shares      EntryShare[]   // utilisé seulement si visibility = SHARED_SPECIFIC
  comments    Comment[]
  commentsLocked Boolean @default(false) // l'auteur peut couper les commentaires

  // Sync / audit
  version     Int        @default(1)
  updatedAt   DateTime   @updatedAt
  deletedAt   DateTime?

  // Relations
  tags        EntryTag[]
  attachments Attachment[]
  mediaItems  EntryMedia[]
  revisions   EntryRevision[]

  @@index([authorId, date])
  @@index([authorId, updatedAt])
  @@index([visibility])
}

enum EntrySection { MORNING AFTERNOON EVENING NIGHT FREE }
enum Visibility { PRIVATE SHARED_ALL SHARED_SPECIFIC }

model EntryShare {
  entryId    String
  receiverId String                 // userId du Guest qui a accès
  entry      Entry @relation(fields: [entryId], references: [id], onDelete: Cascade)
  receiver   User  @relation("Receiver", fields: [receiverId], references: [id], onDelete: Cascade)
  canComment Boolean @default(false) // peut override guestCanComment au niveau de l'entrée
  sharedAt   DateTime @default(now())
  @@id([entryId, receiverId])
}

// Historique de versions pour récupérer une entrée écrasée par sync ou édition.
model EntryRevision {
  id        String   @id @default(cuid())
  entryId   String
  entry     Entry    @relation(fields: [entryId], references: [id], onDelete: Cascade)
  contentMd String
  authorId  String
  createdAt DateTime @default(now())
  reason    String?  // 'manual_save', 'pre_sync', 'auto_recover'
  @@index([entryId, createdAt])
}

model Comment {
  id        String   @id @default(cuid())
  entryId   String
  entry     Entry    @relation(fields: [entryId], references: [id], onDelete: Cascade)
  authorId  String   // peut être un Guest OU l'Owner (auto-réponses)
  author    User     @relation(fields: [authorId], references: [id])
  content   String   // Markdown court, sans HTML inline
  parentId  String?  // pour les threads de réponses, optionnel
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?
  @@index([entryId, createdAt])
}

model Tag {
  id        String   @id @default(cuid())
  ownerId   String   // toujours l'Owner — les Guests ne créent pas de tags
  name      String
  color     String?
  kind      TagKind  // EMOTION, THEME, PERSON, PLACE…
  @@unique([ownerId, name, kind])
}
enum TagKind { EMOTION THEME PERSON PLACE OTHER }

model EntryTag {
  entryId String
  tagId   String
  entry   Entry @relation(fields: [entryId], references: [id], onDelete: Cascade)
  tag     Tag   @relation(fields: [tagId], references: [id], onDelete: Cascade)
  @@id([entryId, tagId])
}

// === Bullet journal === (Owner only, jamais visible aux Guests)

model Task {
  id          String   @id @default(cuid())
  ownerId     String
  title       String
  notes       String?
  status      TaskStatus
  dueDate     DateTime?
  scheduledFor DateTime?
  completedAt DateTime?
  collectionId String?
  recurrenceRule String? // RRULE iCal
  parentTaskId String?
  version     Int      @default(1)
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?
  @@index([ownerId, status])
  @@index([ownerId, dueDate])
}
enum TaskStatus { OPEN DONE MIGRATED CANCELLED SCHEDULED }

model Collection {
  id        String         @id @default(cuid())
  ownerId   String
  name      String
  kind      CollectionKind
  color     String?
}
enum CollectionKind { GOAL HABIT PROJECT LIST }

model HabitLog {
  id        String   @id @default(cuid())
  ownerId   String
  habitId   String
  date      DateTime @db.Date
  done      Boolean
  note      String?
  @@unique([ownerId, habitId, date])
}

// === Médias === (Owner crée, Guests peuvent voir si l'entrée associée est partagée)

model MediaItem {
  id          String   @id @default(cuid())
  ownerId     String
  kind        MediaKind
  title       String
  creator     String?
  externalId  String?
  externalSrc String?
  coverUrl    String?
  rating      Int?
  status      MediaStatus
  consumedAt  DateTime?
  notes       String?
  @@unique([ownerId, externalSrc, externalId])
}
enum MediaKind { BOOK MOVIE SERIES ALBUM GAME MUSIC }
enum MediaStatus { CONSUMED IN_PROGRESS BACKLOG FAVORITE }

model EntryMedia {
  entryId   String
  mediaId   String
  emotion   String?
  @@id([entryId, mediaId])
}

// === Pièces jointes ===

model Attachment {
  id         String   @id @default(cuid())
  ownerId    String
  entryId    String?
  filename   String
  mime       String
  sizeBytes  Int
  storageKey String
  createdAt  DateTime @default(now())
}

// === Audit / sécurité ===

model AuditLog {
  id        String   @id @default(cuid())
  userId    String?
  action    String   // 'LOGIN', 'LOGIN_FAILED', 'GUEST_VIEW', 'COMMENT_CREATED', 'SHARE_GRANTED'…
  entryId   String?  // si l'action concerne une entrée précise
  metadata  Json?
  ipHash    String?
  userAgent String?
  createdAt DateTime @default(now())
  @@index([userId, createdAt])
  @@index([entryId, createdAt])
}
```

Points de design importants :

- **Pas de `@@unique([authorId, date])` sur Entry.** Plusieurs entrées par jour, ordonnées par `createdAt`. Le UI groupe par `date`, optionnellement par `section`.
- **`EntryRevision` introduite dès le schéma initial.** Tu vas vouloir un undo robuste sur ton journal. Pas optionnel.
- **`Comment.content` en Markdown filtré.** Les commentaires sont des entrées externes — risque XSS plus élevé. Sanitization stricte côté serveur, jamais de HTML inline.
- **`UserRole = OWNER | GUEST` en enum.** Permet une autorisation simple en middleware tRPC. Tu n'as qu'un seul Owner aujourd'hui ; le schéma reste compatible si tu en as plusieurs un jour.
- **Toutes les actions des Guests passent par l'audit log.** Tu vois qui a lu quoi, qui a commenté, quand.

---

## 5. Modèle de partage et permissions (détaillé)

### 5.1. Algorithme de visibilité

Pour qu'un user `U` puisse lire une `Entry` `E` :

```
si U.role == OWNER et U.id == E.authorId  →  AUTORISÉ
si U.role == GUEST :
    si E.visibility == PRIVATE → REFUSÉ
    si E.visibility == SHARED_ALL et U.guestAccess == ALL → AUTORISÉ
    si E.visibility == SHARED_SPECIFIC :
        si EntryShare(entryId=E.id, receiverId=U.id) existe → AUTORISÉ
    sinon → REFUSÉ
```

Ce calcul est implémenté dans une seule fonction côté serveur (`canRead(user, entry)`) appelée par chaque route concernée. Pas dispersé.

Pour qu'un user `U` puisse commenter `E` :

```
canRead(U, E) doit être vrai
ET E.commentsLocked == false
ET (U.role == OWNER
    OU (U.role == GUEST et U.guestCanComment == true)
    OU EntryShare(E, U).canComment == true)
```

### 5.2. Vue Guest vs vue Owner

L'UI **change radicalement** selon le rôle :

| Élément | Owner | Guest |
|---|---|---|
| Page Today / éditeur | oui | non |
| Bullet journal / tasks | oui | non |
| Habits, mood analytics personnelles | oui | non |
| Settings, exports, sessions | oui (complet) | minimal (changer son mot de passe, voir ses sessions) |
| Timeline | filtrée par autorisation | filtrée par autorisation |
| Commentaire | oui (sur ses propres entrées) | si autorisé |
| Recherche | full | limitée aux entrées accessibles |

Le **router doit refuser au lieu de filtrer** quand le client demande quelque chose qu'il ne devrait pas pouvoir voir. Filtrer silencieusement masque les bugs d'autorisation.

### 5.3. Inviter un Guest (flow)

1. Owner ouvre Settings → People → Invite.
2. Saisit email + display name + niveau d'accès (`READER_ALL` / `COMMENTER_ALL` / `READER_SPECIFIC`).
3. L'app génère un token d'invitation à usage unique (32 bytes random, hashé en BDD).
4. Email envoyé via Resend / Postmark / un SMTP géré, avec un lien `/invite?token=...`.
5. Le Guest clique, choisit un mot de passe, active obligatoirement la 2FA TOTP (recommandé fortement) et accède à sa vue.
6. L'Owner peut révoquer un Guest à tout moment depuis Settings → People. Toutes ses sessions sont invalidées et les EntryShare le concernant gardent leur trace mais perdent leur effet.

### 5.4. Sécurité supplémentaire pour le partage

- **Watermark optionnel** dans la vue Guest : son email/display name en filigrane discret dans la marge. Décourage les screenshots sans en empêcher.
- **Pas de download brut** côté Guest : les médias sont streamés via URLs très courtes, jamais via "lien direct partageable".
- **Liste de présence** : Owner voit "Marie a lu cette entrée le 5 mai" dans une UI calme.
- **Session courte forcée** pour les Guests : refresh token de 7 jours au lieu de 30, pour limiter la fenêtre d'exposition en cas de vol.
- **Notifications Owner** : push web (optionnel) quand un Guest commente.

---

## 6. Architecture frontend

### 6.1. Découpage

```
apps/web/src/
├── app/                  # bootstrap, providers, router
├── pages/
│   ├── owner/            # routes accessibles uniquement à l'Owner
│   │   ├── today/
│   │   ├── timeline/
│   │   ├── tasks/
│   │   ├── media/
│   │   ├── search/
│   │   ├── people/       # gérer les Guests
│   │   └── settings/
│   ├── guest/            # routes pour les Guests
│   │   ├── timeline/
│   │   ├── entry/[id]/
│   │   └── settings/
│   └── auth/
├── features/
│   ├── journal/
│   ├── tasks/
│   ├── media/
│   ├── mood/
│   ├── sharing/          # invitations, gestion des Guests, watermark
│   ├── comments/
│   └── sync/
├── components/
│   ├── ui/
│   ├── editor/
│   └── viz/
├── lib/
│   ├── db/               # Dexie schemas (Owner uniquement)
│   ├── trpc/             # client tRPC
│   ├── crypto/           # libsodium wrappers (utile même en niveau 1 pour at-rest)
│   ├── sync/             # moteur sync (Owner uniquement)
│   ├── auth/             # session, role detection, guards
│   └── theme/
└── styles/
```

Le router top-level **distingue Owner et Guest** dès l'entrée. Un Guest qui essaie d'aller sur `/owner/*` est redirigé. C'est plus propre que de conditionner chaque composant.

### 6.2. Choix de libs

| Besoin | Reco | Alternative |
|---|---|---|
| Routing | TanStack Router | React Router |
| Server state | TanStack Query | SWR |
| Local state | Zustand | Jotai |
| Local DB | Dexie (IndexedDB) | RxDB |
| Forms | React Hook Form + zod | Formik |
| Editor riche | Tiptap (ProseMirror) | Lexical |
| Animations | Framer Motion | react-spring |
| Style | Tailwind CSS + tokens custom | vanilla-extract |
| Composants headless | Radix UI / shadcn/ui | Headless UI |
| Dates | date-fns ou Temporal polyfill | dayjs |
| Crypto | libsodium-wrappers | WebCrypto natif |
| Markdown rendering | markdown-it + sanitize | react-markdown + rehype-sanitize |
| Service worker | Workbox via vite-plugin-pwa | manuel |
| Search local | MiniSearch | Lunr |
| Email transactionnel | Resend ou Postmark | SMTP géré |

### 6.3. State management

Trois couches strictement séparées :

1. **Server state** → TanStack Query branché sur tRPC. Cache, mutations, optimistic updates.
2. **Local DB state** (Owner uniquement) → Dexie + `useLiveQuery`. Vérité locale persistée pour offline.
3. **UI state** → Zustand pour les états transverses (thème, drawer ouvert, draft non sauvegardé). `useState` pour le local.

Le moteur de sync (côté Owner) écrit dans Dexie, qui réveille les hooks `useLiveQuery`, qui re-rendent les composants. Les Guests court-circuitent Dexie : ils consomment directement TanStack Query (avec cache mémoire et IndexedDB minimal pour le SW).

---

## 7. Stratégie de synchronisation offline (Owner)

### 7.1. Principe

- Chaque entité a `updatedAt` + `version` + `deletedAt`.
- Le client garde un `lastSyncAt` global.
- Push : entités modifiées localement depuis `lastSyncAt`.
- Pull : entités modifiées côté serveur depuis `lastSyncAt`.
- Merge : last-write-wins par entité, avec **création automatique d'un `EntryRevision`** côté serveur si le contenu reçu écrase un contenu plus récent qu'attendu (sécurité anti-perte).

### 7.2. Endpoints sync

```
trpc.sync.push   { entries[], tasks[], comments[], ..., since }
trpc.sync.pull   { since }
                 → { entries[], tasks[], comments[], deletes[], serverNow }
```

### 7.3. Conflits sur le contenu d'entrée

- Snapshot local automatique avant chaque push (table Dexie `EntryRevisionLocal`).
- Côté serveur, si on détecte un écrasement risqué, on stocke automatiquement une `EntryRevision` avec `reason = 'auto_recover'`.
- L'UI propose une vue "Versions" sur chaque entrée pour restaurer.

### 7.4. Service Worker

- Workbox via `vite-plugin-pwa`.
- Stratégies : `NetworkFirst` (avec timeout 3s) pour les API non critiques, `StaleWhileRevalidate` pour les assets, `CacheFirst` pour les médias.
- Background Sync API pour les requêtes échouées.
- **Kill switch** : un endpoint `/version` que le SW interroge ; si la version a changé, il force un reload propre. Évite les apps "bloquées dans une vieille version".

### 7.5. Sync côté Guests

Pas de sync delta. Les Guests sont online par nature de leur usage (consultation ponctuelle). Le SW peut cacher les dernières entrées lues pour confort, mais l'écriture (commentaires) attend la connexion.

---

## 8. Architecture sécurité

### 8.1. Authentification

- **Argon2id**, mémoire ≥ 64 MB, t=3, p=1.
- Politique : longueur min 12, check HIBP via k-anonymity.
- **2FA TOTP** disponible dès le MVP, **fortement recommandé pour les Guests** (l'Owner peut rendre la 2FA obligatoire pour les invités via Settings).
- **Passkeys (WebAuthn)** : phase 2.
- **Recovery codes** générés à l'activation 2FA.

### 8.2. Sessions

- Access token JWT court (15 min), en mémoire JS uniquement, jamais localStorage/sessionStorage.
- Refresh token opaque, stocké hashé (SHA-256) côté serveur, dans cookie `HttpOnly; Secure; SameSite=Strict`.
- Durée refresh **différenciée** : 30j Owner, 7j Guest.
- Rotation à chaque refresh + détection de réutilisation (invalidation de toute la famille de tokens + alerte audit).
- Liste de sessions visible à l'utilisateur, possibilité de révoquer.

### 8.3. Headers et transport

- TLS 1.3, HSTS preload après stabilisation.
- CSP stricte : `default-src 'self'`, pas de `unsafe-inline`. Les styles inline sont signés via nonces.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy` restrictive (microphone/caméra demandés au moment, pas par défaut).
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`.

### 8.4. CSRF / XSS

- Cookies `SameSite=Strict` + token CSRF par requête mutante (double submit).
- Markdown rendu avec **markdown-it sans HTML inline + DOMPurify** sur le résultat HTML, avec liste blanche stricte de tags. Pareil pour les commentaires.
- **Aucune route ne renvoie de HTML construit côté serveur** avec du contenu utilisateur. JSON only, rendu côté client.

### 8.5. Rate limiting et brute-force

- `@fastify/rate-limit` adossé à Redis.
- Login : 5 tentatives / 15 min / IP avec backoff exponentiel + alerte audit.
- API globale : 100 req/min par user.
- Endpoints sensibles (export, change password, invite Guest, accept Guest invite) : limites dédiées.

### 8.6. Validation

- **zod** des deux côtés via `@app/schemas`.
- Tailles max : 256 KB de Markdown par entrée, 16 KB par commentaire, 50 MB par pièce jointe.
- MIME whitelist + check magic bytes pour les uploads.

### 8.7. Secrets

- `.env` jamais commité.
- Variables d'environnement en prod, ou vault (Doppler / Infisical) si tu veux plus de robustesse.
- **Envelope encryption** pour le chiffrement at-rest applicatif : data keys par entité, chiffrées par master key. Permet rotation de master key sans tout réécrire.

### 8.8. Audit logs

- Logged : login (succès / échec), changement de mot de passe, génération de recovery codes, activation 2FA, **création/suppression de Guest**, **partage/révocation d'entrée**, **lecture par un Guest** (`GUEST_VIEW`), **commentaire créé**, export de données.
- UI accessible à l'Owner : "Activité du journal". Inclut les actions des Guests, ce qui te donne un signal de sécurité naturel.

### 8.9. Backups

- pg_dump quotidien, chiffré GPG, poussé vers un fournisseur tiers (Backblaze B2 / Hetzner Storage Box).
- Test de restauration mensuel automatisé. Un backup non testé n'est pas un backup.
- Rétention : 7 quotidiens, 4 hebdomadaires, 12 mensuels.
- **Backups locaux** : export JSON+Markdown automatique du contenu Owner, déposé sur un dossier configurable (Dropbox, iCloud Drive, NAS via WebDAV). Belt and suspenders.

### 8.10. Privacy by design

- Pas d'analytics tiers. Plausible self-hosted ou rien.
- Sentry self-hosted ou GlitchTip si tu veux du tracking d'erreurs, avec scrubbing agressif des extras.
- IPs hashées (HMAC avec sel) si stockées.
- Right to export et right to delete dès le MVP.

---

## 9. UX & identité visuelle

### 9.1. Tokens de design

Pense en **tokens** (couleurs, espacements, rayons, ombres, easings). Permet de pivoter le thème sans toucher aux composants.

Palette "warm cocoa" (jour) :

```
--bg-primary:   #f5efe6   /* parchemin chaud */
--bg-elevated:  #fbf6ee
--text-primary: #3a322c   /* presque noir, jamais pur */
--text-muted:   #8a7e6f
--accent:       #c98a5c   /* terre cuite */
--accent-soft:  #e9c9a8
--success:      #7a9b76   /* sauge */
--warning:      #c9a35c
--error:        #b86a5e   /* brique douce, jamais rouge vif */
```

"Dark cocoa" (nuit) :

```
--bg-primary:   #1c1916
--bg-elevated:  #25211d
--text-primary: #ece4d6
--text-muted:   #8a7e6f
--accent:       #d8a373
```

Aucun pur noir, aucun pur blanc, aucun rouge vif, aucun bleu Twitter.

### 9.2. Typographie

- Corps : serif chaud type **Lora**, **Source Serif**, **Crimson Pro**, **Newsreader**.
- UI / nav : sans-serif neutre, **Inter** ou **Geist**.
- Display optionnel : **Fraunces** pour quelques titres.
- Tailles : corps 17-18px desktop, 16px mobile. Ligne 1.6-1.7. Mesure ~70 caractères max.

### 9.3. Mouvement

- Transitions en `cubic-bezier(0.32, 0.72, 0, 1)`, durées 200-350ms.
- Pas de bounce, pas de spring agressif.
- Respecter `prefers-reduced-motion`.

### 9.4. Détails qui changent tout

- Champ d'écriture en focus → tout s'estompe légèrement (mode "écrire").
- Date du jour en titre, format long et tendre : "Mardi 6 mai".
- Plusieurs entrées du jour empilées chronologiquement avec un séparateur très discret et le `section` en label doux ("Matin", "Soir").
- "Nouvelle entrée" toujours à un clic, jamais caché derrière un menu.
- Auto-save silencieux (debounce 800ms), petite icône qui confirme.
- "On this day" : carte douce qui apparaît parfois, jamais comme une notif.
- Aucune notification push par défaut.
- Vue Guest : même langage visuel, mais **aucun élément de productivité** (pas de tasks, pas de stats personnelles), une UI réduite à "lire et commenter".

### 9.5. Mobile

- Bottom nav : Today, Timeline, Search, Settings (4 icônes).
- Pull-to-refresh natif.
- Safe-area respectée (notch + home indicator).
- Swipe entre jours sur la timeline.
- Promotion PWA "Add to Home Screen" après 3 ouvertures, formulée doucement.

---

## 10. MVP — scope minimal honnête

Cible : 5-7 semaines de dev solo en soirées et week-ends. Ce qui te permet de **dogfooder** l'app pendant un mois pour valider le ressenti.

**Inclus dans le MVP :**

- Auth Owner (email + mot de passe + 2FA TOTP optionnel), sessions sécurisées.
- Page Today : éditeur Markdown (Tiptap), plusieurs entrées par jour, mood + 3 indicateurs, tags simples.
- Timeline chronologique avec recherche basique.
- Tâches simples (titre, statut, date due), sans récurrence ni migration auto.
- PWA installable, fonctionne offline en lecture, écriture offline avec sync à la reconnexion.
- Thème clair + sombre.
- **Invitation d'un Guest avec accès lecture globale** (pas le partage spécifique), **commentaires basiques**.
- Audit log côté Owner (UI minimale).
- Export JSON.
- Backups serveur automatisés.

**Hors MVP — phases ultérieures :**

- Bullet journal complet (collections, habits, recurrence, migration).
- Partage spécifique par entrée.
- Médias et intégrations Spotify/Letterboxd/AniList/Goodreads.
- Pièces jointes / voice notes / drawings.
- Analytics émotionnelles avancées, heatmaps, recaps annuels.
- Passkeys.
- Mode coffre-fort (E2EE pour quelques entrées).
- IA.

---

## 11. Roadmap par phases

| Phase | Durée | Contenu | Critère de fin |
|---|---|---|---|
| **0. Fondations** | 1 sem | Repo monorepo, CI, schéma BDD, auth Owner, tokens design | Tu peux te connecter et créer une entrée vide |
| **1. MVP journal solo** | 3-4 sem | Today (multi-entrées/jour), Timeline, tags, tasks simples, PWA, thèmes, sync offline | Tu utilises l'app toi-même 14 jours |
| **2. Invités lecteurs + commentaires** | 2 sem | Invitation Guest, accès global, commentaires, audit log Guest | Une personne de confiance lit et commente une entrée |
| **3. Partage par entrée + watermark** | 1-2 sem | `SHARED_SPECIFIC`, partage à un Guest spécifique, watermark | Tu partages une entrée précise sans tout exposer |
| **4. Bullet journal complet** | 2-3 sem | Collections, habits, recurrence (RRULE), migration | Tu remplaces ton outil de tâches actuel |
| **5. Médias + pièces jointes** | 3-4 sem | Books/movies/series, intégration 1-2 sources, pièces jointes images | Tu loggues un livre + un film, joins une photo |
| **6. Mood analytics + timeline** | 2 sem | Heatmap, "on this day", recap mensuel | Tu vois ton évolution émotionnelle |
| **7. Recherche avancée** | 1-2 sem | Full-text Postgres + filtres combinés (humeur, tags, date, médias) | Tu retrouves une entrée par critères croisés |
| **8. Sécurité avancée** | 2-3 sem | Passkeys, audit log UI complet, sessions UI, rotation clés | Tu peux t'auditer toi-même proprement |
| **9. Coffre-fort E2EE (optionnel)** | 4-6 sem | Mode privé chiffré client, recovery key | Tu marques une entrée privée et le serveur ne la voit plus |
| **10. IA (optionnel)** | open | Résumés mensuels, tagging suggéré, recherche sémantique | À évaluer en fonction de l'usage |

---

## 12. Risques techniques principaux

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| **Sync : conflits sur entrées longues** | Moyenne | Perte de données | Snapshots locaux pré-push, `EntryRevision` côté serveur, UI de versions |
| **Autorisation Guest mal implémentée** | Moyenne | Fuite d'entrée privée | Fonction `canRead`/`canComment` centralisée, tests d'intégration spécifiques, refus explicite (404) au lieu de filtrage |
| **Service Worker mal configuré** | Élevée | App "morte" en prod | Versioning + skipWaiting maîtrisé + endpoint `/version` kill switch |
| **Backups non testés** | Élevée si négligé | Catastrophe lors d'un crash | Test de restauration mensuel automatisé en CI |
| **Compte Guest compromis** | Moyenne | Lecture non autorisée | 2FA recommandée/obligatoire, sessions courtes, audit log lisible, révocation immédiate |
| **XSS via commentaires** | Moyenne | Compromission Owner | Sanitization stricte, CSP `unsafe-inline` interdit, rendu Markdown sans HTML |
| **Scope creep** | Très élevée | Tu n'utilises jamais l'app | Roadmap stricte, MVP dogfoodé avant phase 2 |
| **Migrations Prisma cassées** | Moyenne | Downtime, perte de données | `prisma migrate deploy` en prod uniquement, dump avant chaque migration |
| **IndexedDB corrompue** | Faible | Perte de données locales | Versioning Dexie, reconstruction depuis serveur |
| **Burnout solo dev** | Très élevée | Projet mort à 6 mois | Phases courtes, livrables visibles, pas de feature spéculative |

---

## 13. Anti-patterns à éviter

- **Designer toutes les tables avant la première feature.** Le schéma ci-dessus est une base, pas un dogme. Modélise au fil de l'eau.
- **Construire une "plateforme" avant le produit.** Pas de microservices, pas de Kubernetes, pas de message bus.
- **Optimiser trop tôt.** Postgres + index basiques tient des années.
- **Ajouter des libs "au cas où"** (Redux, GraphQL, OpenTelemetry…). Chaque dépendance est une dette.
- **Faire confiance aveuglément au SW pour l'offline.** Tester offline activement à chaque release.
- **WebSockets dès le MVP.** Polling ou push manuel suffit.
- **i18n prématurée.** Une langue, point.
- **Tests partout dès J1.** Tests d'intégration sur les flows critiques (auth, autorisation Guest, sync). Pas de TDD à 100% sur un projet perso solo.
- **Dérouler la liste des features avant de l'utiliser un jour.** Le dogfooding est la principale validation.

---

## 14. Outillage projet

- **Repo** : monorepo simple via pnpm workspaces.
  - `apps/web` (Vite + React)
  - `apps/api` (Fastify + tRPC)
  - `packages/schemas` (zod, partagés)
  - `packages/types` (types Prisma générés + types métier)
  - Évite Nx ou Turborepo tant que ce n'est pas nécessaire.
- **CI** : GitHub Actions, une seule action : lint + typecheck + tests + build + check de migration.
- **Déploiement** : Docker Compose sur le VPS au démarrage. Caddy en reverse proxy avec TLS auto. Migration vers une orchestration plus complexe seulement si vraiment nécessaire.
- **Observabilité** : pino (logs structurés), uptime check externe (UptimeRobot ou Healthchecks.io), c'est tout pour le MVP.
- **Linting** : ESLint + Prettier + tsc strict. `noUncheckedIndexedAccess: true`.

---

## 15. Prochaines étapes concrètes

Maintenant que les décisions sont prises, on peut passer à l'exécution. Voici l'ordre que je recommande :

1. **Choisir l'hébergeur** entre Hetzner et Scaleway. Hetzner est imbattable en rapport qualité/prix (CX22 à ~4€/mois suffit largement au début), Scaleway est plus français-friendly si tu y tiens.
2. **Réserver le domaine** et configurer les enregistrements DNS de base.
3. **Scaffolder le repo** (monorepo pnpm + Vite + Fastify + Prisma + tRPC + zod + Tailwind + shadcn/ui).
4. **Phase 0 : auth Owner + une entrée vide synchronisée.** C'est le squelette le plus minimal qui prouve que la chaîne complète fonctionne.
5. **Phase 1 : Today + Timeline + tags + tasks simples + PWA.** Tu commences à dogfooder.
6. **Dogfooding 2 semaines minimum** avant d'attaquer la phase 2.

Quand tu veux, je t'aide à scaffolder le repo concrètement (structure de fichiers, configs, schéma Prisma initial, premier router tRPC, premier flow d'auth). Dis-moi simplement par quoi tu veux commencer.
