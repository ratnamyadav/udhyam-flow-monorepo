// Recurring memberships billed via Cashfree Subscriptions (UPI Autopay /
// eNACH / card mandates). Server wrapper so the "Not configured" hint
// reflects the deployed env, like the payments page.

import { db, schema } from '@udyamflow/db';
import { getServerEnv } from '@udyamflow/env/server';
import { eq } from 'drizzle-orm';
import { MembershipsSettings } from '@/components/memberships/memberships-settings';
import { getActiveOrgId } from '@/lib/auth-server';

export default async function MembershipsSettingsPage() {
  const env = getServerEnv();
  const missing = [
    !env.CASHFREE_CLIENT_ID && 'CASHFREE_CLIENT_ID',
    !env.CASHFREE_CLIENT_SECRET && 'CASHFREE_CLIENT_SECRET',
  ].filter(Boolean) as string[];

  const orgId = await getActiveOrgId();
  const [org] = orgId
    ? await db
        .select({ slug: schema.organization.slug })
        .from(schema.organization)
        .where(eq(schema.organization.id, orgId))
    : [];

  return (
    <MembershipsSettings
      missingEnv={missing}
      webhookUrl={`${env.NEXT_PUBLIC_APP_URL}/api/payments/cashfree/subscriptions/webhook`}
      publicUrl={org ? `${env.NEXT_PUBLIC_APP_URL}/book/${org.slug}/memberships` : null}
    />
  );
}
