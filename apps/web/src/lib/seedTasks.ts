import { db } from './db/schema';
import type { LocalTask } from './db/schema';

const STATUSES: LocalTask['status'][] = [
  'OPEN', 'OPEN', 'OPEN',
  'SCHEDULED', 'SCHEDULED',
  'IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS',
  'LOCAL_DONE',
  'TO_TEST', 'TO_TEST',
  'DEPLOYED',
  'DONE', 'DONE', 'DONE',
  'CANCELLED',
];

const PRIORITIES: LocalTask['priority'][] = [
  null, null, null,
  'HIGH', 'HIGH',
  'MEDIUM', 'MEDIUM', 'MEDIUM',
  'LOW', 'LOW',
];

const CATEGORIES = ['Perso', 'Perso', 'Travail', 'Travail', 'Travail', 'Dev', 'Dev', 'Sport', 'Maison', null];
const TYPES = ['Feature', 'Bug fix', 'Enhancement', 'Refactor', 'Santé', 'Sport', 'Idée', 'Finance', null, null];

const TASKS: { title: string; notes?: string }[] = [
  { title: 'Refaire la page d\'accueil mobile', notes: 'Penser à l\'ergonomie tactile et aux safe areas iOS.' },
  { title: 'Corriger le bug de sync offline', notes: 'Reproductible quand on perd le réseau pendant un push.' },
  { title: 'Ajouter les notifications push pour les tâches', notes: 'Utiliser le service worker existant.' },
  { title: 'Prendre RDV médecin de famille' },
  { title: 'Renouveler l\'abonnement sport' },
  { title: 'Optimiser les requêtes Prisma sur /sync', notes: 'Éviter les N+1 sur les entrées avec tags.' },
  { title: 'Faire une session cardio 45 min' },
  { title: 'Appeler le plombier pour la fuite' },
  { title: 'Mettre à jour les dépendances npm', notes: 'Vite, React, Tailwind — vérifier les breaking changes.' },
  { title: 'Rédiger la doc API REST', notes: 'Couvrir auth, entries, tasks, sync.' },
  { title: 'Implémenter le dark mode automatique (system)' },
  { title: 'Commander les livres de la liste de lecture' },
  { title: 'Préparer la présentation pour la réunion Q3' },
  { title: 'Migrer la base vers PostgreSQL 16' },
  { title: 'Ajouter les tests E2E Playwright' },
  { title: 'Faire le ménage de printemps dans la cave' },
  { title: 'Vérifier la facture EDF de mars' },
  { title: 'Créer les composants de l\'onboarding', notes: 'Étapes : profil, confidant, première note.' },
  { title: 'Changer les filtres de la VMC' },
  { title: 'Finaliser le design system — tokens couleur' },
  { title: 'Écrire le changelog v2.4' },
  { title: 'Acheter cadeau anniversaire pour Marie' },
  { title: 'Configurer le backup automatique de la base', notes: 'S3 + rotation 30 jours.' },
  { title: 'Réparer la branche de l\'arbre du jardin' },
  { title: 'Tester la sync sur iOS Safari 17' },
  { title: 'Refactorer le hook useSync', notes: 'Extraire la logique de conflit dans un helper dédié.' },
  { title: 'Préparer le repas de dimanche' },
  { title: 'Résoudre l\'alert Sentry #4821 — RangeError' },
  { title: 'Mettre à jour la page Help center — section tasks' },
  { title: 'Planifier les vacances de juillet', notes: 'Bretagne ou Pyrénées.' },
  { title: 'Rédiger le post-mortem de l\'incident du 12 mai' },
  { title: 'Implémenter le rate-limiting sur /trpc/auth' },
  { title: 'Acheter peinture pour la chambre' },
  { title: 'Review PR #47 — filtres avancés timeline' },
  { title: 'Mettre à jour le README du monorepo' },
  { title: 'Appeler grand-mère pour son anniversaire' },
  { title: 'Ajouter l\'export PDF pour les tâches' },
  { title: 'Configurer les alerts Uptime Robot' },
  { title: 'Ranger le bureau et trier les câbles' },
  { title: 'Finir le livre "Deep Work"' },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

function randomDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export async function seedTasks(ownerId: string, confidentId?: string) {
  const now = new Date();

  const tasks: LocalTask[] = TASKS.map((t, i) => {
    const status = pick(STATUSES);
    const isDone = ['DONE', 'CANCELLED', 'LOCAL_DONE', 'DEPLOYED'].includes(status);
    const offsetDays = Math.floor(Math.random() * 60) - 10; // -10 à +50 jours
    const hasDue = Math.random() > 0.4;
    const isFromConfident = confidentId && Math.random() > 0.7;

    const createdAt = new Date(now.getTime() - i * 3_600_000 * Math.floor(Math.random() * 48)).toISOString();

    return {
      id: crypto.randomUUID(),
      ownerId,
      title: t.title,
      notes: t.notes ?? null,
      status,
      dueDate: hasDue ? randomDate(offsetDays) : null,
      completedAt: isDone ? createdAt : null,
      category: pick(CATEGORIES),
      taskType: pick(TYPES),
      priority: pick(PRIORITIES),
      sortOrder: null,
      createdBy: isFromConfident ? confidentId! : ownerId,
      version: 0,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      _dirty: true,
    };
  });

  await db.tasks.bulkPut(tasks);
  console.info(`✅ ${tasks.length} tâches injectées.`);
  return tasks.length;
}
