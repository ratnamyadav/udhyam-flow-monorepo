import type { Metadata } from 'next';
import { LEGAL_CONTACT_EMAIL, LegalPage } from '@/components/marketing/legal-page';

export const metadata: Metadata = {
  title: 'Cancellation & Refund Policy — UdyamFlow',
  description: 'How cancellations and refunds work on UdyamFlow.',
};

export default function CancellationPage() {
  return (
    <LegalPage
      title="Cancellation & Refund Policy"
      updated="19 November 2026"
      intro={
        <p>
          This policy covers two things: appointments you book with a business on UdyamFlow, and the
          subscription a business pays us.
        </p>
      }
      sections={[
        {
          heading: 'Cancelling an appointment',
          body: (
            <>
              <p>
                Each business sets its own cancellation and refund rules for its appointments. To
                cancel or reschedule, use the buttons on your WhatsApp reminder, or contact the
                business directly.
              </p>
              <p>
                Whether a cancelled appointment is refunded, and how much, is decided by the
                business under its own rules. The business issues refunds from its UdyamFlow
                dashboard.
              </p>
            </>
          ),
        },
        {
          heading: 'Unpaid holds',
          body: (
            <p>
              When you book a paid service, the time slot is held for you for a short while you pay.
              If payment isn’t completed in time, the hold is released and nothing is charged. If a
              payment arrives after the slot has gone to someone else or the booking was cancelled,
              it is refunded automatically.
            </p>
          ),
        },
        {
          heading: 'How refunds are paid',
          body: (
            <p>
              Refunds go back to the original payment method through Stripe or Cashfree. They
              usually reach you within 5–7 business days of being issued, depending on your bank. If
              you were charged twice for the same booking, the extra payment is refunded
              automatically.
            </p>
          ),
        },
        {
          heading: 'Cancelling a UdyamFlow subscription',
          body: (
            <p>
              Businesses can cancel a location’s subscription at any time from Settings → Billing,
              or by archiving the location. Cancellation stops future charges, and the location
              stays active until the end of the period already paid for. Payments for periods that
              have already started aren’t refunded, except where the law requires it or we charged
              you in error.
            </p>
          ),
        },
        {
          heading: 'Questions or disputes',
          body: (
            <p>
              For an appointment, contact the business first. If you can’t resolve it, or for
              anything about a UdyamFlow subscription, write to{' '}
              <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>. We reply within 2
              business days.
            </p>
          ),
        },
      ]}
    />
  );
}
