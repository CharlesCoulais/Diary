import { useEffect, useState } from 'react';
import { trpc } from '../lib/trpc';
import { useBackButtonClose } from '../hooks/useBackButtonClose';

interface ShareSpecificSheetProps {
  entryId: string;
  onClose: () => void;
  onMakePrivate?: () => void;
}

export function ShareSpecificSheet({ entryId, onClose, onMakePrivate }: ShareSpecificSheetProps) {
  const { data: guestsData, isLoading: loadingGuests } = trpc.guests.list.useQuery();
  const { data: entry, isLoading: loadingEntry } = trpc.entries.byId.useQuery({ id: entryId });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  // Initialize selected guests from current shares
  useEffect(() => {
    if (entry && !initialized) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ids: string[] = ((entry as any).shares ?? []).map((s: any) => s.receiverId as string);
      setSelectedIds(new Set(ids));
      setInitialized(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, entry?.id]);

  const setShares = trpc.entries.setShares.useMutation({ onSuccess: onClose });

  const guests = guestsData?.guests ?? [];
  const loading = loadingGuests || loadingEntry;

  const toggle = (guestId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(guestId) ? next.delete(guestId) : next.add(guestId);
      return next;
    });
  };

  const handleSave = () => {
    setShares.mutate({ id: entryId, guestIds: [...selectedIds] });
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useBackButtonClose(true, onClose);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg-primary/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col bg-bg-elevated rounded-t-3xl shadow-2xl max-h-[70dvh]">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-text-muted/20" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-4 border-b border-text-muted/10 shrink-0 flex items-center justify-between">
          <div>
            <p className="text-text-primary font-medium text-base">Partage spécifique</p>
            <p className="text-text-muted text-xs mt-0.5">Choisir qui peut voir cette entrée</p>
          </div>
          <button type="button" onClick={onClose}
            className="text-text-muted/50 hover:text-text-muted transition-colors p-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Guest list */}
        <div className="flex-1 overflow-y-auto scrollbar-soft px-5 py-4">
          {loading ? (
            <p className="text-text-muted/50 text-sm italic">Chargement…</p>
          ) : guests.length === 0 ? (
            <p className="text-text-muted/50 text-sm italic">Aucune personne invitée pour l'instant.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {guests.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => toggle(g.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-text-muted/8 transition-colors text-left"
                  >
                    {/* Checkbox */}
                    <span className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${selectedIds.has(g.id) ? 'bg-accent border-accent' : 'border-text-muted/30'}`}>
                      {selectedIds.has(g.id) && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary truncate">{g.displayName ?? g.email}</p>
                      <p className="text-xs text-text-muted/60 truncate">{g.email}</p>
                    </div>
                    {/* Access badge */}
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-text-muted/10 text-text-muted shrink-0">
                      {{ ALL: 'Accès global', SPECIFIC: 'Limité', CONFIDANT: 'Confident' }[g.guestAccess as string] ?? g.guestAccess}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-8 pt-4 border-t border-text-muted/10 shrink-0 flex flex-col gap-2">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-text-muted/20 text-sm text-text-muted hover:bg-text-muted/8 transition-colors"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={setShares.isPending}
              className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {setShares.isPending ? 'Enregistrement…' : `Partager${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
            </button>
          </div>
          {onMakePrivate && (
            <button
              type="button"
              onClick={onMakePrivate}
              className="w-full py-2 text-xs text-text-muted/60 hover:text-text-muted transition-colors"
            >
              Rendre entièrement privé
            </button>
          )}
        </div>
      </div>
    </>
  );
}
