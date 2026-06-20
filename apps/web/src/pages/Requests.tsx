import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { trpc } from '../lib/trpc';
import { db, type LocalEntry } from '../lib/db/schema';
import { resolveNoteTypeConfig } from '../components/NoteTypePicker';
import { useNoteTypeDefs } from '../lib/useNoteTypeDefs';
import { BottomNav, GuestBottomNav } from '../components/BottomNav';
import { BackToTop } from '../components/BackToTop';
import { PageHeader } from '../components/PageHeader';
import { confirmDialog } from '../lib/dialog';
import type { TopicRequestStatus } from '@carnet/schemas';

function fmtShortDate(iso: string) {
  return new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Picker pour lier une entrée (owner only) ────────────────────────────────

function EntryPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const { defsById } = useNoteTypeDefs();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Toutes les entrées owner sont en local via Dexie
  const allEntries = useLiveQuery(
    () => db.entries.filter((e) => e.deletedAt === null && !e.collectionOnly).toArray(),
    [],
  ) ?? [];

  const selected = useMemo(
    () => (value ? allEntries.find((e) => e.id === value) : null),
    [value, allEntries],
  );

  const matches = useMemo(() => {
    if (!query.trim() && !open) return [];
    const q = query.trim().toLowerCase();
    const sorted = [...allEntries].sort((a, b) => b.date.localeCompare(a.date));
    if (!q) return sorted.slice(0, 20);
    return sorted
      .filter((e) => {
        const subject = (e.mediaMeta?.subject ?? '').toLowerCase();
        return (
          e.title?.toLowerCase().includes(q) ||
          e.contentMd.toLowerCase().includes(q) ||
          subject.includes(q) ||
          e.date.includes(q)
        );
      })
      .slice(0, 30);
  }, [query, allEntries, open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  const pickEntry = (e: LocalEntry) => {
    onChange(e.id);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={containerRef} className="relative">
      {selected ? (
        <div className="flex items-center gap-2 bg-bg-primary/60 border border-text-muted/15 rounded-xl px-3 py-2">
          {(() => { const c = resolveNoteTypeConfig(selected, defsById); return <c.Glyph className="w-4 h-4 shrink-0" style={{ color: c.color }} />; })()}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-text-primary truncate">
              {selected.title ?? selected.mediaMeta?.subject ?? <span className="italic text-text-muted">Sans titre</span>}
            </p>
            <p className="text-[11px] text-text-muted/60">{fmtShortDate(selected.date)}</p>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-text-muted/55 hover:text-danger transition-colors text-xs px-1"
            aria-label="Retirer le lien"
          >
            ✕
          </button>
        </div>
      ) : (
        <>
          <input
            type="text"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            placeholder="Chercher une note (titre, date, contenu)…"
            className="w-full bg-bg-primary/60 border border-text-muted/15 rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/55 outline-none focus:border-accent/40 transition-colors"
          />
          {open && matches.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-bg-elevated border border-text-muted/15 rounded-xl shadow-lg max-h-64 overflow-y-auto scrollbar-soft">
              {matches.map((e) => {
                const cfg = resolveNoteTypeConfig(e, defsById);
                const label = e.title || e.mediaMeta?.subject || e.contentMd.slice(0, 50).trim() || 'Sans titre';
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => pickEntry(e)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-text-muted/10 transition-colors text-left"
                  >
                    <cfg.Glyph className="w-4 h-4 shrink-0" style={{ color: cfg.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary truncate">{label}</p>
                      <p className="text-[11px] text-text-muted/60">{fmtShortDate(e.date)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {open && query.trim() && matches.length === 0 && (
            <p className="absolute left-0 right-0 top-full mt-1 z-30 bg-bg-elevated border border-text-muted/15 rounded-xl shadow-lg px-3 py-2 text-xs text-text-muted italic">
              Aucune note correspondante.
            </p>
          )}
        </>
      )}
    </div>
  );
}

const STATUS_META: Record<TopicRequestStatus, { label: string; icon: string; cls: string }> = {
  PENDING:     { label: 'En attente',  icon: '⏳', cls: 'bg-warning/15 text-warning border-warning/30' },
  IN_PROGRESS: { label: 'En cours',    icon: '✍️', cls: 'bg-accent/15 text-accent border-accent/30' },
  DONE:        { label: 'Traitée',     icon: '✓',  cls: 'bg-success/15 text-success border-success/30' },
  REJECTED:    { label: 'Refusée',     icon: '✕',  cls: 'bg-danger/10 text-danger border-danger/20' },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }: { status: TopicRequestStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${m.cls}`}>
      <span>{m.icon}</span>
      <span>{m.label}</span>
    </span>
  );
}

// ── Formulaire de création (guest uniquement) ────────────────────────────────

function NewRequestForm({ onCreated, initialOpen = false }: { onCreated: () => void; initialOpen?: boolean }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [open, setOpen] = useState(initialOpen);
  const create = trpc.topicRequests.create.useMutation();
  const utils = trpc.useUtils();

  const submit = async () => {
    if (!title.trim()) return;
    await create.mutateAsync({ title: title.trim(), description: description.trim() || null });
    setTitle('');
    setDescription('');
    setOpen(false);
    await utils.topicRequests.list.invalidate();
    onCreated();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full py-3 rounded-2xl border-2 border-dashed border-text-muted/20 text-text-muted/70 hover:border-accent/40 hover:text-accent transition-colors text-sm font-medium"
      >
        + Nouvelle demande
      </button>
    );
  }

  return (
    <div className="bg-bg-elevated rounded-2xl p-4 shadow-soft flex flex-col gap-3">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Nouvelle demande</p>
      <input
        type="text"
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Sujet souhaité (ex. « Parle-moi de ta grand-mère »)"
        maxLength={200}
        className="w-full bg-bg-primary/60 border border-text-muted/15 rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/55 outline-none focus:border-accent/40 transition-colors"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Précisions optionnelles…"
        rows={3}
        maxLength={2000}
        className="w-full bg-bg-primary/60 border border-text-muted/15 rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/55 outline-none focus:border-accent/40 transition-colors resize-none"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => { setOpen(false); setTitle(''); setDescription(''); }}
          className="px-3 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!title.trim() || create.isPending}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-40 transition-colors"
        >
          {create.isPending ? 'Envoi…' : 'Envoyer'}
        </button>
      </div>
    </div>
  );
}

// ── Data hook ────────────────────────────────────────────────────────────────

function useRequests() {
  const { data = [] } = trpc.topicRequests.list.useQuery(undefined, {
    staleTime: 10_000,
    refetchInterval: 180_000,
  });
  return { data };
}

type Request = ReturnType<typeof useRequests>['data'][number];

// ── Carte d'une demande (mobile uniquement) ──────────────────────────────────

function RequestCard({
  request,
  isOwner,
  onUpdate,
}: {
  request: Request;
  isOwner: boolean;
  onUpdate: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftStatus, setDraftStatus] = useState<TopicRequestStatus>(request.status);
  const [draftNote, setDraftNote] = useState(request.ownerNote ?? '');
  const [draftEntryId, setDraftEntryId] = useState(request.linkedEntryId ?? '');
  const updateStatus = trpc.topicRequests.updateStatus.useMutation();
  const del = trpc.topicRequests.delete.useMutation();
  const utils = trpc.useUtils();
  const navigate = useNavigate();

  // Même garde que la carte desktop : pas de mutation si rien n'a changé (FEED-12).
  const isDirty =
    draftStatus !== request.status ||
    draftNote !== (request.ownerNote ?? '') ||
    draftEntryId !== (request.linkedEntryId ?? '');

  const save = async () => {
    await updateStatus.mutateAsync({
      id: request.id,
      status: draftStatus,
      ownerNote: draftNote.trim() || null,
      linkedEntryId: draftEntryId.trim() || null,
    });
    setEditing(false);
    await utils.topicRequests.list.invalidate();
    await utils.topicRequests.pendingCount.invalidate();
    onUpdate();
  };

  const handleDelete = async () => {
    const ok = await confirmDialog({
      title: 'Supprimer cette demande ?',
      message: 'Cette action est définitive.',
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    await del.mutateAsync({ id: request.id });
    await utils.topicRequests.list.invalidate();
    await utils.topicRequests.pendingCount.invalidate();
    onUpdate();
  };

  // Changement de statut en 1 tap depuis la carte, sans ouvrir le formulaire
  // (FEED-10). Conserve note + note liée existantes.
  const quickStatus = async (s: TopicRequestStatus) => {
    if (s === request.status || updateStatus.isPending) return;
    await updateStatus.mutateAsync({
      id: request.id,
      status: s,
      ownerNote: request.ownerNote ?? null,
      linkedEntryId: request.linkedEntryId ?? null,
    });
    await utils.topicRequests.list.invalidate();
    await utils.topicRequests.pendingCount.invalidate();
    onUpdate();
  };

  const canEdit = isOwner;
  const canDelete = isOwner || request.status === 'PENDING';
  const authorName = request.author?.displayName || request.author?.email.split('@')[0] || 'Quelqu\'un';

  return (
    <div className="bg-bg-elevated rounded-2xl px-5 py-4 shadow-soft">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-text-primary font-medium text-base leading-snug">{request.title}</p>
          <p className="text-[11px] text-text-muted/60 mt-0.5">
            {isOwner && <>par <span className="text-text-muted">{authorName}</span> · </>}
            {formatDate(request.createdAt)}
          </p>
        </div>
        <StatusBadge status={request.status} />
      </div>

      {request.description && !editing && (
        <p className="text-sm text-text-muted leading-relaxed mb-2 whitespace-pre-wrap">{request.description}</p>
      )}

      {request.ownerNote && !editing && (
        <div className="mt-2 pt-2 border-t border-text-muted/10">
          <p className="text-[11px] uppercase tracking-wide text-text-muted/50 mb-1">Mot de l'owner</p>
          <p className="text-sm text-text-muted leading-relaxed whitespace-pre-wrap">{request.ownerNote}</p>
        </div>
      )}

      {request.linkedEntry && !editing && (
        <button
          type="button"
          onClick={() => navigate(`/?entryId=${request.linkedEntry!.id}`)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
        >
          → Voir la note liée du {formatDate(request.linkedEntry.date)}
        </button>
      )}

      {/* Formulaire d'édition (owner) */}
      {editing && (
        <div className="mt-3 pt-3 border-t border-text-muted/10 flex flex-col gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-text-muted/60 mb-1.5">Statut</p>
            <div className="flex flex-wrap gap-1.5">
              {(['PENDING', 'IN_PROGRESS', 'DONE', 'REJECTED'] as TopicRequestStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setDraftStatus(s)}
                  className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full border transition-all ${
                    draftStatus === s ? STATUS_META[s].cls : 'border-text-muted/15 text-text-muted/60 hover:border-text-muted/30'
                  }`}
                >
                  <span>{STATUS_META[s].icon}</span>
                  <span>{STATUS_META[s].label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-text-muted/60 mb-1.5">Mot pour le confident (optionnel)</p>
            <textarea
              value={draftNote}
              onChange={(e) => setDraftNote(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Précision, raison du refus, etc."
              className="w-full bg-bg-primary/60 border border-text-muted/15 rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/55 outline-none focus:border-accent/40 transition-colors resize-none"
            />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-text-muted/60 mb-1.5">Lier à une note (optionnel)</p>
            <EntryPicker
              value={draftEntryId || null}
              onChange={(id) => setDraftEntryId(id ?? '')}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setEditing(false); setDraftStatus(request.status); setDraftNote(request.ownerNote ?? ''); setDraftEntryId(request.linkedEntryId ?? ''); }}
              className="px-3 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={!isDirty || updateStatus.isPending}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-40 transition-colors"
            >
              {updateStatus.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}

      {/* Actions owner : pills de statut directement sur la carte (FEED-10) +
          « Détails » pour le mot/la note liée. */}
      {!editing && canEdit && (
        <div className="mt-3 pt-2 border-t border-text-muted/10">
          <div className="flex flex-wrap gap-1.5">
            {(['PENDING', 'IN_PROGRESS', 'DONE', 'REJECTED'] as TopicRequestStatus[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void quickStatus(s)}
                disabled={updateStatus.isPending}
                aria-pressed={request.status === s}
                className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full border transition-all disabled:opacity-50 ${
                  request.status === s ? STATUS_META[s].cls : 'border-text-muted/15 text-text-muted/60 hover:border-text-muted/30'
                }`}
              >
                <span>{STATUS_META[s].icon}</span>
                <span>{STATUS_META[s].label}</span>
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs text-accent hover:underline"
            >
              Mot / note liée…
            </button>
            {canDelete && (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={del.isPending}
                className="text-xs text-danger/70 hover:text-danger transition-colors ml-auto"
              >
                Supprimer
              </button>
            )}
          </div>
        </div>
      )}

      {/* Actions confident : annuler sa demande (tant qu'elle est PENDING). */}
      {!editing && !canEdit && canDelete && (
        <div className="mt-3 flex items-center pt-2 border-t border-text-muted/10">
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={del.isPending}
            className="text-xs text-danger/70 hover:text-danger transition-colors ml-auto"
          >
            Annuler ma demande
          </button>
        </div>
      )}

      {/* Confident dont la demande n'est plus PENDING : explique pourquoi
          « annuler » a disparu plutôt que de la masquer en silence (FEED-11). */}
      {!editing && !isOwner && !canDelete && (
        <p className="mt-3 pt-2 border-t border-text-muted/10 text-[11px] text-text-muted/50 italic">
          Demande prise en compte — tu ne peux plus l'annuler.
        </p>
      )}
    </div>
  );
}

// ── Item de liste simplifié (colonne gauche desktop) ─────────────────────────

function RequestListItem({
  request,
  isOwner,
  isActive,
  onSelect,
}: {
  request: Request;
  isOwner: boolean;
  isActive: boolean;
  onSelect: () => void;
}) {
  const authorName = request.author?.displayName || request.author?.email.split('@')[0] || 'Quelqu\'un';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left px-5 py-3.5 rounded-2xl transition-all ${
        isActive
          ? 'bg-accent/10 ring-1 ring-accent/25'
          : 'bg-bg-elevated shadow-soft hover:ring-1 hover:ring-text-muted/10'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-text-primary font-medium text-sm leading-snug">{request.title}</p>
          <p className="text-[11px] text-text-muted/60 mt-0.5">
            {isOwner && <>{authorName} · </>}{formatDate(request.createdAt)}
          </p>
        </div>
        <StatusBadge status={request.status} />
      </div>
    </button>
  );
}

// ── Panneau détail / traitement (colonne droite desktop) ─────────────────────

function RequestDetailPanel({
  request,
  isOwner,
  onUpdate,
  onClose,
  onDeleted,
}: {
  request: Request;
  isOwner: boolean;
  onUpdate: () => void;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [draftStatus, setDraftStatus] = useState<TopicRequestStatus>(request.status);
  const [draftNote, setDraftNote] = useState(request.ownerNote ?? '');
  const [draftEntryId, setDraftEntryId] = useState(request.linkedEntryId ?? '');
  const updateStatus = trpc.topicRequests.updateStatus.useMutation();
  const del = trpc.topicRequests.delete.useMutation();
  const utils = trpc.useUtils();
  const navigate = useNavigate();

  const isDirty =
    draftStatus !== request.status ||
    draftNote !== (request.ownerNote ?? '') ||
    draftEntryId !== (request.linkedEntryId ?? '');

  const save = async () => {
    await updateStatus.mutateAsync({
      id: request.id,
      status: draftStatus,
      ownerNote: draftNote.trim() || null,
      linkedEntryId: draftEntryId.trim() || null,
    });
    await utils.topicRequests.list.invalidate();
    await utils.topicRequests.pendingCount.invalidate();
    onUpdate();
  };

  const handleDelete = async () => {
    const ok = await confirmDialog({
      title: 'Supprimer cette demande ?',
      message: 'Cette action est définitive.',
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    await del.mutateAsync({ id: request.id });
    await utils.topicRequests.list.invalidate();
    await utils.topicRequests.pendingCount.invalidate();
    onDeleted();
  };

  const authorName = request.author?.displayName || request.author?.email.split('@')[0] || 'Quelqu\'un';
  const canDelete = isOwner || request.status === 'PENDING';

  return (
    <>
      {/* En-tête fixe */}
      <div className="shrink-0 flex items-start gap-3 px-6 pt-6 pb-4 border-b border-text-muted/10">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-text-muted/60 mb-0.5">
            {isOwner ? <>par {authorName} · {formatDate(request.createdAt)}</> : formatDate(request.createdAt)}
          </p>
          <p className="text-sm font-medium text-text-primary leading-snug">{request.title}</p>
        </div>
        <StatusBadge status={request.status} />
        <button
          type="button"
          onClick={onClose}
          className="text-text-muted/55 hover:text-text-muted transition-colors shrink-0 mt-0.5"
          aria-label="Fermer"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Zone scrollable */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-soft">
        <div className="px-6 pt-5 pb-6 flex flex-col gap-4">

          {/* Description de la demande */}
          {request.description && (
            <p className="text-sm text-text-muted leading-relaxed whitespace-pre-wrap">{request.description}</p>
          )}

          {/* Formulaire de traitement (owner) — toujours ouvert */}
          {isOwner && (
            <div className="flex flex-col gap-3">
              {request.description && <div className="border-t border-text-muted/10 -mx-0" />}
              <div>
                <p className="text-[11px] uppercase tracking-wide text-text-muted/60 mb-1.5">Statut</p>
                <div className="flex flex-wrap gap-1.5">
                  {(['PENDING', 'IN_PROGRESS', 'DONE', 'REJECTED'] as TopicRequestStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setDraftStatus(s)}
                      className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full border transition-all ${
                        draftStatus === s ? STATUS_META[s].cls : 'border-text-muted/15 text-text-muted/60 hover:border-text-muted/30'
                      }`}
                    >
                      <span>{STATUS_META[s].icon}</span>
                      <span>{STATUS_META[s].label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-text-muted/60 mb-1.5">Mot pour le confident (optionnel)</p>
                <textarea
                  value={draftNote}
                  onChange={(e) => setDraftNote(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="Précision, raison du refus, etc."
                  className="w-full bg-bg-primary/60 border border-text-muted/15 rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/55 outline-none focus:border-accent/40 transition-colors resize-none"
                />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-text-muted/60 mb-1.5">Lier à une note (optionnel)</p>
                <EntryPicker
                  value={draftEntryId || null}
                  onChange={(id) => setDraftEntryId(id ?? '')}
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={!isDirty || updateStatus.isPending}
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-40 transition-colors"
                >
                  {updateStatus.isPending ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    disabled={del.isPending}
                    className="ml-auto text-xs text-danger/60 hover:text-danger transition-colors"
                  >
                    Supprimer
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Vue confident (lecture seule) */}
          {!isOwner && (
            <>
              {request.ownerNote && (
                <div className="pt-2 border-t border-text-muted/10">
                  <p className="text-[11px] uppercase tracking-wide text-text-muted/50 mb-1">Mot de l'owner</p>
                  <p className="text-sm text-text-muted leading-relaxed whitespace-pre-wrap">{request.ownerNote}</p>
                </div>
              )}
              {request.linkedEntry && (
                <button
                  type="button"
                  onClick={() => navigate(`/?entryId=${request.linkedEntry!.id}`)}
                  className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
                >
                  → Voir la note liée du {formatDate(request.linkedEntry.date)}
                </button>
              )}
              {canDelete ? (
                <div className="pt-3 border-t border-text-muted/10">
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    disabled={del.isPending}
                    className="text-xs text-danger/60 hover:text-danger transition-colors"
                  >
                    Annuler ma demande
                  </button>
                </div>
              ) : (
                /* Demande déjà prise en charge → explique l'absence d'annulation (FEED-11). */
                <p className="pt-3 border-t border-text-muted/10 text-[11px] text-text-muted/50 italic">
                  Demande prise en compte — tu ne peux plus l'annuler.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── Page principale ──────────────────────────────────────────────────────────

export function RequestsPage() {
  const { data: me } = trpc.auth.me.useQuery();
  const isOwner = me?.role === 'OWNER';
  const isConfidant = me?.role === 'GUEST' && me.guestAccess === 'CONFIDANT';
  const { data: requests } = useRequests();
  const [statusFilter, setStatusFilter] = useState<TopicRequestStatus | 'ALL'>('ALL');
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const [searchParams, setSearchParams] = useSearchParams();
  const openCreate = searchParams.get('create') === '1';
  useEffect(() => {
    if (openCreate) setSearchParams((p) => { p.delete('create'); return p; }, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openCreate]);

  if (me && !isOwner && !isConfidant) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-6 text-center">
        <p className="text-sm text-text-muted">Cette page n'est accessible qu'au confident.</p>
      </div>
    );
  }

  const filtered = statusFilter === 'ALL' ? requests : requests.filter((r) => r.status === statusFilter);

  // Stats par statut pour les filtres
  const counts: Record<TopicRequestStatus | 'ALL', number> = {
    ALL: requests.length,
    PENDING: 0, IN_PROGRESS: 0, DONE: 0, REJECTED: 0,
  };
  for (const r of requests) counts[r.status]++;

  const activeRequest = requests.find((r) => r.id === activeRequestId) ?? null;

  return (
    <div className="min-h-dvh pb-48 sm:pb-56 max-w-2xl mx-auto [overflow-x:clip] lg:max-w-none lg:px-0 lg:pb-0 lg:flex lg:items-start">

      {/* ── Colonne gauche ────────────────────────────────────────────────── */}
      <div className={`lg:px-12 lg:pb-16 lg:min-h-dvh lg:min-w-0 ${activeRequestId ? 'lg:w-[480px] lg:shrink-0' : 'lg:flex-1'}`}>
        <PageHeader
          title="Boîte à demandes"
          kicker={(() => {
            const active = counts.PENDING + counts.IN_PROGRESS;
            return active > 0 ? `${active} demande${active > 1 ? 's' : ''} en cours` : 'Demandes';
          })()}
          backTo="/"
        />

        <div className="px-6">
        <p className="text-sm text-text-muted/70 mb-6">
          {isOwner
            ? "Les sujets sur lesquels ton confident aimerait que tu écrives."
            : "Demande à l'owner d'écrire sur un sujet : une personne, une période, un souvenir…"}
        </p>

        {/* Form de création (confident uniquement) */}
        {isConfidant && (
          <div className="mb-6">
            <NewRequestForm onCreated={() => utils.topicRequests.list.invalidate()} initialOpen={openCreate} />
          </div>
        )}

        {/* Filtres par statut */}
        <div className="flex flex-wrap items-center gap-1.5 mb-5">
          {(['ALL', 'PENDING', 'IN_PROGRESS', 'DONE', 'REJECTED'] as const).map((s) => {
            const isActive = statusFilter === s;
            const label = s === 'ALL' ? 'Toutes' : STATUS_META[s].label;
            const count = counts[s];
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-all ${
                  isActive
                    ? 'border-accent/40 bg-accent/10 text-accent font-medium'
                    : 'border-text-muted/15 text-text-muted hover:border-text-muted/30'
                }`}
              >
                {label}
                {count > 0 && <span className="text-text-muted/50">({count})</span>}
              </button>
            );
          })}
        </div>

        {/* Liste */}
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="font-serif text-text-muted/55 text-2xl mb-2">✦</p>
            <p className="text-sm text-text-muted italic">
              {requests.length === 0
                ? (isConfidant ? "Aucune demande encore. Lance-toi !" : 'Aucune demande pour le moment.')
                : 'Aucune demande dans cette catégorie.'}
            </p>
          </div>
        ) : (
          <>
            {/* Mobile : cartes avec édition inline */}
            <div className="flex flex-col gap-3 lg:hidden">
              {filtered.map((r) => (
                <RequestCard
                  key={r.id}
                  request={r}
                  isOwner={isOwner}
                  onUpdate={() => utils.topicRequests.list.invalidate()}
                />
              ))}
            </div>
            {/* Desktop : items sélectionnables */}
            <div className="hidden lg:flex lg:flex-col lg:gap-2">
              {filtered.map((r) => (
                <RequestListItem
                  key={r.id}
                  request={r}
                  isOwner={isOwner}
                  isActive={activeRequestId === r.id}
                  onSelect={() => setActiveRequestId(r.id)}
                />
              ))}
            </div>
          </>
        )}

        <BackToTop panelOpen={!!activeRequestId} />
        {isOwner ? <BottomNav /> : <GuestBottomNav />}
        </div>{/* /px-6 */}
      </div>

      {/* ── Panneau droit desktop (demande sélectionnée) ─────────────────── */}
      {activeRequest && (
        <div data-right-panel className="hidden lg:flex lg:flex-col lg:flex-1 lg:sticky lg:top-0 lg:self-start lg:h-dvh lg:border-l lg:border-text-muted/10 lg:overflow-hidden">
          <RequestDetailPanel
            key={activeRequest.id}
            request={activeRequest}
            isOwner={isOwner}
            onUpdate={() => utils.topicRequests.list.invalidate()}
            onClose={() => setActiveRequestId(null)}
            onDeleted={() => setActiveRequestId(null)}
          />
        </div>
      )}

      {/* Pas de placeholder quand rien n'est sélectionné : la colonne gauche
          prend toute la largeur, comme dans le Journal. */}
    </div>
  );
}
