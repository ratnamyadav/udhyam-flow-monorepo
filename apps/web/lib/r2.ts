import 'server-only';
import { S3Client } from '@aws-sdk/client-s3';

// Cloudflare R2 is S3-compatible. We point the standard AWS S3 SDK at R2's
// account-scoped endpoint and reuse the standard putObject / deleteObject
// flow. Credentials are R2 access keys (created in the Cloudflare dashboard).

let _client: S3Client | null = null;

export function getR2Client() {
  if (_client) return _client;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) return null;
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _client;
}

export function r2Configured(): boolean {
  return (
    !!process.env.R2_ACCOUNT_ID &&
    !!process.env.R2_ACCESS_KEY_ID &&
    !!process.env.R2_SECRET_ACCESS_KEY &&
    !!process.env.R2_BUCKET &&
    !!process.env.R2_PUBLIC_URL
  );
}
