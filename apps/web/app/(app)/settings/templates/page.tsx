'use client';

import { PROFESSIONS, type ProfessionId, TEMPLATES } from '@udyamflow/tokens';
import { Button } from '@udyamflow/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc/react';

export default function TemplatePickerPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const settings = trpc.tenant.getSettings.useQuery();
  const update = trpc.tenant.updateSettings.useMutation({
    onSuccess: () => {
      utils.tenant.getSettings.invalidate();
      router.refresh();
    },
  });

  const [selected, setSelected] = useState<ProfessionId>('doctor');
  useEffect(() => {
    if (settings.data?.templateId) setSelected(settings.data.templateId as ProfessionId);
  }, [settings.data?.templateId]);

  const profession = PROFESSIONS[selected];
  const dirty = settings.data?.templateId !== selected;

  return (
    <div className="px-12 py-10 max-w-[1280px] mx-auto">
      <div className="mb-8">
        <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-2 font-mono">
          Settings · Templates
        </div>
        <h1 className="text-[32px] font-medium tracking-tight text-ink">Switch your template</h1>
        <p className="text-[14px] text-ink-mute mt-2 max-w-[640px]">
          Switching templates rewires the slot durations, intake fields, and dashboard metrics to
          match your trade. Existing bookings are preserved.
        </p>
      </div>

      <div className="grid grid-cols-[280px_1fr] gap-6">
        <div className="space-y-1.5">
          {TEMPLATES.map((t) => {
            const active = selected === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelected(t.id)}
                className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors"
                style={{
                  background: active ? 'var(--color-surface-mute)' : 'transparent',
                  borderColor: active ? 'var(--color-border-strong)' : 'transparent',
                }}
              >
                <div className="w-8 h-8 rounded-md bg-surface-mute grid place-items-center text-sm text-ink">
                  {PROFESSIONS[t.id].icon}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-ink">{t.title}</div>
                  <div className="text-xs text-ink-mute">{t.tagline}</div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="bg-surface border border-border rounded-xl p-7">
          <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-2 font-mono">
            Preview
          </div>
          <h2 className="text-[24px] font-medium text-ink mb-4">{profession.name}</h2>

          <div className="grid grid-cols-2 gap-x-10 gap-y-5 text-[13px]">
            <div>
              <div className="text-ink-soft mb-1.5 uppercase tracking-wider text-[10px]">
                Resource
              </div>
              <div className="text-ink">
                {profession.resourceLabel} · {profession.resourcePlural}
              </div>
            </div>
            <div>
              <div className="text-ink-soft mb-1.5 uppercase tracking-wider text-[10px]">
                Slot length
              </div>
              <div className="text-ink">
                {profession.slotDuration} min · "{profession.slotLabel}"
              </div>
            </div>
            <div>
              <div className="text-ink-soft mb-1.5 uppercase tracking-wider text-[10px]">
                Booking noun
              </div>
              <div className="text-ink">{profession.bookingNoun}</div>
            </div>
            <div>
              <div className="text-ink-soft mb-1.5 uppercase tracking-wider text-[10px]">
                Sample slots
              </div>
              <div className="text-ink font-mono text-xs">
                {profession.sampleSlots.slice(0, 4).join(' · ')}…
              </div>
            </div>
            <div className="col-span-2 mt-2">
              <div className="text-ink-soft mb-1.5 uppercase tracking-wider text-[10px]">
                Intake fields
              </div>
              <div className="flex flex-wrap gap-1.5">
                {profession.intakeFields.map((f) => (
                  <span
                    key={f}
                    className="text-[11px] px-2 py-0.5 bg-surface-mute text-ink-mute rounded"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-7 flex justify-end gap-3 items-center">
            {update.error && (
              <span className="text-[12px] text-danger">{update.error.message}</span>
            )}
            <Button
              disabled={!dirty || update.isPending}
              onClick={() => update.mutate({ templateId: selected, profession: selected })}
            >
              {update.isPending ? 'Applying…' : dirty ? 'Apply template' : 'Current template'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
