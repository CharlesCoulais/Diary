import type { ReactNode } from 'react';

/**
 * Configuration partagée des blocs « extrait / citation » (livre, paroles,
 * film/série). Un seul node Tiptap `excerpt` paramétré par `kind` ; cette config
 * pilote l'icône, la couleur, les champs de métadonnées et le résumé d'en-tête.
 * Utilisée à la fois côté édition (ExcerptNodeView) et lecture (AnnotatedReader).
 */
export type ExcerptKind = 'book' | 'lyrics' | 'movie';

export interface ExcerptField {
  key: string;
  label: string;
  /** Saisie numérique (chapitre, page, saison, épisode) — clavier numérique mobile. */
  numeric?: boolean;
}

export interface ExcerptSummary {
  title: string;
  byline: string | null;
  refs: string[];
}

export interface ExcerptKindConfig {
  kind: ExcerptKind;
  /** Libellé du bouton + état vide de l'en-tête. */
  label: string;
  /** Variable CSS de couleur (cf. tokens.css). */
  colorVar: string;
  icon: ReactNode;
  fields: ExcerptField[];
  summarize: (v: Record<string, string>) => ExcerptSummary;
}

const bookIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

const lyricsIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {/* Micro — distinct de l'icône « notes » de l'insertion audio */}
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="22" />
  </svg>
);

const movieIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="2.18" />
    <line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="17" x2="7" y2="17" />
    <line x1="17" y1="17" x2="22" y2="17" /><line x1="17" y1="7" x2="22" y2="7" />
  </svg>
);

const list = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean) as string[];

export const EXCERPT_KINDS: Record<ExcerptKind, ExcerptKindConfig> = {
  book: {
    kind: 'book',
    label: 'Extrait de livre',
    colorVar: 'var(--color-note-book)',
    icon: bookIcon,
    fields: [
      { key: 'title', label: 'Titre' },
      { key: 'author', label: 'Auteur' },
      { key: 'chapter', label: 'Chapitre', numeric: true },
      { key: 'page', label: 'Page', numeric: true },
    ],
    summarize: (v) => ({
      title: v.title || 'Extrait',
      byline: v.author || null,
      refs: list(v.chapter && `ch. ${v.chapter}`, v.page && `p. ${v.page}`),
    }),
  },
  lyrics: {
    kind: 'lyrics',
    label: 'Extrait de paroles',
    colorVar: 'var(--color-note-music)',
    icon: lyricsIcon,
    fields: [
      { key: 'title', label: 'Titre' },
      { key: 'artist', label: 'Artiste' },
      { key: 'album', label: 'Album' },
    ],
    summarize: (v) => ({
      title: v.title || 'Paroles',
      byline: v.artist || null,
      refs: list(v.album),
    }),
  },
  movie: {
    kind: 'movie',
    label: 'Citation film / série',
    colorVar: 'var(--color-note-movie)',
    icon: movieIcon,
    fields: [
      { key: 'title', label: 'Titre' },
      { key: 'character', label: 'Personnage' },
      { key: 'season', label: 'Saison', numeric: true },
      { key: 'episode', label: 'Épisode', numeric: true },
    ],
    summarize: (v) => ({
      title: v.title || 'Citation',
      byline: v.character || null,
      refs: list(v.season && `saison ${v.season}`, v.episode && `ép. ${v.episode}`),
    }),
  },
};

export const EXCERPT_KIND_LIST: ExcerptKindConfig[] = [
  EXCERPT_KINDS.book,
  EXCERPT_KINDS.lyrics,
  EXCERPT_KINDS.movie,
];

/** Renvoie le kind si le tag markdown (`book`/`lyrics`/`movie`) est connu. */
export function excerptKindForTag(tag: string): ExcerptKind | null {
  return tag === 'book' || tag === 'lyrics' || tag === 'movie' ? tag : null;
}

/** Tags markdown reconnus, pour les regex de conteneurs imbriqués. */
export const EXCERPT_TAGS = ['book', 'lyrics', 'movie'] as const;
