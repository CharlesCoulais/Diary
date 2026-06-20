import { Fragment, useState } from 'react';
import { trpc } from '../lib/trpc';
import type { QuizQuestion } from '../lib/db/schema';

/** Énoncé condensé sur une ligne (retire les marques de code) pour les récaps. */
function shortPrompt(s: string): string {
  return s.replace(/```[\w-]*\n?/g, '').replace(/```/g, '').replace(/`/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Vue owner : réponses de chaque utilisateur à un quiz (`quiz.listForEntry`,
 * ownerProcedure). Score + détail dépliable des réponses. Inclut la réponse de
 * l'owner lui-même (libellée « Toi »).
 */

type StoredAnswer = { selected?: number[]; text?: string; correct: boolean; selfCorrected?: boolean };

export function QuizResultsPanel({ entryId, questions }: { entryId: string; questions: QuizQuestion[] }) {
  const { data: me } = trpc.auth.me.useQuery();
  const isOwner = me?.role === 'OWNER';
  // `listForEntry` est owner-only (ownerProcedure) — on n'exécute la requête que
  // pour l'owner, sinon le composant ne rend rien (sheet partagée avec le confident).
  const { data: rowsRaw, isLoading } = trpc.quiz.listForEntry.useQuery({ entryId }, { enabled: isOwner });
  // Type peu profond : la sortie tRPC est trop profonde pour TS (TS2589).
  const rows = rowsRaw as Array<{
    userId: string;
    answers: unknown;
    score: number;
    total: number;
    submitted: boolean;
    user: { id: string; displayName: string | null; email: string; role: string };
  }> | undefined;
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [statsOpen, setStatsOpen] = useState(false);

  if (!isOwner) return null;
  if (isLoading || !rows) return null;
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-text-muted/15 px-4 py-3 text-xs text-text-muted/50 italic">
        Aucune réponse pour l'instant.
      </div>
    );
  }

  const qById = new Map(questions.map((q) => [q.id, q]));
  const toggle = (uid: string) => setOpen((p) => { const n = new Set(p); if (n.has(uid)) n.delete(uid); else n.add(uid); return n; });

  // Taux de réussite par question, agrégé sur toutes les réponses.
  const stats = questions.map((q) => {
    let correct = 0;
    for (const r of rows) {
      const a = (r.answers as Record<string, StoredAnswer>)?.[q.id];
      if (a?.correct) correct++;
    }
    return { id: q.id, prompt: q.prompt, correct, total: rows.length };
  });

  return (
    <div className="rounded-2xl border border-text-muted/12 overflow-hidden bg-bg-elevated/30">
      <button type="button" onClick={() => setStatsOpen((v) => !v)} className="w-full flex items-center gap-2 px-5 py-3 bg-bg-primary/30 border-b border-text-muted/[0.08] text-left hover:bg-bg-primary/40 transition-colors">
        <span className="text-text-muted/45 text-[11px]">{statsOpen ? '▼' : '▶'}</span>
        <span className="font-mono text-[11px] uppercase tracking-widest text-text-muted/55 flex-1">Réponses · {rows.length}</span>
        <span className="font-mono text-[11px] text-text-muted/55">Bilan par question</span>
      </button>

      {/* Bilan par question */}
      {statsOpen && (
        <div className="px-5 py-4 flex flex-col gap-3 border-b border-text-muted/[0.08] bg-bg-primary/15">
          {stats.map((s, i) => {
            const pct = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
            return (
              <div key={s.id} className="flex flex-col gap-1.5">
                <div className="flex items-baseline gap-2 text-xs">
                  <span className="text-text-muted/55 shrink-0 tabular-nums">{i + 1}.</span>
                  <span className="text-text-secondary flex-1 truncate">{shortPrompt(s.prompt)}</span>
                  <span className="tabular-nums text-text-muted/80 shrink-0">{s.correct}/{s.total} · {pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-text-muted/10 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: pct >= 50 ? 'var(--color-success)' : 'var(--color-error)', opacity: 0.7 }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex flex-col">
        {rows.map((r, ri) => {
          const isMe = r.userId === me?.id;
          const name = isMe ? 'Toi' : (r.user.displayName ?? r.user.email.split('@')[0]);
          const answers = (r.answers as Record<string, StoredAnswer>) ?? {};
          const isOpen = open.has(r.userId);
          const pct = r.total > 0 ? Math.round((r.score / r.total) * 100) : 0;
          return (
            <Fragment key={r.userId}>
              {ri > 0 && <div className="mx-5 h-px bg-text-muted/[0.07]" />}
              <button type="button" onClick={() => toggle(r.userId)} className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-text-muted/5 transition-colors">
                <span className="text-text-muted/45 text-[11px]">{isOpen ? '▼' : '▶'}</span>
                <span className="text-[15px] text-text-primary font-medium flex-1 truncate">{name}</span>
                <span className="text-xs font-semibold tabular-nums" style={{ color: pct >= 50 ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                  {r.score} / {r.total}
                </span>
              </button>
              {isOpen && (
                <div className="px-5 pb-3.5 pt-1 flex flex-col gap-2.5 bg-bg-primary/15">
                  {questions.map((q, qi) => {
                    const a = answers[q.id];
                    const given = q.type === 'qcm'
                      ? (a?.selected ?? []).map((i) => qById.get(q.id)?.options?.[i] ?? `#${i + 1}`).join(', ')
                      : (a?.text || '');
                    return (
                      <div key={q.id} className="flex items-start gap-2 text-xs leading-relaxed">
                        <span className={'mt-0.5 shrink-0 font-semibold ' + (a?.correct ? 'text-success' : 'text-danger')}>{a?.correct ? '✓' : '✗'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-text-muted/60">{qi + 1}. {shortPrompt(q.prompt)}</p>
                          <p className="text-text-secondary">
                            {given || <span className="italic text-text-muted/55">sans réponse</span>}
                            {a?.selfCorrected && <span className="ml-1.5 text-[11px] text-text-muted/50 italic">(auto-validé)</span>}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
