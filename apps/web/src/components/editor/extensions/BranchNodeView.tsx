import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

export function BranchNodeView({ node, editor, getPos, deleteNode, updateAttributes }: NodeViewProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isFloating, setIsFloating] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasFloating = useRef(false);

  const anchorText = node.attrs.anchorText as string | null;
  const [editingAnchor, setEditingAnchor] = useState(false);
  const [anchorDraft, setAnchorDraft] = useState(anchorText ?? '');
  const anchorInputRef = useRef<HTMLInputElement>(null);

  // Sync draft si l'ancre change depuis l'extérieur
  useEffect(() => { setAnchorDraft(anchorText ?? ''); }, [anchorText]);

  // Auto-focus l'input quand on entre en mode édition
  useEffect(() => {
    if (editingAnchor) {
      anchorInputRef.current?.focus();
      anchorInputRef.current?.select();
    }
  }, [editingAnchor]);

  const saveAnchor = () => {
    const newText = anchorDraft.trim();
    const oldText = anchorText ?? '';
    updateAttributes({ anchorText: newText || null });

    // Met à jour le mark branchAnchor dans le texte principal :
    // 1. retire le mark sur l'ancien texte (si trouvé avec le mark)
    // 2. applique le mark sur le nouveau texte (si trouvé en clair dans le doc)
    if (newText !== oldText) {
      const { state, view } = editor;
      const markType = state.schema.marks['branchAnchor'];
      if (!markType) {
        setEditingAnchor(false);
        return;
      }

      let tr = state.tr;

      // 1. Retirer le mark de l'ancien texte (premier match avec le mark)
      if (oldText) {
        let oldRange: { from: number; to: number } | null = null;
        state.doc.descendants((n, pos) => {
          if (oldRange || !n.isText || !n.text) return;
          if (!n.marks.some((m) => m.type === markType)) return;
          const idx = n.text.indexOf(oldText);
          if (idx >= 0) {
            oldRange = { from: pos + idx, to: pos + idx + oldText.length };
          }
        });
        if (oldRange) {
          tr = tr.removeMark(
            (oldRange as { from: number; to: number }).from,
            (oldRange as { from: number; to: number }).to,
            markType,
          );
        }
      }

      // 2. Appliquer le mark sur le nouveau texte (premier match dans le doc)
      if (newText) {
        let newFrom: number | null = null;
        state.doc.descendants((n, pos) => {
          if (newFrom !== null || !n.isText || !n.text) return;
          const idx = n.text.indexOf(newText);
          if (idx >= 0) {
            newFrom = pos + idx;
          }
        });
        if (newFrom !== null) {
          tr = tr.addMark(newFrom, newFrom + newText.length, markType.create());
        }
      }

      if (tr.docChanged || tr.steps.length > 0) {
        view.dispatch(tr);
      }
    }

    setEditingAnchor(false);
  };

  const cancelAnchor = () => {
    setAnchorDraft(anchorText ?? '');
    setEditingAnchor(false);
  };

  // Quand on PASSE de flottant à ancré, redonner le focus à l'éditeur.
  // ⚠️ Ne pas appeler focus() au mount initial : avec plusieurs branches,
  // ça déclenche autant de focus() en cascade et fait planter l'interface mobile.
  useEffect(() => {
    if (wasFloating.current && !isFloating) {
      editor.commands.focus();
    }
    wasFloating.current = isFloating;
  }, [isFloating, editor]);

  // Respond to expand/collapse all events
  useEffect(() => {
    const expand = () => setIsOpen(true);
    const collapse = () => setIsOpen(false);
    window.addEventListener('branch:expandAll', expand);
    window.addEventListener('branch:collapseAll', collapse);
    return () => {
      window.removeEventListener('branch:expandAll', expand);
      window.removeEventListener('branch:collapseAll', collapse);
    };
  }, []);

  // Scroll vers ce nœud depuis l'ancre dans le texte
  useEffect(() => {
    const pos = typeof getPos === 'function' ? getPos() : null;
    if (pos === null) return;

    const handleScrollTo = (e: Event) => {
      const custom = e as CustomEvent<{ branchPos: number }>;
      if (custom.detail.branchPos === pos) {
        panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        setIsOpen(true);
        panelRef.current?.classList.add('branch-flash');
        setTimeout(() => panelRef.current?.classList.remove('branch-flash'), 1200);
      }
    };

    window.addEventListener('branch:scrollTo', handleScrollTo);
    return () => window.removeEventListener('branch:scrollTo', handleScrollTo);
  }, [getPos]);

  return (
    <NodeViewWrapper>
      {/* Backdrop pour le mode flottant — rendu dans le body via portal */}
      {isFloating &&
        createPortal(
          <div
            className="branch-backdrop"
            onClick={() => setIsFloating(false)}
          />,
          document.body,
        )}

      <div
        ref={panelRef}
        className={`branch-panel ${isOpen ? 'is-open' : ''} ${isFloating ? 'is-floating' : ''}`}
        data-branch-panel
      >
        {/* Header — toujours visible */}
        <div
          className="branch-header"
          onClick={() => setIsOpen((v) => !v)}
        >
          <span
            className="branch-drag-handle"
            data-drag-handle
            contentEditable={false}
            onClick={(e) => e.stopPropagation()}
            title="Déplacer la branche"
          >
            <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
              <circle cx="3" cy="2.5" r="1.2"/><circle cx="7" cy="2.5" r="1.2"/>
              <circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/>
              <circle cx="3" cy="11.5" r="1.2"/><circle cx="7" cy="11.5" r="1.2"/>
            </svg>
          </span>
          <span className="branch-toggle">
            {isOpen ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <path d="M3 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </span>

          {editingAnchor ? (
            <input
              ref={anchorInputRef}
              type="text"
              contentEditable={false}
              value={anchorDraft}
              onChange={(e) => setAnchorDraft(e.target.value)}
              onBlur={saveAnchor}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') { e.preventDefault(); saveAnchor(); }
                else if (e.key === 'Escape') { e.preventDefault(); cancelAnchor(); }
              }}
              placeholder="Texte d'ancre…"
              className="branch-anchor-input"
            />
          ) : (
            <span
              className="branch-anchor-preview"
              role="button"
              tabIndex={0}
              title="Cliquer pour modifier l'ancre"
              onClick={(e) => { e.stopPropagation(); setEditingAnchor(true); }}
            >
              {anchorText ? <>«&nbsp;{anchorText}&nbsp;»</> : <span className="branch-anchor-empty">+ ancre</span>}
            </span>
          )}

          <button
            type="button"
            contentEditable={false}
            aria-label={isFloating ? 'Ancrer la branche' : 'Afficher en fenêtre'}
            onClick={(e) => {
              e.stopPropagation();
              setIsFloating((v) => !v);
              if (!isOpen) setIsOpen(true);
            }}
            className="branch-float-btn"
          >
            {isFloating ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                <line x1="10" y1="14" x2="3" y2="21" /><line x1="21" y1="3" x2="14" y2="10" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            )}
          </button>

          <button
            type="button"
            contentEditable={false}
            aria-label="Supprimer la branche"
            onClick={(e) => { e.stopPropagation(); deleteNode(); }}
            className="branch-delete-btn"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>

          {isFloating && (
            <button
              type="button"
              contentEditable={false}
              aria-label="Fermer"
              onClick={(e) => { e.stopPropagation(); setIsFloating(false); }}
              className="branch-close-btn"
            >
              ×
            </button>
          )}
        </div>

        {/* Contenu — toujours dans le DOM, masqué via CSS quand replié */}
        <div className="branch-body">
          <NodeViewContent />
        </div>
      </div>
    </NodeViewWrapper>
  );
}
