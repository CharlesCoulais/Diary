import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { hasPin, savePin, deletePin, verifyPin, storePinHash, getPinHash } from '../lib/pin';
import {
  isBiometricSupported,
  isBiometricEnabled,
  enrollBiometric,
  unlockWithBiometric as biometricUnlock,
  disableBiometric as biometricDisable,
} from '../lib/biometric';
import { getLockTimeoutMs } from '../lib/securityPrefs';
import { trpc, apiClient } from '../lib/trpc';

/**
 * Persiste le timestamp du dernier déverrouillage en localStorage (TTL = délai d'inactivité réglé).
 *
 * Pourquoi localStorage et pas sessionStorage : sur iOS, quand la PWA est tuée
 * en arrière-plan (ou quand on clique "Recharger l'app"), sessionStorage est purgé.
 * localStorage survit. Le TTL borne la durée de validité au délai d'inactivité choisi
 * → équivalent en sécurité au timer en mémoire, mais survit aux reloads / kills d'app.
 *
 * Modèle : "le PIN est demandé après N minutes d'inactivité" — N étant ton réglage.
 * Reload, kill d'app, switch d'app → tous traités pareil tant qu'on est dans la fenêtre.
 */
const UNLOCKED_AT_KEY = 'app-unlocked-at';

function readUnlockedAt(): number | null {
  try {
    const v = localStorage.getItem(UNLOCKED_AT_KEY);
    if (!v) return null;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  } catch { return null; }
}

function writeUnlockedAt(ts: number | null) {
  try {
    if (ts === null) localStorage.removeItem(UNLOCKED_AT_KEY);
    else localStorage.setItem(UNLOCKED_AT_KEY, String(ts));
  } catch { /* localStorage indisponible */ }
}

/** L'app est-elle considérée déverrouillée (selon le dernier unlock + délai d'inactivité) ? */
function isStillUnlocked(): boolean {
  const at = readUnlockedAt();
  if (at === null) return false;
  const ms = getLockTimeoutMs();
  if (ms <= 0) return true; // "Jamais" → on garde le déverrouillage tant que pas de lock manuel
  return Date.now() - at < ms;
}

interface PinContextValue {
  hasPinSet: boolean;
  locked: boolean;
  pinSynced: boolean; // hash serveur chargé (ou absent)
  unlockWithPin: (pin: string) => Promise<boolean>;
  setNewPin: (pin: string) => Promise<void>;
  changePinVerify: (oldPin: string) => Promise<boolean>;
  confirmNewPin: (pin: string) => Promise<void>;
  removePin: (pin: string) => Promise<boolean>;
  lockNow: () => void;
  // Déverrouillage biométrique (verrou local, cf. lib/biometric.ts)
  biometricSupported: boolean;
  biometricEnabled: boolean;
  enableBiometric: () => Promise<boolean>;
  disableBiometric: () => void;
  unlockWithBiometric: () => Promise<boolean>;
}

const PinContext = createContext<PinContextValue | null>(null);

export function usePinContext() {
  const ctx = useContext(PinContext);
  if (!ctx) throw new Error('usePinContext must be used inside PinProvider');
  return ctx;
}

export function PinProvider({ children }: { children: React.ReactNode }) {
  const [hasPinSet, setHasPinSet] = useState(hasPin);
  // Initial : locked sauf si un déverrouillage récent (< délai d'inactivité) est en session.
  // Permet à un reload (ou recovery via le bouton "Recharger l'app") de ne pas redemander le PIN.
  const [locked, setLocked] = useState(() => hasPin() && !isStillUnlocked());
  // Ref miroir de `locked` pour les callbacks (évite les captures stale)
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  // true une fois qu'on a vérifié/chargé le hash depuis le serveur
  const [pinSynced, setPinSynced] = useState(!hasPin() ? false : true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPinRef = useRef(hasPinSet);
  hasPinRef.current = hasPinSet;

  // Biométrie : support détecté async (capteur de plateforme dispo ?) + état activé local.
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(isBiometricEnabled);
  useEffect(() => { isBiometricSupported().then(setBiometricSupported); }, []);

  // Au démarrage : si pas de PIN local, tenter de récupérer le hash serveur
  useEffect(() => {
    if (hasPin()) { setPinSynced(true); return; }
    apiClient.auth.me.query().then((me) => {
      if (me?.pinHash) {
        storePinHash(me.pinHash);
        setHasPinSet(true);
        // Si un déverrouillage récent (autre device de la session) est valide, on ne re-lock pas
        const stillUnlocked = isStillUnlocked();
        setLocked(!stillUnlocked);
        lockedRef.current = !stillUnlocked;
      }
      setPinSynced(true);
    }).catch(() => setPinSynced(true));
  }, []);

  const lock = useCallback(() => {
    if (hasPinRef.current) {
      setLocked(true);
      lockedRef.current = true; // synchro pour les callbacks qui suivent
      writeUnlockedAt(null); // invalide la session de déverrouillage
    }
  }, []);

  const resetTimer = useCallback(() => {
    if (!hasPinRef.current) return;
    // ⚠️ SI ON EST LOCKED : ne pas rafraîchir le timestamp.
    // Sinon les clics sur le numpad du LockScreen écriraient un unlockedAt récent en localStorage,
    // ce qui ferait passer pour "déverrouillé" sans avoir validé le PIN après un reload.
    if (lockedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    // Lire à chaque interaction → reflète immédiatement les changements de préférence
    const ms = getLockTimeoutMs();
    // À chaque activité, rafraîchir le timestamp de déverrouillage pour survivre à un reload
    writeUnlockedAt(Date.now());
    if (ms <= 0) return; // 0 = jamais verrouiller par inactivité
    timerRef.current = setTimeout(lock, ms);
  }, [lock]);

  useEffect(() => {
    if (!hasPinSet) return;
    const events = ['mousemove', 'keydown', 'touchstart', 'click'] as const;
    events.forEach((e) => document.addEventListener(e, resetTimer, { passive: true }));
    // Quand l'utilisateur change le délai dans les réglages, on ré-arme avec la nouvelle valeur
    window.addEventListener('lockTimeoutChange', resetTimer);
    resetTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((e) => document.removeEventListener(e, resetTimer));
      window.removeEventListener('lockTimeoutChange', resetTimer);
    };
  }, [hasPinSet, resetTimer]);

  useEffect(() => {
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
    const handler = () => {
      if (document.hidden) {
        // Le délai de verrouillage suit le réglage utilisateur (cohérent avec inactivité).
        // 0 = "Jamais" → on ne verrouille pas au switch d'app.
        const ms = getLockTimeoutMs();
        if (ms <= 0) return;
        hiddenTimer = setTimeout(lock, ms);
      } else {
        if (hiddenTimer) { clearTimeout(hiddenTimer); hiddenTimer = null; }
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => {
      document.removeEventListener('visibilitychange', handler);
      if (hiddenTimer) clearTimeout(hiddenTimer);
    };
  }, [lock]);

  const unlockWithPin = useCallback(async (pin: string) => {
    const ok = await verifyPin(pin);
    if (ok) {
      setLocked(false);
      lockedRef.current = false; // synchro avant resetTimer (qui bail si lockedRef=true)
      writeUnlockedAt(Date.now());
      resetTimer();
    }
    return ok;
  }, [resetTimer]);

  // Déverrouillage biométrique — même chemin que le PIN en cas de succès.
  const unlockWithBiometric = useCallback(async () => {
    const ok = await biometricUnlock();
    if (ok) {
      setLocked(false);
      lockedRef.current = false;
      writeUnlockedAt(Date.now());
      resetTimer();
    }
    return ok;
  }, [resetTimer]);

  const enableBiometric = useCallback(async () => {
    const ok = await enrollBiometric();
    if (ok) setBiometricEnabled(true);
    return ok;
  }, []);

  const disableBiometric = useCallback(() => {
    biometricDisable();
    setBiometricEnabled(false);
  }, []);

  const setNewPin = useCallback(async (pin: string) => {
    const hash = await savePin(pin);
    setHasPinSet(true);
    setLocked(false);
    lockedRef.current = false;
    setPinSynced(true);
    writeUnlockedAt(Date.now());
    resetTimer();
    // Synchro serveur (best effort)
    apiClient.auth.savePin.mutate({ pinHash: hash }).catch(() => undefined);
  }, [resetTimer]);

  const changePinVerify = useCallback(async (oldPin: string) => {
    return verifyPin(oldPin);
  }, []);

  const confirmNewPin = useCallback(async (pin: string) => {
    const hash = await savePin(pin);
    apiClient.auth.savePin.mutate({ pinHash: hash }).catch(() => undefined);
  }, []);

  const removePin = useCallback(async (pin: string) => {
    const ok = await verifyPin(pin);
    if (ok) {
      deletePin();
      // Plus de PIN → plus de verrou : la biométrie (raccourci vers ce même verrou) n'a plus de sens.
      biometricDisable();
      setBiometricEnabled(false);
      writeUnlockedAt(null); // plus de PIN → la persistance n'a plus de sens
      setHasPinSet(false);
      setLocked(false);
      lockedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      apiClient.auth.removePin.mutate().catch(() => undefined);
    }
    return ok;
  }, []);

  return (
    <PinContext.Provider value={{ hasPinSet, locked, pinSynced, unlockWithPin, setNewPin, changePinVerify, confirmNewPin, removePin, lockNow: lock, biometricSupported, biometricEnabled, enableBiometric, disableBiometric, unlockWithBiometric }}>
      {children}
    </PinContext.Provider>
  );
}

// Hook pratique pour les composants qui ont besoin du pinHash serveur via trpc
export function useServerPinHash() {
  const { data } = trpc.auth.me.useQuery(undefined, { retry: false });
  return data?.pinHash ?? null;
}
