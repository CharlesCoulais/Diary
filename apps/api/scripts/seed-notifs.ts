// Insère un exemplaire de chaque type de notif pour l'owner local.
// Lancer : pnpm --filter @carnet/api exec tsx scripts/seed-notifs.ts
import { PrismaClient, NotifType } from '@prisma/client';
import { randomUUID } from 'node:crypto';

async function main() {
  const db = new PrismaClient();
  const owner = await db.user.findFirst({ where: { role: 'OWNER' }, select: { id: true, email: true } });
  if (!owner) {
    console.error('Aucun user OWNER trouvé en local.');
    process.exit(1);
  }
  console.log(`Target user: ${owner.email} (${owner.id})`);

  // Cherche une entrée et un commentaire et une tâche existants pour rendre les notifs cliquables
  const [entry, comment, task] = await Promise.all([
    db.entry.findFirst({ where: { authorId: owner.id, deletedAt: null }, select: { id: true } }),
    db.comment.findFirst({ where: { deletedAt: null, entry: { authorId: owner.id } }, select: { id: true, entryId: true } }),
    db.task.findFirst({ where: { ownerId: owner.id, deletedAt: null }, select: { id: true } }),
  ]);

  const types: NotifType[] = [
    'COMMENT_NEW',
    'COMMENT_REPLY',
    'THREAD_REOPENED',
    'REACTION_NEW',
    'TASK_UPDATED',
    'ENTRY_NEW',
    'ENTRY_EDIT',
    'REQUEST_TREATED',
  ];

  const seedTag = `[SEED ${new Date().toISOString().slice(0, 16)}]`;

  for (const type of types) {
    const data: { id: string; userId: string; type: NotifType; entryId?: string; commentId?: string; taskId?: string; meta?: unknown } = {
      id: randomUUID(),
      userId: owner.id,
      type,
    };
    if (type === 'COMMENT_NEW' || type === 'COMMENT_REPLY' || type === 'THREAD_REOPENED') {
      if (comment) { data.commentId = comment.id; data.entryId = comment.entryId; }
    }
    if (type === 'REACTION_NEW') {
      if (comment) { data.commentId = comment.id; data.entryId = comment.entryId; }
      else if (entry) { data.entryId = entry.id; }
      data.meta = { emoji: '👍', seed: seedTag };
    }
    if (type === 'TASK_UPDATED') {
      if (task) data.taskId = task.id;
      data.meta = { status: { from: 'OPEN', to: 'DONE' }, seed: seedTag };
    }
    if (type === 'ENTRY_NEW' || type === 'ENTRY_EDIT') {
      if (entry) data.entryId = entry.id;
    }
    if (type === 'REQUEST_TREATED') {
      if (entry) data.entryId = entry.id;
      data.meta = { requestId: 'seed-' + randomUUID(), status: 'DONE', seed: seedTag };
    }
    await db.notification.create({ data: data as Parameters<typeof db.notification.create>[0]['data'] });
    console.log(`✓ ${type}`);
  }
  console.log(`\nDone. Tag: ${seedTag}\nPour purger : DELETE FROM "Notification" WHERE meta->>'seed' = '${seedTag}' OR (type IN ('COMMENT_NEW','COMMENT_REPLY','THREAD_REOPENED','ENTRY_NEW','ENTRY_EDIT') AND "createdAt" > NOW() - INTERVAL '5 minutes');`);
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
