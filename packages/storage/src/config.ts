// Object storage configuration. Works with any S3-compatible provider:
// AWS S3, Cloudflare R2, MinIO, DigitalOcean Spaces, Backblaze B2, Wasabi,
// Supabase Storage, etc.
//
//   STORAGE_BUCKET             required
//   STORAGE_ACCESS_KEY_ID      required
//   STORAGE_SECRET_ACCESS_KEY  required
//   STORAGE_ENDPOINT           S3 API endpoint; omit for AWS S3
//   STORAGE_REGION             default: us-east-1 on AWS, `auto` elsewhere
//   STORAGE_PUBLIC_URL         base URL objects are served from (CDN or
//                              public bucket URL); derived for AWS S3
//   STORAGE_FORCE_PATH_STYLE   `true` for MinIO and other path-style servers
//
// The older R2_* variables (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL) still work as a fallback.

export type StorageConfig = {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl: string;
  forcePathStyle: boolean;
};

type Env = Record<string, string | undefined>;

const trimSlash = (s: string) => s.replace(/\/+$/, '');

export function readStorageConfig(env: Env = process.env): StorageConfig | null {
  const bucket = env.STORAGE_BUCKET;
  if (bucket) {
    const accessKeyId = env.STORAGE_ACCESS_KEY_ID;
    const secretAccessKey = env.STORAGE_SECRET_ACCESS_KEY;
    if (!accessKeyId || !secretAccessKey) return null;
    const endpoint = env.STORAGE_ENDPOINT ? trimSlash(env.STORAGE_ENDPOINT) : undefined;
    const region = env.STORAGE_REGION || (endpoint ? 'auto' : 'us-east-1');
    const forcePathStyle = env.STORAGE_FORCE_PATH_STYLE === 'true';
    let publicUrl = env.STORAGE_PUBLIC_URL ? trimSlash(env.STORAGE_PUBLIC_URL) : undefined;
    if (!publicUrl && !endpoint) {
      // AWS S3 with a public-read bucket (or bucket policy) — virtual-hosted URL.
      publicUrl = `https://${bucket}.s3.${region}.amazonaws.com`;
    }
    if (!publicUrl) return null; // other providers need an explicit public URL
    return { endpoint, region, bucket, accessKeyId, secretAccessKey, publicUrl, forcePathStyle };
  }

  // Legacy Cloudflare R2 variables.
  if (
    env.R2_ACCOUNT_ID &&
    env.R2_ACCESS_KEY_ID &&
    env.R2_SECRET_ACCESS_KEY &&
    env.R2_BUCKET &&
    env.R2_PUBLIC_URL
  ) {
    return {
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      region: 'auto',
      bucket: env.R2_BUCKET,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      publicUrl: trimSlash(env.R2_PUBLIC_URL),
      forcePathStyle: false,
    };
  }
  return null;
}
