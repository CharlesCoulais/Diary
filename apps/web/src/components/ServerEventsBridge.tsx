import { useEffect } from 'react';
import { trpc } from '../lib/trpc';

/**
 * Pont temps réel (SSE) : ouvre un `EventSource` vers `/events` tant que
 * l'utilisateur est authentifié. À chaque événement serveur, invalide les
 * caches React Query concernés — ce qui remplace le polling périodique.
 *
 * `EventSource` se reconnecte tout seul en cas de coupure réseau.
 * Rendu une seule fois, au niveau de l'app.
 */
export function ServerEventsBridge() {
  const { data: me } = trpc.auth.me.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();
  const authed = !!me;

  useEffect(() => {
    if (!authed) return;
    const es = new EventSource('/events');

    // Chaque invalidation est isolée : si l'une lève ou rejette, les autres
    // s'exécutent quand même (un cache cassé ne doit pas bloquer le reste).
    const inv = (fn: () => Promise<unknown>) => {
      try {
        void fn().catch(() => { /* invalidation best-effort */ });
      } catch { /* idem */ }
    };

    es.onmessage = (e) => {
      let msg: { kind?: string; entryId?: string; by?: string; conversationId?: string };
      try {
        msg = JSON.parse(e.data) as typeof msg;
      } catch {
        return;
      }
      switch (msg.kind) {
        case 'notification':
          inv(() => utils.notifications.list.invalidate());
          inv(() => utils.notifications.listArchived.invalidate());
          break;
        case 'comment':
          inv(() => utils.comments.activity.invalidate());
          inv(() => utils.comments.list.invalidate());
          inv(() => utils.comments.count.invalidate());
          inv(() => utils.notifications.list.invalidate());
          break;
        case 'reaction':
          inv(() => utils.reactions.forEntry.invalidate());
          inv(() => utils.reactions.forComment.invalidate());
          break;
        case 'rating':
          // Favoris / nul : guest → invalidate les queries online qui contiennent
          // les entries (et donc les ratings filtrées) ; owner → re-pull Dexie
          // pour récupérer la nouvelle rating dans son store local.
          inv(() => utils.entries.list.invalidate());
          inv(() => utils.entries.byId.invalidate());
          inv(() => utils.ratings.listForEntry.invalidate());
          window.dispatchEvent(new Event('carnet:sse-sync'));
          break;
        case 'entry':
          inv(() => utils.entries.list.invalidate());
          inv(() => utils.entries.byId.invalidate());
          // Le verrou de lecture : si une réponse est ajoutée ou décidée,
          // la section de validation owner et le statut côté confident doivent
          // refléter le changement immédiatement.
          inv(() => utils.readGate.listForEntry.invalidate());
          inv(() => utils.readGate.statusesForOwner.invalidate());
          break;
        case 'topicRequest':
          inv(() => utils.topicRequests.pendingCount.invalidate());
          inv(() => utils.topicRequests.list.invalidate());
          break;
        case 'task':
          // Confident : query tRPC. Owner : tâches en Dexie → re-pull.
          inv(() => utils.tasks.list.invalidate());
          inv(() => utils.tasks.writingIdeas.invalidate());
          window.dispatchEvent(new Event('carnet:sse-sync'));
          break;
        case 'dailyLog':
          inv(() => utils.dailyLog.list.invalidate());
          break;
        case 'coupleDay':
          // Le baromètre du Confident (fetch API) se recharge sur cet événement.
          window.dispatchEvent(new Event('carnet:sse-couple-day'));
          break;
        case 'typing':
          // « est en train d'écrire » : relayé au fil concerné via un
          // CustomEvent ; le hook useTypingIndicator filtre par entryId.
          if (msg.entryId && msg.by) {
            window.dispatchEvent(
              new CustomEvent('carnet:typing', { detail: { entryId: msg.entryId, by: msg.by } }),
            );
          }
          break;
        case 'directMessage':
          inv(() => utils.directMessages.list.invalidate());
          inv(() => utils.directMessages.conversations.invalidate());
          inv(() => utils.directMessages.unreadCount.invalidate());
          break;
        case 'presence':
          // Un membre du cercle vient de passer en/hors ligne → on rafraîchit
          // la liste des conversations (qui porte le champ `otherOnline`).
          inv(() => utils.directMessages.conversations.invalidate());
          break;
        case 'dmTyping':
          // « est en train d'écrire » de la messagerie directe : relayé au
          // panneau de chat via un CustomEvent ; useDmTypingIndicator filtre
          // par conversationId.
          if (msg.conversationId && msg.by) {
            window.dispatchEvent(
              new CustomEvent('carnet:dm-typing', {
                detail: { conversationId: msg.conversationId, by: msg.by },
              }),
            );
          }
          break;
        case 'sync':
          // Données Dexie de l'owner modifiées ailleurs (autre appareil) →
          // déclenche un re-pull via useSync, qui écoute cet événement.
          window.dispatchEvent(new Event('carnet:sse-sync'));
          break;
      }
    };
    return () => es.close();
  }, [authed, utils]);

  return null;
}
