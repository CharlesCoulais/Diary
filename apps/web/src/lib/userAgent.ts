/**
 * Parse best-effort d'une chaîne user-agent en libellé court et lisible
 * (« iPhone · Safari », « Mac · Chrome », « Android · Chrome », « Windows ·
 * Firefox »). Sans dépendance externe. Utilisé pour afficher l'appareil/navigateur
 * dans le journal d'activité (`/logs`).
 *
 * ⚠️ Tester Chrome/Edge AVANT Safari : leur user-agent contient « Safari ».
 */
export function parseUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;

  const device =
    /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) ? 'iPad'
    : /Android/.test(ua) ? 'Android'
    : /(Macintosh|Mac OS X)/.test(ua) ? 'Mac'
    : /Windows/.test(ua) ? 'Windows'
    : /(Linux|X11)/.test(ua) ? 'Linux'
    : null;

  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /(OPR\/|Opera)/.test(ua) ? 'Opera'
    : /(Chrome\/|CriOS)/.test(ua) ? 'Chrome'
    : /(Firefox\/|FxiOS)/.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : null;

  const parts = [device, browser].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
