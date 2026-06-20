import { useEffect, useRef, useState } from 'react';
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { DatePicker } from '../../DatePicker';
import { TimeInput } from '../../TimeInput';

function formatEditDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function isoToDatetimeLocal(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

export function EditBlockNodeView({ node, deleteNode, updateAttributes, getPos }: NodeViewProps) {
  const datetime = node.attrs.datetime as string | null;
  const anchorText = node.attrs.anchorText as string | null;
  const [editingDate, setEditingDate] = useState(false);
  const [dateValue, setDateValue] = useState('');
  const [timeValue, setTimeValue] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  // Scroll to this block when the anchor icon is clicked in the text
  useEffect(() => {
    const pos = typeof getPos === 'function' ? getPos() : null;
    if (pos === null) return;
    const handle = (e: Event) => {
      const custom = e as CustomEvent<{ pos: number }>;
      if (custom.detail.pos === pos) {
        panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        panelRef.current?.classList.add('edit-block-flash');
        setTimeout(() => panelRef.current?.classList.remove('edit-block-flash'), 1200);
      }
    };
    window.addEventListener('editBlock:scrollTo', handle);
    return () => window.removeEventListener('editBlock:scrollTo', handle);
  }, [getPos]);

  const openDateEdit = () => {
    const dt = datetime ? isoToDatetimeLocal(datetime) : isoToDatetimeLocal(new Date().toISOString());
    setDateValue(dt.slice(0, 10));
    setTimeValue(dt.slice(11, 16));
    setEditingDate(true);
  };

  const confirmDateEdit = (date: string, time: string) => {
    if (date) {
      updateAttributes({ datetime: new Date(`${date}T${time || '12:00'}`).toISOString() });
    }
    setEditingDate(false);
  };

  return (
    <NodeViewWrapper>
      <div ref={panelRef} className="edit-block-panel">
        <div className="edit-block-header" contentEditable={false}>
          <span
            className="branch-drag-handle"
            data-drag-handle
            contentEditable={false}
            onClick={(e) => e.stopPropagation()}
            title="Déplacer le bloc"
          >
            <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
              <circle cx="3" cy="2.5" r="1.2"/><circle cx="7" cy="2.5" r="1.2"/>
              <circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/>
              <circle cx="3" cy="11.5" r="1.2"/><circle cx="7" cy="11.5" r="1.2"/>
            </svg>
          </span>
          <svg
            className="edit-block-icon"
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>

          {/* Date — cliquable pour antidater */}
          {editingDate ? (
            <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <DatePicker
                value={dateValue}
                onChange={(v) => { setDateValue(v); if (v) confirmDateEdit(v, timeValue); }}
                max={new Date().toISOString().slice(0, 10)}
                placeholder="Date…"
                className="edit-block-date-input !py-0.5 !px-1.5 !rounded !text-[11px]"
              />
              <TimeInput
                value={timeValue}
                onChange={(v) => { setTimeValue(v); if (dateValue) confirmDateEdit(dateValue, v); }}
                className="!text-[11px] !py-0.5 !w-[60px]"
              />
            </span>
          ) : (
            <button
              type="button"
              className="edit-block-label edit-block-date-btn"
              title="Cliquer pour modifier la date"
              onClick={(e) => { e.stopPropagation(); openDateEdit(); }}
            >
              Ajout du {datetime ? formatEditDate(datetime) : '…'}
            </button>
          )}

          {/* Anchor preview */}
          {anchorText && !editingDate && (
            <span className="edit-block-anchor-preview" title={anchorText}>
              «&nbsp;{anchorText}&nbsp;»
            </span>
          )}

          {/* Delete */}
          <button
            type="button"
            contentEditable={false}
            aria-label="Supprimer cet ajout"
            onClick={(e) => { e.stopPropagation(); deleteNode(); }}
            className="edit-block-delete-btn"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        </div>
        <div className="edit-block-body">
          <NodeViewContent />
        </div>
      </div>
    </NodeViewWrapper>
  );
}
