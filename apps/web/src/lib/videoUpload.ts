export type VideoMime = 'video/mp4' | 'video/webm' | 'video/quicktime';
const ALLOWED: VideoMime[] = ['video/mp4', 'video/webm', 'video/quicktime'];
const VIDEO_MAX_BYTES = 500 * 1024 * 1024; // 500 Mo

// ── DM videos (base64, 15 Mo max) ─────────────────────────────────────────
const DM_MAX_BYTES = 15 * 1024 * 1024;

export interface PreparedVideo {
  data: string;
  mimeType: VideoMime;
  filename: string;
  size: number;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function prepareVideo(file: File): Promise<PreparedVideo> {
  if (!ALLOWED.includes(file.type as VideoMime)) {
    throw new Error('Format video non supporte (MP4, WebM ou MOV).');
  }
  if (file.size > DM_MAX_BYTES) {
    throw new Error('Video trop lourde - 15 Mo maximum pour les messages.');
  }
  const data = await fileToBase64(file);
  return { data, mimeType: file.type as VideoMime, filename: file.name, size: file.size };
}
// ─────────────────────────────────────────────────────────────────────────

export interface UploadVideoOptions {
  entryId?: string;
  onProgress?: (percent: number) => void;
}

/**
 * Upload une vidéo vers /videos/upload via XHR (pour le suivi de progression).
 * Retourne l'URL de lecture une fois l'upload terminé.
 */
export function uploadVideo(
  file: File,
  { entryId, onProgress }: UploadVideoOptions = {},
): Promise<{ src: string; filename: string }> {
  if (!ALLOWED.includes(file.type as VideoMime)) {
    return Promise.reject(new Error('Format vidéo non supporté (MP4, WebM ou MOV).'));
  }
  if (file.size > VIDEO_MAX_BYTES) {
    return Promise.reject(new Error('Vidéo trop lourde — 500 Mo maximum.'));
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/videos/upload');
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name));
    if (entryId) xhr.setRequestHeader('X-Entry-Id', entryId);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status === 201) {
        const { src } = JSON.parse(xhr.responseText) as { id: string; src: string };
        resolve({ src, filename: file.name });
      } else {
        const msg = (() => {
          try {
            return (JSON.parse(xhr.responseText) as { error?: string }).error ?? 'Erreur upload';
          } catch {
            return 'Erreur upload';
          }
        })();
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error('Erreur réseau lors de l\'upload.'));
    xhr.onabort = () => reject(new Error('Upload annulé.'));

    xhr.send(file);
  });
}
