import { useEffect, useState } from 'react';

const TYPING_TTL_MS = 6000;

/**
 * Cœur partagé des indicateurs « est en train d'écrire ».
 *
 * Écoute un CustomEvent `window`, filtre les signaux par `channelId`, et garde
 * chaque personne « active » pendant ~6 s après son dernier signal. Retourne la
 * liste des prénoms actuellement en train d'écrire (vide si personne).
 */
function useTypingCore(
  eventName: string,
  channelKey: string,
  channelId: string,
): string[] {
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    if (!channelId) return;
    // by → timestamp d'expiration
    const active = new Map<string, number>();

    const refresh = () => {
      const now = Date.now();
      for (const [by, exp] of active) {
        if (exp <= now) active.delete(by);
      }
      setNames((prev) => {
        const next = [...active.keys()];
        // Évite un re-render si rien n'a changé.
        if (prev.length === next.length && prev.every((n, i) => n === next[i])) return prev;
        return next;
      });
    };

    const onTyping = (e: Event) => {
      const detail = (e as CustomEvent).detail as Record<string, string | undefined>;
      if (!detail || detail[channelKey] !== channelId || !detail.by) return;
      active.set(detail.by, Date.now() + TYPING_TTL_MS);
      refresh();
    };

    window.addEventListener(eventName, onTyping);
    const interval = setInterval(refresh, 1500);
    return () => {
      window.removeEventListener(eventName, onTyping);
      clearInterval(interval);
    };
  }, [eventName, channelKey, channelId]);

  return names;
}

/**
 * Indicateur « est en train d'écrire » pour le fil de commentaires d'une entrée.
 * Écoute les événements SSE `carnet:typing` relayés par ServerEventsBridge.
 */
export function useTypingIndicator(entryId: string): string[] {
  return useTypingCore('carnet:typing', 'entryId', entryId);
}

/**
 * Indicateur « est en train d'écrire » pour une conversation directe.
 * Écoute les événements SSE `carnet:dm-typing` relayés par ServerEventsBridge.
 */
export function useDmTypingIndicator(conversationId: string): string[] {
  return useTypingCore('carnet:dm-typing', 'conversationId', conversationId);
}
