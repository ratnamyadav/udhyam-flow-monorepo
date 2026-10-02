import Link from 'next/link';
export const metadata = {
  title: 'Account deletion | UdyamFlow',
  robots: { index: false, follow: false },
};
export default function AccountDeletionPage() {
  return (
    <main className="max-w-xl mx-auto px-6 py-16 text-ink">
      <h1 className="text-3xl font-semibold">Account deletion</h1>
      <p className="mt-4">
        To request deletion, sign in and open Account, or tap Delete account in the mobile app's
        Settings. Confirm using the verification email. If you arrived here after confirming that
        email, your personal account has been deleted.
      </p>
      <p className="mt-4">
        Your login, sessions and workspace memberships are removed. Workspace business records,
        including bookings, invoices and customers, stay with the business. Workspace owners must
        transfer ownership and leave their owner memberships first.
      </p>
      <Link href="/account" className="block mt-6 underline">
        Manage your account
      </Link>
    </main>
  );
}
