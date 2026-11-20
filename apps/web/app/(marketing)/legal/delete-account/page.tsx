import type { Metadata } from 'next';
import Link from 'next/link';
import { LEGAL_CONTACT_EMAIL, LegalPage } from '@/components/marketing/legal-page';

export const metadata: Metadata = {
  title: 'Delete your account — UdyamFlow',
  description: 'How to delete your UdyamFlow account and what happens to your data.',
};

export default function DeleteAccountPage() {
  return (
    <LegalPage
      title="Delete your UdyamFlow account"
      updated="19 November 2026"
      intro={
        <p>
          You can delete your UdyamFlow account yourself at any time, from the app or the website.
        </p>
      }
      sections={[
        {
          heading: 'How to delete it',
          body: (
            <ul>
              <li>
                <strong>In the app:</strong> open Settings, tap <em>Delete account</em> and confirm.
              </li>
              <li>
                <strong>On the web:</strong> <Link href="/sign-in">sign in</Link>, open Settings →
                Your account, type DELETE and confirm.
              </li>
              <li>
                <strong>By email:</strong> can’t sign in? Write to{' '}
                <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a> from the email
                address on the account and we’ll delete it within 30 days.
              </li>
            </ul>
          ),
        },
        {
          heading: 'What gets deleted',
          body: (
            <ul>
              <li>Your login: name, email and any linked Google sign-in.</li>
              <li>Your sessions on every device, and your membership of every workspace.</li>
              <li>
                If you run a workspace on your own, it is closed: billing and customers’ recurring
                memberships are cancelled, and its booking page stops taking bookings.
              </li>
            </ul>
          ),
        },
        {
          heading: 'What we keep',
          body: (
            <p>
              Booking, invoice and payment records of a business are kept for as long as tax and
              accounting law requires, then deleted. A workspace other people still use keeps
              running without you. If you work in a team, make someone else an owner before deleting
              your account.
            </p>
          ),
        },
      ]}
    />
  );
}
