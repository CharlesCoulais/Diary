import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { SouvenirReaderModal } from '../components/SouvenirReaderModal';
import { ImageLightbox } from '../components/ImageLightbox';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LocalEntry, type MediaMeta, type MediaTrack, type MediaStatus } from '../lib/db/schema';
import { isCollectionEntry } from '../lib/collectionFilter';
import { seriesStats, seriesGroupProgress } from '../lib/seriesProgress';
import { useDropdownAlign } from '../lib/useDropdownAlign';
import { showToast } from '../lib/toast';
import { useCollapsibleSection } from '../hooks/useCollapsibleSection';
import { HScroll } from '../components/HScroll';
import { resolveNoteTypeConfig, resolveBuiltinConfig, resolveDefConfig, NOTE_TYPE_CONFIG, noteTint, type ResolvedNoteTypeConfig } from '../components/NoteTypePicker';
import { useNoteTypeDefs } from '../lib/useNoteTypeDefs';
import { behaviorOf, type NoteTypeBehavior, type NoteTypeDefLike } from '@carnet/schemas';
import { BottomNav, GuestBottomNav } from '../components/BottomNav';
import { BackToTop } from '../components/BackToTop';
import { EntrySheet } from '../components/EntrySheet';
import { PageHeader } from '../components/PageHeader';
import { trpc } from '../lib/trpc';
import { adultUnlocked } from '../lib/adultGate';
import { getRepresentativeTrack, isPlaylist } from '../lib/musicTracks';
import { AddCollectionItemSheet, type AddNoteType } from '../components/AddCollectionItemSheet';
import { useBackButtonClose } from '../hooks/useBackButtonClose';


/**
 * Statut de verrouillage d'une entrée dans la collection.
 *  - 'secret' : visible chez le confident mais sans révéler le contenu → on masque cover + titre
 *  - 'adult'  : 18+ pas déverrouillé dans cette session → on masque avec un gate à l'ouverture
 */
type LockReason = 'secret' | 'adult';
function getLockReason(entry: LocalEntry, isGuest: boolean): LockReason | null {
  if (entry.isSecret && isGuest) return 'secret';
  if (entry.isAdult && !adultUnlocked.has(entry.id)) return 'adult';
  return null;
}

// Statut unifié : wishlist/owned (pré-lecture) puis ongoing/finished/abandoned.
type Status = 'wishlist' | 'owned' | 'ongoing' | 'finished' | 'abandoned';

// AGENDA / FINANCE sont des notes fonctionnelles (pas des médias possédés) → hors Collection.
const COLLECTION_TYPES = NOTE_TYPE_CONFIG.filter((c) => c.value !== 'JOURNAL' && c.value !== 'AGENDA' && c.value !== 'FINANCE');

const STATUS_LABEL: Record<Status, string> = {
  wishlist: 'Wishlist',
  owned: 'Possédé',
  ongoing: 'En cours',
  finished: 'Terminé',
  abandoned: 'Abandonné',
};

const STATUS_ORDER: (Status | undefined)[] = ['wishlist', 'owned', 'ongoing', 'finished', 'abandoned', undefined];

function statusOf(e: LocalEntry): Status | undefined {
  return e.mediaMeta?.status as Status | undefined;
}

function seriesStatusOf(e: LocalEntry): Status | undefined {
  return e.mediaMeta?.seriesStatus as Status | undefined;
}

/**
 * Statut effectif d'un groupe pour l'affichage / les filtres.
 * - Série/saga : on prend le `seriesStatus` du premier tome qui l'a défini.
 * - Sinon (œuvre mono) on retombe sur le `status` du tome représentant.
 */
function groupStatusOf(group: { all: LocalEntry[]; representative: LocalEntry; isSeries: boolean }): Status | undefined {
  for (const e of group.all) {
    const ss = seriesStatusOf(e);
    if (ss) return ss;
  }
  if (group.isSeries) {
    // Pas de seriesStatus explicite → on dérive des tomes.
    // Une série n'est "Terminé" que si TOUS ses tomes le sont — et, si le
    // nombre total de tomes est connu, qu'ils sont tous présents.
    const statuses = group.all
      .map((e) => statusOf(e))
      .filter((s): s is Status => !!s);
    if (statuses.length === 0) return undefined;
    // Un seul tome abandonné → la série entière est considérée abandonnée.
    if (statuses.some((s) => s === 'abandoned')) return 'abandoned';
    if (statuses.every((s) => s === 'finished')) {
      const total = group.representative.mediaMeta?.totalVolumes;
      if (total && group.all.length < total) return 'ongoing';
      return 'finished';
    }
    if (statuses.every((s) => s === 'wishlist')) return 'wishlist';
    if (statuses.every((s) => s === 'owned' || s === 'wishlist')) return 'owned';
    return 'ongoing';
  }
  return statusOf(group.representative);
}

/** Vrai si toutes les entrées du groupe sont des items de Collection (pas de note rédigée). */
function isCollectionOnlyGroup(group: { all: LocalEntry[] }): boolean {
  return group.all.length > 0 && group.all.every((e) => e.collectionOnly);
}

function ProgressBar({ current, total, color }: { current?: number; total?: number; color: string }) {
  if (!total || !current) return null;
  const pct = Math.min(100, Math.round((current / total) * 100));
  return (
    <div className="mt-1.5 h-1 rounded-full bg-text-muted/10 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.7 }} />
    </div>
  );
}

function Stars({ value, color }: { value?: number; color: string }) {
  if (!value) return null;
  return (
    <span className="text-xs" style={{ color }}>
      {'★'.repeat(value)}{'☆'.repeat(5 - value)}
    </span>
  );
}

/** Une occurrence d'un morceau : soit une note mono, soit une track dans une playlist parente. */
export type TrackInstance = {
  entry: LocalEntry;
  /** Présent si l'instance vient d'une track de playlist (index dans `entry.mediaMeta.tracks`) */
  trackIndex?: number;
  /** Présent si l'instance vient d'une track de playlist (raccourci vers la track) */
  trackMeta?: MediaTrack;
};

type SubjectGroup = {
  /** Clé d'affichage (seriesName si défini, sinon subject, sinon titre du morceau pour les playlists) */
  displayTitle: string;
  /** Entrée représentative (tome le plus récent ou le plus avancé, ou le parent d'une track) */
  representative: LocalEntry;
  /** Toutes les entrées du groupe, triées par tome puis date (dédupliquées) */
  all: LocalEntry[];
  /** Vrai si le groupe est une série multi-tomes */
  isSeries: boolean;
  /** Nombre de tomes distincts dans le groupe (0 si aucun volume renseigné) */
  distinctVolumes: number;
  /** Si défini, ce groupe représente UN morceau MUSIC (le représentative est mono ou parent d'une playlist) */
  trackMeta?: MediaTrack;
  /** Index de la track dans la playlist du représentative (undefined si mono) */
  trackIndex?: number;
  /** Toutes les occurrences de ce morceau (mono + tracks dans playlists) */
  instances?: TrackInstance[];
  /** Si défini, ce groupe rassemble plusieurs morceaux d'un même artiste (équivalent musical d'une série de livres) */
  artistName?: string;
  /** Nombre de morceaux distincts dans ce groupe artiste */
  songCount?: number;
  /** Comportement built-in effectif du représentant (résolu via `behaviorOf`). */
  behavior: NoteTypeBehavior;
};

/** Résume la progression d'un groupe de livres/manga/films */
function bookGroupProgress(group: SubjectGroup): string | null {
  const isMovie = group.behavior === 'MOVIE';
  const prefix = isMovie ? 'F.' : 'T.';

  // Volume unique (ou multi-lectures du même) : affiche la progression de l'entrée représentative
  if (group.distinctVolumes <= 1) {
    const m = group.representative.mediaMeta ?? {};
    return [
      m.volume ? `${prefix}${m.volume}${m.totalVolumes ? `/${m.totalVolumes}` : ''}` : null,
      !isMovie && m.progressCurrent && m.progressTotal ? `p. ${m.progressCurrent} / ${m.progressTotal}` : null,
    ].filter(Boolean).join(' · ') || null;
  }
  // Multi-volumes : affiche la plage
  const volumes = [...new Set(group.all.map((e) => e.mediaMeta?.volume).filter((v): v is number => !!v))].sort((a, b) => a - b);
  const totalVolumes = group.representative.mediaMeta?.totalVolumes;
  const range = volumes.length === 1
    ? `${prefix}${volumes[0]}`
    : `${prefix}${volumes[0]}–${prefix}${volumes[volumes.length - 1]}`;
  return totalVolumes ? `${range} / ${totalVolumes}` : range;
}

/** Avancement d'un thème DEV : chapitres rédigés / total prévu. */
function devChapterCount(group: SubjectGroup): number {
  const chapters = new Set(group.all.map((e) => e.mediaMeta?.chapter).filter((c): c is number => c != null));
  return chapters.size || group.all.length;
}
function devGroupProgress(group: SubjectGroup): string | null {
  const count = devChapterCount(group);
  if (!count) return null;
  const total = group.representative.mediaMeta?.totalChapters;
  return total ? `${count} / ${total} chapitres` : `${count} chapitre${count > 1 ? 's' : ''}`;
}

/** Avancement d'un thème QUIZZ : quizz présents / total prévu (cible « X / total »). */
function quizCount(group: SubjectGroup): number {
  const vols = new Set(group.all.map((e) => e.mediaMeta?.volume).filter((v): v is number => v != null));
  return vols.size || group.all.length;
}
function quizGroupProgress(group: SubjectGroup): string | null {
  const count = quizCount(group);
  if (!count) return null;
  const total = group.representative.mediaMeta?.totalVolumes;
  return total ? `${count} / ${total} quizz` : `${count} quizz`;
}

function CollectionCard({ group, onClick, isGuest, defsById }: { group: SubjectGroup; onClick: () => void; isGuest: boolean; defsById: Record<string, NoteTypeDefLike> }) {
  const entry = group.representative;
  const cfg = resolveNoteTypeConfig(entry, defsById);
  const behavior = cfg.behavior;
  const m = entry.mediaMeta ?? {};
  // Pour une série/saga, on affiche en priorité le statut global ; sinon le tome.
  const status = groupStatusOf(group);
  const lock = getLockReason(entry, isGuest);

  // ── 18+ ou Secret : on masque cover + titre + créateur, on garde juste le type ──
  if (lock === 'secret') {
    // Note confidentielle pour un guest → non-cliquable (aucune info à révéler)
    return (
      <button
        type="button"
        onClick={() => showToast({ message: 'Note confidentielle — visible seulement par son autrice.' })}
        className="w-full h-full flex flex-col text-left bg-bg-elevated rounded-2xl overflow-hidden shadow-soft select-none opacity-70 hover:opacity-85 transition-opacity"
        title="Note confidentielle"
      >
        <div className="w-full aspect-[2/3] flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-bg-elevated">
          <span className="text-4xl">🔒</span>
          <span className="text-[11px] font-bold uppercase tracking-widest text-secret/80">Confidentiel</span>
        </div>
        <div className="px-3 py-2.5 flex-1">
          <p className="text-text-primary/60 text-sm font-medium italic line-clamp-2">—</p>
          <p className="inline-flex items-center gap-1 text-text-muted/55 text-xs mt-0.5 line-clamp-1"><cfg.Glyph className="w-3 h-3 shrink-0" /> {cfg.label}</p>
        </div>
      </button>
    );
  }
  if (lock === 'adult') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full h-full flex flex-col text-left bg-bg-elevated rounded-2xl overflow-hidden shadow-soft hover:ring-1 hover:ring-orange-400/30 transition-all duration-150"
      >
        <div className="w-full aspect-[2/3] flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-bg-elevated">
          <span className="text-4xl select-none">🔞</span>
          <span className="text-[11px] font-bold uppercase tracking-widest text-adult/80">Contenu sensible</span>
        </div>
        <div className="px-3 py-2.5 flex-1">
          <p className="text-text-primary/60 text-sm font-medium italic line-clamp-2">Verrouillé</p>
          <p className="inline-flex items-center gap-1 text-text-muted/55 text-xs mt-0.5 line-clamp-1"><cfg.Glyph className="w-3 h-3 shrink-0" /> {cfg.label}</p>
        </div>
      </button>
    );
  }

  // Si le groupe représente une track de playlist, on lit ses champs ; sinon les champs top-level
  const t = group.trackMeta;
  const isArtistGroup = !!group.artistName && (group.songCount ?? 0) > 1;
  const title = group.displayTitle;
  // Pour un groupe artiste : sous-titre = "N morceaux", pas d'album/playlist affichés
  const subtitle = isArtistGroup
    ? `${group.songCount} morceaux`
    : (t ? t.creator : m.creator);
  const cover = t ? t.coverUrl : m.coverUrl;
  const trackTitleLine = isArtistGroup ? undefined : (t ? t.trackTitle : (behavior === 'MUSIC' ? m.trackTitle : undefined));
  const ratingValue = isArtistGroup ? undefined : (t ? t.rating : m.rating);
  const playlistName = isArtistGroup ? undefined : (t ? entry.mediaMeta?.playlistName : undefined);

  const progress = behavior === 'BOOK'
    ? bookGroupProgress(group)
    : behavior === 'MOVIE' && group.distinctVolumes > 1
      ? bookGroupProgress(group)
      : behavior === 'SERIES'
        ? seriesGroupProgress(m)
        : behavior === 'DEV'
          ? devGroupProgress(group)
          : behavior === 'QUIZZ'
            ? quizGroupProgress(group)
            : null;
  const devCount = behavior === 'DEV' ? devChapterCount(group) : undefined;
  const quizCnt = behavior === 'QUIZZ' ? quizCount(group) : undefined;
  const seriesSt = behavior === 'SERIES' ? seriesStats(m) : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full h-full flex flex-col text-left bg-bg-elevated rounded-2xl overflow-hidden shadow-soft hover:ring-1 hover:ring-text-muted/15 transition-all duration-150"
    >
      {cover ? (
        <img src={cover} alt={title} className="w-full aspect-[2/3] object-cover" />
      ) : (
        <div className="w-full aspect-[2/3] flex flex-col items-center justify-center gap-2" style={{ background: `linear-gradient(135deg, ${noteTint(cfg.color, 13)}, ${noteTint(cfg.color, 3)})` }}>
          <cfg.Glyph className="w-10 h-10" style={{ color: cfg.color }} />
        </div>
      )}
      <div className="px-3 py-2.5 flex-1 flex flex-col">
        {playlistName && (
          <p className="text-text-muted/50 text-[11px] uppercase tracking-wide line-clamp-1 mb-0.5">{playlistName}</p>
        )}
        <p className="text-text-primary text-sm font-medium leading-snug line-clamp-2">{title}</p>
        {subtitle && <p className="text-text-muted text-xs mt-0.5 line-clamp-1">{subtitle}</p>}
        {behavior === 'MUSIC' && trackTitleLine && (
          <p className="text-text-muted/60 text-[11px] mt-0.5 line-clamp-1">📀 {trackTitleLine}</p>
        )}
        {progress && <p className="text-text-muted/60 text-[11px] mt-1">{progress}</p>}
        <ProgressBar current={behavior === 'DEV' ? devCount : behavior === 'QUIZZ' ? quizCnt : behavior === 'SERIES' ? seriesSt?.epsWatched : m.progressCurrent} total={behavior === 'DEV' ? m.totalChapters : behavior === 'QUIZZ' ? m.totalVolumes : behavior === 'SERIES' ? seriesSt?.epsTotal : m.progressTotal} color={cfg.color} />
        {/* Spacer pour pousser le footer en bas (alignement uniforme entre cartes) */}
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap min-h-[20px]">
          {status && (
            <span className="text-[11px] px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor: noteTint(cfg.color, 9), color: cfg.color }}>
              {STATUS_LABEL[status]}
            </span>
          )}
          <Stars value={ratingValue} color={cfg.color} />
          {group.isSeries && group.distinctVolumes > 1 && behavior !== 'MUSIC' && (
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-text-muted/10 text-text-muted ml-auto">
              {group.distinctVolumes} {behavior === 'DEV' ? 'parties' : behavior === 'QUIZZ' ? 'quizz' : cfg.volumeLabel}
            </span>
          )}
          {behavior === 'MUSIC' && group.instances && group.instances.length > 1 && (
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-text-muted/10 text-text-muted ml-auto">
              {group.instances.length} notes
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function CollectionRow({ group, onClick, isGuest, defsById }: { group: SubjectGroup; onClick: () => void; isGuest: boolean; defsById: Record<string, NoteTypeDefLike> }) {
  const entry = group.representative;
  const cfg = resolveNoteTypeConfig(entry, defsById);
  const behavior = cfg.behavior;
  const m = entry.mediaMeta ?? {};
  const status = groupStatusOf(group);
  const lock = getLockReason(entry, isGuest);

  if (lock === 'secret') {
    return (
      <div
        className="w-full flex items-center gap-3 px-4 py-3 bg-bg-elevated rounded-xl shadow-soft text-left select-none cursor-not-allowed"
        title="Note confidentielle"
      >
        <span className="w-10 h-14 flex flex-col items-center justify-center rounded shrink-0 bg-gradient-to-br from-rose-500/15 to-rose-500/5">
          <span className="text-base leading-none">🔒</span>
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-text-primary/60 text-sm font-medium italic line-clamp-1">Confidentiel</p>
          <p className="inline-flex items-center gap-1 text-text-muted/50 text-xs mt-0.5"><cfg.Glyph className="w-3 h-3 shrink-0" /> {cfg.label}</p>
        </div>
      </div>
    );
  }
  if (lock === 'adult') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-center gap-3 px-4 py-3 bg-bg-elevated rounded-xl shadow-soft hover:ring-1 hover:ring-orange-400/30 transition-all duration-150 text-left"
      >
        <span className="w-10 h-14 flex flex-col items-center justify-center rounded shrink-0 bg-gradient-to-br from-orange-500/15 to-orange-500/5">
          <span className="text-base leading-none">🔞</span>
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-text-primary/60 text-sm font-medium italic line-clamp-1">Contenu sensible</p>
          <p className="inline-flex items-center gap-1 text-text-muted/50 text-xs mt-0.5"><cfg.Glyph className="w-3 h-3 shrink-0" /> {cfg.label} · verrouillé</p>
        </div>
      </button>
    );
  }

  const t = group.trackMeta;
  const isArtistGroup = !!group.artistName && (group.songCount ?? 0) > 1;
  const title = group.displayTitle;
  const subtitle = isArtistGroup
    ? `${group.songCount} morceaux`
    : behavior === 'MUSIC'
      ? (t ? [t.creator, t.trackTitle].filter(Boolean).join(' · ') || undefined
           : (m.creator || m.trackTitle ? [m.creator, m.trackTitle].filter(Boolean).join(' · ') : undefined))
      : m.creator;
  const cover = t ? t.coverUrl : m.coverUrl;
  const ratingValue = isArtistGroup ? undefined : (t ? t.rating : m.rating);
  const playlistName = isArtistGroup ? undefined : (t ? entry.mediaMeta?.playlistName : undefined);

  const progress = behavior === 'BOOK'
    ? bookGroupProgress(group)
    : behavior === 'MOVIE' && group.distinctVolumes > 1
      ? bookGroupProgress(group)
      : behavior === 'SERIES'
        ? seriesGroupProgress(m)
        : behavior === 'DEV'
          ? devGroupProgress(group)
          : behavior === 'QUIZZ'
            ? quizGroupProgress(group)
            : null;
  const devCount = behavior === 'DEV' ? devChapterCount(group) : undefined;
  const quizCnt = behavior === 'QUIZZ' ? quizCount(group) : undefined;
  const seriesSt = behavior === 'SERIES' ? seriesStats(m) : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 bg-bg-elevated rounded-xl shadow-soft hover:ring-1 hover:ring-text-muted/15 transition-all duration-150 text-left"
    >
      {cover ? (
        <img src={cover} alt={title} className="w-10 h-14 object-cover rounded shrink-0 shadow-sm" />
      ) : (
        <span className="w-10 h-14 flex items-center justify-center rounded shrink-0" style={{ backgroundColor: noteTint(cfg.color, 9), color: cfg.color }}>
          <cfg.Glyph className="w-5 h-5" />
        </span>
      )}
      <div className="flex-1 min-w-0">
        {playlistName && (
          <p className="text-text-muted/50 text-[11px] uppercase tracking-wide line-clamp-1 mb-0.5">{playlistName}</p>
        )}
        <p className="text-text-primary text-sm font-medium line-clamp-1">{title}</p>
        {subtitle && <p className="text-text-muted text-xs line-clamp-1 mt-0.5">{subtitle}</p>}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {progress && <span className="text-[11px] text-text-muted/60">{progress}</span>}
          <Stars value={ratingValue} color={cfg.color} />
        </div>
        <ProgressBar current={behavior === 'DEV' ? devCount : behavior === 'QUIZZ' ? quizCnt : behavior === 'SERIES' ? seriesSt?.epsWatched : m.progressCurrent} total={behavior === 'DEV' ? m.totalChapters : behavior === 'QUIZZ' ? m.totalVolumes : behavior === 'SERIES' ? seriesSt?.epsTotal : m.progressTotal} color={cfg.color} />
      </div>
      {group.isSeries && group.distinctVolumes > 1 && behavior !== 'MUSIC' && (
        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-text-muted/10 text-text-muted shrink-0">
          {group.distinctVolumes}×
        </span>
      )}
      {behavior === 'MUSIC' && group.instances && group.instances.length > 1 && (
        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-text-muted/10 text-text-muted shrink-0">
          {group.instances.length} notes
        </span>
      )}
      {status && (
        <span className="text-[11px] px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: noteTint(cfg.color, 9), color: cfg.color }}>
          {STATUS_LABEL[status]}
        </span>
      )}
    </button>
  );
}

/** Normalisation pour recherche : minuscule, sans accents, trim. Même règle que adultGate/AddCollectionItemSheet. */
function normSearch(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/**
 * Une entrée match-elle la requête texte ? On cherche dans tous les champs
 * textuels du média : titre, créateur, nom de série, album, nom de playlist,
 * et — pour les playlists MUSIC — le titre/artiste de chaque piste.
 * Filtré AVANT le regroupement pour qu'un match sur un tome/piste non
 * représentatif fasse quand même remonter le groupe.
 */
function entryMatchesQuery(e: LocalEntry, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  const m = e.mediaMeta as MediaMeta | null | undefined;
  if (!m) return false;
  const fields: (string | undefined)[] = [
    m.subject, m.creator, m.seriesName, m.trackTitle, m.playlistName,
  ];
  if (m.tracks) {
    for (const t of m.tracks) {
      fields.push(t.subject, t.creator, t.trackTitle);
    }
  }
  return fields.some((f) => f && normSearch(f).includes(normalizedQuery));
}

/** Clé de regroupement d'un morceau MUSIC : titre + artiste (normalisés). */
function musicTrackKey(subject?: string, creator?: string): string {
  const t = (subject ?? '').trim().toLowerCase();
  const c = (creator ?? '').trim().toLowerCase();
  return `${t}::${c}`;
}

function groupEntries(entries: LocalEntry[], defsById: Record<string, NoteTypeDefLike> = {}): SubjectGroup[] {
  // ── MUSIC (comportement) : collecte toutes les instances (mono + tracks de playlist), regroupe par (titre, artiste)
  const musicGroups = new Map<string, TrackInstance[]>();
  // ── Autres comportements : groupe par seriesName || subject (legacy)
  const otherMap = new Map<string, LocalEntry[]>();

  for (const e of entries) {
    if (behaviorOf(e, defsById) === 'MUSIC') {
      const isPL = isPlaylist(e.mediaMeta);
      const instances: TrackInstance[] = isPL
        ? (e.mediaMeta?.tracks ?? []).map((t, i) => ({ entry: e, trackIndex: i, trackMeta: t }))
        : [{ entry: e }];
      for (const inst of instances) {
        const track = inst.trackMeta ?? getRepresentativeTrack(inst.entry.mediaMeta);
        const key = musicTrackKey(track.subject, track.creator);
        if (key === '::') continue; // morceau sans titre ni artiste → ignoré
        const arr = musicGroups.get(key) ?? [];
        arr.push(inst);
        musicGroups.set(key, arr);
      }
    } else {
      const key = e.mediaMeta?.seriesName?.trim() || e.mediaMeta?.subject || '';
      const arr = otherMap.get(key) ?? [];
      arr.push(e);
      otherMap.set(key, arr);
    }
  }

  // Construit d'abord les groupes "morceau" intermédiaires
  const songGroups: SubjectGroup[] = [];
  for (const [, instances] of musicGroups.entries()) {
    const sorted = [...instances].sort((a, b) => {
      const ca = !!(a.trackMeta?.coverUrl ?? a.entry.mediaMeta?.coverUrl);
      const cb = !!(b.trackMeta?.coverUrl ?? b.entry.mediaMeta?.coverUrl);
      if (ca !== cb) return cb ? 1 : -1;
      return b.entry.updatedAt.localeCompare(a.entry.updatedAt);
    });
    const headInstance = sorted[0]!;
    const headTrack = headInstance.trackMeta ?? getRepresentativeTrack(headInstance.entry.mediaMeta);
    const uniqueEntries = Array.from(new Map(sorted.map((i) => [i.entry.id, i.entry])).values());

    songGroups.push({
      displayTitle: headTrack.subject?.trim() || `Morceau`,
      representative: headInstance.entry,
      all: uniqueEntries,
      isSeries: false,
      distinctVolumes: 0,
      trackMeta: headTrack,
      trackIndex: headInstance.trackIndex,
      instances: sorted,
      behavior: 'MUSIC',
    });
  }

  // 2e passe : regroupe les morceaux par artiste (équivalent musical d'une série).
  // Un artiste avec ≥ 2 morceaux distincts → 1 carte "artiste". Sinon → carte morceau individuelle.
  const byArtist = new Map<string, SubjectGroup[]>();
  const soloSongs: SubjectGroup[] = [];
  for (const sg of songGroups) {
    const creator = sg.trackMeta?.creator?.trim();
    if (!creator) { soloSongs.push(sg); continue; }
    const key = creator.toLowerCase();
    const arr = byArtist.get(key) ?? [];
    arr.push(sg);
    byArtist.set(key, arr);
  }

  const groups: SubjectGroup[] = [...soloSongs];
  for (const [, members] of byArtist.entries()) {
    if (members.length === 1) {
      groups.push(members[0]!);
      continue;
    }
    // Fusion en groupe artiste : agrège toutes les instances et entries des morceaux
    const sortedMembers = [...members].sort((a, b) => {
      const ca = !!a.trackMeta?.coverUrl;
      const cb = !!b.trackMeta?.coverUrl;
      if (ca !== cb) return cb ? 1 : -1;
      return b.representative.updatedAt.localeCompare(a.representative.updatedAt);
    });
    const allInstances = sortedMembers.flatMap((m) => m.instances ?? []);
    const allEntries = Array.from(new Map(allInstances.map((i) => [i.entry.id, i.entry])).values());
    const head = sortedMembers[0]!;
    groups.push({
      displayTitle: head.trackMeta?.creator?.trim() || 'Artiste',
      representative: head.representative,
      all: allEntries,
      isSeries: false,
      distinctVolumes: 0,
      trackMeta: head.trackMeta,
      trackIndex: head.trackIndex,
      instances: allInstances,
      artistName: head.trackMeta?.creator?.trim(),
      songCount: sortedMembers.length,
      behavior: 'MUSIC',
    });
  }

  // Groupes legacy (comportement non-MUSIC)
  for (const [key, all] of otherMap.entries()) {
    const sorted = [...all].sort((a, b) => {
      const va = a.mediaMeta?.volume ?? 0;
      const vb = b.mediaMeta?.volume ?? 0;
      if (va !== vb) return vb - va;
      return b.updatedAt.localeCompare(a.updatedAt);
    });

    const representative = sorted[0]!;
    const isSeries = all.length > 1 || !!representative.mediaMeta?.seriesName;
    const volumeSet = new Set(all.map((e) => e.mediaMeta?.volume).filter((v): v is number => v != null));
    const distinctVolumes = volumeSet.size;
    const displayTitle = representative.mediaMeta?.seriesName?.trim() || representative.mediaMeta?.subject || key;

    groups.push({ displayTitle, representative, all: sorted, isSeries, distinctVolumes, behavior: behaviorOf(representative, defsById) });
  }

  return groups;
}

function TypeSection({
  sectionKey,
  cfg,
  entries,
  onGroupClick,
  isGuest,
  defsById,
  filterGroups,
  selectMode,
  selectedItemIds,
}: {
  /** Clé stable de la section (built-in `NoteType` ou `custom:<id>`) — état de repli. */
  sectionKey: string;
  /** Config résolu (built-in ou custom) pour l'en-tête de section. */
  cfg: ResolvedNoteTypeConfig;
  entries: LocalEntry[];
  onGroupClick: (group: SubjectGroup) => void;
  isGuest: boolean;
  defsById: Record<string, NoteTypeDefLike>;
  filterGroups?: (groups: SubjectGroup[]) => SubjectGroup[];
  selectMode?: boolean;
  selectedItemIds?: Set<string>;
}) {
  // groupEntries regroupe par seriesName : notes du journal et items de
  // Collection (entries collectionOnly) partagent le même mécanisme — un seul
  // groupe par série, qu'il soit composé de notes, d'items ou d'un mélange.
  const allGroups = groupEntries(entries, defsById);
  const groups = filterGroups ? filterGroups(allGroups) : allGroups;
  // État replié/déplié persisté par type (clé unique). Visuellement le bloc
  // ressemble à une carte (bg, border, padding) pour bien séparer chaque
  // catégorie quand on a beaucoup de contenu.
  const [collapsed, toggleCollapsed] = useCollapsibleSection(`collection:${sectionKey}`, false);
  if (groups.length === 0) return null;
  const hasCover = groups.some((g) => !!(g.trackMeta?.coverUrl ?? g.representative.mediaMeta?.coverUrl));

  const statusGroups = STATUS_ORDER.map((s) => ({
    status: s,
    items: groups.filter((g) => groupStatusOf(g) === s),
  })).filter((g) => g.items.length > 0);

  return (
    <section className="mb-4 rounded-2xl bg-bg-elevated/40 border border-text-muted/10 overflow-hidden">
      <button
        type="button"
        onClick={toggleCollapsed}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-text-muted/5 transition-colors text-left"
        aria-expanded={!collapsed}
        aria-label={collapsed ? `Déplier ${cfg.labelPlural}` : `Replier ${cfg.labelPlural}`}
      >
        <cfg.Glyph className="w-5 h-5 shrink-0" style={{ color: cfg.color }} />
        <h2 className="font-serif text-lg text-text-primary flex-1 min-w-0">
          {cfg.labelPlural}
          <span className="text-xs font-sans text-text-muted/50 ml-1.5">({groups.length})</span>
        </h2>
        {/* Chevron inline (pas <ChevronToggle> qui est lui-même un bouton —
            on évite la nidification de boutons, invalide en HTML). */}
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"
          className={`text-text-muted/60 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {!collapsed && (
        <div className="px-4 pb-4 pt-1">
          {statusGroups.map(({ status, items }) => (
            <div key={status ?? 'none'} className="mb-4 last:mb-0">
              {statusGroups.length > 1 && (
                <p className="text-xs text-text-muted/50 uppercase tracking-wide mb-2">
                  {status ? STATUS_LABEL[status] : 'Sans statut'}
                </p>
              )}
              {hasCover ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] xl:grid-cols-[repeat(auto-fill,minmax(130px,1fr))] auto-rows-fr gap-2">
                  {items.map((g) => (
                    <SelectableCard
                      key={g.displayTitle}
                      group={g}
                      onGroupClick={onGroupClick}
                      isGuest={isGuest}
                      defsById={defsById}
                      selectMode={!!selectMode}
                      selected={g.all.some((e) => e.collectionOnly && selectedItemIds?.has(e.id))}
                      variant="card"
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-2 xl:max-w-[480px]">
                  {items.map((g) => (
                    <SelectableCard
                      key={g.displayTitle}
                      group={g}
                      onGroupClick={onGroupClick}
                      isGuest={isGuest}
                      defsById={defsById}
                      selectMode={!!selectMode}
                      selected={g.all.some((e) => e.collectionOnly && selectedItemIds?.has(e.id))}
                      variant="row"
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Wrap CollectionCard/Row pour ajouter le comportement de sélection multiple
 * sur les items de collection (les entries du journal restent cliquables
 * normalement pour ouvrir leur sheet).
 */
function SelectableCard({
  group,
  onGroupClick,
  isGuest,
  defsById,
  selectMode,
  selected,
  variant,
}: {
  group: SubjectGroup;
  onGroupClick: (g: SubjectGroup) => void;
  isGuest: boolean;
  defsById: Record<string, NoteTypeDefLike>;
  selectMode: boolean;
  selected: boolean;
  variant: 'card' | 'row';
}) {
  // Sélection multiple : activable uniquement sur les groupes 100% items de Collection.
  const selectable = selectMode && isCollectionOnlyGroup(group);
  const handleClick = () => onGroupClick(group);

  if (!selectable) {
    return variant === 'card'
      ? <CollectionCard group={group} onClick={handleClick} isGuest={isGuest} defsById={defsById} />
      : <CollectionRow group={group} onClick={handleClick} isGuest={isGuest} defsById={defsById} />;
  }

  return (
    <div className="relative">
      {variant === 'card'
        ? <CollectionCard group={group} onClick={handleClick} isGuest={isGuest} defsById={defsById} />
        : <CollectionRow group={group} onClick={handleClick} isGuest={isGuest} defsById={defsById} />}
      <div
        onClick={handleClick}
        className={`absolute inset-0 rounded-2xl cursor-pointer transition-colors ${selected ? 'bg-accent/15 ring-2 ring-accent/60' : 'hover:bg-text-muted/5'}`}
      />
      <div className={`absolute top-2 left-2 w-5 h-5 rounded-full border-2 flex items-center justify-center cursor-pointer transition-all shadow-sm ${selected ? 'bg-accent border-accent' : 'bg-bg-elevated border-text-muted/30'}`}>
        {selected && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
    </div>
  );
}

function useCollectionEntries(defsById: Record<string, NoteTypeDefLike>): { entries: LocalEntry[]; isLoading: boolean } {
  const { data: me } = trpc.auth.me.useQuery();
  const isGuest = me?.role === 'GUEST';

  // Recalcule le filtre Dexie quand les types custom changent (un custom peut
  // basculer collectionnable selon son comportement) → on dépend de la liste d'ids.
  const defsKey = Object.keys(defsById).sort().join(',');

  // `undefined` = requête Dexie en cours → distingue le chargement du « vide réel »
  // (TRANS-06 : éviter le flash « Aucune entrée » pendant le fetch).
  const localEntries = useLiveQuery(
    () => isGuest
      ? Promise.resolve([] as LocalEntry[])
      : db.entries
          .filter((e) => isCollectionEntry(e, defsById))
          .toArray()
          .then((entries) => entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))),
    [isGuest, defsKey], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const { data: apiEntries } = trpc.entries.list.useQuery(
    { limit: 200, order: 'desc', includeCollectionOnly: true },
    { enabled: isGuest },
  );

  if (isGuest) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries = ((apiEntries ?? []) as any[])
      .filter((e: any) => isCollectionEntry(e, defsById))
      .map((e: any) => ({
        ...e,
        date: typeof e.date === 'string' ? e.date.slice(0, 10) : new Date(e.date).toISOString().slice(0, 10),
        createdAt: typeof e.createdAt === 'string' ? e.createdAt : new Date(e.createdAt).toISOString(),
        updatedAt: typeof e.updatedAt === 'string' ? e.updatedAt : new Date(e.updatedAt).toISOString(),
        deletedAt: e.deletedAt ? (typeof e.deletedAt === 'string' ? e.deletedAt : new Date(e.deletedAt).toISOString()) : null,
        tagNames: e.tagNames ?? [],
        _dirty: false,
      } as LocalEntry));
    return { entries, isLoading: apiEntries === undefined };
  }

  return { entries: localEntries ?? [], isLoading: localEntries === undefined };
}

/**
 * Barre d'actions fixée en bas — appliquée à plusieurs items de Collection
 * (entries collectionOnly) sélectionnés simultanément. Statut groupé + suppression.
 */
function BulkCollectionActionBar({
  selectedIds,
  onDone,
}: {
  selectedIds: Set<string>;
  onDone: () => void;
}) {
  const ids = [...selectedIds];
  const count = ids.length;
  // Le statut est dans mediaMeta : on doit modifier chaque entry individuellement.
  const apply = async (status: MediaStatus) => {
    const now = new Date().toISOString();
    await db.entries.where('id').anyOf(ids).modify((e: LocalEntry) => {
      e.mediaMeta = { ...(e.mediaMeta ?? {}), status };
      e.updatedAt = now;
      e._dirty = true;
    });
    onDone();
  };
  const remove = async () => {
    const now = new Date().toISOString();
    await db.entries
      .where('id').anyOf(ids)
      .modify({ deletedAt: now, updatedAt: now, _dirty: true });
    onDone();
  };
  return (
    <div
      className="fixed bottom-[calc(var(--bottomnav-height,3.5rem)+0.5rem)] lg:bottom-4 left-0 right-0 z-40 px-3"
    >
      <div className="max-w-2xl mx-auto bg-bg-elevated rounded-2xl shadow-2xl border border-text-muted/10 px-3 py-2 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-text-muted/80 shrink-0 px-1">
          {count} sélectionné{count > 1 ? 's' : ''}
        </span>
        {([
          ['owned', '→ Possédé'],
          ['wishlist', '→ Wishlist'],
          ['ongoing', '→ En cours'],
          ['finished', '→ Terminé'],
        ] as const).map(([s, label]) => (
          <button
            key={s}
            type="button"
            onClick={() => void apply(s)}
            className="px-2.5 py-1.5 rounded-full text-[11px] border border-text-muted/15 text-text-muted hover:border-accent/40 hover:text-accent transition-colors"
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void remove()}
          className="ml-auto px-2.5 py-1.5 rounded-full text-[11px] text-danger border border-danger/30 hover:bg-danger/10 transition-colors"
        >
          Supprimer
        </button>
      </div>
    </div>
  );
}

/**
 * Dropdown de filtre par statut (Tous / Wishlist / Possédé / En cours / …).
 * Pattern cohérent avec les autres dropdowns de filtres de l'app (Verrou,
 * Capsule…). Ferme au clic extérieur ou Escape.
 */
function StatusDropdown({
  value,
  options,
  onChange,
}: {
  value: Status | 'ALL';
  options: (Status | 'ALL')[];
  onChange: (s: Status | 'ALL') => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { panelRef, panelStyle } = useDropdownAlign(open);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('touchstart', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('touchstart', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isFiltered = value !== 'ALL';
  const currentLabel = value === 'ALL' ? 'Tous les statuts' : STATUS_LABEL[value];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border transition-all duration-150 ' +
          (isFiltered
            ? 'bg-accent/10 border-accent/40 text-accent font-medium'
            : open
              ? 'border-text-muted/25 text-text-muted bg-text-muted/8'
              : 'border-text-muted/15 text-text-muted/70 hover:border-text-muted/30 hover:text-text-muted')
        }
      >
        <span>{currentLabel}</span>
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div ref={panelRef} style={panelStyle} className="absolute left-0 top-full mt-1.5 z-50 min-w-[140px] bg-bg-elevated border border-text-muted/15 rounded-xl shadow-soft overflow-hidden">
          <ul className="py-1">
            {options.map((s) => {
              const active = value === s;
              const label = s === 'ALL' ? 'Tous' : STATUS_LABEL[s];
              return (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => { onChange(s); setOpen(false); }}
                    className={
                      'w-full text-left px-3 py-1.5 text-xs transition-colors ' +
                      (active
                        ? 'text-accent font-medium bg-accent/8'
                        : 'text-text-primary hover:bg-text-muted/5')
                    }
                  >
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Grille de souvenirs ────────────────────────────────────────────────────────

type SouvenirItem = {
  src: string;
  type: 'image' | 'video';
  label: string;
  spoiler: boolean;
  entryId: string;
  entryDate: string;
  entryTitle: string | null;
  isAdult: boolean;
  adultQuestion: string | null;
  sealedUntil: string | null;
  tags: string[];
};

function groupByMonth(items: SouvenirItem[]): { key: string; label: string; items: SouvenirItem[] }[] {
  const groups = new Map<string, { label: string; items: SouvenirItem[] }>();
  for (const item of items) {
    const d = new Date(item.entryDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    if (!groups.has(key)) groups.set(key, { label, items: [] });
    groups.get(key)!.items.push(item);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, { label, items }]) => ({ key, label, items }));
}

// ── Éditeur de tags inline ─────────────────────────────────────────────────────

function TagEditor({ item, onDone }: { item: SouvenirItem; onDone: (tags: string[]) => void }) {
  const [tags, setTags] = useState<string[]>(item.tags);
  const [input, setInput] = useState('');
  const utils = trpc.useUtils();
  const setTagsMut = trpc.souvenirs.setTags.useMutation({
    onSuccess: () => utils.souvenirs.list.invalidate(),
  });

  const addTag = () => {
    const t = input.trim().toLowerCase();
    if (!t || tags.includes(t)) { setInput(''); return; }
    const next = [...tags, t];
    setTags(next);
    setInput('');
    setTagsMut.mutate({ mediaSrc: item.src, entryId: item.entryId, tags: next });
  };

  const removeTag = (tag: string) => {
    const next = tags.filter((t) => t !== tag);
    setTags(next);
    setTagsMut.mutate({ mediaSrc: item.src, entryId: item.entryId, tags: next });
  };

  return (
    <div className="souvenir-tag-editor" onClick={(e) => e.stopPropagation()}>
      <div className="souvenir-tag-list">
        {tags.map((tag) => (
          <span key={tag} className="souvenir-tag-chip">
            {tag}
            <button type="button" onClick={() => removeTag(tag)} aria-label={`Retirer ${tag}`} className="souvenir-tag-remove">×</button>
          </span>
        ))}
        <input
          className="souvenir-tag-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } if (e.key === 'Escape') onDone(tags); }}
          placeholder="+ tag"
          maxLength={80}
          autoFocus
        />
      </div>
      <button type="button" onClick={() => onDone(tags)} className="souvenir-tag-done">OK</button>
    </div>
  );
}

// ── Tuile souvenir ─────────────────────────────────────────────────────────────

function SouvenirTile({ item, onOpenNote, isGuest }: { item: SouvenirItem; onOpenNote: (id: string) => void; isGuest: boolean }) {
  const [revealedSpoiler, setRevealedSpoiler] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [editingTags, setEditingTags] = useState(false);
  const [localTags, setLocalTags] = useState(item.tags);

  const now = new Date();
  const isSealed = item.sealedUntil && new Date(item.sealedUntil) > now;
  const isAdultLocked = item.isAdult && !adultUnlocked.has(item.entryId);
  const blocked = isSealed || isAdultLocked;
  const isSpoilerHidden = item.spoiler && !revealedSpoiler;

  const handleClick = () => {
    if (editingTags) return;
    if (blocked) return;
    if (isSpoilerHidden) { setRevealedSpoiler(true); return; }
    if (item.type === 'image') setLightboxOpen(true);
  };

  return (
    <>
      <div className="souvenir-tile group" onClick={handleClick}>
        {item.type === 'image' ? (
          <img src={item.src} alt={item.label} className={`souvenir-tile-media${isSpoilerHidden ? ' souvenir-blurred' : ''}`} loading="lazy" />
        ) : (
          <video src={item.src} preload="metadata" controls={!blocked && !isSpoilerHidden} className={`souvenir-tile-media${isSpoilerHidden ? ' souvenir-blurred' : ''}`} onClick={(e) => e.stopPropagation()} />
        )}

        {isSealed ? (
          <div className="souvenir-overlay"><span className="souvenir-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Capsule scellée</span></div>
        ) : isAdultLocked ? (
          <div className="souvenir-overlay"><span className="souvenir-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Contenu 18+</span></div>
        ) : isSpoilerHidden ? (
          <div className="souvenir-overlay souvenir-overlay-clickable"><span className="souvenir-badge">🙈 Toucher pour révéler</span></div>
        ) : null}

        {!blocked && !isSpoilerHidden && (
          <>
            {/* Tags display + éditeur */}
            {editingTags ? (
              <TagEditor item={{ ...item, tags: localTags }} onDone={(t) => { setLocalTags(t); setEditingTags(false); }} />
            ) : (
              <div className="souvenir-tags-bar" onClick={(e) => e.stopPropagation()}>
                {localTags.map((t) => (
                  <span key={t} className="souvenir-tag-display">{t}</span>
                ))}
                {!isGuest && (
                  <button type="button" className="souvenir-tag-edit-btn" onClick={() => setEditingTags(true)} aria-label="Éditer les tags">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                )}
              </div>
            )}

            {/* Caption note — masquée pendant l'édition de tags pour ne pas bloquer le bouton OK */}
            {!editingTags && (
              <div className="souvenir-caption">
                <span className="souvenir-caption-title">{item.entryTitle ?? new Date(item.entryDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
                <button type="button" className="souvenir-open-note" onClick={(e) => { e.stopPropagation(); onOpenNote(item.entryId); }}>Voir →</button>
              </div>
            )}
          </>
        )}
      </div>

      {lightboxOpen && <ImageLightbox src={item.src} alt={item.label} onClose={() => setLightboxOpen(false)} />}
    </>
  );
}

// ── Helpers filtres Souvenirs ──────────────────────────────────────────────────

const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

function useSouvenirDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { panelRef, panelStyle } = useDropdownAlign(open);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return { open, setOpen, ref, panelRef, panelStyle };
}

function SouvenirMonthPicker({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const { open, setOpen, ref, panelRef, panelStyle } = useSouvenirDropdown();
  const [year, setYear] = useState(() => value ? parseInt(value.slice(0, 4)) : new Date().getFullYear());

  useEffect(() => {
    if (!open) setYear(value ? parseInt(value.slice(0, 4)) : new Date().getFullYear());
  }, [value, open]);

  const valueYear = value ? parseInt(value.slice(0, 4)) : null;
  const valueMonth = value ? parseInt(value.slice(5, 7)) : null;
  const displayLabel = value ? `${MONTHS_FR[valueMonth! - 1]} ${valueYear}` : '';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 ' +
          (value
            ? 'bg-accent/15 border-accent/40 text-accent font-medium'
            : open
              ? 'border-text-muted/20 text-text-muted bg-text-muted/8'
              : 'border-text-muted/15 text-text-muted/60 hover:border-text-muted/30 hover:text-text-muted')
        }
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        {value ? displayLabel : placeholder}
        {value ? (
          <span
            role="button"
            className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity leading-none"
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </span>
        ) : (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform duration-100 ${open ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"/></svg>
        )}
      </button>

      {open && (
        <div ref={panelRef} style={panelStyle} className="absolute left-0 top-full mt-1.5 z-50 bg-bg-elevated border border-text-muted/15 rounded-xl shadow-soft overflow-hidden w-[180px]">
          <div className="flex items-center justify-between px-3 py-2 border-b border-text-muted/10">
            <button type="button" onClick={() => setYear((y) => y - 1)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-text-muted/8 text-text-muted transition-colors">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span className="text-xs font-medium text-text-primary">{year}</span>
            <button type="button" onClick={() => setYear((y) => y + 1)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-text-muted/8 text-text-muted transition-colors">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
          <div className="grid grid-cols-3 gap-0.5 p-2">
            {MONTHS_FR.map((m, i) => {
              const isSelected = valueYear === year && valueMonth === i + 1;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => { onChange(`${year}-${String(i + 1).padStart(2, '0')}`); setOpen(false); }}
                  className={
                    'py-1.5 rounded-lg text-[11px] font-medium transition-colors ' +
                    (isSelected ? 'bg-accent text-white' : 'text-text-primary hover:bg-text-muted/8')
                  }
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SouvenirTagFilter({ allTags, selected, onChange }: {
  allTags: string[];
  selected: Set<string>;
  onChange: (tags: Set<string>) => void;
}) {
  const { open, setOpen, ref, panelRef, panelStyle } = useSouvenirDropdown();

  const isActive = selected.size > 0;
  const label = isActive
    ? selected.size === 1 ? `#${[...selected][0]}` : `Tags · ${selected.size}`
    : 'Tags';

  if (allTags.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 ' +
          (isActive
            ? 'bg-accent/15 border-accent/40 text-accent font-medium'
            : open
              ? 'border-text-muted/20 text-text-muted bg-text-muted/8'
              : 'border-text-muted/15 text-text-muted/60 hover:border-text-muted/30 hover:text-text-muted')
        }
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>
        </svg>
        {label}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform duration-100 ${open ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"/></svg>
      </button>

      {open && (
        <div ref={panelRef} style={panelStyle} className="absolute left-0 top-full mt-1.5 z-50 bg-bg-elevated border border-text-muted/15 rounded-xl shadow-soft overflow-hidden min-w-[150px] max-w-[220px]">
          <div className="py-1 max-h-52 overflow-y-auto">
            {allTags.map((tag) => {
              const isTagSelected = selected.has(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    const next = new Set(selected);
                    isTagSelected ? next.delete(tag) : next.add(tag);
                    onChange(next);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left hover:bg-text-muted/5 transition-colors"
                >
                  <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${isTagSelected ? 'bg-accent/20 border-accent/50' : 'border-text-muted/30'}`}>
                    {isTagSelected && (
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent"><polyline points="20 6 9 17 4 12"/></svg>
                    )}
                  </span>
                  <span className={isTagSelected ? 'font-medium text-accent' : 'text-text-primary'}>{tag}</span>
                </button>
              );
            })}
          </div>
          {isActive && (
            <div className="border-t border-text-muted/10 px-3 py-1.5">
              <button
                type="button"
                onClick={() => { onChange(new Set()); setOpen(false); }}
                className="text-[11px] text-text-muted/50 hover:text-text-muted transition-colors"
              >
                Effacer
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Grille principale ──────────────────────────────────────────────────────────

function SouvenirsGrid({ isGuest, filterFrom, filterTo, filterTags }: {
  isGuest: boolean;
  filterFrom: string;
  filterTo: string;
  filterTags: Set<string>;
}) {
  const { data, isLoading } = trpc.souvenirs.list.useQuery(undefined, { staleTime: 30_000 });
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleMonth = useCallback((key: string) => {
    setCollapsed((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }, []);

  if (isLoading) return <p className="text-text-muted font-serif italic">Chargement…</p>;

  if (!data || data.length === 0) {
    return (
      <div className="py-12 text-center text-text-muted">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 opacity-40"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        <p className="text-sm font-serif italic">{isGuest ? 'Aucun souvenir partagé.' : 'Aucun souvenir pour le moment.'}</p>
        {!isGuest && <p className="text-xs mt-1 opacity-70">Marque des photos ou vidéos comme ⭐ Souvenir depuis l'éditeur.</p>}
      </div>
    );
  }

  const allItems = data as SouvenirItem[];

  const filtered = allItems.filter((item) => {
    const monthKey = item.entryDate.slice(0, 7);
    if (filterFrom && monthKey < filterFrom) return false;
    if (filterTo   && monthKey > filterTo)   return false;
    if (filterTags.size > 0 && !item.tags.some((t) => filterTags.has(t))) return false;
    return true;
  });

  const hasFilters = !!(filterFrom || filterTo || filterTags.size > 0);
  const groups = groupByMonth(filtered);

  return (
    <>
      {hasFilters && filtered.length === 0 && (
        <p className="text-xs text-text-muted mb-4 font-serif italic">Aucun souvenir ne correspond à ces filtres.</p>
      )}

      {/* ── Groupes par mois ── */}
      {groups.map(({ key, label, items }) => {
        const isCollapsed = collapsed.has(key);
        return (
          <div key={key} className="mb-8">
            <button type="button" onClick={() => toggleMonth(key)} className="flex items-center gap-2 mb-3 w-full text-left">
              <h3 className="text-sm font-semibold text-text-primary capitalize">{label}</h3>
              <span className="text-xs text-text-muted">{isCollapsed ? `${items.length} souvenir${items.length > 1 ? 's' : ''}` : ''}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`ml-auto text-text-muted transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {!isCollapsed && (
              <div className="souvenir-grid">
                {items.map((item, idx) => (
                  <SouvenirTile key={`${item.entryId}-${idx}`} item={item} onOpenNote={setOpenEntryId} isGuest={isGuest} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {openEntryId && <SouvenirReaderModal entryId={openEntryId} onClose={() => setOpenEntryId(null)} />}
    </>
  );
}

// ── Page principale ────────────────────────────────────────────────────────────

export function CollectionPage() {
  const { data: me } = trpc.auth.me.useQuery();
  const isGuest = me?.role === 'GUEST';
  const ownerId = me?.id ?? '';
  const { defs, defsById } = useNoteTypeDefs();

  const [activeTab, setActiveTab] = useState<'collection' | 'souvenirs'>('collection');
  // Clé de filtre de type : 'ALL', un comportement built-in collectionnable, ou
  // `custom:<id>` pour un type personnalisé. Un custom apparaît dans sa propre
  // section/pill (il n'est pas fondu dans son comportement, pour rester lisible).
  const [activeType, setActiveType] = useState<string>('ALL');
  const [activeStatus, setActiveStatus] = useState<Status | 'ALL'>('ALL');
  const [collectionQuery, setCollectionQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<SubjectGroup | null>(null);

  // Filtres Souvenirs — remontés ici pour être dans la barre sticky
  const [souvenirFilterFrom, setSouvenirFilterFrom] = useState('');
  const [souvenirFilterTo, setSouvenirFilterTo] = useState('');
  const [souvenirFilterTags, setSouvenirFilterTags] = useState<Set<string>>(new Set());
  const resetSouvenirFilters = useCallback(() => {
    setSouvenirFilterFrom(''); setSouvenirFilterTo(''); setSouvenirFilterTags(new Set());
  }, []);

  const { data: souvenirData } = trpc.souvenirs.list.useQuery(undefined, {
    enabled: activeTab === 'souvenirs',
    staleTime: 30_000,
  });
  const souvenirAllTags = useMemo(
    () => [...new Set((souvenirData as SouvenirItem[] ?? []).flatMap((i) => i.tags))].sort(),
    [souvenirData],
  );
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  // Mode sélection multiple — appliqué aux items de collection uniquement.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  // Pré-remplissage de la sheet d'ajout quand on clique "Ajouter d'autres tomes"
  // depuis une série collection existante.
  const [addPrefill, setAddPrefill] = useState<{ noteType: AddNoteType; seriesName: string; creator?: string; startFrom: number } | null>(null);

  const exitSelectMode = () => { setSelectMode(false); setSelectedItemIds(new Set()); };
  /** Toggle l'ensemble des items d'un groupe — si AU MOINS un est sélectionné, on désélectionne tout ; sinon on sélectionne tout. */
  const toggleSelectGroup = (ids: string[]) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      const anySelected = ids.some((id) => next.has(id));
      if (anySelected) {
        for (const id of ids) next.delete(id);
      } else {
        for (const id of ids) next.add(id);
      }
      return next;
    });
  };

  const { entries: allEntries, isLoading: entriesLoading } = useCollectionEntries(defsById);

  // Clé de section d'une entrée : son `custom:<id>` si custom, sinon son built-in.
  // Sépare visuellement chaque type custom (un « Comics » héritant de BOOK a sa
  // propre section, distincte des Livres) tout en gardant la même clé que la pill.
  const sectionKeyOf = (e: LocalEntry): string =>
    e.noteType === 'CUSTOM' && e.customTypeId ? `custom:${e.customTypeId}` : e.noteType;

  // Sections de collection : built-ins collectionnables (hors JOURNAL/AGENDA/FINANCE)
  // + types custom dont le COMPORTEMENT est collectionnable. Chaque section porte
  // sa clé + son config résolu (pour l'en-tête et la pill).
  const collectionSections: { key: string; cfg: ResolvedNoteTypeConfig }[] = [
    ...COLLECTION_TYPES.map((c) => ({ key: c.value as string, cfg: resolveBuiltinConfig(c.value) })),
    ...defs
      .filter((d) => d.behavior !== 'JOURNAL' && d.behavior !== 'AGENDA' && d.behavior !== 'FINANCE')
      .map((d) => ({ key: `custom:${d.id}`, cfg: resolveDefConfig(d) })),
  ];

  // Recherche texte : filtrée AVANT le regroupement (cf. entryMatchesQuery).
  const normalizedQuery = normSearch(collectionQuery);
  const filteredEntries = allEntries.filter(
    (e) =>
      (activeType === 'ALL' || sectionKeyOf(e) === activeType) &&
      entryMatchesQuery(e, normalizedQuery),
  );

  // Filtre par statut appliqué après le regroupement (le statut "série terminée"
  // se lit au niveau du groupe).
  const filterByStatus = (groups: SubjectGroup[]) =>
    activeStatus === 'ALL' ? groups : groups.filter((g) => groupStatusOf(g) === activeStatus);

  const byType = collectionSections.map((section) => ({
    key: section.key,
    cfg: section.cfg,
    entries: filteredEntries.filter((e) => sectionKeyOf(e) === section.key),
  })).filter((g) => g.entries.length > 0);

  // Compteur affiché en haut : total des groupes (post-filtrage statut).
  const totalGroups = byType.reduce(
    (sum, { entries }) => sum + filterByStatus(groupEntries(entries, defsById)).length,
    0,
  );

  // Statuts disponibles dans la sélection courante — on n'affiche les pills que
  // pour les statuts qui matchent au moins un groupe (évite les filtres vides).
  const availableStatuses: (Status | 'ALL')[] = (() => {
    const all = byType.flatMap(({ entries }) => groupEntries(entries, defsById));
    const present = new Set<Status>();
    for (const g of all) {
      const s = groupStatusOf(g);
      if (s) present.add(s);
      // Scan individual entry statuses too so "Wishlist" appears even when
      // mixed-status series derive a different group status (e.g. 'owned').
      for (const e of g.all) {
        const es = statusOf(e);
        if (es) present.add(es);
      }
    }
    const list: (Status | 'ALL')[] = ['ALL'];
    for (const s of ['wishlist', 'owned', 'ongoing', 'finished', 'abandoned'] as const) {
      if (present.has(s)) list.push(s);
    }
    return list;
  })();

  // Au moins un item de Collection existe → on affiche le bouton "Modifier en lot".
  const hasCollectionItems = allEntries.some((e) => e.collectionOnly);

  // Callbacks partagés entre le panneau desktop et la sheet mobile
  // « Ajouter d'autres tomes » : disponible pour tout groupe au COMPORTEMENT
  // BOOK (built-in Livre ou type custom héritant de BOOK).
  const handleAddMoreVolumes = selectedGroup && !isGuest && isCollectionOnlyGroup(selectedGroup) && selectedGroup.behavior === 'BOOK'
    ? () => {
        const maxVolume = selectedGroup.all.reduce((max, e) => Math.max(max, e.mediaMeta?.volume ?? 0), 0);
        setSelectedGroup(null);
        setAddPrefill({
          noteType: 'BOOK' as AddNoteType,
          seriesName: selectedGroup.displayTitle,
          creator: selectedGroup.representative.mediaMeta?.creator,
          startFrom: maxVolume + 1,
        });
        setAddSheetOpen(true);
      }
    : undefined;

  const handleBulkMetaEdit = selectedGroup && !isGuest && !(selectedGroup.artistName && (selectedGroup.songCount ?? 0) > 1)
    ? async (patch: import('../components/EntrySheet').BulkMetaPatch) => {
        if (selectedGroup.instances) {
          const byEntryId = new Map<string, LocalEntry>();
          for (const inst of selectedGroup.instances) {
            const current = byEntryId.get(inst.entry.id) ?? { ...inst.entry };
            const meta = (current.mediaMeta ?? {}) as MediaMeta;
            if (inst.trackIndex === undefined) {
              current.mediaMeta = { ...meta, ...patch };
            } else {
              const tracks = [...(meta.tracks ?? [])];
              tracks[inst.trackIndex] = { ...tracks[inst.trackIndex], ...patch };
              current.mediaMeta = { ...meta, tracks };
            }
            current._dirty = true;
            current.updatedAt = new Date().toISOString();
            byEntryId.set(inst.entry.id, current);
          }
          await db.entries.bulkPut(Array.from(byEntryId.values()));
        } else {
          const updated = selectedGroup.all.map((e) => ({
            ...e,
            mediaMeta: { ...(e.mediaMeta ?? {} as MediaMeta), ...patch } as MediaMeta,
            updatedAt: new Date().toISOString(),
            _dirty: true,
          }));
          await db.entries.bulkPut(updated);
        }
        setSelectedGroup(null);
      }
    : undefined;

  return (
    <div className="xl:flex xl:h-screen xl:overflow-hidden">

      {/* Colonne gauche — la `border-r` n'apparaît que quand le panneau droit
          est mounté (sélection / sheet d'ajout), sinon elle laisse une ligne
          verticale flottante au bord droit de la page. */}
      <div className={`lg:px-12 xl:flex-1 xl:min-w-0 xl:h-full xl:overflow-y-auto xl:overflow-x-hidden hide-scrollbar pb-48 sm:pb-56 xl:pb-8 ${selectedGroup || addSheetOpen ? 'xl:border-r xl:border-text-muted/[0.08]' : ''}`}>

        {/* En-tête unifié — même composant que Fil / Demandes / Stats */}
        <PageHeader
          title="Collection"
          kicker={totalGroups > 0 ? `${totalGroups} titre${totalGroups > 1 ? 's' : ''}` : 'Collection'}
        />

        {/* Barre de filtres sticky — wrappée dans une card cocoa cohérente avec
            le reste de l'app (Home, Timeline, GuestHome…). Bordures rondes,
            shadow-soft, bg-bg-elevated. */}
        <div className="sticky top-[var(--page-header-h,80px)] z-[10] mb-4 mx-6 lg:mx-0 bg-bg-elevated rounded-2xl shadow-soft">

          {/* Ligne 1 : pills de type (Tout / Livre / Série / …) + onglet Souvenirs */}
          <HScroll className="px-3 pt-2.5 pb-2">
            <div className="flex items-center gap-1.5 min-w-max">
              <button
                type="button"
                onClick={() => { setActiveTab('collection'); setActiveType('ALL'); }}
                className={`px-3 py-1.5 rounded-full text-xs border transition-all duration-150 whitespace-nowrap ${
                  activeTab === 'collection' && activeType === 'ALL'
                    ? 'border-accent/40 bg-accent/10 text-accent font-medium'
                    : 'border-text-muted/15 text-text-muted hover:border-text-muted/30 hover:text-text-primary'
                }`}
              >
                Tout
              </button>
              {collectionSections.filter((section) => allEntries.some((e) => sectionKeyOf(e) === section.key)).map(({ key, cfg }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setActiveTab('collection'); setActiveType(key); }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-all duration-150 whitespace-nowrap ${
                    activeType === key
                      ? 'font-medium'
                      : 'border-text-muted/15 text-text-muted hover:border-text-muted/30 hover:text-text-primary'
                  }`}
                  style={activeType === key
                    ? { backgroundColor: noteTint(cfg.color, 13), color: cfg.color, borderColor: noteTint(cfg.color, 31) }
                    : undefined}
                >
                  <cfg.Glyph className="w-3.5 h-3.5 shrink-0" /> {cfg.label}
                </button>
              ))}
              <span className="w-px h-4 bg-text-muted/20 mx-1 shrink-0" aria-hidden />
              <button
                type="button"
                onClick={() => setActiveTab('souvenirs')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-all duration-150 whitespace-nowrap ${
                  activeTab === 'souvenirs'
                    ? 'border-amber-400/50 bg-amber-400/10 text-amber-500 font-medium'
                    : 'border-text-muted/15 text-text-muted hover:border-text-muted/30 hover:text-text-primary'
                }`}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill={activeTab === 'souvenirs' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                Souvenirs
              </button>
            </div>
          </HScroll>

          {/* Ligne recherche — toujours visible sur l'onglet collection (même
              sans résultat, pour pouvoir effacer). font-size 16px = pas de zoom
              auto Safari sur focus. */}
          {activeTab === 'collection' && (
            <div className="px-3 pb-2 pt-0.5">
              <div className="relative">
                <svg
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted/50 pointer-events-none"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="search"
                  value={collectionQuery}
                  onChange={(e) => setCollectionQuery(e.target.value)}
                  placeholder="Rechercher un titre, un auteur…"
                  className="w-full text-base sm:text-sm rounded-full border border-text-muted/15 bg-bg-primary/50 pl-8 pr-8 py-1.5 text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/40 transition-colors"
                />
                {collectionQuery && (
                  <button
                    type="button"
                    onClick={() => setCollectionQuery('')}
                    aria-label="Effacer la recherche"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-text-muted/60 hover:text-text-primary hover:bg-text-muted/10 transition-colors"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Ligne 2 : dropdown statut (si plusieurs dispo) + actions à droite.
              Pas de border-t marquée — c'est juste un padding qui sépare. */}
          {activeTab === 'collection' && (availableStatuses.length > 1 || !isGuest) && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 pb-2.5 pt-1">
              {availableStatuses.length > 1 && (
                <StatusDropdown
                  value={activeStatus}
                  options={availableStatuses}
                  onChange={setActiveStatus}
                />
              )}

              {/* Actions (owner only) — alignées à droite, en boutons-pills discrets. */}
              {!isGuest && (
                <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                  <button
                    type="button"
                    onClick={() => { setSelectedGroup(null); setAddSheetOpen(true); }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-accent/10 text-accent border border-accent/20 hover:bg-accent/15 transition-colors"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Ajouter
                  </button>
                  {hasCollectionItems && (
                    <button
                      type="button"
                      onClick={selectMode ? exitSelectMode : () => setSelectMode(true)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] border transition-colors ${
                        selectMode
                          ? 'bg-warning/10 text-warning border-warning/30'
                          : 'text-text-muted/70 border-text-muted/15 hover:text-text-primary hover:border-text-muted/30'
                      }`}
                    >
                      {selectMode ? 'Annuler' : 'Modifier en lot'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Ligne 2 : filtres Souvenirs */}
          {activeTab === 'souvenirs' && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 pb-2.5 pt-1 border-t border-text-muted/[0.06]">
              <SouvenirTagFilter
                allTags={souvenirAllTags}
                selected={souvenirFilterTags}
                onChange={setSouvenirFilterTags}
              />
              <SouvenirMonthPicker
                value={souvenirFilterFrom}
                onChange={setSouvenirFilterFrom}
                placeholder="Depuis…"
              />
              <span className="text-text-muted/45 text-[11px] select-none">—</span>
              <SouvenirMonthPicker
                value={souvenirFilterTo}
                onChange={setSouvenirFilterTo}
                placeholder="Jusqu'à…"
              />
              {(souvenirFilterFrom || souvenirFilterTo || souvenirFilterTags.size > 0) && (
                <button
                  type="button"
                  onClick={resetSouvenirFilters}
                  className="text-[11px] text-text-muted/50 hover:text-text-muted transition-colors ml-1"
                >
                  Réinitialiser
                </button>
              )}
            </div>
          )}
        </div>{/* fin sticky filtres */}

        <div className="px-6 lg:px-0">
          <div className="mt-6">
            {activeTab === 'souvenirs' ? (
              <SouvenirsGrid
                isGuest={isGuest}
                filterFrom={souvenirFilterFrom}
                filterTo={souvenirFilterTo}
                filterTags={souvenirFilterTags}
              />
            ) : entriesLoading && totalGroups === 0 ? (
              // Squelette tant que les données chargent — évite le flash « Aucune
              // entrée » (TRANS-06), surtout côté confident (fetch API).
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" aria-hidden>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="rounded-xl bg-text-muted/[0.06] animate-pulse" style={{ aspectRatio: '2 / 3' }} />
                ))}
              </div>
            ) : byType.length === 0 || totalGroups === 0 ? (
              <p className="text-text-muted font-serif italic">
                {normalizedQuery
                  ? `Aucun média ne correspond à « ${collectionQuery.trim()} ».`
                  : byType.length === 0 ? 'Aucune entrée dans cette catégorie.' : 'Aucun titre ne correspond à ce filtre.'}
              </p>
            ) : (
              byType.map(({ key, cfg, entries }) => (
                <TypeSection
                  key={key}
                  sectionKey={key}
                  cfg={cfg}
                  entries={entries}
                  onGroupClick={(g) => {
                    if (selectMode && isCollectionOnlyGroup(g)) {
                      toggleSelectGroup(g.all.map((e) => e.id));
                      return;
                    }
                    setSelectedGroup(g);
                  }}
                  isGuest={isGuest}
                  defsById={defsById}
                  filterGroups={filterByStatus}
                  selectMode={selectMode}
                  selectedItemIds={selectedItemIds}
                />
              ))
            )}
          </div>
        </div>

        <div className="xl:hidden">
          <AddCollectionItemSheet
            open={addSheetOpen}
            onClose={() => { setAddSheetOpen(false); setAddPrefill(null); }}
            ownerId={ownerId}
            prefill={addPrefill ?? undefined}
          />
        </div>

        {selectMode && selectedItemIds.size > 0 && (
          <BulkCollectionActionBar
            selectedIds={selectedItemIds}
            onDone={exitSelectMode}
          />
        )}

        <BackToTop panelOpen={!!selectedGroup} />
        {isGuest ? <GuestBottomNav /> : <BottomNav />}
      </div>

      {/* Panneau droit — desktop uniquement, monté seulement quand un titre
          est sélectionné ou que la sheet d'ajout est ouverte. Sinon, la
          colonne gauche prend toute la largeur (cohérent avec le Journal). */}
      {(selectedGroup || addSheetOpen) && (
        <div data-right-panel className="hidden xl:flex xl:w-[640px] xl:shrink-0 flex-col h-full overflow-hidden">
          {selectedGroup ? (
            <EntrySheet
              inline
              entries={selectedGroup.all}
              displayTitle={selectedGroup.displayTitle}
              trackMeta={selectedGroup.trackMeta}
              trackIndex={selectedGroup.trackIndex}
              trackInstances={selectedGroup.instances}
              artistName={selectedGroup.artistName}
              songCount={selectedGroup.songCount}
              onAddMoreVolumes={handleAddMoreVolumes}
              onClose={() => setSelectedGroup(null)}
              onBulkMetaEdit={handleBulkMetaEdit}
            />
          ) : (
            <AddCollectionItemSheet
              inline
              open={addSheetOpen}
              onClose={() => { setAddSheetOpen(false); setAddPrefill(null); }}
              ownerId={ownerId}
              prefill={addPrefill ?? undefined}
            />
          )}
        </div>
      )}

      {/* Sheet mobile — masquée en xl */}
      {selectedGroup && (
        <div className="xl:hidden">
          <EntrySheet
            entries={selectedGroup.all}
            displayTitle={selectedGroup.displayTitle}
            trackMeta={selectedGroup.trackMeta}
            trackIndex={selectedGroup.trackIndex}
            trackInstances={selectedGroup.instances}
            artistName={selectedGroup.artistName}
            songCount={selectedGroup.songCount}
            onAddMoreVolumes={handleAddMoreVolumes}
            onClose={() => setSelectedGroup(null)}
            onBulkMetaEdit={handleBulkMetaEdit}
          />
        </div>
      )}
    </div>
  );
}
