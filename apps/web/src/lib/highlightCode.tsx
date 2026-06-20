import { createLowlight, common } from 'lowlight';
import type { ReactNode } from 'react';

// Une seule instance lowlight (highlight.js, langages « common ») partagée par
// le rendu en lecture des notes et celui des blocs de code de quiz.
const lowlight = createLowlight(common);

/** Convertit un nœud hast en élément React — sans innerHTML, sans XSS. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function HastNode({ node, idx }: { node: any; idx: number }): ReactNode {
  if (node.type === 'text') return node.value as string;
  if (node.type === 'element') {
    const cls = (node.properties?.className as string[] | undefined)?.join(' ');
    return (
      <span key={idx} className={cls || undefined}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {(node.children ?? []).map((child: any, i: number) => (
          <HastNode key={i} node={child} idx={i} />
        ))}
      </span>
    );
  }
  return null;
}

/**
 * Coloration syntaxique d'un bloc de code → nœuds React (classes `.hljs-*`
 * définies dans globals.css). Si le langage est inconnu, on tente la détection
 * automatique ; en dernier recours, on renvoie le code brut.
 */
export function highlightCode(code: string, lang?: string): ReactNode {
  try {
    let result;
    if (lang) {
      try {
        result = lowlight.highlight(lang, code);
      } catch {
        result = lowlight.highlightAuto(code);
      }
    } else {
      result = lowlight.highlightAuto(code);
    }
    return result.children.map((child, i) => <HastNode key={i} node={child} idx={i} />);
  } catch {
    return code;
  }
}
