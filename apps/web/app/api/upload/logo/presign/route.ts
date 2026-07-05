import { randomUUID } from 'node:crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getActiveOrgId, requireSession } from '@/lib/auth-server';
import { getR2Client, r2Configured } from '@/lib/r2';

// Authed: issue a short-lived presigned PUT URL the browser uploads to
// directly. Server stays out of the upload bytes path — saves bandwidth,
// removes the 1 MB cap (we still bound size client-side), and avoids
// holding the worker for slow uploads.
//
// The client sends `{ contentType, sizeBytes }`; we validate, sign, and
// return `{ uploadUrl, publicUrl, headers }`. The client must PUT with the
// same Content-Type header so the signature matches.

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB (browsers do the resize)

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

export async function POST(req: Request) {
  await requireSession();
  const orgId = await getActiveOrgId();
  if (!orgId) {
    return Response.json({ error: 'No active organization' }, { status: 412 });
  }
  if (!r2Configured()) {
    return Response.json({ error: 'Logo upload is not configured' }, { status: 503 });
  }
  const client = getR2Client();
  if (!client) {
    return Response.json({ error: 'R2 client unavailable' }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as {
    contentType?: string;
    sizeBytes?: number;
  } | null;
  if (!body) return Response.json({ error: 'Bad JSON' }, { status: 400 });
  if (!body.contentType || !ALLOWED.has(body.contentType)) {
    return Response.json({ error: `Unsupported type: ${body.contentType}` }, { status: 415 });
  }
  if (typeof body.sizeBytes !== 'number' || body.sizeBytes <= 0 || body.sizeBytes > MAX_BYTES) {
    return Response.json({ error: 'File exceeds size cap' }, { status: 413 });
  }

  const ext = EXT_BY_MIME[body.contentType] ?? 'png';
  const key = `tenant-logos/${orgId}/${randomUUID()}.${ext}`;

  // Sign for 60 seconds — long enough for slow networks, short enough to
  // be uninteresting if leaked.
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
    ContentType: body.contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 60 });

  return Response.json({
    uploadUrl,
    publicUrl: `${process.env.R2_PUBLIC_URL}/${key}`,
    // Echo back the headers the client must include — anything extra
    // would invalidate the signature.
    headers: { 'Content-Type': body.contentType },
  });
}
