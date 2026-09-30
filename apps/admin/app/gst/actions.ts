'use server';

import { db, schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin, rupeesToPaise } from '@/lib/admin';

// Server actions for /gst. Each re-checks the admin role — actions are
// public POST endpoints regardless of which page renders them.

const MIN_LIMIT_CENTS = 1_00_000_00; // ₹1 lakh — guards against typos

function back(q: Record<string, string>): never {
  redirect(`/gst?${new URLSearchParams(q).toString()}`);
}

function parseLimit(form: FormData): number | null {
  let cents: number | null;
  try {
    cents = rupeesToPaise(form.get('limit'));
  } catch {
    back({ error: 'Enter a valid amount in rupees' });
  }
  if (cents !== null && cents < MIN_LIMIT_CENTS) back({ error: 'Limit must be at least ₹1 lakh' });
  return cents;
}

// Platform default GST registration limit. Empty = statutory ₹20 lakh.
export async function setPlatformTurnoverLimit(form: FormData) {
  const admin = await requireAdmin();
  const cents = parseLimit(form);
  const values = { gstTurnoverLimitCents: cents, updatedByUserId: admin.id, updatedAt: new Date() };
  await db
    .insert(schema.platformSettings)
    .values({ id: schema.PLATFORM_SETTINGS_ID, ...values })
    .onConflictDoUpdate({ target: schema.platformSettings.id, set: values });
  revalidatePath('/gst');
  back({ saved: 'platform' });
}

// Per-store limit. Empty = back to the default (state rule / platform).
export async function setStoreTurnoverLimit(form: FormData) {
  await requireAdmin();
  const organizationId = String(form.get('organizationId') ?? '');
  const [org] = organizationId
    ? await db
        .select({ id: schema.organization.id })
        .from(schema.organization)
        .where(eq(schema.organization.id, organizationId))
    : [];
  if (!org) back({ error: 'Unknown store' });
  const cents = parseLimit(form);
  await db
    .insert(schema.tenantSettings)
    .values({ organizationId, gstTurnoverLimitCents: cents })
    .onConflictDoUpdate({
      target: schema.tenantSettings.organizationId,
      set: { gstTurnoverLimitCents: cents, updatedAt: new Date() },
    });
  revalidatePath('/gst');
  back({ saved: organizationId });
}
