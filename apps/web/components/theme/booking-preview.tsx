'use client';

import { fontStack, isHexColor, type Profession, readableTextOn } from '@udyamflow/tokens';
import type { BookingLayout } from '@/lib/booking-copy';
import type { Palette } from './brand-controls';

// Live miniature of the public booking page (app/book/[orgSlug]) used by
// Settings → Branding: same CSS vars, fonts, density, copy and layout choice.

export type PreviewBrand = Palette & {
  logoText: string;
  radius: number;
  density: 'compact' | 'comfortable';
  fontDisplay: string;
  fontUi: string;
  bookingLayout: BookingLayout;
};

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'UF'
  );
}

export function LogoBadge({
  size,
  logoUrl,
  text,
  accent,
  radius,
}: {
  size: number;
  logoUrl: string | null;
  text: string;
  accent: string;
  radius: number;
}) {
  return (
    <div
      className="grid place-items-center font-semibold overflow-hidden shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.3),
        background: logoUrl ? 'var(--color-surface)' : accent,
        color: readableTextOn(accent),
        borderRadius: radius,
        border: logoUrl ? '1px solid var(--color-border)' : undefined,
      }}
    >
      {logoUrl ? (
        // Tenant logos live on external object storage, not local assets.
        <img src={logoUrl} alt="Your logo" className="w-full h-full object-contain" />
      ) : (
        <span aria-hidden>{text}</span>
      )}
    </div>
  );
}

export function BookingPreview({
  draft,
  fallback,
  logoUrl,
  orgName,
  locationName,
  resources,
  headline,
  intro,
  customHeadline,
  customIntro,
  profession,
  mobile,
}: {
  draft: PreviewBrand;
  fallback: Palette;
  logoUrl: string | null;
  orgName: string;
  locationName: string | null;
  resources: { name: string; title: string | null }[];
  headline: string;
  intro: string;
  customHeadline: boolean;
  customIntro: boolean;
  profession: Profession;
  mobile: boolean;
}) {
  // While a hex is half-typed, keep previewing the last valid color.
  const hex = (v: string, fb: string) => (isHexColor(v) ? v : isHexColor(fb) ? fb : '#1a1815');
  const accent = hex(draft.accent, fallback.accent);
  const accentSoft = hex(draft.accentSoft, fallback.accentSoft);
  const accentInk = hex(draft.accentInk, fallback.accentInk);
  const vars = {
    '--accent': accent,
    '--accent-soft': accentSoft,
    '--accent-ink': accentInk,
    '--accent-fg': readableTextOn(accent),
    '--radius': `${draft.radius}px`,
    '--font-display': fontStack(draft.fontDisplay),
    '--font-ui': fontStack(draft.fontUi),
    fontFamily: 'var(--font-ui)',
  } as React.CSSProperties;

  const people =
    resources.length > 0
      ? resources
      : profession.sampleResources.slice(0, 3).map((r) => ({ name: r.name, title: r.title }));
  const slots = profession.sampleSlots.slice(0, mobile ? 6 : 8);
  const layout: BookingLayout = mobile ? 'stacked' : draft.bookingLayout;

  const Header = (
    <div className="flex items-center gap-2.5 min-w-0">
      <LogoBadge
        size={36}
        logoUrl={logoUrl}
        text={draft.logoText || initials(orgName)}
        accent={accent}
        radius={draft.radius}
      />
      <div className="min-w-0">
        <div
          className="text-[14px] font-semibold text-ink truncate"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {orgName}
        </div>
        <div className="text-[11px] text-ink-mute truncate">
          {locationName ?? 'Your first location'}
        </div>
      </div>
    </div>
  );

  const Title = (
    <div
      className="font-medium tracking-tight text-ink break-words"
      style={{
        fontFamily: 'var(--font-display)',
        fontSize: mobile ? 22 : 26,
        lineHeight: 1.15,
      }}
    >
      {headline}
    </div>
  );
  const Intro = (color?: string) => (
    <p
      className="text-[13px] mt-2 leading-relaxed whitespace-pre-line break-words"
      style={{ color: color ?? 'var(--color-ink-mute)' }}
    >
      {intro}
    </p>
  );

  const slotGrid = (cols: number) => (
    <div
      className="grid"
      style={{ gap: 'var(--gap)', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {slots.map((s, i) => (
        <div
          key={s}
          className="grid place-items-center text-[12px] font-medium border tabular-nums"
          style={{
            minHeight: 'var(--row-h)',
            borderRadius: 'var(--radius)',
            borderColor: i === 1 ? 'var(--accent)' : 'var(--color-border)',
            background: i === 1 ? 'var(--accent)' : 'var(--color-surface)',
            color: i === 1 ? 'var(--accent-fg)' : 'var(--color-ink)',
          }}
        >
          {s}
        </div>
      ))}
    </div>
  );

  const Confirm = (
    <div
      className="mt-4 inline-block px-5 py-2.5 text-[13px] font-medium"
      style={{
        background: 'var(--accent)',
        color: 'var(--accent-fg)',
        borderRadius: 'var(--radius)',
      }}
    >
      Confirm {slots[1]}
    </div>
  );

  const People = (
    <div className="flex flex-col" style={{ gap: 'var(--gap)' }}>
      {people.map((p, i) => (
        <div
          key={`${p.name}-${i}`}
          className="flex items-center gap-2 rounded-md border"
          style={{
            padding: 'calc(var(--pad) - 6px) calc(var(--pad) - 4px)',
            borderColor:
              i === 0 ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'transparent',
            background: i === 0 ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : undefined,
          }}
        >
          <div
            className="w-6 h-6 grid place-items-center text-[9px] font-semibold shrink-0"
            style={{
              background: i === 0 ? 'var(--accent)' : 'var(--color-surface-mute)',
              color: i === 0 ? 'var(--accent-fg)' : 'var(--color-ink-mute)',
              borderRadius: 'calc(var(--radius) - 2px)',
            }}
          >
            {initials(p.name)}
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-ink truncate">{p.name}</div>
            {p.title && <div className="text-[10px] text-ink-mute truncate">{p.title}</div>}
          </div>
        </div>
      ))}
    </div>
  );

  let body: React.ReactNode;
  if (layout === 'sidebar') {
    body = (
      <div className="grid grid-cols-[34%_1fr] min-h-[420px]">
        <div className="border-r border-border bg-surface" style={{ padding: 'var(--pad-lg)' }}>
          {Header}
          <div className="mt-5 text-[9px] uppercase tracking-wider text-ink-soft font-mono mb-2">
            {profession.resourcePlural}
          </div>
          {People}
        </div>
        <div style={{ padding: 'var(--pad-lg)' }}>
          {Title}
          {Intro()}
          <div className="mt-5">{slotGrid(4)}</div>
          {Confirm}
        </div>
      </div>
    );
  } else if (layout === 'stacked') {
    body = (
      <div style={{ padding: mobile ? 12 : 'var(--pad-lg)' }}>
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div style={{ background: 'var(--accent-soft)', padding: 'var(--pad-lg)' }}>
            {Header}
            <div className="mt-4">{Title}</div>
            {Intro('var(--accent-ink)')}
          </div>
          <div style={{ padding: 'var(--pad-lg)' }}>
            {mobile && (
              <div className="mb-4">
                <div className="text-[9px] uppercase tracking-wider text-ink-soft font-mono mb-2">
                  {profession.resourcePlural}
                </div>
                {People}
              </div>
            )}
            {slotGrid(mobile ? 3 : 4)}
            {Confirm}
          </div>
        </div>
      </div>
    );
  } else {
    const cols = ['Today', 'Tue', 'Wed', 'Thu'];
    body = (
      <div style={{ padding: 'var(--pad-lg)' }}>
        <div className="mb-5">{Header}</div>
        {(customHeadline || customIntro) && (
          <div className="mb-5">
            {customHeadline && Title}
            {customIntro && Intro()}
          </div>
        )}
        <div
          className="bg-surface border border-border rounded-xl"
          style={{ padding: 'var(--pad-lg)' }}
        >
          <div className="grid grid-cols-4" style={{ gap: 'var(--gap)' }}>
            {cols.map((c, ci) => (
              <div key={c} className="flex flex-col" style={{ gap: 'var(--gap)' }}>
                <div className="text-[11px] font-medium text-ink">{c}</div>
                {slots.slice(ci, ci + 3).map((s, si) => {
                  const on = ci === 0 && si === 1;
                  return (
                    <div
                      key={s}
                      className="grid place-items-center text-[12px] font-medium border tabular-nums"
                      style={{
                        minHeight: 'var(--row-h)',
                        borderRadius: 'var(--radius)',
                        borderColor: on ? 'var(--accent)' : 'var(--color-border)',
                        background: on ? 'var(--accent)' : 'var(--color-surface)',
                        color: on ? 'var(--accent-fg)' : 'var(--color-ink)',
                      }}
                    >
                      {s}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {Confirm}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface-mute p-4 overflow-hidden">
      <div
        data-density={draft.density}
        className="mx-auto bg-bg border border-border rounded-xl overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,.05)] transition-[max-width] duration-300"
        style={{
          ...vars,
          maxWidth: mobile ? 375 : '100%',
          // Section padding scales with density (not one of the shared vars).
          ['--pad-lg' as string]: draft.density === 'compact' ? '16px' : '24px',
        }}
      >
        {body}
      </div>
    </div>
  );
}
