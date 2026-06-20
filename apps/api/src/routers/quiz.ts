import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { router, authedProcedure, ownerProcedure } from '../trpc.js';
import { canRead } from '../lib/permissions.js';
import { emitToEntryAudience } from '../lib/events.js';
import { recordAudit } from '../lib/audit.js';

/**
 * Réponses de quiz par utilisateur (note QUIZZ).
 *
 * L'owner définit le quiz dans `Entry.mediaMeta.quizQuestions`. Chaque
 * utilisateur (owner inclus) a au plus une `QuizResponse` par quiz.
 *
 * Anti-triche : la correction est faite **côté serveur** à partir du mediaMeta
 * stocké en base. Les confidents ne reçoivent jamais les bonnes réponses dans le
 * payload (cf. redaction dans `entries.ts`) — la solution n'est révélée qu'après
 * `submit`.
 *
 * Visibilité : l'owner voit toutes les réponses (`listForEntry`, ownerProcedure) ;
 * un confident ne voit que la sienne (`getOwn`).
 */

const ENTRY_PERM_SELECT = {
  authorId: true,
  visibility: true,
  commentsLocked: true,
  commentsResolved: true,
  isSecret: true,
  shares: { select: { receiverId: true, canComment: true } },
} as const;

// ─── Types de la définition du quiz (lus depuis mediaMeta JSON) ───
interface QuizQuestionDef {
  id: string;
  type: 'qcm' | 'free';
  prompt: string;
  options?: string[];
  correct?: number[];
  accepted?: string[];
  explanation?: string;
}

// Réponse stockée par question dans `QuizResponse.answers`.
interface StoredAnswer {
  selected?: number[];
  text?: string;
  correct: boolean;
  selfCorrected?: boolean;
}

function getQuestions(mediaMeta: unknown): QuizQuestionDef[] {
  if (!mediaMeta || typeof mediaMeta !== 'object') return [];
  const q = (mediaMeta as { quizQuestions?: unknown }).quizQuestions;
  return Array.isArray(q) ? (q as QuizQuestionDef[]) : [];
}

/** Normalisation pour comparer les réponses libres : casse, accents, espaces. */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Note une question selon la réponse fournie. */
function gradeQuestion(q: QuizQuestionDef, answer: { selected?: number[]; text?: string }): boolean {
  if (q.type === 'qcm') {
    const sel = new Set(answer.selected ?? []);
    const cor = new Set(q.correct ?? []);
    if (sel.size === 0 || sel.size !== cor.size) return false;
    for (const i of sel) if (!cor.has(i)) return false;
    return true;
  }
  // free
  const text = normalize(answer.text ?? '');
  if (!text) return false;
  return (q.accepted ?? []).map(normalize).includes(text);
}

/** Solution révélée au client après soumission (jamais avant). */
function solutionOf(q: QuizQuestionDef) {
  return {
    questionId: q.id,
    correct: q.type === 'qcm' ? (q.correct ?? []) : undefined,
    accepted: q.type === 'free' ? (q.accepted ?? []) : undefined,
    explanation: q.explanation,
  };
}

const answerInput = z.object({
  selected: z.array(z.number().int().min(0)).max(12).optional(),
  text: z.string().max(2000).optional(),
});

export const quizRouter = router({
  /** Soumet (ou re-soumet) les réponses : correction serveur + sauvegarde. */
  submit: authedProcedure
    .input(z.object({
      entryId: z.string(),
      answers: z.record(z.string(), answerInput),
    }))
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db.entry.findUnique({
        where: { id: input.entryId, deletedAt: null },
        select: { ...ENTRY_PERM_SELECT, mediaMeta: true },
      });
      if (!entry || !canRead(ctx.user, entry)) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      const questions = getQuestions(entry.mediaMeta);
      if (questions.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ce quiz ne contient aucune question.' });
      }

      const stored: Record<string, StoredAnswer> = {};
      let score = 0;
      for (const q of questions) {
        const a = input.answers[q.id] ?? {};
        const correct = gradeQuestion(q, a);
        if (correct) score++;
        stored[q.id] = {
          ...(a.selected ? { selected: a.selected } : {}),
          ...(a.text != null ? { text: a.text } : {}),
          correct,
        };
      }
      const total = questions.length;

      await ctx.db.$transaction(async (tx) => {
        const answersJson = stored as unknown as Prisma.InputJsonValue;
        await tx.quizResponse.upsert({
          where: { entryId_userId: { entryId: input.entryId, userId: ctx.user.id } },
          create: { entryId: input.entryId, userId: ctx.user.id, answers: answersJson, score, total, submitted: true },
          update: { answers: answersJson, score, total, submitted: true },
        });
        await tx.entry.update({ where: { id: input.entryId }, data: { updatedAt: new Date() } });
      });

      void emitToEntryAudience(ctx.db, entry, 'quiz').catch(() => null);
      recordAudit(ctx, 'QUIZ_SUBMITTED', { entryId: input.entryId, metadata: { score, total } });

      return {
        ok: true as const,
        score,
        total,
        results: stored,
        solutions: questions.map(solutionOf),
      };
    }),

  /** Auto-évaluation d'une réponse libre (« j'avais juste »). Ajuste le score. */
  selfCorrect: authedProcedure
    .input(z.object({
      entryId: z.string(),
      questionId: z.string(),
      correct: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db.entry.findUnique({
        where: { id: input.entryId, deletedAt: null },
        select: { ...ENTRY_PERM_SELECT, mediaMeta: true },
      });
      if (!entry || !canRead(ctx.user, entry)) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      const questions = getQuestions(entry.mediaMeta);
      const q = questions.find((x) => x.id === input.questionId);
      if (!q || q.type !== 'free') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Auto-évaluation réservée aux réponses libres.' });
      }

      const resp = await ctx.db.quizResponse.findUnique({
        where: { entryId_userId: { entryId: input.entryId, userId: ctx.user.id } },
      });
      if (!resp) throw new TRPCError({ code: 'NOT_FOUND' });

      const answers = (resp.answers as unknown as Record<string, StoredAnswer>) ?? {};
      const prev = answers[input.questionId] ?? { correct: false };
      answers[input.questionId] = { ...prev, correct: input.correct, selfCorrected: true };
      const score = questions.reduce((acc, qq) => acc + (answers[qq.id]?.correct ? 1 : 0), 0);

      await ctx.db.$transaction(async (tx) => {
        await tx.quizResponse.update({
          where: { entryId_userId: { entryId: input.entryId, userId: ctx.user.id } },
          data: { answers: answers as unknown as Prisma.InputJsonValue, score },
        });
        await tx.entry.update({ where: { id: input.entryId }, data: { updatedAt: new Date() } });
      });

      void emitToEntryAudience(ctx.db, entry, 'quiz').catch(() => null);
      return { ok: true as const, score, total: questions.length };
    }),

  /** Réinitialise le quiz de l'utilisateur courant (supprime sa réponse). */
  reset: authedProcedure
    .input(z.object({ entryId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db.entry.findUnique({
        where: { id: input.entryId, deletedAt: null },
        select: ENTRY_PERM_SELECT,
      });
      if (!entry || !canRead(ctx.user, entry)) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      await ctx.db.$transaction(async (tx) => {
        await tx.quizResponse.deleteMany({ where: { entryId: input.entryId, userId: ctx.user.id } });
        await tx.entry.update({ where: { id: input.entryId }, data: { updatedAt: new Date() } });
      });
      void emitToEntryAudience(ctx.db, entry, 'quiz').catch(() => null);
      recordAudit(ctx, 'QUIZ_RESET', { entryId: input.entryId });
      return { ok: true as const };
    }),

  /** Réponse de l'utilisateur courant sur ce quiz (pour restaurer l'état). */
  getOwn: authedProcedure
    .input(z.object({ entryId: z.string() }))
    .query(async ({ ctx, input }) => {
      const entry = await ctx.db.entry.findUnique({
        where: { id: input.entryId, deletedAt: null },
        select: { ...ENTRY_PERM_SELECT, mediaMeta: true },
      });
      if (!entry || !canRead(ctx.user, entry)) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      const resp = await ctx.db.quizResponse.findUnique({
        where: { entryId_userId: { entryId: input.entryId, userId: ctx.user.id } },
        select: { answers: true, score: true, total: true, submitted: true, updatedAt: true },
      });
      if (!resp) return null;
      // Si soumis, on renvoie aussi les solutions (déjà méritées).
      return {
        ...resp,
        solutions: resp.submitted ? getQuestions(entry.mediaMeta).map(solutionOf) : [],
      };
    }),

  /** Toutes les réponses au quiz (owner uniquement) — vue des résultats. */
  listForEntry: ownerProcedure
    .input(z.object({ entryId: z.string() }))
    .query(async ({ ctx, input }) => {
      const entry = await ctx.db.entry.findFirst({
        where: { id: input.entryId, authorId: ctx.user.id, deletedAt: null },
        select: { id: true },
      });
      if (!entry) throw new TRPCError({ code: 'NOT_FOUND' });

      const rows = await ctx.db.quizResponse.findMany({
        where: { entryId: input.entryId, user: { revokedAt: null } },
        select: {
          userId: true,
          answers: true,
          score: true,
          total: true,
          submitted: true,
          updatedAt: true,
          user: { select: { id: true, displayName: true, email: true, role: true } },
        },
        orderBy: { updatedAt: 'desc' },
      });
      return rows;
    }),
});
