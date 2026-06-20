import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { trpc } from '../lib/trpc';

/**
 * Pill compacte pour ajouter un tag à une note directement depuis sa
 * preview, sans avoir à ouvrir la modale d'édition.
 *
 * États :
 *   - Collapsed : petit bouton "+ tag" qui ressemble à une pill discrète
 *   - Expanded  : input texte + dropdown de suggestions tirées des tags
 *     existants de l'owner (via `trpc.tags.list`)
 *
 * Réservé à l'owner — le composant n'a pas de check de rôle car il n'est
 * monté que depuis EntryCardView (jamais côté guest, qui a son propre
 * card view sans édition).
 */
interface Props {
  /** Tags déjà présents sur l'entrée — évite de proposer ou d'ajouter un doublon. */
  existingTags: string[];
  /** Appelé après normalisation (trim + lowercase). Le parent persiste en DB. */
  onAdd: (tag: string) => void;
}

export function QuickAddTagPill({ existingTags, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Ref vers l'élément portal — sans ça, l'outside-click ferme le picker
  // au clic sur une suggestion (puisque le portal n'est pas dans `wrapRef`).
  const portalRef = useRef<HTMLDivElement>(null);
  // Position absolue (viewport) du dropdown — calculée à partir du rect de
  // l'input. Le dropdown est portalé vers `document.body` pour échapper aux
  // stacking contexts (cards EntryCard en z-40, BottomNav en z-20, etc.).
  const [dropPos, setDropPos] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) { setDropPos(null); return; }
    const compute = () => {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setDropPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [open]);

  // Suggestions du catalogue de l'utilisateur (n'est pas fetched tant que
  // l'input n'est pas ouvert pour éviter une round-trip inutile par card).
  const { data: suggestions = [] } = trpc.tags.list.useQuery(
    { q: input.trim() },
    { enabled: open, staleTime: 30_000 },
  );

  // Focus auto à l'ouverture.
  useEffect(() => {
    if (!open) { setInput(''); return; }
    setTimeout(() => inputRef.current?.focus(), 20);
  }, [open]);

  // Ferme au clic extérieur (mouse + touch pour iOS) + Esc.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (portalRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const commit = (raw: string) => {
    const tag = raw.trim().toLowerCase();
    if (!tag) return;
    if (existingTags.includes(tag)) {
      // Déjà présent — pas d'ajout, mais on ferme proprement.
      setOpen(false);
      return;
    }
    onAdd(tag);
    setOpen(false);
  };

  // Filtre les suggestions pour exclure les tags déjà présents.
  const visibleSuggestions = suggestions
    .map((s) => s.name)
    .filter((name) => !existingTags.includes(name))
    .slice(0, 6);

  if (!open) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title="Ajouter un tag"
        aria-label="Ajouter un tag"
        className="text-xs text-text-muted/55 hover:text-accent transition-colors px-1.5 py-0.5 rounded-full border border-dashed border-text-muted/20 hover:border-accent/40"
      >
        + tag
      </button>
    );
  }

  return (
    <div ref={wrapRef} className="relative inline-flex items-center" onClick={(e) => e.stopPropagation()}>
      <span className="text-xs text-text-muted/60 mr-0.5">#</span>
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(input); }
          if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
        }}
        placeholder="nouveau tag"
        maxLength={60}
        className="bg-bg-primary/60 border border-text-muted/15 rounded-full px-2 py-0.5 text-xs text-text-primary placeholder:text-text-muted/55 outline-none focus:border-accent/40 transition-colors w-24"
      />
      {visibleSuggestions.length > 0 && dropPos && createPortal(
        <div
          ref={portalRef}
          // z-[80] suffit largement à passer au-dessus des cards (z-40) et de
          // la BottomNav (z-20). Portal vers <body> pour échapper aux stacking
          // contexts des cards (l'overflow-hidden des EntryCard clippait sinon).
          style={{ position: 'fixed', top: dropPos.top, right: dropPos.right }}
          className="z-[80] min-w-[140px] bg-bg-elevated border border-text-muted/15 rounded-xl shadow-soft py-1 overflow-hidden"
        >
          {visibleSuggestions.map((name) => (
            <button
              key={name}
              type="button"
              onClick={(e) => { e.stopPropagation(); commit(name); }}
              className="w-full text-left px-3 py-1 text-xs text-text-primary hover:bg-accent/10 hover:text-accent transition-colors"
            >
              #{name}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
