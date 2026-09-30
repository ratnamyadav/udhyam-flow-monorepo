'use client';

import type { TenantTheme } from '@udyamflow/tokens';

// Confirmation card shown after a successful booking.create. Mirrors the
// tenant theme so the moment of "you're booked" still feels on-brand.
export function BookingSuccess({
  theme,
  referenceCode,
  customerName,
  displayTime,
  timezone,
  resourceName,
  meetingUrl,
}: {
  theme: TenantTheme;
  referenceCode: string;
  customerName: string;
  displayTime: string;
  timezone: string;
  resourceName: string;
  // Online sessions only — Meet / Zoom / Jitsi join link.
  meetingUrl?: string | null;
}) {
  return (
    <div className="max-w-[460px] mx-auto">
      <div
        className="w-12 h-12 grid place-items-center text-white text-xl font-semibold mb-5"
        style={{ background: theme.accent, borderRadius: theme.radius }}
        aria-hidden
      >
        ✓
      </div>
      <h1
        className="text-[28px] m-0 font-medium tracking-tight text-ink"
        style={{ fontFamily: theme.fontDisplay, lineHeight: 1.15 }}
      >
        You're booked, {customerName.split(' ')[0]}.
      </h1>
      <p className="text-[14px] text-ink-mute mt-3 leading-relaxed">
        We've reserved <strong className="text-ink">{displayTime}</strong> with {resourceName}. A
        confirmation will arrive in your inbox shortly.
      </p>
      <div
        className="mt-7 px-5 py-4 border border-border rounded-xl flex items-center justify-between"
        style={{ background: 'var(--color-surface)' }}
      >
        <div>
          <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-1">
            Reference
          </div>
          <div className="text-[16px] font-mono tabular-nums text-ink">{referenceCode}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-1">
            Timezone
          </div>
          <div className="text-[12px] font-mono text-ink-mute">{timezone}</div>
        </div>
      </div>
      {meetingUrl && (
        <div
          className="mt-3 px-5 py-4 border border-border rounded-xl"
          style={{ background: 'var(--color-surface)' }}
        >
          <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-1">
            Online session
          </div>
          <a
            href={meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] font-mono break-all underline"
            style={{ color: theme.accentInk }}
          >
            {meetingUrl}
          </a>
          <div className="text-[12px] text-ink-mute mt-1">
            Save this link — you'll join from it at your appointment time.
          </div>
        </div>
      )}
    </div>
  );
}
