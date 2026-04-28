'use client';

import {
  PROFESSIONS,
  type ProfessionId,
  type TenantTheme,
  tenantThemeStyle,
} from '@udyamflow/tokens';
import { useState } from 'react';

type Layout = 'sidebar' | 'stacked' | 'inline';

export type BookingResource = {
  id: string;
  name: string;
  title: string | null;
  avatar: string | null;
};

export function BookingInterface({
  theme,
  resources,
  slots,
  layout,
}: {
  theme: TenantTheme;
  resources: BookingResource[];
  slots: string[];
  layout: Layout;
}) {
  const profession = PROFESSIONS[theme.profession as ProfessionId] ?? PROFESSIONS.doctor;
  const [resourceIdx, setResourceIdx] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(slots[0] ?? null);
  const resource = resources[resourceIdx] ?? null;

  const styleVars = tenantThemeStyle(theme);

  const Header = (
    <div className="flex items-center gap-2.5">
      <div
        className="w-10 h-10 grid place-items-center text-white text-sm font-semibold"
        style={{ background: theme.accent, borderRadius: theme.radius }}
      >
        {theme.logo}
      </div>
      <div>
        <div
          className="text-[15px] font-semibold text-ink"
          style={{ fontFamily: theme.fontDisplay }}
        >
          {theme.name}
        </div>
        <div className="text-[12px] text-ink-mute">{theme.location || profession.name}</div>
      </div>
    </div>
  );

  const Resources =
    resources.length > 0 ? (
      <div className="space-y-2">
        {resources.map((r, i) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setResourceIdx(i)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-colors text-left"
            style={{
              background: i === resourceIdx ? `${theme.accent}10` : 'transparent',
              border: i === resourceIdx ? `1px solid ${theme.accent}40` : '1px solid transparent',
            }}
          >
            <div
              className="w-8 h-8 grid place-items-center text-[11px] font-semibold"
              style={{
                background: i === resourceIdx ? theme.accent : 'var(--color-surface-mute)',
                color: i === resourceIdx ? '#fff' : 'var(--color-ink-mute)',
                borderRadius: 'calc(var(--radius) - 2px)',
              }}
            >
              {r.avatar ?? r.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="text-[13px] font-medium text-ink">{r.name}</div>
              <div className="text-[11px] text-ink-mute">{r.title ?? ''}</div>
            </div>
          </button>
        ))}
      </div>
    ) : (
      <div className="text-[12px] text-ink-mute">
        No {profession.resourcePlural.toLowerCase()} yet.
      </div>
    );

  const Slots = (
    <div className="grid grid-cols-4 gap-2">
      {slots.map((s) => {
        const sel = s === selectedSlot;
        return (
          <button
            key={s}
            type="button"
            onClick={() => setSelectedSlot(s)}
            className="py-2 text-[13px] font-medium border transition-colors"
            style={{
              borderRadius: theme.radius,
              borderColor: sel ? theme.accent : 'var(--color-border)',
              color: sel ? '#fff' : 'var(--color-ink)',
              background: sel ? theme.accent : 'var(--color-surface)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {s}
          </button>
        );
      })}
    </div>
  );

  const HeroTitle = (
    <h1
      className="text-[28px] m-0 font-medium tracking-tight text-ink"
      style={{ fontFamily: theme.fontDisplay, lineHeight: 1.15 }}
    >
      Book a {profession.slotLabel.toLowerCase()}
      {resource ? ` with ${resource.name.split(' ')[0]}` : ''}
    </h1>
  );

  if (layout === 'sidebar') {
    return (
      <div className="grid grid-cols-[360px_1fr] min-h-[860px] bg-bg" style={styleVars}>
        <aside className="p-8 border-r border-border bg-surface">
          {Header}
          <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mt-7 mb-3">
            {profession.resourcePlural}
          </div>
          {Resources}
          <div className="border-t border-border my-7" />
          <div className="text-[12px] text-ink-mute leading-relaxed">
            {profession.slotLabel}s last <strong>{profession.slotDuration} minutes</strong>. Cancel
            anytime up to 24h before.
          </div>
        </aside>
        <main className="p-12">
          <div className="max-w-[640px]">
            {HeroTitle}
            <p className="text-[14px] text-ink-mute mt-3 max-w-[460px] leading-relaxed">
              {resource?.title ?? profession.name}. Pick a slot below — we'll email a confirmation.
            </p>
            <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mt-9 mb-3">
              Today
            </div>
            {Slots}
            <button
              type="button"
              className="mt-8 px-6 py-3 text-white text-sm font-medium"
              style={{ background: theme.accent, borderRadius: theme.radius }}
            >
              Confirm {selectedSlot ?? '—'}
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (layout === 'stacked') {
    return (
      <div className="bg-bg p-12 min-h-[860px]" style={styleVars}>
        <div className="max-w-[760px] mx-auto">
          <div className="bg-surface border border-border rounded-2xl overflow-hidden">
            <div
              className="px-8 py-7"
              style={{ background: theme.accentSoft, color: theme.accentInk }}
            >
              {Header}
              <div className="mt-5">{HeroTitle}</div>
              <p className="text-[14px] mt-3" style={{ color: theme.accentInk }}>
                {resource?.title ?? profession.name} · {profession.slotDuration} minutes
              </p>
            </div>
            <div className="p-8">
              <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-3">
                {profession.resourcePlural}
              </div>
              <div className="grid grid-cols-3 gap-2 mb-7">
                {resources.map((r, i) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setResourceIdx(i)}
                    className="border rounded-lg px-3 py-2.5 text-left"
                    style={{
                      borderColor: i === resourceIdx ? theme.accent : 'var(--color-border)',
                      background: i === resourceIdx ? `${theme.accent}08` : 'var(--color-surface)',
                    }}
                  >
                    <div className="text-[13px] font-medium text-ink">{r.name}</div>
                    <div className="text-[11px] text-ink-mute">{r.title ?? ''}</div>
                  </button>
                ))}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-3">
                Available slots
              </div>
              {Slots}
              <button
                type="button"
                className="mt-7 w-full py-3 text-white text-sm font-medium"
                style={{ background: theme.accent, borderRadius: theme.radius }}
              >
                Confirm {selectedSlot ?? '—'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Inline week layout
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  return (
    <div className="bg-bg p-10 min-h-[860px]" style={styleVars}>
      <div className="max-w-[1100px] mx-auto">
        <div className="flex justify-between items-start mb-8">
          {Header}
          <div className="flex gap-1.5">
            <button type="button" className="w-8 h-8 rounded-md border border-border text-ink-mute">
              ‹
            </button>
            <button type="button" className="w-8 h-8 rounded-md border border-border text-ink-mute">
              ›
            </button>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div
            className="grid"
            style={{ gridTemplateColumns: `200px repeat(${days.length}, 1fr)` }}
          >
            <div className="px-4 py-3 text-[10px] uppercase tracking-wider text-ink-soft font-mono bg-surface-mute border-r border-border">
              Resource
            </div>
            {days.map((d) => (
              <div
                key={d}
                className="px-4 py-3 text-[12px] font-medium text-ink bg-surface-mute border-r border-border last:border-r-0 text-center"
              >
                {d}
              </div>
            ))}
            {resources.map((r) => (
              <ResourceRow
                key={r.id}
                resource={r}
                slots={slots}
                accent={theme.accent}
                radius={theme.radius}
                cols={days.length}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResourceRow({
  resource,
  slots,
  accent,
  radius,
  cols,
}: {
  resource: BookingResource;
  slots: string[];
  accent: string;
  radius: number;
  cols: number;
}) {
  return (
    <>
      <div className="px-4 py-3 border-t border-border border-r flex items-center gap-2.5">
        <div
          className="w-7 h-7 grid place-items-center text-white text-[10px] font-semibold"
          style={{ background: accent, borderRadius: radius }}
        >
          {resource.avatar ?? resource.name.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="text-[13px] font-medium text-ink leading-tight">{resource.name}</div>
          <div className="text-[11px] text-ink-mute">{resource.title ?? ''}</div>
        </div>
      </div>
      {Array.from({ length: cols }).map((_, i) => (
        <div
          key={i}
          className="px-2 py-2 border-t border-border border-r last:border-r-0 flex flex-col gap-1"
        >
          {slots.slice(0, 2).map((s, j) => {
            const filled = (i + j) % 3 === 0;
            return (
              <button
                key={s}
                type="button"
                className="text-[11px] py-1 border font-mono"
                style={{
                  borderRadius: radius - 2,
                  borderColor: filled ? accent : 'var(--color-border)',
                  background: filled ? `${accent}10` : 'transparent',
                  color: filled ? accent : 'var(--color-ink-mute)',
                }}
              >
                {s}
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}
