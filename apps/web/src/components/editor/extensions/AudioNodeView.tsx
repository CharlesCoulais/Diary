import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { AudioPlayer } from '../../AudioPlayer';

export function AudioNodeView({ node, deleteNode, updateAttributes, selected }: NodeViewProps) {
  const src = node.attrs.src as string | null;
  const filename = node.attrs.filename as string;
  const spoiler = node.attrs.spoiler as boolean;

  if (!src) return null;

  return (
    <NodeViewWrapper>
      <div className={`audio-node-wrapper${selected ? ' audio-node-selected' : ''}${spoiler ? ' audio-node-spoiler' : ''}`} contentEditable={false}>
        <span
          className="branch-drag-handle audio-node-drag"
          data-drag-handle
          title="Déplacer"
          aria-hidden="true"
        >
          <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
            <circle cx="3" cy="2.5" r="1.2"/><circle cx="7" cy="2.5" r="1.2"/>
            <circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/>
            <circle cx="3" cy="11.5" r="1.2"/><circle cx="7" cy="11.5" r="1.2"/>
          </svg>
        </span>
        <AudioPlayer src={src} filename={filename} />
        <div className="audio-node-actions">
          <button
            type="button"
            onClick={() => updateAttributes({ spoiler: !spoiler })}
            className={`audio-node-action-btn${spoiler ? ' audio-node-action-active' : ''}`}
            aria-label={spoiler ? 'Retirer le spoiler' : 'Marquer comme spoiler'}
          >
            {spoiler
              ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg> Spoiler actif</>
              : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Spoiler</>
            }
          </button>
          <button
            type="button"
            onClick={deleteNode}
            className="audio-node-action-btn audio-node-action-danger"
            aria-label="Supprimer l'audio"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        </div>
      </div>
    </NodeViewWrapper>
  );
}
