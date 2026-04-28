'use client';

import { Button, Input, Label } from '@udyamflow/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc/react';

const PRESETS = [
  { id: 'teal', accent: '#0f766e', soft: '#ccfbf1', ink: '#134e4a', label: 'Clinic teal' },
  { id: 'violet', accent: '#7c3aed', soft: '#ede9fe', ink: '#4c1d95', label: 'Tutor violet' },
  { id: 'orange', accent: '#ea580c', soft: '#ffedd5', ink: '#7c2d12', label: 'Sports orange' },
  { id: 'blue', accent: '#0284c7', soft: '#e0f2fe', ink: '#0c4a6e', label: 'Calm blue' },
  { id: 'rose', accent: '#be185d', soft: '#fce7f3', ink: '#831843', label: 'Salon rose' },
  { id: 'lime', accent: '#65a30d', soft: '#ecfccb', ink: '#3f6212', label: 'Fitness lime' },
];

const FONTS = [
  { id: 'inter', label: 'Inter', stack: '"Inter", system-ui, sans-serif' },
  { id: 'fraunces', label: 'Fraunces', stack: '"Fraunces", Georgia, serif' },
];

export default function BrandingSettingsPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const settingsQuery = trpc.tenant.getSettings.useQuery();
  const updateSettings = trpc.tenant.updateSettings.useMutation({
    onSuccess: () => {
      utils.tenant.getSettings.invalidate();
      router.refresh(); // re-renders the (app) layout so the topbar/theme update
    },
  });

  const [logo, setLogo] = useState('PC');
  const [accent, setAccent] = useState('#0f766e');
  const [accentSoft, setAccentSoft] = useState('#ccfbf1');
  const [accentInk, setAccentInk] = useState('#134e4a');
  const [radius, setRadius] = useState(8);
  const [density, setDensity] = useState<'compact' | 'comfortable'>('comfortable');
  const [fontDisplay, setFontDisplay] = useState(FONTS[0]!.stack);
  const [saved, setSaved] = useState(false);

  // Hydrate from DB once it lands.
  useEffect(() => {
    const s = settingsQuery.data;
    if (!s) return;
    setLogo(s.logoText);
    setAccent(s.accent);
    setAccentSoft(s.accentSoft);
    setAccentInk(s.accentInk);
    setRadius(s.radius);
    setDensity(s.density === 'compact' ? 'compact' : 'comfortable');
    setFontDisplay(s.fontDisplay);
  }, [settingsQuery.data]);

  function applyPreset(p: (typeof PRESETS)[number]) {
    setAccent(p.accent);
    setAccentSoft(p.soft);
    setAccentInk(p.ink);
  }

  async function onSave() {
    await updateSettings.mutateAsync({
      logoText: logo,
      accent,
      accentSoft,
      accentInk,
      radius,
      density,
      fontDisplay,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="px-12 py-10 max-w-[1280px] mx-auto">
      <div className="mb-8">
        <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-2 font-mono">
          Settings · Branding
        </div>
        <h1 className="text-[32px] font-medium tracking-tight text-ink">Brand customization</h1>
        <p className="text-[14px] text-ink-mute mt-2 max-w-[640px]">
          Tweak your booking page's colors, radius, and fonts. Changes preview live and apply to
          every customer-facing surface when you save.
        </p>
      </div>

      <div className="grid grid-cols-[420px_1fr] gap-8">
        <div className="space-y-6">
          <Section title="Logo">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 grid place-items-center text-white text-sm font-semibold"
                style={{ background: accent, borderRadius: radius }}
              >
                {logo}
              </div>
              <Input
                maxLength={4}
                value={logo}
                onChange={(e) => setLogo(e.target.value.toUpperCase())}
                className="flex-1"
              />
            </div>
          </Section>

          <Section title="Accent presets">
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => applyPreset(p)}
                  className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-surface hover:border-border-strong text-left"
                >
                  <span className="w-4 h-4 rounded" style={{ background: p.accent }} />
                  <span className="text-xs text-ink">{p.label}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Custom accent">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border border-border"
              />
              <Input
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="flex-1 font-mono"
              />
            </div>
          </Section>

          <Section title="Corner radius">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={20}
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                className="flex-1 accent-ink"
              />
              <span className="text-[13px] font-mono text-ink-mute w-12 tabular-nums">
                {radius}px
              </span>
            </div>
          </Section>

          <Section title="Density">
            <div className="grid grid-cols-2 gap-2">
              {(['compact', 'comfortable'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDensity(d)}
                  className="px-3 py-2 rounded-md border text-xs font-medium capitalize"
                  style={{
                    borderColor: density === d ? 'var(--color-ink)' : 'var(--color-border)',
                    background:
                      density === d ? 'var(--color-surface-mute)' : 'var(--color-surface)',
                    color: 'var(--color-ink)',
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Display font">
            <div className="grid grid-cols-2 gap-2">
              {FONTS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFontDisplay(f.stack)}
                  className="px-3 py-3 rounded-md border text-base text-ink"
                  style={{
                    fontFamily: f.stack,
                    borderColor:
                      fontDisplay === f.stack ? 'var(--color-ink)' : 'var(--color-border)',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </Section>

          <Button onClick={onSave} disabled={updateSettings.isPending}>
            {updateSettings.isPending ? 'Saving…' : saved ? 'Saved ✓' : 'Save changes'}
          </Button>
          {updateSettings.error && (
            <div className="text-[12px] text-danger">{updateSettings.error.message}</div>
          )}
        </div>

        <div
          className="bg-surface border border-border rounded-2xl p-7 min-h-[520px]"
          style={{
            ['--accent' as string]: accent,
            ['--accent-soft' as string]: accentSoft,
            ['--accent-ink' as string]: accentInk,
            ['--radius' as string]: `${radius}px`,
            ['--font-display' as string]: fontDisplay,
          }}
        >
          <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-3">
            Live preview · {density}
          </div>

          <Label>Booking page hero</Label>
          <div
            className="mt-3 mb-7 p-6 rounded-xl border border-border"
            style={{ background: accentSoft }}
          >
            <div className="flex items-center gap-2.5 mb-4">
              <div
                className="w-9 h-9 grid place-items-center text-white text-[11px] font-semibold"
                style={{ background: accent, borderRadius: radius }}
              >
                {logo}
              </div>
              <div>
                <div className="text-sm font-semibold text-ink">Patel Clinic</div>
                <div className="text-xs" style={{ color: accentInk }}>
                  Bandra · Mumbai
                </div>
              </div>
            </div>
            <h3
              className="text-[28px] m-0 font-medium tracking-tight"
              style={{ color: 'var(--color-ink)', fontFamily: fontDisplay }}
            >
              Book a 30-minute consultation
            </h3>
          </div>

          <Label>Slots</Label>
          <div className="mt-3 grid grid-cols-5 gap-1.5 mb-7">
            {['09:00', '09:30', '10:00', '10:30', '11:00'].map((s, i) => (
              <button
                key={s}
                type="button"
                className="py-2 text-xs font-medium border"
                style={{
                  borderRadius: radius,
                  borderColor: i === 1 ? accent : 'var(--color-border)',
                  color: i === 1 ? '#fff' : 'var(--color-ink)',
                  background: i === 1 ? accent : 'var(--color-surface)',
                }}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="flex gap-2.5">
            <button
              type="button"
              className="px-5 py-2.5 text-white text-sm font-medium"
              style={{ background: accent, borderRadius: radius }}
            >
              Confirm booking
            </button>
            <button
              type="button"
              className="px-5 py-2.5 text-sm font-medium border border-border text-ink"
              style={{ borderRadius: radius }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{title}</Label>
      {children}
    </div>
  );
}
