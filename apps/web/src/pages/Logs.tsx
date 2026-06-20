import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { trpc } from '../lib/trpc';
import { db } from '../lib/db/schema';
import { BottomNav } from '../components/BottomNav';
import { BackToTop } from '../components/BackToTop';
import { PageHeader } from '../components/PageHeader';
import { NoteModal } from '../components/NoteModal';
import { AnnotatedReader } from '../components/AnnotatedReader';
import { getNoteTypeConfig } from '../components/NoteTypePicker';
import { useDropdownAlign } from '../lib/useDropdownAlign';
import { formatTimestamp, formatDateLong } from '../lib/dateHelpers';
import { parseUserAgent } from '../lib/userAgent';
import { DatePicker } from '../components/DatePicker';

// ─── Métadonnées d'affichage par action ──────────────────────────────────────
// `tone` pilote la couleur de la pastille ; `label` est le libellé FR lisible.
// Toute nouvelle action `AuditLog` côté serveur peut être ajoutée ici — sinon
// elle s'affiche en gris avec son identifiant brut (fallback `describe`).

type Tone = 'success' | 'danger' | 'warning' | 'guest' | 'muted';

const ACTION_META: Record<string, { label: string; tone: Tone }> = {
  // Connexions / compte
  LOGIN: { label: 'Connexion', tone: 'success' },
  LOGIN_FAILED: { label: 'Échec de connexion', tone: 'danger' },
  LOGOUT: { label: 'Déconnexion', tone: 'muted' },
  OWNER_REGISTERED: { label: 'Création du compte', tone: 'success' },
  // Sécurité
  PASSWORD_CHANGED: { label: 'Mot de passe modifié', tone: 'warning' },
  PASSWORD_RESET_REQUESTED: { label: 'Demande de réinitialisation', tone: 'warning' },
  PASSWORD_RESET_CONFIRMED: { label: 'Réinitialisation confirmée', tone: 'warning' },
  SESSION_REVOKED: { label: 'Session révoquée', tone: 'warning' },
  '2FA_SETUP_STARTED': { label: 'Configuration 2FA démarrée', tone: 'warning' },
  '2FA_ENABLED': { label: 'Double authentification activée', tone: 'success' },
  '2FA_DISABLED': { label: 'Double authentification désactivée', tone: 'warning' },
  '2FA_CHALLENGE_FAILED': { label: 'Échec du code 2FA', tone: 'danger' },
  // Confidents
  GUEST_ACCEPTED: { label: 'Invitation acceptée', tone: 'success' },
  GUEST_REVOKED: { label: 'Confident révoqué', tone: 'warning' },
  GUEST_PASSWORD_REGENERATED: { label: 'Mot de passe confident régénéré', tone: 'warning' },
  GUEST_LIST: { label: 'Confident · liste du journal', tone: 'guest' },
  GUEST_VIEW: { label: "Confident · lecture d'une note", tone: 'guest' },
  ENTRY_OPENED: { label: "Confident · ouverture d'une note", tone: 'guest' },
  RECAP_OPENED: { label: 'Confident · lecture du récap du mois', tone: 'guest' },
  read_gate_respond: { label: "Réponse à une question d'accès", tone: 'guest' },
  adult_attempt: { label: 'Tentative · contenu sensible', tone: 'warning' },
  // Notes (cycle de vie)
  ENTRY_CREATED: { label: 'Note créée', tone: 'success' },
  ENTRY_DELETED: { label: 'Note supprimée', tone: 'warning' },
  ENTRY_RESTORED: { label: 'Note restaurée', tone: 'success' },
  ENTRY_EDITED: { label: 'Note modifiée', tone: 'muted' },
  ENTRY_SEALED: { label: 'Note scellée (capsule)', tone: 'warning' },
  ENTRY_UNSEALED: { label: 'Note descellée', tone: 'success' },
  ENTRY_VISIBILITY_CHANGED: { label: 'Visibilité modifiée', tone: 'warning' },
  ENTRY_LOCK_ADDED: { label: 'Verrou posé (secret / adulte / lecture)', tone: 'warning' },
  ENTRY_LOCK_REMOVED: { label: 'Verrou retiré (secret / adulte / lecture)', tone: 'danger' },
  // Interactions
  COMMENT_ADDED: { label: 'Commentaire ajouté', tone: 'guest' },
  REACTION_ADDED: { label: 'Réaction ajoutée', tone: 'guest' },
  REACTION_REMOVED: { label: 'Réaction retirée', tone: 'muted' },
  RATING_SET: { label: 'Note marquée (favori / à oublier)', tone: 'guest' },
  RATING_CLEARED: { label: 'Marquage retiré', tone: 'muted' },
  QUIZ_SUBMITTED: { label: 'Quizz · réponses soumises', tone: 'guest' },
  QUIZ_RESET: { label: 'Quizz · réinitialisé', tone: 'muted' },
  MESSAGE_SENT: { label: 'Message envoyé', tone: 'guest' },
  // Tâches
  TASK_CREATED: { label: 'Tâche créée', tone: 'success' },
  TASK_STATUS_CHANGED: { label: 'Tâche · statut modifié', tone: 'guest' },
  TASK_DELETED: { label: 'Tâche supprimée', tone: 'warning' },
  TASK_RESTORED: { label: 'Tâche restaurée', tone: 'success' },
  // Demandes de sujets
  REQUEST_CREATED: { label: 'Demande de sujet créée', tone: 'guest' },
  REQUEST_STATUS_CHANGED: { label: 'Demande · statut modifié', tone: 'guest' },
  REQUEST_DELETED: { label: 'Demande supprimée', tone: 'warning' },
};

const TONE_DOT: Record<Tone, string> = {
  success: 'bg-success',
  danger: 'bg-danger',
  warning: 'bg-warning',
  guest: 'bg-accent',
  muted: 'bg-text-muted/40',
};

function describe(action: string): { label: string; tone: Tone } {
  if (ACTION_META[action]) return ACTION_META[action];
  // Mutation loguée automatiquement par le middleware : `rpc.<router>.<proc>`.
  // On affiche le chemin technique brut (utile pour le debug), en gris.
  if (action.startsWith('rpc.')) return { label: action.slice(4), tone: 'muted' };
  return { label: action, tone: 'muted' };
}

// ─── Groupes pour le multi-select par type ───────────────────────────────────
// Partition exacte : chaque action appartient à un seul groupe. Sert uniquement
// à organiser le panneau de filtre (les en-têtes cochent/décochent le groupe).

const GROUPS: { id: string; label: string; actions: string[] }[] = [
  { id: 'logins', label: 'Connexions', actions: ['LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'OWNER_REGISTERED'] },
  {
    id: 'security',
    label: 'Sécurité',
    actions: [
      'PASSWORD_CHANGED', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_CONFIRMED', 'SESSION_REVOKED',
      '2FA_SETUP_STARTED', '2FA_ENABLED', '2FA_DISABLED', '2FA_CHALLENGE_FAILED',
    ],
  },
  {
    id: 'guests',
    label: 'Confidents',
    actions: ['GUEST_ACCEPTED', 'GUEST_REVOKED', 'GUEST_PASSWORD_REGENERATED', 'GUEST_LIST', 'GUEST_VIEW', 'ENTRY_OPENED', 'RECAP_OPENED', 'read_gate_respond', 'adult_attempt'],
  },
  { id: 'notes', label: 'Notes', actions: ['ENTRY_CREATED', 'ENTRY_EDITED', 'ENTRY_DELETED', 'ENTRY_RESTORED', 'ENTRY_SEALED', 'ENTRY_UNSEALED', 'ENTRY_VISIBILITY_CHANGED', 'ENTRY_LOCK_ADDED', 'ENTRY_LOCK_REMOVED'] },
  {
    id: 'interactions',
    label: 'Interactions',
    actions: ['COMMENT_ADDED', 'REACTION_ADDED', 'REACTION_REMOVED', 'RATING_SET', 'RATING_CLEARED', 'QUIZ_SUBMITTED', 'QUIZ_RESET', 'MESSAGE_SENT'],
  },
  { id: 'tasks', label: 'Tâches', actions: ['TASK_CREATED', 'TASK_STATUS_CHANGED', 'TASK_DELETED', 'TASK_RESTORED'] },
  { id: 'requests', label: 'Demandes', actions: ['REQUEST_CREATED', 'REQUEST_STATUS_CHANGED', 'REQUEST_DELETED'] },
];

const KNOWN_ACTIONS = new Set(GROUPS.flatMap((g) => g.actions));

const LOCK_LABELS: Record<string, string> = { secret: 'secret', adult: 'adulte', readGate: 'lecture', capsule: 'capsule' };
const VIS_LABELS: Record<string, string> = { PRIVATE: 'privé', SHARED_ALL: 'partagé · tous', SHARED_SPECIFIC: 'partagé · ciblé' };
const visLabel = (v: unknown) => VIS_LABELS[String(v)] ?? (v == null ? '∅' : String(v));
// Clés gérées explicitement ci-dessous (ou affichées ailleurs) → exclues du dump générique.
const HANDLED_META_KEYS = new Set(['from', 'to', 'locks', 'fields', 'charDelta', 'unlockAt', 'title', 'noteType', 'count', 'includeCollectionOnly', 'date']);

/** Titre éventuel porté par la metadata (tâches/demandes sans entryId). */
function metaTitle(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const t = (metadata as Record<string, unknown>).title;
  return typeof t === 'string' && t ? t : null;
}

function metadataSummary(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const o = metadata as Record<string, unknown>;
  const parts: string[] = [];
  // Transition lisible (visibilité, statut…) — uniquement si elle porte une
  // valeur réelle (évite le « ∅ → ∅ » des requêtes liste sans plage de dates).
  if (o.from != null || o.to != null) {
    parts.push(`${visLabel(o.from)} → ${visLabel(o.to)}`);
  }
  // Chargement de liste par un confident (GUEST_LIST).
  if (typeof o.count === 'number') parts.push(`${o.count} entrée${o.count > 1 ? 's' : ''}`);
  if (o.includeCollectionOnly === true) parts.push('Collection');
  if (Array.isArray(o.locks) && o.locks.length) {
    parts.push(o.locks.map((l) => LOCK_LABELS[String(l)] ?? String(l)).join(', '));
  }
  if (Array.isArray(o.fields) && o.fields.length) {
    parts.push(o.fields.join(' + '));
  }
  if (typeof o.charDelta === 'number' && o.charDelta !== 0) {
    parts.push(`${o.charDelta > 0 ? '+' : ''}${o.charDelta} car.`);
  }
  if (typeof o.unlockAt === 'string') {
    const d = new Date(o.unlockAt);
    if (!Number.isNaN(d.getTime())) {
      parts.push(`→ ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`);
    }
  }
  for (const [k, v] of Object.entries(o)) {
    if (HANDLED_META_KEYS.has(k)) continue;
    if (v === null || v === undefined || v === '') continue;
    parts.push(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
  }
  return parts.length ? parts.join(' · ') : null;
}

/** Ligne de métadonnées : tronquée par défaut, dépliable au tap (le `title`
 *  natif est invisible au tactile — cf. SET-22). */
function MetaLine({ meta }: { meta: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
      className={`block w-full text-left text-[11px] text-text-muted/55 font-mono mt-0.5 ${expanded ? 'break-words whitespace-pre-wrap' : 'truncate'}`}
      title={expanded ? undefined : meta}
      aria-expanded={expanded}
    >
      {meta}
    </button>
  );
}

// ─── Panneau de filtre multi-select ──────────────────────────────────────────

function TypeFilter({
  selected,
  onToggle,
  onToggleGroup,
  onClear,
  counts,
}: {
  selected: Set<string>;
  onToggle: (action: string) => void;
  onToggleGroup: (actions: string[], allSelected: boolean) => void;
  onClear: () => void;
  counts: Map<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { panelRef, panelStyle } = useDropdownAlign(open);

  // Fermeture au clic extérieur (cohérent avec les autres dropdowns owner).
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // On n'affiche que les groupes ayant au moins un type réellement présent dans
  // les logs, plus un groupe « Autres » pour d'éventuelles actions non mappées.
  const renderedGroups = useMemo(() => {
    const groups = GROUPS
      .map((g) => ({ ...g, actions: g.actions.filter((a) => counts.has(a)) }))
      .filter((g) => g.actions.length > 0);
    const others = [...counts.keys()].filter((a) => !KNOWN_ACTIONS.has(a));
    // Tout le reste — surtout les mutations auto-loguées `rpc.*` (debug).
    if (others.length) groups.push({ id: 'other', label: 'Technique / autres', actions: others.sort() });
    return groups;
  }, [counts]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ' +
          (selected.size > 0 ? 'bg-accent text-bg-elevated' : 'bg-text-muted/8 text-text-muted hover:text-text-primary')
        }
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        {selected.size === 0 ? 'Tous les types' : `${selected.size} type${selected.size > 1 ? 's' : ''}`}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          ref={panelRef}
          style={panelStyle}
          className="absolute left-0 top-full mt-1.5 z-20 w-72 max-h-[60vh] overflow-y-auto scrollbar-soft bg-bg-elevated border border-text-muted/[0.12] rounded-xl shadow-xl p-2"
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-[11px] font-mono uppercase tracking-widest text-text-muted/50">Filtrer par type</span>
            {selected.size > 0 && (
              <button type="button" onClick={onClear} className="text-[11px] text-accent hover:underline">
                Tout effacer
              </button>
            )}
          </div>

          {renderedGroups.map((g) => {
            const allSelected = g.actions.every((a) => selected.has(a));
            return (
              <div key={g.id} className="mt-1">
                <button
                  type="button"
                  onClick={() => onToggleGroup(g.actions, allSelected)}
                  className="w-full flex items-center justify-between px-2 py-1 text-[11px] font-mono uppercase tracking-widest text-text-muted/50 hover:text-text-muted transition-colors"
                >
                  <span>{g.label}</span>
                  <span>{allSelected ? 'Tout retirer' : 'Tout'}</span>
                </button>
                {g.actions.map((a) => {
                  const { label, tone } = describe(a);
                  const checked = selected.has(a);
                  return (
                    <label
                      key={a}
                      className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-text-muted/8 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle(a)}
                        className="accent-accent w-3.5 h-3.5 shrink-0"
                      />
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TONE_DOT[tone]}`} />
                      <span className="flex-1 min-w-0 text-xs text-text-primary truncate">{label}</span>
                      <span className="font-mono text-[11px] text-text-muted/55 shrink-0">{counts.get(a)}</span>
                    </label>
                  );
                })}
              </div>
            );
          })}

          {renderedGroups.length === 0 && (
            <p className="px-2 py-3 text-xs text-text-muted/50 italic">Aucun évènement enregistré.</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Détail d'une note ouvert depuis le journal d'activité — en modale, sans
 * quitter la page. La note est lue depuis Dexie (l'owner a tout en local, même
 * les notes soft-supprimées). Une capsule encore scellée ne révèle pas son
 * contenu (cohérent avec la carte/lecture).
 */
function LogEntryModal({ entryId, onClose }: { entryId: string; onClose: () => void }) {
  // `undefined` = chargement, `null` = introuvable, objet = trouvée.
  const entry = useLiveQuery(() => db.entries.get(entryId).then((e) => e ?? null), [entryId]);
  const cfg = entry ? getNoteTypeConfig(entry.noteType) : null;
  const isSealed = !!(entry?.unlockAt && new Date(entry.unlockAt) > new Date());

  const header = (
    <div className="flex-1 min-w-0 flex items-start justify-between gap-3">
      <div className="min-w-0 flex flex-col gap-0.5">
        {entry && cfg ? (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium font-mono" style={{ color: cfg.color }}>
                <cfg.Icon className="w-3.5 h-3.5 shrink-0" /> {cfg.label}
              </span>
              {entry.deletedAt && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-danger/15 text-danger font-medium">Supprimée</span>}
              {entry.isSecret && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-secret/15 text-secret font-medium">Secret</span>}
              {isSealed && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-sealed/15 text-sealed font-medium">🔒 Capsule</span>}
              {entry.isDraft && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-warning/15 text-warning font-medium">Brouillon</span>}
            </div>
            {(entry.title || entry.mediaMeta?.subject) && (
              <span className="text-sm font-medium text-text-primary leading-snug">{entry.title ?? entry.mediaMeta?.subject}</span>
            )}
            <span className="text-xs text-text-muted/60">{formatDateLong(entry.date)}</span>
          </>
        ) : (
          <span className="text-sm text-text-muted">Note</span>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer"
        className="p-1.5 rounded-lg text-text-muted/60 hover:text-text-primary hover:bg-text-muted/10 transition-colors shrink-0"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );

  return (
    <NoteModal onClose={onClose} header={header}>
      {entry === undefined ? (
        <p className="px-5 py-10 text-center text-sm text-text-muted/50 italic">Chargement…</p>
      ) : entry === null ? (
        <p className="px-5 py-10 text-center text-sm text-text-muted/50 italic">Note introuvable (supprimée définitivement ?).</p>
      ) : isSealed ? (
        <div className="px-6 py-10 flex flex-col items-center gap-3 text-center">
          <span className="text-3xl">🔒</span>
          <p className="text-sm text-text-muted">Capsule scellée jusqu'au {formatDateLong((entry.unlockAt as string).slice(0, 10))}.</p>
          {entry.capsuleSpoiler && <p className="text-xs text-sealed/80 italic">« {entry.capsuleSpoiler} »</p>}
          <p className="text-xs text-text-muted/55">Le contenu n'est pas affiché tant que la capsule n'est pas ouverte.</p>
        </div>
      ) : !entry.contentMd ? (
        <div className="px-6 py-8 text-center">
          <p className="text-sm text-text-muted/50 italic">{entry.collectionOnly ? 'Item de collection (sans note rédigée).' : 'Aucun contenu rédigé.'}</p>
          {entry.mediaMeta?.description && (
            <p className="mt-3 text-sm text-text-muted text-left leading-relaxed">{entry.mediaMeta.description}</p>
          )}
        </div>
      ) : (
        <div className="px-5 py-4">
          <AnnotatedReader
            entryId={entry.id}
            contentMd={entry.contentMd}
            commentsLocked={!!entry.commentsLocked}
            fontKey={entry.font}
            fontSize={entry.fontSize}
          />
        </div>
      )}
    </NoteModal>
  );
}

export function LogsPage() {
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Recherche (débounced) + plage de dates.
  const [search, setSearch] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const hasFilters = selected.size > 0 || debouncedQ !== '' || from !== '' || to !== '';
  const resetAll = () => { setSelected(new Set()); setSearch(''); setFrom(''); setTo(''); };

  const { data: stats } = trpc.logs.stats.useQuery(undefined, { staleTime: 30_000 });
  const counts = useMemo(
    () => new Map((stats?.byAction ?? []).map((a) => [a.action, a.count])),
    [stats],
  );

  // Set → tableau stable pour la query (clé de cache = liste triée d'actions).
  const selectedActions = useMemo(
    () => (selected.size > 0 ? [...selected].sort() : undefined),
    [selected],
  );

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.logs.list.useInfiniteQuery(
      {
        limit: 50,
        actions: selectedActions,
        q: debouncedQ || undefined,
        from: from || undefined,
        to: to || undefined,
      },
      { getNextPageParam: (last) => last.nextCursor, staleTime: 15_000 },
    );

  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);

  const toggle = (action: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(action)) next.delete(action);
      else next.add(action);
      return next;
    });

  const toggleGroup = (actions: string[], allSelected: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const a of actions) {
        if (allSelected) next.delete(a);
        else next.add(a);
      }
      return next;
    });

  return (
    <div className="min-h-dvh pb-24 max-w-2xl mx-auto lg:max-w-3xl lg:pb-0">
      <PageHeader
        title="Journal d'activité"
        backTo="/settings"
        subtitle={stats ? `${stats.total} évènement${stats.total > 1 ? 's' : ''} enregistré${stats.total > 1 ? 's' : ''}` : undefined}
      />

      {/* Recherche */}
      <div className="px-4 lg:px-0 mb-3">
        <div className="relative">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/55 pointer-events-none">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher (note, appareil…)"
            className="w-full bg-bg-elevated border border-text-muted/15 rounded-xl pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted/55 outline-none focus:border-accent/40 transition-colors"
          />
        </div>
      </div>

      {/* Filtres : type + plage de dates */}
      <div className="px-4 lg:px-0 mb-4 flex items-center gap-2 flex-wrap">
        <TypeFilter
          selected={selected}
          onToggle={toggle}
          onToggleGroup={toggleGroup}
          onClear={() => setSelected(new Set())}
          counts={counts}
        />
        <DatePicker value={from} onChange={setFrom} max={to || undefined} placeholder="Du…" variant="pill" portal />
        <DatePicker value={to} onChange={setTo} min={from || undefined} placeholder="Au…" variant="pill" portal />
        {hasFilters && (
          <button
            type="button"
            onClick={resetAll}
            className="text-xs text-text-muted/60 hover:text-text-primary transition-colors"
          >
            Réinitialiser
          </button>
        )}
      </div>

      <div className="px-4 lg:px-0">
        {isLoading ? (
          <p className="text-center py-16 font-serif italic text-text-muted/50 text-sm">Chargement…</p>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <p className="font-serif text-text-muted/55 text-3xl mb-3">✦</p>
            <p className="font-serif text-text-muted italic text-sm">Aucun évènement pour ce filtre.</p>
          </div>
        ) : (
          <ul className="space-y-px">
            {items.map((log) => {
              const { label, tone } = describe(log.action);
              const meta = metadataSummary(log.metadata);
              const clickable = !!log.entryId;
              return (
                <li
                  key={log.id}
                  onClick={clickable ? () => setOpenEntryId(log.entryId) : undefined}
                  className={`flex items-start gap-3 px-3 py-3 rounded-xl transition-colors ${clickable ? 'cursor-pointer hover:bg-text-muted/8' : 'hover:bg-text-muted/5'}`}
                  title={clickable ? 'Ouvrir la note' : undefined}
                >
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${TONE_DOT[tone]}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm text-text-primary font-medium leading-snug">{label}</p>
                      <time className="shrink-0 font-mono text-[11px] text-text-muted/50">
                        {formatTimestamp(log.createdAt)}
                      </time>
                    </div>
                    <p className="text-[11px] text-text-muted/70 mt-0.5">
                      {log.actorName ?? 'Anonyme'}
                      {log.actorRole && (
                        <span className="text-text-muted/55"> · {log.actorRole === 'OWNER' ? 'owner' : 'confident'}</span>
                      )}
                      {parseUserAgent(log.userAgent) && (
                        <span className="text-text-muted/55"> · {parseUserAgent(log.userAgent)}</span>
                      )}
                      {log.deviceTag && (
                        <span className="text-text-muted/55 font-mono" title={log.userAgent ?? undefined}> · IP…{log.deviceTag}</span>
                      )}
                    </p>
                    {(log.entryTitle || metaTitle(log.metadata)) && (
                      <p className="text-[11px] text-text-muted/60 mt-0.5 italic truncate">
                        « {log.entryTitle ?? metaTitle(log.metadata)} »
                      </p>
                    )}
                    {meta && <MetaLine meta={meta} />}
                  </div>
                  {clickable && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 self-center text-text-muted/45">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {hasNextPage && (
          <div className="text-center mt-4">
            <button
              type="button"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="px-4 py-2 rounded-lg bg-text-muted/8 text-text-muted hover:text-text-primary text-xs font-medium transition-colors disabled:opacity-40"
            >
              {isFetchingNextPage ? 'Chargement…' : 'Afficher plus'}
            </button>
          </div>
        )}
      </div>

      {openEntryId && <LogEntryModal entryId={openEntryId} onClose={() => setOpenEntryId(null)} />}

      <BackToTop />
      <BottomNav />
    </div>
  );
}
