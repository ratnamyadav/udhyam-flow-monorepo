'use server';

import { db, schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin, rupeesToPaise } from '@/lib/admin';

// Server actions for /gst. Each re-checks the admin role.

function back(q: Record<string, string>): never {
  redirect(`/gst?${new URLSearchParams(q).toString()}`);
}

// Platform default "charge GST only above ₹X" for stores that haven't set
// their own. Empty = GST on every transaction.
export async function setPlatformGstThreshold(form: FormData) {
  const admin = await requireAdmin();
  let cents: number | null;
  try {
    cents = rupeesToPaise(form.get('threshold'));
  } catch {
    back({ error: 'Enter a valid amount in rupees' });
  }
  const values = {
    gstThresholdCents: cents && cents > 0 ? cents : null,
    updatedByUserId: admin.id,
    updatedAt: new Date(),
  };
  await db
    .insert(schema.platformSettings)
    .values({ id: schema.PLATFORM_SETTINGS_ID, ...values })
    .onConflictDoUpdate({ target: schema.platformSettings.id, set: values });
  revalidatePath('/gst');
  back({ saved: 'platform' });
}

// Per-store override. mode=inherit clears it (platform default applies);
// mode=custom stores the amount (0 = GST on every transaction).
export async function setStoreGstThreshold(form: FormData) {
  await requireAdmin();
  const organizationId = String(form.get('organizationId') ?? '');
  const [org] = organizationId
    ? await db
        .select({ id: schema.organization.id })
        .from(schema.organization)
        .where(eq(schema.organization.id, organizationId))
    : [];
  if (!org) back({ error: 'Unknown store' });
  let cents: number | null = null;
  if (form.get('mode') !== 'inherit') {
    try {
      cents = rupeesToPaise(form.get('threshold')) ?? 0;
    } catch {
      back({ error: 'Enter a valid amount in rupees' });
    }
  }
  await db
    .insert(schema.tenantSettings)
    .values({ organizationId, gstThresholdCents: cents })
    .onConflictDoUpdate({
      target: schema.tenantSettings.organizationId,
      set: { gstThresholdCents: cents, updatedAt: new Date() },
    });
  revalidatePath('/gst');
  back({ saved: organizationId });
}
