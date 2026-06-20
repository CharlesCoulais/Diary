import { useEffect, useMemo, useState } from 'react';
import { parseChatBody, type ChatMessage } from '../lib/parseChat';

const PLATFORM_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  slack: 'Slack',
  discord: 'Discord',
  sms: 'SMS',
  imessage: 'iMessage',
  messenger: 'Messenger',
  telegram: 'Telegram',
  signal: 'Signal',
  instagram: 'Instagram',
  other: 'Conversation',
};

// Une seule couleur de marque par plateforme — le fond de la bulle "moi" est
// calculé via color-mix() avec le bg du thème : pastel en clair, teinté
// en sombre, automatiquement adapté.
export const PLATFORM_THEME: Record<string, { accent: string; icon: string }> = {
  whatsapp:  { accent: '#25D366', icon: '💬' },
  slack:     { accent: '#A05CA8', icon: '🟣' },
  discord:   { accent: '#5865F2', icon: '👾' },
  sms:       { accent: '#5AC8FA', icon: '✉️' },
  imessage:  { accent: '#0A84FF', icon: '💬' },
  messenger: { accent: '#0084FF', icon: '💬' },
  telegram:  { accent: '#26A5E4', icon: '✈️' },
  signal:    { accent: '#3A76F0', icon: '🔒' },
  instagram: { accent: '#E4405F', icon: '📷' },
  other:     { accent: 'var(--color-accent)', icon: '💬' },
};

const mixWithBg = (color: string, pct: number) =>
  `color-mix(in srgb, ${color} ${pct}%, var(--color-bg-elevated))`;

const PREVIEW_COUNT = 5;

// URL-encode chaque clé/valeur pour gérer les noms contenant ",", "=", quotes,
// retours ligne, etc. Format stocké : "k1=v1,k2=v2" mais chaque k et v sont
// percent-encoded — donc les commas/equals dans les noms ne cassent rien.
export function parseAliases(s: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!s) return map;
  for (const pair of s.split(',')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    try {
      const from = decodeURIComponent(pair.slice(0, eq)).trim();
      const to = decodeURIComponent(pair.slice(eq + 1)).trim();
      if (from && to) map.set(from, to);
    } catch {
      // Fallback rétrocompatibilité : format historique non-encodé
      const [from, to] = pair.split('=').map((x) => x.trim());
      if (from && to) map.set(from, to);
    }
  }
  return map;
}

export function serializeAliases(map: Map<string, string>): string {
  return Array.from(map.entries())
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join(',');
}

// Un message composé uniquement d'emoji (1 à 6) s'affiche en grand, sans bulle
// — comme iMessage / WhatsApp.
const EMOJI_ONLY_RE = /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji_Modifier}|‍|️|\s)+$/u;
function isEmojiOnly(content: string): boolean {
  const t = content.trim();
  if (!t || !EMOJI_ONLY_RE.test(t)) return false;
  let count = 0;
  for (const { segment } of new Intl.Segmenter().segment(t)) {
    if (segment.trim()) count++;
  }
  return count >= 1 && count <= 6;
}

interface ChatDisplayProps {
  platform: string;
  title: string;
  me: string;
  aliases: string;
  raw: string;
  /** Slot pour un bouton "éditer" (uniquement utilisé dans l'éditeur). */
  trailingAction?: React.ReactNode;
  /** Replié à l'affichage initial (true en lecture, false dans l'éditeur). */
  defaultCollapsed?: boolean;
}

function MessageBubble({
  msg,
  isMe,
  displayName,
  theme,
}: {
  msg: ChatMessage;
  isMe: boolean;
  displayName: string;
  theme: typeof PLATFORM_THEME[string];
}) {
  // Message "jumbo" : uniquement des emoji, sans citation ni image → grand, sans bulle.
  const jumbo = !msg.replyTo && msg.images.length === 0 && isEmojiOnly(msg.content);

  return (
    <div className={`flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'} max-w-[85%] ${isMe ? 'ml-auto' : 'mr-auto'}`}>
      <div className="flex items-baseline gap-1.5 px-1 text-[11px] text-text-muted/60">
        <span className="font-medium">{displayName}</span>
        {msg.timestamp && <span className="text-text-muted/55">· {msg.timestamp}</span>}
      </div>
      {jumbo ? (
        <div className="px-1 py-0.5 text-[2.5rem] leading-tight break-words">{msg.content}</div>
      ) : (
      <div
        className={`px-3 py-1.5 rounded-2xl text-sm whitespace-pre-wrap break-words border shadow-soft ${
          isMe ? 'rounded-tr-sm' : 'rounded-tl-sm'
        }`}
        style={
          isMe
            ? { background: mixWithBg(theme.accent, 32), borderColor: mixWithBg(theme.accent, 60) }
            : { background: mixWithBg(theme.accent, 14), borderColor: mixWithBg(theme.accent, 38) }
        }
      >
        {msg.replyTo && (
          <div
            className="mb-1.5 pl-2 py-0.5 border-l-[3px] rounded-sm"
            style={{
              borderColor: theme.accent,
              background: 'color-mix(in srgb, var(--color-text-primary) 8%, transparent)',
            }}
          >
            <p
              className="text-[11px] font-semibold leading-tight"
              style={{ color: `color-mix(in srgb, ${theme.accent} 60%, var(--color-text-primary))` }}
            >
              {msg.replyTo.author}
            </p>
            <p className="text-[12px] italic text-text-primary/85 leading-snug line-clamp-3 whitespace-pre-wrap">
              {msg.replyTo.content}
            </p>
          </div>
        )}
        {msg.content || (msg.images.length === 0 && !msg.replyTo ? <span className="italic text-text-muted/55">(message vide)</span> : null)}
        {msg.images.length > 0 && (
          <div className={`flex flex-wrap gap-1.5 ${msg.content ? 'mt-2' : ''}`}>
            {msg.images.map((src, i) => (
              <img
                key={i}
                src={src.startsWith('http') || src.startsWith('/') ? src : `/images/${src}`}
                alt=""
                className="max-h-48 max-w-full rounded-lg object-cover"
                loading="lazy"
              />
            ))}
          </div>
        )}
      </div>
      )}
      {msg.reactions.length > 0 && (
        <div className={`flex flex-wrap gap-1 ${isMe ? 'mr-2' : 'ml-2'}`}>
          {msg.reactions.map((r, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-bg-primary border border-text-muted/15 text-[11px] text-text-muted shadow-sm"
              title={r.by.length > 0 ? `Par ${r.by.join(', ')}` : undefined}
            >
              <span className="text-xs">{r.emoji}</span>
              {r.by.length > 0 && <span className="text-text-muted/70">{r.by.length}</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatDisplay({ platform, title, me, aliases, raw, trailingAction, defaultCollapsed = false }: ChatDisplayProps) {
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  // Répond aux boutons « tout replier / déplier » (éditeur : branch:*, lecture : blocks:*).
  useEffect(() => {
    const expand = () => setCollapsed(false);
    const collapse = () => setCollapsed(true);
    for (const ev of ['branch:expandAll', 'blocks:expandAll']) window.addEventListener(ev, expand);
    for (const ev of ['branch:collapseAll', 'blocks:collapseAll']) window.addEventListener(ev, collapse);
    return () => {
      for (const ev of ['branch:expandAll', 'blocks:expandAll']) window.removeEventListener(ev, expand);
      for (const ev of ['branch:collapseAll', 'blocks:collapseAll']) window.removeEventListener(ev, collapse);
    };
  }, []);
  const messages = useMemo(() => parseChatBody(raw), [raw]);
  const aliasMap = useMemo(() => parseAliases(aliases), [aliases]);
  const theme = PLATFORM_THEME[platform] ?? PLATFORM_THEME['other']!;
  const platformLabel = PLATFORM_LABEL[platform] ?? PLATFORM_LABEL['other']!;

  const isMe = (author: string) => {
    const a = author.trim();
    if (me && a === me) return true;
    // Sans « moi » explicite : seuls « Moi / Me / I » sont le côté « moi ».
    // « Toi » (et tout autre nom) = l'interlocuteur → permet une conversation
    // entièrement côté interlocuteur, sans aucun message « moi ».
    if (!me && /^(moi|me|i)$/i.test(a)) return true;
    return false;
  };
  const displayName = (author: string): string => {
    if (isMe(author)) return 'Moi';
    return aliasMap.get(author) ?? author;
  };

  const shouldCollapse = messages.length > PREVIEW_COUNT && !expanded;
  const visibleMessages = shouldCollapse ? messages.slice(0, PREVIEW_COUNT - 2) : messages;

  return (
    <div
      className="my-3 rounded-2xl border overflow-hidden font-sans"
      style={{ borderColor: mixWithBg(theme.accent, 30), background: mixWithBg(theme.accent, 4), fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif' }}
    >
      <div
        className="flex items-center justify-between gap-2 px-3 py-2 border-b"
        style={{ borderColor: mixWithBg(theme.accent, 25) }}
      >
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 min-w-0 text-xs flex-1 text-left"
          title={collapsed ? 'Déplier la conversation' : 'Replier la conversation'}
        >
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 transition-transform" style={{ color: theme.accent, transform: collapsed ? 'rotate(-90deg)' : 'none' }}>
            <path d="M1 3l4 4 4-4" />
          </svg>
          <span className="text-base leading-none">{theme.icon}</span>
          <span className="font-semibold" style={{ color: theme.accent }}>{platformLabel}</span>
          {title && <span className="truncate text-text-muted">· {title}</span>}
          <span className="text-text-muted/50">· {messages.length} message{messages.length > 1 ? 's' : ''}</span>
        </button>
        {trailingAction}
      </div>

      {!collapsed && (
      <div className="p-3 flex flex-col gap-2.5">
        {messages.length === 0 && (
          <p className="text-xs text-text-muted/50 italic">Conversation vide.</p>
        )}
        {visibleMessages.map((m, i) => (
          <MessageBubble
            key={i}
            msg={m}
            isMe={isMe(m.author)}
            displayName={displayName(m.author)}
            theme={theme}
          />
        ))}
        {shouldCollapse && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-xs hover:opacity-80 transition-opacity py-1.5 border-t border-text-muted/10 mt-1"
            style={{ color: theme.accent }}
          >
            Voir les {messages.length - (PREVIEW_COUNT - 2)} autres messages →
          </button>
        )}
        {expanded && messages.length > PREVIEW_COUNT && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-xs text-text-muted/70 hover:text-text-primary transition-colors py-1.5 border-t border-text-muted/10 mt-1"
          >
            Réduire
          </button>
        )}
      </div>
      )}
    </div>
  );
}

export { PLATFORM_LABEL };
