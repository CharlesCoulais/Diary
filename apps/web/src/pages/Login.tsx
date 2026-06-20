import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { loginInput, type LoginInput } from '@carnet/schemas';
import { trpc } from '../lib/trpc';
import { AuthLayout } from '../components/AuthLayout';
import { Input } from '../components/Input';
import { Button } from '../components/Button';

export function LoginPage() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [searchParams] = useSearchParams();
  const resetOk = searchParams.get('reset') === 'ok';

  // État du challenge 2FA
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpError, setTotpError] = useState('');
  /** Le challenge 2FA a expiré → on renvoie vers le login avec un message dédié
   *  (sinon l'utilisateur reste bloqué sur un écran 2FA dont le jeton est mort). */
  const [challengeExpired, setChallengeExpired] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginInput),
  });

  const login = trpc.auth.login.useMutation({
    onSuccess: async (data) => {
      if (data && 'requires2FA' in data && data.requires2FA) {
        // Le serveur demande un code TOTP avant de créer la session
        setChallengeExpired(false);
        setChallengeToken(data.challengeToken);
      } else {
        await utils.auth.me.invalidate();
        navigate('/', { replace: true });
      }
    },
    onError: (err) => {
      setError('root', { message: err.message });
    },
  });

  const verify2FA = trpc.auth.loginVerify2FA.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      navigate('/', { replace: true });
    },
    onError: (err) => {
      // Challenge expiré/invalide (≠ code erroné) → retour login avec bandeau.
      if (err.data?.code === 'UNAUTHORIZED' && /challenge/i.test(err.message)) {
        setChallengeToken(null);
        setTotpCode('');
        setTotpError('');
        setChallengeExpired(true);
        return;
      }
      setTotpError(err.message);
    },
  });

  // ── Écran 2FA ────────────────────────────────────────────────────────────────
  if (challengeToken) {
    return (
      <AuthLayout title="Code de vérification" subtitle="authentification à 2 facteurs">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted text-center">
            Entre le code à 6 chiffres de ton application authenticator.
          </p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={totpCode}
            onChange={(e) => { setTotpCode(e.target.value.replace(/\D/g, '')); setTotpError(''); }}
            placeholder="000000"
            className="w-full text-center text-3xl font-mono tracking-widest bg-bg-elevated border border-text-muted/15 rounded-2xl px-4 py-4 outline-none focus:border-accent/40 transition-colors"
            autoFocus
          />
          {totpError && <p className="text-sm text-danger text-center">{totpError}</p>}
          <Button
            type="button"
            disabled={totpCode.length !== 6 || verify2FA.isPending}
            className="w-full"
            onClick={() => verify2FA.mutate({ challengeToken, code: totpCode })}
          >
            {verify2FA.isPending ? 'Vérification…' : 'Valider'}
          </Button>
          <button
            type="button"
            onClick={() => setChallengeToken(null)}
            className="text-sm text-text-muted hover:text-text-primary text-center transition-colors"
          >
            ← Retour à la connexion
          </button>
        </div>
      </AuthLayout>
    );
  }

  // ── Écran login standard ─────────────────────────────────────────────────────
  return (
    <AuthLayout title="Bon retour" subtitle="parmi tes mots">
      {resetOk && (
        <div className="mb-4 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-xs leading-relaxed">
          <p className="text-success">
            ✓ Mot de passe réinitialisé. Connecte-toi avec le nouveau ci-dessous.
          </p>
        </div>
      )}
      {challengeExpired && (
        <div className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-xs leading-relaxed">
          <p className="text-warning">
            ⏱ Le code de vérification a expiré. Reconnecte-toi pour en recevoir un nouveau.
          </p>
        </div>
      )}
      <form onSubmit={handleSubmit((data) => login.mutate(data))} noValidate>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          {...register('email')}
          error={errors.email?.message}
        />
        <Input
          label="Mot de passe"
          type="password"
          autoComplete="current-password"
          {...register('password')}
          error={errors.password?.message}
        />
        {errors.root && (
          <p className="text-sm text-danger mb-3" role="alert">
            {errors.root.message}
          </p>
        )}
        <Button type="submit" disabled={login.isPending} className="w-full mt-2">
          {login.isPending ? 'Connexion…' : 'Se connecter'}
        </Button>
        <p className="text-center text-xs text-text-muted/60 mt-4 italic leading-relaxed">
          Mot de passe oublié ? Si tu es confident, demande à l'owner de t'en
          régénérer un depuis Réglages → Confidents.
        </p>
        <p className="text-center text-sm text-text-muted mt-6">
          Pas encore de compte ?{' '}
          <Link to="/register" className="text-accent hover:underline">
            Crée-le
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
