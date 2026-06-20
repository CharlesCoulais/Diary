import type { BudgetItem } from './db/schema';

/**
 * Helpers purs pour les notes FINANCE — totaux, solde, répartition par catégorie
 * et formatage des montants. Aucune dépendance UI/DB : testable et réutilisable
 * côté builder (édition) et view (lecture).
 */

export interface BudgetTotals {
  income: number;
  expense: number;
  balance: number; // income - expense
}

/** Totaux entrées / sorties / solde. Les montants sont supposés positifs. */
export function budgetTotals(items: BudgetItem[]): BudgetTotals {
  let income = 0;
  let expense = 0;
  for (const it of items) {
    const amt = Number.isFinite(it.amount) ? Math.abs(it.amount) : 0;
    if (it.kind === 'income') income += amt;
    else expense += amt;
  }
  return { income, expense, balance: income - expense };
}

export interface CategorySlice {
  category: string;
  total: number;
  pct: number; // part du total du `kind` considéré, 0–100
}

/**
 * Répartition par catégorie pour un type donné ('expense' par défaut), triée par
 * montant décroissant. Les lignes sans catégorie sont regroupées sous « Sans catégorie ».
 */
export function categoryBreakdown(items: BudgetItem[], kind: BudgetItem['kind'] = 'expense'): CategorySlice[] {
  const byCat = new Map<string, number>();
  let total = 0;
  for (const it of items) {
    if (it.kind !== kind) continue;
    const amt = Number.isFinite(it.amount) ? Math.abs(it.amount) : 0;
    const cat = (it.category ?? '').trim() || 'Sans catégorie';
    byCat.set(cat, (byCat.get(cat) ?? 0) + amt);
    total += amt;
  }
  const slices = [...byCat.entries()].map(([category, t]) => ({
    category,
    total: t,
    pct: total > 0 ? (t / total) * 100 : 0,
  }));
  return slices.sort((a, b) => b.total - a.total);
}

/**
 * Formate un montant dans la devise donnée (défaut « € »), avec séparateur
 * français et signe optionnel pour le solde.
 */
export function formatAmount(amount: number, currency = '€', opts?: { signed?: boolean }): string {
  const n = Number.isFinite(amount) ? amount : 0;
  const abs = Math.abs(n);
  const body = abs.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const sign = opts?.signed ? (n > 0 ? '+ ' : n < 0 ? '− ' : '') : (n < 0 ? '− ' : '');
  return `${sign}${body} ${currency}`;
}
