import type { MediaMeta } from '../lib/db/schema';
import { budgetTotals, categoryBreakdown, formatAmount } from '../lib/budget';

const INCOME = '#3F8A5A';

/** Vue lecture d'une note FINANCE : totaux + solde + répartition par catégorie + lignes. */
export function BudgetView({ meta }: { meta: MediaMeta | null }) {
  const items = meta?.budgetItems ?? [];
  const currency = meta?.currency ?? '€';

  if (items.length === 0) {
    return <p className="text-sm text-text-muted/55 italic">Aucune ligne dans ce budget.</p>;
  }

  const totals = budgetTotals(items);
  const expenseCats = categoryBreakdown(items, 'expense');
  const positive = totals.balance >= 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Totaux */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-bg-primary/40 px-3 py-2.5 text-center">
          <div className="text-sm font-semibold tabular-nums" style={{ color: INCOME }}>{formatAmount(totals.income, currency)}</div>
          <div className="text-[10px] uppercase tracking-wide text-text-muted/55 mt-0.5">Entrées</div>
        </div>
        <div className="rounded-xl bg-bg-primary/40 px-3 py-2.5 text-center">
          <div className="text-sm font-semibold tabular-nums text-danger">{formatAmount(totals.expense, currency)}</div>
          <div className="text-[10px] uppercase tracking-wide text-text-muted/55 mt-0.5">Sorties</div>
        </div>
        <div className="rounded-xl px-3 py-2.5 text-center" style={{ backgroundColor: `color-mix(in srgb, ${positive ? INCOME : 'var(--color-error)'} 12%, transparent)` }}>
          <div className="text-sm font-bold tabular-nums" style={{ color: positive ? INCOME : 'var(--color-error)' }}>
            {formatAmount(totals.balance, currency, { signed: true })}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-text-muted/55 mt-0.5">Solde</div>
        </div>
      </div>

      {/* Répartition des dépenses par catégorie */}
      {expenseCats.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-text-muted/50">Dépenses par catégorie</p>
          {expenseCats.map((c) => (
            <div key={c.category} className="flex flex-col gap-0.5">
              <div className="flex items-baseline justify-between text-[12px]">
                <span className="text-text-primary truncate pr-2">{c.category}</span>
                <span className="text-text-muted tabular-nums shrink-0">{formatAmount(c.total, currency)} · {Math.round(c.pct)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-text-muted/10 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${c.pct}%`, backgroundColor: 'var(--color-error)' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lignes */}
      <div className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-widest text-text-muted/50 mb-0.5">Lignes</p>
        {items.map((it) => (
          <div key={it.id} className="flex items-baseline gap-2 py-1 border-b border-text-muted/8 last:border-0">
            <span className="flex-1 min-w-0 text-sm text-text-primary truncate">
              {it.label || <span className="italic text-text-muted/50">Sans libellé</span>}
              {it.category && <span className="ml-1.5 text-[11px] text-text-muted/55">· {it.category}</span>}
            </span>
            <span className="shrink-0 text-sm font-medium tabular-nums" style={{ color: it.kind === 'income' ? INCOME : 'var(--color-error)' }}>
              {it.kind === 'income' ? '＋' : '−'} {formatAmount(Math.abs(it.amount), currency)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
