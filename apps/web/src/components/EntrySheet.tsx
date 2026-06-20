import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LocalEntry, type MediaTrack, type MediaMeta, type MediaStatus } from '../lib/db/schema';
import { trpc } from '../lib/trpc';
import { noteTint, resolveNoteTypeConfig } from './NoteTypePicker';
import { useNoteTypeDefs } from '../lib/useNoteTypeDefs';
import { AnnotatedReader } from './AnnotatedReader';
import { ReadGateReviewSection } from './ReadGateReviewSection';
import { cleanMarkdown as cleanContent } from '../lib/cleanMarkdown';
import { MusicNotePlayer } from './MusicNotePlayer';
import { QuizTaker } from './QuizTaker';
import { QuizResultsPanel } from './QuizResultsPanel';
import { MediaMetaPanel } from './MediaMetaPanel';
import { CustomFieldsEditor } from './CustomFieldsEditor';
import { CustomFieldsView } from './CustomFieldsView';
import { hasFilledCustomFields, type CustomFieldValues } from '../lib/customFields';
import { SeasonEpisodeTracker } from './SeasonEpisodeTracker';
import { getFontFamily, scaledFontSize } from '../lib/fonts';
import { adultUnlocked, sha256, checkHash } from '../lib/adultGate';
import { useBackButtonClose } from '../hooks/useBackButtonClose';

function formatDate(iso: string) {
  return new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** Texte de remplacement quand un item de Collection n'a ni résumé ni note rédigée. */
function itemPlaceholderText(status?: MediaStatus): string {
  switch (status) {
    case 'finished':  return 'Terminé — aucune note écrite.';
    case 'ongoing':   return 'En cours — aucune note écrite.';
    case 'abandoned': return 'Abandonné — aucune note écrite.';
    default:          return 'Pas encore lu — aucun résumé récupéré.';
  }
}

/**
 * Statut affiché pour un GROUPE (série multi-tomes). Dérivé des tomes :
 * une série n'est "Terminé" que si TOUS ses tomes le sont — et, si le nombre
 * total de tomes est connu, qu'ils sont tous présents. Sinon → "En cours".
 */
function derivedSeriesStatus(entries: LocalEntry[]): MediaStatus | undefined {
  const statuses = entries
    .map((e) => e.mediaMeta?.status)
    .filter((s): s is MediaStatus => !!s);
  if (statuses.length === 0) return undefined;
  // Un seul tome abandonné → la série entière est considérée abandonnée.
  if (statuses.some((s) => s === 'abandoned')) return 'abandoned';
  if (statuses.every((s) => s === 'finished')) {
    const total = entries[0]?.mediaMeta?.totalVolumes;
    if (total && entries.length < total) return 'ongoing';
    return 'finished';
  }
  if (statuses.every((s) => s === 'wishlist')) return 'wishlist';
  if (statuses.every((s) => s === 'owned' || s === 'wishlist')) return 'owned';
  return 'ongoing';
}


/**
 * Sheet d'édition des métadonnées d'un item de Collection (Entry collectionOnly).
 * Monte le MediaMetaPanel complet — résumé, note/5, statut, progression, volume…
 * L'item RESTE collectionOnly : on enrichit sans le faire apparaître dans le journal.
 */
function ItemMetaEditSheet({ entry, onClose, inline = false }: { entry: LocalEntry; onClose: () => void; inline?: boolean }) {
  useBackButtonClose(true, onClose);
  const { defsById } = useNoteTypeDefs();
  const live = useLiveQuery(() => db.entries.get(entry.id), [entry.id]);
  const current = live ?? entry;
  // Config résolu (label/couleur/glyph) — un type custom hérite de son built-in.
  const cfg = resolveNoteTypeConfig(current, defsById);
  // Champs personnalisés du type custom (vide pour les built-in → rien ne s'affiche).
  const fieldDefs = (current.customTypeId ? defsById[current.customTypeId]?.fields : undefined) ?? [];

  const handleChange = (meta: MediaMeta) => {
    void (async () => {
      const now = new Date().toISOString();
      await db.entries.update(entry.id, { mediaMeta: meta, updatedAt: now, _dirty: true });
      // `totalVolumes` / `totalSeasons` / `seriesStatus` sont des données de
      // SÉRIE : saisies sur un tome, elles s'appliquent à tous les tomes du groupe.
      const seriesName = meta.seriesName;
      if (!seriesName) return;
      const siblings = await db.entries
        .filter((e) =>
          e.id !== entry.id &&
          e.deletedAt === null &&
          e.noteType === entry.noteType &&
          e.mediaMeta?.seriesName === seriesName,
        )
        .toArray();
      await Promise.all(
        siblings
          .filter((s) =>
            s.mediaMeta?.totalVolumes !== meta.totalVolumes ||
            s.mediaMeta?.totalSeasons !== meta.totalSeasons ||
            s.mediaMeta?.seriesStatus !== meta.seriesStatus,
          )
          .map((s) =>
            db.entries.update(s.id, {
              mediaMeta: {
                ...s.mediaMeta,
                totalVolumes: meta.totalVolumes,
                totalSeasons: meta.totalSeasons,
                seriesStatus: meta.seriesStatus,
              },
              updatedAt: now,
              _dirty: true,
            }),
          ),
      );
    })();
  };

  if (inline) {
    return (
      <div className="absolute inset-0 z-10 flex flex-col bg-bg-elevated overflow-y-auto hide-scrollbar" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-text-muted/10 shrink-0">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide" style={{ color: cfg.color }}>
              <cfg.Glyph className="w-3 h-3 shrink-0" /> {cfg.label}
            </p>
            <h3 className="text-sm font-medium text-text-primary truncate">{current.mediaMeta?.subject ?? '—'}</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-text-muted/60 hover:text-text-primary hover:bg-text-muted/10 transition-colors shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          <MediaMetaPanel noteType={current.noteType} customTypeId={current.customTypeId} meta={current.mediaMeta ?? null} onChange={handleChange} entryId={entry.id} />
          {fieldDefs.length > 0 && (
            <CustomFieldsEditor
              fields={fieldDefs}
              values={(current.mediaMeta?.customFields ?? {}) as CustomFieldValues}
              onChange={(cf) => handleChange({ ...(current.mediaMeta ?? {}), customFields: cf })}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-bg-elevated rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90dvh] flex flex-col"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-text-muted/10 shrink-0">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide" style={{ color: cfg.color }}>
              <cfg.Glyph className="w-3 h-3 shrink-0" /> {cfg.label}
            </p>
            <h3 className="text-sm font-medium text-text-primary truncate">{current.mediaMeta?.subject ?? '—'}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted/60 hover:text-text-primary hover:bg-text-muted/10 transition-colors shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto scrollbar-soft px-5 py-4 flex flex-col gap-3">
          <MediaMetaPanel
            noteType={current.noteType}
            customTypeId={current.customTypeId}
            meta={current.mediaMeta ?? null}
            onChange={handleChange}
            entryId={entry.id}
          />
          {fieldDefs.length > 0 && (
            <CustomFieldsEditor
              fields={fieldDefs}
              values={(current.mediaMeta?.customFields ?? {}) as CustomFieldValues}
              onChange={(cf) => handleChange({ ...(current.mediaMeta ?? {}), customFields: cf })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

const ITEM_STATUSES: { value: 'wishlist' | 'owned' | 'ongoing' | 'finished'; label: string }[] = [
  { value: 'owned', label: 'Possédé' },
  { value: 'wishlist', label: 'Wishlist' },
  { value: 'ongoing', label: 'En cours' },
  { value: 'finished', label: 'Terminé' },
];

/**
 * Barre de statut pour un item de Collection.
 * - Owner → pills cliquables + bouton suppression.
 * - Guest → badge lecture seule (statut actuel uniquement).
 */
function ItemStatusBar({ entry }: { entry: LocalEntry }) {
  const { data: me } = trpc.auth.me.useQuery();
  const isOwner = me?.role === 'OWNER';
  // Lecture live depuis Dexie pour refléter les modifs en lot (owner uniquement).
  const live = useLiveQuery(() => db.entries.get(entry.id), [entry.id]);
  const current = live ?? entry;
  const status = current.mediaMeta?.status;
  // Suppression en deux temps : hooks toujours appelés (règle des hooks React).
  const [deleteArmed, setDeleteArmed] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Guest : affiche le statut en lecture seule.
  if (!isOwner) {
    if (!status) return null;
    const label = ITEM_STATUSES.find((s) => s.value === status)?.label ?? status;
    return (
      <div className="flex items-center gap-1 flex-wrap">
        <span className="px-2 py-0.5 rounded-full text-[11px] border border-accent/40 bg-accent/10 text-accent font-medium">
          {label}
        </span>
      </div>
    );
  }

  const apply = async (next: 'wishlist' | 'owned' | 'ongoing' | 'finished') => {
    await db.entries.update(entry.id, {
      mediaMeta: { ...(current.mediaMeta ?? {}), status: next },
      updatedAt: new Date().toISOString(),
      _dirty: true,
    });
  };
  const remove = () => {
    if (!deleteArmed) {
      setDeleteArmed(true);
      armTimer.current = setTimeout(() => setDeleteArmed(false), 3000);
      return;
    }
    if (armTimer.current) clearTimeout(armTimer.current);
    setDeleteArmed(false);
    const now = new Date().toISOString();
    void db.entries.update(entry.id, { deletedAt: now, updatedAt: now, _dirty: true });
  };
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {ITEM_STATUSES.map((s) => (
        <button
          key={s.value}
          type="button"
          onClick={() => void apply(s.value)}
          className={
            'px-2 py-0.5 rounded-full text-[11px] border transition-colors ' +
            (status === s.value
              ? 'border-accent/40 bg-accent/10 text-accent font-medium'
              : 'border-text-muted/15 text-text-muted hover:border-text-muted/30')
          }
        >
          {s.label}
        </button>
      ))}
      <button
        type="button"
        onClick={remove}
        title={deleteArmed ? 'Confirmer la suppression' : 'Supprimer ce tome de la collection'}
        aria-label={deleteArmed ? 'Confirmer la suppression' : 'Supprimer'}
        className={
          'ml-1 p-1 rounded-lg transition-colors ' +
          (deleteArmed ? 'text-danger bg-danger/10' : 'text-text-muted/55 hover:text-danger')
        }
      >
        {deleteArmed ? (
          <span className="text-[11px] font-medium px-0.5">Supprimer ?</span>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          </svg>
        )}
      </button>
    </div>
  );
}

/**
 * Bouton qui apparaît à côté de chaque entrée listée dans EntrySheet :
 *  - Note du journal → "Ouvrir" qui navigue vers /?entryId=...
 *  - Item de Collection (collectionOnly) :
 *      * Owner → "Démarrer la lecture" : bascule collectionOnly à false sur la
 *        MÊME entry → elle devient une vraie note. Navigation vers la note.
 *      * Confidant → "Pas de note associée" (en pratique jamais affiché car les
 *        items collectionOnly ne sont pas partagés).
 */
function OpenEntryButton({
  entry,
  onClose,
  onEditItem,
  onOpenNote,
}: {
  entry: LocalEntry;
  onClose: () => void;
  onEditItem?: (entry: LocalEntry) => void;
  onOpenNote?: (entry: LocalEntry) => void;
}) {
  const navigate = useNavigate();
  const { data: me } = trpc.auth.me.useQuery();
  const isOwner = me?.role === 'OWNER';

  if (!entry.collectionOnly) {
    return (
      <button
        type="button"
        onClick={() => {
          if (onOpenNote) { onOpenNote(entry); return; }
          onClose(); navigate(`/?entryId=${entry.id}`);
        }}
        className="flex items-center gap-1 text-[11px] text-accent/70 hover:text-accent transition-colors shrink-0 font-medium"
        title="Ouvrir l'entrée"
      >
        Ouvrir
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </button>
    );
  }

  if (!isOwner) {
    return (
      <span className="text-[11px] italic text-text-muted/50 shrink-0">
        Pas de note associée
      </span>
    );
  }

  // L'item de Collection devient une vraie note : on bascule juste le flag.
  // Aucune copie de données — l'entry, son mediaMeta et son id sont conservés.
  const promoteToNote = async () => {
    const now = new Date().toISOString();
    await db.entries.update(entry.id, {
      collectionOnly: false,
      isDraft: true,
      date: now.slice(0, 10), // ancrer la note à aujourd'hui
      updatedAt: now,
      _dirty: true,
    });
    onClose();
    navigate(`/?newEntry=${entry.id}`);
  };

  return (
    <div className="flex items-center gap-3 shrink-0">
      {onEditItem && (
        <button
          type="button"
          onClick={() => onEditItem(entry)}
          className="flex items-center gap-1 text-[11px] text-text-muted/70 hover:text-accent transition-colors font-medium"
          title="Éditer les métadonnées sans créer de note"
        >
          Éditer
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
          </svg>
        </button>
      )}
      <button
        type="button"
        onClick={() => void promoteToNote()}
        className="flex items-center gap-1 text-[11px] text-accent/70 hover:text-accent transition-colors font-medium"
        title="Démarrer la lecture : transforme cet item en note du journal"
      >
        Créer une note
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

export type BulkMetaPatch = {
  seriesName?: string;
  // Champs musicaux (édition d'un morceau)
  subject?: string;
  creator?: string;
  trackTitle?: string;
  coverUrl?: string;
  rating?: number;
};

interface EntrySheetProps {
  entries: LocalEntry[];
  onClose: () => void;
  /** Appelé avec les nouvelles métadonnées à appliquer à tous les entries du groupe */
  onBulkMetaEdit?: (patch: BulkMetaPatch) => void;
  /** Titre d'affichage du groupe (seriesName si défini, ou subject d'une track) */
  displayTitle?: string;
  /** Si présent, ce sheet représente UN morceau MUSIC (mono + tracks de playlists confondus) */
  trackMeta?: MediaTrack;
  /** Index initial dans la playlist du représentative (pour ouvrir le player sur la bonne track) */
  trackIndex?: number;
  /** Toutes les occurrences du morceau (1 mono ou 1 track-in-playlist par instance) */
  trackInstances?: Array<{ entry: LocalEntry; trackIndex?: number; trackMeta?: MediaTrack }>;
  /** Si présent, ce sheet représente un GROUPE D'ARTISTE (plusieurs morceaux du même artiste) */
  artistName?: string;
  /** Nombre de morceaux distincts dans le groupe artiste */
  songCount?: number;
  /** Si présent, le sheet affiche un bouton "Ajouter d'autres tomes" — déclenché quand
   *  le groupe vient de la Collection (items sans note). Le caller ouvre la sheet d'ajout
   *  pré-remplie. */
  onAddMoreVolumes?: () => void;
  /** Si vrai, rendu inline sans backdrop ni positionnement fixe (panneau desktop). */
  inline?: boolean;
}

export function EntrySheet({ entries: entriesProp, onClose, onBulkMetaEdit, displayTitle, trackMeta, trackIndex, trackInstances, artistName, songCount, onAddMoreVolumes, inline = false }: EntrySheetProps) {
  // Liste vivante : on relit les entrées depuis Dexie pour que la suppression
  // d'un tome (ou une modif de statut) depuis le sheet se reflète aussitôt,
  // sans rester sur le snapshot figé passé en prop.
  const propIds = entriesProp.map((e) => e.id).join(',');
  const liveEntries = useLiveQuery(
    () =>
      db.entries
        .bulkGet(entriesProp.map((e) => e.id))
        .then((rows) => rows.filter((r): r is LocalEntry => !!r && r.deletedAt === null)),
    [propIds],
  );
  // Pour les guests, les données viennent de l'API (pas de Dexie local).
  // liveEntries sera [] car les IDs n'existent pas en base locale → on reste
  // sur entriesProp. On ne ferme que si les entrées existaient dans Dexie
  // et ont ensuite été supprimées (hadLive = true puis length = 0).
  const hadLive = useRef(false);
  useEffect(() => {
    if (liveEntries && liveEntries.length > 0) hadLive.current = true;
  }, [liveEntries]);
  const entries = (liveEntries && liveEntries.length > 0) ? liveEntries : entriesProp;
  // Tous les tomes supprimés → plus rien à afficher, on ferme le sheet.
  useEffect(() => {
    if (liveEntries && liveEntries.length === 0 && hadLive.current) onClose();
  }, [liveEntries, onClose]);

  const rep = entries[0] ?? entriesProp[0]!;
  // Config résolu (affichage : label/couleur/glyph) + `behavior` hérité pour le
  // branchement structuré. Le `rep.noteType` brut reste utilisé pour le
  // regroupement par siblings (comparaison du type stocké).
  const { defsById } = useNoteTypeDefs();
  const cfg = resolveNoteTypeConfig(rep, defsById);
  const behavior = cfg.behavior;
  // Champs personnalisés du type custom (même type pour tous les tomes du groupe).
  const groupFieldDefs = (rep.customTypeId ? defsById[rep.customTypeId]?.fields : undefined) ?? [];
  // En mode track, on affiche les méta de la track (pas du parent)
  const m = trackMeta ? (trackMeta as typeof rep.mediaMeta & object) : (rep.mediaMeta ?? {});

  const [openedNote, setOpenedNote] = useState<LocalEntry | null>(null);
  const [editingMeta, setEditingMeta] = useState(false);
  const [seriesInput, setSeriesInput] = useState(m.seriesName ?? '');
  // DEV : parties / chapitres repliés par défaut (contenu long). Sets des éléments OUVERTS.
  const [openParts, setOpenParts] = useState<Set<string>>(new Set());
  const [openChapters, setOpenChapters] = useState<Set<string>>(new Set());
  const togglePart = (k: string) => setOpenParts((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const toggleChapter = (id: string) => setOpenChapters((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // Édition musicale (visible quand behavior === 'MUSIC')
  const [editSubject, setEditSubject] = useState(m.subject ?? '');
  const [editCreator, setEditCreator] = useState(m.creator ?? '');
  const [editAlbum, setEditAlbum] = useState(m.trackTitle ?? '');
  const [editCover, setEditCover] = useState(m.coverUrl ?? '');
  const [editRating, setEditRating] = useState<number | undefined>(m.rating);
  const seriesRef = useRef<HTMLInputElement>(null);
  const firstMusicRef = useRef<HTMLInputElement>(null);
  // Item de Collection en cours d'édition de métadonnées (reste collectionOnly)
  const [metaEditEntry, setMetaEditEntry] = useState<LocalEntry | null>(null);

  // ── Read gate : verrouille si une entrée a un prompt non approuvé (guests uniquement) ──
  const gateUtils = trpc.useUtils();
  const respondToGate = trpc.readGate.respond.useMutation({
    onSuccess: () => {
      // Refetch obligatoire — sinon le cache garde le contentMd vide
      // (cf. `applyReadGate` côté serveur) et la note semble toujours verrouillée
      // jusqu'au prochain refetch périodique (~2 min).
      void gateUtils.entries.list.invalidate();
      void gateUtils.entries.byId.invalidate();
    },
  });
  const [readGateResponse, setReadGateResponse] = useState('');
  const [readGateSubmitting, setReadGateSubmitting] = useState(false);
  const [readGateLocalStatus, setReadGateLocalStatus] = useState<'pending' | 'approved' | null>(null);

  const readGateEntry = entries.find((e) => {
    const e2 = e as LocalEntry & { readGateStatus?: string; readGatePrompt?: string | null };
    return e2.readGatePrompt && (readGateLocalStatus !== 'approved') && e2.readGateStatus !== 'approved';
  }) as (LocalEntry & { readGateStatus?: string; readGatePrompt?: string | null }) | undefined;
  // Priorité au serveur quand il a tranché — le local optimiste 'pending' ne
  // doit pas masquer un 'rejected'/'approved' arrivé par SSE.
  const serverGateStatus = readGateEntry?.readGateStatus;
  const readGateStatus = (
    serverGateStatus === 'rejected' || serverGateStatus === 'approved'
      ? serverGateStatus
      : (readGateLocalStatus ?? serverGateStatus)
  );
  // Sync : jette le local dès que le serveur tranche définitivement.
  useEffect(() => {
    if (serverGateStatus === 'rejected' || serverGateStatus === 'approved') {
      setReadGateLocalStatus(null);
    }
  }, [serverGateStatus]);

  const handleReadGateSubmit = async () => {
    const resp = readGateResponse.trim();
    if (!resp || !readGateEntry) return;
    setReadGateSubmitting(true);
    try {
      const result = await respondToGate.mutateAsync({ entryId: readGateEntry.id, response: resp });
      setReadGateLocalStatus(result.approved === true ? 'approved' : 'pending');
    } catch { /* ignore */ }
    finally { setReadGateSubmitting(false); }
  };

  // ── 18+ gate : verrouille l'ensemble du sheet si une entrée est 18+ non déverrouillée ──
  const lockedEntries = entries.filter((e) => e.isAdult && !adultUnlocked.has(e.id));
  const [gatePassed, setGatePassed] = useState(lockedEntries.length === 0);
  const [gateAnswer, setGateAnswer] = useState('');
  const [gateError, setGateError] = useState(false);
  // On utilise l'entrée la plus récente comme "représentante" pour la question/réponse
  const gateEntry = lockedEntries[0];
  // Track les ids déverrouillés VIA cette sheet pour les re-locker à la fermeture
  // (sans toucher à ceux déverrouillés ailleurs dans la même session).
  const unlockedByThisSheet = useRef<Set<string>>(new Set());

  const handleGateSubmit = async () => {
    if (!gateEntry) return;
    if (await checkHash(gateAnswer, gateEntry.adultAnswerHash ?? '')) {
      // Déverrouille toutes les entrées du groupe qui ont le même hash
      for (const e of entries) {
        if (e.isAdult && e.adultAnswerHash === gateEntry.adultAnswerHash) {
          if (!adultUnlocked.has(e.id)) unlockedByThisSheet.current.add(e.id);
          adultUnlocked.add(e.id);
        }
      }
      setGatePassed(true);
      setGateError(false);
      setGateAnswer('');
    } else {
      setGateError(true);
    }
  };

  // Re-verrouille les entrées déverrouillées par cette sheet, à la fermeture.
  // La question sera redemandée à la prochaine ouverture — comportement aligné
  // avec EntryCard (voir closeModal là-bas).
  useEffect(() => {
    return () => {
      for (const id of unlockedByThisSheet.current) {
        adultUnlocked.delete(id);
      }
    };
  }, []);

  useEffect(() => {
    if (!editingMeta) return;
    setTimeout(() => {
      if (behavior === 'MUSIC') firstMusicRef.current?.focus();
      else seriesRef.current?.focus();
    }, 50);
  }, [editingMeta, behavior]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Back natif (Android/iOS) → ferme la sheet au lieu de changer d'URL.
  useBackButtonClose(true, onClose);

  const handleSaveMeta = () => {
    if (behavior === 'MUSIC') {
      onBulkMetaEdit?.({
        subject: editSubject.trim() || undefined,
        creator: editCreator.trim() || undefined,
        trackTitle: editAlbum.trim() || undefined,
        coverUrl: editCover.trim() || undefined,
        rating: editRating,
      });
    } else {
      onBulkMetaEdit?.({ seriesName: seriesInput.trim() || undefined });
    }
    setEditingMeta(false);
  };

  const isArtistGroup = !!artistName && (songCount ?? 0) > 1;
  const title = isArtistGroup
    ? artistName!
    : (displayTitle ?? (behavior === 'MUSIC' && m.trackTitle ? m.trackTitle : m.subject ?? rep.title ?? '—'));
  const subtitle = isArtistGroup
    ? `${songCount} morceaux`
    : behavior === 'MUSIC' && m.trackTitle
      ? [m.subject, m.creator].filter(Boolean).join(' · ')
      : m.creator;

  // Pour le thread : ordre chronologique (plus ancien en premier).
  // Exception DEV : ordre explicite par Partie (volume) puis Chapitre.
  const thread = [...entries].sort((a, b) => {
    if (behavior === 'DEV') {
      const pa = a.mediaMeta?.volume ?? 0, pb = b.mediaMeta?.volume ?? 0;
      if (pa !== pb) return pa - pb;
      const ca = a.mediaMeta?.chapter ?? 0, cb = b.mediaMeta?.chapter ?? 0;
      if (ca !== cb) return ca - cb;
    }
    // QUIZZ : ordre explicite par n° (volume) du quizz dans le thème.
    if (behavior === 'QUIZZ') {
      const va = a.mediaMeta?.volume ?? 0, vb = b.mediaMeta?.volume ?? 0;
      if (va !== vb) return va - vb;
    }
    return a.date.localeCompare(b.date);
  });

  // Items à rendre dans le body : pour un groupe musical, chaque "instance" (mono ou track-in-playlist),
  // sinon une instance par entrée du thread.
  const items: Array<{ entry: LocalEntry; trackIndex?: number }> = trackInstances
    ? [...trackInstances].sort((a, b) => a.entry.date.localeCompare(b.entry.date))
    : thread.map((e) => ({ entry: e }));

  // Clé de regroupement selon le type : tome pour les livres, saison pour les séries TV, film n° pour les films
  const groupKey = (e: typeof thread[number]): number | null => {
    if (behavior === 'SERIES') return e.mediaMeta?.season ?? null;
    return e.mediaMeta?.volume ?? null; // BOOK, MOVIE (et autres si jamais)
  };
  const groupLabel = (key: number | null, groupEntries?: LocalEntry[]): string => {
    if (behavior === 'DEV') {
      if (key == null) return 'Sans partie';
      const partName = groupEntries?.find((e) => e.mediaMeta?.partName)?.mediaMeta?.partName;
      return `Partie ${key}${partName ? ` — ${partName}` : ''}`;
    }
    if (behavior === 'SERIES') {
      const total = rep.mediaMeta?.totalSeasons;
      if (key == null) return 'Sans saison';
      return `Saison ${key}${total ? ` / ${total}` : ''}`;
    }
    if (behavior === 'MOVIE') {
      const total = rep.mediaMeta?.totalVolumes;
      if (key == null) return 'Sans numéro';
      return `Film ${key}${total ? ` / ${total}` : ''}`;
    }
    const total = rep.mediaMeta?.totalVolumes;
    if (key == null) return 'Sans tome';
    return `Tome ${key}${total ? ` / ${total}` : ''}`;
  };

  // Regroupement par tome/saison si plusieurs valeurs distinctes
  const volumeGroups = (() => {
    const map = new Map<number | null, typeof thread>();
    for (const e of thread) {
      const key = groupKey(e);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      return a - b;
    });
  })();
  const hasMultipleVolumes = (behavior === 'BOOK' || behavior === 'SERIES' || behavior === 'MOVIE' || behavior === 'DEV')
    && (volumeGroups.length > 1 || (volumeGroups[0]?.[0] != null));

  // ── Read gate : si le guest n'a pas encore répondu/été approuvé, on rend UNIQUEMENT le formulaire ──
  if (readGateEntry && readGateStatus && readGateStatus !== 'approved') {
    const gatePrompt = readGateEntry.readGatePrompt;
    return (
      <>
        {!inline && <div className="fixed inset-0 z-40 bg-bg-primary/60 backdrop-blur-sm" onClick={onClose} />}
        <div className={inline ? 'flex flex-col h-full overflow-y-auto scrollbar-soft' : 'fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] flex flex-col bg-bg-elevated rounded-t-3xl shadow-2xl'}>
          {!inline && <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="w-10 h-1 rounded-full bg-text-muted/20" /></div>}
          <div className="px-6 pt-8 pb-10 flex flex-col items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /><circle cx="12" cy="16" r="1" fill="currentColor" />
              </svg>
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold text-text-primary mb-1">Condition de lecture</h2>
              <p className="text-sm text-text-muted">
                {readGateStatus === 'pending' ? "Ta réponse a été envoyée. En attente de validation." : readGateStatus === 'rejected' ? "Ta demande d'accès a été refusée." : "Réponds à la condition de l'auteur pour accéder à cette entrée."}
              </p>
            </div>
            {gatePrompt && readGateStatus === 'awaiting' && (
              <div className="w-full max-w-sm rounded-2xl border border-accent/20 bg-accent/5 px-4 py-3 text-center">
                <p className="text-sm text-accent/80 font-medium">{gatePrompt}</p>
              </div>
            )}
            {readGateStatus === 'awaiting' && (
              <div className="w-full max-w-sm flex flex-col gap-2">
                <input type="text" value={readGateResponse} onChange={(e) => setReadGateResponse(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void handleReadGateSubmit(); }}
                  placeholder="Ta réponse…" autoFocus
                  className="w-full bg-bg-primary/80 border border-text-muted/15 rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted/55 outline-none focus:border-accent/40 transition-colors" />
                <button type="button" onClick={() => void handleReadGateSubmit()} disabled={!readGateResponse.trim() || readGateSubmitting}
                  className="w-full py-2.5 rounded-xl text-sm font-medium bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-40 transition-colors">
                  {readGateSubmitting ? 'Envoi…' : 'Envoyer'}
                </button>
                <button type="button" onClick={onClose} className="text-xs text-text-muted/50 hover:text-text-muted transition-colors text-center mt-1">Annuler</button>
              </div>
            )}
            {(readGateStatus === 'pending' || readGateStatus === 'rejected') && (
              <button type="button" onClick={onClose} className="text-sm text-text-muted/60 hover:text-text-muted transition-colors">Fermer</button>
            )}
          </div>
        </div>
      </>
    );
  }

  // ── Gate 18+ : si verrouillé, on ne rend QUE le formulaire d'unlock ──
  if (!gatePassed && gateEntry) {
    return (
      <>
        {!inline && <div className="fixed inset-0 z-40 bg-bg-primary/60 backdrop-blur-sm" onClick={onClose} />}
        <div className={inline ? 'flex flex-col h-full overflow-y-auto scrollbar-soft' : 'fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] flex flex-col bg-bg-elevated rounded-t-3xl shadow-2xl'}>
          {!inline && (
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-text-muted/20" />
            </div>
          )}
          <div className="px-6 pt-8 pb-10 flex flex-col items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-adult/10 flex items-center justify-center">
              <span className="text-3xl">🔞</span>
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold text-text-primary mb-1">Contenu sensible</h2>
              <p className="text-sm text-text-muted">Réponds à la question pour accéder à cette entrée.</p>
            </div>
            {gateEntry.adultQuestion && (
              <div className="w-full max-w-sm rounded-2xl border border-adult/20 bg-adult/5 px-4 py-3 text-center">
                <p className="text-sm text-orange-300 font-medium">{gateEntry.adultQuestion}</p>
              </div>
            )}
            <div className="w-full max-w-sm flex flex-col gap-2">
              <input
                type="text"
                value={gateAnswer}
                onChange={(e) => { setGateAnswer(e.target.value); setGateError(false); }}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleGateSubmit(); }}
                placeholder="Ta réponse…"
                autoFocus
                className={`w-full bg-bg-primary/80 border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted/55 outline-none transition-colors ${gateError ? 'border-danger/50 focus:border-danger' : 'border-text-muted/15 focus:border-orange-400/50'}`}
              />
              {gateError && (
                <p className="text-xs text-danger text-center">Réponse incorrecte, réessaie.</p>
              )}
              <button
                type="button"
                onClick={() => void handleGateSubmit()}
                disabled={!gateAnswer.trim()}
                className="w-full py-2.5 rounded-xl text-sm font-medium bg-adult/15 text-adult hover:bg-adult/25 disabled:opacity-40 transition-colors"
              >
                Vérifier
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-text-muted/50 hover:text-text-muted transition-colors text-center mt-1"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Callback pour ouvrir une note inline (desktop panel uniquement)
  const handleOpenNote = inline ? (entry: LocalEntry) => setOpenedNote(entry) : undefined;

  return (
    <>
      {/* Backdrop */}
      {!inline && <div className="fixed inset-0 z-40 bg-bg-primary/60 backdrop-blur-sm" onClick={onClose} />}

      {/* Sheet */}
      <div className={inline ? 'relative flex flex-col h-full' : 'fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] flex flex-col bg-bg-elevated rounded-t-3xl shadow-2xl'}>
        {/* Handle */}
        {!inline && (
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-text-muted/20" />
          </div>
        )}

        {/* Header */}
        <div className="px-5 pt-2 pb-4 border-b border-text-muted/10 shrink-0">
          <div className="flex items-start gap-3">
            {m.coverUrl ? (
              <img src={m.coverUrl} alt={title} className="w-12 h-16 object-cover rounded shadow-sm shrink-0" />
            ) : (
              <span className="w-12 h-12 flex items-center justify-center rounded-xl shrink-0"
                style={{ backgroundColor: noteTint(cfg.color, 9), color: cfg.color }}>
                <cfg.Glyph className="w-5 h-5" />
              </span>
            )}
            <div className="flex-1 min-w-0 pt-0.5">
              <p className="text-text-primary font-medium text-base leading-snug">{title}</p>
              {subtitle && <p className="text-text-muted text-sm mt-0.5 line-clamp-1">{subtitle}</p>}
              {entries.length === 1 && (
                <p className="text-text-muted/50 text-xs mt-1">{formatDate(rep.date)}</p>
              )}
              {entries.length > 1 && (() => {
                // DEV : « X / total chapitres » (total = max des totalChapters renseignés).
                if (behavior === 'DEV') {
                  const total = Math.max(0, ...entries.map((e) => e.mediaMeta?.totalChapters ?? 0));
                  return <p className="text-text-muted/50 text-xs mt-1">{entries.length}{total > 0 ? ` / ${total}` : ''} chapitres</p>;
                }
                if (behavior === 'QUIZZ') {
                  const total = Math.max(0, ...entries.map((e) => e.mediaMeta?.totalVolumes ?? 0));
                  return <p className="text-text-muted/50 text-xs mt-1">{entries.length}{total > 0 ? ` / ${total}` : ''} quizz</p>;
                }
                return <p className="text-text-muted/50 text-xs mt-1">{entries.length} entrées</p>;
              })()}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {onBulkMetaEdit && (
                <button type="button" onClick={() => {
                  setSeriesInput(m.seriesName ?? '');
                  setEditSubject(m.subject ?? '');
                  setEditCreator(m.creator ?? '');
                  setEditAlbum(m.trackTitle ?? '');
                  setEditCover(m.coverUrl ?? '');
                  setEditRating(m.rating);
                  setEditingMeta((v) => !v);
                }}
                  title="Modifier les métadonnées du groupe"
                  className={`p-1.5 rounded-lg transition-colors ${editingMeta ? 'text-accent bg-accent/10' : 'text-text-muted/50 hover:text-text-muted'}`}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              )}
              <button type="button" onClick={onClose}
                className="text-text-muted/50 hover:text-text-muted transition-colors p-1 shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Meta badges */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {(() => {
              // Pour une série (groupe multi-tomes), le statut est dérivé des tomes :
              // "Terminé" seulement si tous les tomes le sont. Sinon → statut du rep.
              const badgeStatus = (!trackMeta && !artistName && entries.length > 1)
                ? derivedSeriesStatus(entries)
                : (m.status as MediaStatus | undefined);
              if (!badgeStatus) return null;
              return (
                <span className="text-[11px] px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: noteTint(cfg.color, 9), color: cfg.color }}>
                  {{ wishlist: 'Souhaité', owned: 'Possédé', ongoing: 'En cours', finished: 'Terminé', abandoned: 'Abandonné' }[badgeStatus] ?? badgeStatus}
                </span>
              );
            })()}
            {m.rating && (
              <span className="text-xs" style={{ color: cfg.color }}>
                {'★'.repeat(m.rating as number)}{'☆'.repeat(5 - (m.rating as number))}
              </span>
            )}
          </div>

          {/* Bouton "Ajouter d'autres tomes" — affiché quand le groupe est une série
              collection (geste rapide pour étendre la saga sans re-rechercher). */}
          {onAddMoreVolumes && (
            <div className="mt-2.5">
              <button
                type="button"
                onClick={onAddMoreVolumes}
                className="inline-flex items-center gap-1.5 text-[11px] text-accent hover:text-accent/80 underline underline-offset-2"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Ajouter d'autres tomes
              </button>
            </div>
          )}

        </div>

        {/* Scrollable content */}
        <div className={`flex-1 overflow-y-auto ${inline ? 'hide-scrollbar' : 'scrollbar-soft'}`}>

          {/* Résumé du groupe — dans la zone scrollable pour ne pas écraser le contenu */}
          {m.description && (
            <p className="text-text-muted text-xs leading-relaxed px-5 pt-4 pb-2">{m.description}</p>
          )}

          {/* Panneau édition groupée — dans la zone scrollable */}
          {editingMeta && (
            <div className="px-5 pt-3 pb-4 border-b border-text-muted/10">
              <p className="text-xs text-text-muted/60 mb-2">
                {behavior === 'MUSIC' && trackInstances
                  ? `Appliqué à ${trackInstances.length} occurrence${trackInstances.length > 1 ? 's' : ''}`
                  : `Appliqué à ${entries.length} entrée${entries.length > 1 ? 's' : ''}`}
              </p>
              {behavior === 'MUSIC' ? (
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[11px] text-text-muted/50 uppercase tracking-wide">Titre</span>
                      <input
                        ref={firstMusicRef}
                        type="text"
                        value={editSubject}
                        placeholder="Titre du morceau…"
                        onChange={(e) => setEditSubject(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Escape') setEditingMeta(false); }}
                        className="bg-bg-primary rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/55 outline-none border border-text-muted/15 focus:border-accent/40 transition-colors"
                      />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[11px] text-text-muted/50 uppercase tracking-wide">Artiste</span>
                      <input
                        type="text"
                        value={editCreator}
                        placeholder="Artiste…"
                        onChange={(e) => setEditCreator(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Escape') setEditingMeta(false); }}
                        className="bg-bg-primary rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/55 outline-none border border-text-muted/15 focus:border-accent/40 transition-colors"
                      />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[11px] text-text-muted/50 uppercase tracking-wide">Album</span>
                      <input
                        type="text"
                        value={editAlbum}
                        placeholder="Album…"
                        onChange={(e) => setEditAlbum(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Escape') setEditingMeta(false); }}
                        className="bg-bg-primary rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/55 outline-none border border-text-muted/15 focus:border-accent/40 transition-colors"
                      />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[11px] text-text-muted/50 uppercase tracking-wide">Cover URL</span>
                      <input
                        type="text"
                        value={editCover}
                        placeholder="https://…"
                        onChange={(e) => setEditCover(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Escape') setEditingMeta(false); }}
                        className="bg-bg-primary rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/55 outline-none border border-text-muted/15 focus:border-accent/40 transition-colors"
                      />
                    </label>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setEditRating(editRating === n ? undefined : n)}
                          className="text-lg transition-opacity"
                          style={{ color: cfg.color, opacity: editRating !== undefined && n <= editRating ? 1 : 0.2 }}
                        >★</button>
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      <button type="button" onClick={handleSaveMeta}
                        className="px-3 py-1.5 rounded-lg bg-accent text-bg-primary text-xs font-medium">
                        Enregistrer
                      </button>
                      <button type="button" onClick={() => setEditingMeta(false)}
                        className="px-3 py-1.5 rounded-lg bg-text-muted/10 text-text-muted text-xs">
                        Annuler
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="text-[11px] text-text-muted/50 uppercase tracking-wide">Série</label>
                    <input
                      ref={seriesRef}
                      type="text"
                      value={seriesInput}
                      placeholder="Nom de la saga / série…"
                      onChange={(e) => setSeriesInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveMeta(); if (e.key === 'Escape') setEditingMeta(false); }}
                      className="w-full bg-bg-primary rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/55 outline-none border border-text-muted/15 focus:border-accent/40 transition-colors mt-0.5"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0 pt-4">
                    <button type="button" onClick={handleSaveMeta}
                      className="px-3 py-1.5 rounded-lg bg-accent text-bg-primary text-xs font-medium">
                      OK
                    </button>
                    <button type="button" onClick={() => setEditingMeta(false)}
                      className="px-3 py-1.5 rounded-lg bg-text-muted/10 text-text-muted text-xs">
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {hasMultipleVolumes ? (
            /* Vue multi-tomes : une section par tome */
            <div className="flex flex-col">
              {volumeGroups.map(([vol, groupEntries]) => {
                const partKey = String(vol ?? 'no-vol');
                const isDev = behavior === 'DEV';
                const multiPart = volumeGroups.length > 1;
                const partOpen = !multiPart || openParts.has(partKey);
                const thumbUrl = groupEntries.find((e) => e.mediaMeta?.coverUrl)?.mediaMeta?.coverUrl;
                return (
                <div key={vol ?? 'no-vol'} className="border-b border-text-muted/10 last:border-0">
                  {/* En-tête : repliable s'il y a plusieurs tomes/parties (replié par
                      défaut), sinon statique (un seul tome → contenu affiché direct). */}
                  {multiPart ? (
                    <button
                      type="button"
                      onClick={() => togglePart(partKey)}
                      className="w-full px-5 pt-4 pb-2 flex items-center gap-3 text-left hover:bg-text-muted/5 transition-colors"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-text-muted/50 transition-transform ${partOpen ? '' : '-rotate-90'}`}><polyline points="6 9 12 15 18 9"/></svg>
                      {thumbUrl ? (
                        <img src={thumbUrl} alt="" className="w-7 h-10 object-cover rounded shadow-sm shrink-0" />
                      ) : (
                        <span className="w-7 h-10 flex items-center justify-center rounded shrink-0" style={{ backgroundColor: noteTint(cfg.color, 9), color: cfg.color }}>
                          <cfg.Glyph className="w-4 h-4" />
                        </span>
                      )}
                      <span className="text-xs font-semibold flex-1 min-w-0 truncate" style={{ color: cfg.color }}>{groupLabel(vol, groupEntries)}</span>
                      {(isDev || groupEntries.length > 1) && (
                        <span className="text-[11px] text-text-muted/50 shrink-0">{groupEntries.length} {isDev ? 'chap.' : 'lectures'}</span>
                      )}
                    </button>
                  ) : (
                    <div className="px-5 pt-4 pb-2 flex items-center gap-3">
                      {thumbUrl ? (
                        <img src={thumbUrl} alt={groupLabel(vol, groupEntries)} className="w-8 h-12 object-cover rounded shadow-sm shrink-0" />
                      ) : (
                        <span className="w-8 h-12 flex items-center justify-center rounded shrink-0"
                          style={{ backgroundColor: noteTint(cfg.color, 9), color: cfg.color }}>
                          <cfg.Glyph className="w-4 h-4" />
                        </span>
                      )}
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-semibold" style={{ color: cfg.color }}>
                          {groupLabel(vol, groupEntries)}
                        </span>
                        {groupEntries.length > 1 && (
                          <span className="text-[11px] text-text-muted/50">
                            {groupEntries.length} {isDev ? 'chapitres' : 'lectures'}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {/* Corps DEV : chapitres repliables, repliés par défaut */}
                  {isDev && partOpen && (
                    <div className="flex flex-col divide-y divide-text-muted/10 border-t border-text-muted/10">
                      {groupEntries.map((e) => {
                        const chOpen = openChapters.has(e.id);
                        return (
                          <div key={e.id}>
                            <button
                              type="button"
                              onClick={() => toggleChapter(e.id)}
                              className="w-full px-5 py-3 flex items-center gap-2 text-left hover:bg-text-muted/5 transition-colors"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-text-muted/55 transition-transform ${chOpen ? '' : '-rotate-90'}`}><polyline points="6 9 12 15 18 9"/></svg>
                              <span className="text-xs font-medium text-text-muted flex-1 min-w-0 truncate">
                                {`Ch. ${e.mediaMeta?.chapter ?? '?'}${e.mediaMeta?.subject ? ` · ${e.mediaMeta.subject}` : ''}`}
                              </span>
                            </button>
                            {chOpen && (
                              <div className="px-5 pb-4" style={{ fontFamily: getFontFamily(e.font), fontSize: scaledFontSize(e.font, e.fontSize ?? '17px') }}>
                                <div className="flex justify-end mb-3">
                                  <OpenEntryButton entry={e} onClose={onClose} onEditItem={setMetaEditEntry} onOpenNote={handleOpenNote} />
                                </div>
                                {!e.contentMd && (
                                  <p className="text-text-muted/50 italic text-sm mb-3">Aucun contenu rédigé.</p>
                                )}
                                <AnnotatedReader
                                  entryId={e.id}
                                  contentMd={e.contentMd ? cleanContent(e.contentMd) : ''}
                                  commentsLocked={false}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Entrées du tome (non-DEV) — masquées si la partie est repliée */}
                  {!isDev && partOpen && (groupEntries.length === 1 ? (
                    <div className="px-5 pb-4"
                      style={{ fontFamily: getFontFamily(groupEntries[0]!.font), fontSize: scaledFontSize(groupEntries[0]!.font, groupEntries[0]!.fontSize ?? '17px') }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs text-text-muted/50 capitalize">
                          {groupEntries[0]!.collectionOnly ? 'Item de collection' : formatDate(groupEntries[0]!.date)}
                        </p>
                        <OpenEntryButton entry={groupEntries[0]!} onClose={onClose} onEditItem={setMetaEditEntry} onOpenNote={handleOpenNote} />
                      </div>
                      {/* Edition rapide statut + suppression pour les items collection (owner only) */}
                      {groupEntries[0]!.collectionOnly && (
                        <div className="mb-3">
                          <ItemStatusBar entry={groupEntries[0]!} />
                        </div>
                      )}
                      {/* Pour un item collection : pas de contenu rédigé mais on
                          affiche le résumé du tome récupéré depuis l'API. */}
                      {groupEntries[0]!.collectionOnly && groupEntries[0]!.mediaMeta?.description ? (
                        <p className="text-text-muted text-sm leading-relaxed">{groupEntries[0]!.mediaMeta.description}</p>
                      ) : !groupEntries[0]!.contentMd ? (
                        <p className="text-text-muted/50 italic text-sm mb-3">
                          {groupEntries[0]!.collectionOnly ? itemPlaceholderText(groupEntries[0]!.mediaMeta?.status) : 'Aucun contenu rédigé.'}
                        </p>
                      ) : null}
                      {/* Suivi saison/épisode pour une série de collection */}
                      {groupEntries[0]!.collectionOnly && behavior === 'SERIES' && (
                        <div className="mt-4">
                          <SeasonEpisodeTracker entryId={groupEntries[0]!.id} />
                        </div>
                      )}
                      {!groupEntries[0]!.collectionOnly && (
                        <AnnotatedReader
                          entryId={groupEntries[0]!.id}
                          contentMd={groupEntries[0]!.contentMd ? cleanContent(groupEntries[0]!.contentMd) : ''}
                          commentsLocked={false}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col divide-y divide-text-muted/10">
                      {groupEntries.map((e) => (
                        <div key={e.id} className="px-5 py-4">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-medium text-text-muted capitalize">
                              {/* Bloc !isDev (cf. plus haut) → la branche DEV est inatteignable ici. */}
                              {behavior === 'SERIES'
                                ? [e.mediaMeta?.progressCurrent != null ? `E${e.mediaMeta.progressCurrent}` : null, e.mediaMeta?.subject || null, formatDate(e.date)].filter(Boolean).join(' · ')
                                : formatDate(e.date)}
                            </p>
                            <OpenEntryButton entry={e} onClose={onClose} onEditItem={setMetaEditEntry} onOpenNote={handleOpenNote} />
                          </div>
                          <div style={{ fontFamily: getFontFamily(e.font), fontSize: scaledFontSize(e.font, e.fontSize ?? '17px') }}>
                            {!e.contentMd && (
                              <p className="text-text-muted/50 italic text-sm mb-3">Aucun contenu rédigé.</p>
                            )}
                            <AnnotatedReader
                              entryId={e.id}
                              contentMd={e.contentMd ? cleanContent(e.contentMd) : ''}
                              commentsLocked={false}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                );
              })}
            </div>
          ) : items.length === 1 ? (
            /* Vue unique : 1 entrée (ou 1 instance pour la musique) */
            (() => {
              const e0 = items[0]!.entry;
              const idx0 = items[0]!.trackIndex ?? trackIndex;
              return (
                <div
                  className="px-5 py-4"
                  style={{ fontFamily: getFontFamily(e0.font), fontSize: scaledFontSize(e0.font, e0.fontSize ?? '17px') }}
                >
                  <div className="flex items-center justify-between mb-3">
                    {behavior === 'QUIZZ' ? (
                      <p className="text-xs font-medium text-text-muted">
                        {e0.mediaMeta?.subject || 'Quizz'} · {e0.mediaMeta?.quizQuestions?.length ?? 0} question{(e0.mediaMeta?.quizQuestions?.length ?? 0) > 1 ? 's' : ''}
                      </p>
                    ) : <span />}
                    <OpenEntryButton entry={e0} onClose={onClose} onEditItem={setMetaEditEntry} onOpenNote={handleOpenNote} />
                  </div>
                  {behavior === 'MUSIC' && (
                    <MusicNotePlayer meta={e0.mediaMeta} initialIndex={idx0} />
                  )}
                  {behavior === 'QUIZZ' && (e0.mediaMeta?.quizQuestions?.length ?? 0) > 0 && (
                    <div className="flex flex-col gap-4 mb-2">
                      <QuizTaker entryId={e0.id} questions={e0.mediaMeta!.quizQuestions!} shuffleQuestions={e0.mediaMeta?.quizShuffleQuestions} shuffleOptions={e0.mediaMeta?.quizShuffleOptions} />
                      <QuizResultsPanel entryId={e0.id} questions={e0.mediaMeta!.quizQuestions!} />
                    </div>
                  )}
                  {hasFilledCustomFields(groupFieldDefs, e0.mediaMeta?.customFields as CustomFieldValues) && (
                    <CustomFieldsView fields={groupFieldDefs} values={(e0.mediaMeta?.customFields ?? {}) as CustomFieldValues} />
                  )}
                  {!e0.contentMd && behavior !== 'QUIZZ' && (
                    <p className="text-text-muted/50 italic text-sm mb-3">Aucun contenu rédigé.</p>
                  )}
                  <AnnotatedReader
                    entryId={e0.id}
                    contentMd={e0.contentMd ? cleanContent(e0.contentMd) : ''}
                    commentsLocked={false}
                  />
                  {(e0 as LocalEntry & { readGatePrompt?: string | null }).readGatePrompt && (
                    <ReadGateReviewSection entryId={e0.id} />
                  )}
                </div>
              );
            })()
          ) : (
            /* Vue multiple : plusieurs entrées (ou plusieurs instances d'un même morceau) */
            <div className="flex flex-col divide-y divide-text-muted/10">
              {items.map((item, idx) => {
                const e = item.entry;
                const playlistName = item.trackIndex !== undefined ? e.mediaMeta?.playlistName : undefined;
                // QUIZZ : chaque quizz du thème est replié par défaut (évite le scroll
                // infini quand un thème contient plusieurs quizz). Ouvre à la demande.
                if (behavior === 'QUIZZ') {
                  const qOpen = openChapters.has(e.id);
                  const qCount = e.mediaMeta?.quizQuestions?.length ?? 0;
                  const qLabel = `${e.mediaMeta?.volume != null ? `${e.mediaMeta.volume}. ` : ''}${e.mediaMeta?.subject || 'Quizz'}`;
                  return (
                    <div key={`${e.id}::q::${idx}`}>
                      <button
                        type="button"
                        onClick={() => toggleChapter(e.id)}
                        className="w-full px-5 py-3.5 flex items-center gap-2 text-left hover:bg-text-muted/5 transition-colors"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-text-muted/50 transition-transform ${qOpen ? '' : '-rotate-90'}`}><polyline points="6 9 12 15 18 9"/></svg>
                        <span className="text-xs font-medium text-text-primary flex-1 min-w-0 truncate">{qLabel}</span>
                        <span className="text-[11px] text-text-muted/50 shrink-0">{qCount} question{qCount > 1 ? 's' : ''}</span>
                      </button>
                      {qOpen && (
                        <div className="px-5 pb-4">
                          <div className="flex justify-end mb-3">
                            <OpenEntryButton entry={e} onClose={onClose} onEditItem={setMetaEditEntry} onOpenNote={handleOpenNote} />
                          </div>
                          {qCount > 0 && (
                            <div className="flex flex-col gap-4 mb-2">
                              <QuizTaker entryId={e.id} questions={e.mediaMeta!.quizQuestions!} shuffleQuestions={e.mediaMeta?.quizShuffleQuestions} shuffleOptions={e.mediaMeta?.quizShuffleOptions} />
                              <QuizResultsPanel entryId={e.id} questions={e.mediaMeta!.quizQuestions!} />
                            </div>
                          )}
                          <AnnotatedReader
                            entryId={e.id}
                            contentMd={e.contentMd ? cleanContent(e.contentMd) : ''}
                            commentsLocked={false}
                          />
                        </div>
                      )}
                    </div>
                  );
                }
                return (
                  <div key={`${e.id}::${item.trackIndex ?? 'm'}::${idx}`} className="px-5 py-4">
                    <div className="flex items-center justify-between mb-3">
                      {behavior === 'SERIES' ? (
                        <p className="text-xs font-medium text-text-muted">
                          {[
                            e.mediaMeta?.season != null ? `S${e.mediaMeta.season}` : null,
                            e.mediaMeta?.progressCurrent != null ? `E${e.mediaMeta.progressCurrent}` : null,
                            e.mediaMeta?.subject || null,
                            formatDate(e.date),
                          ].filter(Boolean).join(' · ')}
                        </p>
                      ) : (
                        <p className="text-xs font-medium text-text-muted capitalize">
                          {playlistName ? `${playlistName} · ${formatDate(e.date)}` : formatDate(e.date)}
                        </p>
                      )}
                      <OpenEntryButton entry={e} onClose={onClose} onEditItem={setMetaEditEntry} onOpenNote={handleOpenNote} />
                    </div>
                    {behavior === 'MUSIC' && (
                      <MusicNotePlayer meta={e.mediaMeta} initialIndex={item.trackIndex} />
                    )}
                    <div style={{ fontFamily: getFontFamily(e.font), fontSize: scaledFontSize(e.font, e.fontSize ?? '17px') }}>
                      {!e.contentMd && (
                      <p className="text-text-muted/50 italic text-sm mb-3">Aucun contenu rédigé.</p>
                    )}
                    <AnnotatedReader
                      entryId={e.id}
                      contentMd={e.contentMd ? cleanContent(e.contentMd) : ''}
                      commentsLocked={false}
                    />
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
        {metaEditEntry && (
          <ItemMetaEditSheet entry={metaEditEntry} onClose={() => setMetaEditEntry(null)} inline={inline} />
        )}

        {/* Overlay note inline — desktop panel uniquement */}
        {openedNote && inline && (() => {
          const ncfg = resolveNoteTypeConfig(openedNote, defsById);
          const nBehavior = ncfg.behavior;
          const nm = openedNote.mediaMeta ?? {};
          return (
            <div className="absolute inset-0 z-10 flex flex-col bg-bg-elevated overflow-y-auto hide-scrollbar">
              {/* Header */}
              <div className="px-5 pt-4 pb-3 border-b border-text-muted/10 shrink-0">
                <div className="flex items-center gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setOpenedNote(null)}
                    className="flex items-center gap-1.5 text-xs text-text-muted/60 hover:text-text-primary transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 12H5M12 5l-7 7 7 7" />
                    </svg>
                    Retour
                  </button>
                  <span className="text-text-muted/45 text-xs">·</span>
                  <span className="text-xs text-text-muted/60">{formatDate(openedNote.date)}</span>
                  <div className="ml-auto">
                    <UseNavigateLink entryId={openedNote.id} />
                  </div>
                </div>
                {/* Média info */}
                <div className="flex items-start gap-3">
                  {nm.coverUrl ? (
                    <img src={nm.coverUrl} alt={nm.subject ?? ''} className="w-12 h-16 object-cover rounded shadow-sm shrink-0" />
                  ) : (
                    <span className="w-12 h-12 flex items-center justify-center rounded-xl shrink-0" style={{ backgroundColor: noteTint(ncfg.color, 9), color: ncfg.color }}>
                      <ncfg.Glyph className="w-5 h-5" />
                    </span>
                  )}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-text-primary font-medium text-sm leading-snug">{nm.subject ?? openedNote.title ?? '—'}</p>
                    {nm.creator && <p className="text-text-muted text-xs mt-0.5">{nm.creator}</p>}
                    {nm.status && (
                      <span className="inline-block mt-1 text-[11px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: noteTint(ncfg.color, 9), color: ncfg.color }}>
                        {{ wishlist: 'Souhaité', owned: 'Possédé', ongoing: 'En cours', finished: 'Terminé', abandoned: 'Abandonné' }[nm.status] ?? nm.status}
                      </span>
                    )}
                    {nm.rating && (
                      <span className="block text-xs mt-1" style={{ color: ncfg.color }}>
                        {'★'.repeat(nm.rating)}{'☆'.repeat(5 - nm.rating)}
                      </span>
                    )}
                  </div>
                </div>
                {nm.description && (
                  <p className="text-text-muted text-xs leading-relaxed mt-2">{nm.description}</p>
                )}
              </div>
              {/* Contenu rédigé */}
              <div
                className="px-5 py-4"
                style={{ fontFamily: getFontFamily(openedNote.font), fontSize: scaledFontSize(openedNote.font, openedNote.fontSize ?? '17px') }}
              >
                {openedNote.title && nBehavior === 'JOURNAL' && (
                  <h2 className="text-text-primary font-serif text-lg mb-3">{openedNote.title}</h2>
                )}
                {nBehavior === 'MUSIC' && (
                  <MusicNotePlayer meta={openedNote.mediaMeta} />
                )}
                {openedNote.contentMd ? (
                  <AnnotatedReader
                    entryId={openedNote.id}
                    contentMd={cleanContent(openedNote.contentMd)}
                    commentsLocked={false}
                  />
                ) : (
                  <p className="text-text-muted/50 italic text-sm">Aucune note rédigée.</p>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </>
  );
}

/** Petit bouton "Ouvrir dans le journal" qui navigue — extrait pour éviter le hook dans un conditionnel. */
function UseNavigateLink({ entryId }: { entryId: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(`/?newEntry=${entryId}`)}
      className="flex items-center gap-1 text-[11px] text-accent/70 hover:text-accent transition-colors font-medium"
    >
      Ouvrir dans le journal
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
      </svg>
    </button>
  );
}
