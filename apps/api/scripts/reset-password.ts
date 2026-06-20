/**
 * Réinitialise le mot de passe d'un compte directement en base — utile quand
 * on est verrouillé dehors (pas d'accès à un device, pas d'email configuré).
 *
 * Usage : pnpm --filter @carnet/api reset:password <email> <nouveau-mot-de-passe>
 *
 * Toutes les sessions actives de l'utilisateur sont révoquées au passage.
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth/password.js';

const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error('Usage : pnpm --filter @carnet/api reset:password <email> <nouveau-mot-de-passe>');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Le mot de passe doit faire au moins 8 caractères.');
  process.exit(1);
}

const db = new PrismaClient();

try {
  const user = await db.user.findUnique({ where: { email }, select: { id: true, role: true } });
  if (!user) {
    console.error(`Aucun utilisateur avec l'email "${email}".`);
    process.exit(1);
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password) },
  });
  const revoked = await db.session.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  console.log(`✅ Mot de passe réinitialisé pour ${email} (${user.role}).`);
  console.log(`   ${revoked.count} session(s) active(s) révoquée(s).`);
} finally {
  await db.$disconnect();
}
