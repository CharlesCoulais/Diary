import { useCallback, useEffect, useState } from 'react';
import { usePinContext } from '../contexts/PinContext';
import { PIN_LENGTH } from '../lib/pin';
import { LOCK_TIMEOUT_OPTIONS, useLockTimeout } from '../lib/securityPrefs';
import { SettingsCard } from './SettingsCard';

type PinStep =
  | { type: 'idle' }
  | { type: 'set-enter' }
  | { type: 'set-confirm'; first: string }
  | { type: 'change-old' }
  | { type: 'change-new' }
  | { type: 'change-confirm'; newPin: string }
  | { type: 'remove-confirm' };

function PinDots({ value, error, shaking }: { value: string; error: boolean; shaking: boolean }) {
  return (
    <div
      className={`flex gap-4 justify-center mb-8 ${shaking ? 'animate-shake' : ''}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={PIN_LENGTH}
      aria-valuenow={value.length}
      aria-label={`${value.length} chiffre${value.length > 1 ? 's' : ''} sur ${PIN_LENGTH} saisi${value.length > 1 ? 's' : ''}`}
    >
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`w-3 h-3 rounded-full transition-all duration-150 ${
            i < value.length
              ? error
                ? 'bg-danger scale-110'
                : 'bg-accent scale-110'
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
        <button
          key={d}
          type="button"
          onClick={() => onDigit(d)}
          className="w-16 h-16 rounded-full text-xl font-light text-text-primary bg-bg-elevated hover:bg-text-muted/10 active:scale-95 transition-all duration-100 select-none"
        >
          {d}
        </button>
      ))}
      <div />
      <button
        type="button"
        onClick={() => onDigit('0')}
        className="w-16 h-16 rounded-full text-xl font-light text-text-primary bg-bg-elevated hover:bg-text-muted/10 active:scale-95 transition-all duration-100 select-none"
      >
        0
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Effacer le dernier chiffre"
        className="w-16 h-16 rounded-full text-lg text-text-muted hover:text-text-primary hover:bg-text-muted/10 active:scale-95 transition-all duration-100 flex items-center justify-center select-none"
      >
        <span aria-hidden="true">⌫</span>
      </button>
    </div>
  );
}

const STEP_LABEL: Record<PinStep['type'], string> = {
  idle: '',
  'set-enter': 'Choisissez un code PIN',
  'set-confirm': 'Confirmez le code PIN',
  'change-old': 'Code PIN actuel',
  'change-new': 'Nouveau code PIN',
  'change-confirm': 'Confirmez le nouveau code PIN',
  'remove-confirm': 'Code PIN actuel pour supprimer',
};

export function PinSection() {
  const {
    hasPinSet, setNewPin, changePinVerify, confirmNewPin, removePin, lockNow,
    biometricSupported, biometricEnabled, enableBiometric, disableBiometric,
  } = usePinContext();
  const [lockTimeoutMs, setLockTimeout] = useLockTimeout();
  const [bioBusy, setBioBusy] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);

  const toggleBiometric = useCallback(async () => {
    setBioError(null);
    if (biometricEnabled) { disableBiometric(); return; }
    setBioBusy(true);
    const ok = await enableBiometric();
    setBioBusy(false);
    if (!ok) setBioError('Activation impossible — réessaie ou vérifie que la biométrie est configurée sur l\'appareil.');
  }, [biometricEnabled, disableBiometric, enableBiometric]);

  const [step, setStep] = useState<PinStep>({ type: 'idle' });
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const shake = useCallback(() => {
    setShaking(true);
    setError(true);
    setTimeout(() => {
      setPin('');
      setShaking(false);
      setError(false);
    }, 600);
  }, []);

  const handleDigit = useCallback(
    (d: string) => {
      if (shaking) return;
      setError(false);
      setPin((prev) => (prev.length >= PIN_LENGTH ? prev : prev + d));
    },
    [shaking],
  );

  const handleDelete = useCallback(() => {
    setError(false);
    setPin((prev) => prev.slice(0, -1));
  }, []);

  const handleCancel = useCallback(() => {
    setStep({ type: 'idle' });
    setPin('');
    setError(false);
  }, []);

  useEffect(() => {
    if (pin.length < PIN_LENGTH || shaking) return;

    (async () => {
      if (step.type === 'set-enter') {
        setStep({ type: 'set-confirm', first: pin });
        setPin('');
      } else if (step.type === 'set-confirm') {
        if (pin !== step.first) { shake(); return; }
        await setNewPin(pin);
        setStep({ type: 'idle' });
        setPin('');
        setSuccess('Code PIN activé');
        setTimeout(() => setSuccess(null), 2500);
      } else if (step.type === 'change-old') {
        const ok = await changePinVerify(pin);
        if (!ok) { shake(); return; }
        setStep({ type: 'change-new' });
        setPin('');
      } else if (step.type === 'change-new') {
        setStep({ type: 'change-confirm', newPin: pin });
        setPin('');
      } else if (step.type === 'change-confirm') {
        if (pin !== step.newPin) { shake(); return; }
        await confirmNewPin(pin);
        setStep({ type: 'idle' });
        setPin('');
        setSuccess('Code PIN modifié');
        setTimeout(() => setSuccess(null), 2500);
      } else if (step.type === 'remove-confirm') {
        const ok = await removePin(pin);
        if (!ok) { shake(); return; }
        setStep({ type: 'idle' });
        setPin('');
        setSuccess('Code PIN supprimé');
        setTimeout(() => setSuccess(null), 2500);
      }
    })();
  }, [pin, step, shaking, shake, setNewPin, changePinVerify, confirmNewPin, removePin]);

  useEffect(() => {
    if (step.type === 'idle') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') handleDigit(e.key);
      else if (e.key === 'Backspace') handleDelete();
      else if (e.key === 'Escape') handleCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [step.type, handleDigit, handleDelete, handleCancel]);

  return (
    <SettingsCard>
      {success && <p className="text-sm text-accent mb-4">{success}</p>}

      {step.type === 'idle' ? (
        <div className="flex flex-col gap-3">
          {!hasPinSet ? (
            <button
              type="button"
              onClick={() => { setStep({ type: 'set-enter' }); setPin(''); }}
              className="text-left text-sm text-text-primary hover:text-accent transition-colors"
            >
              Activer le code PIN
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={lockNow}
                className="flex items-center gap-2 text-left text-sm text-text-primary hover:text-accent transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Verrouiller maintenant
              </button>
              <div className="h-px bg-text-muted/10" />
              <div>
                <p className="text-sm text-text-primary mb-2">Verrouillage automatique</p>
                <p className="text-xs text-text-muted/60 mb-3">
                  {lockTimeoutMs <= 0
                    ? 'Pas de verrouillage par inactivité — uniquement via le bouton ci-dessus.'
                    : `Verrouille après ${LOCK_TIMEOUT_OPTIONS.find((o) => o.ms === lockTimeoutMs)?.label ?? '?'} sans activité.`}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {LOCK_TIMEOUT_OPTIONS.map((opt) => {
                    const active = opt.ms === lockTimeoutMs;
                    return (
                      <button
                        key={opt.ms}
                        type="button"
                        onClick={() => setLockTimeout(opt.ms)}
                        className={`px-3 py-1.5 rounded-full text-xs border transition-all duration-150 ${
                          active
                            ? 'border-accent/40 bg-accent/10 text-accent font-medium'
                            : 'border-text-muted/15 text-text-muted hover:border-text-muted/30'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="h-px bg-text-muted/10" />
              <button
                type="button"
                onClick={() => { setStep({ type: 'change-old' }); setPin(''); }}
                className="text-left text-sm text-text-primary hover:text-accent transition-colors"
              >
                Modifier le code PIN
              </button>
              {biometricSupported && (
                <>
                  <div className="h-px bg-text-muted/10" />
                  <div>
                    <button
                      type="button"
                      onClick={toggleBiometric}
                      disabled={bioBusy}
                      className="text-left text-sm text-text-primary hover:text-accent transition-colors disabled:opacity-50"
                    >
                      {biometricEnabled
                        ? 'Désactiver le déverrouillage biométrique'
                        : bioBusy ? 'Activation…' : 'Activer le déverrouillage biométrique'}
                    </button>
                    <p className="text-xs text-text-muted/60 mt-1">
                      {biometricEnabled
                        ? 'Face ID / Touch ID / empreinte peut déverrouiller le carnet. Le code PIN reste utilisable en secours.'
                        : 'Déverrouille avec Face ID / Touch ID / empreinte au lieu du code PIN, sur cet appareil.'}
                    </p>
                    {bioError && <p className="text-xs text-danger/80 mt-1">{bioError}</p>}
                  </div>
                </>
              )}
              <div className="h-px bg-text-muted/10" />
              <button
                type="button"
                onClick={() => { setStep({ type: 'remove-confirm' }); setPin(''); }}
                className="text-left text-sm text-danger/80 hover:text-danger transition-colors"
              >
                Supprimer le code PIN
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center pt-2">
          <p className="text-sm text-text-muted mb-6">{STEP_LABEL[step.type]}</p>
          <PinDots value={pin} error={error} shaking={shaking} />
          <NumPad onDigit={handleDigit} onDelete={handleDelete} />
          <button
            type="button"
            onClick={handleCancel}
            className="mt-6 text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            Annuler
          </button>
        </div>
      )}
    </SettingsCard>
  );
}
