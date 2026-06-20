import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

export type MentionItem = { id: string; label: string; sub?: string };

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

/**
 * Liste d'autocomplétion @mention pour l'éditeur Tiptap. Pilotée par le plugin
 * Suggestion : navigation clavier exposée via ref (onKeyDown), sélection par
 * clic ou Entrée/Tab. Style aligné sur le dropdown des commentaires.
 */
export const MentionList = forwardRef<MentionListRef, {
  items: MentionItem[];
  command: (item: MentionItem) => void;
}>(function MentionList({ items, command }, ref) {
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [items]);

  const select = (i: number) => {
    const it = items[i];
    if (it) command(it);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (!items.length) return false;
      if (event.key === 'ArrowDown') { setIdx((i) => (i + 1) % items.length); return true; }
      if (event.key === 'ArrowUp') { setIdx((i) => (i - 1 + items.length) % items.length); return true; }
      if (event.key === 'Enter' || event.key === 'Tab') { select(idx); return true; }
      return false;
    },
  }), [items, idx]);

  if (!items.length) return null;

  return (
    <ul className="w-56 max-h-48 overflow-y-auto rounded-xl bg-bg-elevated border border-text-muted/15 shadow-soft py-1 scrollbar-soft">
      {items.map((it, i) => (
        <li key={it.id}>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); select(i); }}
            onMouseEnter={() => setIdx(i)}
            className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${i === idx ? 'bg-accent/15 text-accent' : 'text-text-primary hover:bg-text-muted/10'}`}
          >
            <span className="font-medium">@{it.label}</span>
            {it.sub && <span className="ml-1.5 text-[11px] text-text-muted/50">{it.sub}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
});
