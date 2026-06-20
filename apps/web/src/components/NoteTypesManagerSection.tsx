import { useState } from 'react';
import type { NoteTypeFieldDef } from '@carnet/schemas';
import { trpc } from '../lib/trpc';
import { useSyncContext } from '../lib/sync/SyncProvider';
import { confirmDialog } from '../lib/dialog';
import { showToast } from '../lib/toast';
import { SettingsCard } from './SettingsCard';
import { NoteTypeFieldsBuilder } from './NoteTypeFieldsBuilder';
import {
  NoteTypeForm,
  emptyNoteTypeForm,
  getNoteTypeConfig,
  resolveDefConfig,
  noteTint,
  type NoteTypeFormValues,
  type NoteTypeDefLike,
} from './NoteTypePicker';

/**
 * Gestion des types de note personnalisés (Owner).
 *
 * Un type custom hérite d'un comportement built-in (`behavior`) et porte son
 * propre libellé/couleur/icône. Cette section permet de :
 *  - créer un type (même formulaire que le quick-create du picker) ;
 *  - le renommer / recolorer / changer son emoji ou son comportement (inline) ;
 *  - le réordonner (flèches haut/bas → `reorder`) ;
 *  - le supprimer (bloqué côté serveur tant qu'une note l'utilise — on désactive
 *    aussi le bouton localement quand `usageCount > 0`).
 *
 * Les écritures passent par les mutations `noteTypes.*` ; après chaque write on
 * invalide les caches tRPC ET on relance une sync pour redescendre la table
 * `noteTypeDefs` dans la Dexie de l'owner (les cartes utilisent le config résolu).
 */
export function NoteTypesManagerSection() {
  const utils = trpc.useUtils();
  const { sync } = useSyncContext();
  const { data: rawDefs = [], isLoading } = trpc.noteTypes.list.useQuery();
  const { data: usageCounts = {} } = trpc.noteTypes.usageCounts.useQuery();

  // Le `behavior` côté serveur est typé `NoteType` (enum Prisma, inclut CUSTOM)
  // mais ne contient jamais 'CUSTOM' en base pour un type custom → on resserre
  // vers `NoteTypeDefLike` (même cast que `useNoteTypeDefs`).
  const defs = rawDefs as unknown as NoteTypeDefLike[];

  // Après chaque write : caches tRPC + sync (pour la Dexie owner offline-first).
  const invalidate = () => {
    void utils.noteTypes.list.invalidate();
    void utils.noteTypes.usageCounts.invalidate();
    void sync();
  };

  const createMut = trpc.noteTypes.create.useMutation({ onSuccess: invalidate });
  const updateMut = trpc.noteTypes.update.useMutation({ onSuccess: invalidate });
  const reorderMut = trpc.noteTypes.reorder.useMutation({ onSuccess: invalidate });
  const deleteMut = trpc.noteTypes.delete.useMutation({
    onSuccess: invalidate,
    onError: (err) => showToast({ message: err.message, tone: 'danger' }),
  });

  // ── Création ────────────────────────────────────────────────────────────────
  // Le `NoteTypeForm` ne porte que nom/couleur/emoji/comportement ; les champs
  // perso (`fields`) vivent dans un state séparé, édité par le builder en dessous.
  const [createForm, setCreateForm] = useState<NoteTypeFormValues>(emptyNoteTypeForm);
  const [createFields, setCreateFields] = useState<NoteTypeFieldDef[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const label = createForm.label.trim();
    if (!label || createMut.isPending) return;
    try {
      await createMut.mutateAsync({
        label,
        labelPlural: label,
        volumeLabel: 'éléments',
        icon: createForm.icon.trim() || '🏷️',
        colorHex: createForm.colorHex,
        behavior: createForm.behavior,
        fields: createFields,
      });
      setCreateForm(emptyNoteTypeForm());
      setCreateFields([]);
      setCreateError(null);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Création impossible.');
    }
  };

  // ── Édition inline ───────────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<NoteTypeFormValues>(emptyNoteTypeForm);
  const [editFields, setEditFields] = useState<NoteTypeFieldDef[]>([]);

  const startEdit = (def: NoteTypeDefLike) => {
    setEditingId(def.id);
    setEditForm({
      label: def.label,
      colorHex: def.colorHex,
      icon: def.icon,
      behavior: def.behavior,
    });
    // `def` est resserré sur NoteTypeDefLike (sans `fields`) ; la ligne serveur
    // les porte bien — on les relit ici pour préremplir le builder.
    setEditFields(((def as { fields?: NoteTypeFieldDef[] }).fields ?? []).map((f) => ({ ...f })));
  };
  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (def: NoteTypeDefLike, e?: React.FormEvent) => {
    e?.preventDefault();
    const label = editForm.label.trim();
    if (!label || updateMut.isPending) return;
    await updateMut.mutateAsync({
      id: def.id,
      label,
      labelPlural: label,
      icon: editForm.icon.trim() || '🏷️',
      colorHex: editForm.colorHex,
      behavior: editForm.behavior,
      fields: editFields,
    });
    setEditingId(null);
  };

  // ── Réordonnancement ─────────────────────────────────────────────────────────
  const move = (index: number, dir: -1 | 1) => {
    const next = [...defs];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    reorderMut.mutate({ ids: next.map((d) => d.id) });
  };

  // ── Suppression ──────────────────────────────────────────────────────────────
  const handleDelete = async (def: NoteTypeDefLike) => {
    const count = usageCounts[def.id] ?? 0;
    const ok = await confirmDialog({
      title: `Supprimer le type « ${def.label} » ?`,
      message:
        count > 0
          ? `Ce type est utilisé par ${count} note${count > 1 ? 's' : ''}. Déplace ces notes vers un autre type avant de le supprimer.`
          : "Ce type n'est utilisé par aucune note.",
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    deleteMut.mutate({ id: def.id });
  };

  return (
    <SettingsCard>
      <p className="text-xs text-text-muted/60 mb-4">
        Crée tes propres types de note. Chaque type personnalisé <strong>se comporte comme</strong> un
        type intégré (Journal, Livre, Agenda…) mais avec son nom, sa couleur et son emoji à toi.
      </p>

      {/* Création */}
      <form onSubmit={handleCreate} className="mb-5 p-3 rounded-2xl bg-bg-primary/40 border border-text-muted/10">
        <p className="text-[11px] font-mono uppercase tracking-widest text-text-muted/55 mb-3">Nouveau type</p>
        <NoteTypeForm values={createForm} onChange={setCreateForm} idPrefix="create" />
        <div className="mt-3 pt-3 border-t border-text-muted/10">
          <NoteTypeFieldsBuilder fields={createFields} onChange={setCreateFields} />
        </div>
        <div className="flex items-center justify-end mt-3">
          <button
            type="submit"
            disabled={!createForm.label.trim() || createMut.isPending}
            className="px-3.5 py-2 rounded-xl text-sm font-medium bg-accent text-bg-primary hover:opacity-95 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
          >
            {createMut.isPending ? '…' : 'Créer le type'}
          </button>
        </div>
        {createError && <p className="text-[11px] text-danger mt-2">{createError}</p>}
      </form>

      {/* Liste */}
      {isLoading ? (
        <p className="text-xs text-text-muted/50 italic">Chargement…</p>
      ) : defs.length === 0 ? (
        <p className="text-xs text-text-muted/50 italic">Aucun type personnalisé pour le moment.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {defs.map((def, index) => {
            const cfg = resolveDefConfig(def);
            const behaviorLabel = getNoteTypeConfig(def.behavior).label;
            const count = usageCounts[def.id] ?? 0;
            const isEditing = editingId === def.id;

            if (isEditing) {
              return (
                <li key={def.id} className="p-3 rounded-2xl bg-bg-primary/40 border border-accent/30">
                  <form onSubmit={(e) => void saveEdit(def, e)}>
                    <NoteTypeForm values={editForm} onChange={setEditForm} idPrefix={`edit-${def.id}`} />
                    <div className="mt-3 pt-3 border-t border-text-muted/10">
                      <NoteTypeFieldsBuilder fields={editFields} onChange={setEditFields} />
                    </div>
                    <div className="flex items-center justify-end gap-2 mt-3">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="px-3 py-1.5 rounded-xl text-xs text-text-muted/70 hover:text-text-primary transition-colors"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        disabled={!editForm.label.trim() || updateMut.isPending}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-medium bg-accent text-bg-primary hover:opacity-95 disabled:opacity-30 transition-opacity"
                      >
                        {updateMut.isPending ? '…' : 'Enregistrer'}
                      </button>
                    </div>
                  </form>
                </li>
              );
            }

            return (
              <li
                key={def.id}
                className="px-3 py-2.5 flex items-center gap-3 rounded-2xl bg-bg-primary/30 border border-text-muted/10"
              >
                {/* Glyph + couleur */}
                <span
                  className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-base"
                  style={{ backgroundColor: noteTint(cfg.color, 14), color: cfg.color }}
                >
                  <cfg.Glyph className="w-4 h-4" style={{ color: cfg.color }} />
                </span>

                {/* Libellé + méta */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary font-medium truncate">{def.label}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-text-muted/8 text-text-muted/70">
                      comme {behaviorLabel}
                    </span>
                    <span className="text-[11px] text-text-muted/55">
                      Utilisé par {count} note{count !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 shrink-0">
                  {/* Réordonner */}
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0 || reorderMut.isPending}
                    title="Monter"
                    aria-label={`Monter ${def.label}`}
                    className="w-8 h-8 rounded-md flex items-center justify-center text-text-muted/60 hover:text-text-primary hover:bg-text-muted/10 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="18 15 12 9 6 15" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === defs.length - 1 || reorderMut.isPending}
                    title="Descendre"
                    aria-label={`Descendre ${def.label}`}
                    className="w-8 h-8 rounded-md flex items-center justify-center text-text-muted/60 hover:text-text-primary hover:bg-text-muted/10 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {/* Éditer */}
                  <button
                    type="button"
                    onClick={() => startEdit(def)}
                    title="Modifier"
                    aria-label={`Modifier ${def.label}`}
                    className="w-8 h-8 rounded-md flex items-center justify-center text-text-muted/60 hover:text-accent hover:bg-accent/10 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  {/* Supprimer — désactivé tant qu'une note l'utilise */}
                  <button
                    type="button"
                    onClick={() => void handleDelete(def)}
                    disabled={count > 0 || deleteMut.isPending}
                    title={count > 0 ? `Utilisé par ${count} note${count > 1 ? 's' : ''} — déplace ces notes d'abord` : 'Supprimer'}
                    aria-label={`Supprimer ${def.label}`}
                    className="w-8 h-8 rounded-md flex items-center justify-center text-text-muted/60 hover:text-danger hover:bg-danger/10 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </svg>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SettingsCard>
  );
}
