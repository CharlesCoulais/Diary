import { useEffect, useId, useRef, useState } from 'react';
import { useTheme } from '../lib/theme';

/**
 * Rendu d'un diagramme Mermaid en SVG.
 *
 * - **Lazy-load** : la lib mermaid (~lourde) est importée dynamiquement à la
 *   première utilisation, jamais dans le bundle principal.
 * - **Strict** : `securityLevel: 'strict'` → mermaid sanitize le SVG (les labels
 *   ne peuvent pas injecter de HTML). Le SVG est ensuite posé via innerHTML.
 * - **Thème** : suit le mode clair/sombre de l'app.
 *
 * Partagé entre l'éditeur (MermaidNodeView) et la lecture (AnnotatedReader) pour
 * que le rendu soit identique des deux côtés.
 */

type MermaidApi = typeof import('mermaid')['default'];

let mermaidPromise: Promise<MermaidApi> | null = null;
function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => m.default);
  }
  return mermaidPromise;
}

let mmidExportCounter = 0;
/**
 * Rend un diagramme Mermaid en SVG (chaîne), hors React — utilisé par l'export
 * PDF. Thème clair forcé (meilleur contraste à l'impression). Throw si le
 * diagramme est invalide (l'appelant retombe sur un encadré code source).
 */
export async function renderMermaidToSvg(code: string): Promise<string> {
  const mermaid = await loadMermaid();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'default',
    fontFamily: 'Inter, system-ui, sans-serif',
  });
  const id = 'mmd-export-' + (mmidExportCounter++);
  const { svg } = await mermaid.render(id, code.trim());
  return svg;
}

export function MermaidRender({ code, className = '' }: { code: string; className?: string }) {
  const { theme } = useTheme();
  // Identifiant DOM stable et valide (mermaid l'utilise pour un nœud temporaire).
  const renderId = 'mmd-' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const trimmed = code.trim();
    if (!trimmed) {
      setSvg(null);
      setError(null);
      return;
    }
    (async () => {
      try {
        const mermaid = await loadMermaid();
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: theme === 'dark' ? 'dark' : 'default',
          fontFamily: 'Inter, system-ui, sans-serif',
        });
        const { svg: out } = await mermaid.render(renderId, trimmed);
        if (!cancelled) {
          setSvg(out);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setSvg(null);
          setError(e instanceof Error ? e.message : 'Diagramme invalide');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, theme, renderId]);

  if (error) {
    return (
      <div className={`mermaid-error ${className}`} contentEditable={false}>
        <p className="mermaid-error-title">Diagramme Mermaid invalide</p>
        <pre className="mermaid-error-detail">{error}</pre>
      </div>
    );
  }

  if (svg == null) {
    return (
      <div className={`mermaid-loading ${className}`} contentEditable={false}>
        Rendu du diagramme…
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`mermaid-render ${className}`}
      contentEditable={false}
      // SVG sanitizé par mermaid (securityLevel: 'strict').
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
