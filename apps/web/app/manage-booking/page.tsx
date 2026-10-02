import { Suspense } from 'react';
import { BookingManagement } from './ui';
export const metadata = {
  title: 'Manage booking | UdyamFlow',
  robots: { index: false, follow: false },
  referrer: 'no-referrer' as const,
};
export default function ManageBookingPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <BookingManagement />
    </Suspense>
  );
}
