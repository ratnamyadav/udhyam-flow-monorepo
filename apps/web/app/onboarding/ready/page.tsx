'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { useOnboarding } from '@/components/onboarding/store';
import { StepHeading, WizardFooter } from '@/components/onboarding/wizard-shell';

function bookingUrl(slug: string) {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://udyamflow.com').replace(/\/+$/, '');
  return `${base.replace(/^https?:\/\//, '')}/book/${slug}`;
}

export default function StepReady() {
  const router = useRouter();
  const { state, hydrated, reset } = useOnboarding();
  const slug = state.slug || 'your-workspace';
  const created = !!state.organizationId;

  const leaving = useRef(false);
  const finish = useCallback(() => {
    leaving.current = true;
    reset();
  }, [reset]);

  // Nothing has been created yet — send the user back to finish the wizard.
  useEffect(() => {
    if (hydrated && !created && !leaving.current) router.replace('/onboarding/locations');
  }, [hydrated, created, router]);

  // The wizard draft is cleared when the user leaves via one of the links
  // below (an explicit action), not on unmount — StrictMode's mount/unmount
  // double-invoke would otherwise wipe the state while this page is showing.
  if (!hydrated || !created) {
    return <div className="flex-1 px-20 py-16 text-[13px] text-ink-mute">Loading…</div>;
  }

  const cards = [
    {
      title: 'Your booking page',
      body: `Share ${bookingUrl(slug)} with your customers.`,
      cta: 'Open booking page',
      href: `/book/${slug}`,
      newTab: true,
    },
    {
      title: 'Owner dashboard',
      body: "Today's bookings, location switcher, and metrics in one place.",
      cta: 'Open dashboard',
      href: '/dashboard',
    },
    {
      title: 'Brand settings',
      body: 'Tweak logo, colors, fonts, and layout density anytime.',
      cta: 'Open settings',
      href: '/settings/branding',
    },
  ];

  return (
    <>
      <div className="flex-1 px-20 py-16 overflow-auto">
        <StepHeading
          kicker="05 / Ready"
          title="Your workspace is ready."
          subtitle="We've created your organization, applied your brand, and saved your locations. Take it for a spin."
        />
        <div className="grid grid-cols-3 gap-3 max-w-[860px]">
          {cards.map((c) => (
            <Link
              key={c.title}
              href={c.href}
              onClick={c.newTab ? undefined : finish}
              target={c.newTab ? '_blank' : undefined}
              rel={c.newTab ? 'noopener noreferrer' : undefined}
              className="bg-surface border border-border rounded-xl p-5 hover:border-border-strong transition-colors block"
            >
              <div className="text-sm font-medium text-ink mb-1">{c.title}</div>
              <div className="text-[13px] text-ink-mute leading-relaxed mb-4">{c.body}</div>
              <div className="text-[13px] text-ink font-medium">{c.cta} →</div>
            </Link>
          ))}
        </div>
        <div className="mt-10 inline-flex items-center gap-2 text-xs text-ink-mute px-3 py-1.5 border border-border rounded-full bg-surface font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          Free for 6 months · No card on file
        </div>
      </div>
      <WizardFooter step="ready" onFinish={finish} />
    </>
  );
}
