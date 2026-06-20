import { useState } from 'react';
import { trpc } from '../lib/trpc';
import QRCode from 'qrcode';
import { SettingsCard } from './SettingsCard';

type Step = 'idle' | 'setup' | 'confirm' | 'codes' | 'disable';

export function TwoFactorSection() {
  const utils = trpc.useUtils();
  const { data: status } = trpc.twofa.status.useQuery();

  const [step, setStep] = useState<Step>('idle');
  const [qrUrl, setQrUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState('');

  const setupMut = trpc.twofa.setup.useMutation();
  const confirmMut = trpc.twofa.confirm.useMutation();
  const disableMut = trpc.twofa.disable.useMutation();

  async function startSetup() {
    setError('');
    const res = await setupMut.mutateAsync();
    setQrUrl(res.otpauthUrl);
    setSecret(res.secret);
    try {
      setQrDataUrl(await QRCode.toDataURL(res.otpauthUrl, { width: 200 }));
    } catch {
      setQrDataUrl('');
    }
    setStep('setup');
  }

  async function handleConfirm() {
    setError('');
    try {
      const res = await confirmMut.mutateAsync({ code });
      setRecoveryCodes(res.recoveryCodes);
      setCode('');
      setStep('codes');
      utils.twofa.status.invalidate();
    } catch (e: any) {
      setError(e.message ?? 'Code invalide');
    }
  }

  async function handleDisable() {
    setError('');
    try {
      await disableMut.mutateAsync({ code });
      setCode('');
      setStep('idle');
      utils.twofa.status.invalidate();
    } catch (e: any) {
      setError(e.message ?? 'Code invalide');
    }
  }

  const enabled = status?.enabled ?? false;

  return (
    <SettingsCard>
      <div className="flex flex-col gap-4">

        {/* État actuel */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-text-primary font-medium">
              {enabled ? '🔐 2FA activé' : '2FA désactivé'}
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              {enabled
                ? 'Un code TOTP est requis à chaque connexion.'
                : 'Ajoute une couche de sécurité supplémentaire.'}
            </p>
          </div>
          {step === 'idle' && (
            <button
              type="button"
              onClick={() => enabled ? setStep('disable') : startSetup()}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                enabled
                  ? 'bg-danger/10 text-danger hover:bg-danger/20'
                  : 'bg-accent/15 text-accent hover:bg-accent/25'
              }`}
            >
              {enabled ? 'Désactiver' : 'Configurer'}
            </button>
          )}
        </div>

        {/* Étape 1 : QR code */}
        {step === 'setup' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text-muted">
              Scanne ce QR code avec ton application authenticator (Google Authenticator, Authy…)
            </p>
            {qrDataUrl
              ? <img src={qrDataUrl} alt="QR Code 2FA" className="w-48 h-48 rounded-xl self-center bg-white p-2" />
              : <p className="text-xs font-mono bg-bg-primary rounded-xl p-3 break-all select-all">{qrUrl}</p>
            }
            <p className="text-xs text-text-muted">
              Clé manuelle : <span className="font-mono select-all">{secret}</span>
            </p>
            <button
              type="button"
              onClick={() => setStep('confirm')}
              className="self-start px-4 py-2 rounded-xl bg-accent/15 text-accent text-sm font-medium hover:bg-accent/25 transition-colors"
            >
              J'ai scanné le QR code →
            </button>
            <button type="button" onClick={() => setStep('idle')} className="text-xs text-text-muted hover:text-text-primary">
              Annuler
            </button>
          </div>
        )}

        {/* Étape 2 : vérification du code */}
        {step === 'confirm' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-muted">Entre le code à 6 chiffres affiché dans ton application :</p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full max-w-[11rem] text-center text-2xl font-mono tracking-widest bg-bg-primary border border-text-muted/15 rounded-xl px-3 py-2 outline-none focus:border-accent/40"
              autoFocus
            />
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={code.length !== 6 || confirmMut.isPending}
                className="px-4 py-2 rounded-xl bg-accent/15 text-accent text-sm font-medium hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {confirmMut.isPending ? 'Vérification…' : 'Activer le 2FA'}
              </button>
              <button type="button" onClick={() => { setStep('idle'); setCode(''); }} className="text-xs text-text-muted hover:text-text-primary px-2">
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* Étape 3 : codes de récupération */}
        {step === 'codes' && (
          <div className="flex flex-col gap-3">
            <div className="bg-warning/10 border border-warning/20 rounded-xl p-3">
              <p className="text-xs font-medium text-warning mb-1">⚠️ Sauvegarde ces codes maintenant</p>
              <p className="text-xs text-text-muted">Ces codes de récupération ne seront plus affichés. Utilise-les si tu perds accès à ton authenticator.</p>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {recoveryCodes.map((c) => (
                <code key={c} className="text-xs font-mono bg-bg-primary rounded-lg px-2.5 py-1.5 select-all text-text-primary">
                  {c}
                </code>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setStep('idle')}
              className="self-start px-4 py-2 rounded-xl bg-accent/15 text-accent text-sm font-medium hover:bg-accent/25 transition-colors"
            >
              J'ai sauvegardé mes codes ✓
            </button>
          </div>
        )}

        {/* Désactivation */}
        {step === 'disable' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-muted">Entre ton code TOTP ou un code de récupération pour désactiver le 2FA :</p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={20}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000 ou XXXX-XXXX-XXXX"
              className="w-full max-w-[18rem] text-center font-mono tracking-widest bg-bg-primary border border-text-muted/15 rounded-xl px-3 py-2 outline-none focus:border-accent/40"
              autoFocus
            />
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDisable}
                disabled={code.length < 6 || disableMut.isPending}
                className="px-4 py-2 rounded-xl bg-danger/10 text-danger text-sm font-medium hover:bg-danger/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {disableMut.isPending ? 'Vérification…' : 'Désactiver le 2FA'}
              </button>
              <button type="button" onClick={() => { setStep('idle'); setCode(''); }} className="text-xs text-text-muted hover:text-text-primary px-2">
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}
