import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { registerInput, type RegisterInput } from '@carnet/schemas';
import { trpc } from '../lib/trpc';
import { AuthLayout } from '../components/AuthLayout';
import { Input } from '../components/Input';
import { Button } from '../components/Button';

export function RegisterPage() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerInput),
  });

  const create = trpc.auth.register.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      navigate('/', { replace: true });
    },
    onError: (err) => {
      setError('root', { message: err.message });
    },
  });

  return (
    <AuthLayout
      title="Bienvenue"
      subtitle="Quelques mots et c'est à toi"
    >
      <form
        onSubmit={handleSubmit((data) => create.mutate(data))}
        noValidate
      >
        <Input
          label="Comment veux-tu être appelé·e ?"
          type="text"
          autoComplete="nickname"
          autoFocus
          {...register('displayName')}
          error={errors.displayName?.message}
          placeholder="Optionnel"
        />
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          {...register('email')}
          error={errors.email?.message}
        />
        <Input
          label="Mot de passe"
          type="password"
          autoComplete="new-password"
          {...register('password')}
          error={errors.password?.message}
        />
        <p className="text-xs text-text-muted -mt-2 mb-4">
          Au moins 12 caractères. Une phrase facile à retenir vaut mieux qu'un
          alphabet de symboles.
        </p>
        {errors.root && (
          <p className="text-sm text-danger mb-3" role="alert">
            {errors.root.message}
          </p>
        )}
        <Button
          type="submit"
          disabled={create.isPending}
          className="w-full mt-2"
        >
          {create.isPending ? 'Création…' : 'Créer mon journal'}
        </Button>
        <p className="text-center text-sm text-text-muted mt-6">
          Déjà un compte ?{' '}
          <Link to="/login" className="text-accent hover:underline">
            Connecte-toi
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
