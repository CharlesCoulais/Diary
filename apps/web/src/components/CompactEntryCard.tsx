import type { MouseEventHandler, RefObject } from 'react';
import { getNoteTypeConfig, resolveNoteTypeConfig, type NoteType } from './NoteTypePicker';
import { useNoteTypeDefs } from '../lib/useNoteTypeDefs';
import { CardEntryReactions } from './EmojiReactionBar';
import { EntryRatingButtons, type EntryRating } from './EntryRatingButtons';
import { parsePreviewRuns, PreviewRuns } from '../lib/previewRuns';
import { trpc } from '../lib/trpc';

interface CompactEntryCardProps {
  // Données affichées
  entryId: string;
  noteType: NoteType;
  /** Id du type custom (quand noteType === 'CUSTOM') — pour résoudre le
   *  comportement hérité (`behavior`) qui pilote l'affichage structuré. */
  customTypeId?: string | null;
  date: string;                 // YYYY-MM-DD ou ISO
  title?: string | null;
  contentMd?: string | null;
  mediaSubject?: string | null;
  /** Note musicale multi-morceaux (tracks dans mediaMeta) → étiquette « Playlist ». */
  isMusicPlaylist?: boolean;
  /** Ligne d'infos structurées (ex. DEV : « Thème · P1 … · Ch.7 ») affichée à la
   *  place de l'aperçu du contenu. */
  infoLine?: string | null;
  timeLabel?: string | null;
  // États visuels
  isAdult?: boolean;
  adultGatePassed?: boolean;
  isSecret?: boolean;
  isSealedCapsule?: boolean;
  /** Accroche optionnelle d'une capsule scellée (affichée à la place du contenu). */
  capsuleSpoiler?: string | null;
  isDraft?: boolean;
  isForConfidant?: boolean;
  hasReadGate?: boolean;
  readGateStatus?: 'awaiting' | 'pending' | 'approved' | 'rejected' | null;
  readGatePrompt?: string | null;
  hideUntilFuture?: boolean;
  // Compteurs / indicateurs côté guest / owner
  commentCount?: number;
  /**
   * Notations « favoris / nul » par utilisateur — telles que renvoyées par le
   * payload entry (filtrées côté serveur selon le rôle du viewer).
   * Si omis, les boutons ne sont pas affichés (compatibilité).
   */
  ratings?: EntryRating[];
  isReadByConfidant?: boolean;  // owner : "vu par le confident"
  isUnreadForGuest?: boolean;   // guest : pastille non-lu
  // Variantes visuelles
  isActivePanel?: boolean;
  showAccentRing?: boolean;     // guest only : ring autour des notes pour-toi
  showSubtleRing?: boolean;     // guest only : ring discret sur les non-lus normaux
  // Interactions
  cardRef?: RefObject<HTMLDivElement>;
  onClick?: MouseEventHandler<HTMLDivElement>;
}

/** Ligne d'infos structurées pour une note DEV : « Thème · P1 Nom · Ch.7 ».
 *  Affichée en preview à la place de l'aperçu du contenu. */
export function formatDevInfoLine(m: { seriesName?: string; volume?: number; partName?: string; chapter?: number } | null | undefined): string | null {
  if (!m) return null;
  const parts: string[] = [];
  if (m.seriesName?.trim()) parts.push(m.seriesName.trim());
  if (m.volume != null) parts.push(`P${m.volume}${m.partName ? ` ${m.partName}` : ''}`);
  if (m.chapter != null) parts.push(`Ch.${m.chapter}`);
  return parts.length ? parts.join(' · ') : null;
}

/** Ligne d'infos compacte pour une note AGENDA / FINANCE (résumé événements / solde).
 *  Affichée en preview à la place de l'aperçu du contenu (qui est vide pour ces types).
 *  On branche sur le COMPORTEMENT : un type custom AGENDA/FINANCE est résolu en
 *  amont (`resolveNoteTypeConfig(...).behavior`). Param typé `NoteType` (surtype
 *  de `NoteTypeBehavior`) pour rester assignable depuis les appelants qui passent
 *  encore un `noteType` brut ; un 'CUSTOM' non résolu retombe simplement sur null. */
export function formatAgendaFinanceInfoLine(
  behavior: NoteType,
  m: {
    events?: unknown[];
    budgetItems?: { amount: number; kind: 'income' | 'expense' }[];
    currency?: string;
  } | null | undefined,
): string | null {
  if (!m) return null;
  if (behavior === 'AGENDA') {
    const n = m.events?.length ?? 0;
    return n > 0 ? `${n} événement${n > 1 ? 's' : ''}` : null;
  }
  if (behavior === 'FINANCE') {
    const its = m.budgetItems ?? [];
    if (its.length === 0) return null;
    const balance = its.reduce((s, it) => s + (it.kind === 'income' ? it.amount : -it.amount), 0);
    const cur = m.currency ?? '€';
    const amount = `${balance < 0 ? '−' : balance > 0 ? '+' : ''}${Math.abs(balance).toLocaleString('fr-FR')} ${cur}`;
    return `Solde ${amount} · ${its.length} ligne${its.length > 1 ? 's' : ''}`;
  }
  return null;
}

/** Fallback visuel quand la note ne contient que du media (pas de texte ni de titre).
 *  On branche sur le COMPORTEMENT : un type custom est résolu en amont
 *  (`resolveNoteTypeConfig(...).behavior`). Param typé `NoteType` (surtype de
 *  `NoteTypeBehavior`) pour rester assignable depuis les appelants qui passent
 *  encore un `noteType` brut ; un 'CUSTOM' non résolu retombe simplement sur null. */
export function getContentFallback(
  behavior: NoteType,
  contentMd: string | null | undefined,
  isMusicPlaylist = false,
): { text: string; italic: boolean } | null {
  // Une playlist musicale (tracks dans mediaMeta) n'a pas forcément de contenu
  // markdown : on l'étiquette « Playlist » indépendamment de contentMd.
  if (behavior === 'MUSIC' && isMusicPlaylist) return { text: 'Playlist', italic: false };

  // Une note Quizz n'a pas forcément de corps : on l'étiquette « Quizz ».
  if (behavior === 'QUIZZ') return { text: 'Quizz', italic: false };

  if (!contentMd) return null;

  const hasMermaid = /^:::mermaid\b/m.test(contentMd);

  if (behavior === 'JOURNAL') {
    const hasVideo = /^(?:\|\|)?:::video\b/m.test(contentMd);
    const hasImg = /^(?:\|\|)?:::img\b/m.test(contentMd);
    if (hasVideo && hasImg) return { text: 'Photos & vidéo', italic: true };
    if (hasVideo) return { text: 'Vidéo', italic: true };
    if (hasImg) return { text: 'Photo', italic: true };
    if (hasMermaid) return { text: 'Diagramme', italic: true };
    return null;
  }

  if (behavior === 'MUSIC') {
    const tracks = [
      ...contentMd.matchAll(/^(?:\|\|)?:::audio\s+"[^"]*"\s+"([^"]+)"/gm),
    ].map((m) => m[1]).filter((t): t is string => !!t);
    if (tracks.length > 1) return { text: 'Playlist', italic: false };
    const [first] = tracks;
    if (first) return { text: first, italic: false };
    if (hasMermaid) return { text: 'Diagramme', italic: true };
    return null;
  }

  // Autres types de note (DEV, etc.) : un diagramme seul est indiqué comme tel.
  if (hasMermaid) return { text: 'Diagramme', italic: true };

  return null;
}

/** Texte d'aperçu brut, 1 ligne max, sans markdown. */
export function buildPreview(md: string | null | undefined): string {
  if (!md) return '';
  return md
    .replace(/:::chat[^\n]*\n?[\s\S]*?:::/g, '')
    .replace(/:::branch[^\n]*\n?[\s\S]*?:::/g, '')
    .replace(/:::mermaid\s*\n[\s\S]*?\n:::/g, '')
    // Directives media spoiler retirées EN PREMIER — avant le ||...||→▓▓▓
    // sinon ||:::video...|| deviendrait ▓▓▓ au lieu d'être supprimé.
    .replace(/^\|\|:::audio[^\n]*\|\|$/gm, '')
    .replace(/^\|\|:::video[^\n]*\|\|$/gm, '')
    .replace(/^\|\|:::img[^\n]*\|\|$/gm, '')
    // Spoilers texte `||...||` masqués en preview
    .replace(/\|\|[^|\n]+?\|\|/g, '▓▓▓')
    // Directives media non-spoiler
    .replace(/^:::audio[^\n]*$/gm, '')
    .replace(/:::audio[^\n]*\n?[\s\S]*?:::/g, '')
    .replace(/^:::video[^\n]*$/gm, '')
    .replace(/^:::img[^\n]*$/gm, '')
    .replace(/:::edit[^\n]*\n?[\s\S]*?:::/g, '')
    .replace(/```[\s\S]*?```/g, '〈code〉')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[*_`~]/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/\\([\s\S])/g, '$1')
    .split('\n').map((l) => l.trim()).filter(Boolean)
    .join(' · ');
}

function shortDate(d: string): string {
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : d.slice(0, 10);
}

/**
 * Carte ultra-compacte (une ligne) utilisée sur Home/Timeline (owner) et
 * GuestHome/GuestDay (confident) quand le toggle « Mode compact » est actif.
 * Identique côté owner et confident pour éviter les écarts visuels.
 */
export function CompactEntryCard({
  entryId,
  noteType,
  customTypeId = null,
  date,
  title,
  contentMd,
  mediaSubject,
  isMusicPlaylist = false,
  infoLine,
  timeLabel,
  isAdult = false,
  adultGatePassed = false,
  isSecret = false,
  isSealedCapsule = false,
  capsuleSpoiler = null,
  isDraft = false,
  isForConfidant = false,
  hasReadGate = false,
  readGateStatus = null,
  readGatePrompt = null,
  hideUntilFuture = false,
  commentCount = 0,
  ratings,
  isReadByConfidant = false,
  isUnreadForGuest = false,
  isActivePanel = false,
  showAccentRing = false,
  showSubtleRing = false,
  cardRef,
  onClick,
}: CompactEntryCardProps) {
  const { data: me } = trpc.auth.me.useQuery();
  // Types custom : config résolu (label/couleur/glyph) + `behavior` hérité pour
  // le branchement structuré (fallback de contenu). Le `noteType` brut reste
  // conservé pour la persistance / le regroupement.
  const { defsById } = useNoteTypeDefs();
  const cfg = resolveNoteTypeConfig({ noteType, customTypeId }, defsById);
  const behavior = cfg.behavior;
  // infoLine (ex. DEV) prend la place de l'aperçu du contenu : on privilégie les
  // métadonnées structurées (thème/partie/chapitre).
  // Aperçu coloré (mentions, code en chip, gras/italique…) identique à la carte
  // pleine — au lieu d'un texte brut. Parse borné (~400 car.) : une ligne suffit
  // et on évite de rendre des centaines de runs par carte en mode compact.
  const previewRuns = !infoLine && contentMd ? parsePreviewRuns(contentMd.slice(0, 400)) : null;
  const hasPreview = !!infoLine || !!(previewRuns && previewRuns.length > 0);
  const titleOrSubject = title || mediaSubject || null;
  const contentFallback = !titleOrSubject && !hasPreview ? getContentFallback(behavior, contentMd, isMusicPlaylist) : null;
  const blurContent = isAdult && !adultGatePassed;
  // Verrou de lecture côté confident : si statut ≠ approved, le serveur a scrubbé le contenu.
  // On remplace la preview par un libellé clair indiquant la condition.
  const readGateLocked = hasReadGate && !!readGateStatus && readGateStatus !== 'approved';
  const ringClass = [
    isActivePanel ? 'ring-1 ring-accent/35' : '',
    showAccentRing ? 'ring-2 ring-accent/35' : '',
    !showAccentRing && showSubtleRing ? 'ring-1 ring-accent/15' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      className={`group bg-bg-elevated rounded-xl shadow-soft cursor-pointer border-l-[3px] transition-transform duration-150 [@media(hover:hover)]:hover:-translate-y-px ${ringClass}`}
      style={{ borderLeftColor: cfg.color }}
    >
      <div className="flex items-center gap-2 px-3 py-1.5 min-w-0 leading-tight">
        {/* Pastille non-lu (guest uniquement) */}
        {isUnreadForGuest && (
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} title="Non lu" />
        )}
        {/* Icône type (sans label) */}
        <cfg.Glyph className="w-3.5 h-3.5 shrink-0" style={{ color: cfg.color }} />
        {/* Heure */}
        {timeLabel && (
          <span className="font-mono text-[11px] text-text-muted/60 shrink-0 tabular-nums">{timeLabel}</span>
        )}
        {/* Indicateurs (badges minuscules) */}
        {isSecret && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-secret shrink-0" aria-label="Secret">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        )}
        {isSealedCapsule && <span className="text-[11px] shrink-0 leading-none" aria-label="Capsule">🔒</span>}
        {isAdult && <span className="text-[11px] shrink-0 leading-none" aria-label="18+">🔞</span>}
        {hasReadGate && !readGateLocked && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0" aria-label="Verrou">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /><circle cx="12" cy="16" r="1" fill="currentColor" />
          </svg>
        )}
        {hideUntilFuture && <span className="text-[11px] shrink-0 leading-none" aria-label="Bientôt visible">⏱</span>}
        {isForConfidant && <span className="text-[11px] shrink-0 leading-none" aria-label="Pour toi">💛</span>}
        {isDraft && (
          <span className="text-[11px] px-1 py-px rounded bg-warning/15 text-warning font-medium shrink-0 uppercase tracking-wider leading-none">Brouillon</span>
        )}
        {/* Titre + preview, 1 ligne tronquée. Une capsule scellée (unlockAt futur)
            ne montre JAMAIS l'aperçu du contenu — comme la carte pleine, on affiche
            seulement le titre + l'accroche, sinon le corps fuiterait en mode compact. */}
        {isSealedCapsule ? (
          <div className="flex-1 min-w-0 text-[14px] leading-tight truncate flex items-center gap-1.5">
            <span className="font-medium text-text-primary truncate">{title || 'Capsule temporelle'}</span>
            <span className="text-text-muted/55 shrink-0">·</span>
            {capsuleSpoiler
              ? <span className="text-sealed/80 italic truncate">« {capsuleSpoiler} »</span>
              : <span className="text-text-muted/60 italic shrink-0">scellé</span>}
          </div>
        ) : readGateLocked ? (
          <div className="flex-1 min-w-0 text-[14px] leading-tight truncate flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /><circle cx="12" cy="16" r="1" fill="currentColor" />
            </svg>
            <span className="text-accent font-medium shrink-0">
              {readGateStatus === 'pending' ? 'Réponse envoyée' : readGateStatus === 'rejected' ? 'Accès refusé' : 'Verrou de lecture'}
            </span>
            {readGatePrompt && (readGateStatus === 'awaiting' || readGateStatus === null) && (
              <>
                <span className="text-text-muted/55 shrink-0">·</span>
                <span className="text-text-muted/70 italic truncate">« {readGatePrompt} »</span>
              </>
            )}
          </div>
        ) : (
          <div className={`flex-1 min-w-0 text-[14px] leading-tight truncate ${blurContent ? 'blur-sm select-none' : ''}`}>
            {titleOrSubject && <span className="font-medium text-text-primary">{titleOrSubject}</span>}
            {titleOrSubject && hasPreview && <span className="text-text-muted/50"> · </span>}
            {hasPreview && (
              <span className="text-text-muted">
                {infoLine ? infoLine : <PreviewRuns runs={previewRuns!} />}
              </span>
            )}
            {!titleOrSubject && !hasPreview && (
              contentFallback
                ? <span className={contentFallback.italic ? 'text-text-muted/60 italic' : 'font-medium text-text-primary'}>{contentFallback.text}</span>
                : <span className="text-text-muted/60 italic">Note vide</span>
            )}
          </div>
        )}
        {/* Compteur commentaires — slot à largeur fixe pour aligner les
            cartes entre elles même quand il n'y a pas de commentaires. */}
        <span className="inline-flex items-center justify-end gap-0.5 text-[11px] text-text-muted/60 shrink-0 tabular-nums min-w-[24px]">
          {commentCount > 0 && (
            <>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              {commentCount}
            </>
          )}
        </span>
        {/* Réactions (compactes, scale 90%) */}
        <div className="shrink-0 scale-90 origin-right" onClick={(e) => e.stopPropagation()}>
          <CardEntryReactions entryId={entryId} />
        </div>
        {/* Favoris / nul — notation perso (compact, scale 90%) */}
        {ratings && me && (
          <div className="shrink-0 scale-90 origin-right" onClick={(e) => e.stopPropagation()}>
            <EntryRatingButtons
              entryId={entryId}
              currentUserId={me.id}
              ratings={ratings}
            />
          </div>
        )}
        {/* Vu par le confident (owner uniquement) — slot à largeur fixe
            pour que la date reste alignée même si l'icône n'est pas montrée. */}
        <span className="inline-flex items-center justify-center shrink-0 min-w-[11px] h-[11px]">
          {isReadByConfidant && (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent" aria-label="Lu par le confident">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </span>
        {/* Date courte 21/05 */}
        <span className="font-mono text-[11px] text-text-muted/70 tabular-nums shrink-0">{shortDate(date)}</span>
      </div>
    </div>
  );
}

/** Variante compacte pour les notes secrètes (côté guest) : pas de contenu, juste un padlock + "Confidentiel". */
export function CompactSecretCard({
  entryId,
  noteType,
  date,
  timeLabel,
  commentCount = 0,
}: {
  entryId: string;
  noteType: NoteType;
  date: string;
  timeLabel?: string | null;
  commentCount?: number;
}) {
  const cfg = getNoteTypeConfig(noteType);
  return (
    <div className="bg-bg-elevated rounded-xl shadow-soft border-l-[3px] transition-all duration-150" style={{ borderLeftColor: cfg.color }}>
      <div className="flex items-center gap-2 px-3 py-1.5 min-w-0 leading-tight">
        <cfg.Icon className="w-3.5 h-3.5 shrink-0" style={{ color: cfg.color }} />
        {timeLabel && <span className="font-mono text-[11px] text-text-muted/60 shrink-0 tabular-nums">{timeLabel}</span>}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-secret shrink-0" aria-label="Confidentiel">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <span className="flex-1 min-w-0 text-[11px] text-secret/70 uppercase tracking-widest font-medium truncate leading-tight">Confidentiel</span>
        {commentCount > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[11px] text-text-muted/60 shrink-0 tabular-nums">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            {commentCount}
          </span>
        )}
        <div className="shrink-0 scale-90 origin-right" onClick={(e) => e.stopPropagation()}>
          <CardEntryReactions entryId={entryId} />
        </div>
        <span className="font-mono text-[11px] text-text-muted/70 tabular-nums shrink-0">{shortDate(date)}</span>
      </div>
    </div>
  );
}
