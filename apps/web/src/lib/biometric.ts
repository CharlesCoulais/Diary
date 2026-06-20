/**
 * Déverrouillage biométrique LOCAL via WebAuthn (Face ID / Touch ID / empreinte Android).
 *
 * ⚠️ Modèle de confiance : c'est un verrou *local* de confort, au même niveau que
 * le PIN (un hash en localStorage, cf. `lib/pin.ts`). On ne vérifie PAS de signature
 * côté serveur : « l'authentificateur de plateforme a validé l'utilisateur » suffit
 * à lever le verrou. Ce n'est donc PAS un durcissement cryptographique du contenu —
 * juste une alternative pratique à la saisie du PIN. Un vrai durcissement passerait
 * par le chiffrement au repos (la biométrie libèrerait la clé).
 *
 * Le credential est lié à l'origine (domaine) et à l'appareil : il ne suit pas
 * l'utilisateur sur un autre device. Le PIN reste le filet de sécurité obligatoire.
 */

const CRED_KEY = 'jc-biometric-cred'; // rawId du credential (base64url) — sa présence = activé

function bufToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBuf(s: string): ArrayBuffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** Le navigateur expose-t-il un authentificateur de plateforme (biométrie OS) ? */
export async function isBiometricSupported(): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
    if (!window.isSecureContext) return false; // WebAuthn exige HTTPS (localhost compte comme sûr)
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Un credential biométrique est-il enregistré sur cet appareil ? */
export function isBiometricEnabled(): boolean {
  try {
    return !!localStorage.getItem(CRED_KEY);
  } catch {
    return false;
  }
}

/**
 * Enregistre un credential de plateforme (déclenche le prompt biométrique OS).
 * À appeler depuis un geste utilisateur (clic) — WebAuthn l'exige.
 * Retourne true si l'enregistrement a réussi.
 */
export async function enrollBiometric(): Promise<boolean> {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge,
        // rp.id omis → vaut le domaine courant (le bon comportement pour un verrou local).
        rp: { name: 'Diary' },
        user: { id: userId, name: 'diary', displayName: 'Diary' },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },   // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60_000,
        attestation: 'none',
      },
    }) as PublicKeyCredential | null;
    if (!cred) return false;
    localStorage.setItem(CRED_KEY, bufToB64url(cred.rawId));
    return true;
  } catch {
    return false;
  }
}

/**
 * Demande une vérification biométrique. Si l'OS valide l'utilisateur, on considère
 * le verrou levé. À appeler depuis un geste utilisateur (clic).
 * Retourne true si la vérification a réussi.
 */
export async function unlockWithBiometric(): Promise<boolean> {
  try {
    const stored = localStorage.getItem(CRED_KEY);
    if (!stored) return false;
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ type: 'public-key', id: b64urlToBuf(stored), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60_000,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}

/** Désactive la biométrie sur cet appareil (oublie le credential). */
export function disableBiometric(): void {
  try {
    localStorage.removeItem(CRED_KEY);
  } catch {
    /* localStorage indisponible */
  }
}
