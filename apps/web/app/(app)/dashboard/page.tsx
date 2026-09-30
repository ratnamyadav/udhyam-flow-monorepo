'use client';

import { PROFESSIONS, type ProfessionId } from '@udyamflow/tokens';
import { useState } from 'react';
import { useActiveRole } from '@/components/app-shell/use-role';
import { addDaysYmd, formatTimeInZone } from '@/lib/timezones';
import { trpc } from '@/lib/trpc/react';

function csvCell(raw: string) {
  // Neutralise spreadsheet formulas in customer-supplied fields.
  const value = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function formatMoney(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(0)}`;
  }
}

export default function DashboardPage() {
  const settings = trpc.tenant.getSettings.useQuery();
  const resources = trpc.resource.list.useQuery();
  const locations = trpc.location.list.useQuery();
  const { organizationId } = useActiveRole();
  const orgs = trpc.auth.listOrganizations.useQuery();
  const orgSlug = orgs.data?.find((o) => o.organizationId === organizationId)?.organization.slug;

  const [pickedLocationId, setPickedLocationId] = useState<string | null>(null);
  const activeLocation =
    locations.data?.find((l) => l.id === pickedLocationId) ?? locations.data?.[0] ?? null;

  const todays = trpc.booking.listToday.useQuery(
    { locationId: activeLocation?.id },
    { enabled: !locations.isLoading },
  );
  const timezone = todays.data?.timezone ?? activeLocation?.timezone ?? 'UTC';
  const yesterdayDate = todays.data ? addDaysYmd(todays.data.date, -1) : null;
  const yesterday = trpc.booking.listToday.useQuery(
    { locationId: activeLocation?.id, date: yesterdayDate ?? undefined },
    { enabled: !!yesterdayDate },
  );
  const weekly = trpc.report.weekly.useQuery();
  const revenue = trpc.report.revenueMtd.useQuery();
  const util = trpc.report.utilization7d.useQuery();

  const profession =
    PROFESSIONS[(settings.data?.profession as ProfessionId) ?? 'doctor'] ?? PROFESSIONS.doctor;

  const todaysList = todays.data?.bookings ?? [];
  const totalToday = todaysList.length;
  const yesterdayCount = yesterday.data?.bookings.length ?? null;
  const dayDelta = yesterdayCount === null ? null : totalToday - yesterdayCount;
  const resById = new Map((resources.data ?? []).map((r) => [r.id, r]));

  const queryErrors = [
    todays.error && `Today's bookings: ${todays.error.message}`,
    weekly.error && `Weekly report: ${weekly.error.message}`,
    revenue.error && `Revenue: ${revenue.error.message}`,
    util.error && `Utilization: ${util.error.message}`,
    locations.error && `Locations: ${locations.error.message}`,
    resources.error && `Resources: ${resources.error.message}`,
  ].filter(Boolean) as string[];

  function exportCsv() {
    const header = [
      'time',
      'timezone',
      'customer',
      'email',
      'phone',
      'resource',
      'status',
      'payment',
    ];
    const rows = todaysList.map((b) => [
      formatTimeInZone(b.slotStart, timezone),
      timezone,
      b.customerName,
      b.customerEmail ?? '',
      b.customerPhone ?? '',
      resById.get(b.resourceId)?.name ?? '',
      b.status,
      b.paymentStatus,
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => csvCell(String(c))).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookings-${todays.data?.date ?? 'today'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const weekDelta = weekly.data ? weekly.data.thisWeek - weekly.data.lastWeek : 0;
  const utilPct =
    util.data && util.data.available > 0
      ? Math.round((util.data.booked / util.data.available) * 100)
      : null;

  const revenueLabel = (() => {
    const totals = revenue.data ?? [];
    if (totals.length === 0) return '—';
    // Show the largest currency as the headline; secondary currencies fold
    // into the delta line below.
    const primary = totals.reduce((a, b) => (a.cents >= b.cents ? a : b));
    return formatMoney(primary.cents, primary.currency);
  })();

  const metrics = [
    {
      label: profession.metricLabels[0],
      value: todays.error ? '!' : todays.data ? String(totalToday) : '—',
      delta: dayDelta === null ? '' : `${dayDelta >= 0 ? '+' : ''}${dayDelta} vs yesterday`,
    },
    {
      label: profession.metricLabels[1],
      value: weekly.error ? '!' : weekly.data ? String(weekly.data.thisWeek) : '—',
      delta:
        weekly.data && weekly.data.lastWeek > 0
          ? `${weekDelta >= 0 ? '+' : ''}${weekDelta} vs last week`
          : 'no prior week',
    },
    {
      label: 'Revenue MTD',
      value: revenue.error ? '!' : revenueLabel,
      delta:
        (revenue.data ?? []).length > 1 ? `+ ${revenue.data!.length - 1} other currencies` : '',
    },
    {
      label: 'Utilization 7d',
      value: util.error ? '!' : utilPct === null ? '—' : `${utilPct}%`,
      delta: util.data ? `${Math.round(util.data.booked / 60)} hr booked` : '',
    },
  ];

  return (
    <div className="px-12 py-10 max-w-[1280px] mx-auto">
      <div className="flex items-end justify-between mb-7">
        <div>
          <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-2 font-mono">
            {(locations.data?.length ?? 0) > 1 ? (
              <select
                aria-label="Location"
                className="bg-transparent uppercase tracking-wider font-mono text-ink-soft"
                value={activeLocation?.id ?? ''}
                onChange={(e) => setPickedLocationId(e.target.value)}
              >
                {locations.data?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            ) : (
              (activeLocation?.name ?? (locations.isLoading ? 'Loading…' : 'No location'))
            )}{' '}
            · {timezone}
          </div>
          <h1 className="text-[32px] font-medium tracking-tight text-ink">
            {(todays.data
              ? new Date(`${todays.data.date}T12:00:00.000Z`)
              : new Date()
            ).toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              timeZone: todays.data ? 'UTC' : timezone,
            })}
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={todaysList.length === 0}
            className="px-3.5 py-2 rounded-md text-[13px] font-medium border border-border bg-surface text-ink disabled:opacity-50"
          >
            Export
          </button>
          {orgSlug && (
            <a
              href={`/book/${orgSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-md text-[13px] font-medium text-white"
              style={{ background: 'var(--accent)' }}
            >
              + New booking
            </a>
          )}
        </div>
      </div>

      {queryErrors.length > 0 && (
        <div className="mb-6 text-[12px] text-danger bg-danger/10 border border-danger/20 rounded-md px-3 py-2">
          Some data couldn't be loaded — figures marked “!” are unavailable.
          <ul className="mt-1 list-disc pl-5">
            {queryErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

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
          {todays.error ? (
            <div className="p-12 text-center text-[13px] text-danger">
              Couldn't load today's bookings.
            </div>
          ) : todaysList.length === 0 ? (
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
                    {formatTimeInZone(b.slotStart, timezone)}
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
                    {b.status.replace('_', ' ')}
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
