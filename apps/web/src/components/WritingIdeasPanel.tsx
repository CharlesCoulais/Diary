import { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LocalTask } from '../lib/db/schema';
import { useSyncContext } from '../lib/sync/SyncProvider';
import { trpc } from '../lib/trpc';
import { renderSpoilersInReact } from '../lib/spoilers';

/**
 * Panel « Notes à venir » — capture rapide d'idées d'écriture.
 *
 * Pas de modèle dédié : on réutilise l'infra Tasks existante avec un
 * `taskType: 'writing-idea'`. Avantages :
 *   - Sync gratuit via le protocole Dexie/Prisma existant
 *   - Pas de migration ni de table en plus
 *   - L'idée « terminée » devient une task DONE comme les autres, l'owner
 *     peut la retrouver dans la page Tasks s'il veut son historique
 *
 * Les filtres de la page Tasks excluent par défaut le taskType
 * 'writing-idea' (cf. Tasks.tsx) pour ne pas mélanger avec les vraies
 * tâches structurées. Ici on liste uniquement les non-DONE / non-CANCELLED.
 */
const WRITING_IDEA_TYPE = 'writing-idea';

export function WritingIdeasPanel({ ownerId }: { ownerId: string }) {
  const { sync } = useSyncContext();
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Liste des idées actives — toutes les tâches writing-idea sauf DONE/CANCELLED
  // / supprimées. Tri : plus récent en haut.
  const ideas = useLiveQuery(
    () => db.tasks
      .filter((t) =>
        t.taskType === WRITING_IDEA_TYPE
        && !t.deletedAt
        && !['DONE', 'CANCELLED'].includes(t.status),
      )
      .toArray()
      .then((arr) => arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
    [],
  ) ?? [];

  const addIdea = async () => {
    const title = draft.trim();
    if (!title) return;
    const now = new Date().toISOString();
    await db.tasks.put({
      id: crypto.randomUUID(),
      ownerId,
      title,
      notes: null,
      status: 'OPEN',
      dueDate: null,
      completedAt: null,
      category: null,
      taskType: WRITING_IDEA_TYPE,
      priority: null,
      sortOrder: null,
      createdBy: ownerId,
      version: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      _dirty: true,
    } as LocalTask);
    setDraft('');
    sync();
    // Garde le focus pour permettre de taper plusieurs idées rapidement.
    inputRef.current?.focus();
  };

  /**
   * « Écrite » = la note correspondante a été créée. On marque la tâche
   * comme DONE (visible dans l'historique Tasks pour qui veut revoir).
   * Pas de delete — l'owner garde une trace de ce qu'il a écrit.
   */
  const markWritten = async (id: string) => {
    const now = new Date().toISOString();
    await db.tasks.update(id, {
      status: 'DONE',
      completedAt: now,
      updatedAt: now,
      _dirty: true,
    });
    sync();
  };

  /** Suppression définitive (soft-delete via Dexie sync). */
  const removeIdea = async (id: string) => {
    const now = new Date().toISOString();
    await db.tasks.update(id, {
      deletedAt: now,
      updatedAt: now,
      _dirty: true,
    });
    sync();
  };

  return (
    <section className="bg-bg-elevated/60 rounded-2xl border border-text-muted/8 px-4 py-3 mb-4">
      <header className="flex items-center justify-between mb-2">
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-text-muted/60">
          ✦ Notes à venir
        </h3>
        {ideas.length > 0 && (
          <span className="font-mono text-[11px] text-text-muted/55 tabular-nums">{ideas.length}</span>
        )}
      </header>

      {/* Input rapide */}
      <form
        onSubmit={(e) => { e.preventDefault(); void addIdea(); }}
        className="flex items-center gap-2 mb-2"
      >
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Une idée à ne pas oublier…"
          className="flex-1 bg-transparent border-b border-text-muted/15 focus:border-accent/40 outline-none px-1 py-1.5 text-sm text-text-primary placeholder:text-text-muted/55 transition-colors"
          autoComplete="off"
          data-lpignore="true"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="text-xs text-accent font-medium disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
        >
          + Ajouter
        </button>
      </form>

      {/* Liste des idées */}
      {ideas.length === 0 ? (
        <p className="text-[11px] italic text-text-muted/55 py-1.5">
          Capture ici une idée d'écriture pour ne pas l'oublier.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {ideas.map((idea) => (
            <li key={idea.id} className="group flex items-center gap-2 py-1">
              <button
                type="button"
                onClick={() => void markWritten(idea.id)}
                aria-label="Marquer comme écrite"
                title="Marquer comme écrite"
                className="shrink-0 w-4 h-4 rounded-full border border-text-muted/30 hover:border-success hover:bg-success/10 transition-colors flex items-center justify-center"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-transparent group-hover:bg-success transition-colors" />
              </button>
              <span className="flex-1 text-sm text-text-primary leading-snug">
                {renderSpoilersInReact(idea.title, `idea-${idea.id}`)}
              </span>
              <button
                type="button"
                onClick={() => void removeIdea(idea.id)}
                aria-label="Supprimer"
                title="Supprimer"
                className="shrink-0 opacity-0 group-hover:opacity-100 text-text-muted/55 hover:text-danger transition-all text-sm leading-none"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Variante lecture-seule pour le confident : affiche les idées en attente
 * de l'owner mais sans input ni actions. Le confident reste informé de ce
 * sur quoi l'owner compte écrire, sans pouvoir interférer.
 *
 * Pas de Dexie côté confident — on lit via tRPC `tasks.writingIdeas`.
 * Refetch sur l'event SSE `'task'` (déjà câblé dans ServerEventsBridge).
 */
export function GuestWritingIdeasView() {
  const { data: ideas = [] } = trpc.tasks.writingIdeas.useQuery(undefined, {
    refetchInterval: () => (document.visibilityState === 'visible' ? 60_000 : false),
  });

  if (ideas.length === 0) return null; // Pas de bloc vide chez le confident

  return (
    <section className="bg-bg-elevated/60 rounded-2xl border border-text-muted/8 px-4 py-3 mb-4">
      <header className="flex items-center justify-between mb-2">
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-text-muted/60">
          ✦ Notes à venir
        </h3>
        <span className="font-mono text-[11px] text-text-muted/55 tabular-nums">{ideas.length}</span>
      </header>
      <p className="text-[11px] italic text-text-muted/50 mb-2">
        Ce sur quoi l'owner veut écrire prochainement.
      </p>
      <ul className="flex flex-col gap-1">
        {ideas.map((idea) => (
          <li key={idea.id} className="flex items-center gap-2 py-1">
            <span className="shrink-0 w-1 h-1 rounded-full bg-text-muted/40" />
            <span className="flex-1 text-sm text-text-primary/85 leading-snug">
              {renderSpoilersInReact(idea.title, `gv-${idea.id}`)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
