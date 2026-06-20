/**
 * Supprime les entrées de test insérées par seed-media-test.ts
 * Usage : pnpm --filter @carnet/api cleanup:media
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const TEST_SUBJECTS = [
  'Le Nom de la Rose',
  'Dune',
  "L'Assassin Royal",
  'The Bear',
  'Succession',
];

async function main() {
  const owner = await db.user.findFirstOrThrow({ where: { role: 'OWNER' } });
  console.log(`Owner : ${owner.email} (${owner.id})`);

  let deleted = 0;
  for (const subject of TEST_SUBJECTS) {
    const result = await db.entry.deleteMany({
      where: {
        authorId: owner.id,
        mediaMeta: { path: ['subject'], equals: subject },
      },
    });
    if (result.count > 0) {
      console.log(`  🗑️  "${subject}" — ${result.count} entrée(s) supprimée(s)`);
      deleted += result.count;
    } else {
      console.log(`  ⚠️  "${subject}" — introuvable (déjà supprimé ?)`);
    }
  }

  console.log(`\nTotal : ${deleted} entrée(s) supprimée(s). Recharge l'app pour que Dexie se mette à jour.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
