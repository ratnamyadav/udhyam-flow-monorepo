import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { readStorageConfig, type StorageConfig } from './config';

export { readStorageConfig, type StorageConfig } from './config';

let _cache: { config: StorageConfig; client: S3Client } | null | undefined;

function storage() {
  if (_cache !== undefined) return _cache;
  const config = readStorageConfig();
  _cache = config
    ? {
        config,
        client: new S3Client({
          region: config.region,
          endpoint: config.endpoint,
          forcePathStyle: config.forcePathStyle,
          credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          },
          // AWS SDK ≥3.729 adds CRC32 checksums to every request by default;
          // presigned browser PUTs can't compute them and many S3-compatible
          // services (R2, MinIO, B2, …) reject them. Only send when required.
          requestChecksumCalculation: 'WHEN_REQUIRED',
          responseChecksumValidation: 'WHEN_REQUIRED',
        }),
      }
    : null;
  return _cache;
}

export function storageConfigured(): boolean {
  return storage() !== null;
}

export function publicUrlFor(key: string): string | null {
  const s = storage();
  return s ? `${s.config.publicUrl}/${key}` : null;
}

// The object key behind one of our public URLs, or null if the URL isn't
// served from our bucket.
export function keyFromPublicUrl(url: string): string | null {
  const s = storage();
  if (!s) return null;
  const prefix = `${s.config.publicUrl}/`;
  if (!url.startsWith(prefix)) return null;
  const key = url.slice(prefix.length);
  return key && !key.includes('..') ? key : null;
}

// ─── Tenant logos ────────────────────────────────────────────────────────

export const LOGO_CONTENT_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
} as const;
export type LogoContentType = keyof typeof LOGO_CONTENT_TYPES;
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export const logoKeyPrefix = (organizationId: string) => `tenant-logos/${organizationId}/`;

// True if `url` is a logo we stored for this org — tenants can't point their
// logo at arbitrary external URLs (tracking pixels, huge images).
export function isTenantLogoUrl(organizationId: string, url: string): boolean {
  const key = keyFromPublicUrl(url);
  return !!key && key.startsWith(logoKeyPrefix(organizationId));
}

// A short-lived presigned PUT. Content type and exact byte length are signed
// into the URL, so the upload can't be swapped for something else.
export async function presignUpload(args: {
  key: string;
  contentType: string;
  contentLength: number;
  expiresInSec?: number;
}): Promise<{ uploadUrl: string; publicUrl: string; headers: Record<string, string> }> {
  const s = storage();
  if (!s) throw new Error('Object storage is not configured');
  const command = new PutObjectCommand({
    Bucket: s.config.bucket,
    Key: args.key,
    ContentType: args.contentType,
    ContentLength: args.contentLength,
    CacheControl: 'public, max-age=31536000, immutable',
  });
  const uploadUrl = await getSignedUrl(s.client, command, {
    expiresIn: args.expiresInSec ?? 60,
    // Sign Content-Type too (the presigner doesn't by default) so an upload
    // can't be re-labelled, e.g. as text/html, and served from our bucket.
    signableHeaders: new Set(['content-type', 'content-length']),
  });
  return {
    uploadUrl,
    publicUrl: `${s.config.publicUrl}/${args.key}`,
    // The client must send exactly these; anything else breaks the signature.
    headers: { 'Content-Type': args.contentType },
  };
}

export async function deleteObject(key: string): Promise<void> {
  const s = storage();
  if (!s) return;
  await s.client.send(new DeleteObjectCommand({ Bucket: s.config.bucket, Key: key }));
}

// Test hook: re-read configuration from process.env.
export function resetStorageForTests(): void {
  _cache = undefined;
}
