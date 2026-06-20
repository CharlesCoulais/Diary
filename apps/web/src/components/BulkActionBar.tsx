import { useMemo, useState } from 'react';
import type { LocalEntry } from '../lib/db/schema';
import { trpc } from '../lib/trpc';

const MOOD_EMOJIS = [
  '😊', '😄', '🥰', '😍', '🤩', '😎', '🥳', '😌',
  '😐', '🤔', '😶', '🙄',
  '😴', '🥱', '😩', '😫',
  '😔', '😢', '😞', '😟',
  '😲', '😱', '🤯',
  '😰', '😬', '😤', '😨',
  '😠', '😡',
  '🔥', '⚡', '✨', '🎯',
];

export type BulkAction =
  | { type: 'draft'; value: boolean }
  | { type: 'visibility'; value: 'PRIVATE' | 'SHARED_ALL' }
  | { type: 'confidant'; value: boolean }
  | { type: 'mood'; value: string | null }
  | { type: 'addTag'; tag: string }
  | { type: 'removeTag'; tag: string };

type ActivePanel = 'draft' | 'visibility' | 'confidant' | 'mood' | 'tags' | null;

export function BulkActionBar({
  count,
  totalCount,
  allSelected,
  selectedEntries,
  onSelectAll,
  onDeselectAll,
  onClose,
  onApply,
}: {
  count: number;
  totalCount: number;
  allSelected: boolean;
  selectedEntries: LocalEntry[];
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onClose: () => void;
  onApply: (action: BulkAction) => void;
}) {
  const [panel, setPanel] = useState<ActivePanel>(null);
  const [tagInput, setTagInput] = useState('');

  const toggle = (p: ActivePanel) => setPanel((v) => (v === p ? null : p));

  // Tags déjà rattachés à AU MOINS une note sélectionnée (= candidats au retrait).
  const existingTags = [...new Set(selectedEntries.flatMap((e) => e.tagNames ?? []))].sort();

  // Tous les tags du journal de l'owner, pour permettre l'ajout par clic plutôt
  // qu'à la frappe. `enabled: panel === 'tags'` → on ne fetch que quand le
  // panneau s'ouvre (évite une query au mount inutile).
  const { data: allOwnerTags = [] } = trpc.tags.listAll.useQuery(undefined, {
    enabled: panel === 'tags',
  });

  // Tags suggérés à AJOUTER = tags du journal qui ne sont pas DÉJÀ sur TOUTES
  // les notes sélectionnées (sinon l'action serait no-op). On exclut aussi ceux
  // qui matchent le filtre de saisie courant — l'input fait office d'autocomplete.
  const suggestableTags = useMemo(() => {
    const onAllSelected = new Set<string>();
    if (selectedEntries.length > 0) {
      const first = new Set(selectedEntries[0]!.tagNames ?? []);
      for (const name of first) {
        if (selectedEntries.every((e) => (e.tagNames ?? []).includes(name))) {
          onAllSelected.add(name);
        }
      }
    }
    const q = tagInput.trim().toLowerCase();
    return allOwnerTags
      .filter((t) => !onAllSelected.has(t.name))
      .filter((t) => (q ? t.name.toLowerCase().includes(q) : true))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
  }, [allOwnerTags, selectedEntries, tagInput]);
  const allDraft = selectedEntries.length > 0 && selectedEntries.every((e) => e.isDraft);
  const allShared = selectedEntries.length > 0 && selectedEntries.every((e) => e.visibility === 'SHARED_ALL');
  const allConfidant = selectedEntries.length > 0 && selectedEntries.every((e) => e.isForConfidant);

  const apply = (action: BulkAction) => {
    onApply(action);
    setPanel(null);
    setTagInput('');
  };

  // Au-dessus du BottomNav : dérive de sa hauteur mesurée (--bottomnav-height,
  // safe-area incluse) plutôt que de constantes 3.5rem/4rem dupliquées (cf. SET-19).
  return (
    <div className="fixed bottom-[calc(var(--bottomnav-height,3.5rem)+0.25rem)] lg:bottom-4 left-0 right-0 z-30 px-3 pb-1">
      <div className="max-w-2xl mx-auto bg-bg-elevated border border-text-muted/15 rounded-2xl shadow-lg overflow-hidden">

        {/* Panel expansible */}
        {panel === 'draft' && (
          <div className="px-4 py-3 border-b border-text-muted/10 flex gap-2">
            <button
              type="button"
              onClick={() => apply({ type: 'draft', value: true })}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${allDraft ? 'bg-warning/20 text-warning border border-warning/30' : 'bg-text-muted/8 text-text-muted hover:bg-text-muted/15'}`}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0" aria-hidden><path d="M11 2L14 5L6 13L3 14L4 11L11 2ZM9.5 3.5L12.5 6.5" /></svg> Marquer brouillon
            </button>
            <button
              type="button"
              onClick={() => apply({ type: 'draft', value: false })}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${!allDraft ? 'bg-success/20 text-success border border-success/30' : 'bg-text-muted/8 text-text-muted hover:bg-text-muted/15'}`}
            >
              ✓ Marquer terminé
            </button>
          </div>
        )}

        {panel === 'visibility' && (
          <div className="px-4 py-3 border-b border-text-muted/10 flex gap-2">
            <button
              type="button"
              onClick={() => apply({ type: 'visibility', value: 'PRIVATE' })}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${!allShared ? 'bg-accent/15 text-accent border border-accent/30' : 'bg-text-muted/8 text-text-muted hover:bg-text-muted/15'}`}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0" aria-hidden><rect x="3" y="8" width="10" height="6" rx="1" /><path d="M5 8V6a3 3 0 0 1 6 0v2" /></svg> Privé
            </button>
            <button
              type="button"
              onClick={() => apply({ type: 'visibility', value: 'SHARED_ALL' })}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${allShared ? 'bg-accent/15 text-accent border border-accent/30' : 'bg-text-muted/8 text-text-muted hover:bg-text-muted/15'}`}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0" aria-hidden><circle cx="8" cy="8" r="6" /><path d="M2 8h12M8 2c-1.5 2-2.5 3.8-2.5 6s1 4 2.5 6M8 2c1.5 2 2.5 3.8 2.5 6s-1 4-2.5 6" /></svg> Partagé
            </button>
          </div>
        )}

        {panel === 'confidant' && (
          <div className="px-4 py-3 border-b border-text-muted/10 flex gap-2">
            <button
              type="button"
              onClick={() => apply({ type: 'confidant', value: true })}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${allConfidant ? 'bg-accent/15 text-accent border border-accent/30' : 'bg-text-muted/8 text-text-muted hover:bg-text-muted/15'}`}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0" aria-hidden><path d="M8 13.5S2 9.5 2 5.5a3.5 3.5 0 0 1 6-2.45A3.5 3.5 0 0 1 14 5.5c0 4-6 8-6 8z" /></svg> Pour le confident
            </button>
            <button
              type="button"
              onClick={() => apply({ type: 'confidant', value: false })}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${!allConfidant ? 'bg-text-muted/15 text-text-muted border border-text-muted/20' : 'bg-text-muted/8 text-text-muted hover:bg-text-muted/15'}`}
            >
              Retirer confident
            </button>
          </div>
        )}

        {panel === 'mood' && (
          <div className="px-3 py-2.5 border-b border-text-muted/10">
            <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto scrollbar-soft">
              <button
                type="button"
                onClick={() => apply({ type: 'mood', value: null })}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-xs text-text-muted/50 hover:bg-text-muted/10 transition-colors"
                title="Effacer l'humeur"
              >✕</button>
              {MOOD_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => apply({ type: 'mood', value: emoji })}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-base hover:bg-text-muted/10 transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {panel === 'tags' && (
          <div className="px-4 py-3 border-b border-text-muted/10 flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && tagInput.trim()) {
                    apply({ type: 'addTag', tag: tagInput.trim().toLowerCase() });
                  }
                }}
                placeholder="Filtrer ou créer un tag…"
                className="flex-1 bg-bg-primary/60 border border-text-muted/15 rounded-xl px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted/55 outline-none focus:border-accent/40"
              />
              <button
                type="button"
                onClick={() => { if (tagInput.trim()) apply({ type: 'addTag', tag: tagInput.trim().toLowerCase() }); }}
                disabled={!tagInput.trim()}
                className="px-3 py-1.5 rounded-xl text-xs font-medium bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-40 transition-colors"
              >
                + Créer
              </button>
            </div>

            {/* Tags existants du journal — clic = ajout immédiat sur la sélection.
                On masque ceux déjà sur TOUTES les notes sélectionnées (no-op).
                Si l'utilisateur tape une recherche, la liste se filtre en live. */}
            {suggestableTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto scrollbar-soft">
                <span className="text-[11px] text-text-muted/50 self-center mr-0.5">Ajouter :</span>
                {suggestableTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => apply({ type: 'addTag', tag: tag.name.toLowerCase() })}
                    title={tag.entryCount > 0 ? `${tag.entryCount} note${tag.entryCount > 1 ? 's' : ''} dans le journal` : 'Tag vide'}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-accent/10 text-accent hover:bg-accent/20 transition-colors border border-accent/20"
                  >
                    #{tag.name}
                    {tag.entryCount > 0 && (
                      <span className="text-text-muted/50 font-mono text-[11px]">{tag.entryCount}</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {existingTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[11px] text-text-muted/50 self-center">Retirer :</span>
                {existingTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => apply({ type: 'removeTag', tag })}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-text-muted/10 text-text-muted hover:bg-danger/15 hover:text-danger transition-colors border border-text-muted/15"
                  >
                    #{tag} ✕
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Barre principale */}
        <div className="flex items-center gap-1 px-3 py-2.5">
          {/* Compteur + sélection */}
          <span className="text-xs font-medium text-text-primary shrink-0">
            {count} sélectionnée{count > 1 ? 's' : ''}
          </span>
          <button
            type="button"
            onClick={allSelected ? onDeselectAll : onSelectAll}
            className="text-[11px] text-accent hover:opacity-70 px-1.5 shrink-0 transition-opacity"
          >
            {allSelected ? 'Désélect.' : `Tout (${totalCount})`}
          </button>

          <div className="flex-1" />

          {/* Actions */}
          <div className="flex items-center gap-0.5">
            <ActionBtn active={panel === 'draft'} onClick={() => toggle('draft')} title="Brouillon">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden><path d="M11 2L14 5L6 13L3 14L4 11L11 2ZM9.5 3.5L12.5 6.5" /></svg>
            </ActionBtn>
            <ActionBtn active={panel === 'visibility'} onClick={() => toggle('visibility')} title="Visibilité">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" /><circle cx="8" cy="8" r="2" fill="none" /></svg>
            </ActionBtn>
            <ActionBtn active={panel === 'confidant'} onClick={() => toggle('confidant')} title="Confident">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden><path d="M8 13.5S2 9.5 2 5.5a3.5 3.5 0 0 1 6-2.45A3.5 3.5 0 0 1 14 5.5c0 4-6 8-6 8z" /></svg>
            </ActionBtn>
            <ActionBtn active={panel === 'mood'} onClick={() => toggle('mood')} title="Humeur">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden><circle cx="8" cy="8" r="6" fill="none" /><path d="M5.5 9.5s.8 1.5 2.5 1.5 2.5-1.5 2.5-1.5" /><circle cx="6" cy="7" r="0.5" fill="currentColor" /><circle cx="10" cy="7" r="0.5" fill="currentColor" /></svg>
            </ActionBtn>
            <ActionBtn active={panel === 'tags'} onClick={() => toggle('tags')} title="Tags">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden><path d="M2 2h5.5l6.5 6.5-5.5 5.5L2 7.5V2z" /><circle cx="5" cy="5" r="1" fill="none" /></svg>
            </ActionBtn>
          </div>

          <div className="w-px h-4 bg-text-muted/15 mx-1 shrink-0" />

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted/60 hover:text-text-primary hover:bg-text-muted/10 transition-colors shrink-0"
            title="Quitter la sélection"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionBtn({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-base transition-colors ${active ? 'bg-accent/15 ring-1 ring-accent/30' : 'hover:bg-text-muted/8'}`}
    >
      {children}
    </button>
  );
}
