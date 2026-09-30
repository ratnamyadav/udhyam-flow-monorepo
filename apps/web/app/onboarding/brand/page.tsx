'use client';

import { FONT_OPTIONS, fontStack, isHexColor, readableTextOn } from '@udyamflow/tokens';
import { Input, Label } from '@udyamflow/ui';
import { useOnboarding } from '@/components/onboarding/store';
import { StepHeading, WizardFooter } from '@/components/onboarding/wizard-shell';
import {
  ACCENT_PRESETS,
  type AccentPreset,
  ColorField,
  FontPicker,
  PaletteWarnings,
  PresetSwatches,
  paletteFromAccent,
} from '@/components/theme/brand-controls';
import { professionFor } from '@/lib/booking-copy';
import { withAlpha } from '@/lib/color';

const COLOR_PRESETS: AccentPreset[] = [
  ...ACCENT_PRESETS,
  {
    id: 'ink',
    label: 'Classic ink',
    accent: '#1a1815',
    accentSoft: '#f5f4f0',
    accentInk: '#1a1815',
  },
];

// A short curated subset keeps this step light; every font is available later
// in Settings → Branding.
const ONBOARDING_FONTS = FONT_OPTIONS.filter((f) =>
  ['inter', 'dm-sans', 'fraunces', 'playfair'].includes(f.id),
);

export default function StepBrand() {
  const { state, patch } = useOnboarding();
  const profession = professionFor(state.templateId);
  const accentFg = readableTextOn(state.accent);
  const paletteValid = [state.accent, state.accentSoft, state.accentInk].every(isHexColor);

  return (
    <>
      <div className="flex-1 px-20 py-16 overflow-auto">
        <StepHeading
          kicker="03 / Brand"
          title="Make it look like your business"
          subtitle="A logo, an accent color, and a heading font — that's all you need to launch."
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
                aria-describedby="logo-help"
              />
              <div id="logo-help" className="text-xs text-ink-soft">
                2–4 characters, shown in a colored badge. You can upload a logo image in Settings →
                Branding once your workspace is set up.
              </div>
            </div>

            <div className="space-y-2">
              <Label>Accent color</Label>
              <PresetSwatches
                compact
                presets={COLOR_PRESETS}
                accent={state.accent}
                onPick={(p) =>
                  patch({ accent: p.accent, accentSoft: p.accentSoft, accentInk: p.accentInk })
                }
              />
              <div className="pt-1">
                <ColorField
                  id="accent"
                  label="Custom accent"
                  value={state.accent}
                  onChange={(hex) => patch(paletteFromAccent(hex))}
                />
              </div>
              <div className="text-xs text-ink-soft">
                Pick any color — we derive a matching tint and text shade for you.
              </div>
              <PaletteWarnings
                palette={{
                  accent: state.accent,
                  accentSoft: state.accentSoft,
                  accentInk: state.accentInk,
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>Heading font</Label>
              <FontPicker
                label="Heading font"
                value={state.fontDisplay}
                onChange={(fontDisplay) => patch({ fontDisplay })}
                options={ONBOARDING_FONTS}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="radius">Corner radius</Label>
              <div className="flex items-center gap-3">
                <input
                  id="radius"
                  type="range"
                  min={0}
                  max={24}
                  value={state.radius}
                  aria-valuetext={`${state.radius} pixels`}
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
              className="w-16 h-16 grid place-items-center text-base font-semibold"
              style={{ background: state.accent, color: accentFg, borderRadius: state.radius }}
            >
              {state.logoText}
            </div>
            <div
              className="text-[22px] font-medium tracking-tight text-ink text-center"
              style={{ fontFamily: fontStack(state.fontDisplay) }}
            >
              {state.business || 'Your business'}
            </div>
            <button
              type="button"
              tabIndex={-1}
              className="px-6 py-2.5 text-sm font-medium"
              style={{ background: state.accent, color: accentFg, borderRadius: state.radius }}
            >
              Book {profession.slotLabel.toLowerCase()}
            </button>
            <div className="grid grid-cols-3 gap-1.5">
              {['09:00', '09:30', '10:00'].map((s, i) => (
                <div
                  key={s}
                  className="px-3 py-1.5 text-xs font-medium border"
                  style={{
                    borderRadius: state.radius,
                    borderColor: i === 1 ? state.accent : 'var(--color-border)',
                    color: i === 1 ? state.accentInk : 'var(--color-ink-mute)',
                    background: i === 1 ? withAlpha(state.accent, '10') : 'transparent',
                  }}
                >
                  {s}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <WizardFooter
        step="brand"
        prevHref="/onboarding/template"
        nextHref="/onboarding/locations"
        nextDisabled={!paletteValid}
        error={paletteValid ? null : 'Enter a valid hex accent color to continue.'}
      />
    </>
  );
}
