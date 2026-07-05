import type { Metadata } from 'next';

// Pricing page is a client component (region toggle is interactive). We
// export the metadata from this server-side layout so Next picks it up.

export const metadata: Metadata = {
  title: 'Pricing — UdyamFlow',
  description:
    'Free for the first 6 months. After that: $10 / location / month globally, ₹299 / location / month in India. Unlimited locations on every plan.',
  openGraph: {
    title: 'Pricing — UdyamFlow',
    description: 'Per-location pricing with a free 6-month head start.',
    type: 'website',
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
