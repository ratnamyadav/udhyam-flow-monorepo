'use client';

import { Logo } from '@udyamflow/ui';
import Link from 'next/link';
import { useState } from 'react';
import { MarketingNav } from '@/components/marketing/marketing-nav';

const REGIONS = {
  US: { strike: '$50', price: '$10', unit: '/ location / month', currency: 'USD' },
  India: { strike: '₹1,000', price: '₹299', unit: '/ location / month', currency: 'INR' },
} as const;

type Region = keyof typeof REGIONS;

export default function PricingPage() {
  const [region, setRegion] = useState<Region>('US');
  const p = REGIONS[region];

  return (
    <div className="min-h-screen bg-bg text-ink">
      <MarketingNav activeHref="/pricing" />

      <section className="px-14 pt-24 pb-14 max-w-[1100px] mx-auto text-center">
        <div
          className="text-xs uppercase tracking-wider mb-4 font-medium"
          style={{ color: '#c8704a' }}
        >
          Pricing · Launch offer
        </div>
        <h1
          className="text-[76px] font-medium m-0 text-ink"
          style={{ lineHeight: 1, letterSpacing: '-2.2px', textWrap: 'balance' }}
        >
          Free for six months.
          <br />
          <span className="text-ink-mute">
            Then{' '}
            <em
              className="not-italic"
              style={{ fontFamily: '"Fraunces", serif', fontWeight: 400, fontStyle: 'italic' }}
            >
              fair
            </em>
            , per location.
          </span>
        </h1>
        <p className="text-[18px] text-ink-mute mt-6 max-w-[560px] mx-auto leading-relaxed">
          One simple price. Unlimited bookings, staff, and templates included. We only charge for
          the physical (or virtual) places you take bookings from.
        </p>

        <div className="inline-flex mt-11 p-1 bg-surface-mute rounded-full border border-border">
          {(['US', 'India'] as Region[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRegion(r)}
              className="px-5 py-2 text-[13px] font-medium rounded-full border-none cursor-pointer transition-colors"
              style={{
                background: region === r ? 'var(--color-ink, #1a1815)' : 'transparent',
                color: region === r ? 'var(--color-bg, #fbfaf8)' : 'var(--color-ink-mute, #5b574e)',
              }}
            >
              {r === 'US' ? '🌐 Global · USD' : '🇮🇳 India · INR'}
            </button>
          ))}
        </div>
      </section>

      <section className="px-14 max-w-[1100px] mx-auto pb-24">
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-surface border border-border rounded-2xl p-9">
            <div className="text-xs uppercase tracking-wider text-ink-mute mb-2">
              First 6 months
            </div>
            <div className="text-[40px] font-medium tracking-tight text-ink leading-none">Free</div>
            <div className="text-[13px] text-ink-mute mt-2">No card required. Cancel anytime.</div>
            <div className="border-t border-border my-7" />
            <ul className="space-y-3 text-[14px] text-ink">
              {[
                'Unlimited bookings',
                'Unlimited staff',
                'All 6 templates',
                'Multi-location ready',
                'Email + SMS reminders',
              ].map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <span className="text-[#3d7c4d] mt-0.5">✓</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          <div
            className="rounded-2xl p-9 border border-ink/15 relative"
            style={{ background: 'rgba(15, 118, 110, 0.04)' }}
          >
            <div className="absolute top-5 right-5 text-[10px] font-medium uppercase tracking-wider text-ink-mute bg-surface px-2.5 py-1 rounded-full border border-border">
              After 6 months
            </div>
            <div className="text-xs uppercase tracking-wider text-ink-mute mb-2">
              Per location pricing
            </div>
            <div className="flex items-baseline gap-2">
              <span
                className="text-[20px] text-ink-soft line-through font-mono"
                style={{ textDecorationColor: '#c8704a' }}
              >
                {p.strike}
              </span>
              <span className="text-[40px] font-medium tracking-tight text-ink leading-none font-mono">
                {p.price}
              </span>
              <span className="text-[14px] text-ink-mute">{p.unit}</span>
            </div>
            <div className="text-[13px] text-ink-mute mt-2">
              Billed in {p.currency}. Add or remove locations any time.
            </div>
            <div className="border-t border-border my-7" />
            <ul className="space-y-3 text-[14px] text-ink">
              {[
                'Everything in Free',
                'Custom domain',
                'Branded emails + SMS',
                'Priority support',
                'Audit log + exports',
              ].map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <span className="text-[#3d7c4d] mt-0.5">✓</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="text-center mt-12">
          <Link
            href="/sign-up"
            className="inline-block bg-ink text-bg px-7 py-3.5 rounded-lg text-[15px] font-medium hover:opacity-90"
          >
            Start free for 6 months →
          </Link>
          <div className="text-[13px] text-ink-soft mt-3">
            No card required. Setup in under 5 minutes.
          </div>
        </div>
      </section>

      <section className="px-14 py-20 border-t border-border bg-surface">
        <div className="max-w-[900px] mx-auto">
          <h3 className="text-[24px] font-medium text-ink mb-8">Common questions</h3>
          <div className="space-y-6">
            {[
              {
                q: 'Why per-location pricing?',
                a: 'Most booking platforms charge per booking, per staff member, or per SMS — costs that scale unpredictably. We charge for the physical or virtual locations you take bookings from. Predictable, fair, and aligned with how you actually grow.',
              },
              {
                q: 'What counts as a location?',
                a: 'A physical clinic, a court, a salon — or a virtual one for online tutoring or telehealth. Whichever way your customers book.',
              },
              {
                q: 'Can I switch between USD and INR?',
                a: 'You bill in your home currency, but each location can collect in any currency. Your patients pay in INR, your dashboard rolls up in USD if you want.',
              },
              {
                q: 'What happens after 6 months?',
                a: 'You decide. Keep going at the listed rate, or export your data and walk away — no lock-in.',
              },
            ].map((faq) => (
              <div key={faq.q} className="border-b border-border pb-6 last:border-b-0">
                <div className="text-[15px] font-medium text-ink mb-2">{faq.q}</div>
                <div className="text-[14px] text-ink-mute leading-relaxed">{faq.a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="px-14 py-12 border-t border-border text-[13px] text-ink-soft">
        <div className="max-w-[1280px] mx-auto flex justify-between items-center">
          <Logo />
          <span>© 2026 UdyamFlow. Made with care in Bengaluru & Berlin.</span>
        </div>
      </footer>
    </div>
  );
}
