import { CommentContent } from './CommentContent';
import { highlightCode } from '../lib/highlightCode';

/**
 * Rendu d'un texte de quiz : blocs de code ``` ``` (multi-lignes, monospace via
 * `.diary-code-block`) + mise en forme inline (gras, italique, code inline,
 * liens, spoilers) déléguée à `CommentContent`.
 */
export function QuizText({ text, className }: { text: string; className?: string }) {
  if (!text) return null;
  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <div className={className}>
      {parts.map((p, i) => {
        const m = /^```([\w-]*)\n?([\s\S]*?)\n?```$/.exec(p);
        if (m) {
          const lang = m[1] || undefined;
          const code = m[2] ?? '';
          return (
            <pre key={i} className="diary-code-block my-2" {...(lang ? { 'data-language': lang } : {})}>
              <code>{highlightCode(code, lang)}</code>
            </pre>
          );
        }
        if (!p) return null;
        return <CommentContent key={i} content={p} />;
      })}
    </div>
  );
}
