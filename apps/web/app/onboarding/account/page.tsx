'use client';

import { Input, Label } from '@udyamflow/ui';
import { useEffect } from 'react';
import { useOnboarding } from '@/components/onboarding/store';
import { StepHeading, WizardFooter } from '@/components/onboarding/wizard-shell';

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// What customers will visit — shown next to the slug so it's clear what
// the URL becomes.
const BOOKING_URL_PREFIX = `${(process.env.NEXT_PUBLIC_APP_URL ?? 'https://udyamflow.com').replace(/^https?:\/\//, '').replace(/\/+$/, '')}/book/`;

export default function StepAccount() {
  const { state, patch, reset } = useOnboarding();

  // Derive slug from business name once, until the user customises it.
  useEffect(() => {
    if (state.business && !state.slug) patch({ slug: slugify(state.business) });
  }, [state.business, state.slug, patch]);

  // Mirrors the server's slug rule (no leading/trailing/double dashes).
  const canContinue =
    state.business.trim().length >= 2 &&
    state.slug.length >= 2 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(state.slug);

  return (
    <>
      <div className="flex-1 px-20 py-16 overflow-auto">
        <StepHeading
          kicker="01 / Account"
          title="Let's set up your workspace"
          subtitle="A few basics. We'll guess as much as we can later from your template choice."
        />
        {state.organizationId && (
          <div className="mb-6 max-w-[460px] bg-surface border border-border rounded-md px-3 py-2 text-[12px] text-ink-mute flex items-center justify-between gap-3">
            <span>
              You already created <span className="font-mono text-ink">{state.slug}</span> in this
              session.
            </span>
            <button type="button" className="text-ink underline underline-offset-2" onClick={reset}>
              Start another
            </button>
          </div>
        )}
        <div className="grid gap-5 max-w-[460px]">
          <div className="space-y-1.5">
            <Label htmlFor="business">Business name</Label>
            <Input
              id="business"
              value={state.business}
              onChange={(e) => patch({ business: e.target.value })}
              placeholder="e.g. Patel Family Clinic"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slug">Booking page URL</Label>
            <div className="flex items-center gap-1 text-[14px]">
              <span className="text-ink-mute font-mono">{BOOKING_URL_PREFIX}</span>
              <Input
                id="slug"
                value={state.slug}
                // Keep a trailing dash while typing; tidy it up on blur.
                onChange={(e) =>
                  patch({
                    slug: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/^-+/, ''),
                  })
                }
                onBlur={() => patch({ slug: slugify(state.slug) })}
                className="flex-1 font-mono"
              />
            </div>
            <div className="text-xs text-ink-soft">
              Lowercase letters, numbers, and dashes only.
            </div>
          </div>
        </div>
      </div>
      <WizardFooter step="account" nextHref="/onboarding/template" nextDisabled={!canContinue} />
    </>
  );
}
