import { useState, useEffect } from 'react';
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { EXCERPT_KINDS, type ExcerptKind } from '../excerptKinds';

/**
 * Vue d'édition d'un bloc « extrait / citation » (livre, paroles, film/série).
 * En-tête repliable avec résumé + métadonnées éditables ; corps = citation.
 * Ouvert par défaut. La variante est portée par `node.attrs.kind`.
 */
export function ExcerptNodeView({ node, deleteNode, updateAttributes }: NodeViewProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [editingMeta, setEditingMeta] = useState(false);

  const kind = ((node.attrs.kind as ExcerptKind) in EXCERPT_KINDS ? node.attrs.kind : 'book') as ExcerptKind;
  const cfg = EXCERPT_KINDS[kind];
  const meta = (node.attrs.meta as Record<string, string> | null) ?? {};

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

  const setField = (key: string, value: string) => {
    const next = { ...meta };
    if (value.trim()) next[key] = value.trim();
    else delete next[key];
    updateAttributes({ meta: next });
  };

  const hasMeta = cfg.fields.some((f) => meta[f.key]);
  const { title, byline, refs } = cfg.summarize(meta);

  return (
    <NodeViewWrapper>
      <div className={`excerpt-panel ${isOpen ? 'is-open' : ''}`} data-excerpt-panel style={{ ['--excerpt-color' as string]: cfg.colorVar }}>
        {/* En-tête — toujours visible, clic = replier/déplier */}
        <div className="excerpt-header" onClick={() => setIsOpen((v) => !v)}>
          <span
            className="branch-drag-handle excerpt-drag-handle"
            data-drag-handle
            contentEditable={false}
            onClick={(e) => e.stopPropagation()}
            title="Déplacer le bloc"
          >
            <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
              <circle cx="3" cy="2.5" r="1.2" /><circle cx="7" cy="2.5" r="1.2" />
              <circle cx="3" cy="7" r="1.2" /><circle cx="7" cy="7" r="1.2" />
              <circle cx="3" cy="11.5" r="1.2" /><circle cx="7" cy="11.5" r="1.2" />
            </svg>
          </span>

          <span className="excerpt-toggle">
            {isOpen ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 3l4 4 4-4" /></svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 1l4 4-4 4" /></svg>
            )}
          </span>

          <span className="excerpt-icon" contentEditable={false} aria-hidden>{cfg.icon}</span>

          <span className="excerpt-summary">
            {hasMeta ? (
              <>
                <span className="excerpt-summary-title">{title}</span>
                {byline && <span className="excerpt-summary-byline"> — {byline}</span>}
                {refs.length > 0 && <span className="excerpt-summary-ref"> · {refs.join(' · ')}</span>}
              </>
            ) : (
              <span className="excerpt-summary-empty">{cfg.label}</span>
            )}
          </span>

          <button
            type="button"
            contentEditable={false}
            aria-label="Modifier les informations"
            title="Modifier les informations"
            onClick={(e) => { e.stopPropagation(); setEditingMeta((v) => !v); if (!isOpen) setIsOpen(true); }}
            className="excerpt-edit-btn"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>

          <button
            type="button"
            contentEditable={false}
            aria-label="Supprimer le bloc"
            onClick={(e) => { e.stopPropagation(); deleteNode(); }}
            className="branch-delete-btn excerpt-delete-btn"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        </div>

        {/* Corps — masqué via CSS quand replié */}
        <div className="excerpt-body">
          {(editingMeta || !hasMeta) && (
            <div className="excerpt-meta" contentEditable={false}>
              {cfg.fields.map((f) => (
                <label key={f.key} className="excerpt-meta-field">
                  <span className="excerpt-meta-label">{f.label}</span>
                  <input
                    type={f.numeric ? 'text' : 'text'}
                    inputMode={f.numeric ? 'numeric' : undefined}
                    contentEditable={false}
                    defaultValue={meta[f.key] ?? ''}
                    onBlur={(e) => setField(f.key, e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    placeholder={f.label}
                    className="excerpt-meta-input"
                  />
                </label>
              ))}
            </div>
          )}
          <blockquote className="excerpt-quote">
            <NodeViewContent />
          </blockquote>
        </div>
      </div>
    </NodeViewWrapper>
  );
}
