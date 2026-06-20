import type { BudgetItem, MediaMeta } from '../lib/db/schema';
import { budgetTotals, formatAmount } from '../lib/budget';
import { useBufferedInput } from '../hooks/useBufferedInput';
import { DatePicker } from './DatePicker';

/**
 * Éditeur des lignes d'une note FINANCE (monté dans MediaMetaPanel).
 * Contrôlé : lit `meta.budgetItems` + `meta.currency`, remonte via `onChange`.
 *
 * Les champs texte/montant sont **tamponnés** (`useBufferedInput`) : la frappe
 * reste locale et n'est persistée qu'au blur. Sans ça, chaque touche partait en
 * base (Dexie, async) puis revenait → le curseur sautait en fin de champ et la
 * composition des touches mortes (ex. `^`+`o` = `ô`) était cassée.
 */
export function BudgetBuilder({
  meta,
  onChange,
}: {
  meta: MediaMeta | null;
  onChange: (m: MediaMeta) => void;
}) {
  const m = meta ?? {};
  const items = m.budgetItems ?? [];
  const currency = m.currency ?? '€';

  const commit = (next: BudgetItem[], cur = currency) => onChange({ ...m, budgetItems: next, currency: cur });
  const patch = (id: string, p: Partial<BudgetItem>) =>
    commit(items.map((it) => (it.id === id ? { ...it, ...p } : it)));
  const add = (kind: BudgetItem['kind']) =>
    commit([...items, { id: crypto.randomUUID(), label: '', amount: 0, kind }]);
  const remove = (id: string) => commit(items.filter((it) => it.id !== id));

  const totals = budgetTotals(items);
  const currencyInput = useBufferedInput(currency, (v) => commit(items, v.slice(0, 3) || '€'));

  return (
    <div className="flex flex-col gap-2.5">
      {/* Récap mini en tête (entrées / sorties / solde) */}
      {items.length > 0 && (
        <div className="flex items-center gap-3 text-[11px] text-text-muted flex-wrap">
          <span className="text-[#3F8A5A]">＋ {formatAmount(totals.income, currency)}</span>
          <span className="text-danger">− {formatAmount(totals.expense, currency)}</span>
          <span className="font-semibold text-text-primary">Solde {formatAmount(totals.balance, currency, { signed: true })}</span>
          <label className="ml-auto inline-flex items-center gap-1.5">
            Devise
            <input
              {...currencyInput}
              className="w-10 bg-bg-primary border border-text-muted/15 rounded-md px-1.5 py-0.5 text-center text-[12px] text-text-primary outline-none focus:border-accent/30"
            />
          </label>
        </div>
      )}

      {items.length === 0 && (
        <p className="text-xs text-text-muted/60 italic">Aucune ligne pour l'instant.</p>
      )}

      {items.map((it) => (
        <BudgetItemRow
          key={it.id}
          item={it}
          currency={currency}
          onPatch={(p) => patch(it.id, p)}
          onRemove={() => remove(it.id)}
        />
      ))}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => add('income')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#3F8A5A]/10 text-[#3F8A5A] border border-[#3F8A5A]/25 hover:bg-[#3F8A5A]/15 transition-colors"
        >＋ Revenu</button>
        <button
          type="button"
          onClick={() => add('expense')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-danger/10 text-danger border border-danger/25 hover:bg-danger/15 transition-colors"
        >− Dépense</button>
      </div>
    </div>
  );
}

/** Une ligne de budget — champs texte/montant tamponnés (commit au blur). */
function BudgetItemRow({
  item,
  currency,
  onPatch,
  onRemove,
}: {
  item: BudgetItem;
  currency: string;
  onPatch: (p: Partial<BudgetItem>) => void;
  onRemove: () => void;
}) {
  const label = useBufferedInput(item.label, (v) => onPatch({ label: v }));
  const amount = useBufferedInput(item.amount || '', (v) => onPatch({ amount: Math.abs(parseFloat(v.replace(',', '.')) || 0) }));
  const category = useBufferedInput(item.category ?? '', (v) => onPatch({ category: v.trim() || undefined }));

  return (
    <div className="rounded-xl border border-text-muted/12 bg-bg-primary/40 p-2.5 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {/* Bascule entrée / sortie */}
        <div className="shrink-0 inline-flex rounded-lg overflow-hidden border border-text-muted/15">
          <button
            type="button"
            onClick={() => onPatch({ kind: 'income' })}
            aria-pressed={item.kind === 'income'}
            title="Revenu"
            className={`px-2 py-1 text-sm font-semibold transition-colors ${item.kind === 'income' ? 'bg-[#3F8A5A]/15 text-[#3F8A5A]' : 'text-text-muted/50 hover:text-text-muted'}`}
          >＋</button>
          <button
            type="button"
            onClick={() => onPatch({ kind: 'expense' })}
            aria-pressed={item.kind === 'expense'}
            title="Dépense"
            className={`px-2 py-1 text-sm font-semibold transition-colors border-l border-text-muted/15 ${item.kind === 'expense' ? 'bg-danger/15 text-danger' : 'text-text-muted/50 hover:text-text-muted'}`}
          >−</button>
        </div>
        <input
          {...label}
          placeholder="Libellé…"
          className="flex-1 min-w-0 bg-transparent text-sm text-text-primary placeholder:text-text-muted/40 outline-none border-b border-text-muted/10 focus:border-accent/30 pb-1 transition-colors"
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Supprimer la ligne"
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-text-muted/55 hover:text-danger hover:bg-danger/10 transition-colors"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="shrink-0 inline-flex items-center gap-1 bg-bg-primary border border-text-muted/15 rounded-lg px-2 py-1 focus-within:border-accent/30 transition-colors">
          <input
            {...amount}
            type="number"
            inputMode="decimal"
            step="0.01"
            placeholder="0"
            className="w-20 bg-transparent text-sm text-text-primary text-right placeholder:text-text-muted/40 outline-none"
          />
          <span className="text-[12px] text-text-muted/60">{currency}</span>
        </div>
        <input
          {...category}
          placeholder="Catégorie…"
          className="flex-1 min-w-[100px] bg-bg-primary border border-text-muted/15 rounded-lg px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted/40 outline-none focus:border-accent/30 transition-colors"
        />
        <DatePicker value={item.date ?? ''} onChange={(v) => onPatch({ date: v || undefined })} portal placeholder="Date…" className="shrink-0" />
      </div>
    </div>
  );
}
