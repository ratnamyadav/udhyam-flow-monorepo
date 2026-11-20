import type { Metadata } from 'next';
import Link from 'next/link';
import { LEGAL_CONTACT_EMAIL, LEGAL_ENTITY, LegalPage } from '@/components/marketing/legal-page';

export const metadata: Metadata = {
  title: 'Privacy Policy — UdyamFlow',
  description: 'How UdyamFlow collects, uses and protects personal data.',
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="19 November 2026"
      intro={
        <>
          <p>
            UdyamFlow is a booking platform operated by {LEGAL_ENTITY} (“we”, “us”). This policy
            explains what personal data we handle on udyamflow.com and in the UdyamFlow mobile app,
            why, and the choices you have.
          </p>
          <p>
            There are two kinds of people we handle data for. <strong>Businesses</strong> (our
            customers) sign up to take bookings. <strong>Their customers</strong> book appointments
            through a business’s booking page. For booking data, the business decides what is
            collected and how it is used, and we process it on their behalf.
          </p>
        </>
      }
      sections={[
        {
          heading: 'What we collect',
          body: (
            <ul>
              <li>
                <strong>Account details</strong>: name, email, and Google profile basics if you sign
                in with Google. There are no passwords: you sign in with a one-time code we email
                you.
              </li>
              <li>
                <strong>Business details</strong>: business name, locations, staff, services,
                prices, branding, logo, GST details and payout account details.
              </li>
              <li>
                <strong>Booking details</strong>: the name, email, phone number and any notes a
                customer enters when booking, plus the booking time, service and status.
              </li>
              <li>
                <strong>Payment records</strong>: amounts, status and the payment provider’s
                reference. Card and bank details are entered directly with Stripe or Cashfree; we
                never see or store them.
              </li>
              <li>
                <strong>Technical data</strong>: IP address, device and browser type, and error
                reports, used to keep the service secure and working.
              </li>
            </ul>
          ),
        },
        {
          heading: 'How we use it',
          body: (
            <ul>
              <li>To run the service: take and manage bookings, process payments and refunds.</li>
              <li>
                To send booking confirmations and reminders by email, SMS or WhatsApp, as set up by
                the business.
              </li>
              <li>To issue invoices and sync them to the accounting tool a business connects.</li>
              <li>To bill businesses for their subscription.</li>
              <li>To prevent fraud and abuse, fix problems, and meet legal and tax obligations.</li>
            </ul>
          ),
        },
        {
          heading: 'Who we share it with',
          body: (
            <>
              <p>
                We don’t sell personal data or use it for advertising. We share it only with the
                providers that run parts of the service, and only as needed:
              </p>
              <ul>
                <li>Hosting, database and file storage providers</li>
                <li>Stripe and Cashfree for payments, refunds and subscriptions</li>
                <li>Resend for email, and MSG91 for SMS and WhatsApp messages</li>
                <li>Zoho Books, FreshBooks or Stripe Invoicing, if a business connects them</li>
                <li>Sentry for error reports</li>
                <li>Google, if you choose to sign in with Google</li>
              </ul>
              <p>
                A business can see the bookings, contact details and payment records of its own
                customers. We may also disclose data where the law requires it.
              </p>
            </>
          ),
        },
        {
          heading: 'How long we keep it',
          body: (
            <p>
              We keep account and business data while the account is active. Booking, invoice and
              payment records are kept for as long as tax and accounting law requires, even after an
              account is closed. Everything else is deleted or anonymised when it is no longer
              needed.
            </p>
          ),
        },
        {
          heading: 'Security',
          body: (
            <p>
              Data is encrypted in transit. Sign-in codes expire after 10 minutes and are stored
              only in hashed form, and access tokens for connected accounting tools are encrypted at
              rest. Each business’s data is kept separate from every other business’s.
            </p>
          ),
        },
        {
          heading: 'Your rights',
          body: (
            <>
              <p>
                You can ask to access, correct or delete your personal data, or withdraw consent for
                optional messages. Account holders can delete their account from Settings → Your
                account on the web or Settings in the app (see{' '}
                <Link href="/legal/delete-account">how to delete your account</Link>), or by writing
                to us. If you booked with a business on UdyamFlow, you can also contact that
                business directly.
              </p>
              <p>
                We reply within 30 days. If you’re unhappy with our reply, you can complain to the
                data protection authority where you live.
              </p>
            </>
          ),
        },
        {
          heading: 'Grievance officer',
          body: (
            <p>
              For complaints about how your data is handled, under India’s Digital Personal Data
              Protection Act, 2023 and the IT Rules, contact our grievance officer, Ratnam Yadav (
              {LEGAL_ENTITY}), at{' '}
              <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
            </p>
          ),
        },
        {
          heading: 'Children',
          body: (
            <p>
              UdyamFlow accounts are for businesses and aren’t meant for anyone under 18. A parent
              or guardian can book on behalf of a child.
            </p>
          ),
        },
        {
          heading: 'Changes',
          body: (
            <p>
              If we make significant changes to this policy, we’ll update the date above and tell
              account holders by email.
            </p>
          ),
        },
      ]}
    />
  );
}
