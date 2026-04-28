'use client';

import { authClient } from '@udyamflow/auth/client';
import { Button, Input, Label } from '@udyamflow/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useOnboarding } from '@/components/onboarding/store';
import { StepHeading, WizardFooter } from '@/components/onboarding/wizard-shell';
import { trpc } from '@/lib/trpc/react';

export default function StepLocations() {
  const router = useRouter();
  const { state, patch } = useOnboarding();
  const createOrg = trpc.onboarding.createOrganization.useMutation();
  const updateSettings = trpc.tenant.updateSettings.useMutation();
  const createLocation = trpc.location.create.useMutation();

  const [draftName, setDraftName] = useState('');
  const [draftCity, setDraftCity] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const locations = state.locations;

  function addLocal() {
    const name = draftName.trim();
    if (!name) return;
    patch({
      locations: [
        ...locations,
        { id: crypto.randomUUID(), name, address: draftCity.trim() || undefined },
      ],
    });
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

    // Auto-include any in-flight draft so the user doesn't lose it.
    const allLocations =
      draftName.trim().length > 0
        ? [
            ...locations,
            {
              id: crypto.randomUUID(),
              name: draftName.trim(),
              address: draftCity.trim() || undefined,
            },
          ]
        : locations;

    if (allLocations.length === 0) {
      setError('Add at least one location.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Create the organization (also writes initial tenantSettings).
      const { organizationId } = await createOrg.mutateAsync({
        name: state.business,
        slug: state.slug,
        templateId: state.templateId,
      });

      // 2. Activate it so subsequent tenant procedures resolve.
      await authClient.organization.setActive({ organizationId });

      // 3. Apply the brand settings the user picked in step 3.
      await updateSettings.mutateAsync({
        accent: state.accent,
        accentSoft: state.accentSoft,
        accentInk: state.accentInk,
        radius: state.radius,
        fontDisplay: state.fontDisplay,
        logoText: state.logoText,
      });

      // 4. Create each location.
      for (const loc of allLocations) {
        await createLocation.mutateAsync({ name: loc.name, address: loc.address });
      }

      patch({ organizationId });
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
                  <div className="text-xs text-ink-mute">{l.address ?? '—'}</div>
                </div>
                <button
                  type="button"
                  className="text-xs text-ink-soft hover:text-danger"
                  onClick={() => removeLocal(l.id)}
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
            <Button onClick={addLocal} variant="outline" className="w-full">
              + Add to list
            </Button>
          </div>
        </div>
      </div>
      <WizardFooter
        step="locations"
        prevHref="/onboarding/brand"
        nextLabel="Create workspace →"
        onNext={commit}
        pending={submitting}
        error={error}
      />
    </>
  );
}
