import { useState, useRef, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LocalTask } from '../lib/db/schema';
import { trpc } from '../lib/trpc';
import { useSyncContext } from '../lib/sync/SyncProvider';
import { useBackButtonClose } from '../hooks/useBackButtonClose';
import { useModalA11y } from '../hooks/useModalA11y';
import { useCollapsibleSection } from '../hooks/useCollapsibleSection';
import { BottomNav, GuestBottomNav } from '../components/BottomNav';
import { BackToTop } from '../components/BackToTop';
import { PageHeader } from '../components/PageHeader';
import { Link } from 'react-router-dom';
import { renderSpoilersInReact, stripSpoilers } from '../lib/spoilers';
import { showToast } from '../lib/toast';
import { getTaskDisplayPrefs, useTaskDisplayPrefs } from '../lib/displayPrefs';
import { seedTasks } from '../lib/seedTasks';
import { confirmDialog, notifyDialog } from '../lib/dialog';
import { DatePicker } from '../components/DatePicker';
import { useDropdownAlign } from '../lib/useDropdownAlign';

// ── Status ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<LocalTask['status'], string> = {
  OPEN: 'Ouvert',
  SCHEDULED: 'Planifié',
  IN_PROGRESS: 'En cours',
  LOCAL_DONE: 'Local',
  DEPLOYED: 'Déployé',
  TO_TEST: 'Test',
  DONE: 'Fait',
  MIGRATED: 'Migré',
  CANCELLED: 'Annulé',
};

const STATUS_NEXT: Record<LocalTask['status'], LocalTask['status']> = {
  OPEN: 'SCHEDULED',
  SCHEDULED: 'IN_PROGRESS',
  IN_PROGRESS: 'LOCAL_DONE',
  LOCAL_DONE: 'DEPLOYED',
  DEPLOYED: 'TO_TEST',
  TO_TEST: 'DONE',
  DONE: 'OPEN',
  MIGRATED: 'DONE',
  CANCELLED: 'OPEN',
};

const COMPLETED_STATUSES = new Set<LocalTask['status']>(['DONE', 'MIGRATED', 'CANCELLED']);
const ACTIVE_STATUSES = new Set<LocalTask['status']>(['OPEN', 'SCHEDULED', 'IN_PROGRESS', 'LOCAL_DONE', 'DEPLOYED', 'TO_TEST']);

// Source UNIQUE des couleurs de statut (badges, dots, pills des modales).
// Les 9 statuts ont chacun une teinte distincte — auparavant OPEN/DEPLOYED/MIGRATED
// partageaient tous l'accent (indistinguables). Les dots portent en plus une
// icône différenciante, donc la couleur n'est jamais le seul signal (TASK-02).
const STATUS_COLORS: Record<LocalTask['status'], string> = {
  OPEN:        'var(--color-accent)', // bleu canard — à faire
  SCHEDULED:   '#6b7280',             // ardoise — planifié
  IN_PROGRESS: '#D06010',             // mandarine — en cours
  LOCAL_DONE:  '#1890A0',             // cyan — local
  TO_TEST:     '#8B5FA8',             // violet — à tester
  DEPLOYED:    '#2E7DB8',             // bleu acier — déployé
  DONE:        '#357528',             // vert — fait
  CANCELLED:   '#E03355',             // rouge — annulé
  MIGRATED:    '#9A6A4A',             // sienne — migré (terminal, distinct du déployé)
};

const STATUS_ORDER: LocalTask['status'][] = ['OPEN', 'SCHEDULED', 'IN_PROGRESS', 'LOCAL_DONE', 'TO_TEST', 'DEPLOYED', 'DONE', 'CANCELLED', 'MIGRATED'];

// ── Sort ─────────────────────────────────────────────────────────────────────

type SortBy = 'manual' | 'priority' | 'dueDate' | 'createdAt' | 'status';

const PRIORITY_ORDER: Record<NonNullable<LocalTask['priority']>, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function applySort(tasks: LocalTask[], sortBy: SortBy): LocalTask[] {
  const copy = [...tasks];
  if (sortBy === 'manual') {
    copy.sort((a, b) => {
      if (a.sortOrder != null && b.sortOrder != null) return a.sortOrder - b.sortOrder;
      if (a.sortOrder != null) return -1;
      if (b.sortOrder != null) return 1;
      return a.createdAt < b.createdAt ? -1 : 1;
    });
  } else if (sortBy === 'priority') {
    copy.sort((a, b) => {
      const pa = a.priority != null ? PRIORITY_ORDER[a.priority] : 3;
      const pb = b.priority != null ? PRIORITY_ORDER[b.priority] : 3;
      if (pa !== pb) return pa - pb;
      return a.createdAt < b.createdAt ? -1 : 1;
    });
  } else if (sortBy === 'dueDate') {
    copy.sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return a.createdAt < b.createdAt ? -1 : 1;
    });
  } else if (sortBy === 'createdAt') {
    copy.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
  } else if (sortBy === 'status') {
    copy.sort((a, b) => {
      const ia = STATUS_ORDER.indexOf(a.status);
      const ib = STATUS_ORDER.indexOf(b.status);
      if (ia !== ib) return ia - ib;
      return a.createdAt < b.createdAt ? -1 : 1;
    });
  }
  return copy;
}

// ── Due date utilities ────────────────────────────────────────────────────────

function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function getDueDateState(dueDate: string): 'overdue' | 'today' | 'tomorrow' | 'soon' | 'future' {
  const today = getTodayString();
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const soonCutoff = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  if (dueDate < today) return 'overdue';
  if (dueDate === today) return 'today';
  if (dueDate === tomorrow) return 'tomorrow';
  if (dueDate <= soonCutoff) return 'soon';
  return 'future';
}

function DueDateBadge({ dueDate, status }: { dueDate: string; status: LocalTask['status'] }) {
  const dateStr = dueDate.slice(0, 10);
  const isCompleted = COMPLETED_STATUSES.has(status);
  if (isCompleted) {
    return <span className="text-[11px] text-text-muted/55">{dateStr}</span>;
  }
  const state = getDueDateState(dateStr);
  const formatted = new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  if (state === 'overdue') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-danger/15 text-danger border border-danger/30">
        ⚠ En retard · {formatted}
      </span>
    );
  }
  if (state === 'today') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-warning/15 text-warning border border-warning/30">
        ⏰ Aujourd'hui
      </span>
    );
  }
  if (state === 'tomorrow') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-warning/10 text-warning/80 border border-warning/20">
        Demain
      </span>
    );
  }
  if (state === 'soon') {
    return <span className="text-[11px] text-warning/70">{formatted}</span>;
  }
  return <span className="text-[11px] text-text-muted/60">{formatted}</span>;
}

/** Squelette de liste de tâches — affiché pendant le chargement (TRANS-06). */
function TaskListSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5 bg-bg-elevated rounded-xl">
          <div className="w-5 h-5 rounded-full bg-text-muted/10 animate-pulse shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="h-3 rounded bg-text-muted/10 animate-pulse" style={{ width: `${70 - i * 8}%` }} />
            <div className="h-2.5 rounded bg-text-muted/[0.07] animate-pulse w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Edit modal ───────────────────────────────────────────────────────────────

interface EditTaskModalProps {
  task: LocalTask;
  userId: string;
  existingCategories: string[];
  onClose: () => void;
}

const TASK_TYPES = ['Feature', 'Bug fix', 'Enhancement', 'Refactor', 'Santé', 'Sport', 'Maison', 'Finance', 'Social', 'Idée', 'Vie quotidienne'];

const PRIORITY_LABELS: Record<NonNullable<LocalTask['priority']>, string> = {
  HIGH: '🔴 Haute',
  MEDIUM: '🟠 Moyenne',
  LOW: '🟡 Basse',
};

const PRIORITY_COLOR: Record<NonNullable<LocalTask['priority']>, string> = {
  HIGH:   '#E03355',
  MEDIUM: '#D06010',
  LOW:    'var(--color-accent)',
};

function PriorityBadge({ priority }: { priority: LocalTask['priority'] }) {
  if (!priority) return null;
  const color = PRIORITY_COLOR[priority];
  const label = priority === 'HIGH' ? '↑ Haute' : priority === 'MEDIUM' ? '→ Moy.' : '↓ Basse';
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-semibold border shrink-0"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color, borderColor: `color-mix(in srgb, ${color} 35%, transparent)` }}
    >
      {label}
    </span>
  );
}

function EditTaskModal({ task, userId, existingCategories, onClose }: EditTaskModalProps) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [status, setStatus] = useState(task.status);
  const [dueDate, setDueDate] = useState(task.dueDate ?? '');
  const [category, setCategory] = useState(task.category ?? '');
  const [taskType, setTaskType] = useState(task.taskType ?? '');
  const [priority, setPriority] = useState<LocalTask['priority']>(task.priority ?? null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // Back natif → ferme la modale d'édition de tâche.
  useBackButtonClose(true, onClose);

  const canEdit = task.createdBy === userId || task.createdBy === null || task.ownerId === userId;

  const save = async () => {
    if (!title.trim()) return;
    const now = new Date().toISOString();
    await db.tasks.update(task.id, {
      title: title.trim(),
      notes: notes.trim() || null,
      status,
      dueDate: dueDate || null,
      category: category.trim() || null,
      taskType: taskType.trim() || null,
      priority: priority,
      updatedAt: now,
      _dirty: true,
    });
    onClose();
  };

  // Suppression (accessible aussi sur desktop, où il n'y a pas de swipe).
  // Soft-delete + toast d'annulation, même comportement que le swipe mobile.
  const handleDelete = async () => {
    const now = new Date().toISOString();
    await db.tasks.update(task.id, { deletedAt: now, updatedAt: now, _dirty: true });
    onClose();
    const label = stripSpoilers(task.title);
    showToast({
      message: `« ${label.length > 40 ? label.slice(0, 40) + '…' : label} » supprimée`,
      action: {
        label: 'Annuler',
        onClick: () => {
          void db.tasks.update(task.id, { deletedAt: null, updatedAt: new Date().toISOString(), _dirty: true });
        },
      },
    });
  };

  const PRIORITY_COLORS: [LocalTask['priority'], string, string][] = [
    [null,     'var(--color-accent)', 'Aucune'],
    ['HIGH',   '#E03355',             '↑ Haute'],
    ['MEDIUM', '#D06010',             '→ Moy.'],
    ['LOW',    'var(--color-accent)', '↓ Basse'],
  ];

  const panelRef = useModalA11y<HTMLDivElement>(onClose);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-bg-primary/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div ref={panelRef} role="dialog" aria-modal="true" tabIndex={-1} className="w-full sm:max-w-md bg-bg-elevated rounded-t-3xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92dvh] outline-none">

        {/* En-tête */}
        <div className="shrink-0 flex items-center gap-3 px-6 pt-5 pb-4 border-b border-text-muted/10">
          <p className="flex-1 font-mono text-[11px] uppercase tracking-widest text-text-muted/50">
            {canEdit ? 'Modifier' : 'Détails'}
          </p>
          <StatusBadge status={status} />
          <button type="button" onClick={onClose} className="text-text-muted/55 hover:text-text-muted transition-colors shrink-0" aria-label="Fermer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Corps scrollable */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-soft">
          <div className="px-6 pt-6 pb-4 flex flex-col gap-6">

            {!canEdit && (
              <p className="text-xs text-text-muted italic bg-bg-primary/60 rounded-xl px-3 py-2 border border-text-muted/10">
                Cette tâche a été créée par un confident — vous pouvez changer son statut mais pas son contenu.
              </p>
            )}

            {/* Titre */}
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canEdit}
              placeholder="Titre…"
              className="w-full bg-transparent text-xl font-medium text-text-primary placeholder:text-text-muted/25 outline-none border-b border-text-muted/10 pb-3 focus:border-accent/30 disabled:opacity-50 transition-colors"
            />

            {/* Notes */}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!canEdit}
              placeholder="Notes…"
              rows={4}
              className="w-full bg-transparent text-sm leading-relaxed text-text-primary placeholder:text-text-muted/25 outline-none resize-none disabled:opacity-50 transition-colors hide-scrollbar"
            />

            {/* Métadonnées */}
            <div className="bg-bg-primary/50 border border-text-muted/10 rounded-2xl p-4 flex flex-col gap-4">

              {/* Statut */}
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted/50 mb-2">Statut</p>
                <div className="flex flex-wrap gap-1.5">
                  {(['OPEN','SCHEDULED','IN_PROGRESS','LOCAL_DONE','TO_TEST','DEPLOYED','DONE','CANCELLED'] as LocalTask['status'][]).map((s) => {
                    const color = STATUS_COLORS[s];
                    return (
                      <button key={s} type="button" onClick={() => setStatus(s)} aria-pressed={status === s}
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${status === s ? 'opacity-100 ring-2 ring-current' : 'opacity-55 hover:opacity-80'}`}
                        style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color, borderColor: `color-mix(in srgb, ${color} 35%, transparent)` }}
                      >
                        {STATUS_LABELS[s]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Priorité */}
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted/50 mb-2">Priorité</p>
                <div className="flex flex-wrap gap-1.5">
                  {PRIORITY_COLORS.map(([p, color, label]) => (
                    <button key={p ?? 'none'} type="button" onClick={() => setPriority(p)} aria-pressed={priority === p}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${priority === p ? 'opacity-100 ring-2 ring-current' : 'opacity-55 hover:opacity-80'}`}
                      style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color, borderColor: `color-mix(in srgb, ${color} 35%, transparent)` }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Catégorie + Type */}
              {canEdit && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted/50 mb-1.5">Catégorie</p>
                    <ComboDropdown value={category} onChange={setCategory} options={existingCategories} placeholder="Perso, Travail…" />
                  </div>
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted/50 mb-1.5">Type</p>
                    <ComboDropdown value={taskType} onChange={setTaskType} options={TASK_TYPES} placeholder="Feature, Bug fix…" />
                  </div>
                </div>
              )}

              {/* Échéance */}
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted/50 mb-1.5">Échéance</p>
                <DatePicker
                  value={dueDate}
                  onChange={setDueDate}
                  placeholder="Choisir une date…"
                />
              </div>
            </div>

          </div>
        </div>

        {/* Pied épinglé */}
        <div className="shrink-0 flex gap-2 px-6 py-4 border-t border-text-muted/10 bg-bg-elevated">
          <button type="button" onClick={() => void handleDelete()} title="Supprimer la tâche"
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium text-danger/80 border border-danger/20 hover:bg-danger/10 hover:text-danger transition-colors"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Supprimer
          </button>
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm text-text-muted/70 font-medium border border-text-muted/15 hover:border-text-muted/30 hover:text-text-primary transition-colors"
          >
            Annuler
          </button>
          <button type="button" onClick={() => void save()} disabled={!title.trim()}
            className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-medium disabled:opacity-40 transition-opacity"
          >
            Enregistrer
          </button>
        </div>

      </div>
    </div>
  );
}

// ── Create task modal (mobile) ───────────────────────────────────────────────

const MODAL_PRIORITY_OPTIONS: [LocalTask['priority'], string, string][] = [
  [null,     'var(--color-accent)', 'Aucune'],
  ['HIGH',   '#E03355',             '↑ Haute'],
  ['MEDIUM', '#D06010',             '→ Moy.'],
  ['LOW',    'var(--color-accent)', '↓ Basse'],
];

function CreateTaskModal({ userId, existingCategories, onClose, onSaved }: {
  userId: string;
  existingCategories: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle]       = useState('');
  const [notes, setNotes]       = useState('');
  const [status, setStatus]     = useState<LocalTask['status']>('OPEN');
  const [priority, setPriority] = useState<LocalTask['priority']>(null);
  const [category, setCategory] = useState('');
  const [taskType, setTaskType] = useState('');
  const [dueDate, setDueDate]   = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  useBackButtonClose(true, onClose);

  const save = async () => {
    if (!title.trim()) return;
    const now = new Date().toISOString();
    await db.tasks.put({
      id: crypto.randomUUID(),
      ownerId: userId,
      title: title.trim(),
      notes: notes.trim() || null,
      status,
      dueDate: dueDate || null,
      completedAt: null,
      category: category.trim() || null,
      taskType: taskType.trim() || null,
      priority,
      sortOrder: null,
      createdBy: userId,
      version: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      _dirty: true,
    });
    onSaved();
  };

  const panelRef = useModalA11y<HTMLDivElement>(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-bg-primary/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div ref={panelRef} role="dialog" aria-modal="true" tabIndex={-1} className="w-full sm:max-w-md bg-bg-elevated rounded-t-3xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92dvh] outline-none">

        {/* En-tête */}
        <div className="shrink-0 flex items-center gap-3 px-6 pt-5 pb-4 border-b border-text-muted/10">
          <p className="flex-1 font-mono text-[11px] uppercase tracking-widest text-text-muted/50">Nouvelle tâche</p>
          <button type="button" onClick={onClose} className="text-text-muted/55 hover:text-text-muted transition-colors shrink-0" aria-label="Fermer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Corps scrollable */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-soft">
          <div className="px-6 pt-6 pb-4 flex flex-col gap-6">

            {/* Titre */}
            <input ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre…"
              className="w-full bg-transparent text-xl font-medium text-text-primary placeholder:text-text-muted/25 outline-none border-b border-text-muted/10 pb-3 focus:border-accent/30 transition-colors"
            />

            {/* Notes */}
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes…" rows={4}
              className="w-full bg-transparent text-sm leading-relaxed text-text-primary placeholder:text-text-muted/25 outline-none resize-none transition-colors hide-scrollbar"
            />

            {/* Métadonnées */}
            <div className="bg-bg-primary/50 border border-text-muted/10 rounded-2xl p-4 flex flex-col gap-4">

              {/* Statut */}
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted/50 mb-2">Statut</p>
                <div className="flex flex-wrap gap-1.5">
                  {(['OPEN','SCHEDULED','IN_PROGRESS','LOCAL_DONE','TO_TEST','DEPLOYED','DONE','CANCELLED'] as LocalTask['status'][]).map((s) => {
                    const color = STATUS_COLORS[s];
                    return (
                      <button key={s} type="button" onClick={() => setStatus(s)} aria-pressed={status === s}
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${status === s ? 'opacity-100 ring-2 ring-current' : 'opacity-55 hover:opacity-80'}`}
                        style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color, borderColor: `color-mix(in srgb, ${color} 35%, transparent)` }}
                      >{STATUS_LABELS[s]}</button>
                    );
                  })}
                </div>
              </div>

              {/* Priorité */}
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted/50 mb-2">Priorité</p>
                <div className="flex flex-wrap gap-1.5">
                  {MODAL_PRIORITY_OPTIONS.map(([p, color, label]) => (
                    <button key={p ?? 'none'} type="button" onClick={() => setPriority(p)} aria-pressed={priority === p}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${priority === p ? 'opacity-100 ring-2 ring-current' : 'opacity-55 hover:opacity-80'}`}
                      style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color, borderColor: `color-mix(in srgb, ${color} 35%, transparent)` }}
                    >{label}</button>
                  ))}
                </div>
              </div>

              {/* Catégorie + Type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted/50 mb-1.5">Catégorie</p>
                  <ComboDropdown value={category} onChange={setCategory} options={existingCategories} placeholder="Perso, Travail…" />
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted/50 mb-1.5">Type</p>
                  <ComboDropdown value={taskType} onChange={setTaskType} options={TASK_TYPES} placeholder="Feature, Bug fix…" />
                </div>
              </div>

              {/* Échéance */}
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted/50 mb-1.5">Échéance</p>
                <DatePicker value={dueDate} onChange={setDueDate} placeholder="Choisir une date…" />
              </div>
            </div>
          </div>
        </div>

        {/* Pied épinglé */}
        <div className="shrink-0 flex gap-3 px-6 py-4 border-t border-text-muted/10 bg-bg-elevated">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm text-text-muted/70 font-medium border border-text-muted/15 hover:border-text-muted/30 hover:text-text-primary transition-colors"
          >Annuler</button>
          <button type="button" onClick={() => void save()} disabled={!title.trim()}
            className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-medium disabled:opacity-40 transition-opacity"
          >Créer</button>
        </div>
      </div>
    </div>
  );
}

// ── Status badge ────────────────────────────────────────────────────────────

function statusBadgeClass(status: LocalTask['status']) {
  if (status === 'DONE') return 'bg-success/15 text-success border-success/20';
  if (status === 'LOCAL_DONE') return 'bg-success/10 text-success/70 border-success/15';
  if (status === 'TO_TEST') return 'bg-purple-400/10 text-purple-400 border-purple-400/20';
  if (status === 'DEPLOYED' || status === 'MIGRATED') return 'bg-accent/10 text-accent border-accent/20';
  if (status === 'CANCELLED') return 'bg-text-muted/10 text-text-muted border-text-muted/20';
  if (status === 'SCHEDULED') return 'bg-warning/15 text-warning border-warning/20';
  if (status === 'IN_PROGRESS') return 'bg-warning/10 text-warning/80 border-warning/20';
  return 'bg-bg-primary text-text-muted border-text-muted/20';
}


function StatusBadge({ status }: { status: LocalTask['status'] }) {
  const color = STATUS_COLORS[status] ?? 'var(--color-text-muted)';
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-medium border"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color, borderColor: `color-mix(in srgb, ${color} 35%, transparent)` }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

// ── Task row ─────────────────────────────────────────────────────────────────

interface TaskRowProps {
  task: LocalTask;
  userId: string;
  onEdit: (task: LocalTask) => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  dragOver?: boolean;
  onDragStart?: (id: string) => void;
  onDragOver?: (id: string) => void;
  onDrop?: (targetId: string) => void;
  onDragEnd?: () => void;
  draggable?: boolean;
  /** Repli tactile du tri manuel (HTML5 drag KO sur iOS) : flèches ↑/↓ (TASK-08).
   *  Fournies seulement en tri manuel et quand un voisin existe. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

function TaskRow({ task, userId, onEdit, selectMode, selected, onToggleSelect, dragOver, onDragStart, onDragOver, onDrop, onDragEnd, draggable: isDraggable = true, onMoveUp, onMoveDown }: TaskRowProps) {
  const isDone = COMPLETED_STATUSES.has(task.status);
  const isOwn = task.createdBy === userId || task.createdBy === null;

  const toggle = async () => {
    const nextStatus = STATUS_NEXT[task.status];
    const wasCompleted = COMPLETED_STATUSES.has(task.status);
    const willBeCompleted = COMPLETED_STATUSES.has(nextStatus);
    // Reboucle destructrice : quitter un statut terminal (Fait/Migré/Annulé) pour
    // un statut actif efface la date de complétion → on confirme d'abord.
    if (wasCompleted && !willBeCompleted) {
      const ok = await confirmDialog({
        title: 'Rouvrir cette tâche ?',
        message: `« ${stripSpoilers(task.title)} » est ${STATUS_LABELS[task.status].toLowerCase()}. La rouvrir la repasse à « ${STATUS_LABELS[nextStatus]} » et efface sa date de complétion.`,
        confirmLabel: 'Rouvrir',
        cancelLabel: 'Annuler',
        tone: 'warning',
      });
      if (!ok) return;
    }
    const now = new Date().toISOString();
    await db.tasks.update(task.id, {
      status: nextStatus,
      // On préserve la complétion existante tant qu'on reste dans un statut terminal.
      completedAt: willBeCompleted ? (task.completedAt ?? now) : null,
      updatedAt: now,
      _dirty: true,
    });
  };

  const deleteTask = async () => {
    const now = new Date().toISOString();
    await db.tasks.update(task.id, { deletedAt: now, updatedAt: now, _dirty: true });
    setSwipeX(0);
    const label = stripSpoilers(task.title);
    showToast({
      message: `« ${label.length > 40 ? label.slice(0, 40) + '…' : label} » supprimée`,
      action: {
        label: 'Annuler',
        onClick: () => {
          void db.tasks.update(task.id, {
            deletedAt: null,
            updatedAt: new Date().toISOString(),
            _dirty: true,
          });
        },
      },
    });
  };

  // ── Swipe-to-delete (mobile only) ─────────────────────────────────────────
  const DELETE_W = 80;
  const [swipeX, setSwipeX] = useState(0);
  const [isSwipeActive, setIsSwipeActive] = useState(false);
  const swipeRef = useRef<{ startX: number; startY: number; baseX: number; dir: 'h' | 'v' | null }>({ startX: 0, startY: 0, baseX: 0, dir: null });

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    swipeRef.current = { startX: t.clientX, startY: t.clientY, baseX: swipeX, dir: null };
    setIsSwipeActive(true);
  };

  // touchmove en listener non-passif pour pouvoir appeler preventDefault (swipe horizontal)
  // sans touch-action: pan-y, ce qui bloquerait le long-press drag HTML5
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const handler = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      const { startX, startY, baseX } = swipeRef.current;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (swipeRef.current.dir === null) {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
        swipeRef.current.dir = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
      }
      if (swipeRef.current.dir !== 'h') return;
      e.preventDefault(); // empêche le scroll uniquement en swipe horizontal
      setSwipeX(Math.min(0, Math.max(-DELETE_W, baseX + dx)));
    };
    el.addEventListener('touchmove', handler, { passive: false });
    return () => el.removeEventListener('touchmove', handler);
  }, []);

  const onTouchEnd = () => {
    setIsSwipeActive(false);
    if (swipeRef.current.dir !== 'h') return;
    setSwipeX(swipeX < -DELETE_W / 2 ? -DELETE_W : 0);
  };

  const handleRowClick = () => {
    if (swipeX !== 0) { setSwipeX(0); return; }
    if (selectMode) onToggleSelect?.(task.id);
    else onEdit(task);
  };

  const priorityColor = task.priority ? PRIORITY_COLOR[task.priority] : null;
  const statusColor = STATUS_COLORS[task.status] ?? 'var(--color-text-muted)';

  return (
    <div className="relative overflow-hidden">

      {/* Zone de suppression révélée au swipe (mobile). Masquée (opacité 0 +
          pointer-events none) tant que la rangée n'est pas glissée, pour qu'elle
          ne puisse jamais déborder sous le contenu au repos (ni transitoirement). */}
      <div
        className={`absolute right-0 top-0 bottom-0 flex items-center justify-center bg-danger/90 transition-opacity duration-150 ${swipeX < 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ width: DELETE_W }}
        aria-hidden={swipeX === 0}
      >
        <button
          type="button"
          onClick={deleteTask}
          tabIndex={swipeX < 0 ? 0 : -1}
          className="flex flex-col items-center gap-1 text-white w-full h-full justify-center"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span className="text-[11px] font-semibold tracking-wide">Supprimer</span>
        </button>
      </div>

      {/* Contenu de la row — glisse vers la gauche au swipe */}
      <div
        draggable={isDraggable && !selectMode}
        onDragStart={() => onDragStart?.(task.id)}
        onDragOver={(e) => { e.preventDefault(); onDragOver?.(task.id); }}
        onDrop={(e) => { e.preventDefault(); onDrop?.(task.id); }}
        onDragEnd={onDragEnd}
        onClick={selectMode ? handleRowClick : undefined}
        ref={rowRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateX(${swipeX}px)`,
          transition: isSwipeActive ? 'none' : 'transform 0.25s ease',
        }}
        className={`group relative flex items-start gap-3 px-4 py-3.5 bg-bg-elevated ${isDone && !selectMode ? 'opacity-45' : ''} ${selectMode ? 'cursor-pointer' : ''} ${dragOver ? 'outline outline-1 outline-accent/20' : ''}`}
      >
      {/* Barre de priorité gauche */}
      {priorityColor && !isDone && (
        <div
          className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
          style={{ backgroundColor: `color-mix(in srgb, ${priorityColor} 60%, transparent)` }}
        />
      )}

      {/* Bouton statut / checkbox sélection — wrappé pour overlay drag handle */}
      {selectMode ? (
        <div className={`mt-0.5 w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors duration-150 ${selected ? 'bg-accent border-accent' : 'border-text-muted/40'}`}>
          {selected && (
            <svg viewBox="0 0 20 20" fill="white" className="w-full h-full p-0.5">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </div>
      ) : (
        <div className="relative mt-0.5 w-5 h-5 shrink-0">
          {/* Dot de statut — s'efface au hover pour laisser place au drag */}
          <button
            type="button"
            onClick={toggle}
            title={`Statut : ${STATUS_LABELS[task.status]} — cliquer pour avancer`}
            className="absolute inset-0 rounded-full border-2 transition-all duration-200 flex items-center justify-center hover:scale-110 [@media(hover:hover)]:group-hover:opacity-0"
            style={{
              backgroundColor: isDone
                ? `color-mix(in srgb, ${statusColor} 60%, transparent)`
                : `color-mix(in srgb, ${statusColor} 15%, transparent)`,
              borderColor: `color-mix(in srgb, ${statusColor} ${isDone ? '80' : '50'}%, transparent)`,
            }}
          >
            {(task.status === 'DONE' || task.status === 'LOCAL_DONE') && (
              <svg viewBox="0 0 20 20" fill="white" className="w-3 h-3">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
            {task.status === 'CANCELLED' && (
              <svg viewBox="0 0 20 20" fill="white" className="w-3 h-3">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            )}
            {(task.status === 'DEPLOYED' || task.status === 'MIGRATED') && (
              <svg viewBox="0 0 20 20" fill="white" className="w-3 h-3">
                <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            )}
            {task.status === 'IN_PROGRESS' && (
              <svg viewBox="0 0 20 20" fill="white" className="w-3 h-3">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
            )}
            {task.status === 'TO_TEST' && (
              <svg viewBox="0 0 20 20" fill="white" className="w-3 h-3">
                <path fillRule="evenodd" d="M7 2a1 1 0 00-.707 1.707L7 4.414v3.758a1 1 0 01-.293.707l-4 4C1.03 14.561 2.124 17 4.343 17h11.314c2.219 0 3.313-2.44 1.636-4.121l-4-4A1 1 0 0113 8.172V4.414l.707-.707A1 1 0 0013 2H7z" clipRule="evenodd" />
              </svg>
            )}
            {task.status === 'SCHEDULED' && (
              <svg viewBox="0 0 20 20" fill="white" className="w-3 h-3">
                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
              </svg>
            )}
          </button>
          {/* Drag handle — hover desktop uniquement (HTML5 drag non supporté sur iOS) */}
          {isDraggable && (
            <span
              className="absolute inset-0 hidden [@media(hover:hover)]:flex items-center justify-center opacity-0 group-hover:opacity-35 cursor-grab active:cursor-grabbing text-text-muted transition-opacity duration-200 select-none text-base"
              title="Réordonner"
            >
              ⠿
            </span>
          )}
        </div>
      )}

      {/* Contenu */}
      <div
        className="relative flex-1 min-w-0 cursor-pointer"
        onClick={!selectMode ? handleRowClick : undefined}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleRowClick()}
      >
        {/* Titre + date */}
        <div className="flex items-start gap-2">
          <p className={`flex-1 min-w-0 text-sm font-medium text-text-primary leading-snug transition-colors group-hover:text-accent ${isDone && !selectMode ? 'line-through opacity-70' : ''}`}>
            {renderSpoilersInReact(task.title, `tt-${task.id}`)}
            {!isOwn && (
              <span className="ml-2 text-[11px] font-normal text-text-muted/50 not-italic no-underline">
                (confident)
              </span>
            )}
          </p>
          {task.dueDate && (
            <span className="shrink-0 mt-0.5">
              <DueDateBadge dueDate={task.dueDate} status={task.status} />
            </span>
          )}
        </div>

        {/* Badges : priorité, statut, type, notes */}
        {(task.priority || task.status !== 'OPEN' || task.taskType || task.notes) && (
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {task.priority && <PriorityBadge priority={task.priority} />}
            {/* Badge d'affichage seulement : l'avancement du statut se fait via le
                dot à gauche (un seul contrôle, pas de double bouton destructeur). */}
            {task.status !== 'OPEN' && <StatusBadge status={task.status} />}
            {task.taskType && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-text-muted/8 text-text-muted/70 border border-text-muted/15">
                {task.taskType}
              </span>
            )}
            {task.notes && (
              <span className="text-[11px] text-text-muted/50 italic truncate max-w-[160px]">
                {renderSpoilersInReact(task.notes, `tnotes-${task.id}`)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Flèches ↑/↓ — repli tactile du tri manuel (le drag HTML5 ne marche pas
          sur iOS). Visibles uniquement sur écran tactile et en tri manuel (TASK-08). */}
      {!selectMode && (onMoveUp || onMoveDown) && (
        <div className="hidden [@media(pointer:coarse)]:flex flex-col shrink-0 self-center -my-1">
          <button
            type="button"
            disabled={!onMoveUp}
            onClick={(e) => { e.stopPropagation(); onMoveUp?.(); }}
            aria-label="Monter la tâche"
            className="w-8 h-7 flex items-center justify-center rounded text-text-muted/55 active:bg-text-muted/10 disabled:opacity-25 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
          </button>
          <button
            type="button"
            disabled={!onMoveDown}
            onClick={(e) => { e.stopPropagation(); onMoveDown?.(); }}
            aria-label="Descendre la tâche"
            className="w-8 h-7 flex items-center justify-center rounded text-text-muted/55 active:bg-text-muted/10 disabled:opacity-25 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </button>
        </div>
      )}

      </div>

    </div>
  );
}

// ── Manage categories modal ──────────────────────────────────────────────────

interface CategoryPanelProps {
  allTasks: LocalTask[];
  categoryOrder: string[];
  onClose: () => void;
  onSave: (newOrder: string[]) => void;
}

function CategoryPanel({ allTasks, categoryOrder, onClose, onSave }: CategoryPanelProps) {
  // Build full list: ordered first, then any new ones
  const existing = Array.from(new Set(allTasks.map((t) => t.category).filter(Boolean))) as string[];
  const initialList = [
    ...categoryOrder.filter((c) => existing.includes(c)),
    ...existing.filter((c) => !categoryOrder.includes(c)),
  ];

  const [items, setItems] = useState<Array<{ original: string; current: string; deleted: boolean }>>(
    () => initialList.map((c) => ({ original: c, current: c, deleted: false }))
  );
  const [newCat, setNewCat] = useState('');
  const [saving, setSaving] = useState(false);
  const dragIdx = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const taskCount = (cat: string) => allTasks.filter((t) => t.category === cat).length;

  const addCategory = () => {
    const name = newCat.trim();
    if (!name || items.some((i) => i.current === name && !i.deleted)) return;
    setItems((prev) => [...prev, { original: '', current: name, deleted: false }]);
    setNewCat('');
  };

  const save = async () => {
    setSaving(true);
    const now = new Date().toISOString();

    for (const item of items) {
      if (item.deleted && item.original) {
        // Null-ify all tasks with this category
        await db.tasks.where('category').equals(item.original).modify({ category: null, updatedAt: now, _dirty: true });
      } else if (item.original && item.current !== item.original && item.current.trim()) {
        // Rename
        await db.tasks.where('category').equals(item.original).modify({ category: item.current.trim(), updatedAt: now, _dirty: true });
      }
    }

    const newOrder = items.filter((i) => !i.deleted && i.current.trim()).map((i) => i.current.trim());
    onSave(newOrder);
    setSaving(false);
    onClose();
  };

  const reorderItems = (fromIdx: number, toIdx: number) => {
    setItems((prev) => {
      const next = [...prev];
      const moved = next.splice(fromIdx, 1)[0];
      if (!moved) return prev;
      next.splice(toIdx, 0, moved);
      return next;
    });
  };

  const activeItems = items.filter((i) => !i.deleted);

  return (
    <div className="bg-bg-elevated rounded-2xl shadow-soft mb-4 overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <h3 className="text-sm font-medium text-text-primary">Catégories</h3>
        <button onClick={onClose} className="text-text-muted/50 hover:text-text-muted transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div className="px-3 pb-2 space-y-0.5 max-h-72 overflow-y-auto scrollbar-soft">
        {activeItems.length === 0 && (
          <p className="text-sm text-text-muted italic py-2 px-2">Aucune catégorie.</p>
        )}
        {items.map((item, idx) => {
          if (item.deleted) return null;
          const count = item.original ? taskCount(item.original) : 0;
          return (
            <div
              key={idx}
              draggable
              onDragStart={() => { dragIdx.current = idx; }}
              onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIdx.current !== null && dragIdx.current !== idx) reorderItems(dragIdx.current, idx);
                setDragOverIdx(null); dragIdx.current = null;
              }}
              onDragEnd={() => { setDragOverIdx(null); dragIdx.current = null; }}
              className={`flex items-center gap-2 py-1.5 px-2 rounded-xl transition-colors ${dragOverIdx === idx ? 'bg-accent/10' : 'hover:bg-bg-primary/60'}`}
            >
              <span className="text-text-muted/45 cursor-grab select-none text-sm">⠿</span>
              <input
                value={item.current}
                onChange={(e) => {
                  const val = e.target.value;
                  setItems((prev) => prev.map((it, i) => i === idx ? { ...it, current: val } : it));
                }}
                className="flex-1 bg-transparent text-sm text-text-primary outline-none border-b border-transparent focus:border-text-muted/20 transition-colors py-0.5"
              />
              {count > 0 && (
                <span className="text-[11px] text-text-muted/50 shrink-0">{count}</span>
              )}
              <button
                type="button"
                onClick={async () => {
                  if (count > 0) {
                    const ok = await confirmDialog({
                      title: `Supprimer « ${item.current} » ?`,
                      message: `Les ${count} tâche${count > 1 ? 's' : ''} associée${count > 1 ? 's' : ''} n'auront plus de catégorie.`,
                      confirmLabel: 'Supprimer',
                      tone: 'danger',
                    });
                    if (!ok) return;
                  }
                  setItems((prev) => prev.map((it, i) => i === idx ? { ...it, deleted: true } : it));
                }}
                className="text-text-muted/45 hover:text-danger transition-colors shrink-0"
                aria-label="Supprimer"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
          );
        })}

        {/* Ajouter */}
        <div className="flex gap-2 pt-2 px-1">
          <input
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
            placeholder="Nouvelle catégorie…"
            className="flex-1 bg-bg-primary rounded-xl px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted/55 outline-none border border-transparent focus:border-accent/30 transition-colors"
          />
          <button
            type="button"
            onClick={addCategory}
            disabled={!newCat.trim()}
            className="px-3 py-1.5 rounded-xl bg-accent/10 text-accent text-xs font-medium disabled:opacity-40 transition-opacity"
          >
            Ajouter
          </button>
        </div>
      </div>

      <div className="flex gap-2 px-3 py-3 border-t border-text-muted/[0.06] mt-1">
        <button
          onClick={onClose}
          className="flex-1 py-2 rounded-xl text-xs font-medium text-text-muted hover:text-text-primary transition-colors border border-text-muted/15"
        >
          Annuler
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 py-2 rounded-xl bg-accent text-white text-xs font-medium disabled:opacity-40 transition-opacity"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}

// ── Multi-select dropdown ────────────────────────────────────────────────────

// ── BulkDropdown — flip automatique si proche du bord droit ─────────────────

function BulkDropdown({ label, open, onToggle, children }: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { panelRef, panelStyle } = useDropdownAlign<HTMLDivElement>(open);

  // Fermer sur clic extérieur
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggle();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onToggle]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${open ? 'bg-accent/15 text-accent border-accent/30' : 'border-text-muted/20 text-text-muted hover:text-text-primary'}`}
      >
        {label}
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {open && (
        <div ref={panelRef} style={panelStyle} className="absolute top-full left-0 mt-1 z-30 bg-bg-elevated border border-text-muted/15 rounded-xl shadow-xl py-1 min-w-[140px] max-h-52 overflow-y-auto scrollbar-soft">
          {children}
        </div>
      )}
    </div>
  );
}

function MultiSelectDropdown<T extends string>({
  label,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  options: { value: T; label: string; count?: number }[];
  selected: Set<T>;
  onToggle: (value: T) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { panelRef, panelStyle } = useDropdownAlign<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const count = selected.size;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
          count > 0
            ? 'border-accent/40 bg-accent/10 text-accent font-medium'
            : 'border-text-muted/15 text-text-muted hover:border-text-muted/30 hover:text-text-primary'
        }`}
      >
        {label}
        {count > 0 && <span className="bg-accent/20 text-accent rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none">{count}</span>}
        <span className="text-[11px] opacity-50 ml-0.5">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div ref={panelRef} style={panelStyle} className="absolute top-full left-0 mt-1 z-20 bg-bg-elevated rounded-xl shadow-xl border border-text-muted/10 py-1 min-w-[150px]">
          <button
            type="button"
            onClick={() => { onClear(); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-xs text-text-muted hover:bg-bg-primary/60 transition-colors"
          >
            Tout afficher
          </button>
          <div className="h-px bg-text-muted/10 my-1" />
          {options.map(({ value, label: optLabel, count: optCount }) => (
            <button
              key={value}
              type="button"
              onClick={() => onToggle(value)}
              className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-bg-primary/60 transition-colors"
            >
              <span className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center transition-colors ${
                selected.has(value) ? 'bg-accent border-accent' : 'border-text-muted/30'
              }`}>
                {selected.has(value) && <span className="text-white text-[11px] leading-none font-bold">✓</span>}
              </span>
              <span className={`flex-1 ${selected.has(value) ? 'text-text-primary font-medium' : 'text-text-muted'}`}>
                {optLabel}
              </span>
              {optCount != null && !selected.has(value) && (
                <span className="text-text-muted/55 text-[11px]">{optCount}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ComboDropdown — input + custom dropdown (remplace datalist natif) ────────

function ComboDropdown({
  value, onChange, options, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = options.filter((o) => o.toLowerCase().includes(value.toLowerCase()));
  const showList = open && filtered.length > 0;

  return (
    <div ref={ref} className="relative">
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full bg-bg-primary/60 border border-text-muted/15 rounded-xl px-3 py-2 pr-7 text-sm text-text-primary placeholder:text-text-muted/35 outline-none focus:border-accent/30 transition-colors"
      />
      {options.length > 0 && (
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => { e.preventDefault(); setOpen((v) => !v); }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted/55 hover:text-text-muted transition-colors"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
      )}
      {showList && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-bg-elevated border border-text-muted/15 rounded-xl shadow-soft overflow-hidden max-h-48 overflow-y-auto scrollbar-soft">
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(opt); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                value === opt ? 'bg-accent/10 text-accent' : 'text-text-primary hover:bg-text-muted/8'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Task detail panel (right column on desktop) ──────────────────────────────

type PanelMode = 'create' | 'edit';

interface TaskDetailPanelProps {
  mode: PanelMode;
  task: LocalTask | null;
  userId: string;
  existingCategories: string[];
  onClose: () => void;
  onSaved: () => void;
}

function TaskDetailPanel({ mode, task, userId, existingCategories, onClose, onSaved }: TaskDetailPanelProps) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [status, setStatus] = useState<LocalTask['status']>(task?.status ?? 'OPEN');
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '');
  const [category, setCategory] = useState(task?.category ?? '');
  const [taskType, setTaskType] = useState(task?.taskType ?? '');
  const [priority, setPriority] = useState<LocalTask['priority']>(task?.priority ?? null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const canEdit = mode === 'create' || !task || task.createdBy === userId || task.createdBy === null || task.ownerId === userId;

  const save = async () => {
    if (!title.trim()) return;
    const now = new Date().toISOString();
    if (mode === 'create') {
      await db.tasks.put({
        id: crypto.randomUUID(),
        ownerId: userId,
        title: title.trim(),
        notes: notes.trim() || null,
        status,
        dueDate: dueDate || null,
        completedAt: null,
        category: category.trim() || null,
        taskType: taskType.trim() || null,
        priority,
        sortOrder: null,
        createdBy: userId,
        version: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        _dirty: true,
      });
    } else if (task) {
      await db.tasks.update(task.id, {
        title: title.trim(),
        notes: notes.trim() || null,
        status,
        dueDate: dueDate || null,
        category: category.trim() || null,
        taskType: taskType.trim() || null,
        priority,
        updatedAt: now,
        _dirty: true,
      });
    }
    onSaved();
  };

  // Suppression depuis le panneau (desktop — pas de swipe). Soft-delete + toast
  // d'annulation, même comportement que le swipe mobile.
  const handleDelete = async () => {
    if (!task) return;
    const now = new Date().toISOString();
    await db.tasks.update(task.id, { deletedAt: now, updatedAt: now, _dirty: true });
    onClose();
    const label = stripSpoilers(task.title);
    showToast({
      message: `« ${label.length > 40 ? label.slice(0, 40) + '…' : label} » supprimée`,
      action: {
        label: 'Annuler',
        onClick: () => {
          void db.tasks.update(task.id, { deletedAt: null, updatedAt: new Date().toISOString(), _dirty: true });
        },
      },
    });
  };

  return (
    <>
      {/* En-tête */}
      <div className="shrink-0 flex items-center gap-3 px-6 pt-6 pb-4 border-b border-text-muted/10">
        <p className="flex-1 font-mono text-[11px] uppercase tracking-widest text-text-muted/50">
          {mode === 'create' ? 'Nouvelle tâche' : 'Modifier'}
        </p>
        {task && <StatusBadge status={task.status} />}
        <button
          type="button"
          onClick={onClose}
          className="text-text-muted/55 hover:text-text-muted transition-colors shrink-0"
          aria-label="Fermer"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Zone scrollable */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-soft">
        <div className="px-6 pt-6 pb-4 flex flex-col gap-6">

          {!canEdit && (
            <p className="text-xs text-text-muted italic bg-bg-primary/60 rounded-xl px-3 py-2 border border-text-muted/10">
              Cette tâche a été créée par un confident — vous pouvez changer son statut mais pas son contenu.
            </p>
          )}

          {/* Titre — grand et éditorial */}
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!canEdit}
            placeholder="Titre…"
            className="w-full bg-transparent text-xl font-medium text-text-primary placeholder:text-text-muted/25 outline-none border-b border-text-muted/10 pb-3 focus:border-accent/30 disabled:opacity-50 transition-colors"
          />

          {/* Notes — espace d'écriture libre */}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!canEdit}
            placeholder="Notes…"
            rows={5}
            className="w-full bg-transparent text-sm leading-relaxed text-text-primary placeholder:text-text-muted/25 outline-none resize-none disabled:opacity-50 transition-colors hide-scrollbar"
          />

          {/* Métadonnées groupées */}
          <div className="bg-bg-elevated border border-text-muted/10 rounded-2xl p-4 flex flex-col gap-4">

            {/* Statut — pills colorées (palette types de note) */}
            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted/50 mb-2">Statut</p>
              <div className="flex flex-wrap gap-1.5">
                {([
                  ['OPEN',        'var(--color-accent)'], // actuel
                  ['SCHEDULED',   '#6b7280'],              // blanc
                  ['IN_PROGRESS', '#D06010'],              // sortie (mandarine)
                  ['LOCAL_DONE',  '#1890A0'],              // dev (turquoise)
                  ['DEPLOYED',    'var(--color-accent)'],  // journal (accent)
                  ['TO_TEST',     '#8B5FA8'],              // livre (prune)
                  ['DONE',        '#357528'],              // film (feuillage)
                  ['CANCELLED',   '#E03355'],              // shopping (fraise)
                ] as [LocalTask['status'], string][]).map(([s, color]) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)} aria-pressed={status === s}
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                      status === s ? 'opacity-100 ring-2 ring-current' : 'opacity-55 hover:opacity-80'
                    }`}
                    style={{
                      backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
                      color,
                      borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
                    }}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* Priorité — pills colorées (palette types de note) */}
            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted/50 mb-2">Priorité</p>
              <div className="flex flex-wrap gap-1.5">
                {([
                  [null,     'var(--color-accent)', 'Aucune'],  // actuel
                  ['HIGH',   '#E03355',              '↑ Haute'], // shopping (fraise)
                  ['MEDIUM', '#D06010',              '→ Moy.'],  // sortie (mandarine)
                  ['LOW',    'var(--color-accent)',  '↓ Basse'], // journal (accent)
                ] as [LocalTask['priority'], string, string][]).map(([p, color, label]) => (
                  <button
                    key={p ?? 'none'}
                    type="button"
                    onClick={() => setPriority(p)} aria-pressed={priority === p}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                      priority === p ? 'opacity-100 ring-2 ring-current' : 'opacity-55 hover:opacity-80'
                    }`}
                    style={{
                      backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
                      color,
                      borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Catégorie + Type */}
            {canEdit && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted/50 mb-1.5">Catégorie</p>
                  <ComboDropdown
                    value={category}
                    onChange={setCategory}
                    options={existingCategories}
                    placeholder="Perso, Travail…"
                  />
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted/50 mb-1.5">Type</p>
                  <ComboDropdown
                    value={taskType}
                    onChange={setTaskType}
                    options={TASK_TYPES}
                    placeholder="Feature, Bug fix…"
                  />
                </div>
              </div>
            )}

            {/* Échéance */}
            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted/50 mb-1.5">Échéance</p>
              <DatePicker value={dueDate} onChange={setDueDate} placeholder="Choisir une date…" />
            </div>
          </div>

        </div>
      </div>

      {/* Actions — épinglées en bas */}
      <div className="shrink-0 flex gap-2 px-6 py-4 border-t border-text-muted/10 bg-bg-elevated">
        {mode === 'edit' && task && (
          <button
            type="button"
            onClick={() => void handleDelete()}
            title="Supprimer la tâche"
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium text-danger/80 border border-danger/20 hover:bg-danger/10 hover:text-danger transition-colors"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Supprimer
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2.5 rounded-xl text-sm text-text-muted/70 font-medium border border-text-muted/15 hover:border-text-muted/30 hover:text-text-primary transition-colors"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!title.trim()}
          className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-medium disabled:opacity-40 transition-opacity"
        >
          {mode === 'create' ? 'Créer' : 'Enregistrer'}
        </button>
      </div>
    </>
  );
}

// ── Owner tasks view ─────────────────────────────────────────────────────────

type StatusFilter = Set<LocalTask['status']>;
type PriorityFilter = Set<'HIGH' | 'MEDIUM' | 'LOW' | '__none__'>;
type TypeFilter = Set<string>;

export function TasksPage() {
  // New task form
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newStatus, setNewStatus] = useState<LocalTask['status']>('OPEN');
  const [newTaskType, setNewTaskType] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newDueDate, setNewDueDate] = useState<string | null>(null);
  const [newPriority, setNewPriority] = useState<LocalTask['priority']>(null);
  const [showNewDetails, setShowNewDetails] = useState(false);
  // Filters (initialized from saved prefs) — vide = tous
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => new Set(getTaskDisplayPrefs().defaultStatusFilter));
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  const [creatorFilter, setCreatorFilter] = useState<Set<string>>(new Set());
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>(() => new Set(getTaskDisplayPrefs().defaultPriorityFilter as ('HIGH' | 'MEDIUM' | 'LOW' | '__none__')[]));
  const [hideCompleted, setHideCompleted] = useState(() => getTaskDisplayPrefs().hideCompleted);
  const [dueFilter, setDueFilter] = useState<'all' | 'today' | 'overdue'>('all');
  // Search
  const [searchQuery, setSearchQuery] = useState('');
  // Sort
  const [sortBy, setSortBy] = useState<SortBy>('manual');
  // Category order (persisted)
  const [taskPrefs, updateTaskPrefs] = useTaskDisplayPrefs();
  // Barre de filtres repliée par défaut sur mobile (TASK-06, comme la Timeline).
  const [filtersCollapsed, toggleFilters] = useCollapsibleSection('tasks-filters', 'mobile');

  // Selection / bulk
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDropdown, setBulkDropdown] = useState<'status' | 'priority' | 'category' | 'type' | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const bulkDeleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Create / Edit modal (mobile)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTask, setEditingTask] = useState<LocalTask | null>(null);
  // Desktop right panel
  const [desktopPanel, setDesktopPanel] = useState<'idle' | 'create' | { task: LocalTask }>('idle');
  // Category panel (inline below filters)
  const [showCatPanel, setShowCatPanel] = useState(false);
  // Drag-and-drop (tasks)
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);
  // Drag-and-drop (categories)
  const [dragOverCat, setDragOverCat] = useState<string | null>(null);
  const dragCatRef = useRef<string | null>(null);

  const { data: user } = trpc.auth.me.useQuery();
  const { syncing } = useSyncContext();

  const isGuest = user?.role === 'GUEST';

  const allTasksRaw = useLiveQuery(
    () =>
      isGuest
        ? Promise.resolve([] as LocalTask[])
        : db.tasks.filter((t) => t.deletedAt === null).toArray(),
    [isGuest],
  );
  const tasksLoading = allTasksRaw === undefined; // distingue chargement / vide (TRANS-06)

  const allTasks = applySort(allTasksRaw ?? [], sortBy);

  if (isGuest) return <GuestTasksView />;

  const existingTypes = Array.from(new Set(allTasks.map((t) => t.taskType).filter(Boolean))) as string[];
  const existingCategories = Array.from(new Set(allTasks.map((t) => t.category).filter(Boolean))) as string[];

  const _today = getTodayString();
  const _searchQ = searchQuery.trim().toLowerCase();
  const filtered = allTasks
    .filter((t) => statusFilter.size === 0 || statusFilter.has(t.status))
    .filter((t) => !hideCompleted || !COMPLETED_STATUSES.has(t.status))
    .filter((t) => {
      if (typeFilter.size === 0) return true;
      if (typeFilter.has('__none__') && !t.taskType) return true;
      return !!(t.taskType && typeFilter.has(t.taskType));
    })
    .filter((t) => {
      if (categoryFilter.size === 0) return true;
      if (categoryFilter.has('__none__') && !t.category) return true;
      return !!(t.category && categoryFilter.has(t.category));
    })
    .filter((t) => {
      if (priorityFilter.size === 0) return true;
      if (priorityFilter.has('__none__') && t.priority === null) return true;
      return !!(t.priority && priorityFilter.has(t.priority as 'HIGH' | 'MEDIUM' | 'LOW'));
    })
    .filter((t) => {
      if (dueFilter === 'today') return t.dueDate === _today;
      if (dueFilter === 'overdue') return !!t.dueDate && t.dueDate < _today;
      return true;
    })
    .filter((t) => {
      if (!_searchQ) return true;
      return t.title.toLowerCase().includes(_searchQ) || (t.notes ?? '').toLowerCase().includes(_searchQ);
    })
    .filter((t) => {
      if (creatorFilter.size === 0) return true;
      const isOwn = t.createdBy === user?.id || t.createdBy === null;
      if (creatorFilter.has('mine') && isOwn) return true;
      if (creatorFilter.has('confident') && !isOwn) return true;
      return false;
    });

  // Categories: saved order first, then new ones alphabetically, '' last
  const rawCategories = Array.from(new Set(filtered.map((t) => t.category ?? '')));
  const { categoryOrder } = taskPrefs;
  const categories = [
    ...categoryOrder.filter((c) => rawCategories.includes(c)),
    ...rawCategories.filter((c) => c !== '' && !categoryOrder.includes(c)).sort((a, b) => a.localeCompare(b)),
    ...(rawCategories.includes('') ? [''] : []),
  ];

  const byCategory = (cat: string) => filtered.filter((t) => (t.category ?? '') === cat);

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !user) return;
    const now = new Date().toISOString();
    await db.tasks.put({
      id: crypto.randomUUID(),
      ownerId: user.id,
      title: newTitle.trim(),
      notes: newNotes.trim() || null,
      status: newStatus,
      dueDate: newDueDate || null,
      completedAt: null,
      category: newCategory.trim() || null,
      taskType: newTaskType.trim() || null,
      priority: newPriority,
      sortOrder: null,
      createdBy: user.id,
      version: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      _dirty: true,
    });
    setNewTitle('');
    setNewNotes('');
    setNewDueDate(null);
    if (!showNewDetails) {
      setNewCategory('');
      setNewTaskType('');
      setNewStatus('OPEN');
      setNewPriority(null);
    }
  };

  // ── Selection helpers ──
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(filtered.map((t) => t.id)));

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setBulkDropdown(null);
    setBulkDeleteConfirm(false);
    if (bulkDeleteTimer.current) clearTimeout(bulkDeleteTimer.current);
  };

  const bulkApplyStatus = async (status: LocalTask['status']) => {
    const now = new Date().toISOString();
    for (const id of selectedIds) await db.tasks.update(id, { status, updatedAt: now, _dirty: true });
    exitSelectMode();
  };
  const bulkApplyPriority = async (priority: LocalTask['priority']) => {
    const now = new Date().toISOString();
    for (const id of selectedIds) await db.tasks.update(id, { priority, updatedAt: now, _dirty: true });
    exitSelectMode();
  };
  const bulkApplyCategory = async (category: string | null) => {
    const now = new Date().toISOString();
    for (const id of selectedIds) await db.tasks.update(id, { category, updatedAt: now, _dirty: true });
    exitSelectMode();
  };
  const bulkApplyType = async (taskType: string | null) => {
    const now = new Date().toISOString();
    for (const id of selectedIds) await db.tasks.update(id, { taskType, updatedAt: now, _dirty: true });
    exitSelectMode();
  };
  const bulkDelete = async () => {
    if (!bulkDeleteConfirm) {
      setBulkDeleteConfirm(true);
      bulkDeleteTimer.current = setTimeout(() => setBulkDeleteConfirm(false), 3000);
      return;
    }
    if (bulkDeleteTimer.current) clearTimeout(bulkDeleteTimer.current);
    const now = new Date().toISOString();
    const ids = Array.from(selectedIds);
    for (const id of ids) await db.tasks.update(id, { deletedAt: now, updatedAt: now, _dirty: true });
    exitSelectMode();
    showToast({
      message: `${ids.length} tâche${ids.length > 1 ? 's' : ''} supprimée${ids.length > 1 ? 's' : ''}`,
      action: {
        label: 'Annuler',
        onClick: () => {
          const ts = new Date().toISOString();
          void Promise.all(ids.map((id) => db.tasks.update(id, { deletedAt: null, updatedAt: ts, _dirty: true })));
        },
      },
    });
  };

  const reorderTask = useCallback(async (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    const dragged = allTasks.find((t) => t.id === draggedId);
    if (!dragged) return;
    const sameCat = filtered.filter((t) => (t.category ?? '') === (dragged.category ?? ''));
    const targetIdx = sameCat.findIndex((t) => t.id === targetId);
    if (targetIdx === -1) return;

    const prev = sameCat[targetIdx - 1];
    const next = sameCat[targetIdx];
    const prevOrder = prev?.sortOrder ?? (next?.sortOrder != null ? next.sortOrder - 2 : 0);
    const nextOrder = next?.sortOrder ?? (prev?.sortOrder != null ? prev.sortOrder + 2 : prevOrder + 2);
    const newOrder = (prevOrder + nextOrder) / 2;

    const now = new Date().toISOString();
    await db.tasks.update(draggedId, { sortOrder: newOrder, updatedAt: now, _dirty: true });
  }, [allTasks, filtered]);

  const reorderCategory = useCallback((draggedCat: string, targetCat: string) => {
    if (draggedCat === targetCat) return;
    const fullOrder = categories;
    const fromIdx = fullOrder.indexOf(draggedCat);
    const toIdx = fullOrder.indexOf(targetCat);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = [...fullOrder];
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, draggedCat);
    // Exclude empty string from persisted order
    updateTaskPrefs({ categoryOrder: next.filter((c) => c !== '') });
  }, [categories, updateTaskPrefs]);

  const handleEditTask = useCallback((task: LocalTask) => {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      setDesktopPanel({ task });
    } else {
      setEditingTask(task);
    }
  }, []);

  const statusCounts = allTasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});

  const sortButtons: { value: SortBy; label: string; icon: React.ReactNode }[] = [
    { value: 'priority',  label: 'Priorité', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg> },
    { value: 'dueDate',   label: 'Échéance', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
    { value: 'createdAt', label: 'Récent',   icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
    { value: 'status',    label: 'Statut',   icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> },
  ];

  return (
    <div className="min-h-dvh pb-48 sm:pb-56 max-w-2xl mx-auto [overflow-x:clip] lg:max-w-none lg:px-0 lg:pb-0 lg:flex lg:items-start">
      <div className={`lg:px-12 lg:pb-16 lg:min-h-dvh lg:min-w-0 ${desktopPanel !== 'idle' ? 'lg:w-[560px] lg:shrink-0' : 'lg:flex-1'}`}>
      <PageHeader
        title="Tâches"
        kicker={(() => {
          const active = allTasks.filter((t) => !COMPLETED_STATUSES.has(t.status)).length;
          return active > 0 ? `${active} tâche${active > 1 ? 's' : ''} en cours` : 'Tâches';
        })()}
        backTo="/"
      />
      <div className="px-6">

      {/* Due date summary banners */}
      {(() => {
        const today = getTodayString();
        const overdue = allTasks.filter((t) => ACTIVE_STATUSES.has(t.status) && t.dueDate && t.dueDate < today);
        const dueToday = allTasks.filter((t) => ACTIVE_STATUSES.has(t.status) && t.dueDate === today);
        if (overdue.length === 0 && dueToday.length === 0) return null;
        return (
          <div className="mb-4 flex flex-col gap-2">
            {overdue.length > 0 && (
              <button
                type="button"
                className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all text-left ${dueFilter === 'overdue' ? 'bg-danger/20 border-danger/40' : 'bg-danger/10 border-danger/20'}`}
                onClick={() => setDueFilter((v) => v === 'overdue' ? 'all' : 'overdue')}
              >
                <span className="text-danger text-sm">⚠</span>
                <p className="text-sm text-danger font-medium flex-1">
                  {overdue.length} tâche{overdue.length > 1 ? 's' : ''} en retard
                </p>
                {dueFilter === 'overdue' && <span className="text-xs text-danger/60">✕ retirer le filtre</span>}
              </button>
            )}
            {dueToday.length > 0 && (
              <button
                type="button"
                className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all text-left ${dueFilter === 'today' ? 'bg-warning/20 border-warning/40' : 'bg-warning/10 border-warning/20'}`}
                onClick={() => setDueFilter((v) => v === 'today' ? 'all' : 'today')}
              >
                <span className="text-warning text-sm">⏰</span>
                <p className="text-sm text-warning font-medium flex-1">
                  {dueToday.length} tâche{dueToday.length > 1 ? 's' : ''} due{dueToday.length > 1 ? 's' : ''} aujourd'hui
                </p>
                {dueFilter === 'today' && <span className="text-xs text-warning/60">✕ retirer le filtre</span>}
              </button>
            )}
          </div>
        );
      })()}

      {/* Desktop: bouton Nouvelle tâche (ouvre le panneau droit) */}
      {!selectMode && (
        <button
          type="button"
          onClick={() => setDesktopPanel('create')}
          className="hidden lg:flex flex-col justify-end gap-1.5 w-full rounded-2xl bg-accent text-bg-primary hover:opacity-95 active:scale-[0.99] transition-all text-left p-5 min-h-[88px] mb-6"
        >
          <span className="font-mono text-[11px] tracking-widest uppercase opacity-60 flex items-center gap-1.5">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 5v14"/><path d="M5 12h14"/>
            </svg>
            Nouvelle tâche
          </span>
          <p className="font-serif font-normal leading-tight text-xl">Ajouter une tâche</p>
        </button>
      )}

      {/* Mobile: bouton Nouvelle tâche (ouvre la modale de création) */}
      {!selectMode && (
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="lg:hidden flex flex-col justify-end gap-1.5 w-full rounded-2xl bg-accent text-bg-primary hover:opacity-95 active:scale-[0.99] transition-all text-left p-5 min-h-[88px] mb-6"
        >
          <span className="font-mono text-[11px] tracking-widest uppercase opacity-60 flex items-center gap-1.5">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 5v14"/><path d="M5 12h14"/>
            </svg>
            Nouvelle tâche
          </span>
          <p className="font-serif font-normal leading-tight text-xl">Ajouter une tâche</p>
        </button>
      )}

      {/* Filters */}
      {(() => {
        const toggleStatus = (s: LocalTask['status']) => setStatusFilter((prev) => {
          const next = new Set(prev); next.has(s) ? next.delete(s) : next.add(s); return next;
        });
        const togglePriority = (p: 'HIGH' | 'MEDIUM' | 'LOW' | '__none__') => setPriorityFilter((prev) => {
          const next = new Set(prev); next.has(p) ? next.delete(p) : next.add(p); return next;
        });
        const toggleType = (t: string) => setTypeFilter((prev) => {
          const next = new Set(prev); next.has(t) ? next.delete(t) : next.add(t); return next;
        });

        const allStatusOptions: { value: LocalTask['status']; label: string; count: number }[] = [
          { value: 'OPEN',        label: 'Ouvert',    count: statusCounts.OPEN ?? 0 },
          { value: 'SCHEDULED',   label: 'Planifié',  count: statusCounts.SCHEDULED ?? 0 },
          { value: 'IN_PROGRESS', label: 'En cours',  count: statusCounts.IN_PROGRESS ?? 0 },
          { value: 'LOCAL_DONE',  label: 'Local',     count: statusCounts.LOCAL_DONE ?? 0 },
          { value: 'TO_TEST',     label: 'Test',      count: statusCounts.TO_TEST ?? 0 },
          { value: 'DEPLOYED',    label: 'Déployé',   count: statusCounts.DEPLOYED ?? 0 },
          { value: 'DONE',        label: 'Fait',      count: statusCounts.DONE ?? 0 },
          { value: 'CANCELLED',   label: 'Annulé',    count: statusCounts.CANCELLED ?? 0 },
          // MIGRATED : statut hérité (import). Listé pour rester filtrable/trouvable,
          // mais masqué tant qu'aucune tâche ne le porte (cf. BUG-05).
          { value: 'MIGRATED',    label: 'Migré',     count: statusCounts.MIGRATED ?? 0 },
        ];
        const statusOptions = allStatusOptions.filter(({ count }) => count > 0);

        const priorityOptions: { value: 'HIGH' | 'MEDIUM' | 'LOW' | '__none__'; label: string }[] = [
          { value: 'HIGH',     label: '↑ Haute' },
          { value: 'MEDIUM',   label: '→ Moy.' },
          { value: 'LOW',      label: '↓ Basse' },
          { value: '__none__', label: 'Aucune' },
        ];

        const typeOptions: { value: string; label: string }[] = [
          ...existingTypes.map((t) => ({ value: t, label: t })),
          { value: '__none__', label: 'Sans type' },
        ];

        const hasAnyFilter = statusFilter.size > 0 || priorityFilter.size > 0 || typeFilter.size > 0 || categoryFilter.size > 0 || creatorFilter.size > 0;
        const activeFilterCount = statusFilter.size + priorityFilter.size + typeFilter.size + categoryFilter.size + creatorFilter.size + (hideCompleted ? 1 : 0);

        const categoryOptions: { value: string; label: string }[] = [
          ...existingCategories.map((c) => ({ value: c, label: c })),
          { value: '__none__', label: 'Sans catégorie' },
        ];

        return (
          // Sticky : la barre de recherche + filtres reste visible pendant le
          // scroll. Positionnée juste sous le PageHeader (qui expose
          // `--page-header-h` via ResizeObserver).
          <div className="sticky top-[var(--page-header-h,80px)] z-[10] bg-bg-elevated rounded-2xl shadow-soft mb-4">

            {/* Ligne 1 : recherche + tri (tri inline sur lg, dessous sur mobile) */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-3 pt-2.5 pb-3 lg:pb-2">
              {/* Recherche + icônes actions */}
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted/50 shrink-0">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  placeholder="Chercher…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 min-w-0 bg-transparent text-sm text-text-primary placeholder:text-text-muted/55 outline-none"
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery('')} className="text-text-muted/55 hover:text-text-muted text-xs shrink-0">✕</button>
                )}
                {/* Bouton sélection — même style que Timeline */}
                <button
                  type="button"
                  title={selectMode ? 'Annuler la sélection' : 'Sélectionner des tâches'}
                  onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}
                  className={`flex items-center justify-center w-8 h-8 rounded-xl transition-colors shrink-0 ${selectMode ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-primary'}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="5" height="5" rx="1"/><rect x="3" y="10" width="5" height="5" rx="1"/>
                    <rect x="3" y="17" width="5" height="5" rx="1"/><line x1="12" y1="5.5" x2="21" y2="5.5"/>
                    <line x1="12" y1="12.5" x2="21" y2="12.5"/><line x1="12" y1="19.5" x2="21" y2="19.5"/>
                  </svg>
                </button>
                {/* Bouton catégories */}
                <button
                  type="button"
                  title="Gérer les catégories"
                  onClick={() => setShowCatPanel((v) => !v)}
                  className={`flex items-center justify-center w-8 h-8 rounded-xl transition-colors shrink-0 ${showCatPanel ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-primary'}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5"/><path d="M15.5 2.5a2.121 2.121 0 013 3L12 12l-4 1 1-4 6.5-6.5z"/>
                  </svg>
                </button>
              </div>
              {/* Tri — passe à la ligne sur mobile */}
              <div className="flex items-center gap-1 w-full lg:w-auto">
                {sortButtons.map(({ value, label, icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSortBy((prev) => prev === value ? 'manual' : value)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                      sortBy === value
                        ? 'bg-accent/15 text-accent border-accent/30'
                        : 'border-text-muted/15 text-text-muted hover:text-text-primary hover:border-text-muted/30'
                    }`}
                  >
                    {icon}{label}
                  </button>
                ))}
                {sortBy !== 'manual' && (
                  <button
                    type="button"
                    onClick={() => setSortBy('manual')}
                    className="px-2.5 py-1 rounded-full text-xs font-medium border border-text-muted/15 text-text-muted/60 hover:text-text-muted transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Séparateur */}
            <div className="h-px bg-text-muted/[0.12]" />
            {/* Repli mobile de la barre de filtres (TASK-06) — toujours dépliée sur desktop. */}
            <button
              type="button"
              onClick={toggleFilters}
              aria-expanded={!filtersCollapsed}
              className="lg:hidden w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium text-text-muted/80"
            >
              <span className="flex items-center gap-1.5">
                Filtres
                {activeFilterCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-accent/15 text-accent text-[11px] font-semibold">{activeFilterCount}</span>
                )}
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${filtersCollapsed ? '' : 'rotate-180'}`}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            <div className={`flex-wrap items-center gap-2 px-3 pb-2.5 lg:pt-2.5 ${filtersCollapsed ? 'hidden' : 'flex'} lg:flex`}>
              <MultiSelectDropdown
                label="Statut"
                options={statusOptions}
                selected={statusFilter}
                onToggle={toggleStatus}
                onClear={() => setStatusFilter(new Set())}
              />
              <MultiSelectDropdown
                label="Priorité"
                options={priorityOptions}
                selected={priorityFilter}
                onToggle={togglePriority}
                onClear={() => setPriorityFilter(new Set())}
              />
              {existingCategories.length > 0 && (
                <MultiSelectDropdown
                  label="Catégorie"
                  options={categoryOptions}
                  selected={categoryFilter}
                  onToggle={(c) => setCategoryFilter((prev) => { const next = new Set(prev); next.has(c) ? next.delete(c) : next.add(c); return next; })}
                  onClear={() => setCategoryFilter(new Set())}
                />
              )}
              {existingTypes.length > 0 && (
                <MultiSelectDropdown
                  label="Type"
                  options={typeOptions}
                  selected={typeFilter}
                  onToggle={toggleType}
                  onClear={() => setTypeFilter(new Set())}
                />
              )}
              <MultiSelectDropdown
                label="Auteur"
                options={[
                  { value: 'mine', label: 'Mes tâches' },
                  { value: 'confident', label: 'Confident' },
                ]}
                selected={creatorFilter}
                onToggle={(v) => setCreatorFilter((prev) => { const next = new Set(prev); next.has(v) ? next.delete(v) : next.add(v); return next; })}
                onClear={() => setCreatorFilter(new Set())}
              />
              <button onClick={() => setHideCompleted((v) => !v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${hideCompleted ? 'bg-text-muted/15 text-text-primary border-text-muted/20' : 'border-text-muted/15 text-text-muted hover:text-text-primary'}`}
              >
                {hideCompleted ? '✓ Terminées masquées' : 'Masquer terminées'}
              </button>
              {hasAnyFilter && (
                <button type="button"
                  onClick={() => { setStatusFilter(new Set()); setPriorityFilter(new Set()); setTypeFilter(new Set()); setCategoryFilter(new Set()); setCreatorFilter(new Set()); }}
                  className="text-xs text-text-muted/50 hover:text-text-muted transition-colors"
                >
                  ✕ Réinitialiser
                </button>
              )}
            </div>

          </div>
        );
      })()}

      {/* Panel catégories — inline sous les filtres */}
      {showCatPanel && (
        <CategoryPanel
          allTasks={allTasks}
          categoryOrder={taskPrefs.categoryOrder}
          onClose={() => setShowCatPanel(false)}
          onSave={(newOrder) => { updateTaskPrefs({ categoryOrder: newOrder }); setShowCatPanel(false); }}
        />
      )}

      {/* Bulk select bar */}
      {selectMode && (
        <div className="bg-bg-elevated rounded-2xl shadow-soft mb-4 overflow-visible">
          {/* Ligne info + fermer */}
          <div className="flex items-center gap-2 px-4 pt-3 pb-2">
            <span className="text-sm font-medium text-text-primary">
              {selectedIds.size > 0 ? `${selectedIds.size} sélectionnée${selectedIds.size > 1 ? 's' : ''}` : 'Aucune sélection'}
            </span>
            <button onClick={selectAll} className="text-xs text-accent hover:underline shrink-0">
              Tout sélectionner
            </button>
            <div className="flex-1" />
            <button onClick={exitSelectMode} className="text-text-muted/50 hover:text-text-muted transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          {/* Actions */}
          {selectedIds.size > 0 && (
            <>
              <div className="h-px bg-text-muted/[0.12]" />
              <div className="flex flex-wrap gap-2 px-3 py-2.5">

                {/* Statut */}
                <BulkDropdown label="Statut" open={bulkDropdown === 'status'} onToggle={() => setBulkDropdown((v) => v === 'status' ? null : 'status')}>
                  {(Object.keys(STATUS_LABELS) as LocalTask['status'][]).filter(s => s !== 'MIGRATED').map(s => (
                    <button key={s} type="button" onClick={() => bulkApplyStatus(s)}
                      className="w-full text-left px-3 py-2 text-xs text-text-primary hover:bg-accent/10 transition-colors flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLORS[s] }} />
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </BulkDropdown>

                {/* Priorité */}
                <BulkDropdown label="Priorité" open={bulkDropdown === 'priority'} onToggle={() => setBulkDropdown((v) => v === 'priority' ? null : 'priority')}>
                  {([['HIGH','↑ Haute'], ['MEDIUM','→ Moy.'], ['LOW','↓ Basse'], [null,'Aucune']] as [LocalTask['priority'], string][]).map(([p, label]) => (
                    <button key={String(p)} type="button" onClick={() => bulkApplyPriority(p)}
                      className="w-full text-left px-3 py-2 text-xs text-text-primary hover:bg-accent/10 transition-colors flex items-center gap-2">
                      {p && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PRIORITY_COLOR[p] }} />}
                      {!p && <span className="w-2 h-2 rounded-full shrink-0 border border-text-muted/30" />}
                      {label}
                    </button>
                  ))}
                </BulkDropdown>

                {/* Catégorie */}
                {existingCategories.length > 0 && (
                  <BulkDropdown label="Catégorie" open={bulkDropdown === 'category'} onToggle={() => setBulkDropdown((v) => v === 'category' ? null : 'category')}>
                    {existingCategories.map((c) => (
                      <button key={c} type="button" onClick={() => bulkApplyCategory(c)}
                        className="w-full text-left px-3 py-2 text-xs text-text-primary hover:bg-accent/10 transition-colors">{c}</button>
                    ))}
                    <button type="button" onClick={() => bulkApplyCategory(null)}
                      className="w-full text-left px-3 py-2 text-xs text-text-muted hover:bg-accent/10 transition-colors">Sans catégorie</button>
                  </BulkDropdown>
                )}

                {/* Type */}
                {existingTypes.length > 0 && (
                  <BulkDropdown label="Type" open={bulkDropdown === 'type'} onToggle={() => setBulkDropdown((v) => v === 'type' ? null : 'type')}>
                    {existingTypes.map((t) => (
                      <button key={t} type="button" onClick={() => bulkApplyType(t)}
                        className="w-full text-left px-3 py-2 text-xs text-text-primary hover:bg-accent/10 transition-colors">{t}</button>
                    ))}
                    <button type="button" onClick={() => bulkApplyType(null)}
                      className="w-full text-left px-3 py-2 text-xs text-text-muted hover:bg-accent/10 transition-colors">Sans type</button>
                  </BulkDropdown>
                )}

                <div className="flex-1" />

                {/* Supprimer — 2 clics requis */}
                <button
                  type="button"
                  onClick={bulkDelete}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    bulkDeleteConfirm
                      ? 'bg-danger text-white border-danger scale-105'
                      : 'border-danger/30 text-danger hover:bg-danger/10'
                  }`}
                >
                  <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/>
                  </svg>
                  {bulkDeleteConfirm ? `Confirmer (${selectedIds.size})` : 'Supprimer'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Task list grouped by category */}
      {tasksLoading && filtered.length === 0 ? (
        <TaskListSkeleton />
      ) : filtered.length === 0 ? (
        <p className="text-text-muted font-serif italic">Aucune tâche.</p>
      ) : (
        <div className="space-y-6">
          {categories.map((cat) => {
            const tasks = byCategory(cat);
            if (tasks.length === 0) return null;
            return (
              <div
                key={cat}
                onDragOver={(e) => { e.preventDefault(); if (dragCatRef.current && dragCatRef.current !== cat) setDragOverCat(cat); }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragCatRef.current && cat) {
                    reorderCategory(dragCatRef.current, cat);
                  }
                  setDragOverCat(null);
                  dragCatRef.current = null;
                }}
                className={`transition-all ${dragOverCat === cat ? 'ring-1 ring-accent/30 rounded-2xl' : ''}`}
              >
                {cat && (
                  <div
                    draggable
                    onDragStart={() => { dragCatRef.current = cat; }}
                    onDragEnd={() => { setDragOverCat(null); dragCatRef.current = null; }}
                    className="flex items-center gap-1.5 mb-2 group/cat cursor-grab active:cursor-grabbing"
                  >
                    <span className="opacity-0 group-hover/cat:opacity-30 text-text-muted text-xs select-none transition-opacity">⠿</span>
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-text-muted">{cat}</h3>
                    <span className="font-mono text-[11px] text-text-muted/55">{tasks.length}</span>
                  </div>
                )}
                <div className="bg-bg-elevated rounded-2xl px-5 shadow-soft">
                  {tasks.map((task, i) => (
                    <div key={task.id}>
                      {i > 0 && <div className="border-t border-text-muted/10" />}
                      <TaskRow
                        task={task}
                        userId={user?.id ?? ''}
                        onEdit={handleEditTask}
                        selectMode={selectMode}
                        selected={selectedIds.has(task.id)}
                        onToggleSelect={toggleSelect}
                        dragOver={dragOverId === task.id}
                        draggable={sortBy === 'manual'}
                        onDragStart={(id) => { dragIdRef.current = id; }}
                        onDragOver={(id) => setDragOverId(id)}
                        onDrop={async (targetId) => {
                          if (dragIdRef.current) await reorderTask(dragIdRef.current, targetId);
                          setDragOverId(null);
                          dragIdRef.current = null;
                        }}
                        onDragEnd={() => { setDragOverId(null); dragIdRef.current = null; }}
                        onMoveUp={sortBy === 'manual' && i > 0 ? () => { void reorderTask(task.id, tasks[i - 1]!.id); } : undefined}
                        onMoveDown={sortBy === 'manual' && i < tasks.length - 1 ? () => { void reorderTask(tasks[i + 1]!.id, task.id); } : undefined}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      </div>

      {/* Dev seed button — dev only */}
      {import.meta.env.DEV && (
        <div className="px-6 pb-4">
          <button
            type="button"
            onClick={async () => {
              const guests = await fetch('/trpc/guests.list', { credentials: 'include' })
                .then(r => r.json()).catch(() => ({ result: { data: [] } }));
              const confidentId = guests?.result?.data?.[0]?.id ?? undefined;
              const count = await seedTasks(user?.id ?? '', confidentId);
              await notifyDialog({
                title: 'Tâches de test injectées',
                message: `${count} tâche${count > 1 ? 's' : ''}${confidentId ? ' (dont certaines par le confident)' : ''}.`,
                tone: 'success',
              });
            }}
            className="w-full py-2 rounded-xl text-xs font-mono text-text-muted/50 border border-dashed border-text-muted/20 hover:border-accent/30 hover:text-accent transition-colors"
          >
            ⚙ DEV — Injecter 40 tâches de test
          </button>
        </div>
      )}

      <BackToTop panelOpen={desktopPanel !== 'idle'} />
      <BottomNav />
      </div>{/* ── fin colonne gauche ── */}

      {/* ── Panneau droit desktop ───────────────────────────────────────── */}
      {desktopPanel !== 'idle' && (
        <div data-right-panel className="hidden lg:flex lg:flex-col lg:flex-1 lg:sticky lg:top-0 lg:self-start lg:h-dvh lg:border-l lg:border-text-muted/10 lg:overflow-hidden">
          <TaskDetailPanel
            key={desktopPanel === 'create' ? '__create__' : (desktopPanel as { task: LocalTask }).task.id}
            mode={desktopPanel === 'create' ? 'create' : 'edit'}
            task={desktopPanel === 'create' ? null : (desktopPanel as { task: LocalTask }).task}
            userId={user?.id ?? ''}
            existingCategories={existingCategories}
            onClose={() => setDesktopPanel('idle')}
            onSaved={() => setDesktopPanel('idle')}
          />
        </div>
      )}
      {/* Pas de placeholder quand rien n'est sélectionné : la colonne gauche
          prend toute la largeur, comme dans le Journal. */}

      {/* Modales (mobile create + edit + gérer catégories) */}
      {showCreateModal && (
        <CreateTaskModal
          userId={user?.id ?? ''}
          existingCategories={existingCategories}
          onClose={() => setShowCreateModal(false)}
          onSaved={() => setShowCreateModal(false)}
        />
      )}
      {editingTask && (
        <EditTaskModal
          task={editingTask}
          userId={user?.id ?? ''}
          existingCategories={existingCategories}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}

// ── Guest tasks view (read-only list from server) ───────────────────────────

type GuestTask = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  notes: string | null;
  category: string | null;
  taskType: string | null;
  priority: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  sortOrder: number | null;
  createdBy: string | null;
  createdAt: string;
  deletedAt: string | null;
};

// ── Guest task detail panel (desktop) ───────────────────────────────────────

function GuestTaskDetailPanel({ mode, task, userId, existingCategories, onClose, onSaved }: {
  mode: 'create' | 'edit';
  task: GuestTask | null;
  userId: string;
  existingCategories: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [status, setStatus] = useState<LocalTask['status']>((task?.status as LocalTask['status']) ?? 'OPEN');
  const [dueDate, setDueDate] = useState(task?.dueDate ? task.dueDate.slice(0, 10) : '');
  const [category, setCategory] = useState(task?.category ?? '');
  const [taskType, setTaskType] = useState(task?.taskType ?? '');
  const [priority, setPriority] = useState<LocalTask['priority']>((task?.priority as LocalTask['priority']) ?? null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  const canEdit = mode === 'create' || !task || task.createdBy === userId || task.createdBy === null;

  const createMutation = trpc.tasks.create.useMutation({ onSuccess: onSaved });
  const updateMutation = trpc.tasks.update.useMutation({ onSuccess: onSaved });

  const save = async () => {
    if (!title.trim()) return;
    if (mode === 'create') {
      await createMutation.mutateAsync({
        title: title.trim(),
        notes: notes.trim() || undefined,
        status,
        dueDate: dueDate || undefined,
        category: category.trim() || undefined,
        taskType: taskType.trim() || undefined,
        priority: priority ?? undefined,
      });
    } else if (task) {
      await updateMutation.mutateAsync({
        id: task.id,
        title: canEdit ? title.trim() : undefined,
        notes: canEdit ? (notes.trim() || null) : undefined,
        status,
        dueDate: dueDate || null,
        category: canEdit ? (category.trim() || null) : undefined,
        taskType: canEdit ? (taskType.trim() || null) : undefined,
        priority: canEdit ? (priority ?? null) : undefined,
        completedAt: status === 'DONE' ? new Date().toISOString() : null,
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <div className="shrink-0 flex items-center gap-3 px-6 pt-6 pb-4 border-b border-text-muted/10">
        <p className="flex-1 font-mono text-[11px] uppercase tracking-widest text-text-muted/50">
          {mode === 'create' ? 'Nouvelle tâche' : 'Modifier'}
        </p>
        {task && <StatusBadge status={task.status as LocalTask['status']} />}
        <button type="button" onClick={onClose} className="text-text-muted/55 hover:text-text-muted transition-colors shrink-0" aria-label="Fermer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-soft">
        <div className="px-6 pt-6 pb-4 flex flex-col gap-6">
          {/* Titre */}
          {canEdit ? (
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre…"
              className="w-full bg-transparent text-xl font-medium text-text-primary placeholder:text-text-muted/25 outline-none border-b border-text-muted/10 pb-3 focus:border-accent/30 transition-colors"
            />
          ) : (
            <p className="text-xl font-medium text-text-primary border-b border-text-muted/10 pb-3">{title}</p>
          )}

          {/* Notes */}
          {canEdit ? (
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes…"
              rows={5}
              className="w-full bg-transparent text-sm leading-relaxed text-text-primary placeholder:text-text-muted/25 outline-none resize-none transition-colors hide-scrollbar"
            />
          ) : notes ? (
            <p className="text-sm leading-relaxed text-text-primary/80 whitespace-pre-wrap">{notes}</p>
          ) : null}

          <div className="bg-bg-elevated border border-text-muted/10 rounded-2xl p-4 flex flex-col gap-4">
            {/* Statut */}
            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted/50 mb-2">Statut</p>
              <div className="flex flex-wrap gap-1.5">
                {([
                  ['OPEN',        'var(--color-accent)'],
                  ['SCHEDULED',   '#6b7280'],
                  ['IN_PROGRESS', '#D06010'],
                  ['LOCAL_DONE',  '#1890A0'],
                  ['DEPLOYED',    'var(--color-accent)'],
                  ['TO_TEST',     '#8B5FA8'],
                  ['DONE',        '#357528'],
                  ['CANCELLED',   '#E03355'],
                ] as [LocalTask['status'], string][]).map(([s, color]) => canEdit ? (
                  <button key={s} type="button" onClick={() => setStatus(s)} aria-pressed={status === s}
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${status === s ? 'opacity-100 ring-2 ring-current' : 'opacity-55 hover:opacity-80'}`}
                    style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color, borderColor: `color-mix(in srgb, ${color} 35%, transparent)` }}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ) : status === s ? (
                  <span key={s}
                    className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border"
                    style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color, borderColor: `color-mix(in srgb, ${color} 35%, transparent)` }}
                  >
                    {STATUS_LABELS[s]}
                  </span>
                ) : null)}
              </div>
            </div>

            {canEdit && (
              <>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted/50 mb-2">Priorité</p>
                  <div className="flex flex-wrap gap-1.5">
                    {([
                      [null,     'var(--color-accent)', 'Aucune'],
                      ['HIGH',   '#E03355',              '↑ Haute'],
                      ['MEDIUM', '#D06010',              '→ Moy.'],
                      ['LOW',    'var(--color-accent)',  '↓ Basse'],
                    ] as [LocalTask['priority'], string, string][]).map(([p, color, label]) => (
                      <button key={p ?? 'none'} type="button" onClick={() => setPriority(p)} aria-pressed={priority === p}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${priority === p ? 'opacity-100 ring-2 ring-current' : 'opacity-55 hover:opacity-80'}`}
                        style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color, borderColor: `color-mix(in srgb, ${color} 35%, transparent)` }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted/50 mb-1.5">Catégorie</p>
                    <ComboDropdown value={category} onChange={setCategory} options={existingCategories} placeholder="Perso, Travail…" />
                  </div>
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted/50 mb-1.5">Type</p>
                    <ComboDropdown value={taskType} onChange={setTaskType} options={TASK_TYPES} placeholder="Feature, Bug fix…" />
                  </div>
                </div>
              </>
            )}

            {/* Métadonnées read-only (propriétaire) */}
            {!canEdit && (task?.priority || task?.category || task?.taskType) && (
              <div className="flex flex-wrap gap-1.5">
                {task?.priority && <PriorityBadge priority={task.priority as 'HIGH' | 'MEDIUM' | 'LOW'} />}
                {task?.category && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-text-muted/8 text-text-muted/70 border border-text-muted/15">
                    {task.category}
                  </span>
                )}
                {task?.taskType && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-text-muted/8 text-text-muted/70 border border-text-muted/15">
                    {task.taskType}
                  </span>
                )}
              </div>
            )}

            {/* Échéance */}
            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted/50 mb-1.5">Échéance</p>
              {canEdit ? (
                <DatePicker value={dueDate} onChange={setDueDate} placeholder="Choisir une date…" />
              ) : dueDate ? (
                <p className="text-sm text-text-primary/80 px-1">
                  {new Date(dueDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              ) : (
                <p className="text-sm text-text-muted/55 px-1 italic">Aucune</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 flex gap-3 px-6 py-4 border-t border-text-muted/10 bg-bg-elevated">
        {canEdit ? (
          <>
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm text-text-muted/70 font-medium border border-text-muted/15 hover:border-text-muted/30 hover:text-text-primary transition-colors">
              Annuler
            </button>
            <button type="button" onClick={() => void save()} disabled={!title.trim() || isPending} className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-medium disabled:opacity-40 transition-opacity">
              {mode === 'create' ? 'Créer' : 'Enregistrer'}
            </button>
          </>
        ) : (
          <button type="button" onClick={onClose} className="w-full py-2.5 rounded-xl text-sm text-text-muted/70 font-medium border border-text-muted/15 hover:border-text-muted/30 hover:text-text-primary transition-colors">
            Fermer
          </button>
        )}
      </div>
    </>
  );
}

function GuestTaskRow({ task, userId, onRefetch, onEdit }: { task: GuestTask; userId: string; onRefetch: () => void; onEdit: (t: GuestTask) => void }) {
  const status = task.status as LocalTask['status'];
  const isDone = COMPLETED_STATUSES.has(status);
  const priorityColor = task.priority ? PRIORITY_COLOR[task.priority as 'HIGH' | 'MEDIUM' | 'LOW'] : null;
  const statusColor = STATUS_COLORS[status] ?? 'var(--color-text-muted)';
  const isOwn = task.createdBy === userId;

  const updateStatus = trpc.tasks.update.useMutation({ onSuccess: () => onRefetch() });

  const toggle = async () => {
    const nextStatus = STATUS_NEXT[status];
    const wasCompleted = COMPLETED_STATUSES.has(status);
    const willBeCompleted = COMPLETED_STATUSES.has(nextStatus);
    if (wasCompleted && !willBeCompleted) {
      const ok = await confirmDialog({
        title: 'Rouvrir cette tâche ?',
        message: `« ${stripSpoilers(task.title)} » est ${STATUS_LABELS[status].toLowerCase()}. La rouvrir la repasse à « ${STATUS_LABELS[nextStatus]} » et efface sa date de complétion.`,
        confirmLabel: 'Rouvrir',
        cancelLabel: 'Annuler',
        tone: 'warning',
      });
      if (!ok) return;
    }
    updateStatus.mutate({
      id: task.id,
      status: nextStatus,
      completedAt: willBeCompleted ? new Date().toISOString() : null,
    });
  };

  return (
    <div className={`relative flex items-start gap-3 px-4 py-3.5 ${isDone ? 'opacity-45' : ''}`}>
      {/* Barre de priorité gauche */}
      {priorityColor && !isDone && (
        <div
          className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
          style={{ backgroundColor: `color-mix(in srgb, ${priorityColor} 60%, transparent)` }}
        />
      )}

      {/* Status dot — interactif uniquement pour ses propres tâches */}
      <button
        type="button"
        onClick={isOwn ? toggle : undefined}
        disabled={!isOwn || updateStatus.isPending}
        title={isOwn ? `Statut : ${STATUS_LABELS[status]} — cliquer pour avancer` : `Statut : ${STATUS_LABELS[status]}`}
        className={`mt-0.5 w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${isOwn ? 'hover:scale-110 cursor-pointer' : 'cursor-default'} disabled:opacity-60`}
        style={{
          backgroundColor: isDone
            ? `color-mix(in srgb, ${statusColor} 60%, transparent)`
            : `color-mix(in srgb, ${statusColor} 15%, transparent)`,
          borderColor: `color-mix(in srgb, ${statusColor} ${isDone ? '80' : '50'}%, transparent)`,
        }}
      >
        {(status === 'DONE' || status === 'LOCAL_DONE') && (
          <svg viewBox="0 0 20 20" fill="white" className="w-3 h-3"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
        )}
        {status === 'CANCELLED' && (
          <svg viewBox="0 0 20 20" fill="white" className="w-3 h-3"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
        )}
        {(status === 'DEPLOYED' || status === 'MIGRATED') && (
          <svg viewBox="0 0 20 20" fill="white" className="w-3 h-3"><path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
        )}
        {status === 'IN_PROGRESS' && (
          <svg viewBox="0 0 20 20" fill="white" className="w-3 h-3"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
        )}
        {status === 'TO_TEST' && (
          <svg viewBox="0 0 20 20" fill="white" className="w-3 h-3"><path fillRule="evenodd" d="M7 2a1 1 0 00-.707 1.707L7 4.414v3.758a1 1 0 01-.293.707l-4 4C1.03 14.561 2.124 17 4.343 17h11.314c2.219 0 3.313-2.44 1.636-4.121l-4-4A1 1 0 0113 8.172V4.414l.707-.707A1 1 0 0013 2H7z" clipRule="evenodd" /></svg>
        )}
        {status === 'SCHEDULED' && (
          <svg viewBox="0 0 20 20" fill="white" className="w-3 h-3"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>
        )}
      </button>

      {/* Contenu — cliquable pour ouvrir le panneau */}
      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={() => onEdit(task)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onEdit(task)}
      >
        <div className="flex items-start gap-2">
          <p className={`flex-1 min-w-0 text-sm font-medium text-text-primary leading-snug hover:text-accent transition-colors ${isDone ? 'line-through opacity-70' : ''}`}>
            {renderSpoilersInReact(task.title, `gt-${task.id}`)}
            {isOwn && (
              <span className="ml-2 text-[11px] font-normal text-text-muted/50 not-italic no-underline">(moi)</span>
            )}
          </p>
          {task.dueDate && (
            <span className="shrink-0 mt-0.5">
              <DueDateBadge dueDate={task.dueDate} status={status} />
            </span>
          )}
        </div>
        {(task.priority || status !== 'OPEN' || task.taskType || task.notes) && (
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {task.priority && <PriorityBadge priority={task.priority as 'HIGH' | 'MEDIUM' | 'LOW'} />}
            {/* Badge d'affichage seulement — l'avancement passe par le dot à gauche. */}
            {status !== 'OPEN' && <StatusBadge status={status} />}
            {task.taskType && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-text-muted/8 text-text-muted/70 border border-text-muted/15">
                {task.taskType}
              </span>
            )}
            {task.notes && (
              <span className="text-[11px] text-text-muted/50 italic truncate max-w-[160px]">
                {renderSpoilersInReact(task.notes, `tnotes-${task.id}`)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Feuille mobile confident (bottom-sheet) ─────────────────────────────────

function GuestMobileSheet({ mode, task, userId, existingCategories, onClose, onSaved }: {
  mode: 'create' | 'edit';
  task: GuestTask | null;
  userId: string;
  existingCategories: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useBackButtonClose(true, onClose);
  const panelRef = useModalA11y<HTMLDivElement>(onClose); // Échap + piège de focus

  return (
    <div
      className="lg:hidden fixed inset-0 z-50 flex items-end justify-center bg-bg-primary/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div ref={panelRef} role="dialog" aria-modal="true" tabIndex={-1} className="w-full max-h-[92dvh] bg-bg-elevated rounded-t-3xl shadow-xl flex flex-col overflow-hidden outline-none">
        <GuestTaskDetailPanel
          mode={mode}
          task={task}
          userId={userId}
          existingCategories={existingCategories}
          onClose={onClose}
          onSaved={onSaved}
        />
      </div>
    </div>
  );
}

// ── Vue principale confident ─────────────────────────────────────────────────

function GuestTasksView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(new Set());
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  const [creatorFilter, setCreatorFilter] = useState<Set<string>>(new Set());
  const [hideCompleted, setHideCompleted] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>('manual');
  const [desktopPanel, setDesktopPanel] = useState<'idle' | 'create' | { task: GuestTask }>('idle');

  const { data: user } = trpc.auth.me.useQuery();
  const { data: tasks = [], refetch, isLoading: tasksLoading, isError: tasksError } = trpc.tasks.list.useQuery();

  const allTasks = (tasks as unknown as GuestTask[]).filter((t) => !t.deletedAt);
  const sorted = applySort(allTasks as unknown as LocalTask[], sortBy) as unknown as GuestTask[];

  const statusCounts: Record<string, number> = {};
  for (const t of allTasks) statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;

  const _today = getTodayString();
  const _searchQ = searchQuery.trim().toLowerCase();

  const filtered = sorted
    .filter((t) => statusFilter.size === 0 || statusFilter.has(t.status as LocalTask['status']))
    .filter((t) => !hideCompleted || !COMPLETED_STATUSES.has(t.status as LocalTask['status']))
    .filter((t) => {
      if (typeFilter.size === 0) return true;
      if (typeFilter.has('__none__') && !t.taskType) return true;
      return !!(t.taskType && typeFilter.has(t.taskType));
    })
    .filter((t) => {
      if (categoryFilter.size === 0) return true;
      if (categoryFilter.has('__none__') && !t.category) return true;
      return !!(t.category && categoryFilter.has(t.category));
    })
    .filter((t) => {
      if (priorityFilter.size === 0) return true;
      if (priorityFilter.has('__none__') && t.priority === null) return true;
      return !!(t.priority && priorityFilter.has(t.priority));
    })
    .filter((t) => {
      if (!_searchQ) return true;
      return t.title.toLowerCase().includes(_searchQ) || (t.notes ?? '').toLowerCase().includes(_searchQ);
    })
    .filter((t) => {
      if (creatorFilter.size === 0) return true;
      const isOwn = t.createdBy === user?.id;
      if (creatorFilter.has('mine') && isOwn) return true;
      if (creatorFilter.has('confident') && !isOwn) return true;
      return false;
    });

  const rawCategories = Array.from(new Set(filtered.map((t) => t.category ?? '')));
  const categories = [
    ...rawCategories.filter((c) => c !== '').sort((a, b) => a.localeCompare(b)),
    ...(rawCategories.includes('') ? [''] : []),
  ];
  const byCategory = (cat: string) => filtered.filter((t) => (t.category ?? '') === cat);

  const existingTypes = Array.from(new Set(allTasks.map((t) => t.taskType).filter((x): x is string => !!x))).sort();
  const existingCategories = Array.from(new Set(allTasks.map((t) => t.category).filter((x): x is string => !!x))).sort();
  const isConfidant = user?.guestAccess === 'CONFIDANT';

  const allStatusOptions: { value: LocalTask['status']; label: string; count: number }[] = [
    { value: 'OPEN',        label: 'Ouvert',    count: statusCounts['OPEN'] ?? 0 },
    { value: 'SCHEDULED',   label: 'Planifié',  count: statusCounts['SCHEDULED'] ?? 0 },
    { value: 'IN_PROGRESS', label: 'En cours',  count: statusCounts['IN_PROGRESS'] ?? 0 },
    { value: 'LOCAL_DONE',  label: 'Local',     count: statusCounts['LOCAL_DONE'] ?? 0 },
    { value: 'TO_TEST',     label: 'Test',      count: statusCounts['TO_TEST'] ?? 0 },
    { value: 'DEPLOYED',    label: 'Déployé',   count: statusCounts['DEPLOYED'] ?? 0 },
    { value: 'DONE',        label: 'Fait',      count: statusCounts['DONE'] ?? 0 },
    { value: 'CANCELLED',   label: 'Annulé',    count: statusCounts['CANCELLED'] ?? 0 },
  ];
  const statusOptions = allStatusOptions.filter(({ count }) => count > 0);
  const priorityOptions: { value: 'HIGH' | 'MEDIUM' | 'LOW' | '__none__'; label: string }[] = [
    { value: 'HIGH', label: '↑ Haute' }, { value: 'MEDIUM', label: '→ Moy.' },
    { value: 'LOW', label: '↓ Basse' }, { value: '__none__', label: 'Aucune' },
  ];
  const typeOptions = [...existingTypes.map((t) => ({ value: t, label: t })), { value: '__none__', label: 'Sans type' }];
  const categoryOptions = [...existingCategories.map((c) => ({ value: c, label: c })), { value: '__none__', label: 'Sans catégorie' }];
  const hasAnyFilter = statusFilter.size > 0 || priorityFilter.size > 0 || typeFilter.size > 0 || categoryFilter.size > 0 || creatorFilter.size > 0;

  const sortButtons: { value: SortBy; label: string; icon: React.ReactNode }[] = [
    { value: 'priority',  label: 'Priorité', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg> },
    { value: 'dueDate',   label: 'Échéance', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
    { value: 'createdAt', label: 'Récent',   icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
    { value: 'status',    label: 'Statut',   icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> },
  ];

  return (
    // Layout deux colonnes desktop : chaque colonne scrolle indépendamment
    // (au lieu de scroller toute la page). Le wrapper externe est `lg:h-screen
    // lg:overflow-hidden` ; la colonne de gauche prend ce h-screen et scrolle
    // en interne via `lg:overflow-y-auto`. La colonne de droite reste sticky/dvh.
    <div className="min-h-dvh pb-48 sm:pb-56 max-w-2xl mx-auto [overflow-x:clip] lg:max-w-none lg:px-0 lg:pb-0 lg:flex lg:items-start lg:h-screen lg:overflow-hidden">
      <div className={`lg:px-12 lg:pb-16 lg:h-full lg:overflow-y-auto lg:overflow-x-hidden lg:min-w-0 hide-scrollbar ${desktopPanel !== 'idle' ? 'lg:w-[560px] lg:shrink-0' : 'lg:flex-1'}`}>
      <PageHeader
        title="Tâches"
        kicker={(() => {
          const active = allTasks.filter((t) => !COMPLETED_STATUSES.has(t.status as LocalTask['status'])).length;
          return active > 0 ? `${active} tâche${active > 1 ? 's' : ''} en cours` : 'Tâches';
        })()}
        backTo="/"
      />
      <div className="space-y-4 px-6">

        {/* Carte de création — desktop (ouvre panneau droit) */}
        {isConfidant && (
          <button
            type="button"
            onClick={() => setDesktopPanel('create')}
            className="hidden lg:flex flex-col justify-end gap-1.5 w-full rounded-2xl bg-accent text-bg-primary hover:opacity-95 active:scale-[0.99] transition-all text-left p-5 min-h-[88px]"
          >
            <span className="font-mono text-[11px] tracking-widest uppercase opacity-60 flex items-center gap-1.5">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 5v14"/><path d="M5 12h14"/>
              </svg>
              Nouvelle tâche
            </span>
            <p className="font-serif font-normal leading-tight text-xl">Ajouter une tâche</p>
          </button>
        )}

        {/* Carte de création — mobile (ouvre la sheet) */}
        {isConfidant && (
          <button
            type="button"
            onClick={() => setDesktopPanel('create')}
            className="lg:hidden flex flex-col justify-end gap-1.5 w-full rounded-2xl bg-accent text-bg-primary hover:opacity-95 active:scale-[0.99] transition-all text-left p-5 min-h-[88px]"
          >
            <span className="font-mono text-[11px] tracking-widest uppercase opacity-60 flex items-center gap-1.5">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 5v14"/><path d="M5 12h14"/>
              </svg>
              Nouvelle tâche
            </span>
            <p className="font-serif font-normal leading-tight text-xl">Ajouter une tâche</p>
          </button>
        )}


        {/* Bloc filtres — sticky pour rester visible pendant le scroll */}
        {allTasks.length > 0 && (
          <div className="sticky top-[var(--page-header-h,80px)] z-[10] bg-bg-elevated rounded-2xl shadow-soft">
            {/* Recherche + Tri */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-3 pt-2.5 pb-3">
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted/50 shrink-0">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Chercher…"
                  className="flex-1 min-w-0 bg-transparent text-sm text-text-primary placeholder:text-text-muted/55 outline-none"
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery('')} className="text-text-muted/55 hover:text-text-muted transition-colors text-xs shrink-0">✕</button>
                )}
              </div>
            </div>

            {/* Tri */}
            <div className="flex flex-wrap gap-1.5 px-3 pb-2.5">
              {sortButtons.map(({ value, label, icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSortBy((prev) => prev === value ? 'manual' : value)}
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                    sortBy === value ? 'bg-accent/15 text-accent border-accent/30' : 'border-text-muted/15 text-text-muted hover:text-text-primary hover:border-text-muted/30'
                  }`}
                >
                  {icon}{label}
                </button>
              ))}
              {sortBy !== 'manual' && (
                <button type="button" onClick={() => setSortBy('manual')} className="px-3 py-1 rounded-full text-xs font-medium border border-text-muted/15 text-text-muted/60 hover:text-text-muted transition-colors">✕ Manuel</button>
              )}
            </div>

            {/* Filtres */}
            <div className="flex flex-wrap gap-2 px-3 pb-2.5">
              <MultiSelectDropdown label="Statut" options={statusOptions} selected={statusFilter}
                onToggle={(s) => setStatusFilter((prev) => { const n = new Set(prev); n.has(s as LocalTask['status']) ? n.delete(s as LocalTask['status']) : n.add(s as LocalTask['status']); return n; })}
                onClear={() => setStatusFilter(new Set())}
              />
              <MultiSelectDropdown label="Priorité" options={priorityOptions} selected={priorityFilter}
                onToggle={(p) => setPriorityFilter((prev) => { const n = new Set(prev); n.has(p as 'HIGH'|'MEDIUM'|'LOW'|'__none__') ? n.delete(p as 'HIGH'|'MEDIUM'|'LOW'|'__none__') : n.add(p as 'HIGH'|'MEDIUM'|'LOW'|'__none__'); return n; })}
                onClear={() => setPriorityFilter(new Set())}
              />
              {existingCategories.length > 0 && (
                <MultiSelectDropdown label="Catégorie" options={categoryOptions} selected={categoryFilter}
                  onToggle={(c) => setCategoryFilter((prev) => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; })}
                  onClear={() => setCategoryFilter(new Set())}
                />
              )}
              {existingTypes.length > 0 && (
                <MultiSelectDropdown label="Type" options={typeOptions} selected={typeFilter}
                  onToggle={(t) => setTypeFilter((prev) => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; })}
                  onClear={() => setTypeFilter(new Set())}
                />
              )}
              <MultiSelectDropdown
                label="Auteur"
                options={[{ value: 'mine', label: 'Mes tâches' }, { value: 'confident', label: 'Propriétaire' }]}
                selected={creatorFilter}
                onToggle={(v) => setCreatorFilter((prev) => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n; })}
                onClear={() => setCreatorFilter(new Set())}
              />
              <button
                onClick={() => setHideCompleted((v) => !v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${hideCompleted ? 'bg-text-muted/15 text-text-primary border-text-muted/20' : 'border-text-muted/15 text-text-muted hover:text-text-primary'}`}
              >
                {hideCompleted ? '✓ Terminées masquées' : 'Masquer terminées'}
              </button>
              {hasAnyFilter && (
                <button type="button"
                  onClick={() => { setStatusFilter(new Set()); setPriorityFilter(new Set()); setTypeFilter(new Set()); setCategoryFilter(new Set()); setCreatorFilter(new Set()); }}
                  className="text-xs text-text-muted/50 hover:text-text-muted transition-colors"
                >
                  ✕ Réinitialiser
                </button>
              )}
            </div>
          </div>
        )}

        {/* Liste */}
        {tasksLoading ? (
          <TaskListSkeleton />
        ) : tasksError ? (
          <div className="rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm text-danger">Impossible de charger les tâches.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="shrink-0 text-sm font-medium text-danger underline hover:opacity-80 transition-opacity tap"
            >
              Réessayer
            </button>
          </div>
        ) : allTasks.length === 0 ? (
          <p className="text-text-muted font-serif italic">Aucune tâche pour l'instant.</p>
        ) : filtered.length === 0 ? (
          <p className="text-text-muted font-serif italic">Aucune tâche.</p>
        ) : (
          <div className="space-y-6">
            {categories.map((cat) => {
              const catTasks = byCategory(cat);
              if (catTasks.length === 0) return null;
              return (
                <div key={cat}>
                  {cat && (
                    <div className="flex items-center gap-1.5 mb-2">
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-text-muted">{cat}</h3>
                      <span className="font-mono text-[11px] text-text-muted/55">{catTasks.length}</span>
                    </div>
                  )}
                  <div className="bg-bg-elevated rounded-2xl shadow-soft overflow-hidden px-5">
                    {catTasks.map((task, i) => (
                      <div key={task.id}>
                        {i > 0 && <div className="border-t border-text-muted/10" />}
                        <GuestTaskRow task={task} userId={user?.id ?? ''} onRefetch={refetch} onEdit={(t) => setDesktopPanel({ task: t })} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
      <BackToTop />
      <GuestBottomNav />
      </div>{/* ── fin colonne gauche ── */}

      {/* ── Feuille mobile ──────────────────────────────────────────────── */}
      {desktopPanel !== 'idle' && (
        <GuestMobileSheet
          key={desktopPanel === 'create' ? '__create__' : (desktopPanel as { task: GuestTask }).task.id}
          mode={desktopPanel === 'create' ? 'create' : 'edit'}
          task={desktopPanel === 'create' ? null : (desktopPanel as { task: GuestTask }).task}
          userId={user?.id ?? ''}
          existingCategories={existingCategories}
          onClose={() => setDesktopPanel('idle')}
          onSaved={() => { void refetch(); setDesktopPanel('idle'); }}
        />
      )}

      {/* ── Panneau droit desktop ───────────────────────────────────────── */}
      {desktopPanel !== 'idle' && (
        <div data-right-panel className="hidden lg:flex lg:flex-col lg:flex-1 lg:sticky lg:top-0 lg:self-start lg:h-dvh lg:border-l lg:border-text-muted/10 lg:overflow-hidden">
          <GuestTaskDetailPanel
            key={desktopPanel === 'create' ? '__create__' : (desktopPanel as { task: GuestTask }).task.id}
            mode={desktopPanel === 'create' ? 'create' : 'edit'}
            task={desktopPanel === 'create' ? null : (desktopPanel as { task: GuestTask }).task}
            userId={user?.id ?? ''}
            existingCategories={existingCategories}
            onClose={() => setDesktopPanel('idle')}
            onSaved={() => { void refetch(); setDesktopPanel('idle'); }}
          />
        </div>
      )}
      {/* Pas de placeholder quand rien n'est sélectionné : la colonne gauche
          prend toute la largeur, comme dans le Journal. */}
    </div>
  );
}
