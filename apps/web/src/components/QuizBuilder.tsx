import { useEffect, useRef, useState } from 'react';
import type { QuizQuestion } from '../lib/db/schema';
import { uploadImage } from '../lib/imageUpload';
import { notifyDialog } from '../lib/dialog';
import { QuizText } from './QuizText';

/**
 * Éditeur de quiz (owner) — liste de questions. Chaque question est QCM
 * (options + bonnes réponses, unique ou multiple) ou réponse libre (réponses
 * acceptées). Écrit dans `mediaMeta.quizQuestions` via `onChange`.
 *
 * Les `<input>`/`<textarea>` sont bufferisés (commit au blur) pour éviter les
 * sauts de curseur dus aux re-renders Dexie.
 */

function genId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fallback ci-dessous */ }
  return 'q' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

function BInput({ value, onCommit, placeholder, className }: { value?: string; onCommit: (v: string) => void; placeholder?: string; className?: string }) {
  const [v, setV] = useState(value ?? '');
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setV(value ?? ''); }, [value]);
  return (
    <input
      type="text"
      value={v}
      placeholder={placeholder}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; onCommit(v); }}
      onChange={(e) => setV(e.target.value)}
      className={className ?? 'w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted/55 outline-none border-b border-text-muted/15 focus:border-accent/40 transition-colors pb-0.5'}
    />
  );
}

function BTextarea({ value, onCommit, placeholder, rows }: { value?: string; onCommit: (v: string) => void; placeholder?: string; rows?: number }) {
  const [v, setV] = useState(value ?? '');
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setV(value ?? ''); }, [value]);
  return (
    <textarea
      value={v}
      placeholder={placeholder}
      rows={rows ?? 2}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; onCommit(v); }}
      onChange={(e) => setV(e.target.value)}
      className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted/55 outline-none border border-text-muted/15 rounded-lg px-2.5 py-1.5 focus:border-accent/40 transition-colors resize-none leading-relaxed"
    />
  );
}

const ACCENT = 'var(--color-accent)';

/** Sélecteur d'image : vignette + suppression, ou bouton d'ajout (upload). */
function ImagePick({ url, onChange, entryId, size = 'sm' }: { url?: string; onChange: (url: string | undefined) => void; entryId?: string; size?: 'sm' | 'md' }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const dim = size === 'md' ? 'h-16' : 'h-9';

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const u = await uploadImage(file, entryId);
      onChange(u);
    } catch {
      void notifyDialog({ title: 'Image non importée', message: 'Image trop lourde ou invalide.', tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  if (url) {
    return (
      <div className="relative inline-block shrink-0">
        <img src={url} alt="" className={`${dim} w-auto rounded-lg object-cover border border-text-muted/15`} />
        <button type="button" onClick={() => onChange(undefined)} aria-label="Retirer l'image" className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-bg-elevated border border-text-muted/20 text-text-muted hover:text-danger flex items-center justify-center shadow-sm">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
    );
  }
  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
      <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="shrink-0 inline-flex items-center gap-1 text-[11px] text-text-muted/60 hover:text-accent transition-colors disabled:opacity-50" title="Ajouter une image">
        {busy ? '↻' : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
        )}
        {size === 'md' && <span>Image</span>}
      </button>
    </>
  );
}

export function QuizBuilder({ value, onChange, entryId }: { value: QuizQuestion[]; onChange: (q: QuizQuestion[]) => void; entryId?: string }) {
  const questions = value ?? [];

  const patchQ = (i: number, patch: Partial<QuizQuestion>) =>
    onChange(questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));

  const addQuestion = () =>
    onChange([...questions, { id: genId(), type: 'qcm', prompt: '', options: ['', ''], correct: [], multi: false }]);

  const removeQuestion = (i: number) => onChange(questions.filter((_, idx) => idx !== i));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };

  const setType = (i: number, type: 'qcm' | 'free') => {
    const q = questions[i]!;
    if (q.type === type) return;
    if (type === 'qcm') patchQ(i, { type, options: q.options?.length ? q.options : ['', ''], correct: [], multi: false, accepted: undefined });
    else patchQ(i, { type, accepted: q.accepted?.length ? q.accepted : [''], options: undefined, correct: undefined, multi: undefined });
  };

  // ─── QCM ───
  const setOption = (qi: number, oi: number, text: string) => {
    const q = questions[qi]!;
    const options = [...(q.options ?? [])];
    options[oi] = text;
    patchQ(qi, { options });
  };
  const addOption = (qi: number) => {
    const q = questions[qi]!;
    patchQ(qi, { options: [...(q.options ?? []), ''] });
  };
  const removeOption = (qi: number, oi: number) => {
    const q = questions[qi]!;
    const options = (q.options ?? []).filter((_, i) => i !== oi);
    const correct = (q.correct ?? []).filter((c) => c !== oi).map((c) => (c > oi ? c - 1 : c));
    const optionImages = q.optionImages ? q.optionImages.filter((_, i) => i !== oi) : undefined;
    patchQ(qi, { options, correct, optionImages });
  };
  const setOptionImage = (qi: number, oi: number, url: string | undefined) => {
    const q = questions[qi]!;
    const optionImages = [...(q.optionImages ?? [])];
    while (optionImages.length < (q.options?.length ?? 0)) optionImages.push('');
    optionImages[oi] = url ?? '';
    patchQ(qi, { optionImages: optionImages.some(Boolean) ? optionImages : undefined });
  };
  const toggleCorrect = (qi: number, oi: number) => {
    const q = questions[qi]!;
    if (q.multi) {
      const set = new Set(q.correct ?? []);
      if (set.has(oi)) set.delete(oi); else set.add(oi);
      patchQ(qi, { correct: [...set].sort((a, b) => a - b) });
    } else {
      patchQ(qi, { correct: (q.correct ?? []).includes(oi) ? [] : [oi] });
    }
  };
  const setMulti = (qi: number, multi: boolean) => {
    const q = questions[qi]!;
    // En repassant en « unique », on ne garde qu'au plus une bonne réponse.
    const correct = multi ? (q.correct ?? []) : (q.correct ?? []).slice(0, 1);
    patchQ(qi, { multi, correct });
  };

  // ─── Libre ───
  const setAccepted = (qi: number, ai: number, text: string) => {
    const q = questions[qi]!;
    const accepted = [...(q.accepted ?? [])];
    accepted[ai] = text;
    patchQ(qi, { accepted });
  };
  const addAccepted = (qi: number) => {
    const q = questions[qi]!;
    patchQ(qi, { accepted: [...(q.accepted ?? []), ''] });
  };
  const removeAccepted = (qi: number, ai: number) => {
    const q = questions[qi]!;
    patchQ(qi, { accepted: (q.accepted ?? []).filter((_, i) => i !== ai) });
  };

  return (
    <div className="flex flex-col gap-3">
      {questions.length === 0 && (
        <p className="text-xs text-text-muted/60 italic">Aucune question. Ajoute-en une ci-dessous.</p>
      )}

      {questions.map((q, qi) => (
        <div key={q.id} className="rounded-xl border border-text-muted/15 bg-bg-primary/30 p-3 flex flex-col gap-2.5">
          {/* En-tête : n° + type + actions */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-text-muted/60 shrink-0">Q{qi + 1}</span>
            <div className="flex gap-1">
              {(['qcm', 'free'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(qi, t)}
                  className={'px-2 py-0.5 rounded-full text-[11px] border transition-colors ' + (q.type === t ? 'border-accent/40 bg-accent/10 text-accent font-medium' : 'border-text-muted/15 text-text-muted hover:border-text-muted/30')}
                >
                  {t === 'qcm' ? 'QCM' : 'Réponse libre'}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-0.5">
              <button type="button" onClick={() => move(qi, -1)} disabled={qi === 0} className="p-1 text-text-muted/55 hover:text-text-primary disabled:opacity-25 transition-colors" aria-label="Monter">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
              </button>
              <button type="button" onClick={() => move(qi, 1)} disabled={qi === questions.length - 1} className="p-1 text-text-muted/55 hover:text-text-primary disabled:opacity-25 transition-colors" aria-label="Descendre">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              <button type="button" onClick={() => removeQuestion(qi)} className="p-1 text-text-muted/55 hover:text-danger transition-colors" aria-label="Supprimer la question">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
              </button>
            </div>
          </div>

          {/* Énoncé + image d'illustration */}
          <BTextarea value={q.prompt} onCommit={(v) => patchQ(qi, { prompt: v })} placeholder="Énoncé de la question… (``` pour un bloc de code)" />
          {q.prompt.includes('```') && (
            <div className="rounded-lg border border-text-muted/10 bg-bg-primary/30 px-2.5 py-1.5">
              <span className="text-[11px] uppercase tracking-wide text-text-muted/55">Aperçu</span>
              <QuizText text={q.prompt} className="text-sm text-text-primary mt-1" />
            </div>
          )}
          <div className="flex items-center gap-2">
            <ImagePick url={q.image} onChange={(u) => patchQ(qi, { image: u })} entryId={entryId} size={q.image ? 'md' : 'sm'} />
            {!q.image && <span className="text-[11px] text-text-muted/55">Image d'illustration (optionnelle)</span>}
          </div>

          {/* QCM */}
          {q.type === 'qcm' && (
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-[11px] text-text-muted cursor-pointer select-none">
                <input type="checkbox" checked={!!q.multi} onChange={(e) => setMulti(qi, e.target.checked)} className="accent-[var(--color-accent)]" />
                Plusieurs bonnes réponses possibles
              </label>
              <p className="text-[11px] text-text-muted/50">Coche la/les bonne(s) réponse(s).</p>
              {(q.options ?? []).map((opt, oi) => {
                const isCorrect = (q.correct ?? []).includes(oi);
                return (
                  <div key={oi} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleCorrect(qi, oi)}
                      className={'shrink-0 w-5 h-5 flex items-center justify-center border transition-colors ' + (q.multi ? 'rounded' : 'rounded-full') + ' ' + (isCorrect ? 'text-bg-primary' : 'text-transparent border-text-muted/30 hover:border-accent/50')}
                      style={isCorrect ? { backgroundColor: ACCENT, borderColor: ACCENT } : {}}
                      aria-label={isCorrect ? 'Bonne réponse' : 'Marquer comme bonne réponse'}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    </button>
                    <BInput value={opt} onCommit={(v) => setOption(qi, oi, v)} placeholder={`Option ${oi + 1}`} />
                    <ImagePick url={q.optionImages?.[oi] || undefined} onChange={(u) => setOptionImage(qi, oi, u)} entryId={entryId} />
                    <button type="button" onClick={() => removeOption(qi, oi)} disabled={(q.options ?? []).length <= 2} className="shrink-0 p-1 text-text-muted/45 hover:text-danger disabled:opacity-20 transition-colors" aria-label="Supprimer l'option">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>
                );
              })}
              {(q.options ?? []).length < 12 && (
                <button type="button" onClick={() => addOption(qi)} className="self-start text-[11px] text-accent hover:opacity-70 transition-opacity mt-0.5">+ Ajouter une option</button>
              )}
            </div>
          )}

          {/* Réponse libre */}
          {q.type === 'free' && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] text-text-muted/50">Réponses acceptées (comparées sans tenir compte de la casse, des accents ni des espaces).</p>
              {(q.accepted ?? []).map((ans, ai) => (
                <div key={ai} className="flex items-center gap-2">
                  <span className="shrink-0 w-4 text-center text-text-muted/45 text-xs">✓</span>
                  <BInput value={ans} onCommit={(v) => setAccepted(qi, ai, v)} placeholder={`Réponse acceptée ${ai + 1}`} />
                  <button type="button" onClick={() => removeAccepted(qi, ai)} disabled={(q.accepted ?? []).length <= 1} className="shrink-0 p-1 text-text-muted/45 hover:text-danger disabled:opacity-20 transition-colors" aria-label="Supprimer">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => addAccepted(qi)} className="self-start text-[11px] text-accent hover:opacity-70 transition-opacity mt-0.5">+ Ajouter une réponse acceptée</button>
            </div>
          )}

          {/* Explication optionnelle */}
          <BInput value={q.explanation} onCommit={(v) => patchQ(qi, { explanation: v.trim() || undefined })} placeholder="Explication (optionnelle, montrée après correction)…" className="w-full bg-transparent text-xs text-text-muted placeholder:text-text-muted/45 outline-none border-b border-dashed border-text-muted/10 focus:border-accent/30 transition-colors pb-0.5 italic" />
        </div>
      ))}

      <button
        type="button"
        onClick={addQuestion}
        className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-dashed border-text-muted/25 text-text-muted hover:border-accent/40 hover:text-accent transition-all"
      >
        + Ajouter une question
      </button>
    </div>
  );
}
