import { notFound } from 'next/navigation';
import { CashfreePaymentCheckout } from '@/components/payments/cashfree-payment-checkout';

export const metadata = { title: 'Complete payment', robots: { index: false } };
export default async function CashfreeCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session } = await searchParams;
  if (!session || session.length > 500 || !/^[A-Za-z0-9_-]+$/.test(session)) notFound();
  return (
    <main className="max-w-lg mx-auto p-6 py-16">
      <CashfreePaymentCheckout
        sessionId={session}
        mode={process.env.CASHFREE_ENV === 'production' ? 'production' : 'sandbox'}
      />
    </main>
  );
}
