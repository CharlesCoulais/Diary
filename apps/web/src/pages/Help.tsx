import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { marked } from 'marked';
import { trpc } from '../lib/trpc';
import { PageHeader } from '../components/PageHeader';

type Role = 'OWNER' | 'GUEST';
type GuestAccess = 'ALL' | 'CONFIDANT' | 'SPECIFIC' | null | undefined;

type Article = {
  slug: string;
  title: string;
  desc: string;
  badges: ('owner' | 'confidant' | 'guest' | 'all')[];
  category: 'concepts' | 'pages';
};

const ARTICLES: Article[] = [
  // Concepts
  { slug: 'roles', title: 'Rôles et permissions', desc: 'Owner, Guest, Confidant : qui voit quoi.', badges: ['all'], category: 'concepts' },
  { slug: 'types-notes', title: 'Types de notes', desc: 'Journal, Livre, Série, Film et leurs métadonnées.', badges: ['all'], category: 'concepts' },
  { slug: 'conversations', title: 'Conversations 💬', desc: 'Intégrer un extrait WhatsApp, Slack, Discord, SMS dans une note.', badges: ['owner'], category: 'concepts' },
  { slug: 'diagrammes', title: 'Diagrammes 📊', desc: 'Insérer un schéma Mermaid (organigramme, séquence, gantt…) dans une note.', badges: ['owner'], category: 'concepts' },
  { slug: 'quizz', title: 'Quizz 🎯', desc: 'Créer un quiz (QCM ou réponse libre) que chacun peut faire ; voir les réponses.', badges: ['all'], category: 'concepts' },
  { slug: 'reactions', title: 'Réactions emoji', desc: 'Réagir à une note ou un commentaire avec un emoji.', badges: ['all'], category: 'concepts' },
  { slug: 'favoris', title: 'Favoris & À oublier', desc: 'Notation personnelle d\'une note (★ favoris ou ⊘ à oublier).', badges: ['all'], category: 'concepts' },
  { slug: 'spoilers', title: 'Spoilers', desc: 'Cacher un passage de note ou de commentaire (||texte||), révélé au clic.', badges: ['all'], category: 'concepts' },
  { slug: 'notes-a-venir', title: 'Notes à venir', desc: 'Bloc-notes rapide pour capturer des idées d\'écriture.', badges: ['owner', 'confidant'], category: 'concepts' },
  { slug: 'adulte', title: 'Contenu 18+', desc: 'Marquer une note comme sensible et la protéger par une question.', badges: ['all'], category: 'concepts' },
  { slug: 'verrou', title: 'Verrou de lecture 🔒', desc: 'Conditionner l\'accès d\'une note à une réponse du guest.', badges: ['all'], category: 'concepts' },
  { slug: 'securite', title: 'Sécurité (PIN, 2FA)', desc: 'Verrouillage de l\'app, double authentification, sessions.', badges: ['all'], category: 'concepts' },
  { slug: 'notifications', title: 'Notifications', desc: 'Cloche in-app et notifications push.', badges: ['all'], category: 'concepts' },
  // Pages
  { slug: 'journal', title: 'Journal — l\'accueil', desc: 'L\'écran principal. Vues différentes pour Owner et Guest.', badges: ['all'], category: 'pages' },
  { slug: 'timeline', title: 'Timeline', desc: 'Vue chronologique de tout ton journal.', badges: ['owner'], category: 'pages' },
  { slug: 'calendrier', title: 'Calendrier', desc: 'Grille mensuelle visuelle.', badges: ['owner'], category: 'pages' },
  { slug: 'barometre', title: 'Baromètre', desc: 'Suivi de la stabilité du couple, une couleur par jour.', badges: ['owner', 'confidant'], category: 'pages' },
  { slug: 'tasks', title: 'Tâches', desc: 'Système de tâches avec statuts, priorités, dates.', badges: ['owner', 'confidant'], category: 'pages' },
  { slug: 'collection', title: 'Collection', desc: 'Bibliothèque de tes lectures, films, séries…', badges: ['owner', 'confidant'], category: 'pages' },
  { slug: 'contacts', title: 'Contacts 📇', desc: 'Ton carnet d\'adresses, partagé en lecture avec le confident.', badges: ['owner', 'confidant'], category: 'pages' },
  { slug: 'stats', title: 'Stats', desc: 'Streaks, heatmap annuel, répartition par type.', badges: ['owner', 'confidant'], category: 'pages' },
  { slug: 'fil', title: 'Fil (commentaires)', desc: 'Activité de tous les fils de discussion.', badges: ['all'], category: 'pages' },
  { slug: 'messagerie', title: 'Messagerie', desc: 'Discussion directe owner ↔ confident via la bulle flottante.', badges: ['owner', 'confidant'], category: 'pages' },
  { slug: 'demandes', title: 'Demandes', desc: 'Système de tickets léger entre Confidant et Owner.', badges: ['owner', 'confidant'], category: 'pages' },
  { slug: 'brouillons', title: 'Brouillons', desc: 'Tes notes en chantier.', badges: ['owner'], category: 'pages' },
  { slug: 'reglages', title: 'Réglages', desc: 'Préférences, sécurité, gestion des guests.', badges: ['all'], category: 'pages' },
];

const BADGE_INFO: Record<Article['badges'][number], { label: string; emoji: string; cls: string }> = {
  owner: { label: 'Owner', emoji: '👑', cls: 'bg-accent/15 text-accent border-accent/30' },
  confidant: { label: 'Confidant', emoji: '🤝', cls: 'bg-warning/15 text-warning border-warning/30' },
  guest: { label: 'Guest', emoji: '👤', cls: 'bg-text-muted/10 text-text-muted border-text-muted/20' },
  all: { label: 'Tous', emoji: '🌍', cls: 'bg-success/15 text-success border-success/30' },
};

function Badge({ kind }: { kind: Article['badges'][number] }) {
  const b = BADGE_INFO[kind];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full border ${b.cls}`}>
      <span>{b.emoji}</span>
      <span>{b.label}</span>
    </span>
  );
}

function isAccessible(article: Article, role: Role, guestAccess: GuestAccess): boolean {
  if (article.badges.includes('all')) return true;
  if (role === 'OWNER') return article.badges.includes('owner');
  // GUEST
  if (article.badges.includes('guest')) return true;
  if (guestAccess === 'CONFIDANT' && article.badges.includes('confidant')) return true;
  return false;
}

// HelpHeader → utilise PageHeader unifié
const HelpHeader = PageHeader;

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function triggerDownload(filename: string, content: string, mime = 'text/markdown') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadAllArticles(visibleArticles: Article[]) {
  const parts: string[] = [
    '# Centre d\'aide — Journal Cozy',
    '',
    `_Export généré le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}_`,
    '',
    '---',
    '',
    '## Sommaire',
    '',
    ...visibleArticles.map((a) => `- **${a.title}** — ${a.desc}`),
    '',
    '---',
    '',
  ];
  for (const a of visibleArticles) {
    try {
      const res = await fetch(`/help/${a.slug}.md`);
      if (!res.ok) continue;
      const md = await res.text();
      parts.push(md.trim(), '', '---', '');
    } catch { /* skip */ }
  }
  triggerDownload('journal-cozy-aide.md', parts.join('\n'));
}

/**
 * Liste des articles d'aide sans wrapper de page (titre, BottomNav…).
 * Utilisée telle quelle par `HelpIndex` plein écran, et embarquée dans la
 * colonne droite des Réglages.
 */
export function HelpIndexContent({ role, guestAccess }: { role: Role; guestAccess: GuestAccess }) {
  const isOwner = role === 'OWNER';
  const concepts = ARTICLES.filter(
    (a) => a.category === 'concepts' && (isOwner || isAccessible(a, role, guestAccess))
  );
  const pages = ARTICLES.filter(
    (a) => a.category === 'pages' && (isOwner || isAccessible(a, role, guestAccess))
  );
  const renderItem = (a: Article) => (
    <Link
      key={a.slug}
      to={`/help/${a.slug}`}
      className="block rounded-2xl border border-text-muted/10 bg-bg-elevated px-5 py-4 transition-all hover:border-accent/30 hover:shadow-soft"
    >
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <h3 className="text-sm font-medium text-text-primary">{a.title}</h3>
        {isOwner && (
          <div className="flex items-center gap-1 shrink-0">
            {a.badges.map((b) => <Badge key={b} kind={b} />)}
          </div>
        )}
      </div>
      <p className="text-xs text-text-muted/70 leading-relaxed">{a.desc}</p>
    </Link>
  );
  return (
    <>
      <p className="text-sm text-text-muted leading-relaxed mb-6 px-2">
        Bienvenue. Cette aide explique chaque page de l'app, ce que tu peux y faire selon ton rôle, et les fonctionnalités pas toujours évidentes.
      </p>
      <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted/60 mb-3 px-2">
        Pour comprendre l'app
      </h2>
      <div className="flex flex-col gap-2 mb-6">
        {concepts.map(renderItem)}
      </div>
      <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted/60 mb-3 px-2">
        Les pages
      </h2>
      <div className="flex flex-col gap-2">
        {pages.map(renderItem)}
      </div>
    </>
  );
}

function HelpIndex({ role, guestAccess }: { role: Role; guestAccess: GuestAccess }) {
  const isOwner = role === 'OWNER';
  const visibleArticles = ARTICLES.filter((a) => isOwner || isAccessible(a, role, guestAccess));

  return (
    <div className="min-h-dvh pb-16 max-w-2xl mx-auto lg:max-w-none lg:px-12">
      <HelpHeader
        title="Aide"
        backTo="/"
        backLabel="Retour à l'app"
        rightAction={
          <button
            type="button"
            onClick={() => downloadAllArticles(visibleArticles)}
            title="Télécharger tous les articles accessibles en un seul fichier markdown"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary bg-bg-elevated hover:bg-text-muted/10 transition-colors"
          >
            <DownloadIcon />
            <span className="hidden sm:inline">Tout télécharger</span>
          </button>
        }
      />
      <div className="px-4 pb-8">
        <HelpIndexContent role={role} guestAccess={guestAccess} />
      </div>
    </div>
  );
}

function canAccessRoleTag(tag: string, role: Role, guestAccess: GuestAccess): boolean {
  if (role === 'OWNER') return true;
  if (tag === 'owner') return false;
  if (tag === 'guest') return true;
  if (tag === 'confidant') return guestAccess === 'CONFIDANT';
  return true;
}

function filterMarkdownByRole(md: string, role: Role, guestAccess: GuestAccess): string {
  if (role === 'OWNER') return md;
  return md.replace(
    /<!-- role:(owner|guest|confidant) -->([\s\S]*?)<!-- \/role -->/g,
    (_: string, tag: string, content: string) => {
      if (canAccessRoleTag(tag, role, guestAccess)) return content;
      const headingMatch = content.match(/^(#{1,6} .+)$/m);
      const heading = headingMatch ? headingMatch[0] + '\n\n' : '';
      return `${heading}*Cette section ne s'applique pas à ton rôle.*\n\n`;
    }
  );
}

function HelpArticle({ slug, role, guestAccess }: { slug: string; role: Role; guestAccess: GuestAccess }) {
  const navigate = useNavigate();
  const [md, setMd] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const article = useMemo(() => ARTICLES.find((a) => a.slug === slug), [slug]);
  const accessible = useMemo(() => !article || isAccessible(article, role, guestAccess), [article, role, guestAccess]);

  useEffect(() => {
    setMd(null);
    setError(false);
    fetch(`/help/${slug}.md`)
      .then((r) => {
        if (!r.ok) throw new Error('not found');
        return r.text();
      })
      .then(setMd)
      .catch(() => setError(true));
  }, [slug]);

  // Intercept internal .md links → react-router navigate
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const handler = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a');
      if (!target) return;
      const href = target.getAttribute('href') ?? '';
      if (href.endsWith('.md')) {
        e.preventDefault();
        const targetSlug = href.replace(/\.md$/, '').replace(/^\.\//, '');
        if (targetSlug === 'README') navigate('/help');
        else navigate(`/help/${targetSlug}`);
      }
    };
    root.addEventListener('click', handler);
    return () => root.removeEventListener('click', handler);
  }, [navigate, md]);

  // Strip the first H1 (we use the article title in the page header instead)
  // then filter sections by role before rendering
  const html = useMemo(() => {
    if (!md) return '';
    const stripped = md.replace(/^#\s+.+\n+/, '');
    const filtered = filterMarkdownByRole(stripped, role, guestAccess);
    return marked.parse(filtered, { breaks: true, gfm: true }) as string;
  }, [md, role, guestAccess]);

  if (error || !article) {
    return (
      <div className="min-h-dvh pb-16 max-w-2xl mx-auto lg:max-w-none lg:px-12">
        <HelpHeader title="Article introuvable" backTo="/help" backLabel="Centre d'aide" />
        <div className="px-6">
          <p className="text-sm text-text-muted">Cet article n'existe pas ou n'a pas pu être chargé.</p>
        </div>
      </div>
    );
  }

  if (!accessible) {
    return (
      <div className="min-h-dvh pb-16 max-w-2xl mx-auto lg:max-w-none lg:px-12">
        <HelpHeader title={article.title} backTo="/help" backLabel="Centre d'aide" />
        <div className="px-6">
          <p className="text-sm text-text-muted">Cette section ne s'applique pas à ton rôle.</p>
          <button onClick={() => navigate('/help')} className="mt-4 text-xs text-accent hover:underline">
            Retour au centre d'aide
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh pb-16 max-w-2xl mx-auto lg:max-w-none lg:px-12">
      <HelpHeader
        title={article.title}
        backTo="/help"
        backLabel="Centre d'aide"
        rightAction={md ? (
          <button
            type="button"
            onClick={() => triggerDownload(`${article.slug}.md`, md)}
            title="Télécharger cet article"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary bg-bg-elevated hover:bg-text-muted/10 transition-colors"
          >
            <DownloadIcon />
            <span className="hidden sm:inline">Télécharger</span>
          </button>
        ) : undefined}
      />
      <div className="px-6 pb-8">
        <div className="flex items-center gap-1.5 mb-6">
          {article.badges.map((b) => <Badge key={b} kind={b} />)}
        </div>
        {!md ? (
          <p className="text-sm text-text-muted italic">Chargement…</p>
        ) : (
          <div ref={contentRef} className="help-prose" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
    </div>
  );
}

export function HelpPage() {
  const { slug } = useParams<{ slug?: string }>();
  const { data: me } = trpc.auth.me.useQuery();
  const role: Role = me?.role === 'OWNER' ? 'OWNER' : 'GUEST';
  const guestAccess = me?.guestAccess as GuestAccess;

  if (!slug) return <HelpIndex role={role} guestAccess={guestAccess} />;
  return <HelpArticle slug={slug} role={role} guestAccess={guestAccess} />;
}
