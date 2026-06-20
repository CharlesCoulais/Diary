import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { trpc } from '../lib/trpc';

function useAuthMe() {
  return trpc.auth.me.useQuery(undefined, { retry: false });
}

function Loading() {
  return <div className="min-h-dvh flex items-center justify-center text-text-muted text-sm">Chargement…</div>;
}

/**
 * Si le user a `mustChangePassword: true` (cas typique : l'owner vient de
 * régénérer un mdp temporaire pour ce confident), on bloque toute
 * navigation hors de `/force-change-password`. C'est mutualisé dans les
 * 3 guards pour ne pas avoir à le câbler sur chaque page.
 */
function mustChange(data: { mustChangePassword?: boolean } | null | undefined) {
  return !!data?.mustChangePassword;
}

/** Pages accessibles à tous les utilisateurs authentifiés. */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useAuthMe();

  if (isLoading) return <Loading />;
  // isError = erreur réseau/429 → ne pas rediriger, attendre que ça passe
  if (isError) return <Loading />;
  if (!data) return <Navigate to="/login" replace />;
  if (mustChange(data)) return <Navigate to="/force-change-password" replace />;
  return <>{children}</>;
}

/** Pages accessibles uniquement à l'Owner — redirige les Guests vers /. */
export function OwnerGuard({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useAuthMe();

  if (isLoading || isError) return <Loading />;
  if (!data) return <Navigate to="/login" replace />;
  if (mustChange(data)) return <Navigate to="/force-change-password" replace />;
  if (data.role === 'GUEST') return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Pages accessibles à l'Owner et aux Guests Confidant. */
export function ConfidantGuard({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useAuthMe();

  if (isLoading || isError) return <Loading />;
  if (!data) return <Navigate to="/login" replace />;
  if (mustChange(data)) return <Navigate to="/force-change-password" replace />;
  if (data.role === 'GUEST' && data.guestAccess !== 'CONFIDANT') return <Navigate to="/" replace />;
  return <>{children}</>;
}

/**
 * Pages activables au cas par cas pour les Guests Confidant.
 * L'Owner y accède toujours ; le Confidant seulement si le flag correspondant
 * est activé dans ses permissions.
 */
export function GuestFeatureGuard({
  children,
  feature,
}: {
  children: ReactNode;
  feature: 'guestCanViewCalendar' | 'guestCanViewAgenda' | 'guestCanViewBudget';
}) {
  const { data, isLoading, isError } = useAuthMe();

  if (isLoading || isError) return <Loading />;
  if (!data) return <Navigate to="/login" replace />;
  if (mustChange(data)) return <Navigate to="/force-change-password" replace />;
  if (data.role === 'OWNER') return <>{children}</>;
  if (data.role === 'GUEST' && data.guestAccess === 'CONFIDANT' && (data as Record<string, unknown>)[feature]) return <>{children}</>;
  return <Navigate to="/" replace />;
}
