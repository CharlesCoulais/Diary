import { useEffect } from 'react';

/**
 * Spoilers façon Discord — syntaxe `||texte||` dans le markdown.
 *
 * Au rendu :
 *   - HTML (notes, commentaires markdown-it) : on remplace par
 *     `<span class="spoiler" data-spoiler="1">...</span>` via `renderSpoilersInHtml`.
 *   - React inline (preview, runs) : on utilise `renderSpoilersInReact` qui
 *     retourne un tableau de ReactNode (spans React natifs).
 *
 * Côté interaction, un seul listener global sur `document` (cf.
 * `useGlobalSpoilerHandler`) toggle la classe `.spoiler-revealed` au click.
 * Évite d'attacher un handler à chaque span (peut y en avoir des dizaines
 * dans une note longue).
 *
 * Pattern de détection :
 *   - Sans `\n` à l'intérieur (un spoiler reste sur une seule ligne)
 *   - Au moins 1 char visible non-pipe
 *   - Compatible escape `\||` si on veut un pipe littéral (futur, pas géré
 *     pour l'instant — les `||` doivent être par paires)
 */
const SPOILER_RE = /\|\|([^|\n]+?)\|\|/g;

/** Helper d'échappement HTML — utilisé pour le rendu vers innerHTML. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Remplace les `||...||` dans une chaîne HTML par des `<span class="spoiler">`.
 * Le contenu intérieur est ré-échappé HTML — c'est volontaire : on suppose
 * que le caller a déjà passé le contenu via un sanitizer (markdown-it sans
 * `html: true`) et qu'on ne veut pas re-introduire de HTML brut dans les
 * spoilers.
 *
 * Utilisé sur le HTML produit par marked / markdown-it (notes lecture +
 * commentaires).
 */
export function renderSpoilersInHtml(html: string): string {
  return html.replace(SPOILER_RE, (_match, inner: string) => {
    return `<span class="spoiler" data-spoiler="1">${escapeHtml(inner)}</span>`;
  });
}

/**
 * Variante React — pour les cas où on construit déjà un tableau de runs
 * (ex: `previewRuns.tsx`). Renvoie une liste de fragments React où les
 * spoilers sont des `<span>` natifs.
 *
 * Note : si le texte contient déjà du JSX (mentions, links…), il faut
 * appeler ce helper sur les portions text-only uniquement.
 */
export function renderSpoilersInReact(text: string, keyPrefix = 'sp'): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  SPOILER_RE.lastIndex = 0;
  let i = 0;
  while ((m = SPOILER_RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <span key={`${keyPrefix}-${i++}`} className="spoiler" data-spoiler="1">
        {m[1]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Retire complètement les balises de spoiler pour les previews texte brut
 * (badges courts, recherche full-text, exports). On garde le contenu interne
 * mais sans les `||` autour — utile pour ne pas afficher la syntaxe brute
 * dans les zones non-interactives.
 */
export function stripSpoilers(text: string): string {
  return text.replace(SPOILER_RE, '$1');
}

/**
 * Indique si une chaîne contient au moins un spoiler — utile pour décider
 * si on affiche un indicateur « contient des spoilers » sur une preview.
 */
export function hasSpoiler(text: string): boolean {
  SPOILER_RE.lastIndex = 0;
  return SPOILER_RE.test(text);
}

/**
 * Hook à appeler une seule fois en haut de l'arbre React (App.tsx). Installe
 * un listener `click` global sur `document` qui détecte les éléments
 * `[data-spoiler="1"]` et toggle la classe `.spoiler-revealed`.
 *
 * Une fois révélé, le span ne se re-cache pas (pour permettre de lire
 * confortablement) — la navigation re-mount le DOM, ce qui re-cache au
 * passage suivant.
 */
export function useGlobalSpoilerHandler(): void {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const spoiler = target.closest<HTMLElement>('[data-spoiler="1"]');
      if (!spoiler) return;
      if (spoiler.classList.contains('spoiler-revealed')) return; // déjà révélé
      e.preventDefault();
      e.stopPropagation();
      spoiler.classList.add('spoiler-revealed');
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, []);
}
