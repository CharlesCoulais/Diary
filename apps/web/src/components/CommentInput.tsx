import { useLayoutEffect, useRef, useState } from 'react';
import { SpellCheckButton } from './SpellCheckButton';
import { trpc } from '../lib/trpc';
import { useTypingIndicator, useDmTypingIndicator } from '../lib/useTypingIndicator';
import { useDropdownAlign } from '../lib/useDropdownAlign';

interface CommentInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  size?: 'sm' | 'lg';
  /** Si fourni, active l'indicateur « est en train d'écrire » : ping throttlé
   *  à la frappe + affichage des autres personnes qui écrivent sur ce fil. */
  entryId?: string;
  /** Variante messagerie directe : active l'indicateur de frappe sur une
   *  conversation directe au lieu d'un fil de commentaires. */
  dmConversationId?: string;
  /** Force l'état du bouton d'envoi. Si non fourni, l'envoi est possible dès
   *  que le champ texte n'est pas vide. Utile quand un média seul suffit. */
  submitEnabled?: boolean;
  /** Active l'autocomplétion @ pour mentionner une personne (owner ↔ confidents).
   *  Désactivé par défaut (ex: messagerie directe 1:1 où ça n'a pas de sens). */
  enableMentions?: boolean;
}

function insertAround(
  textarea: HTMLTextAreaElement,
  before: string,
  after: string,
  setValue: (v: string) => void,
) {
  const { selectionStart: s, selectionEnd: e, value } = textarea;
  const selected = value.slice(s, e);
  const wrapped = `${before}${selected || 'texte'}${after}`;
  const next = value.slice(0, s) + wrapped + value.slice(e);
  setValue(next);
  requestAnimationFrame(() => {
    textarea.focus();
    if (selected) {
      textarea.setSelectionRange(s + before.length, s + before.length + (selected || 'texte').length);
    } else {
      textarea.setSelectionRange(s + before.length, s + before.length + 5);
    }
  });
}

const TOOLS = [
  { label: 'G', title: 'Gras', before: '**', after: '**', className: 'font-bold' },
  { label: 'I', title: 'Italique', before: '*', after: '*', className: 'italic' },
  { label: 'S', title: 'Barré', before: '~~', after: '~~', className: 'line-through' },
  { label: '`', title: 'Code', before: '`', after: '`', className: 'font-mono' },
  // Spoiler ||texte|| — rendu en flou avec click-to-reveal au lecture.
  // L'aperçu dans la toolbar est volontairement masqué (style spoiler)
  // pour rappeler ce que fait le marqueur en aval.
  { label: '◐', title: 'Spoiler', before: '||', after: '||', className: 'text-text-muted/70' },
] as const;

type Mentionable = { id: string; displayName: string | null; email: string };
function mentionLabel(u: Mentionable): string {
  return u.displayName || u.email.split('@')[0] || u.email;
}

export function CommentInput({ value, onChange, onSubmit, placeholder, disabled, textareaRef, size = 'sm', entryId, dmConversationId, submitEnabled, enableMentions }: CommentInputProps) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? innerRef;
  const isLg = size === 'lg';
  const [focused, setFocused] = useState(false);

  // Auto-agrandissement : le champ grandit avec le contenu, jusqu'à ~5 lignes.
  const maxHeight = isLg ? 240 : 150;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [value, maxHeight, ref]);

  // « est en train d'écrire » : ping throttlé à la frappe + indicateur entrant.
  // Deux canaux possibles : fil de commentaires (entryId) ou messagerie
  // directe (dmConversationId).
  const commentTyping = trpc.comments.typing.useMutation();
  const dmTyping = trpc.directMessages.typing.useMutation();
  const lastTypingPing = useRef(0);
  const entryTypists = useTypingIndicator(entryId ?? '');
  const dmTypists = useDmTypingIndicator(dmConversationId ?? '');
  const typists = dmConversationId ? dmTypists : entryTypists;
  const typingEnabled = !!(entryId || dmConversationId);

  // Autocomplétion @mention — liste des personnes mentionnables (chargée une fois).
  const { data: mentionables = [] } = trpc.guests.listMentionable.useQuery(undefined, {
    enabled: !!enableMentions,
    staleTime: 5 * 60_000,
  });
  // État : token @ en cours de frappe (query saisie + index du '@' dans la valeur).
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const { panelRef, panelStyle } = useDropdownAlign<HTMLUListElement>(!!mention);

  const filtered = mention
    ? mentionables.filter((u) => mentionLabel(u).toLowerCase().includes(mention.query.toLowerCase())).slice(0, 6)
    : [];
  const showMentions = !!mention && filtered.length > 0;

  // Détecte un token @ collé au curseur : `@` précédé d'un début ou d'un espace,
  // suivi de lettres/chiffres/_/-. Sinon, ferme le panneau.
  const detectMention = (el: HTMLTextAreaElement) => {
    if (!enableMentions) return;
    const pos = el.selectionStart ?? 0;
    const before = el.value.slice(0, pos);
    const m = before.match(/(?:^|\s)@([\p{L}\p{N}_-]*)$/u);
    if (m) {
      setMention({ query: m[1] ?? '', start: pos - (m[1]?.length ?? 0) - 1 });
      setActiveIdx(0);
    } else if (mention) {
      setMention(null);
    }
  };

  const pickMention = (u: Mentionable) => {
    const el = ref.current;
    if (!el || !mention) return;
    const token = `[@${mentionLabel(u)}](mention:${u.id})`;
    const caretEnd = el.selectionStart ?? value.length;
    const next = value.slice(0, mention.start) + token + ' ' + value.slice(caretEnd);
    onChange(next);
    const caret = mention.start + token.length + 1;
    setMention(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  // Bouton @ de la toolbar : insère un « @ » au curseur (avec espace devant si
  // besoin) et ouvre le panneau de suggestion — rend les mentions découvrables
  // sans connaître le raccourci (TRANS-04).
  const insertMentionTrigger = () => {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart ?? value.length;
    const e = el.selectionEnd ?? s;
    const needsSpace = s > 0 && !/\s/.test(value[s - 1] ?? '');
    const insert = needsSpace ? ' @' : '@';
    onChange(value.slice(0, s) + insert + value.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      const pos = s + insert.length;
      el.setSelectionRange(pos, pos);
      detectMention(el);
    });
  };

  const handleChange = (v: string) => {
    onChange(v);
    if (typingEnabled && v.trim()) {
      const now = Date.now();
      if (now - lastTypingPing.current > 3000) {
        lastTypingPing.current = now;
        if (dmConversationId) dmTyping.mutate({ conversationId: dmConversationId });
        else if (entryId) commentTyping.mutate({ entryId });
      }
    }
  };

  return (
    <div className="flex flex-col gap-1">
      {typingEnabled && typists.length > 0 && (
        <p className="text-[11px] text-text-muted/70 italic px-1">
          {typists.length === 1
            ? `${typists[0]} est en train d'écrire…`
            : 'Plusieurs personnes écrivent…'}
        </p>
      )}
      <div className="flex items-center gap-2">
        {/* Encadré pill : toolbar (au focus) + textarea */}
        <div className={`relative flex-1 flex flex-col rounded-2xl bg-bg-primary border transition-colors duration-150 ${focused ? 'border-text-muted/25' : 'border-text-muted/10'}`}>
          {/* Panneau d'autocomplétion @mention — ancré au-dessus du champ (évite le clavier mobile) */}
          {showMentions && (
            <ul
              ref={panelRef}
              style={panelStyle}
              className="absolute left-0 bottom-full mb-1 z-30 w-56 max-h-48 overflow-y-auto rounded-xl bg-bg-elevated border border-text-muted/15 shadow-soft py-1 scrollbar-soft"
            >
              {filtered.map((u, i) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); pickMention(u); }}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${i === activeIdx ? 'bg-accent/15 text-accent' : 'text-text-primary hover:bg-text-muted/10'}`}
                  >
                    <span className="font-medium">@{mentionLabel(u)}</span>
                    {u.displayName && <span className="ml-1.5 text-[11px] text-text-muted/50">{u.email.split('@')[0]}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Toolbar — toujours visible (l'affordance de formatage doit être
              découvrable sans focus préalable, FEED-06). */}
          <div className="flex items-center gap-0.5 px-2 pt-1.5 pb-0.5 flex-wrap">
            {TOOLS.map((t) => (
              <button
                key={t.label}
                type="button"
                title={t.title}
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (ref.current) insertAround(ref.current, t.before, t.after, onChange);
                }}
                className={`inline-flex items-center justify-center px-2 py-1 min-w-[28px] [@media(pointer:coarse)]:min-w-[32px] [@media(pointer:coarse)]:min-h-[32px] text-xs rounded text-text-muted hover:text-text-primary hover:bg-text-muted/10 transition-colors ${t.className}`}
              >
                {t.label}
              </button>
            ))}
            {enableMentions && (
              <button
                type="button"
                title="Mentionner quelqu'un"
                aria-label="Mentionner quelqu'un"
                onMouseDown={(e) => { e.preventDefault(); insertMentionTrigger(); }}
                className="inline-flex items-center justify-center px-2 py-1 min-w-[28px] [@media(pointer:coarse)]:min-w-[32px] [@media(pointer:coarse)]:min-h-[32px] text-xs rounded text-text-muted hover:text-accent hover:bg-text-muted/10 transition-colors font-medium"
              >
                @
              </button>
            )}
            <div className="w-px h-3 bg-text-muted/20 mx-1" />
            <SpellCheckButton
              size="sm"
              getText={() => value}
              onApply={(corrected) => onChange(corrected)}
            />
          </div>

          {/* Textarea */}
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => { handleChange(e.target.value); detectMention(e.target); }}
            onFocus={() => setFocused(true)}
            onBlur={() => { setFocused(false); setMention(null); }}
            onClick={(e) => detectMention(e.currentTarget)}
            onKeyUp={(e) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) detectMention(e.currentTarget); }}
            onKeyDown={(e) => {
              if (showMentions) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => (i + 1) % filtered.length); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length); return; }
                if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(filtered[activeIdx]!); return; }
                if (e.key === 'Escape') { e.preventDefault(); setMention(null); return; }
              }
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSubmit(); }
            }}
            placeholder={placeholder ?? 'Répondre…'}
            rows={isLg ? 4 : 1}
            disabled={disabled}
            className="w-full bg-transparent px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/55 outline-none resize-none leading-relaxed overflow-y-auto scrollbar-soft"
            style={{ minHeight: isLg ? '90px' : '40px', maxHeight: `${maxHeight}px` }}
          />
        </div>

        {/* Bouton envoi */}
        <button
          type="button"
          onClick={onSubmit}
          disabled={(submitEnabled !== undefined ? !submitEnabled : !value.trim()) || disabled}
          className="tap shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-bg-primary bg-accent hover:bg-accent/90 disabled:opacity-40 transition-all duration-150 shadow-sm text-sm"
        >
          →
        </button>
      </div>
    </div>
  );
}
