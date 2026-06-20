/**
 * Seed de démo — contenu cohérent et réaliste pour tester le rendu.
 *
 * Crée :
 *   - un confidant (guest) si aucun n'existe
 *   - ~15 entrées sur 14 mois (dont des dates pour OnThisDay : J-7, J-1 mois, J-1 an)
 *   - tags, réactions, commentaires avec réponses
 *   - DailyLogs sur les 10 derniers jours
 *
 * Lancer : pnpm --filter @carnet/api exec tsx --env-file=.env scripts/seed-demo.ts
 * Purger  : pnpm --filter @carnet/api exec tsx --env-file=.env scripts/seed-demo.ts --purge
 */

import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth/password.js';

const SEED_TAG = 'SEED_DEMO_2026';
const PURGE = process.argv.includes('--purge');

const db = new PrismaClient();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Retourne un Date à minuit UTC pour une date ISO */
function d(iso: string) { return new Date(iso + 'T00:00:00.000Z'); }

/** Retourne un Date à une heure donnée (heure locale Paris ≈ UTC+2) */
function dt(iso: string, hh: number, mm = 0) {
  return new Date(`${iso}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00.000Z`);
}

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]!; }

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const owner = await db.user.findFirst({ where: { role: 'OWNER' }, select: { id: true, email: true } });
  if (!owner) { console.error('❌ Aucun OWNER trouvé.'); process.exit(1); }
  console.log(`👤 Owner : ${owner.email} (${owner.id})`);

  // ── Purge ──────────────────────────────────────────────────────────────────
  if (PURGE) {
    const entries = await db.entry.findMany({
      where: { authorId: owner.id, contentMd: { contains: SEED_TAG } },
      select: { id: true },
    });
    const ids = entries.map(e => e.id);
    if (ids.length) {
      await db.comment.deleteMany({ where: { entryId: { in: ids } } });
      await db.reaction.deleteMany({ where: { entryId: { in: ids } } });
      await db.entryTag.deleteMany({ where: { entryId: { in: ids } } });
      await db.entry.deleteMany({ where: { id: { in: ids } } });
      console.log(`🗑️  ${ids.length} entrées supprimées.`);
    }
    const guestIds = (await db.user.findMany({ where: { role: 'GUEST', email: { contains: SEED_TAG } }, select: { id: true } })).map(u => u.id);
    if (guestIds.length) {
      await db.user.deleteMany({ where: { id: { in: guestIds } } });
      console.log(`🗑️  ${guestIds.length} guest(s) seed supprimés.`);
    }
    await db.dailyLog.deleteMany({ where: { ownerId: owner.id, date: { gte: d('2026-05-09') } } });
    console.log('✅ Purge terminée.'); await db.$disconnect(); return;
  }

  // ── Confidant ─────────────────────────────────────────────────────────────
  let guest = await db.user.findFirst({ where: { role: 'GUEST' }, select: { id: true, displayName: true } });
  if (!guest) {
    guest = await db.user.create({
      data: {
        email: `elise.${SEED_TAG.toLowerCase()}@example.com`,
        passwordHash: await hashPassword('demo1234'),
        role: 'GUEST',
        guestAccess: 'CONFIDANT',
        guestCanComment: true,
        displayName: 'Élise',
      },
      select: { id: true, displayName: true },
    });
    console.log(`👤 Confidant créé : Élise (${guest.id})`);
  } else {
    console.log(`👤 Confidant existant : ${guest.displayName ?? 'sans nom'} (${guest.id})`);
  }

  // ── Tags ──────────────────────────────────────────────────────────────────
  const tagDefs = [
    { name: 'bonne journée', kind: 'EMOTION' as const, color: '#4ade80' },
    { name: 'mélancolie', kind: 'EMOTION' as const, color: '#818cf8' },
    { name: 'fierté', kind: 'EMOTION' as const, color: '#f59e0b' },
    { name: 'cinéma', kind: 'THEME' as const, color: '#f43f5e' },
    { name: 'lecture', kind: 'THEME' as const, color: '#06b6d4' },
    { name: 'musique', kind: 'THEME' as const, color: '#a855f7' },
    { name: 'sorties', kind: 'THEME' as const, color: '#10b981' },
    { name: 'travail', kind: 'THEME' as const, color: '#64748b' },
    { name: 'Élise', kind: 'PERSON' as const, color: '#ec4899' },
    { name: 'famille', kind: 'PERSON' as const, color: '#f97316' },
    { name: 'Paris', kind: 'PLACE' as const, color: '#3b82f6' },
    { name: 'chez moi', kind: 'PLACE' as const, color: '#84cc16' },
  ];

  const tags: Record<string, string> = {}; // name → id
  for (const t of tagDefs) {
    const tag = await db.tag.upsert({
      where: { ownerId_name_kind: { ownerId: owner.id, name: t.name, kind: t.kind } },
      create: { ownerId: owner.id, name: t.name, kind: t.kind, color: t.color },
      update: {},
      select: { id: true },
    });
    tags[t.name] = tag.id;
  }
  console.log(`🏷️  ${Object.keys(tags).length} tags prêts.`);

  // ── Entrées ───────────────────────────────────────────────────────────────

  type EntryInput = {
    date: string;
    createdAt: Date;
    title?: string;
    noteType?: 'JOURNAL' | 'BOOK' | 'MOVIE' | 'MUSIC' | 'OUTING' | 'SERIES' | 'DEV';
    section?: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'NIGHT' | 'FREE';
    mood?: string;
    visibility?: 'PRIVATE' | 'SHARED_ALL';
    contentMd: string;
    mediaMeta?: object;
    tagNames?: string[];
    reactions?: string[];
    comments?: Array<{
      content: string;
      authorId: string;
      createdAt: Date;
      replies?: Array<{ content: string; authorId: string; createdAt: Date }>;
    }>;
  };

  const ownerId = owner.id;
  const guestId = guest.id;

  const entries: EntryInput[] = [
    // ── Aujourd'hui ──────────────────────────────────────────────────────────
    {
      date: '2026-05-19',
      createdAt: dt('2026-05-19', 8, 20),
      title: 'Mardi matin, café en main',
      section: 'MORNING',
      mood: '☀️',
      visibility: 'PRIVATE',
      contentMd: `<!-- ${SEED_TAG} -->
Réveil 7h30 sans alarme, ce qui ne m'arrive quasi jamais. La lumière rentrait déjà bien par la fenêtre de la chambre, ce genre de matin où on a l'impression que la journée va être bonne avant même d'avoir bu son café.

J'ai pris le temps de faire du vrai café — pas les capsules — le genre avec la cafetière italienne et les gestes lents. J'ai lu quelques pages en attendant que ça chauffe.

**Objectifs du jour :**
- Finir la PR sur le module de sync
- Rappeler le médecin pour le rdv de juin
- Préparer les affaires pour le week-end chez les parents

Je ne sais pas pourquoi mais ce matin j'ai envie que ça dure.`,
      tagNames: ['bonne journée', 'chez moi'],
      reactions: ['☀️', '☕'],
    },
    // ── Hier ─────────────────────────────────────────────────────────────────
    {
      date: '2026-05-18',
      createdAt: dt('2026-05-18', 22, 10),
      title: 'Interstellar, encore',
      noteType: 'MOVIE',
      visibility: 'SHARED_ALL',
      mediaMeta: {
        subject: 'Interstellar',
        creator: 'Christopher Nolan',
        rating: 5,
        status: 'finished',
      },
      contentMd: `<!-- ${SEED_TAG} -->
Troisième visionnage. Je savais pertinemment ce qui allait se passer et pourtant la scène des messages vidéo m'a encore fait quelque chose de physique — gorge serrée, yeux qui piquent, le tout.

Ce film est une expérience. Pas parfait (les dialogues d'exposition, parfois), mais les 40 dernières minutes restent parmi ce que le cinéma m'a offert de plus beau.

Ce qui me frappe cette fois-ci : le personnage de Murph. Enfant, elle est méfiante et butée. Adulte, elle est lumineuse et résiliente. L'ellipse temporelle rend cette transformation encore plus poignante.

> *"We used to look up at the sky and wonder at our place in the stars. Now we just look down, and worry about our place in the dirt."*

J'ai regardé seul, à 22h passées, avec les écouteurs. Exactement comme ça devrait se vivre.`,
      tagNames: ['cinéma'],
      reactions: ['🎬', '❤️', '🥲'],
      comments: [
        {
          content: "J'avais vu que tu l'avais relancé ! C'est ton film préféré au final ou pas ?",
          authorId: guestId,
          createdAt: dt('2026-05-18', 22, 35),
          replies: [
            {
              content: "Difficile de trancher... Mais c'est celui qui me touche le plus viscéralement à chaque fois. *2001* est peut-être plus grand objectivement mais Interstellar me fait pleurer donc voilà.",
              authorId: ownerId,
              createdAt: dt('2026-05-18', 23, 2),
            },
          ],
        },
      ],
    },
    // ── 2026-05-17 ───────────────────────────────────────────────────────────
    {
      date: '2026-05-17',
      createdAt: dt('2026-05-17', 18, 45),
      title: 'Dimanche productif',
      section: 'AFTERNOON',
      mood: '✨',
      visibility: 'PRIVATE',
      contentMd: `<!-- ${SEED_TAG} -->
Rare dimanche où j'ai vraiment travaillé sur mes propres projets sans culpabiliser. Quatre heures de code, une musique lo-fi en fond, téléphone sur silencieux.

J'ai refactorisé le module de sync du projet perso — c'était devenu ingérable. La version propre tient en 80 lignes au lieu de 200. C'est ce genre de plaisir un peu nerd que j'ai du mal à expliquer aux gens mais qui me rend vraiment satisfait.

Ensuite j'ai préparé à manger pour la semaine. Lentilles corail + courge butternut + épices. Ça sent bon la maison quand ça cuit.

Pas vu grand monde aujourd'hui et c'est exactement ce dont j'avais besoin.`,
      tagNames: ['bonne journée', 'chez moi', 'travail'],
      reactions: ['✨', '👨‍💻'],
    },
    // ── 2026-05-15 ───────────────────────────────────────────────────────────
    {
      date: '2026-05-15',
      createdAt: dt('2026-05-15', 21, 0),
      title: 'Découverte : Mk.gee',
      noteType: 'MUSIC',
      visibility: 'SHARED_ALL',
      mediaMeta: {
        subject: 'Two Star & The Dream Police',
        creator: 'Mk.gee',
        rating: 5,
        status: 'IN_PROGRESS',
      },
      contentMd: `<!-- ${SEED_TAG} -->
Je ne sais plus comment j'ai atterri sur cet album mais je n'en sors plus depuis deux jours. Mk.gee, artiste américain, *Two Star & The Dream Police* — un truc entre indie folk, dream pop et quelque chose d'indéfinissable.

Sa façon de jouer de la guitare est bizarre dans le bon sens. Les accords sont volontairement décalés, presque flottants.

**Titres qui tournent en boucle :**
- *Candy* — mélancolique, lente, hypnotique
- *Are You Looking Up* — la production est folle
- *You* — trop simple pour être si bonne

J'ai l'impression d'avoir trouvé quelque chose de rare. Le genre d'artiste dont on se dit dans deux ans "je l'écoutais avant tout le monde" (alors que probablement pas, mais bon).`,
      tagNames: ['musique'],
      reactions: ['🎵', '🔥', '❤️'],
      comments: [
        {
          content: `Je viens d'écouter *Candy* grâce à toi. Très jolie. Un peu comme Angelo De Augustine ?`,
          authorId: guestId,
          createdAt: dt('2026-05-15', 22, 15),
          replies: [
            {
              content: "Oui exactement ! Même textures cotonneuses. Tu connais Angelo De Augustine ? Je pensais être le seul 😅",
              authorId: ownerId,
              createdAt: dt('2026-05-15', 22, 30),
            },
            {
              content: `Ha ! Je l'ai découvert par Sufjan Stevens il y a longtemps. Ils ont sorti un album ensemble.`,
              authorId: guestId,
              createdAt: dt('2026-05-15', 22, 45),
            },
          ],
        },
      ],
    },
    // ── 2026-05-12 — pour OnThisDay J-7 ─────────────────────────────────────
    {
      date: '2026-05-12',
      createdAt: dt('2026-05-12', 14, 30),
      title: 'Déjeuner avec Tom et Sarah',
      noteType: 'OUTING',
      visibility: 'SHARED_ALL',
      mood: '😄',
      contentMd: `<!-- ${SEED_TAG} -->
Premier vrai déjeuner tous les trois depuis les vacances d'hiver. On a pris une terrasse rue de Bretagne — soleil, un verre de blanc, et deux heures à refaire le monde.

Tom vient de changer de boulot. Il a l'air apaisé d'une façon que je ne lui connaissais pas. Sarah finit sa thèse en septembre, elle parle d'aller vivre à Lisbonne après.

Ces deux-là me font du bien. Pas besoin de faire semblant d'être quelque chose qu'on n'est pas.

On a commandé des gyozas trop cuits et on s'en foutait.`,
      tagNames: ['sorties', 'Paris', 'bonne journée'],
      reactions: ['😄', '🥂'],
      comments: [
        {
          content: "Contente que tu les aies vus ! Tu m'avais dit que vous vous étiez perdus de vue un peu.",
          authorId: guestId,
          createdAt: dt('2026-05-12', 19, 10),
        },
      ],
    },
    // ── 2026-05-08 ───────────────────────────────────────────────────────────
    {
      date: '2026-05-08',
      createdAt: dt('2026-05-08', 23, 20),
      title: 'Nuit blanche sans raison',
      section: 'NIGHT',
      mood: '🌙',
      visibility: 'PRIVATE',
      contentMd: `<!-- ${SEED_TAG} -->
2h du mat. Pas d'insomnie à proprement parler — juste pas envie de dormir. J'ai lu, j'ai un peu tourné en rond, j'ai fait du thé.

Il y a des nuits où l'appartement me semble beaucoup trop grand et d'autres où il est exactement à la bonne taille. Ce soir c'est la deuxième catégorie.

Pensé à plein de choses sans qu'aucune soit vraiment importante. C'est peut-être ça la santé mentale — des pensées qui passent sans s'accrocher.

Je vais aller me coucher.`,
      tagNames: ['chez moi', 'mélancolie'],
      reactions: ['🌙'],
    },
    // ── 2026-04-28 ───────────────────────────────────────────────────────────
    {
      date: '2026-04-28',
      createdAt: dt('2026-04-28', 20, 0),
      title: 'Le Comte de Monte-Cristo — terminé',
      noteType: 'BOOK',
      visibility: 'SHARED_ALL',
      mediaMeta: {
        subject: 'Le Comte de Monte-Cristo',
        creator: 'Alexandre Dumas',
        progressCurrent: 1276,
        progressTotal: 1276,
        rating: 5,
        status: 'finished',
      },
      contentMd: `<!-- ${SEED_TAG} -->
Fini. 1276 pages. Six semaines.

Je ne savais pas dans quoi je m'embarquais quand j'ai ouvert ce livre. Je pensais lire un classique de façon un peu académique. Je me suis retrouvé à lire dans le métro, dans les files d'attente, à repousser l'heure du coucher.

Dumas écrit des personnages d'une densité incroyable. Edmond Dantès qui se transforme progressivement — pas en héros mais en quelque chose de plus froid, de plus calculé — et qui finit par douter lui-même de la légitimité de sa vengeance. La complexité morale de la fin m'a surpris.

**Ce qui m'a le plus touché :** la scène avec Haydée au dernier tiers. Tout s'inverse discrètement.

**À relire dans 10 ans** sans aucune hésitation.`,
      tagNames: ['lecture', 'fierté'],
      reactions: ['📚', '🔥', '👏'],
      comments: [
        {
          content: "Enfin !! Je t'avais dit que tu ne regretterais pas. Tu as aimé Albert de Morcerf comme personnage ?",
          authorId: guestId,
          createdAt: dt('2026-04-28', 21, 5),
          replies: [
            {
              content: "Honnêtement au début j'avais envie de le secouer. Et puis vers la fin j'ai compris que c'est exactement ce que Dumas voulait qu'on ressente. L'arc de sa mère m'a brisé.",
              authorId: ownerId,
              createdAt: dt('2026-04-28', 21, 30),
            },
            {
              content: "Mercédès 💔 Pareil pour moi. J'ai lu ce livre à 17 ans et à 25 ans et je l'ai compris très différemment.",
              authorId: guestId,
              createdAt: dt('2026-04-28', 21, 45),
            },
          ],
        },
        {
          content: "C'est dans ma liste depuis des années grâce à toi maintenant je me sens obligée de le lire",
          authorId: guestId,
          createdAt: dt('2026-04-29', 10, 0),
        },
      ],
    },
    // ── 2026-04-19 — pour OnThisDay J-30 ─────────────────────────────────────
    {
      date: '2026-04-19',
      createdAt: dt('2026-04-19', 17, 10),
      title: 'Printemps confirmé',
      section: 'AFTERNOON',
      mood: '🌿',
      visibility: 'SHARED_ALL',
      contentMd: `<!-- ${SEED_TAG} -->
Le printemps s'est vraiment installé aujourd'hui. Je suis sorti sans veste pour la première fois de l'année — genre sorti dehors et décidé de ne pas remonter la chercher.

J'ai marché une heure dans le quartier sans destination. Ces promenades sans but me font un bien fou. J'ai du mal à les faire en hiver, j'ai toujours l'impression de perdre du temps quand il fait froid. Au printemps c'est différent.

Repéré une nouvelle librairie rue de la Roquette. Petite, spécialisée en SF et polar. J'y retourne samedi.

Rentré à 19h avec une barquette de fraises et une bonne humeur que je n'explique pas vraiment.`,
      tagNames: ['bonne journée', 'Paris', 'sorties'],
      reactions: ['🌿', '☀️', '🍓'],
      comments: [
        {
          content: 'Le bonheur dans ta façon de décrire les petites choses 🍓',
          authorId: guestId,
          createdAt: dt('2026-04-19', 20, 30),
        },
      ],
    },
    // ── 2026-03-14 ───────────────────────────────────────────────────────────
    {
      date: '2026-03-14',
      createdAt: dt('2026-03-14', 9, 0),
      title: 'Discussion difficile avec papa',
      section: 'MORNING',
      mood: '💭',
      visibility: 'PRIVATE',
      contentMd: `<!-- ${SEED_TAG} -->
On a parlé hier soir. Longtemps. De choses qu'on avait évitées depuis des mois.

Je ne veux pas tout écrire ici parce que certaines choses méritent de rester dans la conversation, pas dans un journal. Mais globalement : ça s'est bien passé. Mieux que je ne le craignais. Il a dit des trucs que je ne l'avais jamais entendu dire. Moi aussi j'imagine.

Je suis rentré à minuit avec une sensation bizarre — pas exactement apaisé, mais moins tendu qu'avant. Comme si une pression que je ne sentais même plus avait légèrement baissé.

On verra dans la durée.`,
      tagNames: ['famille', 'mélancolie'],
    },
    // ── 2026-02-14 ───────────────────────────────────────────────────────────
    {
      date: '2026-02-14',
      createdAt: dt('2026-02-14', 22, 55),
      title: 'Saint-Valentin (sans pression)',
      visibility: 'PRIVATE',
      mood: '❤️',
      contentMd: `<!-- ${SEED_TAG} -->
Pas de grande déclaration. On a cuisiné ensemble — risotto aux champignons, une bouteille de Bourgogne blanc qu'on avait mise de côté. On a regardé une série. On a beaucoup ri pour des raisons idiotes.

Je pense que c'est ça le vrai truc. Pas les restaurants à 80€ le couvert. L'ordinaire rendu un peu plus lumineux.

Je lui ai dit ce que je pensais. Ça lui a fait plaisir. Ça m'a fait plaisir de le dire.`,
      tagNames: ['bonne journée', 'chez moi'],
      reactions: ['❤️', '🥂'],
    },
    // ── 2026-01-03 ───────────────────────────────────────────────────────────
    {
      date: '2026-01-03',
      createdAt: dt('2026-01-03', 10, 30),
      title: 'Intentions 2026',
      section: 'MORNING',
      visibility: 'PRIVATE',
      contentMd: `<!-- ${SEED_TAG} -->
Je n'aime pas les résolutions. Trop binaires — réussies ou ratées. Mais j'aime bien noter ce que j'aimerais que l'année ressemble.

**Ce que je veux plus en 2026 :**
- Lire. Vraiment. Pas juste avoir des livres sur la table de nuit.
- Cuisiner comme hobby et pas comme obligation.
- Moins scroller passivement. Plus regarder intentionnellement.
- Appeler ma grand-mère plus souvent.

**Ce que je veux moins :**
- Commencer des projets persos et les abandonner au bout de trois semaines.
- Répondre aux messages à 23h.
- Cette chose que je fais où je m'excuse d'exister dans les réunions.

On verra dans 12 mois.`,
      tagNames: ['travail', 'fierté'],
      reactions: ['✨'],
      comments: [
        {
          content: `"M'excuser d'exister dans les réunions" — j'ai ri mais c'est tellement juste pour plein de gens dont toi parfois.`,
          authorId: guestId,
          createdAt: dt('2026-01-03', 14, 0),
          replies: [
            {
              content: 'Ha. Oui. Je travaille là-dessus activement 😬',
              authorId: ownerId,
              createdAt: dt('2026-01-03', 14, 20),
            },
          ],
        },
      ],
    },
    // ── 2025-12-31 ───────────────────────────────────────────────────────────
    {
      date: '2025-12-31',
      createdAt: dt('2025-12-31', 23, 50),
      title: 'Réveillon',
      section: 'NIGHT',
      mood: '🎇',
      visibility: 'SHARED_ALL',
      contentMd: `<!-- ${SEED_TAG} -->
Dans 10 minutes, 2025 sera finie. On est une dizaine, entre amis et famille mélangés, chez les parents. Ça chante dans la pièce d'à côté. Mon neveu est encore debout alors qu'il devrait dormir depuis 3h.

Je voulais noter ça — pas l'événement, mais ce que je ressens en ce moment : une sorte de gratitude tranquille. L'année a eu ses trucs durs mais globalement je suis là, je vais bien, les gens que j'aime sont dans la pièce d'à côté.

Ce n'est pas rien.

Bonne année à moi.`,
      tagNames: ['famille', 'bonne journée'],
      reactions: ['🎇', '❤️', '🥂'],
      comments: [
        {
          content: 'On était ensemble ce soir là 🥂 La photo avec ton neveu est trop mignonne.',
          authorId: guestId,
          createdAt: dt('2026-01-01', 10, 0),
        },
      ],
    },
    // ── 2025-09-08 ───────────────────────────────────────────────────────────
    {
      date: '2025-09-08',
      createdAt: dt('2025-09-08', 19, 40),
      title: 'Première semaine à distance',
      visibility: 'PRIVATE',
      mood: '💭',
      section: 'EVENING',
      contentMd: `<!-- ${SEED_TAG} -->
Six mois que j'ai changé d'appartement. Je pensais que la solitude me pèserait plus. Finalement non — ou plutôt, elle me pèse différemment de ce que j'anticipais.

Ce qui me manque : le bruit de fond. Les autres dans la pièce d'à côté. Le fait que quelqu'un soit là sans que ça demande d'effort.

Ce qui ne me manque pas : les compromis. Le rythme calqué sur celui de quelqu'un d'autre. Les petites frictions quotidiennes.

Je n'idéalise ni l'un ni l'autre. C'est juste une situation, et j'apprends à y vivre.`,
      tagNames: ['chez moi', 'mélancolie'],
    },
    // ── 2025-07-19 ───────────────────────────────────────────────────────────
    {
      date: '2025-07-19',
      createdAt: dt('2025-07-19', 21, 15),
      title: 'Vacances, jour 4',
      noteType: 'OUTING',
      visibility: 'SHARED_ALL',
      mood: '🌊',
      contentMd: `<!-- ${SEED_TAG} -->
Bretagne. Pluie le matin, éclaircie spectaculaire l'après-midi, tempête à 18h. Programme classique.

On a marché sur le GR34 pendant trois heures. Le vent était violent mais pas agressif — ce genre de vent qui pousse sans faire mal. Les falaises étaient dingues.

J'ai mangé des crêpes au sarrasin avec du cidre brut dans une crêperie qui devait avoir 40 ans d'existence. C'est peut-être la meilleure chose que j'ai mangée depuis des mois.

Je n'ai regardé mon téléphone que deux fois aujourd'hui.`,
      tagNames: ['sorties', 'bonne journée'],
      reactions: ['🌊', '🥞', '☀️'],
      comments: [
        {
          content: "J'adore la Bretagne. Tu étais où exactement ? Presqu'île de Crozon ?",
          authorId: guestId,
          createdAt: dt('2025-07-19', 22, 0),
          replies: [
            {
              content: 'Cap Fréhel / Saint-Malo côté. La prochaine fois Crozon, promis.',
              authorId: ownerId,
              createdAt: dt('2025-07-19', 22, 30),
            },
          ],
        },
      ],
    },
    // ── 2025-05-19 — pour OnThisDay J-365 ────────────────────────────────────
    {
      date: '2025-05-19',
      createdAt: dt('2025-05-19', 11, 0),
      title: 'Il y a pile un an',
      section: 'MORNING',
      mood: '🌱',
      visibility: 'SHARED_ALL',
      contentMd: `<!-- ${SEED_TAG} -->
Il y a exactement un an aujourd'hui je rendais les clés de mon ancien appart. Je me souviens d'avoir tout mis dans un Kangoo loué avec Tom, de m'être arrêté sur le pas de la porte une seconde avant de fermer définitivement.

Pas de nostalgie particulière. Juste une pensée pour la personne que j'étais ce matin-là, qui avait un peu peur et qui ne le montrait pas trop.

Elle s'en est bien sortie.

Je m'en suis bien sorti.`,
      tagNames: ['fierté', 'chez moi'],
      reactions: ['🌱', '❤️'],
      comments: [
        {
          content: `Je me souviens de ce déménagement. Tu étais tellement stressé mais tu faisais semblant d'être zen. 😄`,
          authorId: guestId,
          createdAt: dt('2025-05-19', 13, 30),
          replies: [
            {
              content: 'Je pensais que ça se voyait pas 💀',
              authorId: ownerId,
              createdAt: dt('2025-05-19', 13, 45),
            },
            {
              content: `Ça se voyait. Mais c'était touchant.`,
              authorId: guestId,
              createdAt: dt('2025-05-19', 14, 0),
            },
          ],
        },
      ],
    },
  ];

  // ── Création des entrées ─────────────────────────────────────────────────
  let created = 0;
  for (const e of entries) {
    const entry = await db.entry.create({
      data: {
        authorId: ownerId,
        date: d(e.date),
        createdAt: e.createdAt,
        title: e.title ?? null,
        noteType: e.noteType ?? 'JOURNAL',
        section: e.section ?? null,
        mood: e.mood ?? null,
        visibility: e.visibility ?? 'PRIVATE',
        contentMd: e.contentMd,
        mediaMeta: e.mediaMeta ?? undefined,
        adultHints: [],
      },
    });

    // Tags
    if (e.tagNames?.length) {
      for (const name of e.tagNames) {
        if (tags[name]) {
          await db.entryTag.upsert({
            where: { entryId_tagId: { entryId: entry.id, tagId: tags[name]! } },
            create: { entryId: entry.id, tagId: tags[name]! },
            update: {},
          });
        }
      }
    }

    // Réactions sur l'entrée (par le guest)
    if (e.reactions?.length) {
      for (const emoji of e.reactions) {
        await db.reaction.upsert({
          where: { userId_entryId_emoji: { userId: guestId, entryId: entry.id, emoji } },
          create: { userId: guestId, entryId: entry.id, emoji },
          update: {},
        });
      }
    }

    // Commentaires
    if (e.comments?.length) {
      for (const c of e.comments) {
        const comment = await db.comment.create({
          data: {
            entryId: entry.id,
            authorId: c.authorId,
            content: c.content,
            createdAt: c.createdAt,
          },
        });

        // Réponses
        if (c.replies?.length) {
          for (const r of c.replies) {
            await db.comment.create({
              data: {
                entryId: entry.id,
                authorId: r.authorId,
                content: r.content,
                parentId: comment.id,
                replyToId: comment.id,
                createdAt: r.createdAt,
              },
            });
          }
        }
      }
    }

    console.log(`  ✓ [${e.date}] ${e.title ?? '(sans titre)'}`);
    created++;
  }

  // ── DailyLogs — 10 derniers jours ────────────────────────────────────────
  const MOODS = ['😴', '😐', '🙂', '😄', '🥰'];
  const WEATHERS = ['☀️', '⛅', '🌧️', '🌩️', '🌤️'];
  const now = new Date('2026-05-19');

  for (let i = 0; i < 10; i++) {
    const day = new Date(now);
    day.setUTCDate(day.getUTCDate() - i);
    const dateStr = day.toISOString().slice(0, 10);

    await db.dailyLog.upsert({
      where: { ownerId_date: { ownerId, date: d(dateStr) } },
      create: {
        ownerId,
        date: d(dateStr),
        mood: pick(MOODS),
        sleepHours: 6 + Math.round(Math.random() * 3 * 2) / 2,
        weather: pick(WEATHERS),
        energy: 1 + Math.floor(Math.random() * 5),
        anxiety: 1 + Math.floor(Math.random() * 4),
      },
      update: {},
    });
  }
  console.log(`📅 10 DailyLogs créés.`);

  console.log(`\n✅ Seed terminé — ${created} entrées créées.`);
  console.log(`🗑️  Pour purger : pnpm --filter @carnet/api exec tsx --env-file=.env scripts/seed-demo.ts --purge`);
  await db.$disconnect();
}

main().catch(e => { console.error(e); db.$disconnect(); process.exit(1); });
