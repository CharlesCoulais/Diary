import { S3Client, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../env.js';
import type { Readable } from 'node:stream';

export function isR2Configured(): boolean {
  return !!(env.R2_ENDPOINT && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET);
}

function getClient(): S3Client {
  if (!isR2Configured()) throw new Error('R2 non configuré');
  return new S3Client({
    region: 'auto',
    endpoint: env.R2_ENDPOINT!,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

export async function r2Upload(key: string, stream: Readable, mimeType: string): Promise<void> {
  const upload = new Upload({
    client: getClient(),
    params: {
      Bucket: env.R2_BUCKET!,
      Key: key,
      Body: stream,
      ContentType: mimeType,
    },
    // Seuil multipart : 100 Mo (défaut AWS = 5 Mo, trop petit pour des vidéos)
    partSize: 100 * 1024 * 1024,
    queueSize: 2,
  });
  await upload.done();
}

// URL présignée valable 1 heure — R2 gère nativement les Range requests
export async function r2PresignedUrl(key: string): Promise<string> {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: env.R2_BUCKET!, Key: key }),
    { expiresIn: 3600 },
  );
}

export async function r2Delete(key: string): Promise<void> {
  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET!, Key: key }));
  } catch {
    // Silencieux si l'objet n'existe pas
  }
}

export async function r2Exists(key: string): Promise<boolean> {
  try {
    await getClient().send(new HeadObjectCommand({ Bucket: env.R2_BUCKET!, Key: key }));
    return true;
  } catch {
    return false;
  }
}
