import { useEffect, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { MermaidRender } from '../../MermaidRender';
import { DEFAULT_MERMAID } from './Mermaid';

const DragHandle = () => (
  <span className="branch-drag-handle" data-drag-handle contentEditable={false} title="Déplacer le bloc" onClick={(e) => e.stopPropagation()}>
    <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
      <circle cx="3" cy="2.5" r="1.2" /><circle cx="7" cy="2.5" r="1.2" />
      <circle cx="3" cy="7" r="1.2" /><circle cx="7" cy="7" r="1.2" />
      <circle cx="3" cy="11.5" r="1.2" /><circle cx="7" cy="11.5" r="1.2" />
    </svg>
  </span>
);

const Chevron = ({ open }: { open: boolean }) => (
  <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 transition-transform" style={{ transform: open ? 'none' : 'rotate(-90deg)' }}>
    <path d="M1 3l4 4 4-4" />
  </svg>
);

export function MermaidNodeView({ node, updateAttributes, deleteNode, editor }: NodeViewProps) {
  const code = (node.attrs.code as string) || '';
  const [editing, setEditing] = useState(!code);
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState(code || DEFAULT_MERMAID);
  const isReadOnly = !editor.isEditable;

  // Répond au bouton « tout replier / déplier » de la barre d'outils.
  useEffect(() => {
    const expand = () => setOpen(true);
    const collapse = () => setOpen(false);
    window.addEventListener('branch:expandAll', expand);
    window.addEventListener('branch:collapseAll', collapse);
    return () => {
      window.removeEventListener('branch:expandAll', expand);
      window.removeEventListener('branch:collapseAll', collapse);
    };
  }, []);

  const save = () => {
    updateAttributes({ code: draft });
    setEditing(false);
  };
  const cancel = () => {
    setDraft(code || DEFAULT_MERMAID);
    setEditing(false);
  };

  if (!editing) {
    return (
      <NodeViewWrapper>
        <div className="mermaid-block" onClick={(e) => e.stopPropagation()}>
          <div className="mermaid-block-bar" contentEditable={false}>
            <button type="button" className="mermaid-block-toggle" onClick={() => setOpen((v) => !v)} title={open ? 'Replier' : 'Déplier'}>
              <Chevron open={open} />
              <span className="mermaid-block-label">Diagramme</span>
            </button>
            <span className="mermaid-block-actions">
              {!isReadOnly && (
                <button type="button" onClick={() => setEditing(true)} className="mermaid-block-btn" title="Éditer le diagramme">✎</button>
              )}
              <DragHandle />
            </span>
          </div>
          {open && <MermaidRender code={code} />}
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper>
      <div className="mermaid-block mermaid-block--editing" onClick={(e) => e.stopPropagation()}>
        <div className="mermaid-block-bar" contentEditable={false}>
          <span className="mermaid-block-label">Diagramme Mermaid</span>
          <DragHandle />
        </div>
        <div className="mermaid-edit" contentEditable={false}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            spellCheck={false}
            className="mermaid-textarea"
            placeholder={'graph TD\n  A[Début] --> B[Fin]'}
          />
          {/* Aperçu live pendant l'édition */}
          <div className="mermaid-edit-preview">
            <MermaidRender code={draft} />
          </div>
          <p className="mermaid-edit-hint">
            Syntaxe <a href="https://mermaid.js.org/intro/" target="_blank" rel="noreferrer">Mermaid</a> : flowchart, sequenceDiagram, gantt, pie, mindmap…
          </p>
          <div className="mermaid-edit-buttons">
            <button type="button" onClick={cancel} className="mermaid-btn-cancel">Annuler</button>
            <button type="button" onClick={() => deleteNode()} className="mermaid-btn-delete">Supprimer</button>
            <button type="button" onClick={save} className="mermaid-btn-save">Enregistrer</button>
          </div>
        </div>
      </div>
    </NodeViewWrapper>
  );
}
