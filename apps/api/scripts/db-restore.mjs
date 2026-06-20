/**
 * Restaure une sauvegarde JSON produite par db:backup.
 *
 * Usage : pnpm --filter @carnet/api db:restore backups/backup-XXXX.json
 *
 * Insère toutes les lignes dans une transaction unique en désactivant les
 * contraintes de clé étrangère le temps de l'import (`SET LOCAL
 * session_replication_role = 'replica'`) — l'ordre des tables n'a donc pas
 * d'importance. À lancer sur une base fraîchement migrée (vide).
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

if (!process.env.DATABASE_URL) {
  try { process.loadEnvFile(path.resolve('.env')); } catch { /* prod : pas de fichier .env */ }
}

const fileArg = process.argv[2];
if (!fileArg) {
  console.error('Usage : pnpm --filter @carnet/api db:restore <fichier.json>');
  process.exit(1);
}

const dump = JSON.parse(await readFile(path.resolve(fileArg), 'utf8'));
const db = new PrismaClient();

try {
  let total = 0;
  await db.$transaction(async (tx) => {
    // Désactive les triggers FK pour cette transaction → ordre d'insertion libre.
    await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`);
    for (const model of Prisma.dmmf.datamodel.models) {
      const rows = dump[model.name];
      if (!rows || rows.length === 0) continue;
      const accessor = model.name[0].toLowerCase() + model.name.slice(1);
      await tx[accessor].createMany({ data: rows, skipDuplicates: true });
      total += rows.length;
      console.log(`  ${model.name}: ${rows.length}`);
    }
  }, { timeout: 120_000 });
  console.log(`✅ Restauration terminée — ${total} lignes insérées.`);
} catch (err) {
  console.error('❌ Échec de la restauration :', err?.message ?? err);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
