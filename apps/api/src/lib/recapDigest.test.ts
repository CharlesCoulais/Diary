import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { buildMonthDigest, monthLabel } from './recapDigest.js';

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));

/** Faux Prisma minimal : renvoie les jeux de données fournis, capture les `where`. */
function fakeDb(data: { entries?: unknown[]; logs?: unknown[]; days?: unknown[] }) {
  const calls: { entryWhere?: unknown } = {};
  const db = {
    entry: { findMany: vi.fn(async (args: { where: unknown }) => { calls.entryWhere = args.where; return data.entries ?? []; }) },
    dailyLog: { findMany: vi.fn(async () => data.logs ?? []) },
    coupleDay: { findMany: vi.fn(async () => data.days ?? []) },
  };
  return { db: db as unknown as PrismaClient, calls };
}

describe('monthLabel', () => {
  it('formate la période en français', () => {
    expect(monthLabel('2026-05')).toBe('mai 2026');
    expect(monthLabel('2026-01')).toBe('janvier 2026');
    expect(monthLabel('2025-12')).toBe('décembre 2025');
  });
});

describe('buildMonthDigest — périmètre & confidentialité', () => {
  const baseEntries = [
    { date: d(2026, 5, 2), title: 'Balade', contentMd: 'Texte simple.', mood: '🙂', noteType: 'JOURNAL', unlockAt: null, isSecret: false, isAdult: false },
    { date: d(2026, 5, 6), title: 'Pandore', contentMd: 'Contenu secret précis.', mood: null, noteType: 'JOURNAL', unlockAt: null, isSecret: true, isAdult: false },
    { date: d(2026, 5, 8), title: 'Nuit', contentMd: 'Contenu intime.', mood: null, noteType: 'JOURNAL', unlockAt: null, isSecret: false, isAdult: true },
    // Capsule encore scellée (unlockAt futur) → DOIT être exclue
    { date: d(2026, 5, 9), title: 'Capsule', contentMd: 'Pour plus tard.', mood: null, noteType: 'JOURNAL', unlockAt: d(2999, 1, 1), isSecret: false, isAdult: false },
  ];

  it('exclut les capsules encore scellées et compte les notes incluses', async () => {
    const { db } = fakeDb({ entries: baseEntries });
    const res = await buildMonthDigest('owner', db, '2026-05');
    expect(res).not.toBeNull();
    expect(res!.entryCount).toBe(3); // 4 notes - 1 capsule scellée
    expect(res!.digest).toContain('Balade');
    expect(res!.digest).not.toContain('Capsule');
    expect(res!.digest).not.toContain('Pour plus tard');
  });

  it('inclut et tague les notes secret/adulte (choix assumé)', async () => {
    const { db } = fakeDb({ entries: baseEntries });
    const res = await buildMonthDigest('owner', db, '2026-05');
    expect(res!.digest).toContain('(secret)');
    expect(res!.digest).toContain('Contenu secret précis'); // le résumeur a le contenu
    expect(res!.digest).toContain('(intime)');
  });

  it('interroge la base en excluant items de Collection et notes supprimées', async () => {
    const { db, calls } = fakeDb({ entries: baseEntries });
    await buildMonthDigest('owner', db, '2026-05');
    expect(calls.entryWhere).toMatchObject({ authorId: 'owner', deletedAt: null, collectionOnly: false });
  });

  it('réduit les blocs opaques (médias/code) à des marqueurs', async () => {
    const { db } = fakeDb({ entries: [
      { date: d(2026, 5, 3), title: 'Média', contentMd: ':::img photo-secrete-123', mood: null, noteType: 'JOURNAL', unlockAt: null, isSecret: false, isAdult: false },
    ] });
    const res = await buildMonthDigest('owner', db, '2026-05');
    expect(res!.digest).toContain('[image]');
    expect(res!.digest).not.toContain('photo-secrete-123');
  });

  it('ajoute les sections ressenti & baromètre quand il y a des données', async () => {
    const { db } = fakeDb({
      entries: baseEntries,
      logs: [{ date: d(2026, 5, 2), mood: '🙂', sleepHours: 7, weather: '☀️', energy: 3, anxiety: 2 }],
      days: [{ color: 'GREEN', awayLabel: null }, { color: 'RED', awayLabel: null }],
    });
    const res = await buildMonthDigest('owner', db, '2026-05');
    expect(res!.digest).toContain('Ressenti quotidien');
    expect(res!.digest).toContain('Baromètre du couple');
    expect(res!.digest).toContain('1 bonnes journées');
  });

  it('renvoie null quand aucune note visible', async () => {
    const { db } = fakeDb({ entries: [] });
    expect(await buildMonthDigest('owner', db, '2026-05')).toBeNull();
  });
});
