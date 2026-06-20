import { useRef, useState } from 'react';
import { trpc } from '../lib/trpc';
import { useDropdownAlign } from '../lib/useDropdownAlign';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
}

export function TagInput({ tags, onChange }: TagInputProps) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { panelRef, panelStyle } = useDropdownAlign<HTMLUListElement>(open);

  const { data: suggestions = [] } = trpc.tags.list.useQuery(
    { q: input },
    { enabled: open && input.length > 0 },
  );

  const addTag = (name: string) => {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed || tags.includes(trimmed) || tags.length >= 20) return;
    onChange([...tags, trimmed]);
    setInput('');
    setOpen(false);
  };

  const removeTag = (name: string) => {
    onChange(tags.filter((t) => t !== name));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault();
      addTag(input);
    }
    if (e.key === 'Backspace' && !input && tags.length > 0) {
      const last = tags[tags.length - 1];
      if (last) removeTag(last);
    }
    if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const filteredSuggestions = suggestions.filter(
    (s) => !tags.includes(s.name),
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5 relative">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 text-accent text-xs"
        >
          #{tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            aria-label={`Retirer ${tag}`}
            className="opacity-60 hover:opacity-100 leading-none"
          >
            ×
          </button>
        </span>
      ))}

      <div className="relative">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? '+ tag' : ''}
          className="text-xs text-text-muted bg-transparent outline-none w-16 placeholder:text-text-muted/55"
        />

        {open && (filteredSuggestions.length > 0 || (input.trim() && !tags.includes(input.trim().toLowerCase()))) && (
          <ul ref={panelRef} style={panelStyle} className="absolute left-0 top-full mt-1 z-20 bg-bg-elevated border border-text-muted/15 rounded-lg shadow-soft overflow-hidden min-w-32">
            {filteredSuggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); addTag(s.name); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-text-muted/10"
                >
                  #{s.name}
                </button>
              </li>
            ))}
            {input.trim() && !tags.includes(input.trim().toLowerCase()) && !filteredSuggestions.find(s => s.name === input.trim().toLowerCase()) && (
              <li>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); addTag(input); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-text-muted hover:bg-text-muted/10"
                >
                  Créer « {input.trim().toLowerCase()} »
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
