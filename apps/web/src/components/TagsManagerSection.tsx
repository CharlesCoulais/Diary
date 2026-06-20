import { useState, useMemo } from 'react';
import { trpc } from '../lib/trpc';
import { useSyncContext } from '../lib/sync/SyncProvider';
import { confirmDialog, notifyDialog } from '../lib/dialog';
import { SettingsCard } from './SettingsCard';

interface TagItem {
  id: string;
  name: string;
  kind: string;
  color: string | null;
  entryCount: number;
}

/**
 * Gestion globale des tags (Owner).
 *
 * Permet de :
 *  - Renommer un tag (touche **toutes** les notes qui le portent, sans avoir
 *    à les ré-éditer une par une).
 *  - Supprimer un tag (cascade côté serveur — les notes restent, juste
 *    détaguées).
 *  - Fusionner deux tags (utile pour résorber des doublons « vacances » /
 *    « Vacances » / « vacanes ») — déplace toutes les liaisons puis
 *    supprime la source.
 *
 * Les changements sont propagés vers les autres appareils via un bump
 * d'`updatedAt` des entrées concernées côté serveur (cf. tags router).
 */
export function TagsManagerSection() {
  const utils = trpc.useUtils();
  const { data: tags = [], isLoading } = trpc.tags.listAll.useQuery();
  const [query, setQuery] = useState('');

  // Édition inline — une seule ligne éditable à la fois pour ne pas perdre
  // des modifs non sauvegardées en switchant de tag.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  // Sélection multiple pour le merge.
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);

  const { sync } = useSyncContext();
  // Après chaque modification : invalide les caches tRPC (liste de tags) ET
  // déclenche une sync pour redescendre les entrées dont `updatedAt` a été
  // bumpée côté serveur — sinon la Dexie locale garde l'ancien tagName en
  // cache et le nom continue d'apparaître sur les cartes jusqu'au prochain
  // refresh manuel.
  const invalidate = () => {
    utils.tags.listAll.invalidate();
    utils.tags.list.invalidate();
    void sync();
  };

  const updateTag = trpc.tags.update.useMutation({
    onSuccess: () => {
      setEditingId(null);
      setEditError(null);
      invalidate();
    },
    onError: (err) => setEditError(err.message),
  });

  const deleteTag = trpc.tags.delete.useMutation({ onSuccess: invalidate });
  const mergeTag = trpc.tags.merge.useMutation({ onSuccess: invalidate });
  const deleteUnused = trpc.tags.deleteUnused.useMutation({ onSuccess: invalidate });

  // ── Création d'un nouveau tag ───────────────────────────────────────────────
  const [newTagName, setNewTagName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const createTag = trpc.tags.create.useMutation({
    onSuccess: () => {
      setNewTagName('');
      setCreateError(null);
      invalidate();
    },
    onError: (err) => setCreateError(err.message),
  });

  const handleCreate = (e?: React.FormEvent) => {
    e?.preventDefault();
    const name = newTagName.trim();
    if (!name) return;
    createTag.mutate({ name });
  };

  const unusedCount = tags.filter((t) => t.entryCount === 0).length;

  const handleCleanupUnused = async () => {
    const ok = await confirmDialog({
      title: `Supprimer ${unusedCount} tag${unusedCount > 1 ? 's' : ''} inutilisé${unusedCount > 1 ? 's' : ''} ?`,
      message:
        "Ces tags ne sont rattachés à aucune note. Ils sont restés en base après que tu les as retirés de leurs notes d'origine (ou jamais utilisés). Aucune note n'est touchée.",
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    const result = await deleteUnused.mutateAsync();
    await notifyDialog({
      title: 'Nettoyage effectué',
      message: `${result.deleted} tag${result.deleted > 1 ? 's' : ''} inutilisé${result.deleted > 1 ? 's' : ''} supprimé${result.deleted > 1 ? 's' : ''}.`,
      tone: 'success',
    });
  };

  // ── Tri ────────────────────────────────────────────────────────────────────
  // Stocké en localStorage pour persister entre sessions — c'est une préférence
  // de gestion, pas un état métier qui mérite une round-trip serveur.
  type TagSort = 'alpha-asc' | 'alpha-desc' | 'count-desc' | 'count-asc';
  const [sort, setSort] = useState<TagSort>(() => {
    const stored = localStorage.getItem('tags-manager-sort');
    return (stored === 'alpha-asc' || stored === 'alpha-desc' || stored === 'count-desc' || stored === 'count-asc')
      ? stored
      : 'alpha-asc';
  });
  const updateSort = (next: TagSort) => {
    setSort(next);
    localStorage.setItem('tags-manager-sort', next);
  };

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const base = q ? tags.filter((t) => t.name.toLowerCase().includes(q)) : tags;
    // Tri stable : on copie avant de muter (listAll renvoie déjà trié alpha
    // côté serveur mais on respecte le choix utilisateur).
    const collator = new Intl.Collator('fr', { sensitivity: 'base' });
    return [...base].sort((a, b) => {
      switch (sort) {
        case 'alpha-asc':  return collator.compare(a.name, b.name);
        case 'alpha-desc': return collator.compare(b.name, a.name);
        // Tri par compte avec alpha en tie-breaker pour éviter un ordre
        // instable entre les tags qui ont le même nombre de notes.
        case 'count-desc': return (b.entryCount - a.entryCount) || collator.compare(a.name, b.name);
        case 'count-asc':  return (a.entryCount - b.entryCount) || collator.compare(a.name, b.name);
      }
    });
  }, [tags, query, sort]);

  const startEdit = (tag: TagItem) => {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditError(null);
    setMergeSourceId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError(null);
  };

  const saveEdit = (tag: TagItem) => {
    const next = editName.trim();
    if (!next) {
      setEditError('Le nom ne peut pas être vide.');
      return;
    }
    if (next === tag.name) {
      cancelEdit();
      return;
    }
    updateTag.mutate({ id: tag.id, name: next });
  };

  const handleDelete = async (tag: TagItem) => {
    const ok = await confirmDialog({
      title: `Supprimer le tag « ${tag.name} » ?`,
      message:
        tag.entryCount > 0
          ? `${tag.entryCount} note${tag.entryCount > 1 ? 's' : ''} ${tag.entryCount > 1 ? 'seront détaguées' : 'sera détaguée'}. Leur contenu n'est pas touché.`
          : "Ce tag n'est utilisé sur aucune note.",
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    deleteTag.mutate({ id: tag.id });
  };

  const startMerge = (tag: TagItem) => {
    setMergeSourceId(tag.id);
    setEditingId(null);
  };

  const cancelMerge = () => setMergeSourceId(null);

  const performMerge = async (target: TagItem) => {
    const source = tags.find((t) => t.id === mergeSourceId);
    if (!source) return;
    const ok = await confirmDialog({
      title: `Fusionner « ${source.name} » dans « ${target.name} » ?`,
      message: `Les ${source.entryCount} note${source.entryCount > 1 ? 's' : ''} qui port${source.entryCount > 1 ? 'ent' : 'e'} « ${source.name} » recevront « ${target.name} » à la place. Le tag « ${source.name} » sera supprimé.`,
      confirmLabel: 'Fusionner',
      tone: 'warning',
    });
    if (!ok) return;
    try {
      const result = await mergeTag.mutateAsync({ sourceId: source.id, targetId: target.id });
      setMergeSourceId(null);
      await notifyDialog({
        title: 'Fusion effectuée',
        message: `${result.entriesAffected} note${result.entriesAffected > 1 ? 's' : ''} mise${result.entriesAffected > 1 ? 's' : ''} à jour.`,
        tone: 'success',
      });
    } catch (err) {
      await notifyDialog({
        title: 'Erreur',
        message: err instanceof Error ? err.message : 'Fusion impossible.',
        tone: 'danger',
      });
    }
  };

  const mergeSource = mergeSourceId ? tags.find((t) => t.id === mergeSourceId) : null;

  return (
    <SettingsCard>
      <p className="text-xs text-text-muted/60 mb-4">
        Renomme, fusionne ou supprime des tags <strong>sans passer sur chaque note</strong> :
        les modifications s'appliquent à toutes les notes qui portent le tag.
      </p>

      {/* Bandeau "tags inutilisés" — apparaît seulement si au moins un orphelin
          existe. Les orphelins sont des Tag jamais rattachés (typo) ou retirés
          de toutes leurs notes — ils restent en base car le sync ne les nettoie
          pas (cf. tags router → deleteUnused). */}
      {unusedCount > 0 && (
        <div className="mb-3 px-3 py-2.5 rounded-xl bg-text-muted/8 border border-text-muted/15 flex items-center gap-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted/60 shrink-0">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-text-primary">
              <strong>{unusedCount} tag{unusedCount > 1 ? 's' : ''}</strong> sans aucune note rattachée.
            </p>
            <p className="text-[11px] text-text-muted/60 mt-0.5">
              Restes d'anciennes notes ou typos jamais sauvegardés.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleCleanupUnused()}
            disabled={deleteUnused.isPending}
            className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-danger/10 text-danger hover:bg-danger/15 disabled:opacity-40 transition-colors"
          >
            {deleteUnused.isPending ? 'Nettoyage…' : 'Nettoyer'}
          </button>
        </div>
      )}

      {/* Création d'un nouveau tag — input + bouton. Utile pour préparer une
          nomenclature à l'avance sans avoir à passer par une note. */}
      <form onSubmit={handleCreate} className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-muted/60 pointer-events-none select-none">#</span>
          <input
            type="text"
            value={newTagName}
            onChange={(e) => { setNewTagName(e.target.value); if (createError) setCreateError(null); }}
            maxLength={60}
            placeholder="Nouveau tag…"
            className="w-full bg-bg-primary/60 border border-text-muted/15 rounded-xl pl-7 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted/55 outline-none focus:border-accent/40 transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={!newTagName.trim() || createTag.isPending}
          className="px-3.5 py-2 rounded-xl text-sm font-medium bg-accent text-bg-primary hover:opacity-95 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
        >
          {createTag.isPending ? '…' : 'Créer'}
        </button>
      </form>
      {createError && (
        <p className="text-[11px] text-danger mb-3 -mt-1">{createError}</p>
      )}

      {/* Recherche */}
      <div className="mb-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Filtrer (${tags.length} tag${tags.length > 1 ? 's' : ''})…`}
          className="w-full bg-bg-primary/60 border border-text-muted/15 rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/55 outline-none focus:border-accent/40 transition-colors"
        />
      </div>

      {/* Tri — bascule entre alphabétique et par nombre de notes. Clic sur
          la même clé inverse l'ordre (asc ↔ desc), comme un header de tableau. */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-text-muted/50 mr-1">Trier :</span>
        {([
          { key: 'alpha',  asc: 'alpha-asc' as const,  desc: 'alpha-desc' as const, label: 'Alphabétique' },
          { key: 'count',  asc: 'count-asc' as const,  desc: 'count-desc' as const, label: 'Nombre de notes' },
        ]).map((opt) => {
          const active = sort === opt.asc || sort === opt.desc;
          const isAsc = sort === opt.asc;
          const next: TagSort = active
            ? (isAsc ? opt.desc : opt.asc)
            // Par défaut : alpha part en asc (A→Z), count en desc (plus utilisés d'abord).
            : (opt.key === 'count' ? opt.desc : opt.asc);
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => updateSort(next)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 ${
                active
                  ? 'border-accent/40 bg-accent/10 text-accent font-medium'
                  : 'border-text-muted/15 text-text-muted hover:border-text-muted/30'
              }`}
            >
              {opt.label}
              {active && (
                <span className="text-[11px] leading-none">{isAsc ? '↑' : '↓'}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Mode fusion : bandeau explicatif */}
      {mergeSource && (
        <div className="mb-3 px-3 py-2.5 rounded-xl bg-warning/10 border border-warning/25 text-xs text-text-primary flex items-center gap-2">
          <span className="flex-1">
            Choisis la cible : « <strong>{mergeSource.name}</strong> » sera fusionné dedans.
          </span>
          <button
            type="button"
            onClick={cancelMerge}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            Annuler
          </button>
        </div>
      )}

      {/* Liste */}
      {isLoading ? (
        <p className="text-xs text-text-muted/50 italic">Chargement…</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-text-muted/50 italic">
          {query.trim() ? 'Aucun tag ne correspond.' : 'Aucun tag pour le moment.'}
        </p>
      ) : (
        <ul className="divide-y divide-text-muted/8 -mx-2 max-h-[60vh] overflow-y-auto scrollbar-soft">
          {filtered.map((tag) => {
            const isEditing = editingId === tag.id;
            const isMergeTarget = mergeSource && tag.id !== mergeSource.id;
            const isMergeSource = mergeSource?.id === tag.id;

            return (
              <li
                key={tag.id}
                className={`px-2 py-2.5 flex items-center gap-2 ${isMergeSource ? 'opacity-50' : ''}`}
              >
                {isEditing ? (
                  <form
                    onSubmit={(e) => { e.preventDefault(); saveEdit(tag); }}
                    className="flex-1 flex items-center gap-2"
                  >
                    <input
                      type="text"
                      autoFocus
                      value={editName}
                      onChange={(e) => { setEditName(e.target.value); setEditError(null); }}
                      onKeyDown={(e) => { if (e.key === 'Escape') cancelEdit(); }}
                      maxLength={60}
                      className="flex-1 bg-bg-primary/80 border border-accent/40 rounded-lg px-2.5 py-1 text-sm text-text-primary outline-none focus:border-accent/60"
                    />
                    <button
                      type="submit"
                      disabled={updateTag.isPending}
                      className="px-3 py-1 rounded-lg bg-accent text-bg-primary text-xs font-medium hover:opacity-95 disabled:opacity-40 transition-opacity"
                    >
                      OK
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="text-xs text-text-muted/70 hover:text-text-primary transition-colors"
                    >
                      ✕
                    </button>
                  </form>
                ) : isMergeTarget ? (
                  <button
                    type="button"
                    onClick={() => void performMerge(tag)}
                    className="flex-1 flex items-center gap-2 px-2.5 py-1 rounded-lg hover:bg-accent/10 transition-colors text-left"
                  >
                    <span className="text-sm text-text-primary truncate">#{tag.name}</span>
                    <span className="text-[11px] font-mono text-text-muted/50 shrink-0">{tag.entryCount}</span>
                    <span className="ml-auto text-[11px] text-accent shrink-0">→ fusionner ici</span>
                  </button>
                ) : (
                  <>
                    <span className="text-sm text-text-primary truncate flex-1">#{tag.name}</span>
                    <span className="text-[11px] font-mono text-text-muted/50 shrink-0">
                      {tag.entryCount} note{tag.entryCount !== 1 ? 's' : ''}
                    </span>
                    {!mergeSource && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => startEdit(tag)}
                          title="Renommer"
                          aria-label={`Renommer ${tag.name}`}
                          className="w-7 h-7 rounded-md flex items-center justify-center text-text-muted/60 hover:text-accent hover:bg-accent/10 transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => startMerge(tag)}
                          title="Fusionner avec un autre tag"
                          aria-label={`Fusionner ${tag.name}`}
                          disabled={tags.length < 2}
                          className="w-7 h-7 rounded-md flex items-center justify-center text-text-muted/60 hover:text-warning hover:bg-warning/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                            <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                            <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                            <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                            <path d="M9 12h6" /><path d="M12 9v6" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(tag)}
                          title="Supprimer"
                          aria-label={`Supprimer ${tag.name}`}
                          className="w-7 h-7 rounded-md flex items-center justify-center text-text-muted/60 hover:text-danger hover:bg-danger/10 transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </>
                )}

                {isEditing && editError && (
                  <span className="text-[11px] text-danger ml-2">{editError}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SettingsCard>
  );
}
