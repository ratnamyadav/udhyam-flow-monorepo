import { TENANT_THEMES } from '@udyamflow/tokens';
import { CashfreeMandateCheckout } from '@/components/memberships/cashfree-mandate-checkout';
import { trpcServer } from '@/lib/trpc/server';

export default async function BillingAuthorizationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caller = await trpcServer();
  const authorization = await caller.billing.authorization({ id });
  return (
    <main className="max-w-xl mx-auto px-4 py-10">
      <CashfreeMandateCheckout
        {...authorization}
        theme={TENANT_THEMES.patel}
        title="Authorize workspace billing"
        description="Approve ₹299 per month for this location. The first charge starts after your free trial. Cashfree will return you to workspace billing."
      />
    </main>
  );
}
