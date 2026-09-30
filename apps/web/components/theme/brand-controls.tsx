'use client';

import {
  deriveAccentPalette,
  FONT_OPTIONS,
  type FontId,
  fontStack,
  isHexColor,
  paletteWarnings,
} from '@udyamflow/tokens';
import { Input } from '@udyamflow/ui';

// Brand-editing controls shared by Settings → Branding and the onboarding
// brand step: accent presets, hex color fields, palette warnings and the
// font picker.

export type AccentPreset = {
  id: string;
  label: string;
  accent: string;
  accentSoft: string;
  accentInk: string;
};

export const ACCENT_PRESETS: AccentPreset[] = [
  {
    id: 'teal',
    label: 'Clinic teal',
    accent: '#0f766e',
    accentSoft: '#ccfbf1',
    accentInk: '#134e4a',
  },
  {
    id: 'violet',
    label: 'Tutor violet',
    accent: '#7c3aed',
    accentSoft: '#ede9fe',
    accentInk: '#4c1d95',
  },
  {
    id: 'orange',
    label: 'Sports orange',
    accent: '#ea580c',
    accentSoft: '#ffedd5',
    accentInk: '#7c2d12',
  },
  {
    id: 'blue',
    label: 'Calm blue',
    accent: '#0284c7',
    accentSoft: '#e0f2fe',
    accentInk: '#0c4a6e',
  },
  {
    id: 'rose',
    label: 'Salon rose',
    accent: '#be185d',
    accentSoft: '#fce7f3',
    accentInk: '#831843',
  },
  {
    id: 'lime',
    label: 'Fitness lime',
    accent: '#65a30d',
    accentSoft: '#ecfccb',
    accentInk: '#3f6212',
  },
];

export type Palette = { accent: string; accentSoft: string; accentInk: string };

/** Accepts "0f766e" / "#0F766E" and returns a lowercase "#0f766e"; other input unchanged. */
export function normalizeHexInput(raw: string): string {
  const v = raw.trim();
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v.toLowerCase()}`;
  if (isHexColor(v)) return v.toLowerCase();
  return v;
}

/** A new accent plus the tint/ink derived from it (when the hex is complete). */
export function paletteFromAccent(accent: string): Partial<Palette> & { accent: string } {
  return isHexColor(accent) ? { accent, ...deriveAccentPalette(accent) } : { accent };
}

export function isPresetSelected(p: AccentPreset, accent: string) {
  return p.accent.toLowerCase() === accent.toLowerCase();
}

export function PresetSwatches({
  accent,
  onPick,
  compact = false,
  presets = ACCENT_PRESETS,
}: {
  accent: string;
  onPick: (p: AccentPreset) => void;
  /** Swatch-only buttons (onboarding) instead of swatch + label. */
  compact?: boolean;
  presets?: AccentPreset[];
}) {
  return (
    <fieldset
      aria-label="Accent presets"
      className={compact ? 'min-w-0 flex flex-wrap gap-2' : 'min-w-0 grid grid-cols-3 gap-2'}
    >
      {presets.map((p) => {
        const on = isPresetSelected(p, accent);
        return compact ? (
          <button
            key={p.id}
            type="button"
            aria-pressed={on}
            aria-label={`${p.label} (${p.accent})`}
            title={p.label}
            onClick={() => onPick(p)}
            className="w-9 h-9 rounded-lg transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:hover:scale-100"
            style={{
              background: p.accent,
              boxShadow: on ? '0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-ink)' : undefined,
            }}
          />
        ) : (
          <button
            type="button"
            key={p.id}
            aria-pressed={on}
            aria-label={`${p.label} (${p.accent})`}
            onClick={() => onPick(p)}
            className="flex items-center gap-2 px-3 py-2 rounded-md border bg-surface text-left transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            style={{
              borderColor: on ? 'var(--color-ink)' : 'var(--color-border)',
              boxShadow: on ? '0 0 0 1px var(--color-ink)' : undefined,
            }}
          >
            <span className="w-4 h-4 rounded shrink-0" style={{ background: p.accent }} />
            <span className="text-xs text-ink flex-1">{p.label}</span>
            {on && (
              <span aria-hidden className="text-[11px] text-ink">
                ✓
              </span>
            )}
          </button>
        );
      })}
    </fieldset>
  );
}

export function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const valid = isHexColor(value);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <input
          type="color"
          aria-label={`${label} color picker`}
          value={valid ? value : '#000000'}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          className="w-10 h-10 rounded cursor-pointer border border-border bg-surface p-0.5 disabled:cursor-not-allowed"
        />
        <Input
          id={id}
          aria-label={`${label} hex value`}
          value={value}
          spellCheck={false}
          autoComplete="off"
          maxLength={7}
          onChange={(e) => onChange(normalizeHexInput(e.target.value))}
          className="flex-1 font-mono"
          aria-invalid={!valid}
          aria-describedby={valid ? undefined : `${id}-error`}
        />
      </div>
      {!valid && (
        <div id={`${id}-error`} className="text-[11px] text-danger">
          Use a 6-digit hex color like #0f766e.
        </div>
      )}
    </div>
  );
}

/** Live accessibility hints for a palette. Warnings never block saving. */
export function PaletteWarnings({ palette }: { palette: Palette }) {
  // Invalid hex is reported next to the offending field instead.
  if (![palette.accent, palette.accentSoft, palette.accentInk].every(isHexColor)) return null;
  const warnings = paletteWarnings(palette);
  if (warnings.length === 0) return null;
  return (
    <ul
      aria-live="polite"
      className="space-y-1.5 rounded-md border px-3 py-2 text-[12px] leading-snug"
      style={{
        borderColor: 'color-mix(in srgb, var(--color-highlight) 45%, transparent)',
        background: 'color-mix(in srgb, var(--color-highlight) 8%, var(--color-surface))',
        color: 'var(--color-ink)',
      }}
    >
      {warnings.map((w) => (
        <li key={w.message} className="flex gap-2">
          <span
            aria-hidden
            style={{
              color: w.level === 'error' ? 'var(--color-danger)' : 'var(--color-highlight)',
            }}
          >
            ▲
          </span>
          <span>
            <span className="sr-only">{w.level === 'error' ? 'Error: ' : 'Warning: '}</span>
            {w.message}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function FontPicker({
  label,
  value,
  onChange,
  options = FONT_OPTIONS,
  sample,
}: {
  label: string;
  value: FontId;
  onChange: (id: FontId) => void;
  options?: typeof FONT_OPTIONS;
  /** Optional preview text rendered in each font instead of the font name. */
  sample?: string;
}) {
  return (
    <fieldset aria-label={label} className="min-w-0 grid grid-cols-2 gap-2">
      {options.map((f) => {
        const on = value === f.id;
        return (
          <button
            key={f.id}
            type="button"
            aria-pressed={on}
            aria-label={`${f.label} — ${f.vibe}`}
            onClick={() => onChange(f.id)}
            className="px-3 py-2.5 rounded-md border bg-surface text-left transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            style={{
              borderColor: on ? 'var(--color-ink)' : 'var(--color-border)',
              boxShadow: on ? '0 0 0 1px var(--color-ink)' : undefined,
            }}
          >
            <div
              className="text-[16px] leading-tight text-ink truncate"
              style={{ fontFamily: fontStack(f.id) }}
            >
              {sample ?? f.label}
            </div>
            <div className="mt-0.5 text-[11px] text-ink-mute flex justify-between gap-2">
              <span className="truncate">{sample ? `${f.label} · ${f.vibe}` : f.vibe}</span>
              {on && <span aria-hidden>✓</span>}
            </div>
          </button>
        );
      })}
    </fieldset>
  );
}
