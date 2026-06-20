/**
 * Sauvegarde complète de la base dans un JSON horodaté (apps/api/backups/).
 *
 * Aucune dépendance externe (pas besoin de `pg_dump`) → fonctionne à l'identique
 * en local et en prod. Écrit en JavaScript pur (.mjs) et lancé avec `node` —
 * volontairement sans `tsx`, qui n'est qu'une devDependency absente en prod.
 *
 * Lancé automatiquement avant chaque migration (db:migrate / db:deploy / db:reset).
 * Si la sauvegarde échoue, le script sort en code ≠ 0 → la chaîne `&&` s'arrête
 * et la migration NE tourne PAS. Pas de sauvegarde = pas de migration.
 *
 * Restauration : pnpm --filter @carnet/api db:restore <fichier>
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { mkdir, writeFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';

// Local : on charge .env si DATABASE_URL n'est pas déjà fourni.
// Prod : les variables d'env sont déjà injectées → le try/catch absorbe l'absence de .env.
if (!process.env.DATABASE_URL) {
  try { process.loadEnvFile(path.resolve('.env')); } catch { /* prod : pas de fichier .env */ }
}

const KEEP = 20; // nombre de sauvegardes conservées
const dir = path.resolve('backups');
const db = new PrismaClient();

try {
  await mkdir(dir, { recursive: true });

  const dump = {};
  const counts = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    const accessor = model.name[0].toLowerCase() + model.name.slice(1);
    const rows = await db[accessor].findMany();
    dump[model.name] = rows;
    counts.push(`${model.name}:${rows.length}`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `backup-${stamp}.json`);
  await writeFile(file, JSON.stringify(dump));

  // Purge : ne conserve que les KEEP sauvegardes les plus récentes.
  const olds = (await readdir(dir))
    .filter((f) => f.startsWith('backup-') && f.endsWith('.json'))
    .sort()
    .slice(0, -KEEP);
  for (const f of olds) await unlink(path.join(dir, f));

  console.log(`💾 Sauvegarde DB → ${path.relative(process.cwd(), file)}`);
  console.log(`   ${counts.join('  ')}`);
} catch (err) {
  // Base pas encore migrée (aucune table) → rien à sauvegarder, ce n'est pas une erreur.
  if (err?.code === 'P2021' || /does not exist|n'existe pas/i.test(err?.message ?? '')) {
    console.log('ℹ️  Base non encore migrée — rien à sauvegarder.');
  } else {
    console.error('⚠️  Échec de la sauvegarde DB — migration annulée :', err?.message ?? err);
    process.exitCode = 1;
  }
} finally {
  await db.$disconnect();
}
