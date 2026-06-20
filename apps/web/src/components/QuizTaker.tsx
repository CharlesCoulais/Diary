import { Fragment, useEffect, useMemo, useState } from 'react';
import { trpc } from '../lib/trpc';
import type { QuizQuestion } from '../lib/db/schema';
import { QuizText } from './QuizText';
import { CommentContent } from './CommentContent';

/**
 * Prise du quiz en lecture (owner + confident). Chaque utilisateur a sa propre
 * sauvegarde côté serveur (`quiz.getOwn`). La correction est faite côté serveur
 * (`quiz.submit`) — les bonnes réponses ne sont révélées qu'après validation.
 *
 * - QCM : radio (réponse unique) ou cases (réponses multiples, `q.multi`).
 * - Libre : champ texte, comparé sans casse/accents/espaces. En cas d'échec, la
 *   réponse attendue est montrée + bouton « J'avais juste » (auto-évaluation).
 * - Bouton « Recommencer » qui réinitialise la sauvegarde de l'utilisateur.
 */

type StoredAnswer = { selected?: number[]; text?: string; correct: boolean; selfCorrected?: boolean };
type Solution = { questionId: string; correct?: number[]; accepted?: string[]; explanation?: string };

// Petit retour chaleureux selon le score (app de couple — ton bienveillant).
function scoreMessage(score: number, total: number): string {
  if (total <= 0) return '';
  const r = score / total;
  if (r >= 1) return 'Sans faute ! 🎉';
  if (r >= 0.75) return 'Beau score !';
  if (r >= 0.5) return 'Pas mal !';
  return 'Une autre fois 😉';
}

function shuffled(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function QuizTaker({ entryId, questions, shuffleQuestions, shuffleOptions }: { entryId: string; questions: QuizQuestion[]; shuffleQuestions?: boolean; shuffleOptions?: boolean }) {
  const utils = trpc.useUtils();
  const { data: ownRaw, isLoading } = trpc.quiz.getOwn.useQuery({ entryId });
  // Type peu profond : la sortie tRPC est trop profonde pour TS (TS2589).
  const own = ownRaw as { submitted: boolean; answers: unknown; solutions?: unknown; score: number; total: number } | null | undefined;

  // Ordre d'affichage (mélangé à chaque tentative). `nonce` force un re-mélange
  // au « Recommencer ». L'ordre est purement visuel : la correction reste par
  // id de question / index d'option d'origine.
  const [nonce, setNonce] = useState(0);
  const order = useMemo(() => {
    const qOrder = shuffleQuestions ? shuffled(questions.length) : questions.map((_, i) => i);
    const optOrders: Record<string, number[]> = {};
    for (const q of questions) {
      const len = q.options?.length ?? 0;
      optOrders[q.id] = (shuffleOptions && q.type === 'qcm') ? shuffled(len) : Array.from({ length: len }, (_, i) => i);
    }
    return { qOrder, optOrders };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, shuffleQuestions, shuffleOptions, nonce]);

  // Réponses en cours de saisie (phase édition).
  const [draft, setDraft] = useState<Record<string, { selected?: number[]; text?: string }>>({});
  // État « corrigé » courant (résultats + solutions) — vient du serveur.
  const [results, setResults] = useState<Record<string, StoredAnswer> | null>(null);
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [score, setScore] = useState(0);

  const invalidate = () => {
    void utils.quiz.getOwn.invalidate({ entryId });
    void utils.quiz.listForEntry.invalidate({ entryId });
    window.dispatchEvent(new Event('carnet:sse-sync'));
  };

  // Restaure l'état depuis la sauvegarde serveur.
  useEffect(() => {
    if (own?.submitted) {
      setResults(own.answers as unknown as Record<string, StoredAnswer>);
      setSolutions((own.solutions ?? []) as unknown as Solution[]);
      setScore(own.score);
    } else {
      setResults(null);
      setSolutions([]);
    }
  }, [own]);

  const submit = trpc.quiz.submit.useMutation({
    onSuccess: (data) => {
      setResults(data.results as unknown as Record<string, StoredAnswer>);
      setSolutions(data.solutions as unknown as Solution[]);
      setScore(data.score);
      invalidate();
    },
  });
  const reset = trpc.quiz.reset.useMutation({
    onSuccess: () => {
      setResults(null);
      setSolutions([]);
      setDraft({});
      setNonce((n) => n + 1); // re-mélange pour la nouvelle tentative
      invalidate();
    },
  });
  const selfCorrect = trpc.quiz.selfCorrect.useMutation({
    onSuccess: (data) => {
      setScore(data.score);
      invalidate();
    },
  });

  const solByQ = useMemo(() => {
    const m = new Map<string, Solution>();
    for (const s of solutions) m.set(s.questionId, s);
    return m;
  }, [solutions]);

  if (!questions || questions.length === 0) return null;
  if (isLoading) return <div className="text-xs text-text-muted/50 italic py-2">Chargement du quiz…</div>;

  const done = results != null;
  const total = questions.length;

  // ─── Saisie (phase édition) ───
  const toggleQcm = (q: QuizQuestion, oi: number) => {
    setDraft((prev) => {
      const cur = prev[q.id]?.selected ?? [];
      let next: number[];
      if (q.multi) next = cur.includes(oi) ? cur.filter((x) => x !== oi) : [...cur, oi].sort((a, b) => a - b);
      else next = cur.includes(oi) ? [] : [oi];
      return { ...prev, [q.id]: { ...prev[q.id], selected: next } };
    });
  };
  const setFree = (q: QuizQuestion, text: string) => {
    setDraft((prev) => ({ ...prev, [q.id]: { ...prev[q.id], text } }));
  };

  const allAnswered = questions.every((q) => {
    const a = draft[q.id];
    return q.type === 'qcm' ? (a?.selected?.length ?? 0) > 0 : !!a?.text?.trim();
  });

  return (
    <div className="rounded-2xl border border-text-muted/12 overflow-hidden bg-bg-elevated/30">
      {/* En-tête */}
      <div className="flex items-center justify-between px-5 py-3 bg-bg-primary/30 border-b border-text-muted/[0.08]">
        <span className="font-mono text-[11px] uppercase tracking-widest text-text-muted/55">Quizz · {total} question{total > 1 ? 's' : ''}</span>
        {done && (
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] italic text-text-muted/70 truncate">{scoreMessage(score, total)}</span>
            <span className="text-sm font-semibold tabular-nums shrink-0" style={{ color: 'var(--color-accent)' }}>
              {score} / {total}
            </span>
          </span>
        )}
      </div>

      <div className="flex flex-col">
        {order.qOrder.map((qi, displayPos) => {
          const q = questions[qi]!;
          const sol = solByQ.get(q.id);
          const res = results?.[q.id];
          return (
            <Fragment key={q.id}>
              {displayPos > 0 && <div className="mx-5 h-px bg-text-muted/[0.07]" />}
              <div className="px-5 py-4 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <span className="text-xs font-mono text-text-muted/55 mt-1 shrink-0 tabular-nums">{displayPos + 1}.</span>
                <div className="flex-1 flex flex-col gap-2.5 min-w-0">
                  <QuizText text={q.prompt} className="text-[15px] leading-relaxed text-text-primary font-medium" />
                  {q.image && <img src={q.image} alt="" className="max-h-56 w-auto rounded-lg object-contain self-start border border-text-muted/10" />}
                </div>
                {done && res && (
                  <span className={'shrink-0 text-sm font-semibold mt-0.5 ' + (res.correct ? 'text-success' : 'text-danger')}>
                    {res.correct ? '✓' : '✗'}
                  </span>
                )}
              </div>

              {/* QCM */}
              {q.type === 'qcm' && (
                <div className="flex flex-col gap-2 pl-[26px]">
                  {order.optOrders[q.id]!.map((oi) => {
                    const opt = q.options?.[oi] ?? '';
                    const selectedDraft = (draft[q.id]?.selected ?? []).includes(oi);
                    const selectedDone = (res?.selected ?? []).includes(oi);
                    const isCorrect = (sol?.correct ?? []).includes(oi);
                    let cls = 'border-text-muted/20';
                    let style: React.CSSProperties = {};
                    if (done) {
                      if (isCorrect) { cls = 'border-success/50'; style = { background: 'color-mix(in srgb, var(--color-success) 12%, transparent)' }; }
                      else if (selectedDone) { cls = 'border-danger/50'; style = { background: 'color-mix(in srgb, var(--color-error) 10%, transparent)' }; }
                    } else if (selectedDraft) {
                      cls = 'border-accent/50'; style = { background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)' };
                    }
                    return (
                      <button
                        key={oi}
                        type="button"
                        disabled={done}
                        onClick={() => toggleQcm(q, oi)}
                        className={'flex items-center gap-3 text-left px-3 py-2.5 rounded-xl border text-[15px] transition-colors ' + cls + (done ? ' cursor-default' : ' hover:border-text-muted/40')}
                        style={style}
                      >
                        <span className={'shrink-0 w-4 h-4 flex items-center justify-center border ' + (q.multi ? 'rounded' : 'rounded-full') + ' ' + ((done ? selectedDone : selectedDraft) ? 'border-transparent' : 'border-text-muted/40')}
                          style={(done ? selectedDone : selectedDraft) ? { backgroundColor: done ? (isCorrect ? 'var(--color-success)' : 'var(--color-error)') : 'var(--color-accent)' } : {}}
                        >
                          {(done ? selectedDone : selectedDraft) && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                          )}
                        </span>
                        <span className="flex-1 flex items-center gap-2 min-w-0">
                          {q.optionImages?.[oi] && <img src={q.optionImages[oi]} alt="" className="h-12 w-auto rounded object-cover shrink-0 border border-text-muted/10" />}
                          {opt && <span className={done && isCorrect ? 'text-text-primary font-medium' : 'text-text-secondary'}><CommentContent content={opt} /></span>}
                        </span>
                        {done && isCorrect && <span className="text-[11px] text-success shrink-0">bonne réponse</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Réponse libre */}
              {q.type === 'free' && (
                <div className="pl-[26px] flex flex-col gap-1.5">
                  {!done ? (
                    <input
                      type="text"
                      value={draft[q.id]?.text ?? ''}
                      onChange={(e) => setFree(q, e.target.value)}
                      placeholder="Ta réponse…"
                      className="w-full bg-transparent text-[15px] text-text-primary placeholder:text-text-muted/55 outline-none border-b border-text-muted/20 focus:border-accent/40 transition-colors py-2"
                    />
                  ) : (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-text-secondary">Ta réponse : <span className={res?.correct ? 'text-success font-medium' : 'text-danger'}>{res?.text || '—'}</span></span>
                      </div>
                      {!res?.correct && (sol?.accepted?.length ?? 0) > 0 && (
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          <span className="text-text-muted/70">Réponse attendue : <span className="text-success">{sol!.accepted!.join(' · ')}</span></span>
                          {!res?.selfCorrected && (
                            <button
                              type="button"
                              onClick={() => selfCorrect.mutate({ entryId, questionId: q.id, correct: true })}
                              className="inline-flex items-center px-2 py-1 -my-1 text-[11px] text-accent hover:opacity-70 transition-opacity underline underline-offset-2"
                            >
                              J'avais juste
                            </button>
                          )}
                          {res?.selfCorrected && <span className="text-[11px] text-text-muted/50 italic">auto-validé</span>}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Explication (après correction) */}
              {done && sol?.explanation && (
                <p className="pl-[26px] text-xs text-text-muted/70 italic leading-relaxed">{sol.explanation}</p>
              )}
              </div>
            </Fragment>
          );
        })}
      </div>

      {/* Pied : valider / recommencer */}
      <div className="px-5 py-3.5 border-t border-text-muted/[0.08] flex items-center justify-end gap-2">
        {!done ? (
          <button
            type="button"
            disabled={!allAnswered || submit.isPending}
            onClick={() => submit.mutate({ entryId, answers: draft })}
            className="inline-flex items-center justify-center px-4 min-h-[40px] rounded-full text-sm font-medium text-bg-primary disabled:opacity-40 transition-opacity"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            {submit.isPending ? 'Correction…' : 'Valider'}
          </button>
        ) : (
          <button
            type="button"
            disabled={reset.isPending}
            onClick={() => reset.mutate({ entryId })}
            className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-full text-sm text-text-muted hover:text-text-primary border border-text-muted/20 hover:border-text-muted/40 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v6h6M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
            Recommencer
          </button>
        )}
      </div>
    </div>
  );
}
