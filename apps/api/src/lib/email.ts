/**
 * Service d'envoi d'email — sender abstrait.
 *
 * Pour l'instant, l'app n'a pas de service email configuré côté infra
 * (Postmark / Resend / SES / SMTP). On expose ici une interface stable
 * qui :
 *   - en dev (NODE_ENV !== 'production' ou pas d'env SMTP_*) : log le
 *     mail au console avec un séparateur clair pour qu'on puisse copier
 *     le lien depuis les logs pendant les tests
 *   - en prod (si SMTP_HOST + SMTP_USER + SMTP_PASS configurés) : tente
 *     un envoi via nodemailer — mais comme nodemailer n'est pas installé,
 *     on log un warning et on tombe sur le mode console
 *
 * Quand un vrai service est choisi :
 *   1. `pnpm --filter @carnet/api add nodemailer` (ou postmark, resend…)
 *   2. Remplacer le `sendMail` ci-dessous par l'appel réel
 *   3. Lire SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / EMAIL_FROM
 *      dans `env.ts`
 *
 * En attendant, le flow complet de reset password est implémenté côté
 * serveur — il suffit de regarder les logs pour récupérer le lien.
 */

export interface MailMessage {
  to: string;
  subject: string;
  /** Corps texte brut (obligatoire — fallback pour les clients qui ne rendent pas HTML). */
  text: string;
  /** Corps HTML optionnel. */
  html?: string;
}

const HAS_SMTP_CONFIG = !!(
  process.env.SMTP_HOST
  && process.env.SMTP_USER
  && process.env.SMTP_PASS
  && process.env.EMAIL_FROM
);

export async function sendMail(message: MailMessage): Promise<void> {
  if (!HAS_SMTP_CONFIG) {
    // eslint-disable-next-line no-console
    console.log(
      '\n' +
      '═════════════════════════════════════════════════════════════════\n' +
      '📧 [DEV] Email non envoyé (pas de SMTP configuré). Contenu :\n' +
      '─────────────────────────────────────────────────────────────────\n' +
      `To:      ${message.to}\n` +
      `Subject: ${message.subject}\n` +
      '─────────────────────────────────────────────────────────────────\n' +
      message.text + '\n' +
      '═════════════════════════════════════════════════════════════════\n',
    );
    return;
  }

  // Branchement réel à activer quand nodemailer (ou alternative) sera
  // installé. Pour l'instant on log et on fail silencieusement — le
  // serveur ne doit jamais crasher sur un échec d'envoi de mail.
  // eslint-disable-next-line no-console
  console.warn('[email] SMTP_* configuré mais aucun client mail branché. Mail ignoré.');
}
