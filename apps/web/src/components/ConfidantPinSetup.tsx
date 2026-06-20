import { useCallback, useEffect, useState } from 'react';
import { trpc } from '../lib/trpc';
import { usePinContext } from '../contexts/PinContext';
import { PIN_LENGTH } from '../lib/pin';

function PinDots({ value, error, shaking }: { value: string; error: boolean; shaking: boolean }) {
  return (
    <div className={`flex gap-4 justify-center mb-8 ${shaking ? 'animate-shake' : ''}`}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <span
          key={i}
          className={`w-3 h-3 rounded-full transition-all duration-150 ${
            i < value.length
              ? error ? 'bg-danger scale-110' : 'bg-accent scale-110'
              : 'bg-text-muted/20'
          }`}
        />
      ))}
    </div>
  );
}

function NumPad({ onDigit, onDelete }: { onDigit: (d: string) => void; onDelete: () => void }) {
  return (
    <div className="grid grid-cols-3 gap-3 justify-items-center mx-auto" style={{ width: 'fit-content' }}>
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
        <button key={d} type="button" onClick={() => onDigit(d)}
          className="w-16 h-16 rounded-full text-xl font-light text-text-primary bg-bg-elevated hover:bg-text-muted/10 active:scale-95 transition-all duration-100 select-none">
          {d}
        </button>
      ))}
      <div />
      <button type="button" onClick={() => onDigit('0')}
        className="w-16 h-16 rounded-full text-xl font-light text-text-primary bg-bg-elevated hover:bg-text-muted/10 active:scale-95 transition-all duration-100 select-none">
        0
      </button>
      <button type="button" onClick={onDelete}
        className="w-16 h-16 rounded-full text-lg text-text-muted hover:text-text-primary hover:bg-text-muted/10 active:scale-95 transition-all duration-100 flex items-center justify-center select-none">
        ⌫
      </button>
    </div>
  );
}

export function PinSetupScreen() {
  const { setNewPin } = usePinContext();
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [first, setFirst] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [shaking, setShaking] = useState(false);

  const shake = useCallback(() => {
    setShaking(true);
    setError(true);
    setTimeout(() => { setPin(''); setFirst(''); setStep('enter'); setShaking(false); setError(false); }, 600);
  }, []);

  const handleDigit = useCallback((d: string) => {
    if (shaking) return;
    setError(false);
    setPin((prev) => prev.length >= PIN_LENGTH ? prev : prev + d);
  }, [shaking]);

  const handleDelete = useCallback(() => {
    setError(false);
    setPin((prev) => prev.slice(0, -1));
  }, []);

  useEffect(() => {
    if (pin.length < PIN_LENGTH || shaking) return;
    if (step === 'enter') {
      setFirst(pin);
      setPin('');
      setStep('confirm');
    } else {
      if (pin !== first) { shake(); return; }
      setNewPin(pin);
    }
  }, [pin, step, first, shaking, shake, setNewPin]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') handleDigit(e.key);
      else if (e.key === 'Backspace') handleDelete();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleDigit, handleDelete]);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-bg-primary">
      <svg className="mb-6 text-text-muted opacity-40" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <h2 className="font-serif text-xl text-text-primary mb-1">
        {step === 'enter' ? 'Créez votre code PIN' : 'Confirmez le code PIN'}
      </h2>
      <p className="text-sm text-text-muted mb-8">
        {step === 'enter' ? 'Requis pour accéder au journal' : 'Saisissez le même code PIN'}
      </p>
      <PinDots value={pin} error={error} shaking={shaking} />
      <NumPad onDigit={handleDigit} onDelete={handleDelete} />
    </div>
  );
}

/**
 * Remplace les routes par un écran de blocage quand nécessaire.
 * Aucun contenu n'est rendu dans le DOM tant que l'accès n'est pas autorisé.
 */
export function AppGate({ children }: { children: React.ReactNode }) {
  const { locked, hasPinSet, pinSynced } = usePinContext();
  const utils = trpc.useUtils();
  const { data: me, isLoading, error, refetch } = trpc.auth.me.useQuery(undefined, { retry: false });
  const [stuckLoading, setStuckLoading] = useState(false);

  // Si la page revient au premier plan (réveil device, retour depuis autre app)
  // → invalide les queries critiques pour relancer le fetch et éviter un BFCache figé.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        // Page restaurée depuis le BFCache → force un refresh des données auth + sync
        void utils.auth.me.invalidate();
      }
    };
    const onVisible = () => {
      if (!document.hidden) {
        void utils.auth.me.invalidate();
      }
    };
    window.addEventListener('pageshow', onShow);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('pageshow', onShow);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [utils]);

  // Détecte un loading "anormalement long" (> 6s) → propose un rechargement manuel
  useEffect(() => {
    if (!isLoading && !(me && !pinSynced)) {
      setStuckLoading(false);
      return;
    }
    const t = setTimeout(() => setStuckLoading(true), 6000);
    return () => clearTimeout(t);
  }, [isLoading, me, pinSynced]);

  // Verrou actif → lock screen uniquement, aucun contenu
  if (locked) {
    return <LockScreenInline />;
  }

  // On attend la réponse auth + synchro hash PIN avant de décider
  if (isLoading || (!!me && !pinSynced)) {
    if (stuckLoading) {
      return (
        <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-sm text-text-muted">Chargement plus long que prévu…</p>
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => { setStuckLoading(false); void refetch(); }}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-accent/15 text-accent hover:bg-accent/25 transition-colors"
            >
              Réessayer
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-xs text-text-muted/60 hover:text-text-muted transition-colors"
            >
              Recharger l'app
            </button>
          </div>
        </div>
      );
    }
    return <div className="min-h-dvh bg-bg-primary" />;
  }

  // Erreur d'auth (session expirée, réseau, etc.) → propose la même UI de recovery
  if (error) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-text-muted">Connexion perdue.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-accent/15 text-accent hover:bg-accent/25 transition-colors"
        >
          Recharger l'app
        </button>
      </div>
    );
  }

  // Tout utilisateur connecté sans PIN → setup obligatoire
  if (me && !hasPinSet) {
    return <PinSetupScreen />;
  }

  return <>{children}</>;
}

// LockScreen inline pour éviter l'import circulaire avec LockScreen.tsx
function LockScreenInline() {
  const { unlockWithPin, biometricSupported, biometricEnabled, unlockWithBiometric } = usePinContext();
  const { data: me } = trpc.auth.me.useQuery(undefined, { retry: false, staleTime: Infinity });
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [checking, setChecking] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);

  const tryBiometric = useCallback(() => {
    if (bioBusy) return;
    setBioBusy(true);
    unlockWithBiometric().finally(() => setBioBusy(false));
  }, [bioBusy, unlockWithBiometric]);

  const firstName = me?.displayName?.split(' ')[0] ?? 'toi';

  const handleDigit = useCallback((d: string) => {
    if (checking) return;
    setError(false);
    setPin((prev) => prev.length >= PIN_LENGTH ? prev : prev + d);
  }, [checking]);

  const handleDelete = useCallback(() => {
    if (checking) return;
    setError(false);
    setPin((prev) => prev.slice(0, -1));
  }, [checking]);

  useEffect(() => {
    if (pin.length < PIN_LENGTH || checking) return;
    setChecking(true);
    unlockWithPin(pin).then((ok) => {
      if (!ok) {
        setShaking(true);
        setError(true);
        setTimeout(() => { setPin(''); setShaking(false); setChecking(false); setError(false); }, 600);
      }
    });
  }, [pin, checking, unlockWithPin]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') handleDigit(e.key);
      else if (e.key === 'Backspace') handleDelete();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleDigit, handleDelete]);

  return (
    // z-[999] : passe au-dessus de tout (sidebar desktop, modales, bottom nav…).
    // Le PIN doit toujours masquer l'intégralité du contenu, même si le sidebar
    // était rendu en dehors de AppGate dans la tree React.
    <div className="fixed inset-0 z-[999] min-h-dvh flex flex-col items-center justify-center bg-bg-primary px-8 gap-0">
      <p className="font-mono text-[11px] tracking-widest uppercase text-text-muted/50 mb-4">
        {me?.role === 'GUEST' ? 'Le journal est verrouillé' : 'Ton carnet est verrouillé'}
      </p>
      <h1 className="font-serif italic text-3xl text-text-primary mb-10 text-center">
        Bon retour, {firstName}.
      </h1>
      <div className={`flex gap-5 mb-10 ${shaking ? 'animate-shake' : ''}`}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span key={i} className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
            i < pin.length ? (error ? 'bg-danger scale-110' : 'bg-accent scale-110') : 'bg-text-muted/20'
          }`} />
        ))}
      </div>
      <NumPad onDigit={handleDigit} onDelete={handleDelete} />
      {biometricSupported && biometricEnabled && (
        <button
          type="button"
          onClick={tryBiometric}
          disabled={bioBusy}
          className="mt-8 inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 13.5C5 9 8 6.5 12 6.5s7 2.5 7 7" />
            <path d="M8 14c0-2.5 1.5-4 4-4s4 1.5 4 4v1.5" />
            <path d="M3.5 10.5C5 7 8 5 12 5s7 2 8.5 5.5" />
            <path d="M12 11c0 4 0 6.5-1 8.5" />
            <path d="M9.7 19c.6-1.6.7-3.3.7-5" />
          </svg>
          {bioBusy ? 'Vérification…' : 'Déverrouiller par biométrie'}
        </button>
      )}
    </div>
  );
}
