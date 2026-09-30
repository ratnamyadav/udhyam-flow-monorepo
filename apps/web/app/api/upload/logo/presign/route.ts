import { randomUUID } from 'node:crypto';
import { db, schema } from '@udyamflow/db';
import {
  LOGO_CONTENT_TYPES,
  type LogoContentType,
  logoKeyPrefix,
  MAX_LOGO_BYTES,
  presignUpload,
  storageConfigured,
} from '@udyamflow/storage';
import { and, eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth-server';

// Authed: issue a short-lived presigned PUT URL the browser uploads to
// directly to object storage (any S3-compatible provider — see
// packages/storage). Server stays out of the upload bytes path — saves
// bandwidth and avoids holding the worker for slow uploads.
//
// The client sends `{ contentType, sizeBytes }`; we validate, sign, and
// return `{ uploadUrl, publicUrl, headers }`. The client must PUT with the
// same Content-Type header and exactly `sizeBytes` of body (the browser sets
// Content-Length itself for a Blob body) so the signature matches.
//
// SVG is deliberately not allowed: an SVG can carry script, and the bucket
// would serve it as-is from our public URL.

export async function POST(req: Request) {
  const session = await requireSession();
  const activeOrgId = session.session.activeOrganizationId ?? null;

  // Resolve the caller's membership in the active org — falling back to their
  // first membership like the tRPC tenant middleware does.
  const memberships = await db
    .select({ organizationId: schema.member.organizationId, role: schema.member.role })
    .from(schema.member)
    .where(
      activeOrgId
        ? and(
            eq(schema.member.userId, session.user.id),
            eq(schema.member.organizationId, activeOrgId),
          )
        : eq(schema.member.userId, session.user.id),
    )
    .orderBy(schema.member.createdAt)
    .limit(1);
  const membership = memberships[0];
  if (!membership) {
    return Response.json(
      { error: activeOrgId ? 'Not a member of this organization' : 'No active organization' },
      { status: activeOrgId ? 403 : 412 },
    );
  }
  const orgId = membership.organizationId;

  // Branding is owner/admin-only — mirror tenant.updateSettings.
  if (membership.role !== 'owner' && membership.role !== 'admin') {
    return Response.json({ error: 'Only owners and admins can do this.' }, { status: 403 });
  }
  if (!storageConfigured()) {
    return Response.json({ error: 'Logo upload is not configured' }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as {
    contentType?: string;
    sizeBytes?: number;
  } | null;
  if (!body) return Response.json({ error: 'Bad JSON' }, { status: 400 });
  if (!body.contentType || !(body.contentType in LOGO_CONTENT_TYPES)) {
    return Response.json({ error: `Unsupported type: ${body.contentType}` }, { status: 415 });
  }
  if (
    typeof body.sizeBytes !== 'number' ||
    !Number.isInteger(body.sizeBytes) ||
    body.sizeBytes <= 0 ||
    body.sizeBytes > MAX_LOGO_BYTES
  ) {
    return Response.json({ error: 'File exceeds size cap' }, { status: 413 });
  }

  const contentType = body.contentType as LogoContentType;
  const key = `${logoKeyPrefix(orgId)}${randomUUID()}.${LOGO_CONTENT_TYPES[contentType]}`;

  // Signed for 60 seconds with the exact type and size — long enough for slow
  // networks, useless for anything else if leaked.
  return Response.json(await presignUpload({ key, contentType, contentLength: body.sizeBytes }));
}
