import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { AuthLayout } from '../components/AuthLayout';
import { Input } from '../components/Input';
import { Button } from '../components/Button';

/**
 * Page double :
 *   - Sans `?token=...` : formulaire de demande (email → on envoie un lien
 *     de reset). Réponse uniforme côté serveur pour ne pas révéler si le
 *     compte existe.
 *   - Avec `?token=...` : formulaire de nouveau mot de passe. La mutation
 *     valide le token serveur-side et invalide toutes les sessions actives.
 *
 * Pas de TPCM (Token Pre-Confirm Mode) : on garde un seul écran simple ;
 * le token est validé au moment du submit, on affiche l'erreur sur place
 * si invalide / expiré.
 */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  return token ? <ConfirmReset token={token} /> : <RequestReset />;
}

// ─── Étape 1 : demande par email ─────────────────────────────────────────────

function RequestReset() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const request = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => setSent(true),
  });

  if (sent) {
    return (
      <AuthLayout title="Vérifie ta boîte mail" subtitle="on t'a envoyé un lien">
        <p className="text-sm text-text-muted leading-relaxed mb-4">
          Si un compte existe avec <strong className="text-text-primary">{email}</strong>,
          tu vas recevoir un email avec un lien de réinitialisation valable 1 heure.
        </p>
        <p className="text-xs text-text-muted/60 leading-relaxed mb-6">
          Pense à vérifier tes spams si tu ne le vois pas arriver dans la minute.
        </p>
        <Link to="/login" className="inline-block text-sm text-accent hover:underline">
          ← Retour à la connexion
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Mot de passe oublié" subtitle="on te renvoie un lien">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) request.mutate({ email: email.trim() });
        }}
        noValidate
      >
        <p className="text-sm text-text-muted leading-relaxed mb-4">
          Indique ton email — si un compte existe, on t'envoie un lien pour
          choisir un nouveau mot de passe.
        </p>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" disabled={request.isPending || !email.trim()} className="w-full mt-2">
          {request.isPending ? 'Envoi…' : 'Envoyer le lien'}
        </Button>
        <p className="text-center text-sm text-text-muted mt-6">
          <Link to="/login" className="hover:text-accent transition-colors">
            ← Retour à la connexion
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}

// ─── Étape 2 : nouveau mot de passe (avec token) ─────────────────────────────

function ConfirmReset({ token }: { token: string }) {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const confirmMutation = trpc.auth.confirmPasswordReset.useMutation({
    onSuccess: () => {
      // Redirige vers /login avec un message — le user doit se reconnecter
      // (toutes ses sessions ont été invalidées).
      navigate('/login?reset=ok', { replace: true });
    },
    onError: (err) => {
      setError(err.message);
    },
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
    confirmMutation.mutate({ token, newPassword: password });
  };

  return (
    <AuthLayout title="Nouveau mot de passe" subtitle="choisis-le bien">
      <form onSubmit={onSubmit} noValidate>
        <p className="text-sm text-text-muted leading-relaxed mb-4">
          Choisis un nouveau mot de passe. Toutes les sessions actives seront
          déconnectées — tu devras te re-login sur chaque appareil.
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
        <Button type="submit" disabled={confirmMutation.isPending || !password} className="w-full mt-2">
          {confirmMutation.isPending ? 'Validation…' : 'Réinitialiser'}
        </Button>
        <p className="text-center text-sm text-text-muted mt-6">
          <Link to="/login" className="hover:text-accent transition-colors">
            ← Annuler et retourner à la connexion
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
