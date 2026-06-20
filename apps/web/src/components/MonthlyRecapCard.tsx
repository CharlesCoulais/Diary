import { useState, useRef, useEffect, useMemo } from 'react';
import { marked } from 'marked';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db/schema';
import { trpc } from '../lib/trpc';

/**
 * Récap mensuel IA (page Stats), présenté en ACCORDÉON de mois : tous repliés
 * sauf le plus récent. Chaque mois s'ouvre pour lire (ou générer, côté owner) son
 * récap — Claude (plan Max) écrit une courte lettre adressée à l'autrice (« tu »).
 *
 * - Owner : liste des mois depuis Dexie (≥5 notes), chaque ligne indique si un
 *   récap existe ; génération / régénération en streaming (POST /ai/recap).
 * - Confident CONFIDANT : LECTURE SEULE, liste des seuls mois déjà générés
 *   (ai.listRecapPeriods). ⚠️ Le récap inclut le résumé des notes secret/adulte.
 *
 * Une seule requête getRecap à la fois (sur le mois ouvert).
 */

const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];
function monthLabel(period: string): string {
  const [y, m] = period.split('-').map(Number) as [number, number];
  return `${MONTHS_FR[m - 1] ?? '?'} ${y}`;
}

const MIN_ENTRIES = 5; // owner : mois listé seulement au-delà
const MODEL_META: Record<string, { label: string; hint: string }> = {
  haiku: { label: 'Haiku', hint: 'rapide' },
  sonnet: { label: 'Sonnet', hint: 'équilibré' },
  opus: { label: 'Opus', hint: 'le meilleur' },
};
const MODEL_STORAGE_KEY = 'diary-ai-model';

function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);
}

type Phase = 'idle' | 'streaming' | 'error';

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function MonthlyRecapCard() {
  const { data: me } = trpc.auth.me.useQuery();
  const isGuest = me?.role === 'GUEST';

  const { data: status } = trpc.ai.status.useQuery(undefined, { staleTime: 5 * 60_000 });
  const utils = trpc.useUtils();

  // Mois déjà générés (owner = les siens, confident = ceux de l'owner).
  const { data: apiPeriods } = trpc.ai.listRecapPeriods.useQuery(undefined, { staleTime: 60_000 });
  const generatedSet = useMemo(
    () => new Set((apiPeriods ?? []).map((p) => p.period)),
    [apiPeriods],
  );

  // Owner : mois depuis Dexie (≥5 notes). Confident : les mois générés (API).
  const dexieMonths = useLiveQuery(async () => {
    const entries = await db.entries
      .filter((e) => e.deletedAt === null && !e.collectionOnly)
      .toArray();
    const counts = new Map<string, number>();
    for (const e of entries) {
      const p = e.date.slice(0, 7);
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .filter(([, n]) => n >= MIN_ENTRIES)
      .map(([period, n]) => ({ period, count: n }))
      .sort((a, b) => (a.period < b.period ? 1 : -1));
  }, []);

  const months: { period: string; count: number }[] | undefined = isGuest
    ? apiPeriods?.map((p) => ({ period: p.period, count: p.entryCount }))
    : dexieMonths;

  // Accordéon : un seul mois ouvert. Le plus récent est ouvert UNE fois au
  // premier chargement (didInit) ; ensuite on respecte les replis manuels —
  // sinon replier le mois courant le rouvrirait aussitôt (openPeriod=null).
  const [openPeriod, setOpenPeriod] = useState<string | null>(null);
  const didInitRef = useRef(false);
  useEffect(() => {
    if (!didInitRef.current && months && months.length > 0) {
      didInitRef.current = true;
      setOpenPeriod(months[0]!.period);
    }
  }, [months]);

  const [modelPref, setModelPref] = useState<string | null>(() => localStorage.getItem(MODEL_STORAGE_KEY));
  const modelsList: string[] = status?.models ? [...status.models] : ['haiku', 'sonnet', 'opus'];
  const model = modelPref && modelsList.includes(modelPref) ? modelPref : (status?.defaultModel ?? 'sonnet');

  const { data: stored, isLoading: loadingStored } = trpc.ai.getRecap.useQuery(
    { period: openPeriod ?? '' },
    { enabled: !!openPeriod },
  );

  const [phase, setPhase] = useState<Phase>('idle');
  const [streamText, setStreamText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [usage, setUsage] = useState<{ input: number; output: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  // Changement de mois ouvert → on coupe une éventuelle génération en cours.
  useEffect(() => { abortRef.current?.abort(); setPhase('idle'); setStreamText(''); setErrorMsg(''); setUsage(null); }, [openPeriod]);

  // Confident : journalise l'ouverture d'un récap (une fois par mois consulté).
  const logRecapOpen = trpc.ai.logRecapOpen.useMutation();
  const loggedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (isGuest && stored?.period && !loggedRef.current.has(stored.period)) {
      loggedRef.current.add(stored.period);
      logRecapOpen.mutate({ period: stored.period });
    }
  }, [isGuest, stored?.period, logRecapOpen]);

  const recapHtml = useMemo(
    () => (stored ? (marked.parse(stored.contentMd, { breaks: true, gfm: true }) as string) : ''),
    [stored],
  );

  if (!isGuest && !status?.enabled) return null;
  if (months !== undefined && months.length === 0) return null;

  const pickModel = (m: string) => { setModelPref(m); localStorage.setItem(MODEL_STORAGE_KEY, m); };

  const generate = async (period: string) => {
    if (isGuest) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setPhase('streaming'); setStreamText(''); setErrorMsg(''); setUsage(null);
    const fail = (m: string) => { setErrorMsg(m); setPhase('error'); };
    try {
      const res = await fetch('/ai/recap', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period, model }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => null) as { error?: string } | null;
        fail(err?.error ?? `Erreur serveur (${res.status}).`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finished = false;
      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let msg: { t: string; text?: string; message?: string; usage?: { input: number; output: number } | null };
          try { msg = JSON.parse(line); } catch { continue; }
          if (msg.t === 'delta' && msg.text) {
            setStreamText((cur) => cur + msg.text);
          } else if (msg.t === 'done') {
            finished = true;
            setUsage(msg.usage ?? null);
            setPhase('idle');
            setStreamText('');
            await Promise.all([
              utils.ai.getRecap.invalidate({ period }),
              utils.ai.listRecapPeriods.invalidate(),
            ]);
          } else if (msg.t === 'error') {
            finished = true;
            fail(msg.message ?? 'Impossible de générer le récap.');
          }
        }
      }
      if (!finished && phase === 'streaming') fail('La connexion a été interrompue. Réessaie.');
    } catch (err) {
      if (ac.signal.aborted) return;
      fail(err instanceof Error ? err.message : 'Impossible de générer le récap.');
    }
  };

  const stop = () => { abortRef.current?.abort(); setPhase('idle'); setStreamText(''); };

  const toggle = (period: string) => setOpenPeriod((cur) => (cur === period ? null : period));

  // Panneau d'un mois ouvert.
  const renderPanel = (period: string) => {
    const isOpenGenerating = phase === 'streaming';
    return (
      <div className="pb-3">
        {/* Choix du modèle (owner only, utile avant de générer) */}
        {!isGuest && (
          <div className="flex gap-1 mb-3">
            {modelsList.map((m) => {
              const mm = MODEL_META[m] ?? { label: m, hint: '' };
              const active = m === model;
              return (
                <button
                  key={m}
                  type="button"
                  title={mm.hint}
                  disabled={isOpenGenerating}
                  onClick={() => pickModel(m)}
                  className={
                    'flex-1 rounded-lg px-1 py-1.5 text-center transition-colors disabled:opacity-50 ' +
                    (active ? 'bg-accent/15 ring-1 ring-accent/40' : 'hover:bg-text-muted/10 border border-text-muted/10')
                  }
                >
                  <span className={'block text-[11px] font-medium ' + (active ? 'text-accent' : 'text-text-primary')}>{mm.label}</span>
                  {mm.hint && (
                    <span className={'block text-[10px] leading-tight mt-0.5 ' + (active ? 'text-accent/70' : 'text-text-muted/55')}>{mm.hint}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Corps */}
        {phase === 'streaming' ? (
          <div className="help-prose text-[15px] whitespace-pre-wrap">
            {streamText}
            <span className="inline-block w-[2px] h-[1em] bg-accent align-text-bottom animate-pulse ml-0.5" />
          </div>
        ) : phase === 'error' ? (
          <p className="text-sm text-danger leading-relaxed">{errorMsg}</p>
        ) : stored ? (
          /* Même taille que le streaming (text-[15px]) pour une lecture homogène (STAT-08). */
          <div className="help-prose text-[15px]" dangerouslySetInnerHTML={{ __html: recapHtml }} />
        ) : loadingStored ? (
          <p className="text-sm text-text-muted/60">…</p>
        ) : (
          <p className="text-sm text-text-muted/70 leading-relaxed">
            {isGuest ? 'Pas de récap pour ce mois.' : 'Pas encore de récap pour ce mois.'}
          </p>
        )}

        {/* Méta + action (owner) */}
        <div className="flex items-center justify-between gap-2 mt-3">
          <span className="text-[11px] text-text-muted/50">
            {phase === 'streaming'
              ? `${streamText.length.toLocaleString('fr-FR')} caractères`
              : stored
                ? `Généré le ${new Date(stored.generatedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}${isGuest ? '' : ` · ${MODEL_META[stored.model]?.label ?? stored.model}${usage ? ` · ~${fmtTokens(usage.input + usage.output)} tokens` : ''}`}`
                : ''}
          </span>
          {!isGuest && (phase === 'streaming' ? (
            <button
              type="button"
              onClick={stop}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-danger bg-danger/10 hover:bg-danger/20 transition-colors"
            >
              Arrêter
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void generate(period)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/15 text-accent hover:bg-accent/25 transition-colors"
            >
              {stored ? 'Régénérer' : 'Générer'}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <section className="bg-bg-elevated shadow-soft rounded-2xl p-5">
      <h2 className="text-sm font-serif text-text-primary flex items-center gap-1.5">
        <span aria-hidden>✦</span> Récap du mois
      </h2>
      <p className="text-xs text-text-muted/70 mt-1.5">
        {isGuest
          ? 'Une courte lettre écrite par Claude à partir des notes du mois.'
          : "Une courte lettre que Claude t'écrit à partir de tes notes du mois. Privé, jamais partagé."}
      </p>

      {months === undefined ? (
        <p className="text-sm text-text-muted/50 mt-4">…</p>
      ) : (
        <ul className="mt-3 divide-y divide-text-muted/10 border-t border-text-muted/10">
          {months.map((m) => {
            const open = openPeriod === m.period;
            const hasRecap = generatedSet.has(m.period);
            return (
              <li key={m.period}>
                <button
                  type="button"
                  onClick={() => toggle(m.period)}
                  aria-expanded={open}
                  className="w-full flex items-center justify-between gap-2 py-2.5 text-left group"
                >
                  <span className={'text-sm ' + (open ? 'text-text-primary font-medium' : 'text-text-primary/90')}>
                    {monthLabel(m.period)}
                  </span>
                  <span className="flex items-center gap-2 text-[11px] text-text-muted/55">
                    {!isGuest && (hasRecap
                      ? <span className="text-accent/70">récap prêt</span>
                      : <span>à générer</span>)}
                    <span className="text-text-muted/55 group-hover:text-text-muted"><Chevron open={open} /></span>
                  </span>
                </button>
                {open && renderPanel(m.period)}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
