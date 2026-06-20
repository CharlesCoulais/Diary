import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db/schema';
import type { BudgetItem, MediaMeta } from '../lib/db/schema';
import { budgetTotals, categoryBreakdown, formatAmount } from '../lib/budget';
import { trpc } from '../lib/trpc';
import { PageHeader } from '../components/PageHeader';
import { BottomNav } from '../components/BottomNav';

const INCOME = '#3F8A5A';

export function BudgetPage() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { data: me } = trpc.auth.me.useQuery();
  const setBalance = trpc.auth.setBudgetOpeningBalance.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });

  const isOwner = me?.role === 'OWNER';
  // Owner : lecture offline-first depuis Dexie. Confident : pas de sync Dexie →
  // lecture serveur (entries.aggregateByType). On bascule selon le rôle.
  const dexieEntries = useLiveQuery(
    () => db.entries.filter((e) => e.noteType === 'FINANCE' && !e.deletedAt).toArray(),
    [],
  );
  const { data: serverRaw } = trpc.entries.aggregateByType.useQuery(
    { type: 'FINANCE' },
    { enabled: !!me && !isOwner },
  );
  // `serverRaw as unknown` dans le ternaire : la sortie tRPC est trop profonde
  // pour l'inférence TS (TS2589) une fois unie au type Dexie — on l'aplatit
  // dès le ternaire, puis on cast vers la forme utile.
  const entries = ((isOwner ? dexieEntries : (serverRaw as unknown)) ?? []) as Array<{
    id: string;
    title: string | null;
    mediaMeta: MediaMeta | null;
    updatedAt: string;
  }>;

  // Devise : celle de la première note qui en définit une, sinon « € ».
  const currency = entries.find((e) => e.mediaMeta?.currency)?.mediaMeta?.currency ?? '€';
  const allItems: BudgetItem[] = entries.flatMap((e) => e.mediaMeta?.budgetItems ?? []);
  const totals = budgetTotals(allItems);
  const expenseCats = categoryBreakdown(allItems, 'expense');

  // Solde de départ — synchronisé (User.budgetOpeningBalance), édition tamponnée.
  const opening = me?.budgetOpeningBalance ?? 0;
  const [draft, setDraft] = useState<string>('');
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setDraft(opening ? String(opening) : ''); }, [opening, editing]);

  const commitOpening = () => {
    setEditing(false);
    const v = parseFloat(draft.replace(',', '.'));
    const next = Number.isFinite(v) ? v : 0;
    if (next !== opening) setBalance.mutate({ amount: next });
  };

  const current = opening + totals.balance;
  const positive = current >= 0;

  return (
    <div className="min-h-dvh pb-24 max-w-2xl mx-auto lg:pb-0">
      <div className="lg:px-12 lg:pb-16">
        <PageHeader
          title="Budget"
          backTo="/"
          subtitle={entries.length > 0 ? `${entries.length} note${entries.length > 1 ? 's' : ''}` : undefined}
        />

        <div className="px-4 lg:px-0 max-w-xl mx-auto flex flex-col gap-5">
          {/* Solde de départ — éditable pour l'owner, lecture seule pour le confident */}
          <div className="rounded-2xl bg-bg-elevated/60 border border-text-muted/10 px-4 py-3 flex items-center gap-3">
            <div className="flex-1">
              <p className="text-[11px] uppercase tracking-wide text-text-muted/55">Solde de départ</p>
              <p className="text-[11px] text-text-muted/45 mt-0.5">Point de départ avant revenus/dépenses</p>
            </div>
            {me?.role === 'OWNER' ? (
              <div className="inline-flex items-center gap-1 bg-bg-primary border border-text-muted/15 rounded-lg px-2.5 py-1.5 focus-within:border-accent/40 transition-colors">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={draft}
                  onFocus={() => setEditing(true)}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitOpening}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  placeholder="0"
                  className="w-24 bg-transparent text-sm text-text-primary text-right placeholder:text-text-muted/40 outline-none tabular-nums"
                />
                <span className="text-[12px] text-text-muted/60">{currency}</span>
              </div>
            ) : (
              <span className="text-sm font-medium tabular-nums text-text-primary">
                {formatAmount(opening, currency)}
              </span>
            )}
          </div>

          {entries.length === 0 ? (
            <div className="text-center py-12">
              <p className="font-serif text-text-muted/55 text-3xl mb-3">€</p>
              <p className="font-serif text-text-muted italic text-sm">
                {me?.role === 'OWNER'
                  ? <>Aucune note de budget. Crée une note de type <strong>Finance</strong> et ajoute des revenus/dépenses — le total s'affichera ici.</>
                  : 'Aucune note de budget accessible pour le moment.'}
              </p>
            </div>
          ) : (
            <>
              {/* Totaux globaux */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-bg-elevated/60 px-3 py-2.5 text-center">
                  <div className="text-sm font-semibold tabular-nums" style={{ color: INCOME }}>{formatAmount(totals.income, currency)}</div>
                  <div className="text-[10px] uppercase tracking-wide text-text-muted/55 mt-0.5">Entrées</div>
                </div>
                <div className="rounded-xl bg-bg-elevated/60 px-3 py-2.5 text-center">
                  <div className="text-sm font-semibold tabular-nums text-danger">{formatAmount(totals.expense, currency)}</div>
                  <div className="text-[10px] uppercase tracking-wide text-text-muted/55 mt-0.5">Sorties</div>
                </div>
                <div className="rounded-xl px-3 py-2.5 text-center" style={{ backgroundColor: `color-mix(in srgb, ${positive ? INCOME : 'var(--color-error)'} 14%, transparent)` }}>
                  <div className="text-sm font-bold tabular-nums" style={{ color: positive ? INCOME : 'var(--color-error)' }}>
                    {formatAmount(current, currency, { signed: true })}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-text-muted/55 mt-0.5">Solde actuel</div>
                </div>
              </div>
              <p className="text-[11px] text-text-muted/55 -mt-3 text-center">
                Solde de départ {formatAmount(opening, currency)} {totals.balance >= 0 ? '+' : '−'} {formatAmount(Math.abs(totals.balance), currency)} (mouvement net)
              </p>

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

              {/* Récap par note */}
              <div className="flex flex-col gap-1.5">
                <p className="font-mono text-[10px] uppercase tracking-widest text-text-muted/50">Par note</p>
                {entries
                  .map((e) => ({ e, t: budgetTotals(e.mediaMeta?.budgetItems ?? []) }))
                  .sort((a, b) => new Date(b.e.updatedAt).getTime() - new Date(a.e.updatedAt).getTime())
                  .map(({ e, t }) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => navigate(`/?entryId=${e.id}`)}
                      className="w-full text-left flex items-baseline gap-2 py-1.5 px-2 -mx-2 rounded-lg hover:bg-text-muted/5 transition-colors border-b border-text-muted/8 last:border-0"
                    >
                      <span className="flex-1 min-w-0 text-sm text-text-primary truncate">
                        {e.title || <span className="italic text-text-muted/50">Sans titre</span>}
                        <span className="ml-1.5 text-[11px] text-text-muted/45">{(e.mediaMeta?.budgetItems ?? []).length} ligne{(e.mediaMeta?.budgetItems ?? []).length > 1 ? 's' : ''}</span>
                      </span>
                      <span className="shrink-0 text-sm font-medium tabular-nums" style={{ color: t.balance >= 0 ? INCOME : 'var(--color-error)' }}>
                        {formatAmount(t.balance, currency, { signed: true })}
                      </span>
                    </button>
                  ))}
              </div>
            </>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
