import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db/schema';
import { trpc } from '../lib/trpc';

/**
 * Phase 2-lite des stats : croise le suivi du jour (DailyLog) avec le sommeil.
 *
 * VOLONTAIREMENT HUMBLE — pas de stats inférentielles ni de « corrélations »
 * affirmées. Sur ~1 mois de données, on montre seulement des moyennes par
 * tranche de sommeil, avec le nombre de jours derrière chaque barre et un encart
 * « signal précoce » tant qu'on n'a pas assez de recul. Owner only (intime).
 *
 * Owner : calcul depuis Dexie (offline-first). Confident CONFIDANT : mêmes données
 * via l'API (dailyLog.list, qui n'autorise que le CONFIDANT). Les autres guests
 * n'ont pas accès au suivi → la carte se masque. Se renforce avec le temps.
 */

// En dessous : on n'affiche que de l'encouragement, pas de graphe (trop maigre).
const MIN_LOGS_SECTION = 14;
// Une barre par tranche n'est tracée que si elle repose sur assez de jours.
const MIN_PER_BUCKET = 3;
// En dessous : l'encart « signal précoce, à confirmer » reste affiché.
const SOLID_THRESHOLD = 60;

type Log = { date: string; sleepHours: number | null; energy: number | null; anxiety: number | null };

const SLEEP_BUCKETS: { label: string; test: (h: number) => boolean }[] = [
  { label: 'moins de 6 h', test: (h) => h < 6 },
  { label: '6 à 8 h', test: (h) => h >= 6 && h <= 8 },
  { label: 'plus de 8 h', test: (h) => h > 8 },
];

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function bucketAverages(logs: Log[], field: 'energy' | 'anxiety') {
  return SLEEP_BUCKETS.map((b) => {
    const vals = logs
      .filter((l) => l.sleepHours != null && l[field] != null && b.test(l.sleepHours))
      .map((l) => l[field] as number);
    return { label: b.label, n: vals.length, mean: avg(vals) };
  });
}

/** Une barre /5 : libellé tranche, jauge, moyenne, nombre de jours. */
function BucketBar({ label, n, mean }: { label: string; n: number; mean: number }) {
  const enough = n >= MIN_PER_BUCKET;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-text-muted w-24 shrink-0">{label}</span>
      <div className="flex-1 h-5 rounded-full bg-text-muted/10 overflow-hidden">
        {enough && (
          <div
            className="h-full bg-accent/70 rounded-full transition-all"
            style={{ width: `${(mean / 5) * 100}%` }}
          />
        )}
      </div>
      <span className="text-xs tabular-nums w-20 shrink-0 text-right">
        {enough ? (
          <>
            <span className="text-text-primary font-medium">{mean.toFixed(1)}</span>
            <span className="text-text-muted/50">/5 · {n}j</span>
          </>
        ) : (
          <span className="text-text-muted/55">{n}j · trop peu</span>
        )}
      </span>
    </div>
  );
}

export function DailyLogInsights() {
  const { data: me } = trpc.auth.me.useQuery();
  const isGuest = me?.role === 'GUEST';

  // Owner : Dexie. Confident : API (dailyLog.list renvoie [] hors CONFIDANT).
  const dexieLogs = useLiveQuery(
    () => db.dailyLogs.filter((l) => l.deletedAt === null).toArray(),
    [],
  );
  const { data: apiLogs } = trpc.dailyLog.list.useQuery(undefined, { enabled: isGuest });
  const logs: Log[] | undefined = isGuest ? apiLogs : dexieLogs;

  const data = useMemo(() => {
    if (!logs) return null;
    const withSignal = logs.filter((l) => l.energy != null || l.anxiety != null);
    const dates = withSignal.map((l) => l.date).sort();
    const energyVals = withSignal.filter((l) => l.energy != null).map((l) => l.energy as number);
    const anxietyVals = withSignal.filter((l) => l.anxiety != null).map((l) => l.anxiety as number);
    const sleepVals = logs.filter((l) => l.sleepHours != null).map((l) => l.sleepHours as number);
    return {
      count: withSignal.length,
      from: dates[0] ?? null,
      avgEnergy: energyVals.length ? avg(energyVals) : null,
      avgAnxiety: anxietyVals.length ? avg(anxietyVals) : null,
      avgSleep: sleepVals.length ? avg(sleepVals) : null,
      energyBuckets: bucketAverages(withSignal, 'energy'),
      anxietyBuckets: bucketAverages(withSignal, 'anxiety'),
    };
  }, [logs]);

  if (!data) return null;
  if (data.count === 0) return null; // jamais rempli → rien à montrer

  const fromLabel = data.from
    ? new Date(data.from + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    : null;

  // Pas assez de jours pour des graphes : encouragement seulement.
  if (data.count < MIN_LOGS_SECTION) {
    return (
      <section className="bg-bg-elevated shadow-soft rounded-2xl p-5">
        <h2 className="text-sm font-serif text-text-primary flex items-center gap-1.5">
          <span aria-hidden>🌙</span> Sommeil &amp; ressenti
        </h2>
        <p className="text-sm text-text-muted/80 mt-2 leading-relaxed">
          Encore quelques jours de suivi et des tendances entre sommeil et ressenti
          commenceront à apparaître ici. ({data.count} jour{data.count > 1 ? 's' : ''} pour l'instant.)
        </p>
      </section>
    );
  }

  const hasEnergy = data.energyBuckets.some((b) => b.n >= MIN_PER_BUCKET);
  const hasAnxiety = data.anxietyBuckets.some((b) => b.n >= MIN_PER_BUCKET);

  return (
    <section className="bg-bg-elevated shadow-soft rounded-2xl p-5">
      <h2 className="text-sm font-serif text-text-primary flex items-center gap-1.5">
        <span aria-hidden>🌙</span> Sommeil &amp; ressenti
      </h2>

      {/* Encart honnêteté — reste tant qu'on n'a pas assez de recul */}
      {data.count < SOLID_THRESHOLD && (
        <p className="text-[11px] text-text-muted/70 bg-text-muted/[0.06] rounded-lg px-3 py-2 mt-2 leading-relaxed">
          Signal précoce, basé sur <strong>{data.count} jours</strong> de suivi{fromLabel ? ` (depuis le ${fromLabel})` : ''}.
          À prendre avec des pincettes : ces tendances se préciseront avec le temps.
        </p>
      )}

      {/* Moyennes globales */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        <div className="text-center">
          <div className="text-2xl font-serif text-text-primary leading-tight">
            {data.avgEnergy != null ? data.avgEnergy.toFixed(1) : '—'}
            {data.avgEnergy != null && <span className="text-sm text-text-muted/55"> / 5</span>}
          </div>
          <div className="text-[11px] text-text-muted uppercase tracking-wide mt-0.5">Énergie moy.</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-serif text-text-primary leading-tight">
            {data.avgAnxiety != null ? data.avgAnxiety.toFixed(1) : '—'}
            {data.avgAnxiety != null && <span className="text-sm text-text-muted/55"> / 5</span>}
          </div>
          <div className="text-[11px] text-text-muted uppercase tracking-wide mt-0.5">Anxiété moy.</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-serif text-text-primary leading-tight">
            {data.avgSleep != null ? `${data.avgSleep.toFixed(1)} h` : '—'}
          </div>
          <div className="text-[11px] text-text-muted uppercase tracking-wide mt-0.5">Sommeil moy.</div>
        </div>
      </div>

      {/* Échelle des ressentis (1–5) — lève l'ambiguïté du sens, surtout pour l'anxiété */}
      {(data.avgEnergy != null || data.avgAnxiety != null) && (
        <p className="text-[10px] text-text-muted/55 text-center mt-2 leading-snug">
          Échelle 1–5 · énergie « à plat → à fond » · anxiété « calme → panique »
        </p>
      )}

      {/* Énergie selon le sommeil */}
      {hasEnergy && (
        <div className="mt-5">
          <h3 className="text-xs font-medium text-text-muted/80 mb-2.5">Énergie selon le sommeil</h3>
          <div className="flex flex-col gap-2">
            {data.energyBuckets.map((b) => <BucketBar key={b.label} {...b} />)}
          </div>
        </div>
      )}

      {/* Anxiété selon le sommeil */}
      {hasAnxiety && (
        <div className="mt-5">
          <h3 className="text-xs font-medium text-text-muted/80 mb-2.5">Anxiété selon le sommeil</h3>
          <div className="flex flex-col gap-2">
            {data.anxietyBuckets.map((b) => <BucketBar key={b.label} {...b} />)}
          </div>
        </div>
      )}

      {!hasEnergy && !hasAnxiety && (
        <p className="text-sm text-text-muted/70 mt-4 leading-relaxed">
          Pas encore assez de jours avec sommeil <em>et</em> ressenti notés ensemble pour dégager une tendance.
        </p>
      )}
    </section>
  );
}
