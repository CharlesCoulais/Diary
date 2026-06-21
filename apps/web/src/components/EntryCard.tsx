import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useBufferedInput } from '../hooks/useBufferedInput';
import { useBackButtonClose } from '../hooks/useBackButtonClose';
import { db, type LocalEntry, type EntryLink } from '../lib/db/schema';
import { apiClient } from '../lib/trpc';
import { trpc } from '../lib/trpc';
import { AnnotatedReader } from './AnnotatedReader';
import { ReadGateReviewSection } from './ReadGateReviewSection';
import { cleanMarkdown } from '../lib/cleanMarkdown';
import { parisDateTimeToISO, parisTimeOf, parisDateOf, parisDateLong } from '../lib/parisTime';
import { useDropdownAlign } from '../lib/useDropdownAlign';
import type { SaveStatus, DiaryEditorHandle } from './editor/DiaryEditor';
// DiaryEditor (~500 KB avec tiptap + lowlight) chargé en lazy : seulement quand on édite réellement.
const DiaryEditor = lazy(() => import('./editor/DiaryEditor').then((m) => ({ default: m.DiaryEditor })));
import { MoodSelector } from './MoodSelector';
import { WeatherPicker } from './WeatherPicker';
import { TagInput } from './TagInput';
import { QuickAddTagPill } from './QuickAddTagPill';
import { TimeSelector } from './TimeSelector';
import { DatePicker } from './DatePicker';
import { TimeInput } from './TimeInput';
import { NoteTypePicker } from './NoteTypePicker';
import { MediaMetaPanel } from './MediaMetaPanel';
import { noteTint, resolveNoteTypeConfig } from './NoteTypePicker';
import { useNoteTypeDefs } from '../lib/useNoteTypeDefs';
import { CustomFieldsEditor } from './CustomFieldsEditor';
import { CustomFieldsView } from './CustomFieldsView';
import { hasFilledCustomFields, type CustomFieldValues } from '../lib/customFields';
import { MusicNotePlayer } from './MusicNotePlayer';
import { QuizTaker } from './QuizTaker';
import { QuizResultsPanel } from './QuizResultsPanel';
import { AgendaView } from './AgendaView';
import { BudgetView } from './BudgetView';
import { upcomingCount } from '../lib/agendaEvents';
import { budgetTotals, formatAmount } from '../lib/budget';
import { isoToday } from '../lib/dateHelpers';
import { isPlaylist } from '../lib/musicTracks';
import { AudioPlayer } from './AudioPlayer';
import { BulkAudioPlayer } from './BulkAudioPlayer';
import { MediaCarousel, type MediaItem } from './MediaCarousel';
import type { MediaMeta } from '../lib/db/schema';
import { getFontFamily, loadFont, scaledFontSize } from '../lib/fonts';
import { parsePreviewRuns, PreviewRuns } from '../lib/previewRuns';
import { exportToPdf } from '../lib/exportPdf';
import { NoteModal } from './NoteModal';
import { ShareSpecificSheet } from './ShareSpecificSheet';
import { PublishDelayPicker } from './PublishDelayPicker';
import { CardEntryReactions, EntryReactions } from './EmojiReactionBar';
import { EntryRatingButtons } from './EntryRatingButtons';
import { CommentThread } from './CommentThread';
import { CompactEntryCard, formatDevInfoLine, formatAgendaFinanceInfoLine } from './CompactEntryCard';
import { TruncatedImage } from './TruncatedImage';

const DEBOUNCE_MS = 800;
const SAVED_RESET_MS = 2000;

import { adultUnlocked, sha256, checkHash } from '../lib/adultGate';

interface EntryCardProps {
  entry: LocalEntry;
  autoFocus?: boolean;
  defaultOpen?: boolean;
  focusedCommentId?: string;
  onSave?: () => void;
  onTagClick?: (tag: string) => void;
  isReadByConfidant?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  /** On desktop (≥1024px), intercept the card click instead of opening the modal.
   *  `opts.comments` = ouvrir la note côté commentaires (clic sur la bulle 💬). */
  onDesktopClick?: (opts?: { comments?: boolean }) => void;
  /** Render the modal inline as a desktop side panel (no createPortal, no card preview) */
  desktopPanel?: boolean;
  /** Ouvre la note en lecture, scrollée sur les commentaires (panel desktop). */
  openToComments?: boolean;
  /** Called when the panel/modal is closed (used by parent to clear selection) */
  onModalClose?: () => void;
  /** Force 3-dot collapsed actions menu (used in narrow desktop column) */
  compact?: boolean;
  /** Mode compact global : preview ultra-condensée (1 ligne, icône seule, date courte) */
  compactMode?: boolean;
  /** Highlight this card as the active desktop panel (ring on card root) */
  isActivePanel?: boolean;
}

// ── Compact card preview ──────────────────────────────────────────────────────

/** Âge d'un brouillon — sert à signaler à l'owner les notes qui approchent (ou dépassent) la grâce de 48h. */
const DRAFT_GRACE_MS = 48 * 60 * 60 * 1000;
function formatDraftAge(createdAt: string): { label: string; gracePassed: boolean } {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const gracePassed = ageMs >= DRAFT_GRACE_MS;
  if (ageMs < 60 * 60 * 1000) return { label: '<1h', gracePassed };
  const hours = Math.floor(ageMs / 3_600_000);
  if (hours < 48) return { label: `${hours}h`, gracePassed };
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return { label: remHours > 0 ? `${days}j ${remHours}h` : `${days}j`, gracePassed };
}

function DraftBadge({ createdAt }: { createdAt: string }) {
  const { label, gracePassed } = formatDraftAge(createdAt);
  // Une fois la grâce passée, on bascule sur du rose pour signaler "déjà visible au confident".
  const cls = gracePassed
    ? 'bg-secret/15 text-secret'
    : 'bg-warning/15 text-warning';
  const title = gracePassed
    ? `Brouillon depuis ${label} — déjà visible au confident (grâce de 48 h expirée)`
    : `Brouillon depuis ${label} — invisible au confident pendant 48 h`;
  return (
    <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${cls}`} title={title}>
      Brouillon · {label}
    </span>
  );
}

/** Formate un compte à rebours humain vers une date future. */
function formatCountdown(unlockAt: string): string {
  const diff = new Date(unlockAt).getTime() - Date.now();
  if (diff <= 0) return 'bientôt';
  const days = Math.floor(diff / 86_400_000);
  if (days >= 2) return `dans ${days} jours`;
  if (days === 1) return 'demain';
  const hours = Math.floor(diff / 3_600_000);
  if (hours >= 1) return `dans ${hours}h`;
  const mins = Math.floor(diff / 60_000);
  return `dans ${mins} min`;
}

/**
 * Wrapper léger : lit l'identité courante, détermine si on est owner (peut
 * voir les notations des autres), et passe le tout à `EntryRatingButtons`.
 * Sépare l'auth lookup pour ne pas le faire à plusieurs endroits du card.
 */
function RatingButtonsForCard({ entry }: { entry: LocalEntry }) {
  const { data: me } = trpc.auth.me.useQuery();
  if (!me) return null;
  return (
    <EntryRatingButtons
      entryId={entry.id}
      currentUserId={me.id}
      ratings={entry.ratings ?? []}
    />
  );
}

/**
 * Indicateur d'enregistrement compact (icône seule, largeur fixe → ne décale
 * jamais la barre d'actions, contrairement à l'ancien badge texte dans la barre
 * de formatage). idle = vide mais réserve la place.
 */
function SaveDot({ status }: { status: SaveStatus }) {
  return (
    <span
      role="status"
      aria-live="polite"
      title={status === 'error' ? "Échec de l'enregistrement — réessaie" : status === 'saving' ? 'Enregistrement…' : status === 'saved' ? 'Enregistré' : undefined}
      className="shrink-0 w-6 h-7 inline-flex items-center justify-center"
    >
      {status === 'saving' && (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin text-text-muted/70">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      )}
      {status === 'saved' && (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-success">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {status === 'error' && (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-danger">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      )}
    </span>
  );
}

function EntryCardView({
  entry,
  onOpen,
  onOpenComments,
  onDelete,
  onShare,
  onShowShareSheet,
  onToggleDraft,
  onToggleForConfidant,
  onToggleSecret,
  onToggleAdult,
  onToggleReadGate,
  onSeal,
  isReadByConfidant,
  deleteArmed,
  onTagClick,
  onAddTag,
  onMoodChange,
  adultGatePassed = false,
  compact = false,
  compactMode = false,
  isActivePanel = false,
}: {
  entry: LocalEntry;
  onOpen: () => void;
  /** Ouvre la note côté commentaires (lecture). Fallback : onOpen. */
  onOpenComments?: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onShare: () => void;
  onShowShareSheet?: () => void;
  onToggleDraft: () => void;
  onToggleForConfidant: () => void;
  onToggleSecret: () => void;
  onToggleAdult: () => void;
  onToggleReadGate: () => void;
  onSeal: (unlockAt: string | null, capsuleSpoiler?: string | null) => void;
  isReadByConfidant?: boolean;
  deleteArmed: boolean;
  onTagClick?: (tag: string) => void;
  /** Ajoute un tag directement depuis la preview (owner). Si non fourni, le
   *  bouton "+ tag" n'apparaît pas — l'utilisateur ouvre la modale comme avant. */
  onAddTag?: (tag: string) => void;
  /** Édite l'humeur directement depuis la preview (owner). Si non fourni,
   *  l'humeur reste un simple affichage statique. */
  onMoodChange?: (v: string | null) => void;
  adultGatePassed?: boolean;
  /** Force 3-dot menu (always-collapsed actions) — used in narrow desktop column */
  compact?: boolean;
  /** Mode compact global : preview ultra-condensée */
  compactMode?: boolean;
  /** Highlight this card as the active desktop panel (inset ring) */
  isActivePanel?: boolean;
}) {
  // Config résolu (type built-in OU custom) : label/couleur/glyph à AFFICHER +
  // `behavior` à BRANCHER pour les vues structurées.
  const { defsById } = useNoteTypeDefs();
  const cfg = resolveNoteTypeConfig(entry, defsById);
  const behavior = cfg.behavior;
  const isSealed = !!(entry.unlockAt && new Date(entry.unlockAt) > new Date());
  const [showSealPicker, setShowSealPicker] = useState(false);
  const [sealDateDraft, setSealDateDraft] = useState('');
  // Heure d'ouverture optionnelle (HH:MM). Vide = 00:00 par défaut.
  const [sealTimeDraft, setSealTimeDraft] = useState('');
  const [sealSpoilerDraft, setSealSpoilerDraft] = useState<string>(entry.capsuleSpoiler ?? '');
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [menuDropPos, setMenuDropPos] = useState<{ top: number; right: number } | null>(null);
  // Le picker de capsule est rendu via portal (position fixed) pour ne pas être
  // rogné par l'`overflow-hidden` de la carte. On ancre sa position au bouton.
  const sealBtnRef = useRef<HTMLButtonElement>(null);
  const [sealPickerPos, setSealPickerPos] = useState<{ top: number; right: number } | null>(null);
  // Back natif (Android/iOS) → ferme les sous-panneaux ouverts depuis l'EntryCard.
  useBackButtonClose(showSealPicker, () => setShowSealPicker(false));
  useBackButtonClose(showActionsMenu, () => setShowActionsMenu(false));

  // ── Tous les hooks avant tout return conditionnel ─────────────────────────
  const previewRuns = parsePreviewRuns(entry.contentMd);
  const allSameSize = previewRuns.length > 0 && previewRuns.every((r) => r.fontSize === previewRuns[0]?.fontSize) ? previewRuns[0]?.fontSize : undefined;
  const previewFontSize = entry.fontSize ?? allSameSize ?? '17px';
  // Plages des blocs :::chat et :::branch — leurs images restent dans leur
  // contexte et n'apparaissent pas dans le carousel de la preview.
  const excludedBlockRanges: Array<[number, number]> = [];
  {
    const blockRe = /:::(?:chat|branch)[^\n]*\n?[\s\S]*?:::/g;
    let bm: RegExpExecArray | null;
    while ((bm = blockRe.exec(entry.contentMd)) !== null) excludedBlockRanges.push([bm.index, bm.index + bm[0].length]);
  }
  const inExcludedBlock = (idx: number) => excludedBlockRanges.some(([s, e]) => idx >= s && idx < e);
  const audioBlocks = [...entry.contentMd.matchAll(/^:::audio\s+"([^"]*)"\s+"([^"]*)"/gm)].map((m) => ({ src: m[1] ?? '', filename: m[2] ?? '' }));
  // Carousel unifié :::img + ![alt](src) + :::video dans l'ordre d'apparition.
  // Les images markdown simples (non redimensionnées) sont incluses au même
  // titre que les :::img — hors blocs chat/branch.
  const mediaItems: MediaItem[] = [
    ...[...entry.contentMd.matchAll(/^(\|\|)?:::img\s+"([^"]*)"\s+"([^"]*)"(?:\s+\d+)?(?:\s+souvenir)?(\|\|)?$/gm)]
      .map((m) => ({ _i: m.index ?? 0, type: 'image' as const, src: m[2] ?? '', alt: m[3] ?? '', spoiler: m[1] === '||' })),
    ...[...entry.contentMd.matchAll(/(\|\|)?!\[([^\]]*)\]\(([^)]+)\)(\|\|)?/g)]
      .filter((m) => !inExcludedBlock(m.index ?? 0))
      .map((m) => ({ _i: m.index ?? 0, type: 'image' as const, src: m[3] ?? '', alt: m[2] ?? '', spoiler: m[1] === '||' && m[4] === '||' })),
    ...[...entry.contentMd.matchAll(/^(\|\|)?:::video\s+"([^"]*)"\s+"([^"]*)"(?:\s+souvenir)?(\|\|)?$/gm)]
      .map((m) => ({ _i: m.index ?? 0, type: 'video' as const, src: m[2] ?? '', filename: m[3] ?? '', spoiler: m[1] === '||' })),
  ].filter((m) => m.src).sort((a, b) => a._i - b._i).map(({ _i: _, ...item }) => item);
  const codeBlockCount = (entry.contentMd.match(/^```/gm) ?? []).length / 2 | 0;
  const editCount = (entry.contentMd.match(/^:::edit\b/gm) ?? []).length;
  const m = entry.mediaMeta ?? {};
  const hasMedia = behavior !== 'JOURNAL' && m.subject;
  const { data: commentCount = entry.commentsCount ?? 0 } = trpc.comments.count.useQuery(
    { entryId: entry.id },
    {
      enabled: entry.version > 0,
      placeholderData: entry.commentsCount ?? 0,
    },
  );
  const hasMood = !!entry.mood;
  const hasTags = (entry.tagNames ?? []).length > 0;

  useEffect(() => { if (entry.font) loadFont(entry.font); }, [entry.font]);

  const timeDisplay = entry.timeLabel
    ? entry.timeLabel
    : entry.section
      ? { MORNING: 'Matin', LATE_MORNING: 'Fin de matinée', NOON: 'Midi', AFTERNOON: 'Après-midi', LATE_AFTERNOON: "Fin d'après-midi", EARLY_EVENING: 'Début de soirée', EVENING: 'Soir', NIGHT: 'Nuit', FREE: 'Libre' }[entry.section] ?? null
      : null;

  const actionBar = (() => {
          // ── Boutons "menu only" : exports + delete (rares actions, pas d'état utile à voir) ──
          const menuOnlyButtons = (<>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const lines: string[] = [];
              lines.push(`# ${cfg.customId ? '' : cfg.icon + ' '}${cfg.label} — ${entry.date}`);
              if (entry.timeLabel) lines.push(`> ${entry.timeLabel}`);
              if (m.subject) {
                lines.push('');
                lines.push(`**${m.subject}**`);
                if (m.creator) lines.push(`*${m.creator}*`);
                if (m.rating) lines.push('★'.repeat(m.rating) + '☆'.repeat(5 - m.rating));
                if (m.status) lines.push({ wishlist: 'Souhaité', owned: 'Possédé', ongoing: 'En cours', finished: 'Terminé', abandoned: 'Abandonné' }[m.status as string] ?? '');
                if (m.volume) lines.push(`Tome ${m.volume}${m.totalVolumes ? `/${m.totalVolumes}` : ''}`);
                if (m.progressCurrent && m.progressTotal) lines.push(`Progression : ${m.progressCurrent}/${m.progressTotal}`);
              }
              if (entry.mood) lines.push('', `Humeur : ${entry.mood}`);
              if (entry.contentMd?.trim()) { lines.push('', entry.contentMd.trim()); }
              const filename = `${entry.date}-${entry.noteType.toLowerCase()}.md`;
              const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = filename; a.click();
              URL.revokeObjectURL(url);
            }}
            aria-label="Exporter en Markdown"
            title="Exporter en Markdown"
            className="shrink-0 p-1.5 rounded-lg text-text-muted/45 hover:text-text-primary hover:bg-text-muted/10 transition-all duration-150"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void exportToPdf(entry); }}
            aria-label="Exporter en PDF"
            title="Exporter en PDF"
            className="shrink-0 p-1.5 rounded-lg text-text-muted/45 hover:text-text-primary hover:bg-text-muted/10 transition-all duration-150"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="9" y1="13" x2="15" y2="13" />
              <line x1="9" y1="17" x2="15" y2="17" />
              <line x1="9" y1="9" x2="11" y2="9" />
            </svg>
          </button>
          </>);

          // ── Boutons "toggleables" : visibles inline en permanence pour montrer leur état ──
          const toggleButtons = (<>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleForConfidant(); }}
            aria-label={entry.isForConfidant ? 'Retirer du confidant' : 'Marquer pour le confidant'}
            title={entry.isForConfidant ? 'Pour le confidant — cliquer pour retirer' : 'Marquer pour le confidant'}
            className={`shrink-0 p-1.5 rounded-lg transition-all duration-150 ${entry.isForConfidant ? 'text-accent' : 'text-text-muted/45 hover:text-accent'}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
              <polyline points="16 11 18 13 22 9" />
            </svg>
          </button>
          {/* Boîte de Pandore — invisible même au confident */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleSecret(); }}
            aria-label={entry.isSecret ? 'Mode secret actif — cliquer pour désactiver' : 'Activer le mode secret (invisible à tous)'}
            title={entry.isSecret ? 'Secret — cliquer pour désactiver' : 'Mode secret'}
            className={`shrink-0 p-1.5 rounded-lg transition-all duration-150 ${entry.isSecret ? 'text-secret' : 'text-text-muted/45 hover:text-secret'}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </button>
          {/* 18+ et Verrou : actions sensibles + rares → inline sur desktop, mais
              déplacées dans le menu « ⋯ » sur mobile pour désencombrer l'en-tête
              et éviter les mistaps (JRNL-02). `hidden md:contents` = masqué < md. */}
          <span className="hidden md:contents">
          {/* Contenu 18+ — preview floutée + question de vérification */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleAdult(); }}
            aria-label={entry.isAdult ? 'Contenu 18+ actif — cliquer pour désactiver' : 'Marquer comme contenu 18+'}
            title={entry.isAdult ? '18+ — cliquer pour désactiver' : 'Contenu 18+'}
            className={`shrink-0 p-1.5 rounded-lg transition-all duration-150 text-[13px] leading-none ${entry.isAdult ? 'opacity-100' : 'opacity-30 hover:opacity-100 grayscale hover:grayscale-0'}`}
          >
            🔞
          </button>
          {/* Verrou de lecture */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleReadGate(); }}
            aria-label={entry.readGatePrompt ? 'Verrou de lecture actif — modifier' : 'Activer le verrou de lecture'}
            title={entry.readGatePrompt ? 'Verrou de lecture — modifier' : 'Verrou de lecture'}
            className={`shrink-0 p-1.5 rounded-lg transition-all duration-150 ${entry.readGatePrompt ? 'text-accent bg-accent/10' : 'text-text-muted/45 hover:text-accent'}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              <circle cx="12" cy="16" r="1" fill="currentColor" />
            </svg>
          </button>
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleDraft(); }}
            aria-label={entry.isDraft ? 'Marquer comme terminé' : 'Marquer comme brouillon'}
            title={entry.isDraft ? 'Brouillon — cliquer pour marquer terminé' : 'Marquer comme brouillon'}
            className={`shrink-0 p-1.5 rounded-lg transition-all duration-150 ${entry.isDraft ? 'text-warning' : 'text-text-muted/45 hover:text-warning'}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); if (!entry.isSecret) onShare(); }}
            disabled={entry.isSecret}
            aria-label={
              entry.isSecret ? 'Partage désactivé (mode secret)' :
              entry.visibility === 'SHARED_ALL' ? 'Partagé avec tous — cliquer pour partage spécifique' :
              entry.visibility === 'SHARED_SPECIFIC' ? 'Partage spécifique — cliquer pour rendre privé' :
              'Privé — cliquer pour partager'
            }
            title={
              entry.isSecret ? 'Partage désactivé en mode secret' :
              entry.visibility === 'SHARED_ALL' ? 'Partagé avec tous → spécifique' :
              entry.visibility === 'SHARED_SPECIFIC' ? 'Cliquer pour rendre privé' :
              'Privé — cliquer pour partager'
            }
            className={`shrink-0 p-1.5 rounded-lg transition-all duration-150 ${entry.isSecret ? 'opacity-20 cursor-not-allowed' : entry.visibility !== 'PRIVATE' ? 'text-accent' : 'text-text-muted/45 hover:text-accent'}`}
          >
            {entry.visibility === 'SHARED_ALL' ? (
              /* Eye open — shared with all */
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
              </svg>
            ) : entry.visibility === 'SHARED_SPECIFIC' ? (
              /* Users icon — shared with specific guests */
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            ) : (
              /* Eye slash — private */
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
          </button>
          {/* Manage specific guests button — only when SHARED_SPECIFIC */}
          {entry.visibility === 'SHARED_SPECIFIC' && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onShowShareSheet?.(); }}
              aria-label="Gérer les accès"
              title="Gérer les accès"
              className="shrink-0 p-1.5 rounded-lg transition-all duration-150 text-accent/60 hover:text-accent hover:bg-accent/10"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          )}
          {/* Capsule temporelle — bouton sceau */}
          <div className="relative shrink-0">
            <button
              ref={sealBtnRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!showSealPicker && sealBtnRef.current) {
                  const r = sealBtnRef.current.getBoundingClientRect();
                  setSealPickerPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
                }
                setShowSealPicker((v) => {
                  // À l'ouverture : pré-remplit avec la valeur actuelle
                  if (!v) {
                    setSealDateDraft(entry.unlockAt ? parisDateOf(entry.unlockAt) : '');
                    // Pré-remplit l'heure (en Paris) depuis l'unlockAt existant — laisse vide
                    // si c'est l'ancien défaut 23:59 (pour suggérer le nouveau défaut 00:00).
                    setSealTimeDraft(() => {
                      if (!entry.unlockAt) return '';
                      const hhmm = parisTimeOf(entry.unlockAt);
                      return hhmm === '23:59' ? '' : hhmm;
                    });
                    setSealSpoilerDraft(entry.capsuleSpoiler ?? '');
                  }
                  return !v;
                });
              }}
              aria-label={isSealed ? 'Capsule active — modifier la date' : "Sceller cette note jusqu'à une date"}
              title={isSealed ? 'Capsule temporelle active' : 'Capsule temporelle'}
              className={`p-1.5 rounded-lg transition-all duration-150 ${isSealed ? 'text-sealed bg-sealed/10' : 'text-text-muted/45 hover:text-sealed'}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
            </button>
            {showSealPicker && sealPickerPos && createPortal(
              <>
                <div className="fixed inset-0 z-[60]" onClick={(e) => { e.stopPropagation(); setShowSealPicker(false); }} />
                <div
                  className="fixed z-[61] bg-bg-elevated border border-text-muted/15 rounded-xl shadow-2xl p-3 flex flex-col gap-2 w-[280px] max-w-[calc(100vw-16px)]"
                  style={{ top: sealPickerPos.top, right: sealPickerPos.right }}
                  onClick={(e) => e.stopPropagation()}
                >
                <p className="text-xs text-text-muted font-medium">{isSealed ? 'Modifier la date' : 'Sceller jusqu\'au…'}</p>
                <div className="flex items-center gap-1.5">
                  <DatePicker
                    value={sealDateDraft || (entry.unlockAt ? parisDateOf(entry.unlockAt) : '')}
                    onChange={setSealDateDraft}
                    min={parisDateOf(new Date().toISOString())}
                    placeholder="Date…"
                    className="flex-1"
                  />
                  <TimeInput
                    value={sealTimeDraft}
                    onChange={setSealTimeDraft}
                    placeholder="00:00"
                  />
                </div>
                <p className="text-[11px] text-text-muted/50 -mt-1">Heure de Paris. Sans heure : ouverture à 00:00 le jour choisi.</p>
                <label className="text-[11px] text-text-muted/70 mt-1">Spoiler (visible avant ouverture)</label>
                <input
                  type="text"
                  value={sealSpoilerDraft}
                  onChange={(e) => setSealSpoilerDraft(e.target.value)}
                  placeholder="Une surprise pour ton anniversaire…"
                  maxLength={500}
                  className="w-full bg-bg-primary border border-text-muted/15 rounded-lg px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent/40"
                />
                <button
                  type="button"
                  disabled={!sealDateDraft && !isSealed}
                  onClick={() => {
                    const v = sealDateDraft || (entry.unlockAt ? parisDateOf(entry.unlockAt) : '');
                    if (v) {
                      // Interprétation explicite en heure de Paris (DST géré). Sans heure → 00:00.
                      onSeal(parisDateTimeToISO(v, sealTimeDraft), sealSpoilerDraft.trim() || null);
                      setShowSealPicker(false);
                      setSealDateDraft('');
                      setSealTimeDraft('');
                    }
                  }}
                  className="w-full py-1.5 rounded-lg text-xs font-medium bg-sealed/15 text-sealed hover:bg-sealed/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isSealed ? 'Mettre à jour' : 'Sceller'}
                </button>
                {isSealed && (
                  <button
                    type="button"
                    onClick={() => { onSeal(null, null); setShowSealPicker(false); setSealDateDraft(''); setSealTimeDraft(''); setSealSpoilerDraft(''); }}
                    className="w-full py-1.5 rounded-lg text-xs font-medium text-text-muted hover:bg-text-muted/10 transition-colors"
                  >
                    Retirer la capsule
                  </button>
                )}
                </div>
              </>,
              document.body,
            )}
          </div>
          </>);

          // Delete fait partie de menuOnlyButtons (rare, destructif → derrière le menu sur mobile)
          const deleteButton = (
            <button
              type="button"
              onClick={onDelete}
              aria-label={deleteArmed ? 'Confirmer la suppression' : 'Supprimer cette note'}
              className={`shrink-0 p-1.5 rounded-lg transition-all duration-150 ${deleteArmed ? 'text-danger bg-danger/10' : 'text-text-muted/45 hover:text-danger hover:bg-danger/10'}`}
            >
              {deleteArmed ? (
                <span className="text-[11px] font-medium px-0.5">Supprimer ?</span>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              )}
            </button>
          );
          return (
            <div className="flex items-center gap-0 sm:gap-0.5 shrink-0">
              {/* Toggleables : toujours visibles inline (état coloré apparent) */}
              {toggleButtons}
              {/* ≥ md ET non-compact : menu actions visibles inline */}
              <div className={`items-center gap-0.5 ${compact ? 'hidden' : 'hidden md:flex'}`}>
                {menuOnlyButtons}
                {deleteButton}
              </div>
              {/* < md OU compact : burger pour exports + delete */}
              <div className={compact ? 'shrink-0' : 'md:hidden shrink-0'}>
                <button
                  ref={menuBtnRef}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!showActionsMenu && menuBtnRef.current) {
                      const r = menuBtnRef.current.getBoundingClientRect();
                      setMenuDropPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
                    }
                    setShowActionsMenu((v) => !v);
                  }}
                  aria-label="Plus d'actions"
                  title="Plus d'actions"
                  className={`p-1.5 rounded-lg transition-all duration-150 ${showActionsMenu ? 'bg-text-muted/10 text-text-primary' : 'text-text-muted/50 hover:text-text-primary hover:bg-text-muted/10'}`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" />
                  </svg>
                </button>
                {showActionsMenu && createPortal(
                  <>
                    <div
                      className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm md:hidden"
                      onClick={(e) => { e.stopPropagation(); setShowActionsMenu(false); }}
                    />
                    <div
                      className="fixed inset-x-0 bottom-0 z-[61] bg-bg-elevated border-t border-text-muted/15 rounded-t-2xl shadow-2xl md:hidden"
                      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex justify-center pt-2 pb-1">
                        <div className="w-10 h-1 rounded-full bg-text-muted/30" />
                      </div>
                      <div className="px-4 pb-4 pt-2">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[11px] font-medium uppercase tracking-widest text-text-muted/60">Actions</p>
                          <button
                            type="button"
                            onClick={() => setShowActionsMenu(false)}
                            className="p-1 rounded-lg text-text-muted/60 hover:text-text-primary hover:bg-text-muted/10 transition-colors"
                            aria-label="Fermer"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                        <div className="flex flex-col gap-1">
                          {/* Actions sensibles rares déplacées ici sur mobile (JRNL-02) */}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onToggleReadGate(); setShowActionsMenu(false); }}
                            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm transition-colors ${entry.readGatePrompt ? 'bg-accent/10 text-accent' : 'text-text-primary hover:bg-text-muted/10'}`}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={entry.readGatePrompt ? '' : 'text-text-muted'}>
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /><circle cx="12" cy="16" r="1" fill="currentColor" />
                            </svg>
                            {entry.readGatePrompt ? 'Verrou de lecture — modifier' : 'Verrou de lecture'}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onToggleAdult(); setShowActionsMenu(false); }}
                            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm transition-colors ${entry.isAdult ? 'bg-text-muted/10 text-text-primary' : 'text-text-primary hover:bg-text-muted/10'}`}
                          >
                            <span className="w-4 text-center text-base leading-none">🔞</span>
                            {entry.isAdult ? 'Contenu 18+ — actif' : 'Marquer comme 18+'}
                          </button>
                          <div className="h-px bg-text-muted/10 my-1" />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const lines: string[] = [];
                              lines.push(`# ${cfg.customId ? '' : cfg.icon + ' '}${cfg.label} — ${entry.date}`);
                              if (entry.timeLabel) lines.push(`> ${entry.timeLabel}`);
                              if (m.subject) {
                                lines.push('');
                                lines.push(`**${m.subject}**`);
                                if (m.creator) lines.push(`*${m.creator}*`);
                                if (m.rating) lines.push('★'.repeat(m.rating) + '☆'.repeat(5 - m.rating));
                                if (m.status) lines.push({ wishlist: 'Souhaité', owned: 'Possédé', ongoing: 'En cours', finished: 'Terminé', abandoned: 'Abandonné' }[m.status as string] ?? '');
                                if (m.volume) lines.push(`Tome ${m.volume}${m.totalVolumes ? `/${m.totalVolumes}` : ''}`);
                                if (m.progressCurrent && m.progressTotal) lines.push(`Progression : ${m.progressCurrent}/${m.progressTotal}`);
                              }
                              if (entry.mood) lines.push('', `Humeur : ${entry.mood}`);
                              if (entry.contentMd?.trim()) { lines.push('', entry.contentMd.trim()); }
                              const filename = `${entry.date}-${entry.noteType.toLowerCase()}.md`;
                              const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url; a.download = filename; a.click();
                              URL.revokeObjectURL(url);
                              setShowActionsMenu(false);
                            }}
                            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-text-primary hover:bg-text-muted/10 transition-colors"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            Exporter en Markdown
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); void exportToPdf(entry); setShowActionsMenu(false); }}
                            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-text-primary hover:bg-text-muted/10 transition-colors"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <line x1="9" y1="13" x2="15" y2="13" />
                              <line x1="9" y1="17" x2="15" y2="17" />
                            </svg>
                            Exporter en PDF
                          </button>
                          <div className="h-px bg-text-muted/10 my-1" />
                          <button
                            type="button"
                            onClick={(e) => { onDelete(e); /* deleteArmed handles 2-step confirm */ }}
                            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm transition-colors ${deleteArmed ? 'bg-danger/10 text-danger' : 'text-danger hover:bg-danger/10'}`}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                            </svg>
                            {deleteArmed ? 'Confirmer la suppression' : 'Supprimer'}
                          </button>
                        </div>
                      </div>
                    </div>
                    {/* Dropdown desktop */}
                    {menuDropPos && (
                      <>
                        <div className="fixed inset-0 z-[60] hidden md:block" onClick={(e) => { e.stopPropagation(); setShowActionsMenu(false); }} />
                        <div
                          className="fixed z-[61] hidden md:flex flex-col gap-0.5 bg-bg-elevated border border-text-muted/15 rounded-xl shadow-lg p-1.5 min-w-[170px]"
                          style={{ top: menuDropPos.top, right: menuDropPos.right }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const lines: string[] = [];
                              lines.push(`# ${cfg.customId ? '' : cfg.icon + ' '}${cfg.label} — ${entry.date}`);
                              if (entry.contentMd?.trim()) lines.push('', entry.contentMd.trim());
                              const filename = `${entry.date}-${entry.noteType.toLowerCase()}.md`;
                              const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
                              URL.revokeObjectURL(url);
                              setShowActionsMenu(false);
                            }}
                            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-text-primary hover:bg-text-muted/8 transition-colors"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted shrink-0"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                            Exporter en Markdown
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); void exportToPdf(entry); setShowActionsMenu(false); }}
                            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-text-primary hover:bg-text-muted/8 transition-colors"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="15" y2="17" /></svg>
                            Exporter en PDF
                          </button>
                          <div className="h-px bg-text-muted/10 my-0.5" />
                          <button
                            type="button"
                            onClick={(e) => { onDelete(e); }}
                            className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors ${deleteArmed ? 'bg-danger/10 text-danger' : 'text-danger hover:bg-danger/10'}`}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                            {deleteArmed ? 'Confirmer' : 'Supprimer'}
                          </button>
                        </div>
                      </>
                    )}
                  </>,
                  document.body,
                )}
              </div>
            </div>
          );
  })();

  // ── Mode compact (toggle global) : preview ultra-condensée ───────────────
  if (compactMode) {
    return (
      <CompactEntryCard
        entryId={entry.id}
        noteType={entry.noteType}
        customTypeId={entry.customTypeId}
        date={entry.date}
        title={entry.title}
        contentMd={entry.contentMd}
        mediaSubject={(entry.mediaMeta?.subject as string | undefined) ?? null}
        isMusicPlaylist={behavior === 'MUSIC' && isPlaylist(m)}
        infoLine={behavior === 'DEV' ? formatDevInfoLine(entry.mediaMeta) : formatAgendaFinanceInfoLine(behavior, entry.mediaMeta)}
        timeLabel={timeDisplay}
        isAdult={entry.isAdult}
        adultGatePassed={adultGatePassed}
        isSecret={entry.isSecret}
        isSealedCapsule={!!(entry.unlockAt && new Date(entry.unlockAt) > new Date())}
        capsuleSpoiler={entry.capsuleSpoiler}
        isDraft={entry.isDraft}
        isForConfidant={entry.isForConfidant}
        hasReadGate={!!entry.readGatePrompt}
        hideUntilFuture={!!entry.hideUntilAt && new Date(entry.hideUntilAt).getTime() > Date.now()}
        commentCount={commentCount}
        ratings={entry.ratings ?? []}
        isReadByConfidant={isReadByConfidant}
        isActivePanel={isActivePanel}
        onClick={onOpen}
      />
    );
  }

  // ── Capsule scellée ──────────────────────────────────────────────────────
  if (isSealed) {
    // Affichage forcé en heure de Paris (cf. lib/parisTime.ts) — l'app est destinée à un public FR.
    const unlockTime = parisTimeOf(entry.unlockAt!);
    const datePart = parisDateLong(entry.unlockAt!);
    // Affiche l'heure si elle est significative (pas 00:00 ni l'ancien défaut 23:59)
    const unlockDate = (unlockTime === '00:00' || unlockTime === '23:59') ? datePart : `${datePart} à ${unlockTime}`;
    const sealHeaderBg = cfg.color.startsWith('var(') ? `color-mix(in srgb, ${cfg.color} 10%, transparent)` : `${cfg.color}1a`;
    const sealSepColor = cfg.color.startsWith('var(') ? `color-mix(in srgb, ${cfg.color} 15%, transparent)` : `${cfg.color}26`;
    return (
      <div
        className={`group bg-bg-elevated rounded-2xl shadow-soft cursor-pointer border-l-[3px] overflow-hidden transition-all duration-200 ${showSealPicker ? 'relative z-40' : ''}`}
        style={{ borderLeftColor: cfg.color, backgroundColor: behavior !== 'JOURNAL' ? noteTint(cfg.color, 3) : undefined }}
        onClick={onOpen}
      >
        {/* Header coloré — identique aux cartes normales */}
        <div className="px-6 pt-4 pb-3" style={{ backgroundColor: sealHeaderBg }}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium font-mono whitespace-nowrap" style={{ color: cfg.color }}><cfg.Glyph className="w-3.5 h-3.5 shrink-0" /> {cfg.label}</span>
            </div>
            {actionBar}
          </div>
        </div>
        <div className="h-px" style={{ backgroundColor: sealSepColor }} />
        <div className="px-6 pt-3 pb-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">🔒</span>
            {entry.title
              ? <span className="text-sm font-medium text-text-primary">{entry.title}</span>
              : <span className="text-sm text-text-muted italic">Capsule temporelle</span>
            }
          </div>
          <p className="text-xs text-text-muted">S'ouvre le {unlockDate}</p>
          <p className="text-xs text-text-muted/50 mt-0.5">{formatCountdown(entry.unlockAt!)}</p>
          {entry.capsuleSpoiler && (
            <p className="text-xs text-sealed/80 italic mt-2 leading-snug">"{entry.capsuleSpoiler}"</p>
          )}
          <div className="mt-2.5 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={onOpen}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
              title="Commenter (la note reste scellée)"
            >
              💬
              {commentCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-accent/20 text-accent text-[11px] font-semibold">
                  {commentCount}
                </span>
              )}
            </button>
            <CardEntryReactions entryId={entry.id} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group bg-bg-elevated rounded-2xl shadow-soft cursor-pointer border-l-[3px] overflow-hidden transition-all duration-200 ${showSealPicker ? 'relative z-40' : ''}`}
      style={{
        borderLeftColor: cfg.color,
        backgroundColor: behavior !== 'JOURNAL' ? noteTint(cfg.color, 3) : undefined,
        ...(isActivePanel ? {
          boxShadow: `inset 0 0 0 2px ${cfg.color.startsWith('var(') ? `color-mix(in srgb, ${cfg.color} 55%, transparent)` : `${cfg.color}8c`}, var(--shadow-soft)`,
        } : {}),
      }}
      onClick={onOpen}
    >
      {/* ── Header coloré ─────────────────────────────────────────────────── */}
      <div
        className="px-6 pt-4 pb-3"
        style={{ backgroundColor: cfg.color.startsWith('var(') ? `color-mix(in srgb, ${cfg.color} 10%, transparent)` : `${cfg.color}1a` }}
      >
        {/* Sur mobile : actions en haut (flex-col-reverse), type+badges en dessous. */}
        <div className="flex flex-col-reverse gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium font-mono whitespace-nowrap" style={{ color: cfg.color }}>
            <cfg.Glyph className="w-3.5 h-3.5 shrink-0" /> {cfg.label}
          </span>
          {timeDisplay && (
            <span className="font-mono text-xs text-text-muted whitespace-nowrap">{timeDisplay}</span>
          )}
          {entry.isDraft && <DraftBadge createdAt={entry.createdAt} />}
          {!entry.isDraft && entry.hideUntilAt && new Date(entry.hideUntilAt).getTime() > Date.now() && (
            <span
              className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-full bg-sealed/15 text-sealed font-medium whitespace-nowrap"
              title={`Invisible au confident jusqu'au ${new Date(entry.hideUntilAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5" aria-hidden><circle cx="8" cy="8" r="6.5" /><polyline points="8 4 8 8 11 9.5" /></svg>
              Visible {new Date(entry.hideUntilAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {entry.readGatePrompt && (
            <span
              className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-full bg-accent/12 text-accent font-medium whitespace-nowrap"
              title={`Verrou de lecture actif${entry.readGateAcceptedResponses?.length ? ` — ${entry.readGateAcceptedResponses.length} réponse${entry.readGateAcceptedResponses.length > 1 ? 's' : ''} acceptée${entry.readGateAcceptedResponses.length > 1 ? 's' : ''}` : ' — validation manuelle'}`}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5" aria-hidden>
                <rect x="2" y="7.5" width="12" height="7.5" rx="1.5" /><path d="M4.5 7.5V5a3.5 3.5 0 0 1 7 0v2.5" />
              </svg>
              Verrou
            </span>
          )}
        </div>
        {/* Badge "vu" + Actions : self-end pour coller à droite sur mobile (col), auto sur sm+ */}
        <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
          {isReadByConfidant && (
            <span
              className="inline-flex items-center gap-0.5 px-1 sm:px-1.5 py-0.5 bg-accent/15 text-accent text-[11px] rounded-full font-semibold"
              title="Lu par le confident"
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
              </svg>
              <span className="hidden sm:inline">vu</span>
            </span>
          )}
          {actionBar}
        </div>
        </div>
      </div>
      {/* Séparateur */}
      <div className="h-px" style={{ backgroundColor: cfg.color.startsWith('var(') ? `color-mix(in srgb, ${cfg.color} 15%, transparent)` : `${cfg.color}26` }} />
      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="px-6 pt-3 pb-5">

      {/* ── Zone floutée si 18+ ─────────────────────────────────────────────── */}
      <div className={`relative ${entry.isAdult && !adultGatePassed ? 'select-none' : ''}`}>
        {entry.isAdult && !adultGatePassed && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg pointer-events-none">
            <span className="text-xs font-bold text-adult/90 bg-bg-elevated/85 backdrop-blur-sm px-2.5 py-1 rounded-full border border-adult/25 shadow-sm">🔞 Contenu sensible</span>
          </div>
        )}
        <div className={entry.isAdult && !adultGatePassed ? 'blur-md pointer-events-none' : ''}>
          {/* Media meta summary (caché pour les playlists MUSIC, MusicNotePlayer rend son propre en-tête) */}
          {hasMedia && !(behavior === 'MUSIC' && isPlaylist(m)) && (
            <div className="mb-2 flex gap-3">
              {m.coverUrl && (
                <img src={m.coverUrl} alt="couverture" className="h-20 w-auto rounded object-cover shrink-0 shadow-sm" />
              )}
              <div className="flex-1 min-w-0">
                {m.seriesName && (
                  <p className="text-text-muted/60 text-[11px] font-medium mb-0.5 truncate">{m.seriesName}</p>
                )}
                <p className="text-text-primary font-medium text-sm">{m.subject}</p>
                {behavior === 'MUSIC' && m.trackTitle && (
                  <p className="text-text-muted text-xs">{m.trackTitle}</p>
                )}
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {m.creator && <span className="text-xs text-text-muted">{m.creator}</span>}
                  {m.rating && (
                    <span className="text-xs" style={{ color: cfg.color }}>
                      {'★'.repeat(m.rating)}{'☆'.repeat(5 - m.rating)}
                    </span>
                  )}
                  {m.status && (
                    <span className="text-xs text-text-muted/60 italic">
                      {{ wishlist: 'Souhaité', owned: 'Possédé', ongoing: 'En cours', finished: 'Terminé', abandoned: 'Abandonné' }[m.status]}
                    </span>
                  )}
                  {behavior === 'BOOK' && (m.progressCurrent != null || m.chapter != null || m.volume != null) && (
                    <span className="text-xs text-text-muted/70 tabular-nums">
                      {m.volume != null && `T.${m.volume}${m.totalVolumes != null ? `/${m.totalVolumes}` : ''}`}
                      {m.volume != null && m.progressCurrent != null && ' · '}
                      {m.progressCurrent != null && `p. ${m.progressCurrent}${m.progressTotal != null ? `/${m.progressTotal}` : ''}`}
                      {m.progressCurrent == null && m.chapter != null && `chap. ${m.chapter}`}
                    </span>
                  )}
                  {behavior === 'SERIES' && (m.season != null || m.progressCurrent != null) && (
                    <span className="text-xs text-text-muted/70 tabular-nums">
                      {m.season != null && `S${m.season}${m.totalSeasons != null ? `/${m.totalSeasons}` : ''}`}
                      {m.progressCurrent != null && ` E${m.progressCurrent}${m.progressTotal != null ? `/${m.progressTotal}` : ''}`}
                    </span>
                  )}
                  {behavior === 'DEV' && (m.volume != null || m.chapter != null) && (
                    <span className="text-xs text-text-muted/70 tabular-nums">
                      {m.volume != null && `Partie ${m.volume}${m.totalVolumes != null ? `/${m.totalVolumes}` : ''}${m.partName ? ` — ${m.partName}` : ''}`}
                      {m.volume != null && m.chapter != null && ' · '}
                      {m.chapter != null && `Ch. ${m.chapter}${m.totalChapters != null ? `/${m.totalChapters}` : ''}`}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Player stream — gère mono-track et playlist */}
          {behavior === 'MUSIC' && (
            <div onClick={(e) => e.stopPropagation()}>
              <MusicNotePlayer meta={entry.mediaMeta} compact />
            </div>
          )}

          {/* Agenda — résumé compact */}
          {behavior === 'AGENDA' && (entry.mediaMeta?.events?.length ?? 0) > 0 && (() => {
            const evs = entry.mediaMeta!.events!;
            const up = upcomingCount(evs, isoToday());
            const total = `${evs.length} événement${evs.length > 1 ? 's' : ''}`;
            return (
              <p className="text-xs text-text-muted/75 mb-1.5 flex items-center gap-1.5">
                <span style={{ color: 'var(--color-note-agenda)' }} aria-hidden>▦</span>
                {up > 0 ? `${up} à venir · ${total}` : total}
              </p>
            );
          })()}

          {/* Finance — résumé compact (solde) */}
          {behavior === 'FINANCE' && (entry.mediaMeta?.budgetItems?.length ?? 0) > 0 && (() => {
            const its = entry.mediaMeta!.budgetItems!;
            const t = budgetTotals(its);
            const cur = entry.mediaMeta?.currency ?? '€';
            return (
              <p className="text-xs text-text-muted/75 mb-1.5 flex items-center gap-1.5">
                Solde <span className="font-semibold tabular-nums" style={{ color: t.balance >= 0 ? '#3F8A5A' : 'var(--color-error)' }}>{formatAmount(t.balance, cur, { signed: true })}</span>
                <span className="text-text-muted/55">· {its.length} ligne{its.length > 1 ? 's' : ''}</span>
              </p>
            );
          })()}

          {/* Titre custom (les médias ont déjà m.subject, donc on ne l'affiche que si pas de media) */}
          {entry.title && !hasMedia && (
            <p className="text-text-primary font-medium text-sm leading-tight mb-1.5 truncate">{entry.title}</p>
          )}

          {/* Carousel unifié :::img + ![alt](src) + :::video */}
          {mediaItems.length > 0 && (
            <div className="mb-2" onClick={(e) => e.stopPropagation()}>
              <MediaCarousel items={mediaItems} />
            </div>
          )}

          {/* Content preview text */}
          {previewRuns.length > 0 ? (
            <p className={`text-text-primary leading-relaxed mb-2 ${hasMedia ? 'line-clamp-2' : 'line-clamp-3'}`} style={{ fontFamily: getFontFamily(entry.font), fontSize: scaledFontSize(entry.font, previewFontSize) }}>
              <PreviewRuns runs={previewRuns} />
            </p>
          ) : codeBlockCount > 0 && audioBlocks.length === 0 ? (
            <p className="text-text-muted/60 text-sm mb-2 flex items-center gap-1.5 font-mono">
              <span className="opacity-60">{'{}'}</span>
              {codeBlockCount > 1 ? `${codeBlockCount} blocs de code` : '1 bloc de code'}
            </p>
          ) : audioBlocks.length === 0 && !hasMedia && (
            <p className="text-text-muted/45 text-xs italic mb-1">
              {{ JOURNAL: 'Écrire…', BOOK: 'Ajouter un titre…', SERIES: 'Ajouter un titre…', MOVIE: 'Ajouter un titre…', MUSIC: 'Ajouter un titre…', OUTING: 'Ajouter un lieu…', SHOPPING: 'Ajouter des liens…', DEV: 'Écrire du code…', QUIZZ: 'Composer le quizz…', AGENDA: 'Ajouter des événements…', FINANCE: 'Ajouter des lignes…' }[behavior] ?? '…'}
            </p>
          )}

          {/* Audio players — 2+ pistes consécutives → playlist groupée
              (BulkAudioPlayer), 1 seule → player individuel. Même règle
              qu'en read view via AnnotatedReader. */}
          {audioBlocks.length > 0 && (
            <div className="mb-2" onClick={(e) => e.stopPropagation()}>
              {audioBlocks.length >= 2 ? (
                <BulkAudioPlayer items={audioBlocks.map((a) => ({ src: a.src, filename: a.filename }))} />
              ) : (
                <AudioPlayer src={audioBlocks[0]!.src} filename={audioBlocks[0]!.filename} />
              )}
            </div>
          )}


          {/* Edit blocks indicator */}
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

          {/* Shopping links preview */}
          {behavior === 'SHOPPING' && (entry.links ?? []).length > 0 && (
            <div className="flex flex-col gap-2 mb-3" onClick={(e) => e.stopPropagation()}>
              {(entry.links ?? []).slice(0, 2).map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-xl border border-text-muted/10 bg-bg-primary/50 px-3 py-2.5 hover:border-text-muted/25 transition-colors group/link"
                >
                  {link.image && (
                    <img src={link.image} alt="" className="h-12 w-12 rounded-lg object-cover shrink-0 bg-text-muted/10" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary font-medium truncate group-hover/link:text-accent transition-colors">{link.title || link.url}</p>
                    {link.siteName && <p className="text-xs text-text-muted/60 truncate mt-0.5">{link.siteName}</p>}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer : commentaires · réactions · tags · humeur */}
      <div className="flex items-center gap-2 flex-wrap mt-1">
        {/* Commentaires — ouvre la note en lecture, scrollée sur les commentaires */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); (onOpenComments ?? onOpen)(); }}
          className="text-xs text-text-muted/50 hover:text-text-muted transition-colors flex items-center gap-1.5 shrink-0"
        >
          💬
          {commentCount > 0 && (
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-accent/20 text-accent text-[11px] font-semibold">
              {commentCount}
            </span>
          )}
        </button>

        {/* Réactions — bouton rapide + pills */}
        <CardEntryReactions entryId={entry.id} />

        {/* Favoris / nul — notation perso de la note. Owner voit aussi les
            notations des confidents (avec noms en tooltip). */}
        <RatingButtonsForCard entry={entry} />

        {/* Séparateur souple */}
        <span className="flex-1" />

        {/* Tags — max 3, puis "+N" */}
        {(entry.tagNames ?? []).slice(0, 3).map((t) => (
          <button
            key={t}
            type="button"
            onClick={(e) => { e.stopPropagation(); onTagClick?.(t); }}
            className="text-xs text-text-muted bg-text-muted/8 px-2 py-0.5 rounded-full hover:bg-accent/10 hover:text-accent transition-colors"
          >
            #{t}
          </button>
        ))}
        {(entry.tagNames ?? []).length > 3 && (
          <span className="text-xs text-text-muted/50 px-1">+{(entry.tagNames ?? []).length - 3}</span>
        )}
        {/* Ajout rapide d'un tag depuis la preview — owner only. La modale
            reste accessible pour éditer / supprimer des tags existants. */}
        {onAddTag && (
          <QuickAddTagPill
            existingTags={entry.tagNames ?? []}
            onAdd={onAddTag}
          />
        )}

        {/* Météo de cette note (distincte de la météo « du jour » du Ressenti du jour). */}
        {entry.weather && (
          <span className="text-xs text-text-muted/50 shrink-0" title="Météo de cette note">{entry.weather}</span>
        )}

        {/* Humeur de cette note — toujours à droite, clairement séparée des réactions
            et du « Ressenti du jour ». Owner : éditable via le MoodSelector dropdown. */}
        {onMoodChange ? (
          <span className="shrink-0" title="Humeur de cette note" onClick={(e) => e.stopPropagation()}>
            <MoodSelector value={entry.mood ?? null} onChange={onMoodChange} dropdown />
          </span>
        ) : hasMood && (
          <span className="text-base leading-none shrink-0" title="Humeur de cette note">{entry.mood}</span>
        )}
      </div>
      </div>
    </div>
  );
}

// ── Capsule seal row (in edit mode) ──────────────────────────────────────────

function SealEditRow({ unlockAt, onSeal }: { unlockAt: string; onSeal: (v: string | null) => void }) {
  const [dateDraft, setDateDraft] = useState(parisDateOf(unlockAt));
  const [timeDraft, setTimeDraft] = useState(() => {
    const hhmm = parisTimeOf(unlockAt);
    return hhmm === '23:59' ? '' : hhmm;
  });
  const unlockDateLabel = parisDateLong(unlockAt);
  const unlockTimeLabel = parisTimeOf(unlockAt);
  const currentDate = parisDateOf(unlockAt);
  const currentTime = parisTimeOf(unlockAt);
  const hasChanged = dateDraft && (dateDraft !== currentDate || (timeDraft || '00:00') !== (currentTime === '23:59' ? '00:00' : currentTime));
  return (
    <div className="mb-3 rounded-xl border border-sealed/20 bg-sealed/5 px-3 py-2.5 flex flex-wrap items-center gap-2">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sealed shrink-0">
        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
      </svg>
      <span className="text-xs text-sealed font-medium">
        Scellée jusqu'au {unlockDateLabel}{unlockTimeLabel !== '23:59' && unlockTimeLabel !== '00:00' ? ` à ${unlockTimeLabel}` : ''}
      </span>
      <div className="flex items-center gap-1.5 ml-auto">
        <DatePicker
          value={dateDraft}
          onChange={setDateDraft}
          min={parisDateOf(new Date().toISOString())}
          placeholder="Date…"
          portal
        />
        <TimeInput
          value={timeDraft}
          onChange={setTimeDraft}
          placeholder="00:00"
          className="text-xs"
        />
        <button
          type="button"
          disabled={!hasChanged}
          onClick={() => {
            if (!dateDraft) return;
            onSeal(parisDateTimeToISO(dateDraft, timeDraft));
          }}
          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-sealed/15 text-sealed hover:bg-sealed/25 disabled:opacity-40 transition-colors"
        >
          Changer
        </button>
        <button
          type="button"
          onClick={() => onSeal(null)}
          className="px-2.5 py-1 rounded-lg text-xs text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
        >
          Desceller
        </button>
      </div>
    </div>
  );
}

// ── Shopping links editor ─────────────────────────────────────────────────────

function ShoppingLinksEditor({
  entryId,
  links,
  onUpdate,
}: {
  entryId: string;
  links: EntryLink[];
  onUpdate: (links: EntryLink[]) => void;
}) {
  const [url, setUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const setLinks = trpc.entries.setLinks.useMutation();

  const persistLinks = useCallback((newLinks: EntryLink[]) => {
    onUpdate(newLinks);
    setLinks.mutate({ id: entryId, links: newLinks });
  }, [entryId, onUpdate, setLinks]);

  const handleAdd = useCallback(async () => {
    if (!url.trim()) return;
    let normalizedUrl = url.trim();
    if (!/^https?:\/\//.test(normalizedUrl)) normalizedUrl = 'https://' + normalizedUrl;
    setFetching(true);
    setUrl('');
    try {
      const meta = await apiClient.entries.fetchLinkMeta.query({ url: normalizedUrl });
      persistLinks([...links, meta as EntryLink]);
    } catch {
      const hostname = (() => { try { return new URL(normalizedUrl).hostname.replace(/^www\./, ''); } catch { return normalizedUrl; } })();
      persistLinks([...links, { url: normalizedUrl, title: null, image: null, siteName: hostname }]);
    } finally {
      setFetching(false);
    }
  }, [url, links, persistLinks]);

  return (
    <div className="mt-3 mb-1">
      <p className="text-xs text-text-muted/60 font-medium uppercase tracking-wide mb-2">Liens</p>
      {links.length > 0 && (
        <div className="flex flex-col gap-2 mb-3">
          {links.map((link, i) => (
            <div key={i} className="flex items-center gap-2 rounded-xl border border-text-muted/10 bg-bg-primary/50 px-3 py-2">
              {link.image && (
                <img src={link.image} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0 bg-text-muted/10" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary font-medium truncate">{link.title || link.url}</p>
                {link.siteName && <p className="text-xs text-text-muted/50 truncate">{link.siteName}</p>}
              </div>
              <button
                type="button"
                onClick={() => persistLinks(links.filter((_, j) => j !== i))}
                className="shrink-0 p-1 rounded text-text-muted/55 hover:text-danger transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => { setUrl(e.target.value); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
          placeholder="https://…"
          className="flex-1 bg-bg-primary/50 border border-text-muted/15 rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/55 outline-none focus:border-accent/40 transition-colors"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={fetching || !url.trim()}
          className="px-3 py-2 rounded-xl text-xs font-medium bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {fetching ? '…' : 'Ajouter'}
        </button>
      </div>
    </div>
  );
}

// ── Main EntryCard ────────────────────────────────────────────────────────────

export function EntryCard({ entry, autoFocus = false, defaultOpen = false, focusedCommentId, onSave, onTagClick, isReadByConfidant = false, selectable = false, selected = false, onSelect, onDesktopClick, desktopPanel = false, openToComments = false, onModalClose, compact = false, compactMode = false, isActivePanel = false }: EntryCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(defaultOpen || autoFocus || !!focusedCommentId || desktopPanel);
  // Ouverture via la bulle 💬 : toujours en lecture (même un brouillon),
  // scrollée sur la section commentaires.
  const [modalToComments, setModalToComments] = useState(false);
  const wantComments = modalToComments || openToComments;
  const [isEditing, setIsEditing] = useState((autoFocus || entry.isDraft) && !openToComments);
  // Ouvre la note quand une notification la cible alors que la carte est déjà
  // montée (clic sur une notif depuis la home — l'initialiseur useState ne
  // re-tourne pas dans ce cas).
  useEffect(() => {
    if (defaultOpen || focusedCommentId) setIsModalOpen(true);
  }, [defaultOpen, focusedCommentId]);
  // Panel desktop déjà monté quand l'utilisateur clique la bulle 💬 → repasse en lecture.
  useEffect(() => {
    if (openToComments) setIsEditing(false);
  }, [openToComments]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [linkCopied, setLinkCopied] = useState(false);
  const [editMenuOpen, setEditMenuOpen] = useState(false);
  const editMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      // Ne pas fermer si le clic vise le calendrier (rendu en portal hors du menu).
      if (t.closest?.('[data-datepicker-portal]')) return;
      if (editMenuRef.current && !editMenuRef.current.contains(t)) setEditMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [editMenuOpen]);
  // Quick toggles dans le header d'édition : capsule / sceau
  const [showEditSealPicker, setShowEditSealPicker] = useState(false);
  const editSealPanel = useDropdownAlign(showEditSealPicker);
  const [editSealDraft, setEditSealDraft] = useState('');
  const [editSealTimeDraft, setEditSealTimeDraft] = useState('');
  const [editSpoilerDraft, setEditSpoilerDraft] = useState<string>(entry.capsuleSpoiler ?? '');
  const editSealRef = useRef<HTMLDivElement>(null);
  // Ouvre le picker de capsule (menu / desktop) en pré-remplissant date + heure
  // (heure de Paris) + spoiler depuis la valeur actuelle.
  const toggleEditSeal = () => setShowEditSealPicker((v) => {
    if (!v) {
      setEditSealDraft(entry.unlockAt ? parisDateOf(entry.unlockAt) : '');
      const t = entry.unlockAt ? parisTimeOf(entry.unlockAt) : '';
      setEditSealTimeDraft(t === '23:59' ? '' : t);
      setEditSpoilerDraft(entry.capsuleSpoiler ?? '');
    }
    return !v;
  });
  // Calcule l'ISO d'ouverture (Paris) à partir des brouillons date+heure éditeur.
  const editSealIso = (): string | null => {
    const v = editSealDraft || (entry.unlockAt ? parisDateOf(entry.unlockAt) : '');
    return v ? parisDateTimeToISO(v, editSealTimeDraft) : null;
  };
  useEffect(() => {
    if (!showEditSealPicker) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      // Ne pas fermer si le clic vise le calendrier (rendu en portal hors du panneau).
      if (t.closest?.('[data-datepicker-portal]')) return;
      if (editSealRef.current && !editSealRef.current.contains(t)) {
        setShowEditSealPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEditSealPicker]);
  const editorRef = useRef<DiaryEditorHandle>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMdRef = useRef<string | null>(null);

  const saveContent = useCallback(async (md: string) => {
    setSaveStatus('saving');
    try {
      await db.entries.update(entry.id, {
        contentMd: md,
        updatedAt: new Date().toISOString(),
        _dirty: true,
      });
      setSaveStatus('saved');
      resetTimerRef.current = setTimeout(() => setSaveStatus('idle'), SAVED_RESET_MS);
    } catch {
      setSaveStatus('error');
    }
  }, [entry.id]);

  const flushPending = useCallback(() => {
    if (timerRef.current && pendingMdRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      void saveContent(pendingMdRef.current);
      pendingMdRef.current = null;
    }
  }, [saveContent]);

  const handleChange = useCallback(
    (md: string) => {
      pendingMdRef.current = md;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        pendingMdRef.current = null;
        setSaveStatus('saving');
        try {
          await db.entries.update(entry.id, {
            contentMd: md,
            updatedAt: new Date().toISOString(),
            _dirty: true,
          });
          setSaveStatus('saved');
          resetTimerRef.current = setTimeout(() => setSaveStatus('idle'), SAVED_RESET_MS);
          onSave?.();
        } catch {
          setSaveStatus('error');
        }
      }, DEBOUNCE_MS);
    },
    [entry.id, onSave],
  );

  const updateMeta = useCallback(
    async (patch: Partial<Pick<LocalEntry, 'mood' | 'tagNames' | 'section' | 'timeLabel' | 'noteType' | 'customTypeId' | 'mediaMeta' | 'font' | 'fontSize' | 'links' | 'title' | 'sleepHours' | 'weather'>>) => {
      await db.entries.update(entry.id, {
        ...patch,
        updatedAt: new Date().toISOString(),
        _dirty: true,
      });
      onSave?.();
    },
    [entry.id, onSave],
  );

  // Buffered inputs — only commit on blur to avoid re-render cursor jumps
  const titleInput = useBufferedInput(entry.title, (v) => updateMeta({ title: v.trim() || null }));
  const sleepInput = useBufferedInput(entry.sleepHours, (v) => updateMeta({ sleepHours: v ? parseFloat(v) : null }));

  const isSealed = !!(entry.unlockAt && new Date(entry.unlockAt) > new Date());
  const sealMutation = trpc.entries.seal.useMutation();

  const handleSeal = useCallback(async (unlockAt: string | null, capsuleSpoiler?: string | null) => {
    const patch: Partial<LocalEntry> = {
      unlockAt,
      updatedAt: new Date().toISOString(),
      _dirty: true,
    };
    if (capsuleSpoiler !== undefined) patch.capsuleSpoiler = capsuleSpoiler;
    await db.entries.update(entry.id, patch);
    // Déclenche le sync immédiatement pour que le confident voie la capsule
    onSave?.();
    // Raccourci direct server uniquement si l'entrée existe déjà (version > 0)
    // Sinon le sync va la pousser avec unlockAt inclus
    if (entry.version > 0) {
      sealMutation.mutate({ id: entry.id, unlockAt, ...(capsuleSpoiler !== undefined ? { capsuleSpoiler } : {}) });
    }
  }, [entry.id, entry.version, sealMutation, onSave]);

  const setVisibility = trpc.entries.setVisibility.useMutation({
    onError: async (_, vars) => {
      // Rollback: revert to previous state in the cycle (PRIVATE↔SHARED_ALL↔SHARED_SPECIFIC↔PRIVATE)
      const rollback: LocalEntry['visibility'] =
        vars.visibility === 'SHARED_ALL' ? 'PRIVATE' :
        vars.visibility === 'SHARED_SPECIFIC' ? 'SHARED_ALL' :
        'SHARED_SPECIFIC'; // was going PRIVATE, rollback to SHARED_SPECIFIC
      await db.entries.update(vars.id, { visibility: rollback });
    },
  });
  const setForConfidant = trpc.entries.setForConfidant.useMutation();
  const setSecretMutation = trpc.entries.setSecret.useMutation();
  const setAdultMutation = trpc.entries.setAdult.useMutation();
  const setLinks = trpc.entries.setLinks.useMutation();
  const setReadGateMutation = trpc.entries.setReadGate.useMutation();

  // ── Verrou de lecture ─────────────────────────────────────────────────────
  const [showReadGateSetup, setShowReadGateSetup] = useState(false);
  const [readGatePromptDraft, setReadGatePromptDraft] = useState('');
  const [readGateAcceptedDraft, setReadGateAcceptedDraft] = useState<string[]>([]);
  const [readGateAcceptedInput, setReadGateAcceptedInput] = useState('');
  useBackButtonClose(showReadGateSetup, () => setShowReadGateSetup(false));

  const handleToggleReadGate = useCallback(() => {
    setReadGatePromptDraft(entry.readGatePrompt ?? '');
    setReadGateAcceptedDraft(entry.readGateAcceptedResponses ?? []);
    setReadGateAcceptedInput('');
    setShowReadGateSetup(true);
  }, [entry.readGatePrompt, entry.readGateAcceptedResponses]);

  const addAcceptedResponse = useCallback(() => {
    const val = readGateAcceptedInput.trim();
    if (!val) return;
    setReadGateAcceptedDraft((prev) => prev.includes(val) ? prev : [...prev, val]);
    setReadGateAcceptedInput('');
  }, [readGateAcceptedInput]);

  const handleReadGateSave = useCallback(async () => {
    const prompt = readGatePromptDraft.trim();
    await db.entries.update(entry.id, { readGatePrompt: prompt || null, readGateAcceptedResponses: readGateAcceptedDraft, updatedAt: new Date().toISOString(), _dirty: true });
    setReadGateMutation.mutate({ id: entry.id, readGatePrompt: prompt || null, readGateAcceptedResponses: readGateAcceptedDraft });
    setShowReadGateSetup(false);
  }, [entry.id, readGatePromptDraft, readGateAcceptedDraft, setReadGateMutation]);

  const handleReadGateRemove = useCallback(async () => {
    await db.entries.update(entry.id, { readGatePrompt: null, readGateAcceptedResponses: [], updatedAt: new Date().toISOString(), _dirty: true });
    setReadGateMutation.mutate({ id: entry.id, readGatePrompt: null, readGateAcceptedResponses: [] });
    setShowReadGateSetup(false);
  }, [entry.id, setReadGateMutation]);

  // ── Mode 18+ ─────────────────────────────────────────────────────────────
  const [adultGatePassed, setAdultGatePassed] = useState(() => adultUnlocked.has(entry.id));
  const [showAdultSetup, setShowAdultSetup] = useState(false);
  const [adultSetupQuestion, setAdultSetupQuestion] = useState('');
  const [adultSetupAnswer, setAdultSetupAnswer] = useState('');
  const [adultSetupHint1, setAdultSetupHint1] = useState('');
  const [adultSetupHint2, setAdultSetupHint2] = useState('');
  const [adultSetupHint3, setAdultSetupHint3] = useState('');
  const [adultSetupHint4, setAdultSetupHint4] = useState('');
  const [adultSetupHint5, setAdultSetupHint5] = useState('');
  // Réponse de clémence : vide = feature off. Si renseigné, après 100 essais
  // ratés uniques le confident voit son accès accordé et la réponse révélée.
  const [adultSetupMercy, setAdultSetupMercy] = useState('');
  const [adultGateAnswer, setAdultGateAnswer] = useState('');
  const [adultFailedAttempts, setAdultFailedAttempts] = useState(0);
  const [guestUnlockedMd, setGuestUnlockedMd] = useState<string | null>(null);
  const [showAttemptStats, setShowAttemptStats] = useState(false);
  // Back natif → ferme la modale de configuration 18+.
  useBackButtonClose(showAdultSetup, () => setShowAdultSetup(false));
  const [adultGateError, setAdultGateError] = useState(false);
  const unlockAdultMutation = trpc.entries.unlockAdultContent.useMutation();

  const handleToggleAdult = useCallback(async () => {
    if (entry.isAdult) {
      // Ouvrir la modale pré-remplie pour édition
      setAdultSetupQuestion(entry.adultQuestion ?? '');
      setAdultSetupAnswer('');
      const existing = entry.adultHints ?? [];
      setAdultSetupHint1(existing[0] ?? '');
      setAdultSetupHint2(existing[1] ?? '');
      setAdultSetupHint3(existing[2] ?? '');
      setAdultSetupHint4(existing[3] ?? '');
      setAdultSetupHint5(existing[4] ?? '');
      setAdultSetupMercy(entry.adultMercyAnswer ?? '');
      setShowAdultSetup(true);
    } else {
      // Ouvrir le modal de configuration vide
      setAdultSetupQuestion('');
      setAdultSetupAnswer('');
      setAdultSetupHint1('');
      setAdultSetupHint2('');
      setAdultSetupHint3('');
      setAdultSetupHint4('');
      setAdultSetupHint5('');
      setAdultSetupMercy('');
      setShowAdultSetup(true);
    }
  }, [entry.id, entry.isAdult, entry.adultQuestion, entry.adultHints, entry.adultMercyAnswer]);

  const handleAdultDisable = useCallback(async () => {
    await db.entries.update(entry.id, { isAdult: false, adultQuestion: null, adultAnswerHash: null, adultHints: [], adultMercyAnswer: null, updatedAt: new Date().toISOString(), _dirty: true });
    setAdultMutation.mutate({ id: entry.id, isAdult: false, adultQuestion: null, adultAnswerHash: null, adultHints: [], adultMercyAnswer: null });
    setShowAdultSetup(false);
  }, [entry.id, setAdultMutation]);

  const handleAdultSetupConfirm = useCallback(async () => {
    if (!adultSetupQuestion.trim()) return;
    // Si pas de nouvelle réponse et déjà 18+, on conserve le hash existant
    const hash = adultSetupAnswer.trim()
      ? await sha256(adultSetupAnswer)
      : entry.isAdult ? (entry.adultAnswerHash ?? '') : '';
    if (!hash) return;
    const hints = [adultSetupHint1, adultSetupHint2, adultSetupHint3, adultSetupHint4, adultSetupHint5].map((h) => h.trim()).filter(Boolean);
    const mercy = adultSetupMercy.trim() || null;
    await db.entries.update(entry.id, { isAdult: true, adultQuestion: adultSetupQuestion.trim(), adultAnswerHash: hash, adultHints: hints, adultMercyAnswer: mercy, updatedAt: new Date().toISOString(), _dirty: true });
    setAdultMutation.mutate({ id: entry.id, isAdult: true, adultQuestion: adultSetupQuestion.trim(), adultAnswerHash: hash, adultHints: hints, adultMercyAnswer: mercy });
    setShowAdultSetup(false);
  }, [entry.id, entry.isAdult, entry.adultAnswerHash, adultSetupQuestion, adultSetupAnswer, adultSetupHint1, adultSetupHint2, adultSetupHint3, adultSetupHint4, adultSetupHint5, adultSetupMercy, setAdultMutation]);

  const handleAdultGateSubmit = useCallback(async () => {
    const trimmed = adultGateAnswer.trim();
    if (!trimmed) return;
    if (entry.adultAnswerHash !== null) {
      // Owner : comparaison locale
      if (await checkHash(trimmed, entry.adultAnswerHash)) {
        adultUnlocked.add(entry.id);
        setAdultGatePassed(true);
        setAdultGateError(false);
        setAdultGateAnswer('');
        setAdultFailedAttempts(0);
      } else {
        setAdultGateError(true);
        setAdultFailedAttempts((n) => n + 1);
      }
    } else {
      // Guest : vérification côté serveur
      try {
        const result = await unlockAdultMutation.mutateAsync({ id: entry.id, answer: trimmed });
        if (result.ok) {
          if (result.contentMd) setGuestUnlockedMd(result.contentMd);
          adultUnlocked.add(entry.id);
          setAdultGatePassed(true);
          setAdultGateError(false);
          setAdultGateAnswer('');
          setAdultFailedAttempts(0);
        } else {
          setAdultGateError(true);
          setAdultFailedAttempts((n) => n + 1);
        }
      } catch {
        setAdultGateError(true);
        setAdultFailedAttempts((n) => n + 1);
      }
    }
  }, [entry.id, entry.adultAnswerHash, adultGateAnswer, unlockAdultMutation]);

  const handleToggleSecret = useCallback(async () => {
    const next = !entry.isSecret;
    await db.entries.update(entry.id, { isSecret: next, updatedAt: new Date().toISOString(), _dirty: true });
    setSecretMutation.mutate({ id: entry.id, isSecret: next });
  }, [entry.id, entry.isSecret, setSecretMutation]);

  const [showShareSheet, setShowShareSheet] = useState(false);

  const handleShare = useCallback(async () => {
    if (entry.visibility === 'PRIVATE') {
      // PRIVATE → SHARED_ALL
      await db.entries.update(entry.id, { visibility: 'SHARED_ALL' });
      setVisibility.mutate({ id: entry.id, visibility: 'SHARED_ALL' });
    } else if (entry.visibility === 'SHARED_ALL') {
      // SHARED_ALL → SHARED_SPECIFIC: set visibility then open picker to choose guests
      await db.entries.update(entry.id, { visibility: 'SHARED_SPECIFIC' });
      setVisibility.mutate({ id: entry.id, visibility: 'SHARED_SPECIFIC' });
      setShowShareSheet(true);
    } else {
      // SHARED_SPECIFIC → PRIVATE (1 click, cycle complet)
      await db.entries.update(entry.id, { visibility: 'PRIVATE' });
      setVisibility.mutate({ id: entry.id, visibility: 'PRIVATE' });
    }
  }, [entry.id, entry.visibility, setVisibility]);

  // Picker de délai à la publication (brouillon → publié) — null si fermé.
  const [publishPickerOpen, setPublishPickerOpen] = useState(false);

  const applyPublish = useCallback(async (hideUntilAt: string | null) => {
    await db.entries.update(entry.id, {
      isDraft: false,
      hideUntilAt,
      updatedAt: new Date().toISOString(),
      _dirty: true,
    });
    setPublishPickerOpen(false);
    onSave?.();
  }, [entry.id, onSave]);

  const handleToggleDraft = useCallback(async () => {
    if (entry.isDraft) {
      // Si le brouillon a plus de 48h, il est déjà visible côté confident
      // (cf. DRAFT_GRACE_MS serveur) — proposer un minuteur n'a aucun effet,
      // on publie directement.
      const DRAFT_GRACE_MS = 48 * 60 * 60 * 1000;
      const ageMs = Date.now() - new Date(entry.createdAt).getTime();
      if (ageMs >= DRAFT_GRACE_MS) {
        await db.entries.update(entry.id, {
          isDraft: false,
          hideUntilAt: null,
          updatedAt: new Date().toISOString(),
          _dirty: true,
        });
        onSave?.();
        return;
      }
      // Brouillon < 48h : on demande à l'owner s'il veut différer la visibilité.
      setPublishPickerOpen(true);
      return;
    }
    // publié → brouillon : retour direct, on efface aussi le minuteur
    await db.entries.update(entry.id, {
      isDraft: true,
      hideUntilAt: null,
      updatedAt: new Date().toISOString(),
      _dirty: true,
    });
    onSave?.();
  }, [entry.id, entry.isDraft, entry.createdAt, onSave]);

  const handleToggleForConfidant = useCallback(async () => {
    const next = !entry.isForConfidant;
    await db.entries.update(entry.id, { isForConfidant: next, updatedAt: new Date().toISOString(), _dirty: true });
    setForConfidant.mutate({ id: entry.id, isForConfidant: next });
  }, [entry.id, entry.isForConfidant, setForConfidant]);

  const [deleteArmed, setDeleteArmed] = useState(false);
  const deleteArmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDelete = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!deleteArmed) {
      setDeleteArmed(true);
      deleteArmTimerRef.current = setTimeout(() => setDeleteArmed(false), 3000);
      return;
    }
    if (deleteArmTimerRef.current) clearTimeout(deleteArmTimerRef.current);
    setDeleteArmed(false);
    setIsModalOpen(false);
    if (desktopPanel) onModalClose?.();
    await db.entries.update(entry.id, {
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _dirty: true,
    });
  }, [entry.id, deleteArmed]);

  const closeModal = useCallback(() => {
    flushPending();
    setIsEditing(false);
    setIsModalOpen(false);
    setModalToComments(false);
    if (desktopPanel) onModalClose?.();
    // Nettoyer l'URL si on a été ouvert via ?entryId=… — sans déclencher de rescroll
    // (replace = true → pas d'entrée historique → pas de navigation perçue).
    if (searchParams.get('entryId') === entry.id || searchParams.has('commentId')) {
      const next = new URLSearchParams(searchParams);
      next.delete('entryId');
      next.delete('commentId');
      next.delete('date'); // `date` n'arrive que via un deep-link → on nettoie tout
      setSearchParams(next, { replace: true });
    }
    // 18+ : re-verrouille à la fermeture (question demandée à nouveau à la prochaine ouverture)
    if (entry.isAdult && adultGatePassed) {
      adultUnlocked.delete(entry.id);
      setAdultGatePassed(false);
      setAdultGateAnswer('');
    }
  }, [flushPending, searchParams, setSearchParams, entry.id, entry.isAdult, adultGatePassed, desktopPanel, onModalClose]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      if (deleteArmTimerRef.current) clearTimeout(deleteArmTimerRef.current);
    };
  }, []);

  // Config résolu (type built-in OU custom) : label/couleur/glyph à AFFICHER +
  // `behavior` à BRANCHER pour les vues structurées (média, quiz, agenda…).
  const { defsById } = useNoteTypeDefs();
  const cfg = resolveNoteTypeConfig(entry, defsById);
  const behavior = cfg.behavior;
  // Champs personnalisés définis par l'owner pour ce type custom (vide pour les
  // built-in → l'éditeur/la vue ne rendent rien et les early-returns sont inchangés).
  const fieldDefs = (entry.customTypeId ? defsById[entry.customTypeId]?.fields : undefined) ?? [];
  const m = entry.mediaMeta ?? {};
  const hasMedia = behavior !== 'JOURNAL' && m.subject;
  const hasMood = !!entry.mood;
  const hasTags = (entry.tagNames ?? []).length > 0;
  // Detect first image — supports both markdown ![alt](src) and HTML <img src="...">
  // Exclut les images des blocs :::chat et :::branch (elles restent dans leur contexte)
  const effectiveMd = guestUnlockedMd ?? entry.contentMd;
  const contentExcludingBlocks = effectiveMd
    .replace(/:::chat[^\n]*\n?[\s\S]*?:::/g, '')
    .replace(/:::branch[^\n]*\n?[\s\S]*?:::/g, '');
  const firstImageMd = (contentExcludingBlocks.match(/!\[.*?\]\(([^)]+)\)/) ?? [])[1] ?? null;
  const firstImageHtml = (contentExcludingBlocks.match(/<img\s[^>]*src="([^"]*)"/) ?? [])[1] ?? null;
  // Nombre total d'images (toutes syntaxes) hors blocs chat/branch. On n'extrait
  // la 1re image en « hero » au-dessus du contenu QUE s'il n'y en a qu'une : sinon
  // on isolerait la 1re image au-dessus du carrousel (cf. note-galerie). Avec
  // plusieurs images, on les laisse toutes au contenu → galerie complète.
  const totalImages = (contentExcludingBlocks.match(/!\[.*?\]\([^)]+\)|<img\s[^>]*src="[^"]*"|:::img\s+"/gi) ?? []).length;
  const firstImage = totalImages <= 1 ? (firstImageMd ?? firstImageHtml) : null;
  // Strip only the first image occurrence from the content passed to AnnotatedReader
  // — uniquement les images hors :::chat et :::branch
  const contentWithoutImages = firstImage
    ? (() => {
        // Trouve la position de la 1re image hors blocs dans le markdown original
        const excludedRanges: Array<[number, number]> = [];
        const blockRe = /:::(?:chat|branch)[^\n]*\n?[\s\S]*?:::/g;
        let m: RegExpExecArray | null;
        while ((m = blockRe.exec(effectiveMd)) !== null) excludedRanges.push([m.index, m.index + m[0].length]);
        const inChat = (idx: number) => excludedRanges.some(([s, e]) => idx >= s && idx < e);
        const mdRe = /!\[.*?\]\([^)]+\)/g;
        const htmlRe = /<img\s[^>]*src="[^"]*"[^>]*\/?>/gi;
        let target: { index: number; length: number } | null = null;
        for (const re of [mdRe, htmlRe]) {
          let mm: RegExpExecArray | null;
          while ((mm = re.exec(effectiveMd)) !== null) {
            if (!inChat(mm.index)) { target = { index: mm.index, length: mm[0].length }; break; }
          }
          if (target) break;
        }
        return target ? effectiveMd.slice(0, target.index) + effectiveMd.slice(target.index + target.length) : effectiveMd;
      })().trim()
    : entry.contentMd;

  const timeDisplay = entry.timeLabel
    ? entry.timeLabel
    : entry.section
      ? { MORNING: 'Matin', LATE_MORNING: 'Fin de matinée', NOON: 'Midi', AFTERNOON: 'Après-midi', LATE_AFTERNOON: "Fin d'après-midi", EARLY_EVENING: 'Début de soirée', EVENING: 'Soir', NIGHT: 'Nuit', FREE: 'Libre' }[entry.section] ?? null
      : null;

  // ── Card preview (always rendered) ────────────────────────────────────────

  const card = (
    <EntryCardView
      entry={entry}
      onOpen={() => {
        if (onDesktopClick && window.innerWidth >= 1024) {
          onDesktopClick();
        } else {
          setIsModalOpen(true);
        }
      }}
      onOpenComments={() => {
        if (onDesktopClick && window.innerWidth >= 1024) {
          onDesktopClick({ comments: true });
        } else {
          setIsEditing(false);
          setModalToComments(true);
          setIsModalOpen(true);
        }
      }}
      onDelete={handleDelete}
      onShare={handleShare}
      onShowShareSheet={() => setShowShareSheet(true)}
      onToggleDraft={handleToggleDraft}
      onToggleForConfidant={handleToggleForConfidant}
      onToggleSecret={handleToggleSecret}
      onToggleAdult={handleToggleAdult}
      onToggleReadGate={handleToggleReadGate}
      onSeal={handleSeal}
      isReadByConfidant={isReadByConfidant}
      deleteArmed={deleteArmed}
      onTagClick={onTagClick}
      onAddTag={(tag) => {
        // Ajoute le tag à la liste, dédoublonne, persiste via updateMeta.
        const next = [...new Set([...(entry.tagNames ?? []), tag])];
        void updateMeta({ tagNames: next });
      }}
      onMoodChange={(v) => void updateMeta({ mood: v })}
      adultGatePassed={adultGatePassed}
      compact={compact}
      compactMode={compactMode}
      isActivePanel={isActivePanel}
    />
  );

  // ── Modal header ───────────────────────────────────────────────────────────

  const readHeader = (
    <>
      {/* ← Fermer */}
      <button
        type="button"
        onClick={closeModal}
        aria-label="Fermer"
        className="p-2 -ml-1 rounded-xl text-text-muted/60 hover:text-text-primary hover:bg-text-muted/10 transition-colors shrink-0"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </button>
      {/* Type + titre */}
      <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
        <span className="shrink-0 inline-flex items-center gap-1 text-xs font-mono font-medium" style={{ color: cfg.color }}>
          <cfg.Glyph className="w-3 h-3" /> {cfg.label}
        </span>
        {entry.title && (
          <span className="text-sm font-medium text-text-primary truncate">{entry.title}</span>
        )}
      </div>
      {/* Copier le lien */}
      <button
        type="button"
        title={linkCopied ? 'Lien copié !' : 'Copier le lien'}
        onClick={() => {
          const url = `${window.location.origin}/?entryId=${entry.id}`;
          navigator.clipboard.writeText(url).then(() => {
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2000);
          });
        }}
        className="p-2 rounded-xl text-text-muted/60 hover:text-text-primary hover:bg-text-muted/10 transition-colors shrink-0"
      >
        {linkCopied ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-success, #4ade80)' }}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        )}
      </button>
      {/* Modifier */}
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        title="Modifier"
        className="p-2 rounded-xl text-text-muted/60 hover:text-text-primary hover:bg-text-muted/10 transition-colors shrink-0"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
        </svg>
      </button>
    </>
  );


  const editHeader = (
    <div className="w-full flex flex-col gap-0">
      {/* Rangée 1 : ← | type picker (scroll) | ··· (delete) */}
      <div className="flex items-center gap-2 min-h-[36px]">
        {/* ← Retour lecture */}
        <button
          type="button"
          onClick={() => { flushPending(); setIsEditing(false); }}
          aria-label="Retour lecture"
          className="p-1.5 -ml-1 rounded-xl text-text-muted/60 hover:text-text-primary hover:bg-text-muted/10 transition-colors shrink-0"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        {/* Type picker — scrollable */}
        <div className="flex-1 min-w-0 overflow-x-auto hide-scrollbar">
          <NoteTypePicker
            value={entry.noteType}
            customTypeId={entry.customTypeId}
            onChange={(sel) => updateMeta({ noteType: sel.noteType, customTypeId: sel.customTypeId, mediaMeta: sel.behavior === 'JOURNAL' ? null : entry.mediaMeta })}
            expanded={desktopPanel}
          />
        </div>
        {/* Mobile / modale : kebab menu */}
        {!desktopPanel && <div className="relative shrink-0" ref={editMenuRef}>
          <button
            type="button"
            onClick={() => setEditMenuOpen((v) => !v)}
            aria-label="Options"
            className="p-1.5 rounded-xl text-text-muted/50 hover:text-text-primary hover:bg-text-muted/10 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
            </svg>
          </button>
          {editMenuOpen && (
            <div
              className="absolute right-0 top-9 z-30 bg-bg-elevated border border-text-muted/15 rounded-2xl shadow-2xl py-2 min-w-[240px]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Capsule */}
              <button type="button" onClick={toggleEditSeal}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${isSealed ? 'text-sealed' : 'text-text-muted hover:text-text-primary hover:bg-text-muted/5'}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                {isSealed ? 'Modifier la capsule' : 'Sceller la note'}
              </button>
              {showEditSealPicker && (
                <div className="px-4 pb-3 flex flex-col gap-2 border-t border-text-muted/10 mt-1 pt-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1.5">
                    <DatePicker
                      value={editSealDraft || (entry.unlockAt ? parisDateOf(entry.unlockAt) : '')}
                      onChange={setEditSealDraft}
                      min={parisDateOf(new Date().toISOString())}
                      placeholder="Date…"
                      portal
                      className="flex-1 min-w-0"
                    />
                    <TimeInput value={editSealTimeDraft} onChange={setEditSealTimeDraft} placeholder="00:00" className="!w-[68px] shrink-0" />
                  </div>
                  <p className="text-[11px] text-text-muted/50 -mt-1">Heure de Paris. Sans heure : 00:00 le jour choisi.</p>
                  <input type="text"
                    value={editSpoilerDraft}
                    onChange={(e) => setEditSpoilerDraft(e.target.value)}
                    placeholder="Spoiler (optionnel)…"
                    maxLength={500}
                    className="w-full bg-bg-primary border border-text-muted/15 rounded-lg px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent/40"
                  />
                  <button type="button"
                    disabled={!editSealDraft && !isSealed}
                    onClick={() => {
                      const iso = editSealIso();
                      if (iso) { void handleSeal(iso, editSpoilerDraft.trim() || null); setShowEditSealPicker(false); setEditMenuOpen(false); setEditSealDraft(''); setEditSealTimeDraft(''); }
                    }}
                    className="w-full py-1.5 rounded-lg text-xs font-medium bg-sealed/15 text-sealed hover:bg-sealed/25 disabled:opacity-40 transition-colors">
                    {isSealed ? 'Mettre à jour' : 'Sceller'}
                  </button>
                  {isSealed && (
                    <button type="button"
                      onClick={() => { void handleSeal(null); setShowEditSealPicker(false); setEditMenuOpen(false); setEditSealDraft(''); setEditSealTimeDraft(''); }}
                      className="w-full py-1.5 rounded-lg text-xs font-medium text-text-muted hover:bg-text-muted/10 transition-colors">
                      Retirer la capsule
                    </button>
                  )}
                </div>
              )}
              <div className="border-t border-text-muted/10 mt-1 pt-1">
                <button type="button" onClick={handleDelete}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${deleteArmed ? 'text-danger bg-danger/5' : 'text-text-muted/60 hover:text-danger hover:bg-text-muted/5'}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                  {deleteArmed ? 'Confirmer la suppression' : 'Supprimer'}
                </button>
              </div>
            </div>
          )}
        </div>}
      </div>

      {/* Rangée 2 : icônes d'état des options + save indicator + œil */}
      <div className="flex items-center gap-0.5 pt-2 border-t border-text-muted/10 -mx-4 px-3">
        {/* Brouillon */}
        <button type="button" onClick={handleToggleDraft}
          title={entry.isDraft ? 'Brouillon — terminer' : 'Marquer brouillon'}
          className={`p-1.5 rounded-lg transition-all ${entry.isDraft ? 'text-warning bg-warning/10' : 'text-text-muted/35 hover:text-text-muted hover:bg-text-muted/8'}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
          </svg>
        </button>
        {/* Confident */}
        <button type="button" onClick={handleToggleForConfidant}
          title={entry.isForConfidant ? 'Pour le confident — retirer' : 'Pour le confident'}
          className={`p-1.5 rounded-lg transition-all ${entry.isForConfidant ? 'text-accent bg-accent/10' : 'text-text-muted/35 hover:text-text-muted hover:bg-text-muted/8'}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill={entry.isForConfidant ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
        {/* Secret */}
        <button type="button" onClick={handleToggleSecret}
          title={entry.isSecret ? 'Secret — désactiver' : 'Mode secret'}
          className={`p-1.5 rounded-lg transition-all ${entry.isSecret ? 'text-secret bg-secret/10' : 'text-text-muted/35 hover:text-text-muted hover:bg-text-muted/8'}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </button>
        {/* 18+ */}
        <button type="button" onClick={handleToggleAdult}
          title={entry.isAdult ? '18+ — désactiver' : 'Contenu 18+'}
          className={`p-1.5 rounded-lg transition-all inline-flex items-center justify-center ${entry.isAdult ? 'bg-adult/10' : 'opacity-30 hover:opacity-80 grayscale hover:grayscale-0'}`}>
          <span className="text-sm leading-none" style={{ fontSize: 14 }}>🔞</span>
        </button>
        {/* Verrou de lecture */}
        <button type="button" onClick={handleToggleReadGate}
          title={entry.readGatePrompt ? 'Verrou de lecture — modifier' : 'Verrou de lecture'}
          className={`p-1.5 rounded-lg transition-all inline-flex items-center justify-center ${entry.readGatePrompt ? 'text-accent bg-accent/10' : 'text-text-muted/45 hover:text-text-muted hover:bg-text-muted/8'}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            <circle cx="12" cy="16" r="1" fill="currentColor" />
          </svg>
        </button>
        {/* Desktop : capsule (même famille que secret/18+/…) */}
        {desktopPanel && (
          <div className="relative" ref={editSealRef}>
            <button
              type="button"
              onClick={toggleEditSeal}
              title={isSealed ? 'Modifier la capsule' : 'Sceller la note'}
              className={`p-1.5 rounded-lg transition-colors ${showEditSealPicker || isSealed ? 'text-sealed bg-sealed/10' : 'text-text-muted/35 hover:text-text-muted hover:bg-text-muted/8'}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
            </button>
            {showEditSealPicker && (
              <div ref={editSealPanel.panelRef} style={editSealPanel.panelStyle} className="absolute left-0 top-full mt-1 z-30 bg-bg-elevated border border-text-muted/15 rounded-2xl shadow-2xl py-3 px-4 min-w-[240px] flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                <p className="text-xs font-medium text-text-muted/60 uppercase tracking-widest">Capsule temporelle</p>
                <div className="flex items-center gap-1.5">
                  <DatePicker
                    value={editSealDraft || (entry.unlockAt ? parisDateOf(entry.unlockAt) : '')}
                    onChange={setEditSealDraft}
                    min={parisDateOf(new Date().toISOString())}
                    placeholder="Date…"
                    portal
                    className="flex-1 min-w-0"
                  />
                  <TimeInput value={editSealTimeDraft} onChange={setEditSealTimeDraft} placeholder="00:00" className="!w-[68px] shrink-0" />
                </div>
                <p className="text-[11px] text-text-muted/50 -mt-1">Heure de Paris. Sans heure : 00:00 le jour choisi.</p>
                <input type="text"
                  value={editSpoilerDraft}
                  onChange={(e) => setEditSpoilerDraft(e.target.value)}
                  placeholder="Spoiler (optionnel)…"
                  maxLength={500}
                  className="w-full bg-bg-primary border border-text-muted/15 rounded-lg px-2 py-1.5 text-sm text-text-primary outline-none focus:border-amber-400/50"
                />
                <button type="button"
                  disabled={!editSealDraft && !isSealed}
                  onClick={() => {
                    const iso = editSealIso();
                    if (iso) { void handleSeal(iso, editSpoilerDraft.trim() || null); setShowEditSealPicker(false); setEditSealDraft(''); setEditSealTimeDraft(''); }
                  }}
                  className="w-full py-1.5 rounded-lg text-xs font-medium bg-sealed/15 text-sealed hover:bg-sealed/25 disabled:opacity-40 transition-colors">
                  {isSealed ? 'Mettre à jour' : 'Sceller'}
                </button>
                {isSealed && (
                  <button type="button"
                    onClick={() => { void handleSeal(null); setShowEditSealPicker(false); setEditSealDraft(''); setEditSealTimeDraft(''); }}
                    className="w-full py-1.5 rounded-lg text-xs font-medium text-text-muted hover:bg-text-muted/10 transition-colors">
                    Retirer la capsule
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        <div className="flex-1" />
        {/* Indicateur d'enregistrement — emplacement stable (ne fait plus sauter
            la barre de formatage). Largeur fixe → pas de décalage. */}
        <SaveDot status={saveStatus} />
        {/* Desktop : supprimer (tout à droite) */}
        {desktopPanel && (
          <button
            type="button"
            onClick={handleDelete}
            title={deleteArmed ? 'Confirmer la suppression' : 'Supprimer'}
            className={`p-1.5 rounded-lg transition-colors ${deleteArmed ? 'text-danger bg-danger/10' : 'text-text-muted/35 hover:text-danger hover:bg-danger/10'}`}
          >
            {deleteArmed
              ? <span className="text-[11px] font-medium px-0.5">Supprimer ?</span>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
            }
          </button>
        )}
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* In desktop panel mode, skip the card preview entirely */}
      {!desktopPanel && (!selectable ? card : (
        <div className="relative">
          {card}
          <div onClick={onSelect} className={`absolute inset-0 rounded-2xl cursor-pointer transition-colors ${selected ? 'bg-accent/8 ring-2 ring-accent/50' : 'hover:bg-text-muted/5'}`} />
          <div onClick={onSelect} className={`absolute rounded-full border-2 flex items-center justify-center cursor-pointer transition-all shadow-sm ${compact ? 'top-1.5 left-1.5 w-4 h-4' : 'top-3 left-3 w-5 h-5'} ${selected ? 'bg-accent border-accent' : 'bg-bg-elevated border-text-muted/30'}`}>
            {selected && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
        </div>
      ))}

      <PublishDelayPicker
        open={publishPickerOpen}
        onCancel={() => setPublishPickerOpen(false)}
        onConfirm={(hideUntilAt) => { void applyPublish(hideUntilAt); }}
      />

      {/* Adult setup modal — portal pour échapper aux stacking contexts parents. */}
      {showAdultSetup && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setShowAdultSetup(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-bg-elevated rounded-2xl shadow-2xl p-6 w-full max-w-sm max-h-[90dvh] overflow-y-auto scrollbar-soft flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-adult/10 flex items-center justify-center text-xl">🔞</div>
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  {entry.isAdult ? 'Modifier le mode 18+' : 'Activer le mode 18+'}
                </h3>
                <p className="text-xs text-text-muted">
                  {entry.isAdult ? 'Modifie la question, la réponse ou les indices.' : 'Définis une question secrète pour accéder à cette note.'}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-text-muted uppercase tracking-wide">Question</label>
              <input
                type="text"
                value={adultSetupQuestion}
                onChange={(e) => setAdultSetupQuestion(e.target.value)}
                placeholder="Ex : Quel est le prénom de mon premier amour ?"
                autoFocus
                className="w-full bg-bg-primary/80 border border-text-muted/15 rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/55 outline-none focus:border-orange-400/50 transition-colors"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-text-muted uppercase tracking-wide">Réponse secrète</label>
              <input
                type="text"
                value={adultSetupAnswer}
                onChange={(e) => setAdultSetupAnswer(e.target.value)}
                placeholder={entry.isAdult ? 'Nouvelle réponse (laisser vide pour conserver)' : 'Ta réponse (insensible à la casse)…'}
                className="w-full bg-bg-primary/80 border border-text-muted/15 rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/55 outline-none focus:border-orange-400/50 transition-colors"
              />
              <p className="text-[11px] text-text-muted/50">La réponse est hashée — elle n'est jamais stockée en clair.</p>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-text-muted uppercase tracking-wide">Indices (optionnels)</label>
              {([
                [adultSetupHint1, setAdultSetupHint1, 'Indice après 10 échecs', false],
                [adultSetupHint2, setAdultSetupHint2, 'Indice après 20 échecs', false],
                [adultSetupHint3, setAdultSetupHint3, 'Indice après 30 échecs', false],
                [adultSetupHint4, setAdultSetupHint4, 'Indice après 40 échecs', false],
                [adultSetupHint5, setAdultSetupHint5, 'Indice après 50 échecs', false],
              ] as [string, (v: string) => void, string, boolean][]).map(([val, set, ph, last]) => (
                <input
                  key={ph}
                  type="text"
                  value={val}
                  onChange={(e) => set(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && last) void handleAdultSetupConfirm(); }}
                  placeholder={ph}
                  className="w-full bg-bg-primary/80 border border-text-muted/15 rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/45 outline-none focus:border-orange-400/50 transition-colors"
                />
              ))}
            </div>
            {/* Mercy answer — anti-frustration : si renseigné, accord automatique +
                révélation de la réponse au confident après 100 essais ratés uniques. */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-muted uppercase tracking-wide">Réponse de clémence (optionnel)</label>
              <input
                type="text"
                value={adultSetupMercy}
                onChange={(e) => setAdultSetupMercy(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleAdultSetupConfirm(); }}
                placeholder="Ex: « Tu es ma personne préférée »"
                className="w-full bg-bg-primary/80 border border-text-muted/15 rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/45 outline-none focus:border-orange-400/50 transition-colors"
              />
              <p className="text-[11px] text-text-muted/60 leading-relaxed">
                Après <strong>100 essais</strong> ratés uniques, le confident voit son accès accordé et cette réponse lui est révélée. Laisse vide pour désactiver.
              </p>
            </div>
            <div className="flex gap-2">
              {entry.isAdult && (
                <button
                  type="button"
                  onClick={() => void handleAdultDisable()}
                  className="py-2.5 px-3 rounded-xl text-sm font-medium text-danger/70 hover:bg-danger/10 hover:text-danger transition-colors"
                >
                  Désactiver
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowAdultSetup(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-text-muted hover:bg-text-muted/10 transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void handleAdultSetupConfirm()}
                disabled={!adultSetupQuestion.trim() || (!entry.isAdult && !adultSetupAnswer.trim())}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-adult/15 text-adult hover:bg-adult/25 disabled:opacity-40 transition-colors"
              >
                {entry.isAdult ? 'Enregistrer' : 'Activer'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Read gate setup modal — portal vers document.body pour échapper aux
          stacking contexts des parents (sticky bar `z-[10]` de la page Home
          notamment, qui s'affichait par-dessus le bas de la modale). */}
      {showReadGateSetup && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowReadGateSetup(false)}>
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto scrollbar-soft bg-bg-elevated rounded-2xl shadow-2xl p-5 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /><circle cx="12" cy="16" r="1" fill="currentColor" />
              </svg>
              <h3 className="font-semibold text-text-primary">Verrou de lecture</h3>
            </div>
            <p className="text-xs text-text-muted/70">Le confident devra lire ta condition et envoyer une réponse avant d'accéder au contenu.</p>

            {/* Condition text */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-muted/70">Ta condition</label>
              <textarea
                value={readGatePromptDraft}
                onChange={(e) => setReadGatePromptDraft(e.target.value)}
                placeholder="Ex : Tu peux lire seulement si tu promets de ne pas t'énerver…"
                maxLength={1000}
                rows={3}
                className="w-full bg-bg-primary border border-text-muted/15 rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/35 outline-none focus:border-accent/40 resize-none"
              />
            </div>

            {/* Accepted responses list */}
            <div className="flex flex-col gap-2">
              <div>
                <p className="text-xs font-medium text-text-muted/70 mb-0.5">Réponses acceptées automatiquement</p>
                <p className="text-[11px] text-text-muted/50">Si la réponse correspond à l'une de ces valeurs, l'accès est accordé immédiatement. Sinon tu reçois une notification pour valider manuellement.</p>
              </div>
              {/* Tags */}
              {readGateAcceptedDraft.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {readGateAcceptedDraft.map((r) => (
                    <span key={r} className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 rounded-full text-xs bg-accent/12 text-accent border border-accent/25">
                      {r}
                      <button
                        type="button"
                        onClick={() => setReadGateAcceptedDraft((prev) => prev.filter((x) => x !== r))}
                        className="w-3.5 h-3.5 rounded-full hover:bg-accent/20 flex items-center justify-center transition-colors"
                      >
                        <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                          <line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {/* Input to add */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={readGateAcceptedInput}
                  onChange={(e) => setReadGateAcceptedInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAcceptedResponse(); } }}
                  placeholder='Ex : "promis", "je promets"…'
                  maxLength={500}
                  className="flex-1 bg-bg-primary border border-text-muted/15 rounded-xl px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted/35 outline-none focus:border-accent/40"
                />
                <button
                  type="button"
                  onClick={addAcceptedResponse}
                  disabled={!readGateAcceptedInput.trim()}
                  className="px-3 py-1.5 rounded-xl text-sm font-medium bg-accent/12 text-accent hover:bg-accent/20 disabled:opacity-40 transition-colors"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              {entry.readGatePrompt && (
                <button type="button" onClick={() => void handleReadGateRemove()}
                  className="py-2 px-3 rounded-xl text-xs text-danger/70 hover:text-danger border border-danger/20 hover:border-danger/40 transition-colors">
                  Supprimer
                </button>
              )}
              <button type="button" onClick={() => setShowReadGateSetup(false)}
                className="flex-1 py-2 rounded-xl text-sm text-text-muted border border-text-muted/15 hover:border-text-muted/30 transition-colors">
                Annuler
              </button>
              <button type="button" onClick={() => void handleReadGateSave()} disabled={!readGatePromptDraft.trim()}
                className="flex-1 py-2 rounded-xl text-sm font-medium bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-40 transition-colors">
                Enregistrer
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Share specific sheet */}
      {showShareSheet && (
        <ShareSpecificSheet
          entryId={entry.id}
          onClose={() => setShowShareSheet(false)}
          onMakePrivate={async () => {
            setShowShareSheet(false);
            await db.entries.update(entry.id, { visibility: 'PRIVATE' });
            setVisibility.mutate({ id: entry.id, visibility: 'PRIVATE' });
          }}
        />
      )}

      {/* Modal overlay / desktop panel */}
      {isModalOpen && (
        <NoteModal onClose={closeModal} header={isEditing ? editHeader : readHeader} fullscreen inline={desktopPanel}>
          {isSealed && !isEditing ? (
            // ── Sealed capsule view ───────────────────────────────────────────
            <div className="px-6 pt-8 pb-12 flex flex-col items-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-sealed/10 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-sealed">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div className="text-center">
                <h2 className="text-lg font-semibold text-text-primary mb-1">
                  {entry.title ?? 'Capsule temporelle'}
                </h2>
                <p className="text-sm text-text-muted">
                  S'ouvre le {new Date(entry.unlockAt!).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                <p className="text-xs text-text-muted/50 mt-1">{formatCountdown(entry.unlockAt!)}</p>
              </div>
              {entry.capsuleSpoiler && (
                <div className="w-full max-w-md rounded-2xl border border-sealed/30 bg-sealed/10 px-4 py-3">
                  <p className="text-sm text-sealed italic leading-relaxed text-center">"{entry.capsuleSpoiler}"</p>
                </div>
              )}
              <div className="w-full max-w-xs rounded-2xl border border-sealed/20 bg-sealed/5 px-4 py-3 text-center">
                <p className="text-xs text-sealed/70 leading-relaxed">
                  Cette note est scellée. Son contenu sera révélé à la date d'ouverture.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleSeal(null)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-text-muted hover:text-text-primary hover:bg-text-muted/10 transition-colors border border-text-muted/15 hover:border-text-muted/30"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                </svg>
                Ouvrir la capsule
              </button>

              {/* Réactions + commentaires sur la capsule, sans révéler le contenu */}
              <SealedCapsuleInteractions entry={entry} />
            </div>
          ) : entry.isAdult && !adultGatePassed && !isEditing ? (
            // ── Adult gate view ───────────────────────────────────────────────
            <div className="px-6 pt-10 pb-14 flex flex-col items-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-adult/10 flex items-center justify-center">
                <span className="text-3xl">🔞</span>
              </div>
              <div className="text-center">
                <h2 className="text-lg font-semibold text-text-primary mb-1">Contenu sensible</h2>
                <p className="text-sm text-text-muted">Réponds à la question pour accéder à cette note.</p>
              </div>
              {entry.adultQuestion && (
                <div className="w-full max-w-sm rounded-2xl border border-adult/20 bg-adult/5 px-4 py-3 text-center">
                  <p className="text-sm text-orange-300 font-medium">{entry.adultQuestion}</p>
                </div>
              )}
              <div className="w-full max-w-sm flex flex-col gap-2">
                <input
                  type="text"
                  value={adultGateAnswer}
                  onChange={(e) => { setAdultGateAnswer(e.target.value); setAdultGateError(false); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleAdultGateSubmit(); }}
                  placeholder="Ta réponse…"
                  autoFocus
                  className={`w-full bg-bg-primary/80 border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted/55 outline-none transition-colors ${adultGateError ? 'border-danger/50 focus:border-danger' : 'border-text-muted/15 focus:border-orange-400/50'}`}
                />
                {adultGateError && (
                  <p className="text-xs text-danger text-center">Réponse incorrecte, réessaie.</p>
                )}

                {entry.adultHints && entry.adultHints.length > 0 && adultFailedAttempts > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {adultFailedAttempts >= 10 && entry.adultHints[0] && (
                      <div className="rounded-xl border border-adult/20 bg-adult/5 px-3 py-2 text-center">
                        <p className="text-xs text-text-muted mb-0.5">Indice 1</p>
                        <p className="text-sm text-orange-300">{entry.adultHints[0]}</p>
                      </div>
                    )}
                    {adultFailedAttempts >= 20 && entry.adultHints[1] && (
                      <div className="rounded-xl border border-adult/20 bg-adult/5 px-3 py-2 text-center">
                        <p className="text-xs text-text-muted mb-0.5">Indice 2</p>
                        <p className="text-sm text-orange-300">{entry.adultHints[1]}</p>
                      </div>
                    )}
                    {adultFailedAttempts >= 30 && entry.adultHints[2] && (
                      <div className="rounded-xl border border-adult/20 bg-adult/5 px-3 py-2 text-center">
                        <p className="text-xs text-text-muted mb-0.5">Indice 3</p>
                        <p className="text-sm text-orange-300">{entry.adultHints[2]}</p>
                      </div>
                    )}
                    {adultFailedAttempts >= 40 && entry.adultHints[3] && (
                      <div className="rounded-xl border border-adult/20 bg-adult/5 px-3 py-2 text-center">
                        <p className="text-xs text-text-muted mb-0.5">Indice 4</p>
                        <p className="text-sm text-orange-300">{entry.adultHints[3]}</p>
                      </div>
                    )}
                    {adultFailedAttempts >= 50 && entry.adultHints[4] && (
                      <div className="rounded-xl border border-adult/20 bg-adult/5 px-3 py-2 text-center">
                        <p className="text-xs text-text-muted mb-0.5">Indice 5</p>
                        <p className="text-sm text-orange-300">{entry.adultHints[4]}</p>
                      </div>
                    )}
                    {adultFailedAttempts < 10 && (
                      <p className="text-xs text-text-muted/50 text-center">
                        Indice 1 dans {10 - adultFailedAttempts} essai{10 - adultFailedAttempts > 1 ? 's' : ''}
                      </p>
                    )}
                    {adultFailedAttempts >= 10 && adultFailedAttempts < 20 && entry.adultHints[1] && (
                      <p className="text-xs text-text-muted/50 text-center">
                        Indice 2 dans {20 - adultFailedAttempts} essai{20 - adultFailedAttempts > 1 ? 's' : ''}
                      </p>
                    )}
                    {adultFailedAttempts >= 20 && adultFailedAttempts < 30 && entry.adultHints[2] && (
                      <p className="text-xs text-text-muted/50 text-center">
                        Indice 3 dans {30 - adultFailedAttempts} essai{30 - adultFailedAttempts > 1 ? 's' : ''}
                      </p>
                    )}
                    {adultFailedAttempts >= 30 && adultFailedAttempts < 40 && entry.adultHints[3] && (
                      <p className="text-xs text-text-muted/50 text-center">
                        Indice 4 dans {40 - adultFailedAttempts} essai{40 - adultFailedAttempts > 1 ? 's' : ''}
                      </p>
                    )}
                    {adultFailedAttempts >= 40 && adultFailedAttempts < 50 && entry.adultHints[4] && (
                      <p className="text-xs text-text-muted/50 text-center">
                        Indice 5 dans {50 - adultFailedAttempts} essai{50 - adultFailedAttempts > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => void handleAdultGateSubmit()}
                  disabled={!adultGateAnswer.trim()}
                  className="w-full py-2.5 rounded-xl text-sm font-medium bg-adult/15 text-adult hover:bg-adult/25 disabled:opacity-40 transition-colors"
                >
                  Vérifier
                </button>
                {entry.adultAnswerHash !== null && (
                  <AdultAttemptStats entryId={entry.id} show={showAttemptStats} onToggle={() => setShowAttemptStats((v) => !v)} />
                )}
                <button
                  type="button"
                  onClick={() => { setIsEditing(true); }}
                  className="text-xs text-text-muted/50 hover:text-text-muted transition-colors text-center mt-1"
                >
                  Modifier la note
                </button>
              </div>
            </div>
          ) : !isEditing ? (
            // ── Read mode ────────────────────────────────────────────────────
            <div className={`px-6 pt-6 pb-0 flex-1 flex flex-col ${desktopPanel ? '' : 'max-w-2xl mx-auto w-full'}`}>
              {/* Meta kicker — date + badges */}
              <div className="flex items-center gap-2 flex-wrap mb-1 text-text-muted/60">
                <span className="text-xs">
                  {new Date(entry.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  {timeDisplay && ` · ${timeDisplay}`}
                </span>
                {entry.isDraft && <DraftBadge createdAt={entry.createdAt} />}
                {entry.isForConfidant && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent font-medium">Confident</span>}
                {entry.isSecret && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-secret/15 text-secret font-medium">Secret</span>}
                {entry.isAdult && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-adult/15 text-adult font-medium">🔞 18+</span>}
                {entry.weather && <span className="text-[11px]">{entry.weather}</span>}
                {entry.sleepHours != null && <span className="text-[11px]">🌙 {entry.sleepHours}h</span>}
              </div>
              {entry.title && <h1 className="text-2xl font-serif font-semibold text-text-primary mb-5 leading-snug">{entry.title}</h1>}
              {!entry.title && <div className="mb-4" />}
              {/* Media meta (full) — caché pour les playlists MUSIC, MusicNotePlayer rend son propre en-tête */}
              {hasMedia && !(behavior === 'MUSIC' && isPlaylist(m)) && (
                <div className="mb-4 flex gap-3">
                  {m.coverUrl && (
                    <img src={m.coverUrl} alt="couverture" className="h-24 w-auto rounded-lg object-cover shrink-0 shadow-sm" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-text-primary font-medium">{m.subject}</p>
                    {behavior === 'MUSIC' && m.trackTitle && (
                      <p className="text-text-muted text-sm">{m.trackTitle}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {m.creator && <span className="text-sm text-text-muted">{m.creator}</span>}
                      {behavior === 'BOOK' && m.volume && (
                        <span className="text-xs text-text-muted">
                          T.{m.volume}{m.totalVolumes ? `/${m.totalVolumes}` : ''}
                        </span>
                      )}
                      {behavior === 'BOOK' && m.progressCurrent && m.progressTotal && (
                        <span className="text-xs text-text-muted">p. {m.progressCurrent}/{m.progressTotal}</span>
                      )}
                      {behavior === 'SERIES' && (
                        <span className="text-xs text-text-muted">
                          {m.season ? `S${m.season}` : ''}{m.progressCurrent ? ` E${m.progressCurrent}` : ''}{m.progressTotal ? `/${m.progressTotal}` : ''}
                        </span>
                      )}
                      {m.rating && (
                        <span style={{ color: cfg.color }}>{'★'.repeat(m.rating)}{'☆'.repeat(5 - m.rating)}</span>
                      )}
                      {m.status && (
                        <span className="text-sm text-text-muted/60 italic">
                          {{ wishlist: 'Souhaité', owned: 'Possédé', ongoing: 'En cours', finished: 'Terminé', abandoned: 'Abandonné' }[m.status]}
                        </span>
                      )}
                    </div>
                    {(behavior === 'BOOK' || behavior === 'SERIES') && m.progressCurrent && m.progressTotal && (
                      <div className="mt-2 h-1 rounded-full bg-text-muted/10 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round((m.progressCurrent / m.progressTotal) * 100))}%`, backgroundColor: cfg.color, opacity: 0.6 }} />
                      </div>
                    )}
                    {m.description && (
                      <p className="text-xs text-text-muted/70 italic leading-relaxed mt-2">{m.description}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Music player — gère mono-track et playlist */}
              {behavior === 'MUSIC' && (
                <div className="mb-4"><MusicNotePlayer meta={entry.mediaMeta} /></div>
              )}

              {/* Quizz — l'owner peut le faire lui-même + voir les réponses des confidents */}
              {behavior === 'QUIZZ' && (entry.mediaMeta?.quizQuestions?.length ?? 0) > 0 && (
                <div className="mb-4 flex flex-col gap-4">
                  <QuizTaker entryId={entry.id} questions={entry.mediaMeta!.quizQuestions!} shuffleQuestions={entry.mediaMeta?.quizShuffleQuestions} shuffleOptions={entry.mediaMeta?.quizShuffleOptions} />
                  <QuizResultsPanel entryId={entry.id} questions={entry.mediaMeta!.quizQuestions!} />
                </div>
              )}

              {/* Agenda — événements (liste + calendrier) */}
              {behavior === 'AGENDA' && (
                <div className="mb-4"><AgendaView meta={entry.mediaMeta} /></div>
              )}

              {/* Finance — budget (totaux + solde + catégories) */}
              {behavior === 'FINANCE' && (
                <div className="mb-4"><BudgetView meta={entry.mediaMeta} /></div>
              )}

              {/* Champs personnalisés (types de note custom) — lecture */}
              {hasFilledCustomFields(fieldDefs, entry.mediaMeta?.customFields as CustomFieldValues) && (
                <CustomFieldsView fields={fieldDefs} values={(entry.mediaMeta?.customFields ?? {}) as CustomFieldValues} />
              )}

              {/* Shopping links */}
              {behavior === 'SHOPPING' && (entry.links ?? []).length > 0 && (
                <div className="flex flex-col gap-2 mb-4">
                  {(entry.links ?? []).map((link) => (
                    <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-text-muted/10 bg-bg-primary/40 px-3 py-2.5 hover:border-text-muted/25 transition-colors group/link">
                      {link.image && <img src={link.image} alt="" className="h-12 w-12 rounded-lg object-cover shrink-0 bg-text-muted/10" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary font-medium truncate group-hover/link:text-accent">{link.title || link.url}</p>
                        {link.siteName && <p className="text-xs text-text-muted/60 truncate mt-0.5">{link.siteName}</p>}
                      </div>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted/45 shrink-0">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </a>
                  ))}
                </div>
              )}

              {/* First image — `TruncatedImage` détecte les images très hautes
                  (screenshots de liste, etc.) et les crop au top avec un fade-out
                  + tap pour ouvrir en lightbox scrollable lisible. */}
              {firstImage && (
                <TruncatedImage src={firstImage} maxHeightClass="max-h-[70vh]" className="mb-4" />
              )}

              {/* Full formatted content + inline comments */}
              <div className="flex-1 flex flex-col min-h-0">
                <AnnotatedReader
                  entryId={entry.id}
                  contentMd={cleanMarkdown(contentWithoutImages)}
                  commentsLocked={entry.commentsLocked}
                  focusedCommentId={focusedCommentId}
                  defaultOpenAnchor="general"
                  focusGeneralComments={wantComments}
                  fontSize={entry.fontSize ?? '17px'}
                  fontFamily={getFontFamily(entry.font)}
                  fontKey={entry.font ?? undefined}
                  className="flex-1 flex flex-col min-h-0"
                  fullWidthComposer
                  beforeComments={(
                    <>
                      {entry.readGatePrompt && (
                        <ReadGateReviewSection entryId={entry.id} />
                      )}
                      {/* Barre d'actions footer du mode lecture : ratings ★/⊘
                          accessibles depuis le plein écran (auparavant il
                          fallait fermer le modal pour les voir sur la card). */}
                      <div className="flex items-center gap-2 flex-wrap mt-5 mb-1 pt-4 border-t border-text-muted/10">
                        <RatingButtonsForCard entry={entry} />
                        {(entry.tagNames ?? []).map((t) => (
                          <span key={t} className="text-xs text-text-muted bg-text-muted/8 px-2 py-0.5 rounded-full">#{t}</span>
                        ))}
                        {hasMood && <span className="text-lg leading-none ml-auto">{entry.mood}</span>}
                      </div>
                    </>
                  )}
                />
              </div>
            </div>
          ) : (
            // ── Edit mode ────────────────────────────────────────────────────
            // `min-w-0` cascade — voir DiaryEditor.tsx pour le détail.
            <div className={`px-6 pt-4 pb-10 flex flex-col min-h-full shrink-0 min-w-0 ${desktopPanel ? '' : 'max-w-2xl mx-auto w-full'}`}>
              {/* Heure + Météo de cette note — une seule ligne compacte.
                  Le libellé « de cette note » distingue de la météo « du jour »
                  du Ressenti du jour (HOME-02). */}
              <div className="flex items-center gap-3 mb-5">
                <TimeSelector
                  section={entry.section}
                  timeLabel={entry.timeLabel ?? null}
                  onChange={(patch) => updateMeta(patch)}
                />
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="text-[11px] text-text-muted/50 select-none">Météo de cette note</span>
                  <WeatherPicker
                    value={entry.weather ?? null}
                    onChange={(v) => updateMeta({ weather: v })}
                    minimal
                  />
                </div>
              </div>

              {isSealed && (
                <SealEditRow unlockAt={entry.unlockAt!} onSeal={handleSeal} />
              )}

              {/* Titre — grande typo, juste avant l'éditeur */}
              <input
                type="text"
                {...titleInput}
                placeholder="Titre (optionnel)…"
                className="w-full bg-transparent text-2xl font-serif italic text-text-primary placeholder:text-text-muted/45 placeholder:italic outline-none mb-3 leading-snug"
              />
              {(() => {
                // Mode édition : l'ordre est aligné sur le mode LECTURE — tout le
                // contenu structuré (média, quiz, agenda/budget, lecteur musique,
                // liens shopping) d'ABORD, puis l'éditeur de texte libre. Raison :
                // l'éditeur est en `flex-1` ; rendu en premier, son corps vide
                // remplit tout le panneau et repousse les panneaux structurés tout
                // en bas (gros vide au-dessus). Pour ces types on n'autofocus pas
                // le texte (le geste principal est de remplir le panneau structuré :
                // choisir le média, ajouter un événement/une ligne…).
                // JOURNAL : l'éditeur EST le contenu → rendu seul, en autofocus.
                // Branchement sur le comportement résolu : un type custom héritant
                // de JOURNAL reste éditeur-d'abord ; les autres → structuré d'abord.
                const isJournal = behavior === 'JOURNAL';
                const editorEl = (
                  <Suspense key="editor" fallback={<div className="flex-1 min-h-[30svh] text-sm text-text-muted/50 italic px-2 py-3">Chargement de l'éditeur…</div>}>
                    <DiaryEditor
                      ref={editorRef}
                      initialContent={entry.contentMd}
                      onChange={handleChange}
                      autoFocus={isEditing && isJournal}
                      fontFamily={getFontFamily(entry.font)}
                      fontSize={entry.fontSize ?? undefined}
                      fontKey={entry.font}
                      onFontSizeChange={(v) => updateMeta({ fontSize: v })}
                      entryId={entry.id}
                    />
                  </Suspense>
                );
                // JOURNAL pur (sans champs perso) → éditeur seul. Un type custom
                // héritant de JOURNAL mais doté de champs perso garde l'éditeur
                // mais doit aussi rendre le panneau de champs ci-dessous.
                if (isJournal && fieldDefs.length === 0) return editorEl;
                return (
                  <>
                    {behavior !== 'JOURNAL' && (
                      <MediaMetaPanel
                        key="meta"
                        noteType={entry.noteType}
                        customTypeId={entry.customTypeId}
                        meta={entry.mediaMeta}
                        onChange={(meta: MediaMeta) => updateMeta({ mediaMeta: meta })}
                        onInsertText={(text) => editorRef.current?.insertAtEnd(text)}
                        entryId={entry.id}
                      />
                    )}
                    {fieldDefs.length > 0 && (
                      <CustomFieldsEditor
                        key="customFields"
                        fields={fieldDefs}
                        values={(entry.mediaMeta?.customFields ?? {}) as CustomFieldValues}
                        onChange={(cf) => updateMeta({ mediaMeta: { ...(entry.mediaMeta ?? {}), customFields: cf } })}
                      />
                    )}
                    {behavior === 'MUSIC' && (
                      <MusicNotePlayer key="music" meta={entry.mediaMeta} />
                    )}
                    {behavior === 'SHOPPING' && (
                      <ShoppingLinksEditor
                        key="shopping"
                        entryId={entry.id}
                        links={entry.links ?? []}
                        onUpdate={(links) => updateMeta({ links })}
                      />
                    )}
                    {editorEl}
                  </>
                );
              })()}

              <div className="pt-3 border-t border-text-muted/10 flex flex-col gap-2">
                <TagInput tags={entry.tagNames ?? []} onChange={(tags) => updateMeta({ tagNames: tags })} />
                <MoodSelector value={entry.mood} onChange={(v) => updateMeta({ mood: v })} compact />
              </div>
            </div>
          )}
        </NoteModal>
      )}
    </>
  );
}

function AdultAttemptStats({ entryId, show, onToggle }: { entryId: string; show: boolean; onToggle: () => void }) {
  const { data } = trpc.entries.adultAttemptStats.useQuery({ entryId }, { enabled: show });
  return (
    <div className="mt-1">
      <button type="button" onClick={onToggle} className="text-xs text-text-muted/55 hover:text-text-muted transition-colors text-center w-full">
        {show ? 'Masquer les tentatives' : 'Voir les tentatives des confidents'}
      </button>
      {show && data && (
        <div className="mt-2 rounded-xl border border-text-muted/10 bg-bg-primary/50 px-3 py-2 flex flex-col gap-1.5">
          {data.total === 0 ? (
            <p className="text-xs text-text-muted/50 text-center">Aucune tentative enregistrée.</p>
          ) : (
            data.attempts.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={`shrink-0 ${a.success ? 'text-green-400' : 'text-danger/60'}`}>{a.success ? '✓' : '✗'}</span>
                <span className="text-text-muted font-medium shrink-0">{a.userName}</span>
                <span className="text-text-primary/80 flex-1 truncate italic">"{a.answer}"</span>
                <span className="text-text-muted/55 shrink-0 tabular-nums">
                  {new Date(a.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** Réactions + commentaires généraux sur une capsule scellée — sans révéler le contenu. */
function SealedCapsuleInteractions({ entry }: { entry: LocalEntry }) {
  const { data: me } = trpc.auth.me.useQuery();
  if (!me) return null;
  return (
    <div className="w-full max-w-md flex flex-col gap-4 mt-4 pt-5 border-t border-text-muted/10">
      <div className="flex justify-center">
        <EntryReactions entryId={entry.id} currentUserId={me.id} />
      </div>
      <CommentThread entryId={entry.id} commentsLocked={!!entry.commentsLocked} />
    </div>
  );
}
