import type { Metadata } from 'next';
import Link from 'next/link';
import { LEGAL_ENTITY, LegalPage } from '@/components/marketing/legal-page';

export const metadata: Metadata = {
  title: 'Terms of Service — UdyamFlow',
  description: 'The terms for using UdyamFlow.',
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="19 November 2026"
      intro={
        <p>
          These terms are an agreement between you and {LEGAL_ENTITY} for using UdyamFlow, our
          website and our mobile app. By creating an account or making a booking, you agree to them.
          If you sign up on behalf of a business, you confirm you’re allowed to bind it.
        </p>
      }
      sections={[
        {
          heading: 'The service',
          body: (
            <p>
              UdyamFlow lets businesses publish a booking page, take appointments and payments, send
              reminders and issue invoices. We provide the software. The services being booked are
              provided by each business, which is responsible for them.
            </p>
          ),
        },
        {
          heading: 'Accounts',
          body: (
            <p>
              Keep your login details safe and the information in your account accurate. You’re
              responsible for what happens under your account, including anything your team members
              do.
            </p>
          ),
        },
        {
          heading: 'Plans, trial and billing',
          body: (
            <>
              <p>
                New workspaces are free for the first six months. After that, each active location
                needs a paid subscription at the price shown on our{' '}
                <Link href="/pricing">pricing page</Link> when you subscribe. Subscriptions renew
                monthly and are charged through Stripe or Cashfree to the payment method or mandate
                you set up. Prices include or exclude taxes as shown at checkout.
              </p>
              <p>
                If a location’s subscription isn’t paid, its public booking page stops accepting new
                bookings until it is. Your existing data stays available. See our{' '}
                <Link href="/legal/cancellation">cancellation and refund policy</Link> for how to
                cancel.
              </p>
            </>
          ),
        },
        {
          heading: 'Payments for bookings',
          body: (
            <p>
              Booking payments are processed by Stripe or Cashfree, and their own terms apply. Money
              for a booking goes to the business through its connected payout account. The business
              sets its own prices, cancellation rules and refunds, and is responsible for its taxes,
              including GST, on what it sells.
            </p>
          ),
        },
        {
          heading: 'Acceptable use',
          body: (
            <ul>
              <li>Don’t use UdyamFlow for anything illegal, fraudulent or misleading.</li>
              <li>Only message customers who have booked with you, and follow messaging laws.</li>
              <li>Don’t try to break into, overload or reverse-engineer the service.</li>
              <li>Don’t upload content you don’t have the right to use.</li>
            </ul>
          ),
        },
        {
          heading: 'Your data',
          body: (
            <p>
              Your business data stays yours. You allow us to host and process it to run the
              service, as described in our <Link href="/legal/privacy">privacy policy</Link>. You
              can export your invoices at any time.
            </p>
          ),
        },
        {
          heading: 'Suspension and closing an account',
          body: (
            <p>
              You can stop using UdyamFlow at any time. We may suspend or close accounts that break
              these terms or put other users at risk. Where reasonable, we’ll tell you first and
              give you a chance to fix the problem.
            </p>
          ),
        },
        {
          heading: 'Disclaimers and liability',
          body: (
            <p>
              We work hard to keep UdyamFlow available and accurate, but it is provided “as is”,
              without guarantees that it will never be interrupted or error-free. To the extent the
              law allows, our total liability for any claim is limited to the amount you paid us in
              the 12 months before the claim. We aren’t liable for indirect losses such as lost
              profits. Nothing in these terms limits liability that can’t be limited by law.
            </p>
          ),
        },
        {
          heading: 'Changes and governing law',
          body: (
            <p>
              We may update these terms. We’ll notify account holders of significant changes before
              they take effect. These terms are governed by the laws of India.
            </p>
          ),
        },
      ]}
    />
  );
}
