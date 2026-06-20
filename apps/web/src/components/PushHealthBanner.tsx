import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { trpc } from '../lib/trpc';

const DISMISS_KEY = 'push-health-dismissed-at';
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Bandeau in-app qui s'affiche quand les notifs push ont été désactivées par
 * le device/browser (subscription invalidée par FCM/APNs sans intervention de
 * l'utilisateur) — propose d'aller les réactiver.
 */
export function PushHealthBanner() {
  const { data: me } = trpc.auth.me.useQuery(undefined, { retry: false });
  const { data: settings } = trpc.notifications.getSettings.useQuery(undefined, {
    enabled: !!me,
  });
  const [browserEndpoint, setBrowserEndpoint] = useState<string | null>(null);
  const [browserChecked, setBrowserChecked] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // 1. Charge la subscription PushManager côté navigateur — re-check si les
  //    settings changent (e.g. l'utilisateur vient de réactiver les notifs) ou
  //    quand la page reprend le focus.
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setBrowserChecked(true);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        if (cancelled) return;
        if (!reg) { setBrowserChecked(true); return; }
        const sub = await reg.pushManager.getSubscription();
        if (cancelled) return;
        setBrowserEndpoint(sub?.endpoint ?? null);
        setBrowserChecked(true);
      } catch {
        if (!cancelled) setBrowserChecked(true);
      }
    };
    refresh();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { cancelled = true; window.removeEventListener('focus', onFocus); };
  }, [settings?.enabled]);

  // 2. Demande au serveur si l'endpoint actuel est toujours enregistré
  const check = trpc.notifications.checkSubscription.useQuery(
    { endpoint: browserEndpoint ?? '' },
    { enabled: !!browserEndpoint, staleTime: 60_000 },
  );

  // 3. Restaure le state "dismissed" depuis localStorage (TTL 24h)
  useEffect(() => {
    try {
      const ts = Number(localStorage.getItem(DISMISS_KEY) ?? '0');
      if (ts && Date.now() - ts < DISMISS_TTL_MS) setDismissed(true);
    } catch { /* noop */ }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* noop */ }
  };

  // Conditions pour afficher le bandeau :
  //  - User connecté
  //  - Notifs activées côté serveur
  //  - Browser a fini de check
  //  - Soit pas de subscription côté navigateur (mais le serveur pense que oui)
  //  - Soit subscription navigateur mais pas en DB (410 silencieux passé)
  const isUnhealthy = !!me
    && !!settings?.enabled
    && browserChecked
    && (
      !browserEndpoint
      || (check.isFetched && check.data?.alive === false)
    );

  if (!isUnhealthy || dismissed) return null;

  return (
    <div
      className="backdrop-blur-sm text-xs font-medium px-4 py-2 flex items-center justify-center gap-3"
      style={{ background: 'rgba(245, 158, 11, 0.92)', color: 'var(--color-bg-primary)' }}
    >
      <span className="flex items-center gap-1.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
          <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
          <path d="M18 8a6 6 0 0 0-9.33-5" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
        Notifs push expirées
      </span>
      <Link
        to={me?.role === 'GUEST' ? '/reglages' : '/settings'}
        className="underline underline-offset-2 hover:no-underline"
      >
        Réactiver
      </Link>
      <button
        type="button"
        onClick={handleDismiss}
        className="ml-2 opacity-70 hover:opacity-100"
        aria-label="Masquer"
      >
        ✕
      </button>
    </div>
  );
}
