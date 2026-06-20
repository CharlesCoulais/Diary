/**
 * Insère des entrées BOOK/SERIES de test pour tester l'affichage de progression.
 * Usage : pnpm --filter @carnet/api seed:media
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const today = new Date();
today.setHours(0, 0, 0, 0);
const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);

const entries = [
  {
    date: today,
    timeLabel: '21:00',
    noteType: 'BOOK' as const,
    contentMd: 'La prose est magnifique, un peu lente au début.',
    mediaMeta: {
      subject: 'Le Nom de la Rose',
      creator: 'Umberto Eco',
      progressCurrent: 187,
      progressTotal: 502,
      status: 'ongoing',
      rating: 4,
    },
  },
  {
    date: yesterday,
    timeLabel: '23:30',
    noteType: 'BOOK' as const,
    contentMd: "Terminé cette nuit. Chef-d'œuvre absolu.",
    mediaMeta: {
      subject: 'Dune',
      creator: 'Frank Herbert',
      progressCurrent: 896,
      progressTotal: 896,
      status: 'finished',
      rating: 5,
    },
  },
  {
    date: today,
    timeLabel: '09:15',
    noteType: 'BOOK' as const,
    contentMd: '',
    mediaMeta: {
      subject: "L'Assassin Royal",
      creator: 'Robin Hobb',
      volume: 2,
      totalVolumes: 3,
      progressCurrent: 45,
      progressTotal: 410,
      chapter: 6,
      status: 'ongoing',
    },
  },
  {
    date: today,
    timeLabel: '22:00',
    noteType: 'SERIES' as const,
    contentMd: 'La tension monte vraiment bien dans cette saison.',
    mediaMeta: {
      subject: 'The Bear',
      creator: 'FX',
      season: 2,
      totalSeasons: 3,
      progressCurrent: 6,
      progressTotal: 10,
      status: 'ongoing',
      rating: 5,
    },
  },
  {
    date: yesterday,
    timeLabel: '20:30',
    noteType: 'SERIES' as const,
    contentMd: 'Fin de saison décevante mais globalement bien.',
    mediaMeta: {
      subject: 'Succession',
      creator: 'HBO',
      season: 4,
      totalSeasons: 4,
      progressCurrent: 10,
      progressTotal: 10,
      status: 'finished',
      rating: 4,
    },
  },
];

async function main() {
  const owner = await db.user.findFirstOrThrow({ where: { role: 'OWNER' } });
  console.log(`Owner trouvé : ${owner.email} (${owner.id})`);

  for (const e of entries) {
    const created = await db.entry.create({
      data: {
        authorId: owner.id,
        date: e.date,
        timeLabel: e.timeLabel,
        noteType: e.noteType,
        contentMd: e.contentMd,
        mediaMeta: e.mediaMeta,
        visibility: 'PRIVATE',
        version: 1,
      },
    });
    console.log(`  ✅ ${e.noteType} "${(e.mediaMeta as any).subject}" → ${created.id}`);
  }

  console.log(`\n${entries.length} entrées insérées. Recharge l'app pour voir la sync.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
