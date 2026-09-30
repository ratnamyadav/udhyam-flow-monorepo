'use client';

import { authClient } from '@udyamflow/auth/client';
import { Button, Input, Label } from '@udyamflow/ui';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { type OnboardingState, useOnboarding } from '@/components/onboarding/store';
import { StepHeading, WizardFooter } from '@/components/onboarding/wizard-shell';
import { browserTimezone, CURRENCIES, defaultCurrencyFor, timezoneOptions } from '@/lib/timezones';
import { trpc } from '@/lib/trpc/react';

type DraftLocation = OnboardingState['locations'][number];

const MIN_NAME = 2;

export default function StepLocations() {
  const router = useRouter();
  const { state, patch } = useOnboarding();
  const createOrg = trpc.onboarding.createOrganization.useMutation();

  const initialTz = useMemo(() => browserTimezone(), []);
  const tzOptions = useMemo(() => timezoneOptions(), []);
  const [draftName, setDraftName] = useState('');
  const [draftCity, setDraftCity] = useState('');
  const [draftTz, setDraftTz] = useState(initialTz);
  const [draftCurrency, setDraftCurrency] = useState<'USD' | 'INR'>(defaultCurrencyFor(initialTz));
  const [draftError, setDraftError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const locations = state.locations;

  function draftToLocation(): DraftLocation {
    return {
      id: crypto.randomUUID(),
      name: draftName.trim(),
      address: draftCity.trim() || undefined,
      timezone: draftTz,
      currency: draftCurrency,
    };
  }

  function addLocal() {
    setDraftError(null);
    if (draftName.trim().length < MIN_NAME) {
      setDraftError(`Location name must be at least ${MIN_NAME} characters.`);
      return;
    }
    patch({ locations: [...locations, draftToLocation()] });
    setDraftName('');
    setDraftCity('');
  }

  function removeLocal(id: string) {
    patch({ locations: locations.filter((l) => l.id !== id) });
  }

  async function commit() {
    setError(null);
    if (!state.business || !state.slug) {
      setError('Go back to step 1 and fill in business name + slug.');
      return;
    }

    if (state.organizationId) {
      // Already created (e.g. the user came back from the Ready step) — don't
      // create a second workspace.
      router.push('/onboarding/ready');
      return;
    }

    // Auto-include any in-flight draft so the user doesn't lose it.
    const trimmedDraft = draftName.trim();
    if (trimmedDraft.length > 0 && trimmedDraft.length < MIN_NAME) {
      setError(`Location name must be at least ${MIN_NAME} characters.`);
      return;
    }
    const allLocations = trimmedDraft.length > 0 ? [...locations, draftToLocation()] : locations;

    if (allLocations.length === 0) {
      setError('Add at least one location.');
      return;
    }
    const short = allLocations.find((l) => l.name.trim().length < MIN_NAME);
    if (short) {
      setError(`Location names must be at least ${MIN_NAME} characters.`);
      return;
    }

    setSubmitting(true);
    try {
      // One atomic call: org + owner membership + settings + brand + locations.
      // The server also makes it the active org on this session.
      const { organizationId } = await createOrg.mutateAsync({
        name: state.business.trim(),
        slug: state.slug,
        templateId: state.templateId,
        brand: {
          accent: state.accent,
          accentSoft: state.accentSoft,
          accentInk: state.accentInk,
          radius: state.radius,
          fontDisplay: state.fontDisplay,
          logoText: state.logoText.slice(0, 4) || undefined,
        },
        locations: allLocations.map((l) => ({
          name: l.name.trim(),
          address: l.address,
          timezone: l.timezone,
          currency: l.currency,
        })),
      });

      patch({ organizationId, locations: allLocations });
      setDraftName('');
      setDraftCity('');

      // Refresh the client session cache so the new org shows as active.
      // Harmless if it fails — the server already activated it.
      const active = await authClient.organization
        .setActive({ organizationId })
        .catch((err: unknown) => ({ error: err }));
      if (active.error) console.warn('organization.setActive failed', active.error);

      router.push('/onboarding/ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create workspace');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex-1 px-20 py-16 overflow-auto">
        <StepHeading
          kicker="04 / Locations"
          title="Where do you take bookings?"
          subtitle="Add your physical or virtual locations. Each gets its own hours, staff, and pricing."
        />

        <div className="grid grid-cols-[1fr_380px] gap-10 max-w-[920px]">
          <div className="space-y-3">
            {locations.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between bg-surface border border-border rounded-lg px-4 py-3.5"
              >
                <div>
                  <div className="text-[14px] font-medium text-ink">{l.name}</div>
                  <div className="text-xs text-ink-mute">
                    {l.address ?? '—'} · <span className="font-mono">{l.timezone}</span> ·{' '}
                    <span className="font-mono">{l.currency}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="text-xs text-ink-soft hover:text-danger"
                  onClick={() => removeLocal(l.id)}
                  disabled={!!state.organizationId}
                >
                  Remove
                </button>
              </div>
            ))}
            {locations.length === 0 && (
              <div className="text-xs text-ink-soft px-1 italic">
                You haven't added any locations yet — use the form on the right.
              </div>
            )}
          </div>

          <div className="bg-surface border border-border rounded-xl p-5 space-y-3 h-fit">
            <div className="text-xs uppercase tracking-wider text-ink-mute font-medium font-mono">
              Add location
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lname">Name</Label>
              <Input
                id="lname"
                placeholder="e.g. Powai Clinic"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="laddr">Address (optional)</Label>
              <Input
                id="laddr"
                placeholder="e.g. Mumbai"
                value={draftCity}
                onChange={(e) => setDraftCity(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-[1fr_96px] gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="ltz">Timezone</Label>
                <select
                  id="ltz"
                  className="w-full text-[13px] bg-surface border border-border rounded-md px-2.5 py-1.5 text-ink"
                  value={draftTz}
                  onChange={(e) => {
                    setDraftTz(e.target.value);
                    setDraftCurrency(defaultCurrencyFor(e.target.value));
                  }}
                >
                  {tzOptions.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lcur">Currency</Label>
                <select
                  id="lcur"
                  className="w-full text-[13px] bg-surface border border-border rounded-md px-2.5 py-1.5 text-ink"
                  value={draftCurrency}
                  onChange={(e) => setDraftCurrency(e.target.value as 'USD' | 'INR')}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {draftError && <div className="text-[12px] text-danger">{draftError}</div>}
            <Button onClick={addLocal} variant="outline" className="w-full">
              + Add to list
            </Button>
          </div>
        </div>
      </div>
      <WizardFooter
        step="locations"
        prevHref="/onboarding/brand"
        nextLabel={state.organizationId ? 'Continue →' : 'Create workspace →'}
        onNext={commit}
        pending={submitting}
        error={error}
      />
    </>
  );
}
