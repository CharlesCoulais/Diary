import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { apiClient } from '../../../lib/trpc';

export function VideoNodeView({ node, deleteNode, updateAttributes, selected }: NodeViewProps) {
  const src = node.attrs.src as string | null;
  const filename = node.attrs.filename as string;
  const spoiler = node.attrs.spoiler as boolean;
  const souvenir = node.attrs.souvenir as boolean;

  if (!src) return null;

  async function handleDelete() {
    const idMatch = src?.match(/\/videos\/([^/?]+)/);
    if (idMatch?.[1]) {
      try {
        await apiClient.videos.delete.mutate({ id: idMatch[1] });
      } catch {
        // Le fichier sera nettoyé si la note est supprimée
      }
    }
    deleteNode();
  }

  return (
    <NodeViewWrapper>
      <div className={`video-node-wrapper${selected ? ' video-node-selected' : ''}${spoiler ? ' video-node-spoiler' : ''}`} contentEditable={false}>
        <span
          className="branch-drag-handle video-node-drag"
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
        <video
          src={src}
          controls
          preload="metadata"
          className="video-node-player"
          title={filename}
        />
        <div className="audio-node-actions">
          <button
            type="button"
            onClick={() => updateAttributes({ souvenir: !souvenir })}
            className={`audio-node-action-btn${souvenir ? ' audio-node-action-active' : ''}`}
            aria-label={souvenir ? 'Retirer des souvenirs' : 'Ajouter aux souvenirs'}
          >
            {souvenir
              ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> Souvenir</>
              : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Souvenir</>
            }
          </button>
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
            onClick={() => void handleDelete()}
            className="audio-node-action-btn audio-node-action-danger"
            aria-label="Supprimer la vidéo"
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
