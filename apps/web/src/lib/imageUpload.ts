import { apiClient } from './trpc';

// Plafonds de redimensionnement asymétriques :
//   - MAX_SHORT : la dimension la plus courte (largeur d'un portrait, hauteur
//     d'un paysage). Plafond bas pour limiter la lourdeur globale.
//   - MAX_LONG  : la dimension la plus longue. Plafond généreux pour préserver
//     les screenshots longs (liste Spotify, conversation, capture défilante…)
//     où une réduction symétrique 2560 ferait perdre la lisibilité du texte.
//
// Exemple concret : un screenshot 1080×7000 d'une "Top tracks" Spotify
// passait avec l'ancien algo à 395×2560 (largeur écrasée → texte minuscule).
// Avec ces plafonds, il reste à 1080×7000 — chaque ligne est encore lisible.
const MAX_SHORT = 2560;
const MAX_LONG = 8192;
// JPEG quality 0.92 (au lieu de 0.90) : un compromis qui réduit
// significativement le flou sur le texte des screenshots, pour un coût
// stockage marginal (~10-15% en plus).
const JPEG_QUALITY = 0.92;
const GIF_MAX_SIZE = 8 * 1024 * 1024; // 8 MB — au-delà on flatten pour éviter d'engorger la DB

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Détecte un GIF de façon fiable, indépendamment du type MIME rapporté par le
 * navigateur (souvent erroné au collage / glisser ou sur mobile) : lit les 4
 * premiers octets du fichier — un GIF commence toujours par « GIF8 ».
 */
async function isGifFile(file: File): Promise<boolean> {
  if (file.type === 'image/gif') return true;
  try {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    return head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x38;
  } catch {
    return false;
  }
}

export async function compressImage(file: File): Promise<{ data: string; mimeType: string; size: number }> {
  // GIF : on garde le fichier tel quel pour préserver l'animation. Le passer
  // dans le pipeline <canvas> l'aplatirait sur sa première image.
  if (await isGifFile(file)) {
    if (file.size > GIF_MAX_SIZE) {
      throw new Error('GIF trop lourd — 8 Mo maximum pour préserver l\'animation.');
    }
    const data = await fileToBase64(file);
    return { data, mimeType: 'image/gif', size: file.size };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      // Plafond asymétrique : short ≤ MAX_SHORT, long ≤ MAX_LONG. On calcule
      // le facteur d'échelle minimum pour respecter les deux contraintes —
      // si rien ne dépasse, scale=1 et on garde la résolution native.
      const longSide = Math.max(width, height);
      const shortSide = Math.min(width, height);
      let scale = 1;
      if (shortSide > MAX_SHORT) scale = Math.min(scale, MAX_SHORT / shortSide);
      if (longSide > MAX_LONG) scale = Math.min(scale, MAX_LONG / longSide);
      if (scale < 1) {
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }

      ctx.drawImage(img, 0, 0, width, height);

      // PNG d'origine (screenshots, illustrations) → exporté en PNG sans
      // perte pour préserver la netteté du texte. JPEG sinon.
      // Fallback : si la sortie PNG dépasse la limite serveur (8 MB) — cas
      // typique d'un screenshot très haute résolution non scaled — on
      // bascule sur JPEG plutôt que de planter l'upload.
      const wantPng = file.type === 'image/png';

      const exportBlob = (mt: string, q: number) =>
        new Promise<Blob>((res, rej) => {
          canvas.toBlob(
            (blob) => blob ? res(blob) : rej(new Error('Compression failed')),
            mt,
            q,
          );
        });

      const SERVER_MAX = 8 * 1024 * 1024;
      (async () => {
        let mt = wantPng ? 'image/png' : 'image/jpeg';
        let q = wantPng ? 1 : JPEG_QUALITY;
        let blob = await exportBlob(mt, q);
        // Bascule PNG → JPEG si trop gros (PNG d'un screenshot 1080×7000
        // peut faire 10+ Mo).
        if (blob.size > SERVER_MAX && wantPng) {
          mt = 'image/jpeg';
          q = JPEG_QUALITY;
          blob = await exportBlob(mt, q);
        }
        // Si même le JPEG ne passe pas, on baisse la qualité progressivement.
        while (blob.size > SERVER_MAX && q > 0.5) {
          q -= 0.1;
          blob = await exportBlob('image/jpeg', q);
          mt = 'image/jpeg';
        }
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1] ?? '';
          resolve({ data: base64, mimeType: mt, size: blob.size });
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      })().catch(reject);
    };

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

export async function uploadImage(file: File, entryId?: string): Promise<string> {
  const { data, mimeType, size } = await compressImage(file);
  const { id } = await apiClient.images.upload.mutate({ data, mimeType: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', size, entryId });
  return `/images/${id}`;
}
