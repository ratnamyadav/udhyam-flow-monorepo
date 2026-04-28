'use client';

import { PROFESSIONS, type ProfessionId } from '@udyamflow/tokens';
import { trpc } from '@/lib/trpc/react';

export default function DashboardPage() {
  const settings = trpc.tenant.getSettings.useQuery();
  const resources = trpc.resource.list.useQuery();
  const locations = trpc.location.list.useQuery();
  const todays = trpc.booking.listToday.useQuery();

  const profession =
    PROFESSIONS[(settings.data?.profession as ProfessionId) ?? 'doctor'] ?? PROFESSIONS.doctor;

  const todaysList = todays.data ?? [];
  const totalToday = todaysList.length;

  const metrics = [
    { label: profession.metricLabels[0], value: String(totalToday), delta: '+0' },
    { label: profession.metricLabels[1], value: '0', delta: '−0' },
    { label: profession.metricLabels[2], value: '—', delta: '' },
    { label: profession.metricLabels[3], value: '—', delta: '' },
  ];

  const activeLocation = locations.data?.[0];

  return (
    <div className="px-12 py-10 max-w-[1280px] mx-auto">
      <div className="flex items-end justify-between mb-7">
        <div>
          <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-2 font-mono">
            {activeLocation?.name ?? (locations.isLoading ? 'Loading…' : 'No location')}
          </div>
          <h1 className="text-[32px] font-medium tracking-tight text-ink">
            {new Date().toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="px-3.5 py-2 rounded-md text-[13px] font-medium border border-border bg-surface text-ink"
          >
            Export
          </button>
          <button
            type="button"
            className="px-3.5 py-2 rounded-md text-[13px] font-medium text-white"
            style={{ background: 'var(--accent)' }}
          >
            + New booking
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-9">
        {metrics.map((m) => (
          <div key={m.label} className="bg-surface border border-border rounded-xl p-5">
            <div className="text-[11px] uppercase tracking-wider text-ink-soft font-mono">
              {m.label}
            </div>
            <div className="text-[32px] font-medium text-ink mt-1.5 leading-none font-mono tabular-nums">
              {m.value}
            </div>
            <div className="text-[12px] text-ink-mute mt-2">{m.delta || '—'}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_400px] gap-6">
        <div className="bg-surface border border-border rounded-xl">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div className="text-[14px] font-medium text-ink">Today's bookings</div>
            <div className="text-[11px] text-ink-soft font-mono">
              {todays.isLoading
                ? 'loading…'
                : `${totalToday} ${profession.slotLabel.toLowerCase()}s`}
            </div>
          </div>
          {todaysList.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-[14px] text-ink mb-1.5">No bookings yet today</div>
              <div className="text-[12px] text-ink-mute max-w-[320px] mx-auto">
                Share your booking page with customers — bookings will appear here in real time.
              </div>
            </div>
          ) : (
            <div>
              {todaysList.map((b) => (
                <div
                  key={b.id}
                  className="grid grid-cols-[80px_1fr_auto] items-center gap-4 px-5 py-3.5 border-t border-border first:border-t-0 hover:bg-surface-mute"
                >
                  <div className="text-[13px] font-mono tabular-nums text-ink-mute">
                    {new Date(b.slotStart).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })}
                  </div>
                  <div>
                    <div className="text-[14px] font-medium text-ink">{b.customerName}</div>
                    <div className="text-[12px] text-ink-mute">
                      {b.customerEmail ?? b.customerPhone ?? '—'}
                    </div>
                  </div>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded font-medium uppercase tracking-wider"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}
                  >
                    {b.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="text-[11px] uppercase tracking-wider text-ink-soft font-mono mb-3">
              {profession.resourcePlural} ({resources.data?.length ?? 0})
            </div>
            {resources.isLoading ? (
              <div className="text-[12px] text-ink-mute">Loading…</div>
            ) : resources.data && resources.data.length > 0 ? (
              <div className="space-y-2.5">
                {resources.data.map((r) => (
                  <div key={r.id} className="flex items-center gap-2.5">
                    <div
                      className="w-7 h-7 grid place-items-center text-white text-[10px] font-semibold"
                      style={{ background: 'var(--accent)', borderRadius: 6 }}
                    >
                      {r.avatar ?? r.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="text-[13px] font-medium text-ink">{r.name}</div>
                      <div className="text-[11px] text-ink-mute">{r.title ?? ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[12px] text-ink-mute">
                Add {profession.resourcePlural.toLowerCase()} from Settings to start taking
                bookings.
              </div>
            )}
          </div>

          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="text-[11px] uppercase tracking-wider text-ink-soft font-mono mb-3">
              Locations ({locations.data?.length ?? 0})
            </div>
            {locations.data?.length ? (
              <div className="space-y-2">
                {locations.data.map((l) => (
                  <div key={l.id} className="flex items-center justify-between">
                    <div>
                      <div className="text-[13px] font-medium text-ink">{l.name}</div>
                      <div className="text-[11px] text-ink-mute font-mono">{l.timezone}</div>
                    </div>
                    <div className="text-[11px] text-ink-soft font-mono">{l.currency}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[12px] text-ink-mute">No locations yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
