/**
 * Seed variants — Une entrée par (type × option) pour tester tous les rendus.
 *
 * 8 types × 8 options = 64 entrées, toutes à la date d'aujourd'hui.
 *
 * Options :
 *   pour-toi      → PRIVATE (défaut)
 *   18+           → isAdult: true
 *   secret        → isSecret: true (invisible au confident)
 *   capsule       → unlockAt dans 1 an
 *   brouillon-2h  → isDraft, créée il y a 1h
 *   brouillon-72h → isDraft, créée il y a 5 jours
 *   pub-4j        → hideUntilAt dans 4 jours (publiée mais différée)
 *   partagé       → SHARED_ALL
 *
 * Lancer : cd apps/api && pnpm exec tsx --env-file=.env scripts/seed-variants.ts
 * Purger  : cd apps/api && pnpm exec tsx --env-file=.env scripts/seed-variants.ts --purge
 */

import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const SEED_TAG = 'SEED_VARIANTS_2026';
const PURGE = process.argv.includes('--purge');

const db = new PrismaClient();

function sha256(s: string) {
  return createHash('sha256').update(s.toLowerCase().trim()).digest('hex');
}

const TODAY = new Date('2026-05-19T00:00:00.000Z');
const now = new Date();

function daysFromNow(days: number) {
  return new Date(now.getTime() + days * 86_400_000);
}
function hoursAgo(h: number) {
  return new Date(now.getTime() - h * 3_600_000);
}

// ─── Types & options ──────────────────────────────────────────────────────────

type NoteType = 'JOURNAL' | 'BOOK' | 'SERIES' | 'MOVIE' | 'MUSIC' | 'OUTING' | 'SHOPPING' | 'DEV';
type OptionKey = 'pour-toi' | '18plus' | 'secret' | 'capsule' | 'brouillon-2h' | 'brouillon-72h' | 'pub-4j' | 'partage';

interface OptionConfig {
  label: string;
  isDraft?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  isAdult?: boolean;
  adultQuestion?: string;
  adultAnswerHash?: string;
  isSecret?: boolean;
  unlockAt?: Date;
  capsuleSpoiler?: string;
  hideUntilAt?: Date;
  visibility?: 'PRIVATE' | 'SHARED_ALL';
}

const OPTIONS: Record<OptionKey, OptionConfig> = {
  'pour-toi':     { label: 'Pour toi',            visibility: 'PRIVATE' },
  '18plus':       { label: '18+',                  isAdult: true, adultQuestion: 'Quel est le mot de passe ?', adultAnswerHash: sha256('adulte'), adultHints: ['Indice 1 : 6 lettres', 'Indice 2 : commence par A', 'Indice 3 : le contraire de enfant'] as any },
  'secret':       { label: 'Secret',               isSecret: true },
  'capsule':      { label: 'Capsule temporelle',   unlockAt: daysFromNow(365), capsuleSpoiler: 'À ouvrir dans un an…' },
  'brouillon-2h': { label: 'Brouillon < 2h',       isDraft: true, createdAt: hoursAgo(1),    updatedAt: hoursAgo(0.5) },
  'brouillon-72h':{ label: 'Brouillon > 72h',      isDraft: true, createdAt: hoursAgo(5*24), updatedAt: hoursAgo(4*24) },
  'pub-4j':       { label: 'Publication dans 4j',  hideUntilAt: daysFromNow(4) },
  'partage':      { label: 'Partagé',              visibility: 'SHARED_ALL' },
};

const NOTE_TYPES: NoteType[] = ['JOURNAL', 'DEV', 'SHOPPING', 'MUSIC', 'BOOK', 'SERIES', 'MOVIE', 'OUTING'];
const OPTION_KEYS: OptionKey[] = ['pour-toi', '18plus', 'secret', 'capsule', 'brouillon-2h', 'brouillon-72h', 'pub-4j', 'partage'];

// ─── Contenu par (type × option) ─────────────────────────────────────────────

type EntryContent = {
  title?: string;
  contentMd: string;
  mediaMeta?: object;
};

const CONTENT: Record<NoteType, Record<OptionKey, EntryContent>> = {

  JOURNAL: {
    'pour-toi': {
      title: 'Journée tranquille',
      contentMd: `Ce matin j'ai pris le temps de faire du café lentement, de regarder par la fenêtre les voitures passer. Quelque chose de simple que je n'avais pas fait depuis longtemps.\n\nL'après-midi j'ai relu quelques anciens messages, j'ai souri sans vraiment savoir pourquoi.\n\n<!-- ${SEED_TAG} -->`,
    },
    '18plus': {
      title: 'Une soirée particulière',
      contentMd: `Soirée avec L. — alcool, conversations franches sur des sujets qu'on n'aborde jamais en journée. Il y avait quelque chose d'électrique dans l'air, une complicité qui s'était installée sans prévenir.\n\nJe ne détaille pas ici mais c'était bien. Vraiment bien.\n\n<!-- ${SEED_TAG} -->`,
    },
    'secret': {
      title: 'Ce que je n\'écris nulle part ailleurs',
      contentMd: `Ces pensées n'appartiennent qu'à moi — doutes profonds, peurs inavouables, une décision que je n'ai pas encore prise et que je tourne dans tous les sens depuis des semaines.\n\nJe les pose ici pour ne pas les garder uniquement dans ma tête.\n\n<!-- ${SEED_TAG} -->`,
    },
    'capsule': {
      title: 'Message à moi dans un an',
      contentMd: `Si tu lis ça, c'est qu'un an a passé. Est-ce que le projet a abouti ? Est-ce que tu as osé ce voyage dont tu parlais en mai 2026 ? Est-ce que tu es toujours en contact avec les mêmes personnes ?\n\nJ'espère que tu vas bien. Vraiment bien — pas juste « ça va ».\n\n<!-- ${SEED_TAG} -->`,
    },
    'brouillon-2h': {
      title: 'Brouillon du matin — à compléter',
      contentMd: `Pas encore fini d'écrire. Commencé il y a une heure, idées encore floues. Revenir ce soir pour compléter.\n\n→ parler de la réunion de ce matin\n→ noter l'humeur de la semaine\n→ la phrase de M. qui m'a marqué\n\n<!-- ${SEED_TAG} -->`,
    },
    'brouillon-72h': {
      title: 'Un moment que j\'ai failli ne pas noter',
      contentMd: `Ça fait plusieurs jours que je tourne autour de cette entrée. Il y a eu ce moment mercredi avec ma mère — une phrase qu'elle a dite et que je n'arrivais pas à formuler correctement.\n\nElle a dit : « tu n'as jamais eu besoin qu'on te porte. » Je ne sais toujours pas si c'était un compliment.\n\n<!-- ${SEED_TAG} -->`,
    },
    'pub-4j': {
      title: 'Publication différée',
      contentMd: `Cette note sera visible pour les confidents dans 4 jours. Je l'écris maintenant pendant que les émotions sont fraîches, mais je veux attendre de voir si ça tient la distance avant de la partager.\n\nCertaines choses méritent de décanter.\n\n<!-- ${SEED_TAG} -->`,
    },
    'partage': {
      title: 'Journée à Lyon',
      contentMd: `Grande journée avec les amis à Lyon. Soleil, marché de la Croix-Rousse, déjeuner qui s'est prolongé jusqu'à 16h. C'est exactement le genre de journée dont j'avais besoin pour recharger.\n\nMerci à M. pour l'invitation de dernière minute. Parfois les plans improvisés sont les meilleurs.\n\n<!-- ${SEED_TAG} -->`,
    },
  },

  DEV: {
    'pour-toi': {
      title: 'Refacto module sync',
      contentMd: `Grosse session de refacto aujourd'hui. Le module sync avait accumulé trop de dette technique — j'ai finalement pris le temps de découper proprement.\n\n\`\`\`ts\nconst handler = createSyncHandler({\n  onConflict: 'server-wins',\n  retryDelay: 2000,\n});\n\`\`\`\n\nLe code est 40% plus court et tous les tests passent. Satisfaisant.\n\n<!-- ${SEED_TAG} -->`,
    },
    '18plus': {
      title: 'Side project — plateforme adulte',
      contentMd: `Notes techniques pour le side project. Gestion des accès, vérification d'âge côté API, floutage CDN des previews. Rien d'illégal, juste un projet qui demande plus d'attention sur les permissions et la modération.\n\nTodo: revoir la CSP et les headers de sécurité.\n\n<!-- ${SEED_TAG} -->`,
    },
    'secret': {
      title: '[Confidentiel] Architecture v2',
      contentMd: `Notes sur la nouvelle architecture qu'on prépare en interne. Pas encore annoncé à l'équipe. Migration vers une infra edge avec workers distribués et un nouveau modèle de données.\n\nNe rien partager avant le 1er juin.\n\n<!-- ${SEED_TAG} -->`,
    },
    'capsule': {
      title: 'Ma stack dans 2 ans',
      contentMd: `Prédictions pour ma stack en 2028 (capsule à ouvrir dans un an) :\n\n- React encore là mais Solid aura gagné du terrain sérieux\n- TypeScript toujours dominant, peut-être Gleam comme outsider\n- Edge computing généralisé dans tous les projets\n- IA dans 70% des workflows dev quotidiens\n\nOn verra à quel point je me suis planté.\n\n<!-- ${SEED_TAG} -->`,
    },
    'brouillon-2h': {
      title: 'Bug étrange — parser unicode',
      contentMd: `Investigating un bug bizarre : le parser rate les blocs imbriqués quand le contenu contient des caractères unicode non-BMP.\n\n\`\`\`\nError: Unexpected token at position 1247\n  → emoji 🏔️ dans le contenu semble casser le lexer\n\`\`\`\n\nPas encore compris pourquoi. À creuser ce soir.\n\n<!-- ${SEED_TAG} -->`,
    },
    'brouillon-72h': {
      title: 'Notes vrac — audit performance',
      contentMd: `Commencé un audit perf il y a quelques jours, pas eu le temps de finir. Points en suspens :\n\n- LCP sur mobile : 3.2s → target 2.0s\n- Bundle size : 420kb → couper les deps inutiles\n- Trop de re-renders dans les composants carte\n\nÀ finir cette semaine absolument.\n\n<!-- ${SEED_TAG} -->`,
    },
    'pub-4j': {
      title: 'Post-mortem incident 15 mai',
      contentMd: `Rapport post-mortem en cours de rédaction. L'incident a duré 47 minutes, 3 régions impactées. Cause racine : race condition dans le déploiement rolling update.\n\nLa publication complète avec les actions correctives sera partagée dans 4 jours après validation interne.\n\n<!-- ${SEED_TAG} -->`,
    },
    'partage': {
      title: 'Première PR open source mergée',
      contentMd: `Ma première contribution open source mergée aujourd'hui ! Un fix sur la gestion des timeouts dans une lib de retry — simple, mais symbolique.\n\nLe maintainer a répondu en 2 heures : _« nice catch, thank you! »_ Petite victoire du mardi.\n\n<!-- ${SEED_TAG} -->`,
    },
  },

  SHOPPING: {
    'pour-toi': {
      title: 'Courses Monoprix',
      contentMd: `Fait les courses ce matin. Budget : 67€ pour la semaine — raisonnable.\n\n- Légumes de saison ✓\n- Café (le bon, pas le discount) ✓\n- Pain de campagne ✓\n- Fromage (brie + chèvre) ✓\n- Bière artisanale pour le week-end ✓\n\n<!-- ${SEED_TAG} -->`,
      mediaMeta: { subject: 'Courses hebdo', status: 'finished' },
    },
    '18plus': {
      title: 'Commande discrète',
      contentMd: `Commande passée sur un site spécialisé. Livraison en colis neutre comme promis. Rien d'extraordinaire mais le genre d'achat qu'on ne note pas partout.\n\nLivraison estimée : 3-5 jours ouvrés.\n\n<!-- ${SEED_TAG} -->`,
    },
    'secret': {
      title: 'Cadeau surprise pour M.',
      contentMd: `Commande du cadeau d'anniversaire pour M. — ne surtout pas qu'il le voit dans mes notes. Un livre collector qu'il cherchait depuis 2 ans + une gravure sur commande.\n\nLivraison dans 5 jours. Je dois penser à récupérer le colis moi-même pour la surprise.\n\n<!-- ${SEED_TAG} -->`,
    },
    'capsule': {
      title: 'Wishlist à ouvrir en novembre',
      contentMd: `Wishlist capsule pour les achats de fin d'année — à relire en novembre :\n\n- Parka hiver (budget : ~200€)\n- Casque audio over-ear\n- Liseuse nouvelle génération\n- Un beau carnet papier japonais\n\nVoir ce qui tient encore dans 6 mois.\n\n<!-- ${SEED_TAG} -->`,
    },
    'brouillon-2h': {
      title: 'Comparer les prix — écran',
      contentMd: `Recherches en cours pour un nouvel écran. Pas encore décidé.\n\n| Modèle | Prix | Note |\n|--------|------|------|\n| LG C4 55" | 1 099€ | ★★★★★ |\n| Sony A80L | 1 299€ | ★★★★ |\n| Samsung S90C | 999€ | ★★★★ |\n\n→ À compléter avec les promos du week-end\n\n<!-- ${SEED_TAG} -->`,
    },
    'brouillon-72h': {
      title: 'Retour à finaliser — sneakers',
      contentMd: `J'ai commandé des sneakers il y a une semaine et je n'ai toujours pas finalisé le retour de la mauvaise taille. Fenêtre de retour : **2 jours restants**.\n\nN° de commande : #FR-8847291\nMotif : taille trop petite (commandé 42, besoin 43)\n\n<!-- ${SEED_TAG} -->`,
    },
    'pub-4j': {
      title: 'Haul en attente de livraison',
      contentMd: `J'ai fait un beau haul ce week-end mais j'attends que tout arrive avant de tout noter ensemble. Livraisons échelonnées jusqu'à jeudi.\n\n- Veste en lin ✓ arrivée\n- Livres × 3 → en transit\n- Plante d'intérieur → livraison jeudi\n\n<!-- ${SEED_TAG} -->`,
    },
    'partage': {
      title: 'Boutique japonaise — Marais',
      contentMd: `Découverte lors d'une balade : une petite boutique japonaise dans le Marais qui vend des objets de papeterie et des produits maison introuvables ailleurs en France.\n\nEncens Nippon Kodo, carnets Midori, thé matcha cérémoniel. **14 rue de Bretagne, Paris 3e** — mar–sam 11h–19h.\n\n<!-- ${SEED_TAG} -->`,
    },
  },

  MUSIC: {
    'pour-toi': {
      title: 'Nouvel album Floating Points',
      contentMd: `Écouté d'une traite. C'est exactement la continuité de _Promises_ — ambient, minimaliste, cette façon de laisser les notes respirer entre les mesures.\n\nMorceaux préférés : track 2 et track 7. À réécouter la nuit avec un bon casque et les lumières éteintes.\n\n<!-- ${SEED_TAG} -->`,
      mediaMeta: { subject: 'Cascade', creator: 'Floating Points', status: 'finished', rating: 5 },
    },
    '18plus': {
      title: 'Playlist soirée tardive',
      contentMd: `Playlist pour les soirées qui finissent trop tard. Mix hypnotique avec des sons pas vraiment appropriés pour toutes les oreilles — quelques morceaux explicites mêlés aux textures ambient.\n\nFavoris du moment : Crystal Castles, Dean Blunt, certains remixes grime hardcore.\n\n<!-- ${SEED_TAG} -->`,
    },
    'secret': {
      title: 'Composition en cours',
      contentMd: `Je compose en secret depuis 3 mois. Personne n'est au courant, pas même mes proches. Un projet instrumental ambient que j'enregistre chez moi le soir après 23h.\n\nJ'ai peur du jugement alors je garde ça pour moi pour l'instant. Un jour peut-être je partagerai.\n\n<!-- ${SEED_TAG} -->`,
    },
    'capsule': {
      title: 'Les sons de 2026',
      contentMd: `Pour moi dans quelques années — les sons qui définissent ce moment de ma vie :\n\n- Arooj Aftab, toute l'œuvre\n- Kelly Lee Owens en loop au bureau\n- Le revival ambient londonien\n- Un air de Satie le matin avec le café\n\nEst-ce que j'écouterai encore ça dans 5 ans ?\n\n<!-- ${SEED_TAG} -->`,
    },
    'brouillon-2h': {
      title: 'Notes concert — impressions fraîches',
      contentMd: `Je reviens tout juste du concert. Encore les oreilles qui bourdonnent. Trop tôt pour écrire quelque chose de construit.\n\nÀ compléter ce soir :\n→ l'ambiance de la salle\n→ le setlist (noter le rappel surprise)\n→ la qualité du son\n\n<!-- ${SEED_TAG} -->`,
    },
    'brouillon-72h': {
      title: 'Classement albums du mois — incomplet',
      contentMd: `Commencé il y a quelques jours, pas fini. Il faut que je réécoute quelques albums avant de publier ça.\n\n1. *(à confirmer)*\n2. *(à confirmer)*\n3. Panda Bear — _Sinister Grift_ (certain)\n\nÀ finir ce week-end.\n\n<!-- ${SEED_TAG} -->`,
    },
    'pub-4j': {
      title: 'Playlist pour Élise',
      contentMd: `Je prépare une sélection musicale pour Élise pour son voyage en train la semaine prochaine. Publication dans 4 jours pour coïncider avec son départ.\n\n3h de musique : calme au départ → crescendo pour les passages de paysage.\n\n<!-- ${SEED_TAG} -->`,
    },
    'partage': {
      title: 'Concert Parcels — incroyable',
      contentMd: `Concert de Parcels hier soir à la Cigale. Ces musiciens ont un groove live qui n'existe pas dans les enregistrements — quelque chose de chaud, d'humain, d'imparfait dans le meilleur sens du terme.\n\n2h30 sans faiblir, le public entièrement dans leur poche. Très fort.\n\n<!-- ${SEED_TAG} -->`,
    },
  },

  BOOK: {
    'pour-toi': {
      title: 'Les Misérables — tome 1',
      contentMd: `Repris Hugo après 15 ans. Ce qui surprend c'est à quel point c'est accessible — on imagine un monument austère, mais il y a beaucoup d'humour, d'ironie, de tendresse.\n\nJe suis à la partie sur l'évêque Myriel. Portrait magnifique d'une bonté non sentimentale.\n\n<!-- ${SEED_TAG} -->`,
      mediaMeta: { subject: 'Les Misérables', creator: 'Victor Hugo', progressCurrent: 1, progressTotal: 5, status: 'ongoing', rating: 5 },
    },
    '18plus': {
      title: 'Histoire d\'O — relu',
      contentMd: `Relu pour la troisième fois. Ce qui frappe à chaque lecture c'est la prose — une froideur clinique qui sert exactement le propos. C'est de la littérature, pas de la pornographie, même si la frontière peut sembler floue selon les sensibilités.\n\n<!-- ${SEED_TAG} -->`,
    },
    'secret': {
      title: 'Lectures inavouables',
      contentMd: `Notes sur des textes que je lis mais que je ne revendique pas publiquement. Pas honteux — juste personnel. Quelques essais politiques très controversés, de la littérature underground des années 70.\n\nLire sans en parler, parfois c'est la bonne option.\n\n<!-- ${SEED_TAG} -->`,
    },
    'capsule': {
      title: 'À lire à des âges précis',
      contentMd: `Livres gardés pour des moments futurs :\n\n- _L'Homme sans qualités_ (Musil) → à 40 ans\n- _La Montagne magique_ (Mann) → prochain hiver\n- _Austerlitz_ (Sebald) → quand je serai prêt à être triste\n- Toute l'œuvre de Blanchot → plus tard, beaucoup plus tard\n\n<!-- ${SEED_TAG} -->`,
    },
    'brouillon-2h': {
      title: 'Critique en cours — Stoner',
      contentMd: `J'écris quelque chose sur _Stoner_ de John Williams mais je n'arrive pas à trouver l'angle. Trop de choses à dire.\n\n→ La médiocrité comme dignité ?\n→ Le roman du ratage sublimé ?\n→ Le sens dans une vie ordinaire ?\n\nÀ reprendre ce soir.\n\n<!-- ${SEED_TAG} -->`,
    },
    'brouillon-72h': {
      title: 'Notes sur Knausgård',
      contentMd: `Commencé à noter mes impressions sur le tome 3 de _Mon combat_ mais pas avancé depuis plusieurs jours. Trop de matière, je ne sais pas comment organiser.\n\nPoints clés :\n- La mémoire d'enfance comme fiction\n- La culpabilité de l'écrivain envers sa famille\n- Le rapport au père\n\n<!-- ${SEED_TAG} -->`,
    },
    'pub-4j': {
      title: 'Club de lecture — compte-rendu jeudi',
      contentMd: `On se retrouve jeudi pour le club de lecture. Je prépare mes notes en avance pour partager un compte-rendu dès la fin de la soirée.\n\nLivre du mois : _Piranèse_ de Susanna Clarke. Ma thèse : le labyrinthe comme métaphore de la mémoire dissociée.\n\n<!-- ${SEED_TAG} -->`,
    },
    'partage': {
      title: 'Coup de cœur — Vengeance est à moi',
      contentMd: `Coup de cœur absolu : _Vengeance est à moi_ de Shugoro Yamamoto. Un roman policier japonais des années 60, traduit récemment, d'une sobriété et d'une intelligence rare.\n\nLe crime est connu dès le début. Tout le roman questionne le _pourquoi_. Magistral.\n\n<!-- ${SEED_TAG} -->`,
    },
  },

  SERIES: {
    'pour-toi': {
      title: 'The Bear — saison 3 terminée',
      contentMd: `Terminé d'une traite ce week-end. L'épisode 6 (le flashback de Marcus à Copenhague) est probablement la meilleure heure de télévision de l'année — une leçon de montage et de silences.\n\nLa série a quitté le registre « cuisine chaotique » pour quelque chose de plus contemplatif. Pas tous fans, mais moi si.\n\n<!-- ${SEED_TAG} -->`,
      mediaMeta: { subject: 'The Bear', progressCurrent: 3, progressTotal: 3, status: 'finished', rating: 5 },
    },
    '18plus': {
      title: 'Euphoria — revisionnage saison 2',
      contentMd: `Revisionnage de la saison 2. La photographie reste incomparable — Marcell Rév a créé une esthétique entièrement propre.\n\nLe contenu est explicite mais il y a une honnêteté dans la représentation des addictions et de la souffrance adolescente que je respecte.\n\n<!-- ${SEED_TAG} -->`,
    },
    'secret': {
      title: 'Guilty pleasure inavouable',
      contentMd: `Je regarde en secret une telenovela brésilienne doublée en français. Personne ne le sait. Je me juge moi-même.\n\nMais c'est tellement addictif. Intrigues ridicules, revirements toutes les 5 minutes, et je ne peux pas arrêter.\n\n<!-- ${SEED_TAG} -->`,
    },
    'capsule': {
      title: 'Séries à garder pour plus tard',
      contentMd: `Séries mises de côté volontairement :\n\n- _The Wire_ (intégrale) → quand j'aurai vraiment le temps et l'énergie\n- _Deadwood_ → prochain hiver\n- _I May Destroy You_ → quand je serai mentalement solide\n- _Treme_ → après The Wire\n\n<!-- ${SEED_TAG} -->`,
    },
    'brouillon-2h': {
      title: 'Notes live — épisode en cours',
      contentMd: `Épisode 4 en cours. Notes à chaud :\n\n- Le retournement de l'acte 2 n'était pas subtil mais c'était efficace\n- Chemistry réelle entre les deux protagonistes principaux\n- La musique est trop présente dans cette saison\n\nÀ compléter en fin d'épisode.\n\n<!-- ${SEED_TAG} -->`,
    },
    'brouillon-72h': {
      title: 'Comparatif saisons Succession',
      contentMd: `Commencé une analyse comparée des 4 saisons mais pas le temps de finir. L'argument central :\n\nLa saison 3 est sous-estimée parce qu'elle pose les fondations du finale. Sans elle, le dénouement de la saison 4 ne tient pas émotionnellement.\n\nÀ développer avec des exemples précis.\n\n<!-- ${SEED_TAG} -->`,
    },
    'pub-4j': {
      title: 'Recommandation post-finale',
      contentMd: `Finale de la série ce jeudi soir. Je prépare une recommandation pour la partager vendredi — pour laisser le temps aux autres de regarder l'épisode final sans spoiler.\n\nConclusion préparée : la série a tenu ses promesses jusqu'au bout. La suite après visionnage.\n\n<!-- ${SEED_TAG} -->`,
    },
    'partage': {
      title: 'Slow Horses — tout le monde devrait regarder',
      contentMd: `Si vous n'avez pas encore commencé _Slow Horses_ sur AppleTV+, je ne comprends pas vos choix de vie. Gary Oldman dans le rôle de sa carrière, thriller politique anglais d'une intelligence rare.\n\n4 saisons. Aucune faiblesse. Commencez ce soir.\n\n<!-- ${SEED_TAG} -->`,
    },
  },

  MOVIE: {
    'pour-toi': {
      title: 'Dune 2 — deuxième visionnage',
      contentMd: `Revu Dune 2 au cinéma. Ce film s'améliore à chaque visionnage — des détails de mise en scène qui m'avaient complètement échappé la première fois.\n\nLa séquence dans les arènes est visuellement parfaite. Villeneuve compose comme un peintre.\n\n<!-- ${SEED_TAG} -->`,
      mediaMeta: { subject: 'Dune: Part Two', creator: 'Denis Villeneuve', status: 'finished', rating: 5 },
    },
    '18plus': {
      title: 'Blue Is the Warmest Color — revisité',
      contentMd: `Revu pour la première fois depuis 2013. Le film a vieilli différemment de ce qu'on attendait — les scènes explicites semblent moins provocatrices aujourd'hui, mais le débat sur les conditions de tournage reste pertinent.\n\nAdèle Exarchopoulos reste extraordinaire malgré tout.\n\n<!-- ${SEED_TAG} -->`,
    },
    'secret': {
      title: 'Un film qui m\'a fait pleurer',
      contentMd: `J'ai pleuré devant un film ce soir. Je ne dis pas lequel parce que ce serait embarrassant pour quelqu'un censé avoir la larme difficile.\n\nMais c'était beau, et je ne regrette rien.\n\n<!-- ${SEED_TAG} -->`,
    },
    'capsule': {
      title: 'Films à voir à des moments précis',
      contentMd: `Certains films sont faits pour un moment particulier :\n\n- _Synecdoche, New York_ → relire à 50 ans\n- _Tokyo Story_ → quand mes parents vieilliront\n- _Amarcord_ → quand j'aurai envie de pure nostalgie\n- _2001_ → dans un vrai cinéma avec projection 70mm\n\n<!-- ${SEED_TAG} -->`,
    },
    'brouillon-2h': {
      title: 'Sortie ciné — impressions à chaud',
      contentMd: `Je reviens du cinéma. Trop tôt pour avoir un avis construit — je pose juste les premières impressions :\n\n- Visuellement impressionnant\n- La fin m'a laissé perplexe (dans le bon sens ?)\n- J'ai besoin d'en parler avec quelqu'un\n\nÀ développer demain matin.\n\n<!-- ${SEED_TAG} -->`,
    },
    'brouillon-72h': {
      title: 'Top films 2025 — incomplet',
      contentMd: `Commencé ce classement mais pas vu assez de films pour le finaliser proprement. Il me manque au moins 3 films.\n\nProvisoire :\n1. _A Real Pain_ — Jesse Eisenberg\n2. _Nickel Boys_\n3. *(en attente)*\n\nÀ finir ce week-end.\n\n<!-- ${SEED_TAG} -->`,
    },
    'pub-4j': {
      title: 'Critique — avant-première sous embargo',
      contentMd: `Vu un film en avant-première ce soir sous embargo. Je ne peux rien dire avant le 23 mai, mais je prépare la note maintenant pendant que c'est frais.\n\nConclusion à débloquer dans 4 jours : c'était surprenant, dans le meilleur sens du terme.\n\n<!-- ${SEED_TAG} -->`,
    },
    'partage': {
      title: 'Perfect Days — un film qui s\'installe',
      contentMd: `_Perfect Days_ de Wim Wenders continue d'exister en toi longtemps après la séance. Kōji Yakusho dans le rôle d'un agent d'entretien de toilettes à Tokyo qui trouve la plénitude dans les gestes répétitifs.\n\nPas grand-chose ne se passe. Tout se passe. Prix d'interprétation à Cannes, mérité.\n\n<!-- ${SEED_TAG} -->`,
    },
  },

  OUTING: {
    'pour-toi': {
      title: 'Balade Buttes-Chaumont',
      contentMd: `Matinée aux Buttes-Chaumont. C'est à 15 minutes à pied et j'y vais deux fois par an alors que ce parc est extraordinaire. Résolution : y aller plus souvent.\n\nLe lac était parfait ce matin. Quelques coureurs, des familles, un chien qui plongeait inlassablement pour aller chercher son bâton.\n\n<!-- ${SEED_TAG} -->`,
    },
    '18plus': {
      title: 'Soirée Pigalle',
      contentMd: `Soirée dans un bar du quartier Pigalle qui ne ressemble à rien depuis l'extérieur. Musique au sous-sol, conversations intéressantes, quelques rencontres inattendues.\n\nJe ne détaille pas davantage. C'était une bonne soirée.\n\n<!-- ${SEED_TAG} -->`,
    },
    'secret': {
      title: 'Sortie solitaire',
      contentMd: `Je suis sorti seul ce matin sans dire à personne où j'allais. Pas d'explication — juste besoin de marcher, de ne pas être joignable quelques heures.\n\nJ'ai marché 3 heures à travers des quartiers que je ne connaissais pas. C'était bien. Vraiment bien.\n\n<!-- ${SEED_TAG} -->`,
    },
    'capsule': {
      title: 'Café à retrouver dans quelques ans',
      contentMd: `Un café dans le 11e que j'ai découvert ce matin et que je veux me souvenir d'être revenu dans quelques années pour voir ce qu'il est devenu.\n\n**Café des Envierges**, Belleville. Pas de wifi, playlist jazz, patron taciturne. Parfait en tous points.\n\n<!-- ${SEED_TAG} -->`,
    },
    'brouillon-2h': {
      title: 'Encore dehors — notes en chemin',
      contentMd: `Toujours en balade, j'écris depuis un banc. Je finirai la note en rentrant.\n\nPoint d'étape : marché d'Aligre → canal Saint-Martin → je continue vers République.\n\nIl fait un soleil parfait.\n\n<!-- ${SEED_TAG} -->`,
    },
    'brouillon-72h': {
      title: 'Week-end Bretagne — à raconter',
      contentMd: `Je rentre depuis quelques jours du week-end en Bretagne mais je n'ai pas encore eu le temps d'écrire quelque chose de cohérent. Trop de choses à dire, je procrastine.\n\nMémo : marché de Quimper, randonnée du cap, repas de fruits de mer, discussion du dimanche soir.\n\nÀ écrire proprement.\n\n<!-- ${SEED_TAG} -->`,
    },
    'pub-4j': {
      title: 'Expo Grand Palais — compte-rendu à venir',
      contentMd: `Visité l'exposition au Grand Palais Immersif ce matin. Je veux écrire un vrai compte-rendu mais j'ai besoin de laisser décanter.\n\nPublication dans 4 jours. Mes impressions seront plus intéressantes avec un peu de recul.\n\n<!-- ${SEED_TAG} -->`,
    },
    'partage': {
      title: 'Musée Cognacq-Jay — la perle ignorée',
      contentMd: `Petite perle méconnue des Parisiens : le Musée Cognacq-Jay dans le Marais. Collection XVIIIe siècle, gratuit, jamais bondé, une heure dans un hôtel particulier magnifique.\n\nSi vous avez une après-midi libre et fuyez les foules du Louvre, c'est là qu'il faut aller.\n\n<!-- ${SEED_TAG} -->`,
    },
  },
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const owner = await db.user.findFirst({ where: { role: 'OWNER' }, select: { id: true, email: true } });
  if (!owner) { console.error('❌ Aucun OWNER trouvé.'); process.exit(1); }
  console.log(`👤 Owner : ${owner.email} (${owner.id})`);

  // ── Purge ────────────────────────────────────────────────────────────────────
  if (PURGE) {
    const entries = await db.entry.findMany({
      where: { authorId: owner.id, contentMd: { contains: SEED_TAG } },
      select: { id: true },
    });
    const ids = entries.map((e) => e.id);
    if (ids.length) {
      await db.entryTag.deleteMany({ where: { entryId: { in: ids } } });
      await db.entry.deleteMany({ where: { id: { in: ids } } });
      console.log(`🗑️  ${ids.length} entrées supprimées.`);
    } else {
      console.log('ℹ️  Aucune entrée seed à supprimer.');
    }
    await db.$disconnect();
    return;
  }

  // ── Création des entrées ─────────────────────────────────────────────────────
  let created = 0;

  for (const noteType of NOTE_TYPES) {
    for (const optKey of OPTION_KEYS) {
      const opt = OPTIONS[optKey];
      const cnt = CONTENT[noteType][optKey];

      const entryCreatedAt = opt.createdAt ?? now;
      const entryUpdatedAt = opt.updatedAt ?? now;

      // Construire le data object sans champs undefined
      const data: Record<string, unknown> = {
        authorId:      owner.id,
        date:          TODAY,
        createdAt:     entryCreatedAt,
        updatedAt:     entryUpdatedAt,
        noteType,
        title:         cnt.title ?? null,
        contentMd:     cnt.contentMd,
        mediaMeta:     cnt.mediaMeta ?? undefined,
        visibility:    opt.visibility ?? 'PRIVATE',
        isDraft:       opt.isDraft ?? false,
        isSecret:      opt.isSecret ?? false,
        isAdult:       opt.isAdult ?? false,
        adultQuestion: opt.adultQuestion ?? null,
        adultAnswerHash: opt.adultAnswerHash ?? null,
        adultHints:    (opt as any).adultHints ?? [],
        unlockAt:      opt.unlockAt ?? null,
        capsuleSpoiler: opt.capsuleSpoiler ?? null,
        hideUntilAt:   opt.hideUntilAt ?? null,
      };

      await db.entry.create({ data: data as any });
      created++;
      process.stdout.write(`\r✍️  ${created}/${NOTE_TYPES.length * OPTION_KEYS.length} entrées créées…`);
    }
  }

  console.log(`\n✅ ${created} entrées créées (${NOTE_TYPES.length} types × ${OPTION_KEYS.length} options).`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
