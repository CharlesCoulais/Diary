import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LocalCoupleDay, type LocalEntry, type CoupleColor } from '../lib/db/schema';
import { trpc, apiClient } from '../lib/trpc';
import { BottomNav, GuestBottomNav } from '../components/BottomNav';
import { BackToTop } from '../components/BackToTop';
import { OwnerTopBar } from '../components/OwnerTopBar';
import { GuestTopBar } from '../components/GuestTopBar';
import { AnnotatedReader } from '../components/AnnotatedReader';
import { getFontFamily } from '../lib/fonts';
import { useBackButtonClose } from '../hooks/useBackButtonClose';

// ── Helpers date ─────────────────────────────────────────────────────────────

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
function firstWeekday(year: number, month: number): number {
  const d = new Date(year, month - 1, 1).getDay();
  return d === 0 ? 6 : d - 1;
}
function monthName(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}
function formatLongDate(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const LOCK_MS = 24 * 60 * 60 * 1000;

// ── Couleurs du baromètre ────────────────────────────────────────────────────

// `hint` = formulation 2e personne pour l'owner (qui pose la couleur).
// `hintGuest` = 3e personne pour le confident en lecture (sinon « tu / vous »
// s'adresse à tort au confident, qui n'est pas membre du couple).
const COLOR_META: Record<CoupleColor, { label: string; hint: string; hintGuest?: string; var: string; var2?: string }> = {
  RED:       { label: 'Journée tendue',   hint: "Quelque chose t'a vraiment agacée avec lui",            hintGuest: 'Une journée tendue avec son compagnon',       var: 'var(--color-couple-red)' },
  RED_GREEN: { label: 'Journée partagée', hint: 'Des bons moments ET des tensions, clairement les deux', hintGuest: 'Des bons moments et des tensions avec son compagnon', var: 'var(--color-couple-red)', var2: 'var(--color-couple-green)' },
  BLUE:      { label: 'Neutre',           hint: 'Journée neutre, rien de particulier',                   var: 'var(--color-couple-blue)' },
  GREEN:     { label: 'Bonne journée',    hint: 'Tu as passé une bonne journée en sa compagnie',         hintGuest: 'Une bonne journée passée avec son compagnon', var: 'var(--color-couple-green)' },
};
const COLOR_ORDER: CoupleColor[] = ['RED', 'RED_GREEN', 'BLUE', 'GREEN'];

/** Style d'une pastille de couleur — disque uni, ou moitié/moitié pour RED_GREEN.
 *  `pct` (0-100) applique une opacité via color-mix. Couleurs tokenisées
 *  (var --color-couple-*) → s'adaptent au dark mode. */
function swatchStyle(c: CoupleColor, pct?: number): CSSProperties {
  const meta = COLOR_META[c];
  const mix = (v: string) => (pct != null ? `color-mix(in srgb, ${v} ${pct}%, transparent)` : v);
  return meta.var2
    ? { background: `linear-gradient(135deg, ${mix(meta.var)} 0% 50%, ${mix(meta.var2)} 50% 100%)` }
    : { backgroundColor: mix(meta.var) };
}

/** Données d'un jour, indépendamment de la source (Dexie owner ou API confident). */
type DayRecord = {
  color: CoupleColor;
  setAt: string | null;
  linkedEntryIds: string[];
  awayLabel: string | null;
};

/** Forme renvoyée par `coupleDay.list` (lecture confident). */
type GuestCoupleDay = {
  id: string;
  date: string;
  color: CoupleColor;
  setAt: string | null;
  linkedEntryIds: string[] | null;
  awayLabel: string | null;
};

/** Couleur affichée : neutre par défaut pour le passé/présent, rien pour le futur. */
function effectiveColor(rec: DayRecord | undefined, date: string, today: string): CoupleColor | null {
  if (date > today) return null;
  return rec?.color ?? 'BLUE';
}

/** Une couleur est éditable tant qu'elle n'a pas été posée, ou dans les 24 h suivant la pose. */
function isColorEditable(rec: DayRecord | undefined, date: string, today: string): boolean {
  if (date > today) return false;
  if (!rec || !rec.setAt) return true;
  return Date.now() - new Date(rec.setAt).getTime() < LOCK_MS;
}

/** Écrit/mets à jour un jour côté Owner (Dexie + _dirty pour la sync). */
async function saveCoupleDay(
  date: string,
  patch: Partial<Pick<LocalCoupleDay, 'color' | 'setAt' | 'linkedEntryIds' | 'awayLabel'>>,
) {
  const existing = await db.coupleDays.get(date);
  const now = new Date().toISOString();
  await db.coupleDays.put({
    date,
    color: patch.color ?? existing?.color ?? 'BLUE',
    setAt: patch.setAt !== undefined ? patch.setAt : existing?.setAt ?? null,
    linkedEntryIds: patch.linkedEntryIds ?? existing?.linkedEntryIds ?? [],
    awayLabel: patch.awayLabel !== undefined ? patch.awayLabel : existing?.awayLabel ?? null,
    version: existing?.version ?? 0,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
    _dirty: true,
  });
}

/**
 * Aperçu texte d'une note pour la liste de sélection « Lier des notes ».
 * Nettoie le markdown ET le HTML inline (les notes avec font custom contiennent
 * des `<span style="font-family: …">` qui s'affichaient en clair sinon),
 * les blocs spéciaux (`:::chat`, `:::branch`…), images, liens, code, tableaux.
 */
function strip(md: string, max = 70): string {
  const text = md
    // 1. Pré-nettoyage : échappements markdown + blocs fenced + custom blocks
    .replace(/\\\n/g, '\n')
    .replace(/\\([[\](){}*_`~#>|!.+=-])/g, '$1')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/:::chat[^\n]*\n?[\s\S]*?:::/g, ' 💬 conversation ')
    .replace(/:::[\w-]*[^\n]*\n?([\s\S]*?):::/g, ' $1 ')
    .replace(/:::[\w-]*[^\n]*/g, ' ')
    // 2. Markdown inline → texte brut
    .replace(/!\[.*?\]\([^)]+\)/g, ' ')           // images
    .replace(/\[(.+?)\]\([^)]+\)/g, '$1')        // liens : garde le label
    .replace(/`([^`]+)`/g, '$1')                  // inline code
    .replace(/\*\*([^*]+)\*\*/g, '$1')            // **bold**
    .replace(/__([^_]+)__/g, '$1')                // __bold__
    .replace(/\*([^*]+)\*/g, '$1')                // *italic*
    .replace(/_([^_]+)_/g, '$1')                  // _italic_
    .replace(/~~([^~]+)~~/g, '$1')                // ~~strike~~
    .replace(/^#{1,6}\s+/gm, '')                  // # headings
    .replace(/^>\s?/gm, '')                       // > quotes
    .replace(/^[-*+]\s+/gm, '')                   // list bullets
    // 3. HTML : retire les balises mais préserve le contenu textuel
    .replace(/<[^>]+>/g, '')
    // 4. Entités HTML courantes (&quot; etc.)
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    // 5. Collapse espaces / newlines
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}

/** Dé-échappe le markdown pour l'affichage en lecture (cf. EntrySheet). */
function cleanContent(md: string): string {
  return md
    .replace(/\\\n/g, '\n')
    .replace(/\\([[\](){}*_`~#>|!.+=-])/g, '$1')
    .replace(/\\$/gm, '')
    .trim();
}

function AwayIcon({ className = '', size = 14 }: { className?: string; size?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3.5S18 3 16.5 4.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
    </svg>
  );
}

// ── Sélecteur de notes à lier ─────────────────────────────────────────────────

// ── Contenu du picker (partagé entre la modal mobile et l'inline desktop) ─────

function EntryLinkPickerBody({
  selectedIds,
  onClose,
  onConfirm,
}: {
  selectedIds: string[];
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set(selectedIds));

  const entries = useLiveQuery(
    () => db.entries.filter((e) => e.deletedAt === null && !e.collectionOnly).toArray(),
    [],
  ) ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...entries].sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    );
    if (!q) return sorted.slice(0, 80);
    return sorted
      .filter((e) => (e.title ?? '').toLowerCase().includes(q) || e.contentMd.toLowerCase().includes(q))
      .slice(0, 80);
  }, [entries, query]);

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <>
      <div className="px-5 pt-3 pb-3 shrink-0">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher une note…"
          autoFocus
          className="w-full bg-bg-primary/50 text-sm text-text-primary placeholder:text-text-muted/55 outline-none rounded-xl px-3 py-2 border border-text-muted/15 focus:border-accent/40 transition-colors"
        />
      </div>
      <div className="flex-1 overflow-y-auto hide-scrollbar px-3 py-1 flex flex-col gap-0.5">
        {filtered.length === 0 ? (
          <p className="text-sm text-text-muted/50 italic py-8 text-center">Aucune note trouvée.</p>
        ) : (
          filtered.map((e) => {
            const checked = picked.has(e.id);
            const headline = e.title || strip(e.contentMd, 60) || 'Note';
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => toggle(e.id)}
                className={
                  'flex items-center gap-3 text-left rounded-xl px-3 py-2.5 transition-colors ' +
                  (checked ? 'bg-accent/12' : 'hover:bg-bg-primary/50')
                }
              >
                <span
                  className={
                    'w-4 h-4 rounded-md border shrink-0 flex items-center justify-center transition-colors ' +
                    (checked ? 'bg-accent border-accent text-bg-elevated' : 'border-text-muted/30')
                  }
                >
                  {checked && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm text-text-primary truncate">{headline}</span>
                  <span className="block text-[11px] text-text-muted/50 mt-0.5">{formatLongDate(e.date)}</span>
                </span>
              </button>
            );
          })
        )}
      </div>
      <div className="px-5 py-3 border-t border-text-muted/[0.08] shrink-0">
        <button
          type="button"
          onClick={() => onConfirm([...picked])}
          className="w-full py-2.5 rounded-xl bg-accent text-bg-elevated text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Lier {picked.size > 0 ? `(${picked.size})` : ''}
        </button>
      </div>
    </>
  );
}

function EntryLinkPicker({
  selectedIds,
  onClose,
  onConfirm,
}: {
  selectedIds: string[];
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
}) {
  useBackButtonClose(true, onClose);
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[70] max-h-[88svh] bg-bg-elevated rounded-t-3xl shadow-2xl flex flex-col sm:left-1/2 sm:right-auto sm:bottom-1/2 sm:translate-x-[-50%] sm:translate-y-1/2 sm:w-full sm:max-w-lg sm:rounded-3xl">
        <div className="flex justify-center pt-3 pb-1 shrink-0 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-text-muted/20" />
        </div>
        <div className="px-5 pt-3 pb-0 shrink-0 flex items-center justify-between gap-3">
          <p className="font-serif text-lg text-text-primary">Lier des notes</p>
          <button type="button" onClick={onClose} aria-label="Fermer" className="text-text-muted/60 hover:text-text-primary p-1 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <EntryLinkPickerBody selectedIds={selectedIds} onClose={onClose} onConfirm={onConfirm} />
      </div>
    </>
  );
}

// ── Lecteur de note (en place, sans quitter le baromètre) ────────────────────

/** Note prête à être lue (contenu déjà résolu — Dexie côté Owner, API côté Confident). */
type ReadableNote = {
  id: string;
  title: string | null;
  date: string;
  contentMd: string;
  font: string | null;
  fontSize: string | null;
  commentsLocked: boolean;
};

/** Note liée vue par le Confident — `lock` non nul = contenu non accessible. */
type GuestLockReason = 'private' | 'secret' | 'capsule' | 'adult';
type GuestLinked = {
  id: string;
  title: string | null;
  date: string;
  lock: GuestLockReason | null;
  note: ReadableNote | null; // présent si lisible
};

const GUEST_LOCK_LABEL: Record<GuestLockReason, string> = {
  private: 'Note privée — non partagée',
  secret: 'Note secrète',
  capsule: 'Capsule scellée — pas encore ouverte',
  adult: 'Note 18+ — à débloquer depuis le journal',
};

function toIsoDay(d: unknown): string {
  if (typeof d === 'string') return d.slice(0, 10);
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

/**
 * Résout une note liée pour le Confident via `entries.byId`, qui applique déjà
 * toutes les règles d'accès (privé → erreur, secret/capsule scellée/18+ verrouillé
 * → contenu rédacté). On en déduit l'état de verrou pour l'affichage.
 */
async function resolveGuestLinked(id: string): Promise<GuestLinked> {
  type ByIdEntry = {
    id: string;
    title: string | null;
    date: unknown;
    contentMd: string;
    font: string | null;
    fontSize: string | null;
    commentsLocked: boolean;
    isSecret: boolean;
    isAdult: boolean;
    unlockAt: string | null;
  };
  try {
    const e = await (apiClient.entries.byId.query({ id }) as unknown as Promise<ByIdEntry>);
    const date = toIsoDay(e.date);
    if (e.isSecret) return { id, title: null, date, lock: 'secret', note: null };
    if (e.isAdult && !e.contentMd) return { id, title: null, date, lock: 'adult', note: null };
    if (e.unlockAt && !e.contentMd) return { id, title: e.title ?? null, date, lock: 'capsule', note: null };
    return {
      id,
      title: e.title ?? null,
      date,
      lock: null,
      note: {
        id: e.id,
        title: e.title ?? null,
        date,
        contentMd: e.contentMd ?? '',
        font: e.font ?? null,
        fontSize: e.fontSize ?? null,
        commentsLocked: e.commentsLocked ?? false,
      },
    };
  } catch {
    // byId jette NOT_FOUND quand l'accès est refusé (note privée non partagée).
    return { id, title: null, date: '', lock: 'private', note: null };
  }
}

function NoteReaderSheet({
  notes,
  startIndex,
  onClose,
}: {
  notes: ReadableNote[];
  startIndex: number;
  onClose: () => void;
}) {
  useBackButtonClose(true, onClose);
  const [index, setIndex] = useState(startIndex);
  const note = notes[index];
  const hasMany = notes.length > 1;

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[70] max-h-[90svh] bg-bg-elevated rounded-t-3xl shadow-2xl flex flex-col sm:left-1/2 sm:right-auto sm:bottom-1/2 sm:translate-x-[-50%] sm:translate-y-1/2 sm:w-full sm:max-w-lg sm:rounded-3xl">
        <div className="flex justify-center pt-3 pb-1 shrink-0 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-text-muted/20" />
        </div>
        <div className="px-5 pt-2 pb-3 flex items-start justify-between gap-3 border-b border-text-muted/10 shrink-0">
          <div className="min-w-0">
            <p className="text-text-primary font-serif text-lg leading-tight truncate">
              {note?.title || 'Note'}
            </p>
            {note && (
              <p className="text-xs text-text-muted/60 mt-0.5 capitalize">{formatLongDate(note.date)}</p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="text-text-muted/60 hover:text-text-primary p-1 shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-soft px-5 py-4">
          {!note ? (
            <p className="text-sm text-text-muted/50 italic py-8 text-center">Note indisponible.</p>
          ) : (
            <div style={{ fontFamily: getFontFamily(note.font), fontSize: note.fontSize ?? '17px' }}>
              {!note.contentMd ? (
                <p className="text-text-muted/50 italic text-sm">Aucun contenu rédigé.</p>
              ) : (
                <AnnotatedReader
                  entryId={note.id}
                  contentMd={cleanContent(note.contentMd)}
                  commentsLocked={note.commentsLocked}
                  fontSize={note.fontSize}
                  fontFamily={getFontFamily(note.font)}
                  fontKey={note.font}
                />
              )}
            </div>
          )}
        </div>

        {hasMany && (
          <div className="px-5 py-3 border-t border-text-muted/10 shrink-0 flex items-center justify-between">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              className="text-sm text-accent font-medium disabled:opacity-30 disabled:pointer-events-none"
            >
              ‹ Précédente
            </button>
            <span className="text-xs text-text-muted/60">{index + 1} / {notes.length}</span>
            <button
              type="button"
              disabled={index === notes.length - 1}
              onClick={() => setIndex((i) => Math.min(notes.length - 1, i + 1))}
              className="text-sm text-accent font-medium disabled:opacity-30 disabled:pointer-events-none"
            >
              Suivante ›
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Contenu d'un jour (partagé entre bottom-sheet mobile et panneau desktop) ──

function CoupleDayBody({
  date,
  today,
  rec,
  readOnly,
  onClose,
  inline = false,
}: {
  date: string;
  today: string;
  rec: DayRecord | undefined;
  readOnly: boolean;
  onClose: () => void;
  inline?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [readerStart, setReaderStart] = useState<number | null>(null);
  const [awayDraft, setAwayDraft] = useState(rec?.awayLabel ?? '');

  const colorEditable = !readOnly && isColorEditable(rec, date, today);
  const color = effectiveColor(rec, date, today);
  const isFuture = date > today;
  const linkedIds = rec?.linkedEntryIds ?? [];

  const linkedEntries = useLiveQuery(
    () => (!readOnly && linkedIds.length > 0
      ? db.entries.bulkGet(linkedIds)
      : Promise.resolve([] as (LocalEntry | undefined)[])),
    [readOnly, linkedIds.join(',')],
  );

  const [guestLinked, setGuestLinked] = useState<GuestLinked[] | null>(null);
  useEffect(() => {
    if (!readOnly) return;
    if (linkedIds.length === 0) { setGuestLinked([]); return; }
    let cancelled = false;
    Promise.all(linkedIds.map((id) => resolveGuestLinked(id))).then((res) => {
      if (!cancelled) setGuestLinked(res);
    });
    return () => { cancelled = true; };
  }, [readOnly, linkedIds.join(',')]);

  const pickColor = (c: CoupleColor) => {
    if (!colorEditable) return;
    void saveCoupleDay(date, { color: c, setAt: new Date().toISOString() });
  };
  const toggleAway = () => {
    if (readOnly) return;
    if (rec?.awayLabel != null) { setAwayDraft(''); void saveCoupleDay(date, { awayLabel: null }); }
    else { void saveCoupleDay(date, { awayLabel: awayDraft.trim() || 'Pas ensemble' }); }
  };
  const commitAway = () => {
    if (readOnly || rec?.awayLabel == null) return;
    void saveCoupleDay(date, { awayLabel: awayDraft.trim() || 'Pas ensemble' });
  };

  const ownerNotes: ReadableNote[] = readOnly ? [] : (linkedEntries ?? [])
    .filter((e): e is LocalEntry => !!e)
    .map((e) => ({ id: e.id, title: e.title ?? null, date: e.date, contentMd: e.contentMd ?? '', font: e.font ?? null, fontSize: e.fontSize ?? null, commentsLocked: e.commentsLocked ?? false }));
  const guestReadable: ReadableNote[] = (guestLinked ?? []).flatMap((g) => (g.note ? [g.note] : []));
  const readerNotes = readOnly ? guestReadable : ownerNotes;

  // ── Inline picker (desktop panel) ────────────────────────────────────────────
  if (pickerOpen && inline) {
    return (
      <>
        <div className="px-6 py-4 flex items-center gap-3 border-b border-text-muted/[0.08] shrink-0">
          <button
            type="button"
            onClick={() => setPickerOpen(false)}
            className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Retour
          </button>
          <p className="flex-1 text-center font-serif text-lg text-text-primary">Lier des notes</p>
          <div className="w-14 shrink-0" />
        </div>
        <EntryLinkPickerBody
          selectedIds={linkedIds}
          onClose={() => setPickerOpen(false)}
          onConfirm={(ids) => { void saveCoupleDay(date, { linkedEntryIds: ids }); setPickerOpen(false); }}
        />
      </>
    );
  }

  // ── Vue normale ──────────────────────────────────────────────────────────────
  return (
    <>
      {/* Header */}
      <div className="px-6 py-5 flex items-center gap-3 border-b border-text-muted/[0.08] shrink-0">
        {color && !isFuture && (
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0 opacity-90"
            style={swatchStyle(color)}
          />
        )}
        <p className="flex-1 text-text-primary font-serif text-xl capitalize leading-tight">{formatLongDate(date)}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="tap w-8 h-8 flex items-center justify-center rounded-full text-text-muted/50 hover:text-text-primary hover:bg-bg-primary/60 transition-colors shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto hide-scrollbar px-5 py-5 flex flex-col gap-3">

        {/* Couleur du jour */}
        <div className="rounded-2xl bg-bg-elevated/60 overflow-hidden">
          <div className="px-4 pt-4 pb-4">
            <p className="text-[11px] font-mono uppercase tracking-widest text-text-muted/50 mb-3">Couleur du jour</p>
            {isFuture ? (
              <p className="text-sm text-text-muted/50 italic">Jour à venir — la couleur se décide le jour même.</p>
            ) : colorEditable ? (
              <div className="grid grid-cols-2 gap-2">
                {COLOR_ORDER.map((c) => {
                  const meta = COLOR_META[c];
                  const active = color === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => pickColor(c)}
                      title={meta.hint}
                      className={
                        'group flex flex-col items-center gap-2.5 rounded-2xl py-4 px-2 transition-all ' +
                        (active ? 'ring-2 ring-current' : 'hover:bg-bg-primary/50')
                      }
                      style={{ color: meta.var, ...(active ? swatchStyle(c, 10) : {}) }}
                    >
                      <span
                        className="w-11 h-11 rounded-full shadow-sm transition-transform group-hover:scale-105"
                        style={swatchStyle(c)}
                      />
                      <span className={'text-[11px] leading-tight text-center ' + (active ? 'font-semibold' : 'text-text-muted')}>
                        {meta.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span
                  className="w-9 h-9 rounded-full shrink-0"
                  style={color ? swatchStyle(color) : { backgroundColor: 'transparent' }}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">{color ? COLOR_META[color].label : '—'}</p>
                  {color && <p className="text-[11px] text-text-muted/60 mt-0.5">{(readOnly ? (COLOR_META[color].hintGuest ?? COLOR_META[color].hint) : COLOR_META[color].hint)}.</p>}
                </div>
                {!readOnly && (
                  <span className="text-[11px] text-text-muted/55 italic ml-auto shrink-0">Verrouillé · 24 h</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Jour d'absence */}
        {!isFuture && (
          <div className="rounded-2xl bg-bg-elevated/60 px-4 py-4">
            <p className="text-[11px] font-mono uppercase tracking-widest text-text-muted/50 mb-3">Jour d'absence</p>
            {readOnly ? (
              rec?.awayLabel != null ? (
                <p className="flex items-center gap-2 text-sm text-text-primary">
                  <AwayIcon className="text-accent shrink-0" /> {rec.awayLabel}
                </p>
              ) : (
                <p className="text-sm text-text-muted/50 italic">Ils étaient ensemble.</p>
              )
            ) : (
              <>
                <button
                  type="button"
                  onClick={toggleAway}
                  className={
                    'flex items-center gap-2 text-sm rounded-xl px-3 py-2.5 border transition-colors w-full ' +
                    (rec?.awayLabel != null
                      ? 'border-accent/40 bg-accent/10 text-accent'
                      : 'border-text-muted/15 text-text-muted hover:border-text-muted/30 hover:text-text-primary')
                  }
                >
                  <AwayIcon className="shrink-0" />
                  {rec?.awayLabel != null ? 'Marqué : pas ensemble ce jour' : 'Marquer : pas ensemble ce jour'}
                </button>
                {rec?.awayLabel != null && (
                  <input
                    type="text"
                    value={awayDraft}
                    onChange={(e) => setAwayDraft(e.target.value)}
                    onBlur={commitAway}
                    placeholder="Ex : Semaine dans le sud avec mes enfants"
                    maxLength={200}
                    className="mt-2 w-full bg-bg-primary/50 text-sm text-text-primary placeholder:text-text-muted/55 outline-none rounded-xl px-3 py-2 border border-text-muted/15 focus:border-accent/40 transition-colors"
                  />
                )}
              </>
            )}
          </div>
        )}

        {/* Notes liées */}
        <div className="rounded-2xl bg-bg-elevated/60 px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-mono uppercase tracking-widest text-text-muted/50">Notes liées</p>
            {!readOnly && (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="flex items-center gap-1 text-xs text-accent hover:opacity-75 transition-opacity font-medium"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Lier une note
              </button>
            )}
          </div>
          {readOnly ? (
            linkedIds.length === 0 ? (
              <p className="text-sm text-text-muted/50 italic">Aucune note liée.</p>
            ) : guestLinked == null ? (
              <p className="text-sm text-text-muted/50 italic">Chargement…</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {guestLinked.map((g) => {
                  if (g.lock) return (
                    <div key={g.id} className="flex items-center gap-2 rounded-xl bg-bg-primary/40 px-3 py-2.5 text-text-muted/60">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                        <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      <span className="text-sm italic">{GUEST_LOCK_LABEL[g.lock]}</span>
                    </div>
                  );
                  const idx = guestReadable.findIndex((n) => n.id === g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setReaderStart(Math.max(0, idx))}
                      className="flex items-center gap-2 rounded-xl bg-bg-primary/40 px-3 py-2.5 text-left hover:bg-bg-primary/60 transition-colors"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm text-text-primary truncate">{g.title || 'Note'}</span>
                        <span className="block text-[11px] text-text-muted/50 mt-0.5">{formatLongDate(g.date)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )
          ) : linkedIds.length === 0 ? (
            <p className="text-sm text-text-muted/50 italic">Aucune note liée. Lie une note du journal pour expliquer cette couleur.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {(linkedEntries ?? []).map((e) => {
                if (!e) return null;
                const headline = e.title || strip(e.contentMd, 60) || 'Note';
                return (
                  <div key={e.id} className="flex items-center gap-2 rounded-xl bg-bg-primary/40 px-3 py-2.5 group">
                    <button
                      type="button"
                      onClick={() => setReaderStart(Math.max(0, ownerNotes.findIndex((n) => n.id === e.id)))}
                      className="flex-1 min-w-0 text-left"
                    >
                      <span className="block text-sm text-text-primary truncate">{headline}</span>
                      <span className="block text-[11px] text-text-muted/50 mt-0.5">{formatLongDate(e.date)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveCoupleDay(date, { linkedEntryIds: linkedIds.filter((id) => id !== e.id) })}
                      aria-label="Délier"
                      className="text-text-muted/45 hover:text-danger transition-colors p-1 shrink-0 opacity-0 group-hover:opacity-100"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {pickerOpen && !inline && (
        <EntryLinkPicker
          selectedIds={linkedIds}
          onClose={() => setPickerOpen(false)}
          onConfirm={(ids) => { void saveCoupleDay(date, { linkedEntryIds: ids }); setPickerOpen(false); }}
        />
      )}
      {readerStart != null && readerNotes.length > 0 && (
        <NoteReaderSheet notes={readerNotes} startIndex={readerStart} onClose={() => setReaderStart(null)} />
      )}
    </>
  );
}

// ── Bottom-sheet mobile (lg:hidden) ─────────────────────────────────────────

function CoupleDaySheet({ date, today, rec, readOnly, onClose }: {
  date: string; today: string; rec: DayRecord | undefined; readOnly: boolean; onClose: () => void;
}) {
  useBackButtonClose(true, onClose);
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 max-h-[88svh] bg-bg-elevated rounded-t-3xl shadow-2xl flex flex-col">
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-text-muted/20" />
        </div>
        <CoupleDayBody date={date} today={today} rec={rec} readOnly={readOnly} onClose={onClose} />
      </div>
    </>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function BarometrePage() {
  const today = isoToday();
  const todayYear = parseInt(today.slice(0, 4), 10);
  const todayMonth = parseInt(today.slice(5, 7), 10);

  const [year, setYear] = useState(todayYear);
  const [month, setMonth] = useState(todayMonth);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { data: me } = trpc.auth.me.useQuery();
  const isOwner = me?.role === 'OWNER';

  // Owner : lecture live depuis Dexie.
  const ownerDays = useLiveQuery(
    () => (isOwner ? db.coupleDays.filter((cd) => cd.deletedAt === null).toArray() : Promise.resolve([] as LocalCoupleDay[])),
    [isOwner],
  );

  // Confident : lecture seule via l'API. On passe par `apiClient` direct plutôt
  // que le proxy react-query pour éviter l'explosion d'inférence TS (cf. useSync).
  const [guestDays, setGuestDays] = useState<GuestCoupleDay[] | null>(null);
  useEffect(() => {
    if (me == null || isOwner) return;
    const load = () => {
      (apiClient.coupleDay.list.query(undefined) as unknown as Promise<GuestCoupleDay[]>)
        .then(setGuestDays)
        .catch(() => setGuestDays([]));
    };
    load();
    // Temps réel : recharge quand l'owner pose/édite une couleur (événement SSE).
    // Debounce 300 ms (STAT-09) : une rafale d'événements (édition de plusieurs
    // jours d'affilée) ne déclenche qu'un seul rechargement de la liste.
    let t: ReturnType<typeof setTimeout> | null = null;
    const debouncedLoad = () => {
      if (t) clearTimeout(t);
      t = setTimeout(load, 300);
    };
    window.addEventListener('carnet:sse-couple-day', debouncedLoad);
    return () => {
      if (t) clearTimeout(t);
      window.removeEventListener('carnet:sse-couple-day', debouncedLoad);
    };
  }, [me, isOwner]);

  const byDate = useMemo(() => {
    const map = new Map<string, DayRecord>();
    if (isOwner) {
      for (const cd of ownerDays ?? []) {
        map.set(cd.date, {
          color: cd.color,
          setAt: cd.setAt,
          linkedEntryIds: cd.linkedEntryIds ?? [],
          awayLabel: cd.awayLabel,
        });
      }
    } else {
      for (const cd of guestDays ?? []) {
        map.set(cd.date, {
          color: cd.color,
          setAt: cd.setAt,
          linkedEntryIds: cd.linkedEntryIds ?? [],
          awayLabel: cd.awayLabel,
        });
      }
    }
    return map;
  }, [isOwner, ownerDays, guestDays]);

  const isLoading = isOwner ? ownerDays === undefined : guestDays === null;

  // Récap du mois affiché (jours passés/présents uniquement)
  const recap = useMemo(() => {
    const counts = { RED: 0, RED_GREEN: 0, BLUE: 0, GREEN: 0, away: 0 };
    const total = daysInMonth(year, month);
    for (let d = 1; d <= total; d++) {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (date > today) continue;
      const rec = byDate.get(date);
      const c = effectiveColor(rec, date, today);
      if (c) counts[c]++;
      if (rec?.awayLabel != null) counts.away++;
    }
    return counts;
  }, [byDate, year, month, today]);

  const days = daysInMonth(year, month);
  const offset = firstWeekday(year, month);
  const isCurrentMonth = year === todayYear && month === todayMonth;

  function prevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (isCurrentMonth) return;
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  }

  const cells: Array<number | null> = [
    ...Array(offset).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];

  const calendarContent = (
    <>
      {/* Header mobile / tablette — style "Aujourd'hui" */}
      <div className="xl:hidden sticky top-0 z-[11] px-6 pt-5 pb-6 mb-6 bg-bg-primary/90 backdrop-blur-sm">
        {/* Ligne 1 : kicker + avatar */}
        <div className="flex items-center justify-between mb-3">
          <p className="font-mono text-[11px] tracking-widest uppercase text-text-muted/50 select-none">Baromètre</p>
          <div className="flex items-center gap-2">
            <OwnerTopBar />
            <GuestTopBar />
          </div>
        </div>
        {/* Ligne 2 : ‹ mois › */}
        <div className="flex items-center gap-3">
          <button type="button" onClick={prevMonth} aria-label="Mois précédent" className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h1 className="flex-1 text-center font-serif text-4xl text-text-primary capitalize tracking-tight">
            {monthName(year, month)}
          </h1>
          <div className="flex items-center gap-1 shrink-0">
            {!isCurrentMonth && (
              <button type="button" onClick={() => { setYear(todayYear); setMonth(todayMonth); }} className="text-xs text-accent hover:opacity-80 transition-opacity px-1">
                Auj.
              </button>
            )}
            <button type="button" onClick={nextMonth} disabled={isCurrentMonth} aria-label="Mois suivant" className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-30 disabled:pointer-events-none">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Header desktop (xl+) : centré avec flèches, style "Aujourd'hui" */}
      <div className="hidden xl:flex items-center gap-4 sticky top-0 z-[11] bg-bg-primary/90 backdrop-blur-sm px-8 pt-10 pb-6 mb-4">
        <button type="button" onClick={prevMonth} aria-label="Mois précédent" className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div className="flex-1 text-center">
          <p className="font-mono text-[11px] tracking-widest uppercase text-text-muted/50 mb-3 select-none text-left">Baromètre</p>
          <h1 className="font-serif text-6xl text-text-primary tracking-tight capitalize">{monthName(year, month)}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isCurrentMonth && (
            <button type="button" onClick={() => { setYear(todayYear); setMonth(todayMonth); }} className="text-xs text-accent hover:opacity-80 transition-opacity px-1">
              Auj.
            </button>
          )}
          <button type="button" onClick={nextMonth} disabled={isCurrentMonth} aria-label="Mois suivant" className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-30 disabled:pointer-events-none">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      </div>
      <div className="px-6 xl:px-8 xl:max-w-[520px] xl:mx-auto">
        {/* Récap du mois */}
        <div className="flex flex-wrap gap-1.5 mb-5">
          {COLOR_ORDER.map((c) => (
            <span
              key={c}
              title={COLOR_META[c].label}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-bg-elevated"
            >
              <span className="w-3 h-3 rounded-full" style={swatchStyle(c)} />
              <span className="font-medium text-text-primary">{recap[c]}</span>
            </span>
          ))}
          {recap.away > 0 && (
            <span title="Jours d'absence" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-bg-elevated text-text-muted">
              <AwayIcon /> <span className="font-medium">{recap.away}</span>
            </span>
          )}
        </div>

        {/* Jours de semaine */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center text-xs text-text-muted/50 font-medium py-1">{d}</div>
          ))}
        </div>

        {/* Grille */}
        {isLoading ? (
          <div className="text-center py-8 text-text-muted/55 text-sm">Chargement…</div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (day == null) return <div key={`empty-${i}`} className="aspect-square" />;
              const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const rec = byDate.get(date);
              const isTodays = date === today;
              const isFuture = date > today;
              const isSelected = date === selectedDate;
              const color = effectiveColor(rec, date, today);
              // Neutre auto = aucune couleur explicitement posée (pas de rec ou setAt null)
              const isAutoNeutral = !isFuture && color === 'BLUE' && (!rec || !rec.setAt);
              const cellStyle = (color && !isAutoNeutral)
                ? swatchStyle(color, color === 'BLUE' ? 18 : 25)
                : undefined;
              const linkedCount = rec?.linkedEntryIds?.length ?? 0;
              const hasIndicators = rec?.awayLabel != null || linkedCount > 0;
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => setSelectedDate(isSelected ? null : date)}
                  className={[
                    // ≥44px en portrait (cible tactile, TRANS-02/STAT-03) ; carré dès sm.
                    'group relative min-h-[44px] sm:min-h-0 sm:aspect-square flex flex-col items-center rounded-xl py-1.5',
                    'text-sm transition-all duration-150',
                    // Sans indicateur : on centre la date verticalement (justify-center).
                    // Avec indicateur : on garde la date en haut et on met les indicateurs
                    // en bas via `justify-between` (le spacer s'étire entre les deux).
                    hasIndicators ? 'justify-between' : 'justify-center',
                    isSelected ? 'ring-2 ring-accent' : 'hover:ring-1 hover:ring-accent/40',
                    isTodays ? 'ring-1 ring-accent/60 font-semibold' : '',
                    isFuture ? 'opacity-40' : '',
                  ].filter(Boolean).join(' ')}
                  style={cellStyle}
                >
                  <span className={`text-xs leading-none ${isAutoNeutral ? 'text-text-primary/35' : 'text-text-primary'}`}>{day}</span>
                  {hasIndicators && (
                    <span className="flex items-center justify-center gap-1.5 leading-none">
                      {rec?.awayLabel != null && (
                        <span className="relative text-text-muted">
                          <AwayIcon size={14} />
                          {/* Tooltip au survol — au-dessus de la case */}
                          <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-30 hidden group-hover:block max-w-[180px] w-max rounded-lg bg-text-primary text-bg-elevated text-[11px] leading-snug text-center px-2 py-1 shadow-lg">
                            {rec.awayLabel}
                          </span>
                        </span>
                      )}
                      {linkedCount > 0 && (
                        <span
                          className="flex items-center gap-[3px]"
                          title={`${linkedCount} note${linkedCount > 1 ? 's' : ''} liée${linkedCount > 1 ? 's' : ''}`}
                        >
                          {Array.from({ length: Math.min(linkedCount, 3) }).map((_, i) => (
                            <span key={i} className="w-1.5 h-1.5 rounded-full bg-accent" />
                          ))}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Légende */}
        <div className="flex flex-wrap gap-3 mt-4">
          {COLOR_ORDER.map((c) => (
            <span key={c} className="flex items-center gap-1.5 text-xs text-text-muted/70">
              <span className="w-2.5 h-2.5 rounded-full" style={swatchStyle(c)} />
              {COLOR_META[c].label}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-xs text-text-muted/70">
            <AwayIcon /> Jour d'absence
          </span>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Desktop: two-column layout (xl = 1280px+, enough room alongside the sidebar) */}
      <div className="xl:flex xl:h-screen xl:overflow-hidden">
        {/* Left: calendar — prend tout l'espace disponible */}
        <div className="xl:flex-1 xl:min-w-0 xl:h-full xl:overflow-y-auto scrollbar-soft xl:overflow-x-hidden xl:border-r xl:border-text-muted/[0.08] pb-48 sm:pb-56 xl:pb-8">
          {calendarContent}
        </div>

        {/* Right: detail panel — largeur fixe (xl+ only) */}
        <div data-right-panel className="hidden xl:flex xl:w-[440px] xl:shrink-0 flex-col h-full overflow-hidden">
          {selectedDate ? (
            <CoupleDayBody
              date={selectedDate}
              today={today}
              rec={byDate.get(selectedDate)}
              readOnly={!isOwner}
              onClose={() => setSelectedDate(null)}
              inline={true}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-text-muted/55 select-none">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
                <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <p className="text-sm">Sélectionne un jour</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom-sheet: mobile + lg (< 1280px) */}
      {selectedDate && (
        <div className="xl:hidden">
          <CoupleDaySheet
            date={selectedDate}
            today={today}
            rec={byDate.get(selectedDate)}
            readOnly={!isOwner}
            onClose={() => setSelectedDate(null)}
          />
        </div>
      )}

      <BackToTop panelOpen={!!selectedDate} />
      {/* BottomNav adapté au rôle (owner / guest confident). */}
      {isOwner ? <BottomNav /> : <GuestBottomNav />}
    </div>
  );
}
