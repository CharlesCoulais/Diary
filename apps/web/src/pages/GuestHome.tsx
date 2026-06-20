import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { trpc, type RouterOutputs } from '../lib/trpc';
import { useTheme } from '../lib/theme';
import { usePinContext } from '../contexts/PinContext';
import { GuestTopBar } from '../components/GuestTopBar';
import { AnnotatedReader } from '../components/AnnotatedReader';
import { cleanMarkdown as cleanContent } from '../lib/cleanMarkdown';
import { NoteModal } from '../components/NoteModal';
import { getNoteTypeConfig, noteTint, resolveNoteTypeConfig } from '../components/NoteTypePicker';
import { useNoteTypeDefs } from '../lib/useNoteTypeDefs';
import { NotificationBell } from '../components/NotificationBell';
import { MusicNotePlayer } from '../components/MusicNotePlayer';
import { QuizTaker } from '../components/QuizTaker';
import { AgendaView } from '../components/AgendaView';
import { BudgetView } from '../components/BudgetView';
import { CustomFieldsView } from '../components/CustomFieldsView';
import { hasFilledCustomFields, type CustomFieldValues } from '../lib/customFields';
import { upcomingCount } from '../lib/agendaEvents';
import { budgetTotals, formatAmount } from '../lib/budget';
import { isoToday } from '../lib/dateHelpers';
import { isPlaylist } from '../lib/musicTracks';
import { DailyLogRecap, type DailyLogRecapData } from '../components/DailyLogRecap';
import { OnThisDay } from '../components/OnThisDay';
import { AudioPlayer } from '../components/AudioPlayer';
import { BulkAudioPlayer } from '../components/BulkAudioPlayer';
import { MediaCarousel, type MediaItem } from '../components/MediaCarousel';
import { parsePreviewRuns, PreviewRuns } from '../lib/previewRuns';
import { getFontFamily, scaledFontSize } from '../lib/fonts';
import { type SortMode, SortPicker, isUpdatedSort } from './Home';
import { EntryFilters, EMPTY_FILTERS, applyFilters, collectAvailableMoods, isFiltered, type FilterState, type ReadGateStatus } from '../components/EntryFilters';
import { useCollapsibleSection } from '../hooks/useCollapsibleSection';
import { useTrackPageHeaderHeight } from '../hooks/useTrackPageHeaderHeight';
import { ChevronToggle } from '../components/ChevronToggle';
import type { NoteType } from '../components/NoteTypePicker';
import { getGuestDisplayPrefs, subscribeGuestPrefs, patchGuestDisplayPrefs } from '../lib/displayPrefs';
import { BackToTop } from '../components/BackToTop';
import { GuestBottomNav } from '../components/BottomNav';
import { CardEntryReactions, EntryReactions } from '../components/EmojiReactionBar';
import { EntryRatingButtons } from '../components/EntryRatingButtons';
import { CommentThread } from '../components/CommentThread';
import { CompactEntryCard, CompactSecretCard, formatDevInfoLine, formatAgendaFinanceInfoLine } from '../components/CompactEntryCard';
import { TruncatedImage } from '../components/TruncatedImage';
import { adultUnlocked, sha256 } from '../lib/adultGate';
import { useDropdownAlign } from '../lib/useDropdownAlign';

/** Libellé relatif d'une date de modification — utilisé en mode tri par `updatedAt`. */
function formatRelativeUpdate(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'à l\'instant';
  if (diffMin < 60) return `Modifié il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Modifié il y a ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'Modifié hier';
  if (diffD < 7) return `Modifié il y a ${diffD} jours`;
  return `Modifié le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
}

function formatDate(d: string | Date) {
  const iso = typeof d === 'string' ? d : d.toISOString();
  return new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

/** Date abrégée « 17/06 » pour les en-têtes de carte (la date complète est déjà
 *  portée par l'en-tête de section du jour → on évite le doublon et on tient sur
 *  une seule ligne, même en mobile étroit). */
function formatDateShort(d: string | Date) {
  const iso = typeof d === 'string' ? d : d.toISOString();
  return new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit',
  });
}


type MediaMeta = {
  subject?: string;
  trackTitle?: string;
  creator?: string;
  coverUrl?: string;
  rating?: number;
  status?: 'ongoing' | 'finished' | 'abandoned';
  description?: string;
  progressCurrent?: number;
  progressTotal?: number;
  volume?: number;
  totalVolumes?: number;
  season?: number;
  streamUrl?: string;
  quizQuestions?: import('../lib/db/schema').QuizQuestion[];
  quizShuffleQuestions?: boolean;
  quizShuffleOptions?: boolean;
  events?: import('../lib/db/schema').AgendaEvent[];
  budgetItems?: import('../lib/db/schema').BudgetItem[];
  currency?: string;
  customFields?: Record<string, string | number | boolean | string[] | null>;
};

// ── Carte scellée pour les entrées secrètes ──────────────────────────────────
function SecretEntryCard({ entry, compactMode = false }: { entry: any; compactMode?: boolean }) {
  const noteType = (entry.noteType ?? 'JOURNAL') as NoteType;
  const cfg = getNoteTypeConfig(noteType as Parameters<typeof getNoteTypeConfig>[0]);
  const timeDisplay: string | null = entry.timeLabel
    ? (entry.timeLabel as string)
    : entry.section
      ? ({ MORNING: 'Matin', LATE_MORNING: 'Fin de matinée', NOON: 'Midi', AFTERNOON: 'Après-midi', LATE_AFTERNOON: "Fin d'après-midi", EARLY_EVENING: 'Début de soirée', EVENING: 'Soir', NIGHT: 'Nuit', FREE: 'Libre' } as Record<string, string>)[entry.section as string] ?? null
      : null;

  // Thread de commentaires ouvrable (le confident peut soutenir / commenter sans
  // voir le contenu). Rendu par le composant partagé CommentThread (markdown,
  // spoilers, mentions, réponses) plutôt qu'un thread maison.
  const [showComments, setShowComments] = useState(false);
  const commentCount: number = (entry._count?.comments as number | undefined) ?? 0;

  const headerBg = cfg.color.startsWith('var(') ? `color-mix(in srgb, ${cfg.color} 10%, transparent)` : `${cfg.color}1a`;
  const separatorColor = cfg.color.startsWith('var(') ? `color-mix(in srgb, ${cfg.color} 15%, transparent)` : `${cfg.color}26`;

  // ── Mode compact : 1 ligne, icône seule, padlock + date ──────────────────
  if (compactMode) {
    return (
      <CompactSecretCard
        entryId={entry.id as string}
        noteType={noteType}
        date={typeof entry.date === 'string' ? entry.date : new Date(entry.date as Date).toISOString()}
        timeLabel={timeDisplay}
        commentCount={commentCount}
      />
    );
  }

  return (
    <div className="bg-bg-elevated rounded-2xl shadow-soft border-l-[3px] overflow-hidden" style={{ borderLeftColor: cfg.color }}>
      {/* Header coloré — identique aux cartes normales */}
      <div className="px-6 pt-4 pb-3 select-none" style={{ backgroundColor: headerBg }}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium font-mono" style={{ color: cfg.color }}><cfg.Icon className="w-3.5 h-3.5 shrink-0" /> {cfg.label}</span>
            {timeDisplay && <span className="font-mono text-xs text-text-muted">{timeDisplay}</span>}
          </div>
          <span className="text-xs text-text-muted tabular-nums">{formatDateShort(entry.date as string | Date)}</span>
        </div>
      </div>
      <div className="h-px" style={{ backgroundColor: separatorColor }} />

      {/* Contenu scellé */}
      <div className="px-6 pt-3 pb-5">
      <div className="relative rounded-xl overflow-hidden select-none">
        {/* Fausses lignes de texte floutées */}
        <div className="flex flex-col gap-2 p-4 blur-sm pointer-events-none" aria-hidden>
          <div className="h-3 bg-text-muted/20 rounded-full w-full" />
          <div className="h-3 bg-text-muted/15 rounded-full w-5/6" />
          <div className="h-3 bg-text-muted/20 rounded-full w-full" />
          <div className="h-3 bg-text-muted/15 rounded-full w-4/5" />
          <div className="h-3 bg-text-muted/20 rounded-full w-3/4" />
        </div>
        {/* Overlay avec cadenas */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-bg-elevated/40 backdrop-blur-[2px]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-secret/70">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span className="text-[11px] font-medium tracking-widest uppercase text-secret/60">Confidentiel</span>
        </div>
      </div>

      {/* Humeur (toujours visible) */}
      {entry.mood && (
        <div className="mt-2 flex items-center">
          <span className="text-base leading-none ml-auto">{entry.mood}</span>
        </div>
      )}

      {/* ── Canal de soutien : réactions + commentaires (même si scellé) ─────── */}
      <div className="mt-3 pt-3 border-t border-text-muted/10 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowComments((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
          title="Commenter (la note reste scellée)"
        >
          💬
          {commentCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-accent/20 text-accent text-[11px] font-semibold">{commentCount}</span>
          )}
        </button>
        <CardEntryReactions entryId={entry.id as string} />
        <span className="flex-1" />
        <span className="text-[11px] text-text-muted/50 italic">Tu peux quand même réagir</span>
      </div>

      {/* Thread de commentaires — composant partagé (markdown, spoilers, mentions, réponses) */}
      {showComments && (
        <div className="mt-3 pt-3 border-t border-text-muted/10">
          <CommentThread entryId={entry.id as string} commentsLocked={false} />
        </div>
      )}
      </div>{/* end px-6 pt-3 pb-5 */}
    </div>
  );
}

/**
 * Hash déterministe → flux de pseudo-random reproductibles à partir d'un seed.
 */
function seededRng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const LOREM_WORDS = [
  'lorem','ipsum','dolor','sit','amet','consectetur','adipiscing','elit','sed','do','eiusmod','tempor','incididunt','ut','labore','et','dolore','magna','aliqua','enim','ad','minim','veniam','quis','nostrud','exercitation','ullamco','laboris','nisi','aliquip','ex','ea','commodo','consequat','duis','aute','irure','reprehenderit','in','voluptate','velit','esse','cillum','fugiat','nulla','pariatur','excepteur','sint','occaecat','cupidatat','non','proident','sunt','culpa','qui','officia','deserunt','mollit','anim','id','est','laborum',
];

/** Génère ~`charCount` caractères de lorem ipsum déterministe à partir du seed. */
function fauxLorem(seed: string, charCount: number): string {
  const rnd = seededRng(seed);
  let out = '';
  let sentenceWords = 0;
  let isSentenceStart = true;
  while (out.length < charCount) {
    let w = LOREM_WORDS[Math.floor(rnd() * LOREM_WORDS.length)] ?? 'lorem';
    if (isSentenceStart) w = w[0]!.toUpperCase() + w.slice(1);
    out += w;
    sentenceWords++;
    // Ponctuation : phrase de 6 à 16 mots
    if (sentenceWords > 5 && rnd() < 0.18) {
      out += '. ';
      sentenceWords = 0;
      isSentenceStart = true;
    } else {
      out += rnd() < 0.08 ? ', ' : ' ';
      isSentenceStart = false;
    }
  }
  return out.slice(0, charCount).trimEnd().replace(/[,]$/, '.');
}

/**
 * Zone 18+ : placeholder généré côté client uniquement (aucune donnée serveur révélée).
 * Le serveur n'envoie que des indices de forme : longueur du contenu et présence d'une cover.
 *  - `hasMedia` true → bloc image stylisé en plus du texte
 *  - `contentLength` → calibre la quantité de lorem ipsum
 */
function AdultBlurZone({
  entryId,
  hasMedia,
  contentLength,
  tall = false,
  badge = true,
}: {
  entryId: string;
  hasMedia: boolean;
  contentLength: number;
  tall?: boolean;
  badge?: boolean;
}) {
  // En modal (tall) on autorise plus de texte ; en preview, on cap court.
  const cap = tall ? 800 : 220;
  const target = Math.max(60, Math.min(contentLength, cap));
  const text = fauxLorem(entryId, target);

  const rnd = seededRng(entryId + ':hue');
  const h1 = Math.floor(rnd() * 360);
  const h2 = Math.floor(rnd() * 360);
  const h3 = Math.floor(rnd() * 360);
  const fauxPhoto = {
    background: `
      radial-gradient(ellipse at 28% 32%, hsl(${h1} 55% 55% / 0.55), transparent 55%),
      radial-gradient(ellipse at 72% 68%, hsl(${h2} 50% 40% / 0.55), transparent 55%),
      radial-gradient(ellipse at 50% 85%, hsl(${h3} 45% 25% / 0.45), transparent 50%),
      linear-gradient(135deg, hsl(${h1} 30% 35%), hsl(${h2} 30% 25%))
    `,
  };

  return (
    <div className="relative select-none rounded-xl overflow-hidden mb-2">
      <div className="pointer-events-none flex flex-col gap-2" aria-hidden>
        {hasMedia && (
          <div
            className={`w-full rounded-lg blur-md ${tall ? 'h-56' : 'h-36'}`}
            style={fauxPhoto}
          />
        )}
        <p
          className="text-text-primary/80 leading-relaxed break-words blur-[3px]"
          style={{ fontSize: tall ? '17px' : '15px' }}
        >
          {text}
        </p>
      </div>
      {badge && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold text-adult/90 bg-bg-elevated/80 backdrop-blur-sm px-2.5 py-1 rounded-full border border-adult/25 shadow-sm">
            🔞 Contenu sensible
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Type d'une entry telle que retournée par `entries.list` (le shape contient
 * déjà les redactions guest : adultLength, adultHasMedia, readGateStatus,
 * shares filtrés, ratings filtrées). Tiré directement du router pour suivre
 * automatiquement les évolutions serveur.
 */
export type GuestListEntry = RouterOutputs['entries']['list'][number];

/**
 * Modal d'une capsule scellée côté confident — sceau + accroche + commentaires.
 * Extrait pour être réutilisé en mode normal ET compact (sinon, en compact, la
 * modal s'ouvrait vide sans le placeholder scellé).
 */
function SealedCapsuleModal({ entry, onClose, inline }: { entry: GuestListEntry; onClose: () => void; inline: boolean }) {
  const cfg = getNoteTypeConfig(entry.noteType as Parameters<typeof getNoteTypeConfig>[0]);
  const unlockAt = entry.unlockAt as string;
  const unlockDate = new Date(unlockAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const diff = new Date(unlockAt).getTime() - Date.now();
  const days = Math.floor(diff / 86_400_000);
  const countdown = days >= 2 ? `dans ${days} jours` : days === 1 ? 'demain' : diff > 3_600_000 ? `dans ${Math.floor(diff / 3_600_000)}h` : `dans ${Math.floor(diff / 60_000)} min`;
  const header = (
    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium font-mono" style={{ color: cfg.color }}>
          <cfg.Icon className="w-3.5 h-3.5 shrink-0" /> {cfg.label}
        </span>
        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-sealed/15 text-sealed font-medium">🔒 Capsule</span>
      </div>
      {entry.title && <span className="text-sm font-medium text-text-primary leading-snug">{entry.title}</span>}
      <span className="text-xs text-text-muted/60">{formatDate(entry.date as string | Date)}</span>
    </div>
  );
  return (
    <NoteModal onClose={onClose} header={header} inline={inline}>
      <div className="px-6 pt-6 pb-8 flex flex-col items-center gap-5">
        <div className="w-16 h-16 rounded-2xl bg-sealed/10 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-text-primary mb-1">{entry.title ?? 'Capsule temporelle'}</h2>
          <p className="text-sm text-text-muted">S'ouvre le {unlockDate}</p>
          <p className="text-xs text-text-muted/50 mt-1">{countdown}</p>
        </div>
        {entry.capsuleSpoiler && (
          <div className="w-full max-w-md rounded-2xl border border-sealed/30 bg-sealed/10 px-4 py-3">
            <p className="text-sm text-amber-500 italic leading-relaxed text-center">"{entry.capsuleSpoiler}"</p>
          </div>
        )}
        <div className="w-full max-w-xs rounded-2xl border border-sealed/20 bg-sealed/5 px-4 py-3 text-center">
          <p className="text-xs text-amber-500/70 leading-relaxed">
            Cette note est scellée. Tu peux réagir et commenter, le contenu te sera révélé à la date d'ouverture.
          </p>
        </div>
        <SealedCapsuleInteractions entryId={entry.id as string} commentsLocked={!!entry.commentsLocked} />
      </div>
    </NoteModal>
  );
}

export function GuestEntryCard({ entry, defaultOpen = false, focusedCommentId, isRead = false, onMarkRead, onMarkUnread, onDesktopClick, onModalClose, desktopPanel = false, isActivePanel = false, compactMode = false }: { entry: GuestListEntry; defaultOpen?: boolean; focusedCommentId?: string; isRead?: boolean; onMarkRead?: () => void; onMarkUnread?: () => void; onDesktopClick?: () => void; onModalClose?: () => void; desktopPanel?: boolean; isActivePanel?: boolean; compactMode?: boolean; }) {
  // Auth — utilisé pour afficher les boutons favoris/nul (lecture du `me.id`).
  const { data: me } = trpc.auth.me.useQuery();
  // Types custom : pour résoudre le `behavior` hérité (rôle-aware, tRPC côté confident).
  const { defsById } = useNoteTypeDefs();
  // Carte scellée pour les entrées secrètes
  if (entry.isSecret) return <SecretEntryCard entry={entry} compactMode={compactMode} />;

  // ── Tous les hooks avant tout return conditionnel ────────────────────────
  // `noteType` brut conservé (persistance/payload) ; le branchement structuré
  // (quelle vue de lecture) passe par `behavior` pour qu'un type custom hérite
  // de la vue de son comportement built-in.
  const noteType = (entry.noteType ?? 'JOURNAL') as NoteType;
  const customTypeId = (entry as { customTypeId?: string | null }).customTypeId;
  const cfg = resolveNoteTypeConfig({ noteType, customTypeId }, defsById);
  const behavior = cfg.behavior;
  // Champs personnalisés du type custom (vide pour les built-in → rien ne s'affiche).
  const fieldDefs = (customTypeId ? defsById[customTypeId]?.fields : undefined) ?? [];
  const headerColor = cfg.color;
  const headerBg = headerColor.startsWith('var(') ? `color-mix(in srgb, ${headerColor} 10%, transparent)` : `${headerColor}1a`;
  const separatorColor = headerColor.startsWith('var(') ? `color-mix(in srgb, ${headerColor} 15%, transparent)` : `${headerColor}26`;
  // m / hasMedia sont recalculés plus bas avec effectiveMediaMeta (qui prend en compte le déverrouillage 18+)
  // Pour la preview de la carte, on utilise entry.contentMd (toujours '' pour les 18+ non déverrouillés)
  const previewContentMd = entry.contentMd ?? '';
  const previewRuns = parsePreviewRuns(previewContentMd);
  const editCount = previewContentMd.match(/^:::edit\b/gm)?.length ?? 0;
  const codeBlockCount = (previewContentMd.match(/^```/gm) ?? []).length / 2 | 0;
  const audioBlocks = [...previewContentMd.matchAll(/^:::audio\s+"([^"]*)"\s+"([^"]*)"/gm)].map((m) => ({ src: m[1] ?? '', filename: m[2] ?? '' }));
  // Plages des blocs :::chat / :::branch — leurs images restent dans leur contexte
  const excludedBlockRanges: Array<[number, number]> = [];
  {
    const blockRe = /:::(?:chat|branch)[^\n]*\n?[\s\S]*?:::/g;
    let bm: RegExpExecArray | null;
    while ((bm = blockRe.exec(previewContentMd)) !== null) excludedBlockRanges.push([bm.index, bm.index + bm[0].length]);
  }
  const inExcludedBlock = (idx: number) => excludedBlockRanges.some(([s, e]) => idx >= s && idx < e);
  // Carousel unifié :::img + ![alt](src) + :::video dans l'ordre d'apparition (spoilers inclus).
  // Les images markdown simples (non redimensionnées) sont incluses comme les :::img.
  const mediaItems: MediaItem[] = [
    ...[...previewContentMd.matchAll(/^(\|\|)?:::img\s+"([^"]*)"\s+"([^"]*)"(?:\s+\d+)?(?:\s+souvenir)?(\|\|)?$/gm)]
      .map((m) => ({ _i: m.index ?? 0, type: 'image' as const, src: m[2] ?? '', alt: m[3] ?? '', spoiler: m[1] === '||' })),
    ...[...previewContentMd.matchAll(/(\|\|)?!\[([^\]]*)\]\(([^)]+)\)(\|\|)?/g)]
      .filter((m) => !inExcludedBlock(m.index ?? 0))
      .map((m) => ({ _i: m.index ?? 0, type: 'image' as const, src: m[3] ?? '', alt: m[2] ?? '', spoiler: m[1] === '||' && m[4] === '||' })),
    ...[...previewContentMd.matchAll(/^(\|\|)?:::video\s+"([^"]*)"\s+"([^"]*)"(?:\s+souvenir)?(\|\|)?$/gm)]
      .map((m) => ({ _i: m.index ?? 0, type: 'video' as const, src: m[2] ?? '', filename: m[3] ?? '', spoiler: m[1] === '||' })),
  ].filter((m) => m.src).sort((a, b) => a._i - b._i).map(({ _i: _, ...item }) => item);

  const cardRef = useRef<HTMLDivElement>(null);
  const [isModalOpen, setIsModalOpen] = useState(defaultOpen || desktopPanel);
  const [searchParams, setSearchParams] = useSearchParams();
  // Ouvre la note quand une notification la cible alors que la carte est déjà
  // montée (l'initialiseur useState ne capte pas ce changement de prop).
  useEffect(() => {
    if (defaultOpen || focusedCommentId) setIsModalOpen(true);
  }, [defaultOpen, focusedCommentId]);
  // Refs miroir de l'état "is read" et de la callback pour éviter des stale closures
  // dans closeModal (qui ne se rebuild pas à chaque changement de `isRead`).
  const isReadRef = useRef(isRead);
  isReadRef.current = isRead;
  const onMarkReadRef = useRef(onMarkRead);
  onMarkReadRef.current = onMarkRead;
  // Tracking : l'utilisateur a-t-il toggle manuellement la lecture pendant cette session ?
  // Si oui, on ne déclenche PAS l'auto-mark-read à la fermeture (respect du choix manuel).
  const userTouchedReadRef = useRef(false);

  // Ferme la modal et nettoie l'URL. Le marquage « lu » ne se fait PLUS ici :
  // il est déclenché à l'OUVERTURE de la note (cf. effet `autoMarkRead` plus bas),
  // car la fermeture n'est pas un évènement fiable (navigation directe, lecture
  // inline, note liée, fermeture d'onglet… ne passent jamais par `closeModal`).
  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    if (desktopPanel) onModalClose?.();
    if (searchParams.get('entryId') === entry.id || searchParams.has('commentId')) {
      const next = new URLSearchParams(searchParams);
      next.delete('entryId');
      next.delete('commentId');
      setSearchParams(next, { replace: true });
    }
    // 18+ : on re-verrouille à la fermeture — la question est demandée à nouveau
    // à la prochaine ouverture. Évite qu'un device laissé ouvert garde le contenu accessible.
    if (entry.isAdult && adultGatePassedRef.current) {
      adultUnlocked.delete(entry.id as string);
      setAdultGatePassed(false);
      setAdultContent(null);
      setAdultGateAnswer('');
    }
  }, [entry.id, entry.isAdult, searchParams, setSearchParams, desktopPanel, onModalClose]);

  // ── Mode 18+ ──────────────────────────────────────────────────────────────
  // Le contenu réel est stocké en mémoire après vérification — jamais dans le DOM avant ça.
  const [adultGatePassed, setAdultGatePassed] = useState(() => adultUnlocked.has(entry.id as string));
  const adultGatePassedRef = useRef(adultGatePassed);
  adultGatePassedRef.current = adultGatePassed;
  const [adultContent, setAdultContent] = useState<{ contentMd: string; links: unknown; title: string | null; mediaMeta: unknown } | null>(null);

  // Contenu effectif : vide tant que la gate 18+ n'est pas passée
  const effectiveContentMd = (entry.isAdult && adultGatePassed && adultContent)
    ? adultContent.contentMd
    : (entry.contentMd ?? '');
  // Media meta effective : null tant que pas déverrouillé (le serveur ne l'envoie pas).
  // On extrait via `unknown` pour casser la profondeur d'inférence tRPC (TS2589).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entryMediaMeta: MediaMeta | null = (entry as any).mediaMeta as MediaMeta | null;
  const m: MediaMeta = (entry.isAdult && adultGatePassed && adultContent)
    ? ((adultContent.mediaMeta as unknown as MediaMeta | null) ?? {})
    : (entryMediaMeta ?? {});
  const hasMedia = behavior !== 'JOURNAL' && (!!m.subject || (behavior === 'MUSIC' && isPlaylist(m)));
  const isMusicPlaylist = behavior === 'MUSIC' && isPlaylist(m);
  // Retire seulement la 1re image HORS bloc :::chat (sinon on casse les conversations).
  // `firstImage` (sa source) est affichée séparément dans la vue lecture de la modale.
  const { firstImage, contentWithoutImages } = (() => {
    const excludedRanges: Array<[number, number]> = [];
    const blockRe = /:::(?:chat|branch)[^\n]*\n?[\s\S]*?:::/g;
    let mm: RegExpExecArray | null;
    while ((mm = blockRe.exec(effectiveContentMd)) !== null) excludedRanges.push([mm.index, mm.index + mm[0].length]);
    const inChat = (idx: number) => excludedRanges.some(([s, e]) => idx >= s && idx < e);
    // N'extraire la 1re image en « hero » que s'il y en a UNE SEULE (hors chat/branch) :
    // sinon on isolerait la 1re image au-dessus du carrousel (cf. note-galerie).
    const countRe = /!\[.*?\]\([^)]+\)|<img\s[^>]*src="[^"]*"|:::img\s+"/gi;
    let imgCount = 0;
    let cm: RegExpExecArray | null;
    while ((cm = countRe.exec(effectiveContentMd)) !== null) { if (!inChat(cm.index)) imgCount++; }
    if (imgCount >= 2) return { firstImage: null, contentWithoutImages: effectiveContentMd.trim() };
    const mdRe = /!\[.*?\]\(([^)]+)\)/g;
    const htmlRe = /<img\s[^>]*src="([^"]*)"[^>]*\/?>/gi;
    let target: { index: number; length: number; src: string } | null = null;
    for (const re of [mdRe, htmlRe]) {
      let m2: RegExpExecArray | null;
      while ((m2 = re.exec(effectiveContentMd)) !== null) {
        if (!inChat(m2.index)) { target = { index: m2.index, length: m2[0].length, src: m2[1] ?? '' }; break; }
      }
      if (target) break;
    }
    return {
      firstImage: target?.src || null,
      contentWithoutImages: (target ? effectiveContentMd.slice(0, target.index) + effectiveContentMd.slice(target.index + target.length) : effectiveContentMd).trim(),
    };
  })();
  // Preview : fallback image statique uniquement si le carousel n'a rien capté
  // (cas legacy <img> HTML — les images markdown sont déjà dans mediaItems).
  const previewFirstImage = mediaItems.some((mi) => mi.type === 'image') ? null : firstImage;
  const [adultGateAnswer, setAdultGateAnswer] = useState('');
  const [adultGateError, setAdultGateError] = useState(false);
  const [adultDuplicateError, setAdultDuplicateError] = useState(false);
  const [adultFailedAttempts, setAdultFailedAttempts] = useState(0);
  const submittedAnswers = useRef(new Set<string>());

  // ── Verrou de lecture conditionné (read gate) ────────────────────────────
  const [readGateAnswer, setReadGateAnswer] = useState('');
  const [readGateSubmitting, setReadGateSubmitting] = useState(false);
  // État local optimiste — survit aux re-renders sans attendre l'invalidation.
  const [readGateLocalStatus, setReadGateLocalStatus] = useState<'pending' | 'approved' | null>(null);
  const gateUtils = trpc.useUtils();
  const respondToReadGate = trpc.readGate.respond.useMutation({
    // Quand la réponse est approuvée (auto ou plus tard manuel), il faut
    // rafraîchir les queries qui portent le contenu de l'entrée — sinon le
    // cache garde le contentMd vide retourné précédemment par `applyReadGate`
    // (la note semble verrouillée jusqu'au prochain refetch périodique).
    onSuccess: () => {
      void gateUtils.entries.list.invalidate();
      void gateUtils.entries.byId.invalidate();
    },
  });
  const readGateActive = !!(entry as any).readGatePrompt;
  // Priorité : le serveur est définitif quand il a tranché (approved/rejected).
  // Avant ce fix, le local optimiste 'pending' masquait un 'rejected' arrivant
  // par SSE → la modale restait sur « En attente » et l'input ne réapparaissait
  // pas pour relancer une autre réponse.
  const serverGateStatus = (entry as any).readGateStatus as string | null | undefined;
  const readGateStatus: string | null = (
    serverGateStatus === 'rejected' || serverGateStatus === 'approved'
      ? serverGateStatus
      : (readGateLocalStatus ?? serverGateStatus ?? null)
  );
  const readGateBlocking = readGateActive && readGateStatus !== 'approved';
  // Sync : dès que le serveur tranche, on jette le local pour éviter qu'il
  // shadow une décision ultérieure (ex: revenir sur ma décision côté owner).
  useEffect(() => {
    if (serverGateStatus === 'rejected' || serverGateStatus === 'approved') {
      setReadGateLocalStatus(null);
    }
  }, [serverGateStatus]);

  // ── Ouverture d'une note : log d'audit + marquage « lu » ──────────────────
  // Évènement fiable : dès que le confident ouvre la note ET que le contenu est
  // réellement accessible (gate 18+ passée, read-gate non bloquant). Remplace
  // l'ancien marquage à la fermeture, qui ratait tous les chemins ne passant pas
  // par `closeModal` (lecture inline, note liée, nav directe, fermeture d'onglet…).
  //  - `logOpen` : journalise CHAQUE ouverture (audit `ENTRY_OPENED`), même note déjà lue.
  //  - `markRead` : marque lu uniquement si encore non-lue et sans choix manuel.
  // Les refs `loggedOpenRef`/`autoMarkedRef` évitent les appels en double sur ce montage.
  const logOpen = trpc.entries.logOpen.useMutation();
  const loggedOpenRef = useRef(false);
  const autoMarkedRef = useRef(false);
  useEffect(() => {
    if (!isModalOpen) return;
    if (entry.isAdult && !adultGatePassed) return;
    if (readGateBlocking) return;
    // Capsule encore scellée : contenu inaccessible → ni log d'ouverture ni
    // marquage « lu » (le confident ne voit que le sceau).
    if (entry.unlockAt && new Date(entry.unlockAt as string) > new Date()) return;
    if (!loggedOpenRef.current) {
      loggedOpenRef.current = true;
      logOpen.mutate({ entryId: entry.id as string });
    }
    if (!autoMarkedRef.current && !userTouchedReadRef.current && !isReadRef.current) {
      autoMarkedRef.current = true;
      onMarkReadRef.current?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen, adultGatePassed, readGateBlocking, entry.isAdult]);

  const handleReadGateSubmit = async () => {
    const val = readGateAnswer.trim();
    if (!val || readGateSubmitting) return;
    setReadGateSubmitting(true);
    try {
      const res = await respondToReadGate.mutateAsync({ entryId: entry.id as string, response: val });
      // Le serveur renvoie `approved: true | false | null` (null = en attente owner).
      if (res.approved === true) {
        setReadGateLocalStatus('approved');
      } else {
        setReadGateLocalStatus('pending');
      }
      setReadGateAnswer('');
    } catch { /* swallow — l'utilisateur peut réessayer */ }
    finally { setReadGateSubmitting(false); }
  };

  // Partage du lien direct vers la note — permet au confident de renvoyer une
  // référence précise à l'owner quand ils en discutent ailleurs (Slack, SMS…).
  const [linkCopied, setLinkCopied] = useState(false);
  const handleShareLink = async () => {
    const url = `${window.location.origin}/?entryId=${entry.id as string}`;
    // Sur mobile : picker natif (WhatsApp, SMS, Mail…). Fallback : presse-papier.
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ url }); return; } catch { /* user cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch { /* noop */ }
  };
  const unlockAdultContent = trpc.entries.unlockAdultContent.useMutation();

  // Si la clémence a été déclenchée, on stocke la réponse révélée pour l'afficher.
  const [mercyRevealed, setMercyRevealed] = useState<string | null>(null);
  const handleAdultGateSubmit = useCallback(async () => {
    const trimmed = adultGateAnswer.trim();
    if (!trimmed) return;
    if (submittedAnswers.current.has(trimmed)) {
      setAdultDuplicateError(true);
      setAdultGateError(false);
      return;
    }
    submittedAnswers.current.add(trimmed);
    setAdultDuplicateError(false);
    try {
      const result = await unlockAdultContent.mutateAsync({ id: entry.id as string, answer: trimmed });
      if (result.ok) {
        adultUnlocked.add(entry.id as string);
        setAdultGatePassed(true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = result as any;
        setAdultContent({
          contentMd: r.contentMd as string,
          links: r.links,
          title: (r.title as string | null) ?? null,
          mediaMeta: r.mediaMeta,
        });
        // Clémence : l'auteur a accordé l'accès après 100 essais et nous offre la réponse.
        if (r.mercy === true && typeof r.mercyAnswer === 'string') {
          setMercyRevealed(r.mercyAnswer as string);
        }
        setAdultGateError(false);
        setAdultGateAnswer('');
        setAdultFailedAttempts(0);
        // Le marquage "lu" est différé à la fermeture du modal (closeModal s'en occupe)
      } else {
        setAdultGateError(true);
        setAdultFailedAttempts((n) => n + 1);
      }
    } catch {
      setAdultGateError(true);
      setAdultFailedAttempts((n) => n + 1);
    }
  }, [entry.id, adultGateAnswer, unlockAdultContent]);

  // ── Tous les hooks AVANT tout return conditionnel ─────────────────────────
  const handleOpen = useCallback(() => {
    if (onDesktopClick && window.innerWidth >= 1024) {
      onDesktopClick();
    } else {
      setIsModalOpen(true);
      userTouchedReadRef.current = false;
    }
  }, [onDesktopClick]);

  useEffect(() => {
    if (defaultOpen && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [defaultOpen]);

  // ── Carte capsule temporelle ──────────────────────────────────────────────
  const isSealedCapsule = !!(entry.unlockAt && new Date(entry.unlockAt) > new Date());
  if (isSealedCapsule && !compactMode) {
    const unlockAt = entry.unlockAt as string;
    const unlockDate = new Date(unlockAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const diff = new Date(unlockAt).getTime() - Date.now();
    const days = Math.floor(diff / 86_400_000);
    const countdown = days >= 2 ? `dans ${days} jours` : days === 1 ? 'demain' : diff > 3_600_000 ? `dans ${Math.floor(diff / 3_600_000)}h` : `dans ${Math.floor(diff / 60_000)} min`;
    return (
      <>
        {/* Carte preview — cachée en desktop panel (la modal inline prend toute la colonne) */}
        {!desktopPanel && (
          <div
            ref={cardRef}
            onClick={handleOpen}
            className="bg-bg-elevated rounded-2xl shadow-soft border-l-[3px] overflow-hidden cursor-pointer [@media(hover:hover)]:hover:-translate-y-0.5 transition-transform duration-200"
            style={{ borderLeftColor: cfg.color }}
          >
            {/* Header coloré */}
            <div className="px-6 pt-4 pb-3" style={{ backgroundColor: headerBg }}>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium font-mono" style={{ color: cfg.color }}><cfg.Glyph className="w-3.5 h-3.5 shrink-0" /> {cfg.label}</span>
                <span className="text-xs text-text-muted/70">{formatDate(entry.date as string | Date)}</span>
              </div>
            </div>
            <div className="h-px" style={{ backgroundColor: separatorColor }} />
            <div className="px-6 pt-3 pb-5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">🔒</span>
                {entry.title
                  ? <span className="text-sm font-medium text-text-primary">{entry.title}</span>
                  : <span className="text-sm text-text-muted italic">Capsule temporelle</span>
                }
              </div>
              <p className="text-xs text-text-muted">S'ouvre le {unlockDate}</p>
              <p className="text-xs text-text-muted/50 mt-0.5">{countdown}</p>
              {entry.capsuleSpoiler && (
                <p className="text-xs text-amber-500/80 italic mt-2 leading-snug">"{entry.capsuleSpoiler as string}"</p>
              )}
              <div className="mt-2.5 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={handleOpen}
                  className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
                  title="Commenter (la note reste scellée)"
                >
                  💬
                  {((entry._count?.comments as number | undefined) ?? 0) > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-accent/20 text-accent text-[11px] font-semibold">
                      {(entry._count?.comments as number | undefined) ?? 0}
                    </span>
                  )}
                </button>
                <CardEntryReactions entryId={entry.id as string} />
              </div>
            </div>
          </div>
        )}
        {isModalOpen && <SealedCapsuleModal entry={entry} onClose={closeModal} inline={desktopPanel} />}
      </>
    );
  }
  const commentCount: number = (entry._count?.comments as number | undefined) ?? 0;

  const timeDisplay: string | null = entry.timeLabel
    ? (entry.timeLabel as string)
    : entry.section
      ? ({ MORNING: 'Matin', LATE_MORNING: 'Fin de matinée', NOON: 'Midi', AFTERNOON: 'Après-midi', LATE_AFTERNOON: "Fin d'après-midi", EARLY_EVENING: 'Début de soirée', EVENING: 'Soir', NIGHT: 'Nuit', FREE: 'Libre' } as Record<string, string>)[entry.section as string] ?? null
      : null;

  const modalHeader = (
    <>
      {/* En-tête épuré, comme la vue lecture owner : type + titre tronqué. La
          date · heure · météo · badges sont remontés dans le corps (kicker). */}
      <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
        <span className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium font-mono" style={{ color: cfg.color }}>
          <cfg.Glyph className="w-3.5 h-3.5 shrink-0" /> {cfg.label}
        </span>
        {entry.title && (
          <span className="text-sm font-medium text-text-primary truncate">{entry.title as string}</span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {(onMarkRead || onMarkUnread) && (
          <button
            type="button"
            onClick={() => {
              // Tag : l'utilisateur a manuellement touché la lecture → on annule l'auto-mark à la fermeture
              userTouchedReadRef.current = true;
              if (isRead) onMarkUnread?.();
              else onMarkRead?.();
            }}
            className={`text-[11px] flex items-center gap-1 transition-colors ${isRead ? 'text-text-muted/55 hover:text-text-muted' : 'text-accent/70 hover:text-accent'}`}
          >
            {isRead ? (
              <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>Lu</>
            ) : (
              <><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="12" r="6" /></svg>Marquer lu</>
            )}
          </button>
        )}
        <button
          type="button"
          onClick={handleShareLink}
          title={linkCopied ? 'Lien copié !' : 'Partager le lien de la note'}
          aria-label={linkCopied ? 'Lien copié' : 'Partager le lien'}
          className="p-1.5 rounded-lg text-text-muted/60 hover:text-text-primary hover:bg-text-muted/10 transition-colors"
        >
          {linkCopied ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-success)' }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={closeModal}
          className="p-1.5 rounded-lg text-text-muted/60 hover:text-text-primary hover:bg-text-muted/10 transition-colors"
          aria-label="Fermer"
        >
          {desktopPanel ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          )}
        </button>
      </div>
    </>
  );

  // ── Mode compact : aperçu ultra-condensé (composant partagé owner/guest) ──
  const compactPreview = (compactMode && !desktopPanel) ? (
    <CompactEntryCard
      cardRef={cardRef}
      onClick={handleOpen}
      entryId={entry.id as string}
      noteType={noteType}
      date={typeof entry.date === 'string' ? (entry.date as string) : new Date(entry.date as Date).toISOString()}
      title={entry.title as string | null}
      contentMd={(entry.contentMd ?? '') as string}
      mediaSubject={(m.subject as string | undefined) ?? null}
      isMusicPlaylist={isMusicPlaylist}
      customTypeId={(entry as { customTypeId?: string | null }).customTypeId ?? null}
      infoLine={behavior === 'DEV' ? formatDevInfoLine(m) : formatAgendaFinanceInfoLine(behavior, m)}
      timeLabel={timeDisplay}
      isAdult={!!entry.isAdult}
      adultGatePassed={adultGatePassed}
      isSealedCapsule={isSealedCapsule}
      capsuleSpoiler={(entry.capsuleSpoiler as string | null | undefined) ?? null}
      isDraft={!!entry.isDraft}
      isForConfidant={!!entry.isForConfidant}
      hasReadGate={!!entry.readGatePrompt}
      readGateStatus={(entry as any).readGateStatus ?? readGateLocalStatus ?? null}
      readGatePrompt={(entry as any).readGatePrompt ?? null}
      hideUntilFuture={!!entry.hideUntilAt && new Date(entry.hideUntilAt as string).getTime() > Date.now()}
      commentCount={(entry._count?.comments as number | undefined) ?? 0}
      ratings={(entry as { ratings?: Array<{ userId: string; value: 'FAVORITE' | 'LOW'; displayName: string | null }> }).ratings ?? []}
      isUnreadForGuest={!isRead}
      isActivePanel={defaultOpen || isActivePanel}
      showAccentRing={!!entry.isForConfidant}
      showSubtleRing={!isRead && !entry.isForConfidant}
    />
  ) : null;

  return (
    <>
      {/* Compact card */}
      {compactPreview}
      {!compactPreview && !desktopPanel && <div
        ref={cardRef}
        onClick={handleOpen}
        className={`bg-bg-elevated rounded-2xl shadow-soft border-l-[3px] overflow-hidden cursor-pointer [@media(hover:hover)]:hover:-translate-y-0.5 transition-transform duration-200 ${defaultOpen ? 'ring-1 ring-accent/30' : ''} ${!isRead && !entry.isForConfidant ? 'ring-1 ring-accent/15' : ''} ${entry.isForConfidant ? 'ring-2 ring-accent/35' : ''}`}
        style={{
          borderLeftColor: cfg.color,
          ...(isActivePanel ? {
            boxShadow: `inset 0 0 0 2px ${headerColor.startsWith('var(') ? `color-mix(in srgb, ${headerColor} 55%, transparent)` : `${headerColor}8c`}, var(--shadow-soft)`,
          } : {}),
        }}
      >
        {/* ── Header coloré ─────────────────────────────────────────────────── */}
        <div className="px-6 pt-4 pb-3" style={{ backgroundColor: headerBg }}>
          <div className="flex items-center justify-between gap-2">
            {/* Type + unread dot + time */}
            <div className="flex items-center gap-2 min-w-0">
              {!isRead && (
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: headerColor }}
                  title="Non lu"
                />
              )}
              <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: cfg.color }}>
                <cfg.Glyph className="w-3.5 h-3.5 shrink-0" /> {cfg.label}
              </span>
              {timeDisplay && <span className="text-xs text-text-muted">{timeDisplay}</span>}
            </div>
            {/* Badges + date + share */}
            <div className="flex items-center gap-2 shrink-0">
              {entry.isForConfidant && (
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent font-medium flex items-center gap-1">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  Pour toi
                </span>
              )}
              {entry.isDraft && (
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-warning/15 text-warning font-medium">Brouillon</span>
              )}
              <span className="text-xs text-text-muted tabular-nums">{formatDateShort(entry.date as string | Date)}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); void handleShareLink(); }}
                title={linkCopied ? 'Lien copié !' : 'Partager le lien'}
                aria-label={linkCopied ? 'Lien copié' : 'Partager le lien'}
                className="p-1 -m-1 rounded text-text-muted/50 hover:text-text-primary transition-colors"
              >
                {linkCopied ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-success)' }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
        {/* Séparateur */}
        <div className="h-px" style={{ backgroundColor: separatorColor }} />
        {/* ── Body ──────────────────────────────────────────────────────────── */}
        <div className="px-6 pt-3 pb-5">

        {/* ── Contenu principal : verrou conditionné → preview verrouillée, 18+ non déverrouillé → zone floutée, sinon normal ── */}
        {readGateBlocking ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleOpen(); }}
            className="w-full text-left flex items-start gap-3 p-3 rounded-xl bg-accent/[0.06] border border-accent/20 hover:bg-accent/[0.10] transition-colors mb-1"
          >
            <span className="shrink-0 w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center" aria-hidden>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /><circle cx="12" cy="16" r="1" fill="currentColor" />
              </svg>
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono uppercase tracking-widest text-accent mb-0.5">
                {readGateStatus === 'pending' ? 'Réponse envoyée' : readGateStatus === 'rejected' ? 'Accès refusé' : 'Verrou de lecture'}
              </p>
              {(entry as any).readGatePrompt && (readGateStatus === 'awaiting' || readGateStatus === null) ? (
                <p className="text-sm text-text-primary/90 italic leading-snug line-clamp-2">« {(entry as any).readGatePrompt as string} »</p>
              ) : readGateStatus === 'pending' ? (
                <p className="text-sm text-text-muted/80 leading-snug">En attente de validation par l'auteur.</p>
              ) : readGateStatus === 'rejected' ? (
                <p className="text-sm text-text-muted/80 leading-snug">Ta demande d'accès a été refusée.</p>
              ) : null}
              <p className="text-[11px] text-accent/80 mt-1">Toucher pour {readGateStatus === 'awaiting' || readGateStatus === null ? 'répondre' : 'voir le détail'} →</p>
            </div>
          </button>
        ) : entry.isAdult && !adultGatePassed ? (
          <AdultBlurZone entryId={entry.id as string} hasMedia={!!entry.adultHasMedia} contentLength={(entry.adultLength as number | null) ?? 200} />
        ) : (
          <>
            {/* Preview playlist : nav entre tracks, sans player (règle confident) */}
            {hasMedia && isMusicPlaylist && (
              <div className="mb-1.5">
                <MusicNotePlayer meta={m} compact hidePlayer />
              </div>
            )}

            {/* Media meta preview — ultra-compacte si la note n'a que la fiche média (pas de texte/audio/image en plus) */}
            {hasMedia && !isMusicPlaylist && (() => {
              const hasBodyContent = previewRuns.length > 0
                || codeBlockCount > 0
                || audioBlocks.length > 0
                || mediaItems.length > 0
                || !!previewFirstImage;
              // Progression contextuelle : page/tome pour livres, S/E pour séries, etc.
              const progression: string | null = (() => {
                if (behavior === 'SERIES') {
                  return m.season
                    ? `S${m.season}${m.progressCurrent ? `E${m.progressCurrent}` : ''}${m.progressTotal ? `/${m.progressTotal}` : ''}`
                    : null;
                }
                if (behavior === 'BOOK') {
                  if (m.volume) return `T.${m.volume}${m.totalVolumes ? `/${m.totalVolumes}` : ''}`;
                  if (m.progressCurrent && m.progressTotal) return `p.${m.progressCurrent}/${m.progressTotal}`;
                  return null;
                }
                if (m.progressCurrent && m.progressTotal) return `${m.progressCurrent}/${m.progressTotal}`;
                return null;
              })();

              // Mode 1 ligne : juste cover + titre + (progression) + (note) — pas de créateur (visible dans modal)
              if (!hasBodyContent) {
                return (
                  <div className="flex items-center gap-2 min-w-0">
                    {m.coverUrl && (
                      <img src={m.coverUrl} alt="" className="h-7 w-auto rounded object-cover shrink-0 shadow-sm" />
                    )}
                    <p className="text-text-primary text-sm font-medium leading-tight truncate flex-1 min-w-0">{m.subject}</p>
                    {progression && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0" style={{ backgroundColor: noteTint(cfg.color, 9), color: cfg.color }}>{progression}</span>
                    )}
                    {m.rating && (
                      <span className="text-[11px] shrink-0" style={{ color: cfg.color }}>{'★'.repeat(m.rating)}</span>
                    )}
                  </div>
                );
              }

              // Mode compact normal : cover + titre + créateur + note, puis le texte de la note en dessous
              return (
                <div className="mb-1.5 flex items-center gap-2">
                  {m.coverUrl && (
                    <img src={m.coverUrl} alt="" className="h-9 w-auto rounded object-cover shrink-0 shadow-sm" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-text-primary font-medium text-sm leading-tight truncate">{m.subject}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {m.creator && <span className="text-[11px] text-text-muted truncate">{m.creator}</span>}
                      {progression && <span className="text-[11px] text-text-muted/70 shrink-0">{progression}</span>}
                      {m.rating && (
                        <span className="text-[11px] shrink-0" style={{ color: cfg.color }}>{'★'.repeat(m.rating)}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Music player retiré de la preview côté confident — visible uniquement dans la modal */}

            {/* Titre custom (utile surtout pour les notes JOURNAL — les médias affichent déjà m.subject) */}
            {entry.title && !hasMedia && (
              <p className="text-text-primary font-medium text-sm leading-tight mb-1.5 truncate">{entry.title}</p>
            )}

            {/* Agenda — résumé compact dans la carte (détail complet à l'ouverture) */}
            {behavior === 'AGENDA' && (() => {
              const evs = m.events ?? [];
              if (evs.length === 0) return <p className="text-text-muted/55 italic text-sm mb-2">Aucun événement</p>;
              const up = upcomingCount(evs, isoToday());
              return (
                <p className="text-sm text-text-muted/80 mb-2 flex items-center gap-1.5">
                  <span style={{ color: 'var(--color-note-agenda)' }} aria-hidden>▦</span>
                  {up > 0 ? `${up} à venir · ` : ''}{evs.length} événement{evs.length > 1 ? 's' : ''}
                </p>
              );
            })()}

            {/* Finance — résumé compact (solde) dans la carte */}
            {behavior === 'FINANCE' && (() => {
              const its = m.budgetItems ?? [];
              if (its.length === 0) return <p className="text-text-muted/55 italic text-sm mb-2">Aucune ligne</p>;
              const t = budgetTotals(its);
              const cur = m.currency ?? '€';
              return (
                <p className="text-sm text-text-muted/80 mb-2 flex items-center gap-1.5">
                  Solde <span className="font-semibold tabular-nums" style={{ color: t.balance >= 0 ? '#3F8A5A' : 'var(--color-error)' }}>{formatAmount(t.balance, cur, { signed: true })}</span>
                  <span className="text-text-muted/55">· {its.length} ligne{its.length > 1 ? 's' : ''}</span>
                </p>
              );
            })()}

            {/* Text preview */}
            {/* Image preview : cap à 40vh (preview = ~30% de l'écran utile, on évite que la carte explose pour un GIF portrait) */}
            {mediaItems.length > 0 && (
              <div className="mb-2" onClick={(e) => e.stopPropagation()}>
                <MediaCarousel items={mediaItems} />
              </div>
            )}
            {previewFirstImage && <TruncatedImage src={previewFirstImage} maxHeightClass="max-h-[40vh]" className="mb-2" />}
            {previewRuns.length > 0 ? (
              <p className="text-text-primary leading-relaxed line-clamp-3 mb-2" style={{ fontFamily: getFontFamily((entry as any).font), fontSize: scaledFontSize((entry as any).font, (entry.fontSize as string | null) ?? '17px', 15) }}>
                <PreviewRuns runs={previewRuns} />
              </p>
            ) : codeBlockCount > 0 && audioBlocks.length === 0 ? (
              <p className="text-text-muted/60 text-sm mb-2 flex items-center gap-1.5 font-mono">
                <span className="opacity-60">{'{}'}</span>
                {codeBlockCount > 1 ? `${codeBlockCount} blocs de code` : '1 bloc de code'}
              </p>
            ) : audioBlocks.length === 0 && mediaItems.length === 0 && previewRuns.length === 0 && !previewFirstImage && !hasMedia && behavior !== 'AGENDA' && behavior !== 'FINANCE' && (
              // Fallback uniquement pour les notes sans média ET sans contenu (les médias purs
              // sont déjà affichés en mode 1-ligne juste au-dessus, pas besoin de "Pas encore de critique…")
              <p className="text-text-muted/55 italic mb-2" style={{ fontFamily: getFontFamily((entry as any).font), fontSize: scaledFontSize((entry as any).font, (entry.fontSize as string | null) ?? '17px', 15) }}>
                {({ JOURNAL: '…', BOOK: '…', SERIES: '…', MOVIE: '…', MUSIC: '…', OUTING: '…', SHOPPING: '…', DEV: 'Écrire du code…' } as Record<string, string>)[behavior] ?? '…'}
              </p>
            )}
          </>
        )}

        {/* Audio players — 2+ pistes consécutives → playlist groupée. */}
        {audioBlocks.length > 0 && (
          <div className="mb-2" onClick={(e) => e.stopPropagation()}>
            {audioBlocks.length >= 2 ? (
              <BulkAudioPlayer items={audioBlocks.map((a) => ({ src: a.src, filename: a.filename }))} />
            ) : (
              <AudioPlayer src={audioBlocks[0]!.src} filename={audioBlocks[0]!.filename} />
            )}
          </div>
        )}


        {/* Edit block indicator */}
        {editCount > 0 && (
          <div className="flex items-center gap-1.5 mb-2">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-warning/60 shrink-0">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            <span className="text-[11px] text-warning/60">
              {editCount > 1 ? `${editCount} ajouts` : '1 ajout'}
            </span>
          </div>
        )}

        {/* Footer : commentaires · réactions · tags · météo · humeur */}
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-text-muted/70 flex items-center gap-1.5 shrink-0">
            💬
            {commentCount > 0 && (
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-accent/20 text-accent text-[11px] font-semibold">{commentCount}</span>
            )}
          </span>
          <CardEntryReactions entryId={entry.id as string} />
          {/* Favoris / nul — notation perso. Guest voit sa propre note + celle
              de l'owner (filtré côté serveur dans entry.ratings). */}
          {me && (
            <EntryRatingButtons
              entryId={entry.id as string}
              currentUserId={me.id}
              ratings={(entry.ratings as Array<{ userId: string; value: 'FAVORITE' | 'LOW'; displayName: string | null }> | undefined) ?? []}
            />
          )}
          <span className="flex-1" />
          {/* Tags (lecture seule, max 3 + « +N ») — la donnée est dans le payload guest. */}
          {((entry.tagNames as string[] | undefined) ?? []).slice(0, 3).map((t) => (
            <span key={t} className="text-xs text-text-muted/80 bg-text-muted/8 px-2 py-0.5 rounded-full shrink-0">#{t}</span>
          ))}
          {((entry.tagNames as string[] | undefined)?.length ?? 0) > 3 && (
            <span className="text-xs text-text-muted/50 px-1 shrink-0">+{(entry.tagNames as string[]).length - 3}</span>
          )}
          {/* Météo */}
          {entry.weather && (
            <span className="text-sm leading-none shrink-0" title="Météo">{entry.weather as string}</span>
          )}
          {entry.mood && (
            <span className="text-base leading-none shrink-0" title="Humeur">{entry.mood as string}</span>
          )}
        </div>
        </div>
      </div>}

      {/* Read modal */}
      {/* Capsule scellée : en compact, on retombe ici (la branche dédiée ne gère
          que le mode non-compact pour la carte) → on affiche quand même la modal
          scellée et jamais le contenu redacté. */}
      {isModalOpen && isSealedCapsule && (
        <SealedCapsuleModal entry={entry} onClose={closeModal} inline={desktopPanel} />
      )}
      {isModalOpen && !isSealedCapsule && (
        <NoteModal onClose={closeModal} header={modalHeader} inline={desktopPanel} fullscreen={!desktopPanel}>
          {readGateBlocking ? (
            // ── Verrou conditionné : condition + champ de réponse ────────────
            <div className="relative overflow-hidden min-h-[420px] flex flex-col items-center justify-center gap-4 px-6 py-10">
              <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center shrink-0">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  <circle cx="12" cy="16" r="1" fill="currentColor" />
                </svg>
              </div>
              <div className="text-center">
                <h2 className="text-lg font-semibold text-text-primary mb-1">Verrou de lecture</h2>
                <p className="text-sm text-text-muted">
                  {readGateStatus === 'pending'
                    ? 'Ta réponse a été envoyée. En attente de validation par l’auteur.'
                    : readGateStatus === 'rejected'
                      ? 'Ta réponse a été refusée. Tu peux en proposer une nouvelle.'
                      : 'Pour accéder à cette note, lis la condition et envoie ta réponse.'}
                </p>
              </div>

              {/* Condition de l'auteur */}
              {(entry as any).readGatePrompt && (
                <div className="w-full max-w-md rounded-2xl border border-accent/20 bg-accent/5 px-4 py-3">
                  <p className="text-sm text-text-primary italic leading-relaxed text-center">
                    « {(entry as any).readGatePrompt as string} »
                  </p>
                </div>
              )}

              {/* Champ de réponse — masqué si en attente (status pending) */}
              {readGateStatus !== 'pending' && (
                <div className="w-full max-w-md flex flex-col gap-2">
                  <textarea
                    value={readGateAnswer}
                    onChange={(e) => setReadGateAnswer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void handleReadGateSubmit();
                      }
                    }}
                    rows={3}
                    maxLength={2000}
                    placeholder="Ta réponse à la condition…"
                    autoFocus
                    className="w-full bg-bg-primary/80 border border-text-muted/15 rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted/55 outline-none focus:border-accent/40 resize-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleReadGateSubmit()}
                    disabled={!readGateAnswer.trim() || readGateSubmitting}
                    className="w-full py-2.5 rounded-xl text-sm font-medium bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-40 transition-colors"
                  >
                    {readGateSubmitting ? 'Envoi…' : 'Envoyer'}
                  </button>
                  <p className="text-[11px] text-text-muted/50 text-center leading-relaxed">
                    Si ta réponse correspond à une formule auto-acceptée par l’auteur, l’accès est immédiat. Sinon il reçoit une notification pour valider.
                  </p>
                </div>
              )}
            </div>
          ) : entry.isAdult && !adultGatePassed ? (
            // ── Adult gate view — fond flouté + formulaire centré ────────────
            <div className="relative overflow-hidden min-h-[520px]">
              {/* Fond : zone floutée sans badge — min-height pour avoir de quoi superposer le form même sur du contenu court */}
              <div className="px-4 pt-4">
                <AdultBlurZone entryId={entry.id as string} hasMedia={!!entry.adultHasMedia} contentLength={Math.max((entry.adultLength as number | null) ?? 200, 600)} tall badge={false} />
              </div>
              {/* Formulaire centré par-dessus */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 bg-bg-primary/60 backdrop-blur-sm">
                <div className="w-14 h-14 rounded-2xl bg-adult/10 flex items-center justify-center shrink-0">
                  <span className="text-3xl">🔞</span>
                </div>
                <div className="text-center">
                  <h2 className="text-lg font-semibold text-text-primary mb-1">Contenu sensible</h2>
                  <p className="text-sm text-text-muted">Réponds à la question pour accéder à cette note.</p>
                </div>
                {entry.adultQuestion && (
                  <div className="w-full max-w-sm rounded-2xl border border-adult/20 bg-adult/5 px-4 py-3 text-center">
                    <p className="text-sm text-orange-300 font-medium">{entry.adultQuestion as string}</p>
                  </div>
                )}
                <div className="w-full max-w-sm flex flex-col gap-2">
                  <input
                    type="text"
                    value={adultGateAnswer}
                    onChange={(e) => { setAdultGateAnswer(e.target.value); setAdultGateError(false); setAdultDuplicateError(false); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleAdultGateSubmit(); }}
                    placeholder="Ta réponse…"
                    autoFocus
                    className={`w-full bg-bg-primary/80 border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted/55 outline-none transition-colors ${adultGateError ? 'border-danger/50 focus:border-danger' : 'border-text-muted/15 focus:border-orange-400/50'}`}
                  />
                  {adultGateError && (
                    <p className="text-xs text-danger text-center">Réponse incorrecte, réessaie.</p>
                  )}
                  {adultDuplicateError && (
                    <p className="text-xs text-adult text-center">Tu as déjà essayé cette réponse.</p>
                  )}
                  {/* Indices progressifs — affichage cumulatif */}
                  {(() => {
                    const hints: string[] = (entry.adultHints as string[] | undefined) ?? [];
                    const thresholds: number[] = [10, 20, 30, 40, 50];
                    const items: ReactNode[] = [];
                    if (adultFailedAttempts > 0 && adultFailedAttempts < 10 && hints[0]) {
                      const remaining = 10 - adultFailedAttempts;
                      items.push(
                        <p key="countdown-init" className="text-xs text-text-muted/60 text-center">
                          Indice disponible dans {remaining} essai{remaining > 1 ? 's' : ''}
                        </p>
                      );
                    }
                    for (let i = 0; i < thresholds.length; i++) {
                      const threshold = thresholds[i] as number;
                      if (adultFailedAttempts >= threshold && hints[i]) {
                        items.push(
                          <p key={`hint-${i}`} className="text-xs text-orange-300/80 text-center bg-adult/5 rounded-lg px-3 py-2">
                            💡 Indice {i + 1} : {hints[i]}
                          </p>
                        );
                        const nextThreshold = thresholds[i + 1];
                        if (nextThreshold !== undefined && adultFailedAttempts < nextThreshold && hints[i + 1]) {
                          const remaining = nextThreshold - adultFailedAttempts;
                          items.push(
                            <p key={`countdown-${i}`} className="text-xs text-text-muted/60 text-center">
                              Indice suivant disponible dans {remaining} essai{remaining > 1 ? 's' : ''}
                            </p>
                          );
                        }
                      }
                    }
                    return items;
                  })()}
                  <button
                    type="button"
                    onClick={() => void handleAdultGateSubmit()}
                    disabled={!adultGateAnswer.trim()}
                    className="w-full py-2.5 rounded-xl text-sm font-medium bg-adult/15 text-adult hover:bg-adult/25 disabled:opacity-40 transition-colors"
                  >
                    Vérifier
                  </button>
                </div>
              </div>
            </div>
          ) : (
          <div className={`px-6 pt-4 pb-0 flex-1 flex flex-col ${desktopPanel ? '' : 'max-w-[68ch] mx-auto w-full'}`}>
            {/* Kicker date · heure + badges + météo, puis titre — calqué sur la
                vue lecture owner (en-tête épuré, infos remontées dans le corps).
                Les tags + favoris/à-oublier + humeur restent dans le footer
                (cf. beforeComments du reader). */}
            <div className="flex items-center gap-2 flex-wrap mb-1 text-text-muted/60">
              <span className="text-xs">
                {formatDate(entry.date as string | Date)}{timeDisplay ? ` · ${timeDisplay}` : ''}
              </span>
              {entry.isForConfidant && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent font-medium">💛 Pour toi</span>}
              {entry.isDraft && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-warning/15 text-warning font-medium">Brouillon</span>}
              {entry.weather && <span className="text-[11px]" title="Météo">{entry.weather as string}</span>}
            </div>
            {entry.title && <h1 className="text-2xl font-serif font-semibold text-text-primary mb-5 leading-snug">{entry.title as string}</h1>}
            {/* Bandeau de clémence : visible juste après que l'auteur a accordé
                l'accès automatique au bout de 100 essais ratés. La réponse est
                révélée à titre informatif. */}
            {mercyRevealed && (
              <div className="mb-4 rounded-2xl border border-adult/30 bg-adult/8 px-4 py-3">
                <p className="text-[11px] font-mono uppercase tracking-widest text-adult/80 mb-1.5">Accès accordé par l'auteur ✦</p>
                <p className="text-xs text-text-muted leading-relaxed mb-2">
                  Après tes 100 tentatives, l'auteur a choisi de te révéler la bonne réponse :
                </p>
                <p className="text-sm text-orange-300 italic leading-snug">« {mercyRevealed} »</p>
              </div>
            )}
            {/* Media meta (full) — masqué pour playlists MUSIC (MusicNotePlayer rend son propre header) */}
            {hasMedia && !isMusicPlaylist && (
              <div className="mb-4 flex gap-3">
                {m.coverUrl && <img src={m.coverUrl} alt="couverture" className="h-24 w-auto rounded-lg object-cover shrink-0 shadow-sm" />}
                <div className="flex-1 min-w-0">
                  <p className="text-text-primary font-medium">{m.subject}</p>
                  {behavior === 'MUSIC' && m.trackTitle && <p className="text-text-muted text-sm">{m.trackTitle}</p>}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {m.creator && <span className="text-sm text-text-muted">{m.creator}</span>}
                    {behavior === 'BOOK' && m.volume && <span className="text-xs text-text-muted">T.{m.volume}{m.totalVolumes ? `/${m.totalVolumes}` : ''}</span>}
                    {behavior === 'BOOK' && m.progressCurrent && m.progressTotal && <span className="text-xs text-text-muted">p. {m.progressCurrent}/{m.progressTotal}</span>}
                    {behavior === 'SERIES' && <span className="text-xs text-text-muted">{m.season ? `S${m.season}` : ''}{m.progressCurrent ? ` E${m.progressCurrent}` : ''}{m.progressTotal ? `/${m.progressTotal}` : ''}</span>}
                    {m.rating && <span style={{ color: cfg.color }}>{'★'.repeat(m.rating)}{'☆'.repeat(5 - m.rating)}</span>}
                    {m.status && <span className="text-sm text-text-muted/60 italic">{{ wishlist: 'Souhaité', owned: 'Possédé', ongoing: 'En cours', finished: 'Terminé', abandoned: 'Abandonné' }[m.status]}</span>}
                  </div>
                  {(behavior === 'BOOK' || behavior === 'SERIES') && m.progressCurrent && m.progressTotal && (
                    <div className="mt-2 h-1 rounded-full bg-text-muted/10 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round((m.progressCurrent / m.progressTotal) * 100))}%`, backgroundColor: cfg.color, opacity: 0.6 }} />
                    </div>
                  )}
                  {m.description && <p className="text-xs text-text-muted/70 italic leading-relaxed mt-2">{m.description}</p>}
                </div>
              </div>
            )}

            {/* Music player */}
            {behavior === 'MUSIC' && (
              <div className="mb-4"><MusicNotePlayer meta={m} /></div>
            )}

            {/* Quizz — le confident le fait, correction côté serveur */}
            {behavior === 'QUIZZ' && (m.quizQuestions?.length ?? 0) > 0 && (
              <div className="mb-4"><QuizTaker entryId={entry.id as string} questions={m.quizQuestions!} shuffleQuestions={m.quizShuffleQuestions} shuffleOptions={m.quizShuffleOptions} /></div>
            )}

            {/* Agenda — vue lecture des événements (comme l'owner) */}
            {behavior === 'AGENDA' && (
              <div className="mb-4"><AgendaView meta={m} /></div>
            )}

            {/* Finance — vue lecture du budget (comme l'owner) */}
            {behavior === 'FINANCE' && (
              <div className="mb-4"><BudgetView meta={m} /></div>
            )}

            {/* Champs personnalisés (types de note custom) — lecture confident */}
            {hasFilledCustomFields(fieldDefs, m.customFields as CustomFieldValues) && (
              <CustomFieldsView fields={fieldDefs} values={(m.customFields ?? {}) as CustomFieldValues} />
            )}

            {/* Shopping links */}
            {behavior === 'SHOPPING' && (() => {
              // Cast `unknown` intermédiaire pour casser la profondeur d'inférence tRPC.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const rawLinks: unknown = entry.isAdult && adultContent ? adultContent.links : (entry as any).links;
              const links = rawLinks as any[] | null;
              if (!Array.isArray(links) || links.length === 0) return null;
              return (
                <div className="flex flex-col gap-2 mb-4">
                  {links.map((link: any, i: number) => (
                    <a key={i} href={link.url as string} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-text-muted/10 bg-bg-primary/40 px-3 py-2.5 hover:border-text-muted/25 transition-colors group/link">
                      {link.image && <img src={link.image as string} alt="" className="h-12 w-12 rounded-lg object-cover shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary font-medium truncate group-hover/link:text-accent">{(link.title as string | null) || (link.url as string)}</p>
                        {link.siteName && <p className="text-xs text-text-muted/60 truncate mt-0.5">{link.siteName as string}</p>}
                      </div>
                    </a>
                  ))}
                </div>
              );
            })()}

            {/* First image — bornée à 70vh en lecture pour ne pas prendre tout l'écran sur desktop */}
            {firstImage && <TruncatedImage src={firstImage} maxHeightClass="max-h-[70vh]" className="mb-4" />}

            {/* Full content + comments — flex-1 (comme l'owner) pour épingler le
                composer de commentaire en bas, même quand le contenu est court
                (notes Agenda/Finance) plutôt qu'au milieu de l'écran. */}
            <div className="flex-1 flex flex-col min-h-0">
              <AnnotatedReader
                entryId={entry.id as string}
                contentMd={cleanContent(contentWithoutImages)}
                commentsLocked={entry.commentsLocked as boolean}
                focusedCommentId={focusedCommentId}
                defaultOpenAnchor="general"
                fontSize={(entry.fontSize as string | null) ?? '17px'}
                fontFamily={getFontFamily((entry as any).font)}
                fontKey={(entry as any).font ?? undefined}
                className="flex-1 flex flex-col min-h-0"
                fullWidthComposer
                beforeComments={me ? (
                  /* Footer de lecture calqué sur la vue owner, l'édition en moins :
                     favoris/à-oublier (notation par-utilisateur) + tags + humeur,
                     tous en lecture seule. */
                  <div className="flex items-center gap-2 flex-wrap mt-5 mb-1 pt-4 border-t border-text-muted/10">
                    <EntryRatingButtons
                      entryId={entry.id as string}
                      currentUserId={me.id}
                      ratings={(entry.ratings as Array<{ userId: string; value: 'FAVORITE' | 'LOW'; displayName: string | null }> | undefined) ?? []}
                    />
                    {((entry.tagNames as string[] | undefined) ?? []).map((t) => (
                      <span key={t} className="text-xs text-text-muted/80 bg-text-muted/8 px-2 py-0.5 rounded-full">#{t}</span>
                    ))}
                    {entry.mood && <span className="text-lg leading-none ml-auto" title="Humeur">{entry.mood as string}</span>}
                  </div>
                ) : undefined}
              />
            </div>
          </div>
          )}
        </NoteModal>
      )}
    </>
  );
}

/** Réactions + commentaires sur une capsule scellée — sans révéler le contenu. */
function SealedCapsuleInteractions({ entryId, commentsLocked }: { entryId: string; commentsLocked: boolean }) {
  const { data: me } = trpc.auth.me.useQuery();
  if (!me) return null;
  return (
    <div className="w-full max-w-md flex flex-col gap-4 mt-3 pt-5 border-t border-text-muted/10">
      <div className="flex justify-center">
        <EntryReactions entryId={entryId} currentUserId={me.id} />
      </div>
      <CommentThread entryId={entryId} commentsLocked={commentsLocked} />
    </div>
  );
}

function GuestLinkedEntry({ entryId, focusedCommentId, isRead, onMarkRead, onMarkUnread }: {
  entryId: string;
  focusedCommentId?: string;
  isRead: boolean;
  onMarkRead: () => void;
  onMarkUnread: () => void;
}) {
  const { data: entry } = trpc.entries.byId.useQuery({ id: entryId });
  if (!entry) return null;
  return (
    <GuestEntryCard
      entry={entry as any}
      defaultOpen
      focusedCommentId={focusedCommentId}
      isRead={isRead}
      onMarkRead={onMarkRead}
      onMarkUnread={onMarkUnread}
    />
  );
}

/**
 * Header de navigation du confidant — version compacte adaptée à l'iPhone.
 * Garde visible : Fil, Demandes, Notifs, Verrou, Menu burger.
 * Dans le burger : Collection, Stats, Tâches, Réglages, Aide, Thème.
 */
function GuestHeaderNav({
  isConfidant,
  theme,
  toggleTheme,
  hasPinSet,
  lockNow,
}: {
  isConfidant: boolean;
  theme: string;
  toggleTheme: () => void;
  hasPinSet: boolean;
  lockNow: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAlign = useDropdownAlign(menuOpen);
  const menuRef = useRef<HTMLDivElement>(null);
  const { data: pendingCount = 0 } = trpc.topicRequests.pendingCount.useQuery(undefined, {
    enabled: isConfidant,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [menuOpen]);

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {/* Fil — fréquent */}
      <Link
        to="/fil"
        aria-label="Fil commentaires"
        title="Fil commentaires"
        className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </Link>

      {/* Boîte à demandes (confidant uniquement) */}
      {isConfidant && (
        <Link
          to="/demandes"
          aria-label={pendingCount > 0 ? `Boîte à demandes — ${pendingCount} en attente` : 'Boîte à demandes'}
          title="Boîte à demandes"
          className="relative p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
            <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
          </svg>
          {pendingCount > 0 && (
            <span className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] px-1 rounded-full bg-warning text-bg-elevated text-[11px] font-bold flex items-center justify-center leading-none">
              {pendingCount > 9 ? '9+' : pendingCount}
            </span>
          )}
        </Link>
      )}

      <NotificationBell />

      {/* Verrou immédiat — visible si PIN set */}
      {hasPinSet && (
        <button
          type="button"
          onClick={lockNow}
          aria-label="Verrouiller l'app"
          title="Verrouiller maintenant"
          className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </button>
      )}

      {/* Burger menu — tout le reste */}
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Menu"
          title="Menu"
          className={`p-2 rounded-lg transition-colors ${menuOpen ? 'bg-bg-elevated text-text-primary' : 'text-text-muted hover:text-text-primary hover:bg-bg-elevated'}`}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        {menuOpen && (
          <div ref={menuAlign.panelRef} style={menuAlign.panelStyle} className="absolute right-0 top-full mt-1 z-40 bg-bg-elevated border border-text-muted/15 rounded-xl shadow-lg py-1 min-w-[200px]">
            {isConfidant && (
              <>
                <MenuLink to="/collection" onClick={() => setMenuOpen(false)} icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="6" height="18" rx="1" /><rect x="10" y="3" width="6" height="18" rx="1" /><rect x="18" y="3" width="4" height="18" rx="1" />
                  </svg>
                }>Collection</MenuLink>
                <MenuLink to="/stats" onClick={() => setMenuOpen(false)} icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                }>Statistiques</MenuLink>
                <MenuLink to="/tasks" onClick={() => setMenuOpen(false)} icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                }>Tâches</MenuLink>
                <MenuLink to="/barometre" onClick={() => setMenuOpen(false)} icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                }>Baromètre</MenuLink>
                <div className="h-px bg-text-muted/10 my-1" />
              </>
            )}
            <button
              type="button"
              onClick={() => { toggleTheme(); setMenuOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-text-primary hover:bg-text-muted/10 transition-colors text-left"
            >
              <span className="text-text-muted shrink-0">
                {theme === 'dark' ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                )}
              </span>
              {theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
            </button>
            <MenuLink to="/reglages" onClick={() => setMenuOpen(false)} icon={
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            }>Réglages</MenuLink>
            <MenuLink to="/help" onClick={() => setMenuOpen(false)} icon={
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            }>Centre d'aide</MenuLink>
          </div>
        )}
      </div>
    </div>
  );
}

function MenuLink({ to, icon, children, onClick }: { to: string; icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2 text-sm text-text-primary hover:bg-text-muted/10 transition-colors"
    >
      <span className="text-text-muted shrink-0">{icon}</span>
      {children}
    </Link>
  );
}

export function GuestHome() {
  const { data: me } = trpc.auth.me.useQuery();
  const isConfidant = me?.guestAccess === 'CONFIDANT';
  const { theme, toggle: toggleTheme } = useTheme();
  const { hasPinSet, lockNow } = usePinContext();
  const [searchParams] = useSearchParams();
  const focusedEntryId = searchParams.get('entryId');
  const focusedCommentId = searchParams.get('commentId') ?? undefined;

  const [search, setSearch] = useState('');
  // Tri session-only : reset au défaut des Réglages à chaque refresh (cf.
  // Timeline.tsx). Le picker en haut de page agit pour la session courante,
  // la persistance long-terme est dans Réglages → Affichage → Notes.
  const [sortMode, setSortMode] = useState<SortMode>(() => getGuestDisplayPrefs().defaultSortMode);
  const [filters, setFilters] = useState<FilterState>(() => {
    const p = getGuestDisplayPrefs();
    return p.defaultTypes.length > 0 ? { ...EMPTY_FILTERS, types: p.defaultTypes } : EMPTY_FILTERS;
  });
  const [hideDrafts, setHideDrafts] = useState(() => getGuestDisplayPrefs().hideDrafts);
  const [hideAdult, setHideAdult] = useState(() => getGuestDisplayPrefs().hideAdult);
  const [hideMyForgotten, setHideMyForgotten] = useState(() => getGuestDisplayPrefs().hideMyForgotten);
  const [adultOnly, setAdultOnly] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(() => getGuestDisplayPrefs().focus === 'unread');
  const [forMeOnly, setForMeOnly] = useState(() => getGuestDisplayPrefs().focus === 'forMe');
  const [editOnly, setEditOnly] = useState(() => getGuestDisplayPrefs().focus === 'edits');
  // Page Journal (confident) → `compactJournal` = défaut persisté. Le toggle
  // de la barre de filtres **persiste** désormais le choix (le confident lit
  // surtout en compact pour voir plus de notes — il ne doit pas resauter au
  // remount / à la navigation).
  const [compactMode, setCompactMode] = useState(() => getGuestDisplayPrefs().compactJournal);
  // Filtres repliés par défaut côté confident (il consulte, filtre rarement) :
  // libère le haut de l'écran pour voir la 1re note plus vite. Le choix reste
  // mémorisé par navigateur (localStorage).
  const [filtersCollapsed, toggleFiltersCollapsed] = useCollapsibleSection('guest-home', 'mobile');
  const { mobileRef: headerMobileRef, desktopRef: headerDesktopRef } = useTrackPageHeaderHeight();
  const toggleCompactMode = useCallback(() => {
    const next = !compactMode;
    setCompactMode(next);
    patchGuestDisplayPrefs({ compactJournal: next });
  }, [compactMode]);
  // Synchro robuste — same-tab (Réglages), cross-tab (storage event), bfcache
  // (Android PWA / iOS Safari qui restaurent la page sans re-monter React).
  // Refresh tous les états dérivés des prefs, sinon seul compactMode resterait
  // synchro avec les Réglages.
  useEffect(() => subscribeGuestPrefs(() => {
    const p = getGuestDisplayPrefs();
    setCompactMode(p.compactJournal);
    setHideAdult(p.hideAdult);
    setHideDrafts(p.hideDrafts);
    setHideMyForgotten(p.hideMyForgotten);
    setSortMode(p.defaultSortMode);
    setUnreadOnly(p.focus === 'unread');
    setForMeOnly(p.focus === 'forMe');
    setEditOnly(p.focus === 'edits');
    setFilters((prev) => p.defaultTypes.length > 0
      ? { ...prev, types: p.defaultTypes }
      : { ...prev, types: [] });
  }), []);
  const [capsuleFilter, setCapsuleFilter] = useState(false);
  const [visibleDays, setVisibleDays] = useState(10);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);
  const [activeDesktopEntryId, setActiveDesktopEntryId] = useState<string | null>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 1024
      ? searchParams.get('entryId')
      : null,
  );

  useEffect(() => {
    setVisibleDays(10);
  }, [search, filters, sortMode, hideDrafts, hideAdult, adultOnly, unreadOnly, forMeOnly, editOnly, capsuleFilter]);

  const utils = trpc.useUtils();

  const { data: rawEntries } = trpc.entries.list.useQuery(
    { limit: 200, order: 'desc' },
    {
      // Temps réel via SSE (événement `entry`) ; poll de secours espacé.
      refetchInterval: 120_000,
      // gcTime élevé : le cache survit au verrou PIN (AppGate démonte tout).
      // Sans ça, après >5 min verrouillé, le cache est purgé et on voit "Chargement…" au déverrouillage.
      gcTime: 60 * 60 * 1000,
    },
  );

  // Daily logs de l'owner — uniquement pour les guests CONFIDANT
  const { data: rawDailyLogs } = trpc.dailyLog.list.useQuery(undefined, {
    enabled: isConfidant,
    refetchInterval: 30_000,
    gcTime: 60 * 60 * 1000,
  });
  const dailyLogByDate = new Map<string, DailyLogRecapData>(
    (rawDailyLogs ?? []).map((dl) => [dl.date, dl]),
  );

  // Checksum des secrets — détecte les changements d'entrées secrètes que le SSE
  // ne couvre pas (le confident ne reçoit pas d'événement `entry` sur un secret).
  // Le SSE gère le temps réel des entrées normales → ce poll peut rester espacé.
  const prevChecksum = useRef<string | null>(null);
  const { data: checksumData } = trpc.entries.secretsChecksum.useQuery(undefined, {
    enabled: isConfidant,
    refetchInterval: 30_000,
    staleTime: 0,
  });
  useEffect(() => {
    if (!checksumData) return;
    if (prevChecksum.current !== null && prevChecksum.current !== checksumData.checksum) {
      void utils.entries.list.invalidate();
    }
    prevChecksum.current = checksumData.checksum;
  }, [checksumData, utils.entries.list]);
  const { data: readIdsData = [], refetch: refetchReadIds, isSuccess: readIdsLoaded } = trpc.entries.readIds.useQuery(undefined, {
    enabled: me?.role === 'GUEST',
    staleTime: 60_000,
  });
  const readSet = new Set(readIdsData);
  const markRead = trpc.entries.markRead.useMutation({ onSuccess: () => refetchReadIds() });
  const markUnread = trpc.entries.markUnread.useMutation({ onSuccess: () => refetchReadIds() });

  // Snapshot des notes déjà lues, figé quand on entre en mode « non lus ».
  // Sans ça, marquer une note lue à l'ouverture la ferait disparaître de la
  // liste filtrée sous les yeux du confident. Avec le snapshot, une note lue
  // EN COURS de session reste affichée (point « lu » mis à jour, compteur
  // décrémenté) ; elle ne sort de la liste qu'au prochain passage du filtre
  // (toggle off/on) ou au rechargement. `null` = filtre inactif / pas encore figé.
  const [frozenReadIds, setFrozenReadIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!unreadOnly) { setFrozenReadIds(null); return; }
    if (frozenReadIds !== null || !readIdsLoaded) return; // fige une seule fois par activation
    setFrozenReadIds(new Set(readIdsData));
  }, [unreadOnly, readIdsLoaded, frozenReadIds, readIdsData]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allEntries = (rawEntries ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeDesktopEntry = allEntries.find((e: any) => e.id === activeDesktopEntryId) ?? null;

  const SECTION_TIME: Record<string, string> = { MORNING:'06:00', LATE_MORNING:'10:00', NOON:'12:00', AFTERNOON:'14:00', LATE_AFTERNOON:'16:00', EARLY_EVENING:'18:00', EVENING:'20:00', NIGHT:'22:00', FREE:'23:50' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const guestSortKey = (e: any) => e.timeLabel ?? (e.section ? SECTION_TIME[e.section] ?? '23:59' : null) ?? new Date(e.createdAt).toTimeString().slice(0, 8);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sorted = [...allEntries].sort((a: any, b: any) => {
    const dateA = typeof a.date === 'string' ? a.date.slice(0, 10) : '';
    const dateB = typeof b.date === 'string' ? b.date.slice(0, 10) : '';
    // Tie-breaker final : direction de `createdAt` alignée sur la direction
    // du tri principal. Plusieurs notes au même créneau :
    //   - mode descendant → la plus récente en haut
    //   - mode ascendant  → la plus ancienne en haut (chronologique)
    const isDesc = sortMode === 'time-desc' || sortMode === 'updated-desc';
    const createdTie = isDesc
      ? (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
      : (a.createdAt ?? '').localeCompare(b.createdAt ?? '');

    if (sortMode === 'updated-desc') {
      const cmp = (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
      return cmp !== 0 ? cmp : createdTie;
    }
    if (sortMode === 'updated-asc')  {
      const cmp = (a.updatedAt ?? '').localeCompare(b.updatedAt ?? '');
      return cmp !== 0 ? cmp : createdTie;
    }

    const dateDiff = sortMode === 'time-asc'
      ? dateA.localeCompare(dateB)
      : dateB.localeCompare(dateA);
    if (dateDiff !== 0) return dateDiff;

    const timeCmp = sortMode === 'time-asc'
      ? guestSortKey(a).localeCompare(guestSortKey(b))
      : guestSortKey(b).localeCompare(guestSortKey(a));
    return timeCmp !== 0 ? timeCmp : createdTie;
  });

  const availableTypes = [...new Set(allEntries.map((e: any) => e.noteType as NoteType))];
  const availableTags = [...new Set(allEntries.flatMap((e: any) => (e.tagNames ?? []) as string[]))].sort();
  // Compteur par tag affiché dans le dropdown du filtre.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tagCounts = (allEntries as any[]).reduce<Record<string, number>>((acc, e) => {
    ((e.tagNames ?? []) as string[]).forEach((t) => { acc[t] = (acc[t] ?? 0) + 1; });
    return acc;
  }, {});
  const availableMoods = collectAvailableMoods(allEntries as { mood?: string | null }[]);

  const searched = search.trim()
    ? sorted.filter((e: any) => {
        const q = search.toLowerCase();
        const m = e.mediaMeta ?? {};
        return (
          (e.contentMd ?? '').toLowerCase().includes(q) ||
          (m.subject ?? '').toLowerCase().includes(q) ||
          (m.trackTitle ?? '').toLowerCase().includes(q) ||
          (m.creator ?? '').toLowerCase().includes(q) ||
          (e.title ?? '').toLowerCase().includes(q)
        );
      })
    : sorted;

  // Resolver côté confident : son statut perso pour chaque note verrouillée.
  // 'awaiting' (pas encore répondu) → 'unanswered' dans le filtre.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gateStatusOf = (e: any): Set<ReadGateStatus> => {
    const s = e.readGateStatus;
    if (!s || s === 'awaiting') return new Set();
    if (s === 'approved' || s === 'rejected' || s === 'pending') return new Set<ReadGateStatus>([s]);
    return new Set();
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filtered = applyFilters(searched as any[], filters, gateStatusOf, me?.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const afterHideDrafts = hideDrafts ? filtered.filter((e: any) => !e.isDraft) : filtered;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const afterAdult = adultOnly
    ? afterHideDrafts.filter((e: any) => !!e.isAdult)
    : (hideAdult ? afterHideDrafts.filter((e: any) => !e.isAdult) : afterHideDrafts);
  // « À oublier » : masque silencieusement les notes que le confident a
  // lui-même marquées LOW (pref `hideMyForgotten`). Bypass si un filtre
  // « À oublier » explicite est actif — sinon le pool serait vide.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const afterForgotten = (hideMyForgotten && me?.id && filters.lowFilter === null)
    ? afterAdult.filter((e: any) => {
        const ratings = (e.ratings ?? []) as Array<{ userId: string; value: 'FAVORITE' | 'LOW' }>;
        const mine = ratings.find((r) => r.userId === me.id);
        return mine?.value !== 'LOW';
      })
    : afterAdult;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const afterForMe = forMeOnly ? afterForgotten.filter((e: any) => !!e.isForConfidant) : afterForgotten;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // Membership figée : on masque une note seulement si elle était déjà lue au
  // moment du snapshot ET l'est toujours. Ainsi une note lue en cours de session
  // reste visible, et une note « marquée non lue » manuellement réapparaît.
  // Avant le 1er snapshot (frozenReadIds null), on retombe sur le filtre live.
  const afterUnread = unreadOnly
    ? afterForMe.filter((e: any) => {
        const id = e.id as string;
        if (!frozenReadIds) return !readSet.has(id);
        return !(frozenReadIds.has(id) && readSet.has(id));
      })
    : afterForMe;

  // Capsules pour le filtre
  const allCapsules = allEntries.filter((e: any) => !!e.unlockAt);
  const nowTs = Date.now();
  const capsulesLocked = allCapsules.filter((e: any) => new Date(e.unlockAt).getTime() > nowTs).sort((a: any, b: any) => a.unlockAt.localeCompare(b.unlockAt));
  const capsulesUnlocked = allCapsules.filter((e: any) => new Date(e.unlockAt).getTime() <= nowTs).sort((a: any, b: any) => b.unlockAt.localeCompare(a.unlockAt));

  // Edit filter: keep only entries with :::edit blocks, sort by most recent edit datetime desc
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function latestEditDatetime(e: any): string | null {
    const matches = [...((e.contentMd ?? '') as string).matchAll(/^:::edit\s+"([^"]+)"/gm)];
    if (!matches.length) return null;
    return matches.map((m) => m[1]).sort().at(-1) ?? null;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let entries: any[] = editOnly
    ? [...afterUnread]
        .filter((e: any) => latestEditDatetime(e) !== null)
        .sort((a: any, b: any) => (latestEditDatetime(b) ?? '').localeCompare(latestEditDatetime(a) ?? ''))
    : afterUnread;
  // Si l'utilisateur arrive via une notif push (`?entryId=...`), force la
  // présence de l'entrée ciblée dans la liste — sinon les filtres par défaut
  // (focus, types, hideDrafts…) peuvent la masquer et la notif aboutit à un
  // état où l'entry est en `<GuestLinkedEntry>` standalone, hors contexte.
  if (focusedEntryId && !entries.some((e: any) => e.id === focusedEntryId)) {
    const focused = (allEntries as any[]).find((e: any) => e.id === focusedEntryId);
    if (focused) entries = [focused, ...entries];
  }

  const grouped = entries.reduce((acc: Record<string, any[]>, e: any) => {
    const day = editOnly
      ? (latestEditDatetime(e) ?? '').slice(0, 10)
      : (typeof e.date === 'string' ? e.date.slice(0, 10) : '');
    if (!acc[day]) acc[day] = [];
    acc[day].push(e);
    return acc;
  }, {});
  const sortedDays = Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a));
  const visibleGroups = sortedDays.slice(0, visibleDays);
  // Tri « modifié » = liste plate : on la fenêtre aussi (≈ visibleDays × 4
  // cartes) pour ne pas monter jusqu'à 200 cartes d'un coup sur mobile. Le même
  // sentinel + IntersectionObserver alimente les deux branches.
  const isFlatSort = isUpdatedSort(sortMode);
  const flatVisibleCount = visibleDays * 4;
  const visibleFlatEntries = isFlatSort ? (entries as any[]).slice(0, flatVisibleCount) : (entries as any[]);
  const hasMore = isFlatSort ? flatVisibleCount < (entries as any[]).length : visibleDays < sortedDays.length;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) setVisibleDays((v) => v + 10); },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, isFlatSort]);

  // rawEntries === undefined uniquement au tout premier chargement (cache vide).
  // On évite isLoading qui bloquerait aussi après un déverrouillage PIN si le cache a expiré.
  if (rawEntries === undefined) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-text-muted text-sm">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh pb-48 sm:pb-56 max-w-2xl mx-auto overflow-x-clip lg:max-w-none lg:px-0 lg:pb-0 lg:flex lg:items-start">
      <GuestBottomNav />
      {/* Left column */}
      <div className={`px-6 lg:px-12 lg:pb-16 lg:min-h-dvh lg:min-w-0 ${activeDesktopEntryId ? 'lg:w-[520px] lg:shrink-0' : 'lg:flex-1'}`}>

        {/* Mobile header */}
        <div ref={headerMobileRef} className="lg:hidden sticky top-0 z-[11] -mx-6 px-6 pb-3 mb-5 bg-bg-primary/90 backdrop-blur-sm" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] tracking-widest uppercase text-text-muted/50 select-none">Diary</p>
            <GuestTopBar />
          </div>
          <h1 className="font-serif text-2xl text-text-primary tracking-tight mt-0.5">Notes partagées</h1>
        </div>

        {/* Desktop sticky header */}
        <div ref={headerDesktopRef} className={`hidden lg:block sticky top-0 z-[11] -mx-12 px-12 bg-bg-primary/90 backdrop-blur-sm ${activeDesktopEntryId ? 'pt-5 pb-3 mb-1' : 'pt-10 pb-6 mb-2'}`}>
          <p className="font-mono text-[11px] tracking-widest uppercase text-text-muted/50 select-none mb-2">
            {`${(entries as any[]).length} note${(entries as any[]).length !== 1 ? 's' : ''}`}
          </p>
          <h1 className={`font-serif text-text-primary tracking-tight ${activeDesktopEntryId ? 'text-3xl' : 'text-6xl'}`}>
            Journal
          </h1>
        </div>

        {/* Search + filters card */}
        {(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const adultCount = allEntries.filter((e: any) => !!e.isAdult).length;
          const PILL_INACTIVE = 'border-text-muted/15 text-text-muted/60 hover:border-text-muted/30 hover:text-text-muted';
          const unreadCount = Math.max(0, (rawEntries ?? []).length - readIdsData.length);
          const guestQp = me?.role === 'GUEST' ? (
            <>
              {/* 18+ déplacé dans le dropdown États (cf. props adultOnly/onAdultOnlyChange) */}
              {isConfidant && (
                <>
                  <button
                    type="button"
                    onClick={() => setForMeOnly((v) => !v)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 ${forMeOnly ? 'bg-accent/15 border-accent/40 text-accent font-medium' : PILL_INACTIVE}`}
                  >
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" stroke="none" className={`shrink-0 ${forMeOnly ? 'text-accent' : 'text-text-muted/55'}`}>
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                    Pour moi
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {!forMeOnly && <span className="text-text-muted/50">({allEntries.filter((e: any) => !!e.isForConfidant).length})</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditOnly((v) => !v)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 ${editOnly ? 'bg-warning/15 text-warning border-warning/40 font-medium' : PILL_INACTIVE}`}
                  >
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${editOnly ? 'text-warning' : 'text-text-muted/55'}`}>
                      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                    </svg>
                    Ajouts
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {!editOnly && <span className="text-text-muted/50">({allEntries.filter((e: any) => /^:::edit\b/m.test(e.contentMd ?? '')).length})</span>}
                  </button>
                  {allCapsules.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCapsuleFilter((v) => !v)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 ${capsuleFilter ? 'bg-sealed/15 text-sealed border-sealed/30 font-medium' : PILL_INACTIVE}`}
                    >
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                      </svg>
                      Capsules ({allCapsules.length})
                    </button>
                  )}
                </>
              )}
            </>
          ) : undefined;
          return (
            <div className="sticky top-[var(--page-header-h,96px)] z-[10] bg-bg-elevated rounded-2xl shadow-soft mb-4">
              {/* Search row — flex-wrap : sort+compact passent en dessous sur mobile étroit */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pt-2.5 pb-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted/50 shrink-0">
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher…"
                    className="flex-1 min-w-0 bg-transparent text-sm text-text-primary placeholder:text-text-muted/55 outline-none"
                  />
                  {search && (
                    <button type="button" onClick={() => setSearch('')} className="text-text-muted/55 hover:text-text-muted text-xs">✕</button>
                  )}
                </div>
                {((entries as any[]).length !== (allEntries as any[]).length || search.trim()) && (
                  <span className="text-xs text-text-muted/55 shrink-0 tabular-nums">
                    {(entries as any[]).length}<span className="opacity-60"> / {(allEntries as any[]).length}</span>
                  </span>
                )}
                <SortPicker mode={sortMode} onChange={setSortMode} />
                <button
                  type="button"
                  title={compactMode ? 'Mode compact actif — désactiver' : 'Mode compact (cartes condensées)'}
                  onClick={toggleCompactMode}
                  className={`flex items-center justify-center w-8 h-8 rounded-xl transition-colors shrink-0 ${compactMode ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-primary'}`}
                  aria-pressed={compactMode}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
                  </svg>
                </button>
                {availableTypes.length > 0 && <ChevronToggle collapsed={filtersCollapsed} onClick={toggleFiltersCollapsed} />}
              </div>

              {/* Mini-résumé des filtres actifs (mode replié) */}
              {availableTypes.length > 0 && filtersCollapsed && (isFiltered(filters) || adultOnly || unreadOnly || forMeOnly || editOnly) && (() => {
                const chips: string[] = [];
                if (filters.types.length > 0) chips.push(filters.types.length === 1 ? (filters.types[0] as string) : `${filters.types.length} types`);
                if (filters.tags.length > 0) chips.push(`${filters.tags.length} tag${filters.tags.length > 1 ? 's' : ''}`);
                if (filters.moods.length > 0) chips.push(`${filters.moods.length} mood${filters.moods.length > 1 ? 's' : ''}`);
                if (filters.from || filters.to) chips.push('Période');
                if (filters.isDraft) chips.push('Brouillons');
                if (filters.readGateStatuses.length > 0) chips.push(`Verrou (${filters.readGateStatuses.length})`);
                if (filters.capsuleStatuses.length > 0) chips.push(`Capsules (${filters.capsuleStatuses.length})`);
                if (adultOnly) chips.push('18+');
                if (forMeOnly) chips.push('Pour moi');
                if (editOnly) chips.push('Ajouts');
                if (unreadOnly) chips.push('Non lus');
                return (
                  <div className="px-3 pb-2 text-[11px] text-text-muted/70 flex items-center gap-1.5 -mt-1.5 truncate">
                    <span className="text-text-muted/55 shrink-0">Filtres :</span>
                    <span className="truncate">{chips.join(' · ')}</span>
                  </div>
                );
              })()}

              {/* Filter pills row */}
              {availableTypes.length > 0 && !filtersCollapsed && (
                <>
                  <div className="h-px bg-text-muted/[0.12]" />
                  <div className="px-3 py-2.5">
                    <EntryFilters
                      filters={filters} onChange={setFilters}
                      availableTypes={availableTypes} availableTags={availableTags} tagCounts={tagCounts} availableMoods={availableMoods}
                      sortMode={sortMode} onSortChange={setSortMode}
                      hideSortPicker
                      hideForConfidantPill
                      hideSecretPill
                      hideVisibilityFilter
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      showReadGateFilter={(allEntries as any[]).some((e) => !!e.readGatePrompt)}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      showCapsuleFilter={(allEntries as any[]).some((e) => !!e.unlockAt)}
                      readGateCounts={(() => {
                        const c = { approved: 0, rejected: 0, pending: 0, unanswered: 0 } as Record<ReadGateStatus, number>;
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        for (const e of allEntries as any[]) {
                          if (!e.readGatePrompt) continue;
                          const s = e.readGateStatus;
                          if (!s || s === 'awaiting') c.unanswered++;
                          else if (s === 'approved' || s === 'rejected' || s === 'pending') c[s as ReadGateStatus]++;
                        }
                        return c;
                      })()}
                      capsuleCounts={(() => {
                        const nowMs = Date.now();
                        let locked = 0, unlocked = 0;
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        for (const e of allEntries as any[]) {
                          if (!e.unlockAt) continue;
                          if (new Date(e.unlockAt).getTime() > nowMs) locked++;
                          else unlocked++;
                        }
                        return { locked, unlocked };
                      })()}
                      counts={{
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        draft: allEntries.filter((e: any) => !!e.isDraft).length,
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        secret: allEntries.filter((e: any) => !!e.isSecret).length,
                      }}
                      viewerIsOwner={false}
                      adultOnly={adultOnly}
                      onAdultOnlyChange={setAdultOnly}
                      adultCount={adultCount}
                      favoritesCounts={(() => {
                        const meId = me?.id;
                        let any = 0, mine = 0, owner = 0;
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        for (const e of allEntries as any[]) {
                          const ratings = (e.ratings ?? []) as Array<{ userId: string; value: 'FAVORITE' | 'LOW' }>;
                          const favs = ratings.filter((r) => r.value === 'FAVORITE');
                          if (favs.length > 0) any++;
                          if (meId && favs.some((r) => r.userId === meId)) mine++;
                          if (e.authorId && favs.some((r) => r.userId === e.authorId)) owner++;
                        }
                        return { any, mine, owner };
                      })()}
                      lowCounts={(() => {
                        const meId = me?.id;
                        let any = 0, mine = 0, owner = 0;
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        for (const e of allEntries as any[]) {
                          const ratings = (e.ratings ?? []) as Array<{ userId: string; value: 'FAVORITE' | 'LOW' }>;
                          const lows = ratings.filter((r) => r.value === 'LOW');
                          if (lows.length > 0) any++;
                          if (meId && lows.some((r) => r.userId === meId)) mine++;
                          if (e.authorId && lows.some((r) => r.userId === e.authorId)) owner++;
                        }
                        return { any, mine, owner };
                      })()}
                      quickPillsSlot={guestQp}
                      readPillsSlot={me?.role === 'GUEST' ? (
                        <button
                          type="button"
                          onClick={() => setUnreadOnly((v) => !v)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 ${unreadOnly ? 'bg-accent/15 border-accent/40 text-accent font-medium' : PILL_INACTIVE}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${unreadOnly ? 'bg-accent' : 'bg-text-muted/40'}`} />
                          Non lus
                          {!unreadOnly && unreadCount > 0 && <span className="text-text-muted/50">({unreadCount})</span>}
                        </button>
                      ) : undefined}
                    />
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* ── Vue capsules ──────────────────────────────────────────────────── */}
        {capsuleFilter ? (
          <div className="space-y-6">
            {capsulesLocked.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted/50 mb-3 flex items-center gap-2">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Scellées
                </h2>
                <div className="flex flex-col gap-3">
                  {capsulesLocked.map((entry: any) => (
                    <GuestEntryCard key={entry.id} entry={entry} isRead={readSet.has(entry.id)} onMarkRead={() => markRead.mutate({ entryId: entry.id })} onMarkUnread={() => markUnread.mutate({ entryId: entry.id })} compactMode={compactMode} />
                  ))}
                </div>
              </section>
            )}
            {capsulesUnlocked.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted/50 mb-3 flex items-center gap-2">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" />
                  </svg>
                  Ouvertes
                </h2>
                <div className="flex flex-col gap-3">
                  {capsulesUnlocked.map((entry: any) => (
                    <GuestEntryCard key={entry.id} entry={entry} isRead={readSet.has(entry.id)} onMarkRead={() => markRead.mutate({ entryId: entry.id })} onMarkUnread={() => markUnread.mutate({ entryId: entry.id })} compactMode={compactMode} />
                  ))}
                </div>
              </section>
            )}
            {allCapsules.length === 0 && (
              <p className="text-center text-text-muted/55 italic text-sm py-8">Aucune capsule temporelle.</p>
            )}
          </div>
        ) : (
        /* ── Vue normale ────────────────────────────────────────────────── */
        <>
        {/* Souvenirs — uniquement sur le flux par défaut (pas en recherche/focus),
            limité aux notes que le confident peut lire (cf. souvenirAccessSql). */}
        {!search && !unreadOnly && !forMeOnly && !editOnly && !adultOnly && !isFiltered(filters) && (
          <>
            <div className="lg:hidden"><OnThisDay /></div>
            <div className="hidden lg:block"><OnThisDay variant="cards" /></div>
          </>
        )}
        {entries.length === 0 && (
          <div className="text-center py-12 max-w-sm mx-auto px-6">
            <p className="font-serif text-text-muted/55 text-2xl mb-2">✦</p>
            {(!search && !unreadOnly && !forMeOnly && !editOnly && !adultOnly && !isFiltered(filters)) ? (
              <>
                <p className="font-serif text-text-primary text-base mb-2">Rien de partagé pour l'instant.</p>
                <p className="text-text-muted text-[13px] leading-relaxed">
                  Tu liras ici les notes partagées avec toi. Tu pourras y réagir 😊, commenter une phrase en la sélectionnant, et marquer tes favoris ★.
                </p>
              </>
            ) : (
              <p className="font-serif text-text-muted italic text-sm">Aucun résultat.</p>
            )}
          </div>
        )}

        {/* Fallback: if linked entry isn't in the visible list, fetch & open it */}
        {focusedEntryId && !allEntries.find((e: any) => e.id === focusedEntryId) && (
          <GuestLinkedEntry
            entryId={focusedEntryId}
            focusedCommentId={focusedCommentId}
            isRead={readSet.has(focusedEntryId)}
            onMarkRead={() => markRead.mutate({ entryId: focusedEntryId })}
            onMarkUnread={() => markUnread.mutate({ entryId: focusedEntryId })}
          />
        )}

        {isUpdatedSort(sortMode) ? (
          // Tri par date de modif : liste plate, chaque note précédée d'un
          // petit pill « Modifié il y a Xh · note du DD/MM ».
          <div className="flex flex-col gap-3">
            {visibleFlatEntries.map((entry: any) => (
              <div key={entry.id} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 px-1">
                  <span className="font-mono text-[11px] uppercase tracking-widest text-text-muted/50">
                    {formatRelativeUpdate(entry.updatedAt ?? entry.createdAt)}
                  </span>
                  <span className="text-[11px] text-text-muted/45">·</span>
                  <span className="text-[11px] italic text-text-muted/60">
                    note du {formatDate(typeof entry.date === 'string' ? entry.date.slice(0, 10) : '')}
                  </span>
                </div>
                <GuestEntryCard
                  entry={entry}
                  defaultOpen={!isDesktop && entry.id === focusedEntryId}
                  focusedCommentId={!isDesktop && entry.id === focusedEntryId ? focusedCommentId : undefined}
                  isRead={readSet.has(entry.id as string)}
                  onMarkRead={() => markRead.mutate({ entryId: entry.id as string })}
                  onMarkUnread={() => markUnread.mutate({ entryId: entry.id as string })}
                  onDesktopClick={() => setActiveDesktopEntryId(entry.id as string)}
                  isActivePanel={activeDesktopEntryId === entry.id}
                  compactMode={compactMode}
                />
              </div>
            ))}
            <div ref={sentinelRef} className="h-1" />
          </div>
        ) : (
          <div className="space-y-2">
            {visibleGroups.map(([date, dayEntries], idx) => (
              <section key={date}>
                {idx > 0 && <div className="h-px bg-text-muted/[0.08] my-6" />}
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 mb-3 px-1">
                  <span className="font-serif italic text-xl text-text-primary/80 capitalize">
                    {formatDate(date)}
                  </span>
                  {dailyLogByDate.has(date) && (
                    <DailyLogRecap log={dailyLogByDate.get(date)} date={date} />
                  )}
                </div>
                <div className="flex flex-col gap-3">
                  {(dayEntries as any[]).map((entry: any) => (
                    <GuestEntryCard
                      key={entry.id}
                      entry={entry}
                      defaultOpen={entry.id === focusedEntryId}
                      focusedCommentId={entry.id === focusedEntryId ? focusedCommentId : undefined}
                      isRead={readSet.has(entry.id as string)}
                      onMarkRead={() => markRead.mutate({ entryId: entry.id as string })}
                      onMarkUnread={() => markUnread.mutate({ entryId: entry.id as string })}
                      onDesktopClick={() => setActiveDesktopEntryId(entry.id as string)}
                      isActivePanel={activeDesktopEntryId === entry.id}
                      compactMode={compactMode}
                    />
                  ))}
                </div>
              </section>
            ))}
            <div ref={sentinelRef} className="h-1" />
          </div>
        )}
        </>
        )}
        <BackToTop panelOpen={!!activeDesktopEntryId} />
      </div>

      {/* Right panel (desktop only) */}
      {activeDesktopEntry && (
        <div data-right-panel className="hidden lg:flex lg:flex-col lg:flex-1 lg:sticky lg:top-0 lg:self-start lg:h-dvh lg:border-l lg:border-text-muted/10 lg:overflow-hidden">
          <GuestEntryCard
            key={activeDesktopEntry.id}
            entry={activeDesktopEntry}
            desktopPanel
            defaultOpen
            focusedCommentId={activeDesktopEntry.id === focusedEntryId ? focusedCommentId : undefined}
            isRead={readSet.has(activeDesktopEntry.id)}
            onMarkRead={() => markRead.mutate({ entryId: activeDesktopEntry.id })}
            onMarkUnread={() => markUnread.mutate({ entryId: activeDesktopEntry.id })}
            onModalClose={() => setActiveDesktopEntryId(null)}
          />
        </div>
      )}
    </div>
  );
}
