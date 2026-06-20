export const PIN_LENGTH = 4;
const PIN_KEY = 'jc-pin-hash';

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hasPin(): boolean {
  return !!localStorage.getItem(PIN_KEY);
}

export function getPinHash(): string | null {
  return localStorage.getItem(PIN_KEY);
}

export function storePinHash(hash: string): void {
  localStorage.setItem(PIN_KEY, hash);
}

export async function savePin(pin: string): Promise<string> {
  const hash = await sha256(pin);
  localStorage.setItem(PIN_KEY, hash);
  return hash;
}

export function deletePin(): void {
  localStorage.removeItem(PIN_KEY);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = localStorage.getItem(PIN_KEY);
  if (!stored) return true;
  return stored === (await sha256(pin));
}
