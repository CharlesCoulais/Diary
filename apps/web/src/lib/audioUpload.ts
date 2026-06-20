import { apiClient } from './trpc';

const ALLOWED_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/aac', 'audio/flac', 'audio/mp4'] as const;
type AllowedMime = typeof ALLOWED_TYPES[number];

const MAX_SIZE = 30 * 1024 * 1024;

export async function uploadAudio(file: File, entryId?: string): Promise<{ src: string; filename: string }> {
  if (file.size > MAX_SIZE) throw new Error('Fichier trop volumineux (max 30 Mo).');
  const mime = file.type || 'audio/mpeg';
  if (!ALLOWED_TYPES.includes(mime as AllowedMime)) throw new Error('Format audio non supporté.');

  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const { id } = await apiClient.audios.upload.mutate({
    data,
    mimeType: mime as AllowedMime,
    filename: file.name,
    size: file.size,
    entryId,
  });

  return { src: `/audios/${id}`, filename: file.name };
}
