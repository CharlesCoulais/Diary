import { useState } from 'react';
import { Link } from 'react-router-dom';
import { trpc } from '../lib/trpc';

// ── Types ────────────────────────────────────────────────────────────────────

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface Param {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

interface Endpoint {
  method: Method;
  path: string;
  summary: string;
  description?: string;
  auth: boolean;
  query?: Param[];
  body?: Param[];
  response: string;
}

interface Section {
  title: string;
  endpoints: Endpoint[];
}

// ── API definition ────────────────────────────────────────────────────────────

const BASE_URL = window.location.origin;

const SECTIONS: Section[] = [
  {
    title: 'Entrées',
    endpoints: [
      {
        method: 'GET',
        path: '/api/entries',
        summary: 'Lister les entrées',
        description: 'Retourne les entrées non supprimées, triées par date décroissante. Supporte la pagination et les filtres.',
        auth: true,
        query: [
          { name: 'from', type: 'string', required: false, description: 'Date de début (YYYY-MM-DD)' },
          { name: 'to', type: 'string', required: false, description: 'Date de fin (YYYY-MM-DD)' },
          { name: 'noteType', type: 'enum', required: false, description: 'JOURNAL · BOOK · SERIES · MOVIE · MUSIC · OUTING · SHOPPING · DEV · QUIZZ' },
          { name: 'isDraft', type: 'boolean', required: false, description: 'true pour ne voir que les brouillons' },
          { name: 'visibility', type: 'enum', required: false, description: 'PRIVATE · SHARED_ALL · SHARED_SPECIFIC' },
          { name: 'limit', type: 'number', required: false, description: 'Nombre de résultats (défaut: 50, max: 200)' },
          { name: 'offset', type: 'number', required: false, description: 'Décalage pour la pagination (défaut: 0)' },
        ],
        response: JSON.stringify({ total: 42, limit: 50, offset: 0, entries: [{ id: '…', date: '2026-05-08T00:00:00.000Z', title: 'Titre', contentMd: '…', noteType: 'JOURNAL', mood: '😊', visibility: 'PRIVATE', isDraft: false, tagNames: ['tag1'], createdAt: '…', updatedAt: '…' }] }, null, 2),
      },
      {
        method: 'GET',
        path: '/api/entries/:id',
        summary: 'Récupérer une entrée',
        auth: true,
        response: JSON.stringify({ id: '…', date: '2026-05-08T00:00:00.000Z', title: 'Titre', contentMd: '# Bonjour\n\nContenu en Markdown.', noteType: 'JOURNAL', mood: '😊', sleepHours: 7.5, weather: '☀️', section: 'MORNING', timeLabel: null, visibility: 'PRIVATE', isDraft: false, isForConfidant: false, tagNames: ['personnel'], version: 3, createdAt: '…', updatedAt: '…' }, null, 2),
      },
      {
        method: 'POST',
        path: '/api/entries',
        summary: 'Créer une entrée',
        auth: true,
        body: [
          { name: 'date', type: 'string', required: true, description: 'Date logique YYYY-MM-DD' },
          { name: 'contentMd', type: 'string', required: true, description: 'Contenu Markdown (voir syntaxe éditeur ci-dessous)' },
          { name: 'title', type: 'string', required: false, description: 'Titre optionnel' },
          { name: 'noteType', type: 'enum', required: false, description: 'JOURNAL · BOOK · SERIES · MOVIE · MUSIC · OUTING · SHOPPING · DEV · QUIZZ  (défaut: JOURNAL)' },
          { name: 'section', type: 'enum', required: false, description: 'MORNING · LATE_MORNING · NOON · AFTERNOON · LATE_AFTERNOON · EARLY_EVENING · EVENING · NIGHT · FREE' },
          { name: 'timeLabel', type: 'string', required: false, description: 'Heure au format HH:MM (alternatif à section)' },
          { name: 'visibility', type: 'enum', required: false, description: 'PRIVATE · SHARED_ALL · SHARED_SPECIFIC  (défaut: PRIVATE)' },
          { name: 'mood', type: 'string', required: false, description: 'Humeur libre (emoji, texte…)' },
          { name: 'sleepHours', type: 'number', required: false, description: 'Heures de sommeil (0–24)' },
          { name: 'weather', type: 'string', required: false, description: 'Météo libre (emoji, texte…)' },
          { name: 'isDraft', type: 'boolean', required: false, description: 'Brouillon (défaut: false)' },
          { name: 'isForConfidant', type: 'boolean', required: false, description: 'Marqué pour le confident (défaut: false)' },
          { name: 'tagNames', type: 'string[]', required: false, description: 'Liste de tags à associer' },
          { name: 'mediaMeta', type: 'object', required: false, description: 'Métadonnées média — voir section mediaMeta ci-dessous' },
          { name: 'font', type: 'string', required: false, description: 'Clé de police — voir section Polices ci-dessous' },
          { name: 'fontSize', type: 'string', required: false, description: 'Taille de police ex: "14px" · "17px" · "21px"' },
        ],
        response: JSON.stringify({ id: '…', date: '2026-05-08T00:00:00.000Z', title: null, contentMd: '# Bonjour', noteType: 'JOURNAL', visibility: 'PRIVATE', isDraft: false, tagNames: [], version: 1, createdAt: '…', updatedAt: '…' }, null, 2),
      },
      {
        method: 'PATCH',
        path: '/api/entries/:id',
        summary: 'Modifier une entrée',
        description: 'Tous les champs sont optionnels. Passer null efface un champ. Une révision est automatiquement créée si contentMd change.',
        auth: true,
        body: [
          { name: 'title', type: 'string | null', required: false, description: 'Nouveau titre' },
          { name: 'contentMd', type: 'string', required: false, description: 'Nouveau contenu (crée une révision automatiquement)' },
          { name: 'noteType', type: 'enum', required: false, description: 'Nouveau type' },
          { name: 'section', type: 'enum | null', required: false, description: 'Nouvelle section ou null' },
          { name: 'visibility', type: 'enum', required: false, description: 'Nouvelle visibilité' },
          { name: 'mood', type: 'string | null', required: false, description: 'Humeur ou null' },
          { name: 'sleepHours', type: 'number | null', required: false, description: 'Heures de sommeil ou null' },
          { name: 'weather', type: 'string | null', required: false, description: 'Météo ou null' },
          { name: 'isDraft', type: 'boolean', required: false, description: 'Statut brouillon' },
          { name: 'isForConfidant', type: 'boolean', required: false, description: 'Marqué pour le confident' },
          { name: 'font', type: 'string | null', required: false, description: 'Clé de police ou null' },
          { name: 'tagNames', type: 'string[]', required: false, description: 'Remplace la liste de tags complète' },
        ],
        response: JSON.stringify({ id: '…', title: 'Titre modifié', contentMd: '# Nouveau contenu', visibility: 'SHARED_ALL', tagNames: ['important'], version: 4, updatedAt: '…' }, null, 2),
      },
    ],
  },
  {
    title: 'Tags',
    endpoints: [
      {
        method: 'GET',
        path: '/api/tags',
        summary: 'Lister les tags',
        description: 'Retourne tous les tags du propriétaire avec leur nombre d\'utilisations, triés par nom.',
        auth: true,
        query: [
          { name: 'q', type: 'string', required: false, description: 'Recherche textuelle (insensible à la casse)' },
        ],
        response: JSON.stringify([
          { id: '…', name: 'personnel', kind: 'OTHER', color: null, entryCount: 12 },
          { id: '…', name: 'lecture', kind: 'THEME', color: '#6366f1', entryCount: 5 },
        ], null, 2),
      },
    ],
  },
  {
    title: 'Tasks',
    endpoints: [
      {
        method: 'GET',
        path: '/api/tasks',
        summary: 'Lister les tâches',
        description: 'Retourne toutes les tâches non supprimées, groupées par catégorie avec un résumé.',
        auth: true,
        response: JSON.stringify({
          summary: { total: 2, byStatus: { OPEN: 1, DEPLOYED: 1 }, byType: { Feature: 1, 'Bug fix': 1 } },
          grouped: { 'Dev': [{ id: '…', title: 'Ma tâche', status: 'OPEN', taskType: 'Feature', priority: 'HIGH', category: 'Dev', notes: null, dueDate: null, createdAt: '…', updatedAt: '…' }] },
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/api/tasks',
        summary: 'Créer une tâche',
        auth: true,
        body: [
          { name: 'title', type: 'string', required: true, description: 'Titre de la tâche' },
          { name: 'status', type: 'enum', required: false, description: 'OPEN · IN_PROGRESS · LOCAL_DONE · TO_TEST · DONE · DEPLOYED · SCHEDULED · CANCELLED  (défaut: OPEN)' },
          { name: 'category', type: 'string', required: false, description: 'Catégorie libre' },
          { name: 'taskType', type: 'string', required: false, description: 'Type libre (Feature, Bug fix, Enhancement…)' },
          { name: 'priority', type: 'enum', required: false, description: 'HIGH · MEDIUM · LOW' },
          { name: 'notes', type: 'string', required: false, description: 'Notes détaillées' },
          { name: 'dueDate', type: 'string', required: false, description: 'Échéance au format YYYY-MM-DD' },
        ],
        response: JSON.stringify({ id: '…', title: 'Nouvelle tâche', status: 'OPEN', taskType: 'Feature', priority: null, category: 'Dev', notes: null, dueDate: null, createdAt: '…', updatedAt: '…' }, null, 2),
      },
      {
        method: 'PATCH',
        path: '/api/tasks/:id',
        summary: 'Modifier une tâche',
        description: 'Tous les champs sont optionnels. Passer null efface un champ.',
        auth: true,
        body: [
          { name: 'title', type: 'string', required: false, description: 'Nouveau titre' },
          { name: 'status', type: 'enum', required: false, description: 'Nouveau statut' },
          { name: 'category', type: 'string | null', required: false, description: 'Nouvelle catégorie ou null pour effacer' },
          { name: 'taskType', type: 'string | null', required: false, description: 'Nouveau type ou null pour effacer' },
          { name: 'priority', type: 'enum | null', required: false, description: 'HIGH · MEDIUM · LOW ou null pour effacer' },
          { name: 'notes', type: 'string | null', required: false, description: 'Nouvelles notes ou null pour effacer' },
          { name: 'dueDate', type: 'string | null', required: false, description: 'YYYY-MM-DD ou null pour effacer' },
        ],
        response: JSON.stringify({ id: '…', title: 'Tâche modifiée', status: 'DEPLOYED', taskType: 'Feature', priority: 'HIGH', category: 'Dev', notes: null, dueDate: null, createdAt: '…', updatedAt: '…' }, null, 2),
      },
    ],
  },
  {
    title: 'Stats',
    endpoints: [
      {
        method: 'GET',
        path: '/api/stats',
        summary: 'Statistiques du journal',
        description: 'Retourne les métriques globales : total d\'entrées, jours écrits, streaks, types, top tags et humeurs.',
        auth: true,
        response: JSON.stringify({
          totalEntries: 248,
          totalDays: 180,
          currentStreak: 7,
          bestStreak: 21,
          todayWritten: true,
          typeCounts: { JOURNAL: 200, BOOK: 30, MUSIC: 18 },
          topTags: [['lecture', 12], ['perso', 8]],
          topMoods: [['😊', 45], ['😴', 20]],
        }, null, 2),
      },
    ],
  },
];

// ── Reference data ────────────────────────────────────────────────────────────

const ENUMS = [
  {
    name: 'NoteType',
    description: 'Type d\'une entrée de journal',
    values: [
      { value: 'JOURNAL', description: 'Note de journal quotidien' },
      { value: 'BOOK', description: 'Livre — mediaMeta: subject, creator, progressCurrent, progressTotal, rating, status, isbn, coverUrl' },
      { value: 'SERIES', description: 'Série — mediaMeta: subject, creator, season, progressCurrent, progressTotal, totalSeasons, seasonsWatched, rating, status, coverUrl, tmdbId' },
      { value: 'MOVIE', description: 'Film — mediaMeta: subject, creator, rating, status, coverUrl, tmdbId' },
      { value: 'MUSIC', description: 'Musique — mediaMeta: subject (album), creator (artiste), trackTitle, streamUrl, rating, coverUrl' },
      { value: 'OUTING', description: 'Sortie / lieu' },
      { value: 'SHOPPING', description: 'Shopping — liens produits via le champ links[]' },
      { value: 'DEV', description: 'Note de développement' },
    ],
  },
  {
    name: 'Visibility',
    description: 'Visibilité d\'une entrée',
    values: [
      { value: 'PRIVATE', description: 'Visible uniquement par le propriétaire (défaut)' },
      { value: 'SHARED_ALL', description: 'Visible par tous les invités avec accès ALL' },
      { value: 'SHARED_SPECIFIC', description: 'Visible uniquement par les invités explicitement nommés' },
    ],
  },
  {
    name: 'EntrySection',
    description: 'Section temporelle d\'une entrée (alternatif à timeLabel)',
    values: [
      { value: 'MORNING', description: 'Matin (06h-10h)' },
      { value: 'LATE_MORNING', description: 'Fin de matinée (10h-12h)' },
      { value: 'NOON', description: 'Midi (12h-14h)' },
      { value: 'AFTERNOON', description: 'Après-midi (14h-16h)' },
      { value: 'LATE_AFTERNOON', description: "Fin d'après-midi (16h-18h)" },
      { value: 'EARLY_EVENING', description: 'Début de soirée (18h-20h)' },
      { value: 'EVENING', description: 'Soir (20h-22h)' },
      { value: 'NIGHT', description: 'Nuit (22h+)' },
      { value: 'FREE', description: 'Libre (sans repère horaire)' },
    ],
  },
  {
    name: 'TaskStatus',
    description: 'Statut d\'une tâche. Cycle recommandé : OPEN → IN_PROGRESS → LOCAL_DONE → DEPLOYED → TO_TEST → DONE',
    values: [
      { value: 'OPEN', description: 'Ouverte, non commencée' },
      { value: 'IN_PROGRESS', description: 'En cours de développement' },
      { value: 'LOCAL_DONE', description: 'Terminée localement, pas encore déployée' },
      { value: 'DEPLOYED', description: 'Déployée en production — à tester' },
      { value: 'TO_TEST', description: 'En cours de test en production' },
      { value: 'DONE', description: 'Testée et validée — terminée' },
      { value: 'SCHEDULED', description: 'Planifiée pour une date future' },
      { value: 'CANCELLED', description: 'Annulée' },
      { value: 'MIGRATED', description: 'Alias legacy de DEPLOYED (rétrocompatibilité)' },
    ],
  },
  {
    name: 'TaskPriority',
    description: 'Priorité d\'une tâche',
    values: [
      { value: 'HIGH', description: '🔴 Haute priorité' },
      { value: 'MEDIUM', description: '🟠 Priorité moyenne' },
      { value: 'LOW', description: '🟡 Basse priorité' },
    ],
  },
  {
    name: 'TagKind',
    description: 'Catégorie sémantique d\'un tag',
    values: [
      { value: 'EMOTION', description: 'Émotion ou état d\'esprit' },
      { value: 'THEME', description: 'Thème ou sujet' },
      { value: 'PERSON', description: 'Personne' },
      { value: 'PLACE', description: 'Lieu' },
      { value: 'OTHER', description: 'Autre (défaut pour les tags créés via l\'API)' },
    ],
  },
];

const FONTS = [
  { key: 'serif', label: 'Classique', family: 'Georgia, serif' },

  // Tendresse
  { key: 'lavishly', label: 'Lavishly', family: 'Lavishly Yours' },
  { key: 'oooh-baby', label: 'Oooh Baby', family: 'Oooh Baby' },
  { key: 'parisienne', label: 'Parisienne', family: 'Parisienne' },
  { key: 'engagement', label: 'Engagement', family: 'Engagement' },
  { key: 'gwendolyn', label: 'Gwendolyn', family: 'Gwendolyn' },
  { key: 'updock', label: 'Updock', family: 'Updock' },
  { key: 'allura', label: 'Allura', family: 'Allura' },
  { key: 'great-vibes', label: 'Great Vibes', family: 'Great Vibes' },
  { key: 'dancing-script', label: 'Dancing Script', family: 'Dancing Script' },
  { key: 'montez', label: 'Montez', family: 'Montez' },
  { key: 'shantell', label: 'Shantell Sans', family: 'Shantell Sans' },

  // Intime
  { key: 'indie', label: 'Indie Flower', family: 'Indie Flower' },
  { key: 'kalam', label: 'Kalam', family: 'Kalam' },
  { key: 'patrick-hand', label: 'Patrick Hand', family: 'Patrick Hand' },
  { key: 'handlee', label: 'Handlee', family: 'Handlee' },
  { key: 'playpen-sans', label: 'Playpen Sans', family: 'Playpen Sans' },
  { key: 'playwrite-fr-moderne', label: 'Manuscrit FR', family: 'Playwrite FR Moderne' },

  // Calme
  { key: 'nunito', label: 'Nunito', family: 'Nunito' },
  { key: 'dosis', label: 'Dosis', family: 'Dosis' },

  // Rêverie
  { key: 'cormorant', label: 'Cormorant', family: 'Cormorant Garamond' },
  { key: 'crimson-pro', label: 'Crimson Pro', family: 'Crimson Pro' },
  { key: 'eb-garamond', label: 'EB Garamond', family: 'EB Garamond' },
  { key: 'spectral', label: 'Spectral', family: 'Spectral' },
  { key: 'cinzel', label: 'Cinzel', family: 'Cinzel' },
  { key: 'courier', label: 'Courier Prime', family: 'Courier Prime' },
  { key: 'caveat', label: 'Caveat', family: 'Caveat' },
  { key: 'shadows-into-light', label: 'Shadows Into Light', family: 'Shadows Into Light' },

  // Joie
  { key: 'fredoka', label: 'Fredoka', family: 'Fredoka' },
  { key: 'pacifico', label: 'Pacifico', family: 'Pacifico' },
  { key: 'twinkle-star', label: 'Twinkle Star', family: 'Twinkle Star' },

  // Intensité
  { key: 'permanent-marker', label: 'Permanent Marker', family: 'Permanent Marker' },
  { key: 'sedgwick-ave-display', label: 'Sedgwick Ave', family: 'Sedgwick Ave Display' },
  { key: 'oregano', label: 'Oregano', family: 'Oregano' },
  { key: 'momo-signature', label: 'Momo Signature', family: 'Momo Signature' },
  { key: 'srisakdi', label: 'Srisakdi', family: 'Srisakdi' },
  { key: 'caveat-brush', label: 'Caveat Brush', family: 'Caveat Brush' },
  { key: 'rock-salt', label: 'Rock Salt', family: 'Rock Salt' },
];

const EDITOR_SYNTAX = [
  {
    syntax: ':::branch\n\nContenu de la branche\n\n:::',
    description: 'Bloc repliable (sidebar). Branch libre, non lié à un passage du texte.',
  },
  {
    syntax: ':::branch "texte ancre"\n\nContenu de la branche\n\n:::',
    description: 'Branch lié à une sélection de texte. Le texte entre guillemets est la portion du texte principal à laquelle cette branch est rattachée — il est mis en évidence dans le lecteur.',
  },
  {
    syntax: ':::edit "2026-05-08T10:30:00.000Z"\n\nTexte ajouté après coup\n\n:::',
    description: 'Bloc de rédaction différée — affiche la date d\'ajout. Optionnel: :::edit "datetime" "texte ancre"',
  },
  {
    syntax: ':::audio "https://…/audio.mp3" "Nom du fichier"',
    description: 'Lecteur audio intégré. Référence une URL d\'audio hébergé (ou une URL interne /audios/:id).',
  },
  {
    syntax: ':::chat platform="whatsapp" with="Alice" me="Moi" aliases="Alice%20Dupont=Alice"\n[14/05 14:32] Alice\nSalut !\n❤️ Moi\n\n[14/05 14:33] Moi\n> Alice: Salut !\nCoucou\n![](/images/abc)\n:::',
    description: 'Conversation intégrée (WhatsApp, Slack, Discord, SMS, iMessage, Messenger, Telegram, Signal, Instagram, other). Attributs : platform (couleur du rendu), with (interlocuteur affiché en header), me (auteur considéré comme "moi", aligné à droite), aliases (renommage display : "OriginalName=Alias, ..."). À l\'intérieur du bloc, chaque message commence par [date heure] Auteur en en-tête. Les images se réfèrent comme ![](url) sur leur propre ligne. Les réactions sont une ligne emoji(s) auteur · auteur. Les citations sont une ligne "> Auteur: contenu" en tête de message.',
  },
  {
    syntax: '![alt](https://…/image.jpg)',
    description: 'Image standard Markdown. Référence une URL d\'image (ou /images/:id pour les images hébergées).',
  },
  {
    syntax: '`code inline`\n\n```js\ncode block\n```',
    description: 'Code inline et blocs de code avec coloration syntaxique (langages via lowlight).',
  },
];

const MEDIA_META = [
  { noteType: 'BOOK', fields: 'subject (titre), creator (auteur), isbn, progressCurrent (page actuelle), progressTotal (total pages), rating (1–5), status (ongoing·finished·abandoned), coverUrl, description' },
  { noteType: 'SERIES', fields: 'subject (titre), creator (réalisateur/showrunner), season (numéro saison), progressCurrent (épisode actuel), progressTotal (total épisodes), totalSeasons (nb de saisons), seasonsWatched[] (suivi par saison : { number, episodes, watched: n° d\'épisodes vus, title? }), rating (1–5), status (ongoing·finished·abandoned), coverUrl, tmdbId' },
  { noteType: 'MOVIE', fields: 'subject (titre), creator (réalisateur), rating (1–5), status (ongoing·finished·abandoned), coverUrl, tmdbId, description' },
  { noteType: 'MUSIC', fields: 'subject (album), creator (artiste), trackTitle (titre du morceau), streamUrl (URL du flux audio), rating (1–5), coverUrl' },
  { noteType: 'OUTING', fields: 'subject (lieu ou nom de la sortie), description' },
  { noteType: 'DEV', fields: 'subject (titre du chapitre), seriesName (thème), volume (n° de partie), partName (nom de la partie), totalVolumes (nb de parties), chapter (n° de chapitre), totalChapters (nb de chapitres), rating (1–5), status' },
  { noteType: 'QUIZZ', fields: 'subject (titre du quizz), seriesName (thème), volume (n° du quizz dans le thème), totalVolumes (total de quizz du thème), quizQuestions[] (questions — voir détail ci-dessous), quizShuffleQuestions (bool), quizShuffleOptions (bool)' },
];

// ── Components ───────────────────────────────────────────────────────────────

const METHOD_COLORS: Record<Method, string> = {
  GET: 'bg-success/15 text-success',
  POST: 'bg-accent/15 text-accent',
  PATCH: 'bg-warning/15 text-warning',
  DELETE: 'bg-danger/15 text-danger',
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="text-[11px] font-medium text-text-muted hover:text-text-primary transition-colors px-2 py-0.5 rounded bg-bg-primary border border-text-muted/10"
    >
      {copied ? '✓ Copié' : 'Copier'}
    </button>
  );
}

function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="mt-2">
      {label && <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">{label}</p>}
      <div className="relative bg-bg-primary rounded-xl border border-text-muted/10 overflow-hidden">
        <div className="absolute top-2 right-2">
          <CopyButton text={code} />
        </div>
        <pre className="text-xs text-text-primary font-mono p-3 pr-16 overflow-x-auto leading-relaxed whitespace-pre-wrap">{code}</pre>
      </div>
    </div>
  );
}

function ParamTable({ params, title }: { params: Param[]; title: string }) {
  return (
    <div className="mt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">{title}</p>
      <div className="rounded-xl border border-text-muted/10 overflow-hidden">
        {params.map((p, i) => (
          <div key={p.name} className={`flex gap-3 px-3 py-2 text-xs ${i > 0 ? 'border-t border-text-muted/10' : ''}`}>
            <span className="font-mono font-medium text-accent shrink-0 w-28">{p.name}</span>
            <span className="font-mono text-text-muted/70 shrink-0 w-24">{p.type}</span>
            <span className={`shrink-0 text-[11px] font-medium px-1.5 py-0.5 rounded self-start ${p.required ? 'bg-accent/10 text-accent' : 'bg-text-muted/10 text-text-muted'}`}>
              {p.required ? 'requis' : 'optionnel'}
            </span>
            <span className="text-text-muted leading-relaxed">{p.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EndpointCard({ endpoint }: { endpoint: Endpoint }) {
  const [open, setOpen] = useState(false);
  const fullPath = `${BASE_URL}${endpoint.path}`;
  const authNote = endpoint.auth ? '?token=<votre_clé>' : '';

  return (
    <div className="bg-bg-elevated rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-text-muted/5 transition-colors"
      >
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0 font-mono ${METHOD_COLORS[endpoint.method]}`}>
          {endpoint.method}
        </span>
        <span className="font-mono text-sm text-text-primary">{endpoint.path}</span>
        <span className="text-xs text-text-muted flex-1">{endpoint.summary}</span>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`w-4 h-4 text-text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-1 border-t border-text-muted/10 pt-3">
          {endpoint.description && (
            <p className="text-xs text-text-muted leading-relaxed">{endpoint.description}</p>
          )}

          <CodeBlock
            label="URL"
            code={`${fullPath}${authNote}`}
          />

          {endpoint.query && <ParamTable params={endpoint.query} title="Query params" />}
          {endpoint.body && <ParamTable params={endpoint.body} title="Body (JSON)" />}

          <CodeBlock label="Réponse" code={endpoint.response} />
        </div>
      )}
    </div>
  );
}

function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-bg-elevated rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-text-muted/5 transition-colors"
      >
        <span className="text-sm font-medium text-text-primary flex-1">{title}</span>
        <svg viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 text-text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-text-muted/10 pt-3">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Markdown export ───────────────────────────────────────────────────────────

function generateMarkdown(): string {
  const lines: string[] = [];
  lines.push('# Diary — API REST');
  lines.push('');
  lines.push(`> Base URL: ${BASE_URL}`);
  lines.push('');
  lines.push('## Authentification');
  lines.push('');
  lines.push('Toutes les routes protégées requièrent une clé API (query param ou header) :');
  lines.push('');
  lines.push('```');
  lines.push(`GET ${BASE_URL}/api/tasks?token=<votre_clé>`);
  lines.push('Authorization: Bearer <votre_clé>');
  lines.push('```');
  lines.push('');

  for (const section of SECTIONS) {
    lines.push(`## ${section.title}`);
    lines.push('');
    for (const ep of section.endpoints) {
      lines.push(`### \`${ep.method} ${ep.path}\``);
      lines.push('');
      lines.push(ep.summary);
      if (ep.description) { lines.push(''); lines.push(ep.description); }
      lines.push('');
      if (ep.auth) {
        lines.push('**Authentification requise.**');
        lines.push('');
      }
      if (ep.query?.length) {
        lines.push('**Query params :**');
        lines.push('');
        lines.push('| Nom | Type | Requis | Description |');
        lines.push('|-----|------|--------|-------------|');
        for (const p of ep.query) {
          lines.push(`| \`${p.name}\` | \`${p.type}\` | ${p.required ? '✓' : '—'} | ${p.description} |`);
        }
        lines.push('');
      }
      if (ep.body?.length) {
        lines.push('**Body (JSON) :**');
        lines.push('');
        lines.push('| Nom | Type | Requis | Description |');
        lines.push('|-----|------|--------|-------------|');
        for (const p of ep.body) {
          lines.push(`| \`${p.name}\` | \`${p.type}\` | ${p.required ? '✓' : '—'} | ${p.description} |`);
        }
        lines.push('');
      }
      lines.push('**Réponse exemple :**');
      lines.push('');
      lines.push('```json');
      lines.push(ep.response);
      lines.push('```');
      lines.push('');
    }
  }

  lines.push('---');
  lines.push(`*Généré le ${new Date().toLocaleDateString('fr-FR')}*`);
  return lines.join('\n');
}

function ExportMarkdownButton() {
  const [done, setDone] = useState(false);
  const handleExport = () => {
    const md = generateMarkdown();
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-doc-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  };
  return (
    <button
      type="button"
      onClick={handleExport}
      title="Exporter la doc en Markdown"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-text-muted/10 text-text-muted hover:bg-text-muted/20 transition-colors"
    >
      {done ? (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-success)' }}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Téléchargé
        </>
      ) : (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          .md
        </>
      )}
    </button>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function ApiDocsPage() {
  const { data: keyStatus } = trpc.apiKeys.status.useQuery();

  return (
    <div className="min-h-dvh px-6 py-10 pb-20 max-w-3xl mx-auto">
      <header className="mb-8 flex items-start gap-3">
        <Link to="/settings" className="mt-2 text-text-muted hover:text-text-primary transition-colors shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex-1">
          <h1 className="font-serif text-4xl text-text-primary">API</h1>
          <p className="text-sm text-text-muted mt-1">Documentation de l'API REST</p>
        </div>
        <div className="mt-2">
          <ExportMarkdownButton />
        </div>
      </header>

      {/* Auth */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-3">Authentification</h2>
        <div className="bg-bg-elevated rounded-2xl p-4 space-y-3">
          <p className="text-sm text-text-primary leading-relaxed">
            Toutes les routes protégées requièrent une clé API. Passe-la en query param ou en header.
          </p>
          <CodeBlock label="Query param" code={`GET ${BASE_URL}/api/tasks?token=<votre_clé>`} />
          <CodeBlock label="Header" code={`Authorization: Bearer <votre_clé>`} />
          {keyStatus && !keyStatus.hasKey && (
            <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 rounded-xl px-3 py-2">
              <span>Aucune clé active.</span>
              <Link to="/settings" className="underline hover:no-underline">Générer une clé dans les réglages →</Link>
            </div>
          )}
          {keyStatus?.hasKey && (
            <div className="flex items-center gap-2 text-xs text-success">
              <span>● Clé active</span>
              <Link to="/settings" className="text-text-muted hover:text-text-primary transition-colors underline">Gérer →</Link>
            </div>
          )}
        </div>
      </section>

      {/* Base URL */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-3">Base URL</h2>
        <div className="bg-bg-elevated rounded-2xl p-4">
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm font-mono text-text-primary">{BASE_URL}</code>
            <CopyButton text={BASE_URL} />
          </div>
        </div>
      </section>

      {/* Endpoints */}
      {SECTIONS.map((section) => (
        <section key={section.title} className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-3">{section.title}</h2>
          <div className="space-y-2">
            {section.endpoints.map((ep) => (
              <EndpointCard key={`${ep.method}-${ep.path}`} endpoint={ep} />
            ))}
          </div>
        </section>
      ))}

      {/* Reference */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-3">Référence</h2>
        <div className="space-y-2">

          {/* Enums */}
          {ENUMS.map((e) => (
            <CollapsibleSection key={e.name} title={`Enum: ${e.name}`}>
              <p className="text-xs text-text-muted mb-3">{e.description}</p>
              <div className="rounded-xl border border-text-muted/10 overflow-hidden">
                {e.values.map((v, i) => (
                  <div key={v.value} className={`flex gap-3 px-3 py-2 text-xs ${i > 0 ? 'border-t border-text-muted/10' : ''}`}>
                    <span className="font-mono font-medium text-accent shrink-0 w-32">{v.value}</span>
                    <span className="text-text-muted">{v.description}</span>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          ))}

          {/* mediaMeta by noteType */}
          <CollapsibleSection title="mediaMeta par noteType">
            <p className="text-xs text-text-muted mb-3">Champs disponibles dans l'objet <code className="font-mono bg-bg-primary px-1 rounded">mediaMeta</code> selon le type de note.</p>
            <div className="rounded-xl border border-text-muted/10 overflow-hidden">
              {MEDIA_META.map((m, i) => (
                <div key={m.noteType} className={`flex gap-3 px-3 py-2.5 text-xs ${i > 0 ? 'border-t border-text-muted/10' : ''}`}>
                  <span className="font-mono font-medium text-accent shrink-0 w-20">{m.noteType}</span>
                  <span className="text-text-muted leading-relaxed">{m.fields}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-text-muted">
              <p>Les types <code className="font-mono bg-bg-primary px-1 rounded">JOURNAL</code> et <code className="font-mono bg-bg-primary px-1 rounded">SHOPPING</code> n'utilisent pas mediaMeta.</p>
              <p className="mt-1">Pour <code className="font-mono bg-bg-primary px-1 rounded">SHOPPING</code>, les liens produits sont dans le champ <code className="font-mono bg-bg-primary px-1 rounded">links[]</code> (url, title, image, siteName).</p>
            </div>
          </CollapsibleSection>

          {/* QUIZZ — structure des questions */}
          <CollapsibleSection title="Créer un quizz (QUIZZ)">
            <p className="text-xs text-text-muted mb-3">
              Pour un quizz, mets <code className="font-mono bg-bg-primary px-1 rounded">noteType: "QUIZZ"</code> et place les questions dans <code className="font-mono bg-bg-primary px-1 rounded">mediaMeta.quizQuestions</code>. Chaque question est un objet :
            </p>
            <div className="rounded-xl border border-text-muted/10 overflow-hidden">
              <pre className="text-xs font-mono text-accent bg-bg-primary p-3 leading-relaxed overflow-x-auto">{`{
  "id": "q1",            // optionnel — généré automatiquement si absent
  "type": "qcm",         // "qcm" (choix) ou "free" (réponse libre)
  "prompt": "Question ?", // énoncé (Markdown : code, gras, liens…)
  "image": "/images/:id", // optionnel — illustration de l'énoncé

  // — si type = "qcm" —
  "options": ["A", "B", "C"],
  "correct": [0, 2],     // indices des bonnes options (1 ou +)
  "multi": true,         // true = cases à cocher, false = choix unique

  // — si type = "free" —
  "accepted": ["état", "etat"], // réponses acceptées (casse/accents ignorés)

  "explanation": "…"     // optionnel — affichée après correction
}`}</pre>
            </div>
            <div className="mt-3 text-xs text-text-muted space-y-1">
              <p><code className="font-mono bg-bg-primary px-1 rounded">correct</code>, <code className="font-mono bg-bg-primary px-1 rounded">accepted</code> et <code className="font-mono bg-bg-primary px-1 rounded">explanation</code> sont les données « solution » : elles ne sont <strong>jamais</strong> envoyées aux confidents avant validation (correction côté serveur).</p>
              <p>Regroupe plusieurs quizz d'un même thème via <code className="font-mono bg-bg-primary px-1 rounded">seriesName</code> (thème), <code className="font-mono bg-bg-primary px-1 rounded">volume</code> (n°) et <code className="font-mono bg-bg-primary px-1 rounded">totalVolumes</code> (total visé).</p>
              <p>Un quizz mal formé est refusé avec un code <code className="font-mono bg-bg-primary px-1 rounded">400</code> détaillant le champ fautif.</p>
            </div>
          </CollapsibleSection>

          {/* Editor syntax */}
          <CollapsibleSection title="Syntaxe de l'éditeur">
            <p className="text-xs text-text-muted mb-3">
              Le contenu (<code className="font-mono bg-bg-primary px-1 rounded">contentMd</code>) est du Markdown standard enrichi de blocs personnalisés.
            </p>
            <div className="space-y-3">
              {EDITOR_SYNTAX.map((s, i) => (
                <div key={i} className="rounded-xl border border-text-muted/10 overflow-hidden">
                  <pre className="text-xs font-mono text-accent bg-bg-primary p-3 leading-relaxed">{s.syntax}</pre>
                  <div className="px-3 py-2 border-t border-text-muted/10">
                    <p className="text-xs text-text-muted">{s.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>

          {/* Fonts */}
          <CollapsibleSection title="Polices disponibles">
            <p className="text-xs text-text-muted mb-3">Valeurs valides pour le champ <code className="font-mono bg-bg-primary px-1 rounded">font</code>.</p>
            <div className="rounded-xl border border-text-muted/10 overflow-hidden">
              {FONTS.map((f, i) => (
                <div key={f.key} className={`flex gap-3 px-3 py-2 text-xs items-center ${i > 0 ? 'border-t border-text-muted/10' : ''}`}>
                  <span className="font-mono font-medium text-accent shrink-0 w-40">{f.key}</span>
                  <span className="text-text-muted/70 shrink-0 flex-1">{f.label}</span>
                  <span className="text-text-muted/50 font-mono text-[11px]">{f.family}</span>
                </div>
              ))}
            </div>
          </CollapsibleSection>

        </div>
      </section>
    </div>
  );
}
