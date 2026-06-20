import { useEffect } from 'react';
import { DIARY_FONTS, loadFont } from './fonts';

export type StyledRun = { text: string; fontFamily?: string; fontSize?: string; color?: string; mention?: boolean; bold?: boolean; italic?: boolean; strike?: boolean; underline?: boolean; code?: boolean; spoiler?: boolean; blockquote?: boolean; muted?: boolean };

// Sentinel interne (caractère de contrôle improbable) pour repérer un bloc
// diagramme dans le flux de preview et lui donner ensuite la typo « discrète ».
const DIAGRAM_MARK = '␟';

export function parsePreviewRuns(md: string): StyledRun[] {
  const preprocessed = md
    .replace(/\\\n/g, '\n')
    .replace(/\\([[\](){}*_`~#>|!.+=-])/g, '$1')
    .replace(/\\$/gm, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/~~~[\s\S]*?~~~/g, '')
    // Les blocs :::chat ont leur propre rendu — on les remplace par un marqueur discret en preview
    .replace(/:::chat[^\n]*\n?[\s\S]*?:::/g, '💬 conversation')
    // :::mermaid → marqueur « Diagramme » (typo discrète, cf. plus bas), sur sa
    // propre ligne pour devenir un segment isolé.
    .replace(/:::mermaid\s*\n[\s\S]*?\n:::/g, `\n${DIAGRAM_MARK}\n`)
    // Directives media spoiler supprimées EN PREMIER — avant ||...||→▓▓▓
    // sinon ||:::video "..."|| deviendrait ▓▓▓ au lieu d'être retiré silencieusement.
    .replace(/^\|\|:::audio[^\n]*\|\|$/gm, '')
    .replace(/^\|\|:::video[^\n]*\|\|$/gm, '')
    .replace(/^\|\|:::img[^\n]*\|\|$/gm, '')
    // Spoilers texte `||texte||` → pavé de redaction (span marqué, rendu propre
    // dans PreviewRuns). Le texte caché n'est jamais exposé. Remplace l'ancien
    // ▓▓▓ (hachuré peu lisible).
    .replace(/\|\|[^|\n]+?\|\|/g, '<span data-spoiler="1"></span>')
    // Directives media non-spoiler
    .replace(/^:::audio[^\n]*$/gm, '')
    .replace(/^:::video[^\n]*$/gm, '')
    .replace(/^:::img[^\n]*$/gm, '')
    // Mention `[@Label](mention:id)` → span marqué (rendu chip accent + gras dans
    // PreviewRuns, comme en lecture pleine). Converti AVANT le parcours DOM,
    // sinon `cleanText` la réduirait en texte brut via le strip des liens.
    .replace(/\[@([^\]\n]+)\]\(mention:[\w-]+\)/g, '<span data-mention="1">@$1</span>')
    // Autolink <https://…> → URL texte AVANT toute manipulation DOM : sinon
    // `innerHTML` le prend pour une balise inconnue et avale le texte suivant.
    .replace(/<(https?:\/\/[^>\s]+)>/g, '$1')
    .replace(/<img\s[^>]*\/?>/gi, '')
    // Images markdown standard (insérées SANS redimensionnement) : retirées dès
    // le préprocessing — sinon chaque ligne image devient un « paragraphe » et
    // les lignes vides entre elles laissent des séparateurs « · » orphelins une
    // fois l'image strippée (un « . » par photo sous le carrousel).
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/:::[\w-]*[^\n]*\n?([\s\S]*?):::/g, '$1')
    .replace(/:::[\w-]*[^\n]*/g, '')
    // Marqueurs markdown inline → balises HTML AVANT le parcours DOM. Deux gains :
    // (1) gras/italique/barré/code sont rendus comme tels (fidèle à la lecture
    //     pleine) ; (2) leurs marqueurs ne fuitent jamais en clair — même quand
    //     ils enveloppent un <span> de style (le `.+?` traverse le span), cas où
    //     l'ancien strip par nœud échouait (« ~~elit~~ » resté visible).
    // Ordre : code d'abord (protège son contenu), puis gras (**/__) avant
    // italique (*) pour ne pas casser les paires.
    .replace(/`([^`\n]+?)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Split into blockquote and non-blockquote segments
  type Segment = { text: string; blockquote: boolean };
  const segments: Segment[] = [];

  for (const line of preprocessed.split('\n')) {
    // Lignes de tableau : extraire le texte des cellules ou ignorer les séparateurs |---|
    // NB : ordre des caractères dans la classe choisi pour NE PAS commencer par
    // tiret puis deux-points — sinon le scanner Tailwind prend la regex pour une
    // « arbitrary property » et génère une règle CSS invalide (warning au build).
    if (/^\|[\s:|-]+\|$/.test(line.trim())) continue; // ligne séparateur --- du tableau
    const isTableRow = /^\|/.test(line.trim()) && /\|$/.test(line.trim());
    const isQuote = /^>\s?/.test(line);
    const content = isTableRow
      ? line.split('|').map(c => c.trim()).filter(Boolean).join(' · ')
      : isQuote ? line.replace(/^>\s?/, '') : line;
    const last = segments[segments.length - 1];
    if (!content.trim()) {
      // Ligne vide = séparateur de paragraphe : on marque la coupure avec ·
      if (last && last.text && !last.text.endsWith(' · ')) last.text += ' · ';
      continue;
    }
    if (last && last.blockquote === isQuote) {
      last.text += (last.text && !last.text.endsWith(' · ') ? ' ' : '') + content;
    } else {
      segments.push({ text: content, blockquote: isQuote });
    }
  }

  const runs: StyledRun[] = [];

  // Nettoie le markdown inline d'un nœud texte. NE rogne PAS les espaces de bord :
  // sinon deux runs stylés voisins se collent (« consectetur » + « adipiscing »
  // → « consecteturadipiscing »). On réduit seulement les blancs multiples.
  const cleanText = (s: string) => s
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/!\[.*?\]\([^)]+\)/g, '')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\*{1,2}/g, '')
    .replace(/_{1,2}/g, '')
    .replace(/~{1,2}/g, '')
    .replace(/`+/g, '')
    .replace(/\s+/g, ' ');

  // Parcours DOM récursif. La police (`font-family`) et la taille (`font-size`)
  // de la note sont posées par des <span> **imbriqués** (FF englobe size englobe
  // color). Un regex à plat manquait cet héritage et rendait en police par
  // défaut (sans) tout le texte hors du span le plus interne → la preview
  // « perdait le style ». On hérite donc ff/fs à travers l'arbre, comme
  // AnnotatedReader, pour une preview fidèle à la lecture pleine.
  type Inh = { ff?: string; fs?: string; color?: string; mention?: boolean; bold?: boolean; italic?: boolean; strike?: boolean; underline?: boolean; code?: boolean };
  for (const seg of segments) {
    const container = document.createElement('div');
    container.innerHTML = seg.text;
    const walk = (node: Node, inh: Inh) => {
      node.childNodes.forEach((child) => {
        if (child.nodeType === 3 /* TEXT_NODE */) {
          const t = cleanText(child.textContent ?? '');
          if (!t) return;
          // Nœud purement blanc = séparateur entre deux runs stylés voisins : on
          // l'attache au run précédent (sinon il serait filtré → mots collés).
          if (!t.trim()) {
            const prev = runs[runs.length - 1];
            if (prev && !/\s$/.test(prev.text)) prev.text += ' ';
            return;
          }
          runs.push({ text: t, fontFamily: inh.ff, fontSize: inh.fs, color: inh.color, mention: inh.mention, bold: inh.bold, italic: inh.italic, strike: inh.strike, underline: inh.underline, code: inh.code, blockquote: seg.blockquote });
        } else if (child.nodeType === 1 /* ELEMENT_NODE */) {
          const el = child as HTMLElement;
          // Spoiler : pavé de redaction (span vide → on émet le run directement,
          // sans descendre, car il n'a pas de nœud texte).
          if (el.getAttribute('data-spoiler') === '1') {
            runs.push({ text: '', spoiler: true, blockquote: seg.blockquote });
            return;
          }
          const tag = el.tagName.toLowerCase();
          const deco = `${el.style.textDecorationLine || ''} ${el.style.textDecoration || ''}`;
          walk(el, {
            ff: el.style.fontFamily || inh.ff,
            fs: el.style.fontSize || inh.fs,
            color: el.style.color || inh.color,
            mention: inh.mention || el.getAttribute('data-mention') === '1',
            bold: inh.bold || tag === 'strong' || tag === 'b' || /^(bold|[6-9]00)$/.test(el.style.fontWeight),
            italic: inh.italic || tag === 'em' || tag === 'i' || el.style.fontStyle === 'italic',
            strike: inh.strike || tag === 's' || tag === 'del' || tag === 'strike' || /line-through/.test(deco),
            underline: inh.underline || tag === 'u' || /underline/.test(deco),
            code: inh.code || tag === 'code',
          });
        }
      });
    };
    walk(container, {});
  }

  const cleaned = runs
    .map((r) => {
      // Le run isolé == diagramme → libellé « Diagramme » en typo discrète.
      if (r.text.trim() === DIAGRAM_MARK) return { ...r, text: 'Diagramme', muted: true };
      // Cas rare (diagramme fusionné avec du texte adjacent) : on remplace juste
      // le marqueur sans styliser, pour ne pas afficher le caractère sentinel.
      return { ...r, text: r.text.replace(new RegExp(DIAGRAM_MARK, 'g'), 'Diagramme') };
    })
    // On garde les espaces internes/de bord (séparation des runs) mais on jette
    // les runs vides ou purement blancs.
    .filter((r) => r.text.trim().length > 0 || r.spoiler);

  // Retire un séparateur « · » orphelin en toute fin de preview (mais pas un
  // pavé spoiler, dont le texte est vide par construction).
  const lastRun = cleaned[cleaned.length - 1];
  if (lastRun && !lastRun.spoiler) {
    lastRun.text = lastRun.text.replace(/\s*·\s*$/, '');
    if (!lastRun.text.trim()) cleaned.pop();
  }
  return cleaned;
}

export function PreviewRuns({ runs }: { runs: StyledRun[] }) {
  useEffect(() => {
    const seen = new Set<string>();
    for (const run of runs) {
      if (!run.fontFamily) continue;
      for (const font of DIARY_FONTS) {
        if (seen.has(font.key)) continue;
        const first = font.family.split(',')[0]?.replace(/['"]/g, '').trim() ?? '';
        if (run.fontFamily.includes(first)) {
          loadFont(font.key);
          seen.add(font.key);
        }
      }
    }
  }, [runs]);

  return (
    <>
      {runs.map((run, i) => {
        // Spoiler → pavé de redaction arrondi (le texte caché n'est jamais exposé).
        if (run.spoiler) {
          return (
            <span
              key={i}
              aria-label="contenu masqué"
              style={{ display: 'inline-block', width: '2.2em', height: '0.82em', verticalAlign: '-0.12em', margin: '0 0.12em', borderRadius: 4, background: 'color-mix(in srgb, var(--color-text-muted) 30%, transparent)' }}
            />
          );
        }
        const decoration = [run.underline && 'underline', run.strike && 'line-through'].filter(Boolean).join(' ');
        const style: React.CSSProperties = {
          fontFamily: run.fontFamily,
          fontSize: run.fontSize,
          color: run.color,
          fontWeight: run.bold ? 600 : undefined,
          fontStyle: run.italic ? 'italic' : undefined,
          textDecoration: decoration || undefined,
          // Code → chip mono + fond + accent (cf. .diary-inline-code de la lecture pleine).
          // Posé après pour écraser police/couleur héritées.
          ...(run.code ? {
            fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
            fontSize: '0.88em',
            background: 'color-mix(in srgb, var(--color-text-muted) 14%, transparent)',
            color: 'var(--color-accent)',
            padding: '0.08em 0.34em',
            borderRadius: 5,
          } : {}),
          // Mention → chip accent + gras (cf. .mention-chip de la lecture pleine).
          ...(run.mention ? { color: 'var(--color-accent)', fontWeight: 600, whiteSpace: 'nowrap' } : {}),
          ...(run.blockquote ? { fontStyle: 'italic', borderLeft: '2px solid currentColor', paddingLeft: '0.5em', opacity: 0.75 } : {}),
          // Marqueur « Diagramme » : même typo discrète qu'en mode compact (italique, atténué).
          ...(run.muted ? { fontStyle: 'italic', color: 'var(--color-text-muted)', opacity: 0.65 } : {}),
        };
        const hasStyle = run.fontFamily || run.fontSize || run.color || run.mention || run.bold || run.italic || run.strike || run.underline || run.code || run.blockquote || run.muted;
        return hasStyle
          ? <span key={i} style={style}>{run.text}</span>
          : <span key={i}>{run.text}</span>;
      })}
    </>
  );
}
