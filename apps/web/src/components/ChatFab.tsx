import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { ChatPanel } from './ChatPanel';

/**
 * Bouton flottant (FAB) de la messagerie directe owner ↔ confident.
 *
 * Monté une seule fois au niveau de l'app (visible sur toutes les pages).
 * Ne s'affiche que si l'utilisateur a au moins une conversation possible.
 * Un badge indique le nombre de messages non lus. Le paramètre d'URL
 * `?chat=<conversationId>` (deep-link d'une notification push) ouvre le
 * panneau directement sur la bonne conversation.
 */
export function ChatFab() {
  const [open, setOpen] = useState(false);
  const [initialConversationId, setInitialConversationId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // ChatFab est monté à la racine de l'app (y compris sur l'écran de login).
  // On ne lance les requêtes messagerie qu'une fois l'utilisateur authentifié,
  // sinon `directMessages.*` partent avant l'auth et se font rejeter en
  // UNAUTHORIZED (bruit dans les logs serveur).
  const { data: me } = trpc.auth.me.useQuery(undefined, { retry: false });

  const { data: conversations } = trpc.directMessages.conversations.useQuery(undefined, {
    retry: false,
    enabled: !!me,
  });
  const { data: unreadCount = 0 } = trpc.directMessages.unreadCount.useQuery(undefined, {
    retry: false,
    enabled: !!me,
  });

  // Deep-link depuis une notification push : ?chat=<conversationId>
  useEffect(() => {
    const chatParam = searchParams.get('chat');
    if (chatParam) {
      setInitialConversationId(chatParam);
      setOpen(true);
      searchParams.delete('chat');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  if (!conversations || conversations.length === 0) return null;

  return (
    <>
      {/* FAB masqué quand le chat est ouvert (panneau OU bulle réduite) :
          la bulle de ChatPanel prend le relais dans cette même position. */}
      {!open && (
        <button
          type="button"
          onClick={() => { setInitialConversationId(null); setOpen(true); }}
          aria-label="Messagerie"
          className="lg:hidden fixed right-4 z-30 w-12 h-12 rounded-full bg-accent text-bg-elevated shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
          style={{ bottom: 'var(--chatfab-bottom)' }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.38 8.38 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[11px] font-bold flex items-center justify-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      )}

      {open && (
        <ChatPanel
          conversations={conversations}
          initialConversationId={initialConversationId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
