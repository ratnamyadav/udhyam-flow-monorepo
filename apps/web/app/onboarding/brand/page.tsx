'use client';

import { Input, Label } from '@udyamflow/ui';
import { useOnboarding } from '@/components/onboarding/store';
import { StepHeading, WizardFooter } from '@/components/onboarding/wizard-shell';

const COLOR_PRESETS = [
  { accent: '#0f766e', soft: '#ccfbf1', ink: '#134e4a' },
  { accent: '#7c3aed', soft: '#ede9fe', ink: '#4c1d95' },
  { accent: '#ea580c', soft: '#ffedd5', ink: '#7c2d12' },
  { accent: '#0284c7', soft: '#e0f2fe', ink: '#0c4a6e' },
  { accent: '#be185d', soft: '#fce7f3', ink: '#831843' },
  { accent: '#65a30d', soft: '#ecfccb', ink: '#3f6212' },
  { accent: '#1a1815', soft: '#f5f4f0', ink: '#1a1815' },
];

export default function StepBrand() {
  const { state, patch } = useOnboarding();

  return (
    <>
      <div className="flex-1 px-20 py-16 overflow-auto">
        <StepHeading
          kicker="03 / Brand"
          title="Make it look like your business"
          subtitle="A logo, an accent color, and one design knob — that's all you need to launch."
        />

        <div className="grid grid-cols-[1fr_400px] gap-12 max-w-[920px]">
          <div className="space-y-6">
            <div className="space-y-1.5">
              <Label htmlFor="logo">Logo text</Label>
              <Input
                id="logo"
                maxLength={4}
                value={state.logoText}
                onChange={(e) => patch({ logoText: e.target.value.toUpperCase() })}
              />
              <div className="text-xs text-ink-soft">
                2–4 characters. We'll add full-logo upload after launch.
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Accent color</Label>
              <div className="flex flex-wrap gap-2">
                {COLOR_PRESETS.map((c) => {
                  const active = state.accent === c.accent;
                  return (
                    <button
                      key={c.accent}
                      type="button"
                      onClick={() =>
                        patch({ accent: c.accent, accentSoft: c.soft, accentInk: c.ink })
                      }
                      className="w-9 h-9 rounded-lg transition-transform hover:scale-105"
                      style={{
                        background: c.accent,
                        border: active ? '2px solid var(--color-ink)' : '2px solid transparent',
                        outline: active ? '2px solid var(--color-bg)' : undefined,
                        outlineOffset: -3,
                      }}
                      aria-label={c.accent}
                    />
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Corner radius</Label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={20}
                  value={state.radius}
                  onChange={(e) => patch({ radius: Number(e.target.value) })}
                  className="flex-1 accent-ink"
                />
                <span className="text-[13px] font-mono text-ink-mute w-12 tabular-nums">
                  {state.radius}px
                </span>
              </div>
            </div>
          </div>

          <div
            className="bg-surface border border-border p-6 flex flex-col justify-center items-center gap-4"
            style={{ borderRadius: 16, minHeight: 320 }}
          >
            <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono">
              Live preview
            </div>
            <div
              className="w-16 h-16 grid place-items-center text-white text-base font-semibold"
              style={{ background: state.accent, borderRadius: state.radius }}
            >
              {state.logoText}
            </div>
            <button
              type="button"
              className="px-6 py-2.5 text-white text-sm font-medium"
              style={{ background: state.accent, borderRadius: state.radius }}
            >
              Book appointment
            </button>
            <div className="grid grid-cols-3 gap-1.5">
              {['09:00', '09:30', '10:00'].map((s, i) => (
                <div
                  key={s}
                  className="px-3 py-1.5 text-xs font-medium border"
                  style={{
                    borderRadius: state.radius,
                    borderColor: i === 1 ? state.accent : 'var(--color-border)',
                    color: i === 1 ? state.accent : 'var(--color-ink-mute)',
                    background: i === 1 ? `${state.accent}10` : 'transparent',
                  }}
                >
                  {s}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <WizardFooter step="brand" prevHref="/onboarding/template" nextHref="/onboarding/locations" />
    </>
  );
}
