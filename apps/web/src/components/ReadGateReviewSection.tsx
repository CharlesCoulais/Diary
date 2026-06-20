import { trpc } from '../lib/trpc';

/**
 * Section d'approbation des réponses au verrou de lecture.
 * Visible côté owner uniquement, sur une entry possédant `readGatePrompt`.
 *
 * Affiche pour chaque confident ayant répondu :
 *  - son nom + sa réponse
 *  - le statut (Accordé / Refusé / En attente)
 *  - si en attente : boutons Accepter / Refuser
 *
 * Partagé entre `EntryCard` (lecture inline owner) et `EntrySheet` (collection).
 */
export function ReadGateReviewSection({ entryId }: { entryId: string }) {
  const utils = trpc.useUtils();
  const { data: responses } = trpc.readGate.listForEntry.useQuery({ entryId });
  // Optimistic update : on patch immédiatement la query locale pour que le chip
  // de statut + le bouton "Revenir sur ma décision" reflètent la nouvelle valeur
  // sans attendre le round-trip réseau. On rollback en cas d'erreur, et on
  // invalide en `onSettled` pour réconcilier avec la vérité serveur.
  const decideMutation = trpc.readGate.decide.useMutation({
    onMutate: async ({ entryId: eId, guestId, approved }) => {
      await utils.readGate.listForEntry.cancel({ entryId: eId });
      const prev = utils.readGate.listForEntry.getData({ entryId: eId });
      if (prev) {
        utils.readGate.listForEntry.setData(
          { entryId: eId },
          prev.map((r) => (r.guestId === guestId ? { ...r, approved } : r)),
        );
      }
      return { prev };
    },
    onError: (_e, vars, ctx) => {
      if (ctx?.prev) utils.readGate.listForEntry.setData({ entryId: vars.entryId }, ctx.prev);
    },
    onSettled: (_d, _e, vars) => {
      void utils.readGate.listForEntry.invalidate({ entryId: vars.entryId });
      // Met aussi à jour les compteurs de filtre côté Home/Timeline.
      void utils.readGate.statusesForOwner.invalidate();
    },
  });

  if (!responses || responses.length === 0) {
    return (
      <div className="mt-6 pt-4 border-t border-text-muted/10">
        <div className="flex items-center gap-2 mb-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /><circle cx="12" cy="16" r="1" fill="currentColor" />
          </svg>
          <p className="text-[11px] font-mono uppercase tracking-widest text-text-muted/60">Verrou de lecture</p>
        </div>
        <p className="text-xs text-text-muted/55 italic">Aucune réponse pour l'instant.</p>
      </div>
    );
  }

  const pending = responses.filter((r) => r.approved === null).length;

  return (
    <div className="mt-6 pt-4 border-t border-text-muted/10 flex flex-col gap-2">
      <div className="flex items-center gap-2 mb-1">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /><circle cx="12" cy="16" r="1" fill="currentColor" />
        </svg>
        <p className="text-[11px] font-mono uppercase tracking-widest text-text-muted/60">
          Verrou — {responses.length} réponse{responses.length > 1 ? 's' : ''}
        </p>
        {pending > 0 && (
          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-warning/15 text-warning font-medium">
            {pending} en attente
          </span>
        )}
      </div>
      {responses.map((r) => (
        <div key={r.guestId} className="flex flex-col gap-1.5 bg-bg-primary/60 rounded-xl p-3 border border-text-muted/8">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs font-medium text-text-primary">{r.guestName}</p>
            <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${r.approved === true ? 'bg-success/15 text-success' : r.approved === false ? 'bg-danger/15 text-danger' : 'bg-warning/15 text-warning'}`}>
              {r.approved === true ? '✓ Accès accordé' : r.approved === false ? '✗ Refusé' : 'En attente'}
            </span>
          </div>
          <p className="text-sm text-text-muted italic">« {r.response} »</p>
          {r.approved === null && (
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={() => decideMutation.mutate({ entryId, guestId: r.guestId, approved: true })}
                disabled={decideMutation.isPending}
                className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-success/10 text-success hover:bg-success/20 transition-colors disabled:opacity-50"
              >
                Accepter
              </button>
              <button
                type="button"
                onClick={() => decideMutation.mutate({ entryId, guestId: r.guestId, approved: false })}
                disabled={decideMutation.isPending}
                className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-danger/10 text-danger hover:bg-danger/20 transition-colors disabled:opacity-50"
              >
                Refuser
              </button>
            </div>
          )}
          {r.approved !== null && (
            <button
              type="button"
              onClick={() => decideMutation.mutate({ entryId, guestId: r.guestId, approved: !r.approved })}
              disabled={decideMutation.isPending}
              className="self-end text-[11px] text-text-muted/50 hover:text-text-muted underline mt-0.5"
            >
              Revenir sur ma décision
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
