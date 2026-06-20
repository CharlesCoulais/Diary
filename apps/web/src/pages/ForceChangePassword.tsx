import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { AuthLayout } from '../components/AuthLayout';
import { Input } from '../components/Input';
import { Button } from '../components/Button';

/**
 * Écran obligatoire affiché après un login où `user.mustChangePassword`
 * est true (cas : l'owner a régénéré un mdp temporaire pour ce confident).
 *
 * Pas de mdp actuel à fournir — on accepte que l'utilisateur arrive ici
 * avec un mdp qu'il vient de recevoir via un canal externe et qu'il veut
 * remplacer immédiatement. Le serveur autorise via `mustChangePassword`.
 *
 * Routage vers cette page : géré par `App.tsx` (cf. ForceChangePasswordGuard) —
 * tant que le flag est true, toute navigation y est redirigée.
 */
export function ForceChangePasswordPage() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const change = trpc.auth.changePassword.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      navigate('/', { replace: true });
    },
    onError: (err) => setError(err.message),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 12) {
      setError('Le mot de passe doit faire au moins 12 caractères.');
      return;
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    change.mutate({ newPassword: password });
  };

  return (
    <AuthLayout title="Choisis ton mot de passe" subtitle="il remplace le temporaire">
      <form onSubmit={onSubmit} noValidate>
        <p className="text-sm text-text-muted leading-relaxed mb-4">
          L'owner a régénéré un mot de passe temporaire pour ton compte. Choisis
          maintenant celui que tu veux utiliser. L'app n'est accessible qu'une
          fois cette étape passée.
        </p>
        <Input
          label="Nouveau mot de passe"
          type="password"
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Input
          label="Confirme le nouveau mot de passe"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error && (
          <p className="text-sm text-danger mb-3" role="alert">{error}</p>
        )}
        <Button type="submit" disabled={change.isPending || !password} className="w-full mt-2">
          {change.isPending ? 'Validation…' : 'Valider mon mot de passe'}
        </Button>
      </form>
    </AuthLayout>
  );
}
