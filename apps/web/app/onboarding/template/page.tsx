'use client';

import { PROFESSIONS, TEMPLATES } from '@udyamflow/tokens';
import { useOnboarding } from '@/components/onboarding/store';
import { StepHeading, WizardFooter } from '@/components/onboarding/wizard-shell';

export default function StepTemplate() {
  const { state, patch } = useOnboarding();

  return (
    <>
      <div className="flex-1 px-20 py-16 overflow-auto">
        <StepHeading
          kicker="02 / Template"
          title="Pick your starting template"
          subtitle="Each ships with the right slot lengths, intake fields, and policies. You can change it later."
        />
        <div className="grid grid-cols-3 gap-3.5 max-w-[860px]">
          {TEMPLATES.map((t) => {
            const active = state.templateId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => patch({ templateId: t.id })}
                className="text-left bg-surface border rounded-xl p-5 transition-all hover:border-border-strong"
                style={{
                  borderColor: active
                    ? 'var(--color-ink, #1a1815)'
                    : 'var(--color-border, #e9e7e0)',
                  boxShadow: active ? '0 0 0 4px rgba(26,24,21,0.06)' : undefined,
                }}
              >
                <div className="w-9 h-9 rounded-lg bg-surface-mute grid place-items-center text-base text-ink mb-4">
                  {PROFESSIONS[t.id].icon}
                </div>
                <div className="text-base font-medium text-ink mb-1">{t.title}</div>
                <div className="text-[13px] text-ink-mute leading-relaxed mb-3">{t.tagline}</div>
                <div className="flex flex-wrap gap-1.5">
                  {t.features.slice(0, 3).map((f) => (
                    <span
                      key={f}
                      className="text-[11px] px-2 py-0.5 bg-surface-mute text-ink-mute rounded"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <WizardFooter step="template" prevHref="/onboarding/account" nextHref="/onboarding/brand" />
    </>
  );
}
