type Token =
  | { type: 'text'; value: string }
  | { type: 'bold' | 'italic' | 'strike' | 'code' | 'spoiler'; inner: string }
  | { type: 'mention'; inner: string }
  | { type: 'link'; inner: string; href: string };

/** N'autorise que http(s) et mailto (jamais javascript:/data:). */
function safeHref(url: string): string | null {
  return /^(https?:\/\/|mailto:)/i.test(url) ? url : null;
}

function tokenize(text: string): Token[] {
  const patterns: { type: Exclude<Token['type'], 'text'>; re: RegExp; build: (m: RegExpExecArray) => { inner: string; href?: string } }[] = [
    // Mention `[@Nom](mention:id)` avant le lien markdown générique (sinon avalée).
    { type: 'mention', re: /\[@([^\]\n]+)\]\(mention:[\w-]+\)/, build: (m) => ({ inner: m[1] ?? '' }) },
    // Spoiler `||...||` testé en premier pour ne pas être avalé par italic.
    { type: 'spoiler', re: /\|\|([^|\n]+?)\|\|/, build: (m) => ({ inner: m[1] ?? '' }) },
    // Lien markdown `[texte](url)` avant les autres marques.
    { type: 'link', re: /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/, build: (m) => ({ inner: m[1] ?? '', href: m[2] ?? '' }) },
    { type: 'bold', re: /\*\*(.+?)\*\*/s, build: (m) => ({ inner: m[1] ?? '' }) },
    { type: 'strike', re: /~~(.+?)~~/s, build: (m) => ({ inner: m[1] ?? '' }) },
    { type: 'code', re: /`([^`]+)`/, build: (m) => ({ inner: m[1] ?? '' }) },
    { type: 'italic', re: /\*(.+?)\*/s, build: (m) => ({ inner: m[1] ?? '' }) },
    // URL brute en dernier (ne capte pas la ponctuation finale . , ) ] etc.).
    { type: 'link', re: /(https?:\/\/[^\s<]*[^\s<.,;:!?)\]'"»])/, build: (m) => ({ inner: m[1] ?? '', href: m[1] ?? '' }) },
  ];

  const tokens: Token[] = [];
  let rest = text;

  while (rest.length > 0) {
    let best: { index: number; full: string; type: Exclude<Token['type'], 'text'>; inner: string; href?: string } | null = null;

    for (const { type, re, build } of patterns) {
      const m = re.exec(rest);
      if (m && (best === null || m.index < best.index)) {
        const built = build(m);
        best = { index: m.index, full: m[0], type, inner: built.inner, href: built.href };
      }
    }

    if (!best) {
      tokens.push({ type: 'text', value: rest });
      break;
    }

    if (best.index > 0) tokens.push({ type: 'text', value: rest.slice(0, best.index) });
    if (best.type === 'link') {
      const href = safeHref(best.href ?? '');
      // Lien non sûr → on garde le texte brut.
      if (href) tokens.push({ type: 'link', inner: best.inner, href });
      else tokens.push({ type: 'text', value: best.full });
    } else {
      tokens.push({ type: best.type, inner: best.inner });
    }
    rest = rest.slice(best.index + best.full.length);
  }

  return tokens;
}

export function CommentContent({ content }: { content: string }) {
  const tokens = tokenize(content);
  return (
    <span className="whitespace-pre-wrap leading-snug">
      {tokens.map((tok, i) => {
        if (tok.type === 'text') return <span key={i}>{tok.value}</span>;
        if (tok.type === 'bold') return <strong key={i} className="font-semibold">{tok.inner}</strong>;
        if (tok.type === 'italic') return <em key={i}>{tok.inner}</em>;
        if (tok.type === 'strike') return <del key={i} className="opacity-60">{tok.inner}</del>;
        if (tok.type === 'code') return <code key={i} className="font-mono text-[0.85em] bg-text-muted/10 px-1 rounded">{tok.inner}</code>;
        if (tok.type === 'mention') return <span key={i} className="mention-chip">@{tok.inner}</span>;
        if (tok.type === 'spoiler') return <span key={i} className="spoiler" data-spoiler="1">{tok.inner}</span>;
        if (tok.type === 'link') return (
          <a
            key={i}
            href={tok.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="underline underline-offset-2 hover:opacity-80 transition-opacity break-words"
          >
            {tok.inner}
          </a>
        );
        return null;
      })}
    </span>
  );
}
