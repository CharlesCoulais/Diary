import type { PrismaClient } from '@prisma/client';

/**
 * Construit le « digest » d'un mois envoyé à Claude pour le récap mensuel
 * (cf. lib/aiText.ts → streamRecap, route POST /ai/recap).
 *
 * Périmètre (décidé avec l'autrice) : toutes les notes du mois SAUF les capsules
 * temporelles encore scellées (`unlockAt > now`). Les notes secrètes et adultes
 * SONT incluses. ⚠️ Le récap est lisible par le confident CONFIDANT (choix assumé
 * juin 2026), donc ce digest expose secret/adulte à ce confident — la garantie
 * « secret invisible au confident » ne s'applique pas au récap. Les items de
 * Collection (`collectionOnly`) sont exclus : ce sont des médias possédés, pas
 * des entrées de journal.
 *
 * Les blocs opaques (médias, code, conversations, diagrammes) sont réduits à des
 * marqueurs compacts : l'IA résume de la prose, elle n'a pas besoin du binaire.
 */

const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

/** "2026-05" → "mai 2026". */
export function monthLabel(period: string): string {
  const [y, m] = period.split('-').map(Number) as [number, number];
  return `${MONTHS_FR[m - 1] ?? '?'} ${y}`;
}

/** Garde-fou taille : on borne le digest pour rester raisonnable en tokens. */
const MAX_DIGEST_CHARS = 120_000;
const MAX_ENTRY_CHARS = 4_000;

/** Réduit les blocs opaques à des marqueurs lisibles (pas de round-trip ici). */
function stripOpaque(md: string): string {
  return md
    .replace(/^```[^\n]*\n[\s\S]*?^```[ \t]*$/gm, '[bloc de code]')
    .replace(/^:::chat\b[^\n]*\n[\s\S]*?^:::[ \t]*$/gm, '[conversation]')
    .replace(/^:::mermaid\b[^\n]*\n[\s\S]*?^:::[ \t]*$/gm, '[diagramme]')
    .replace(/^(?:\|\|)?:::img\b[^\n]*$/gm, '[image]')
    .replace(/^(?:\|\|)?:::audio\b[^\n]*$/gm, '[audio]')
    .replace(/^(?:\|\|)?:::video\b[^\n]*$/gm, '[vidéo]')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '[image]')
    // délimiteurs de blocs prose (branch/edit) : on garde le contenu, on retire les :::
    .replace(/^:::[a-z]+\b[^\n]*$/gm, '')
    .replace(/^:::[ \t]*$/gm, '')
    // balises HTML inline (polices/couleurs : <span style=…>) → texte nu
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const NOTE_TYPE_FR: Record<string, string> = {
  BOOK: 'livre', MOVIE: 'film', SERIES: 'série', MUSIC: 'musique',
  DEV: 'note de dev', QUIZZ: 'quizz', DREAM: 'rêve', LETTER: 'lettre',
};

export interface MonthDigest { digest: string; entryCount: number }

export async function buildMonthDigest(
  authorId: string,
  db: PrismaClient,
  period: string,
): Promise<MonthDigest | null> {
  const [y, m] = period.split('-').map(Number) as [number, number];
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1)); // 1er du mois suivant
  const now = new Date();

  const entries = await db.entry.findMany({
    where: {
      authorId,
      deletedAt: null,
      collectionOnly: false,
      date: { gte: start, lt: end },
    },
    select: {
      date: true, title: true, contentMd: true, mood: true, noteType: true,
      unlockAt: true, isSecret: true, isAdult: true,
    },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  });

  // Exclut les capsules encore scellées (contenu non lisible même par l'autrice).
  const visible = entries.filter((e) => !(e.unlockAt && e.unlockAt > now));
  if (visible.length === 0) return null;

  const parts: string[] = ['## Notes du mois', ''];
  let total = parts.join('\n').length;
  let included = 0;
  for (const e of visible) {
    const dd = e.date.toISOString().slice(8, 10);
    const tags: string[] = [];
    if (e.noteType && e.noteType !== 'JOURNAL') tags.push(NOTE_TYPE_FR[e.noteType] ?? e.noteType.toLowerCase());
    if (e.isSecret) tags.push('secret');
    if (e.isAdult) tags.push('intime');
    const meta = tags.length ? ` (${tags.join(', ')})` : '';
    const moodStr = e.mood ? ` — humeur : ${e.mood}` : '';
    const titleStr = e.title?.trim() || '(sans titre)';
    let body = stripOpaque(e.contentMd);
    if (body.length > MAX_ENTRY_CHARS) body = body.slice(0, MAX_ENTRY_CHARS) + '\n[…note tronquée]';
    const block = `### ${dd} · ${titleStr}${meta}${moodStr}\n${body || '(note sans texte)'}\n`;
    if (total + block.length > MAX_DIGEST_CHARS) {
      parts.push(`\n[Les notes suivantes du mois ont été omises faute de place : ${visible.length - included} de plus.]`);
      break;
    }
    parts.push(block);
    total += block.length;
    included++;
  }

  // ── Ressenti quotidien (DailyLog) ──────────────────────────────────────
  const logs = await db.dailyLog.findMany({
    where: { ownerId: authorId, deletedAt: null, date: { gte: start, lt: end } },
    select: { date: true, mood: true, sleepHours: true, weather: true, energy: true, anxiety: true },
    orderBy: { date: 'asc' },
  });
  if (logs.length > 0) {
    parts.push('', '## Ressenti quotidien (suivi du jour)', '');
    for (const l of logs) {
      const dd = l.date.toISOString().slice(8, 10);
      const bits: string[] = [];
      if (l.mood) bits.push(`humeur ${l.mood}`);
      if (l.energy != null) bits.push(`énergie ${l.energy}/5`);
      if (l.anxiety != null) bits.push(`anxiété ${l.anxiety}/5`);
      if (l.sleepHours != null) bits.push(`sommeil ${l.sleepHours} h`);
      if (l.weather) bits.push(`météo intérieure ${l.weather}`);
      if (bits.length) parts.push(`- ${dd} : ${bits.join(', ')}`);
    }
  }

  // ── Baromètre relationnel (CoupleDay) ──────────────────────────────────
  const days = await db.coupleDay.findMany({
    where: { ownerId: authorId, deletedAt: null, date: { gte: start, lt: end } },
    select: { color: true, awayLabel: true },
  });
  if (days.length > 0) {
    const counts: Record<string, number> = {};
    let away = 0;
    for (const d of days) {
      if (d.awayLabel) away++;
      counts[d.color] = (counts[d.color] ?? 0) + 1;
    }
    const label: Record<string, string> = {
      GREEN: 'bonnes journées', RED: 'journées tendues', BLUE: 'journées neutres',
      RED_GREEN: 'journées partagées (bons moments ET tensions)',
    };
    const summary = Object.entries(counts)
      .map(([c, n]) => `${n} ${label[c] ?? c.toLowerCase()}`)
      .join(', ');
    parts.push('', '## Baromètre du couple', '', summary + (away ? `, ${away} jour(s) d'absence.` : '.'));
  }

  return { digest: parts.join('\n'), entryCount: included };
}
