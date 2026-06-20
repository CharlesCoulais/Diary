import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { AuthLayout } from '../components/AuthLayout';
import { Input } from '../components/Input';
import { Button } from '../components/Button';

export function AcceptInvitationPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();

  const { data: info, isLoading, error } = trpc.guests.invitationInfo.useQuery(
    { token },
    { enabled: !!token, retry: false },
  );

  const accept = trpc.guests.accept.useMutation({
    onSuccess: () => navigate('/', { replace: true }),
  });

  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  if (!token) {
    return (
      <AuthLayout title="Invitation invalide" subtitle="lien manquant">
        <p className="text-center text-sm text-text-muted">
          Ce lien d'invitation est invalide.
        </p>
      </AuthLayout>
    );
  }

  if (isLoading) {
    return (
      <AuthLayout title="Rejoindre le journal" subtitle="vérification…">
        <p className="text-center text-sm text-text-muted">Un instant…</p>
      </AuthLayout>
    );
  }

  if (!info || error) {
    return (
      <AuthLayout title="Invitation invalide" subtitle="lien expiré">
        <p className="text-center text-sm text-text-muted">
          Ce lien est expiré ou a déjà été utilisé. Demande à la personne qui
          t'a invité·e de t'en renvoyer un nouveau.
        </p>
      </AuthLayout>
    );
  }

  const mismatch = !!confirm && password !== confirm;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mismatch) return;
    accept.mutate({ token, displayName, password });
  };

  return (
    <AuthLayout title="Rejoindre le journal" subtitle="crée ton accès">
      <p className="text-center text-sm text-text-muted mb-6 -mt-2">
        Tu as été invité·e avec l'adresse{' '}
        <strong className="text-text-primary">{info.email}</strong>
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <Input
          label="Ton prénom"
          name="displayName"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          placeholder="Prénom ou pseudo"
          autoFocus
        />
        <Input
          label="Mot de passe"
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={12}
          autoComplete="new-password"
          placeholder="12 caractères minimum"
        />
        <Input
          label="Confirmer le mot de passe"
          name="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
          placeholder="Répète le mot de passe"
          error={mismatch ? 'Les mots de passe ne correspondent pas.' : undefined}
        />

        {accept.error && (
          <p className="text-sm text-danger mb-4" role="alert">{accept.error.message}</p>
        )}

        <Button
          type="submit"
          disabled={accept.isPending || mismatch || !displayName || !password}
          className="w-full"
        >
          {accept.isPending ? 'Création…' : 'Rejoindre'}
        </Button>
      </form>
    </AuthLayout>
  );
}
