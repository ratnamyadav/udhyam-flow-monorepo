'use client';

import { Button, Input, Label } from '@udyamflow/ui';
import Link from 'next/link';
import { useState } from 'react';
import { ymdInZone } from '@/lib/timezones';
import { trpc } from '@/lib/trpc/react';

const SELECT_CLASS =
  'w-full text-[13px] bg-surface border border-border rounded-md px-2.5 py-1.5 text-ink';

function when(start: Date, end: Date, tz: string) {
  const fmt = (d: Date, withTime: boolean) =>
    d.toLocaleString([], {
      timeZone: tz,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
    });
  // Whole days are stored as local midnight → midnight; show them as dates.
  const midnight = (d: Date) =>
    d.toLocaleTimeString('en-GB', { timeZone: tz, hour12: false }).startsWith('00:00');
  if (midnight(start) && midnight(end)) {
    const last = new Date(end.getTime() - 1);
    const a = fmt(start, false);
    const b = fmt(last, false);
    return a === b ? `${a} · all day` : `${a} – ${b}`;
  }
  return `${fmt(start, true)} – ${fmt(end, true)}`;
}

type Conflict = { id: string; customerName: string; slotStart: Date; resourceName: string };

export default function TimeOffPage() {
  const utils = trpc.useUtils();
  const list = trpc.timeOff.list.useQuery();
  const resources = trpc.resource.list.useQuery();
  const locations = trpc.location.list.useQuery();

  const [who, setWho] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [partDay, setPartDay] = useState(false);
  const [startTime, setStartTime] = useState('13:00');
  const [endTime, setEndTime] = useState('14:00');
  const [reason, setReason] = useState('');
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);

  // "loc:<id>" = everyone at a location, "res:<id>" = one resource.
  const options = [
    ...(locations.data ?? []).map((l) => ({
      value: `loc:${l.id}`,
      label: locations.data!.length > 1 ? `Everyone at ${l.name}` : 'Everyone',
    })),
    ...(resources.data ?? []).map((r) => ({ value: `res:${r.id}`, label: r.name })),
  ];
  const selected = who || options[0]?.value || '';
  const today = ymdInZone(new Date(), locations.data?.[0]?.timezone ?? 'UTC');

  const add = trpc.timeOff.add.useMutation({
    onSuccess: async (res) => {
      await utils.timeOff.list.invalidate();
      await utils.booking.invalidate();
      setConflicts(res.conflicts);
      setReason('');
    },
  });
  const remove = trpc.timeOff.remove.useMutation({
    onSuccess: () => utils.timeOff.list.invalidate(),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const [kind, id] = selected.split(':');
    add.mutate({
      locationId: kind === 'loc' ? id : undefined,
      resourceId: kind === 'res' ? id : undefined,
      startDate: startDate || today,
      endDate: endDate || undefined,
      startTime: partDay ? startTime : undefined,
      endTime: partDay ? endTime : undefined,
      reason: reason.trim() || undefined,
    });
  }

  return (
    <div className="px-12 py-10 max-w-[1100px] mx-auto">
      <div className="mb-8">
        <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-2 font-mono">
          Settings · Time off
        </div>
        <h1 className="text-[32px] font-medium tracking-tight text-ink">Time off & holidays</h1>
        <p className="text-[13px] text-ink-mute mt-2 max-w-[560px]">
          Blocked time disappears from your booking page. Bookings you already have stay put — we'll
          list them so you can move or cancel them.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] gap-6">
        <div className="bg-surface border border-border rounded-xl h-fit">
          <div className="px-5 py-3 border-b border-border text-[10px] uppercase tracking-wider text-ink-soft font-mono">
            Upcoming
          </div>
          {list.isLoading ? (
            <div className="p-8 text-center text-[13px] text-ink-mute">Loading…</div>
          ) : list.error ? (
            <div className="p-8 text-center text-[13px] text-danger">{list.error.message}</div>
          ) : !list.data?.length ? (
            <div className="p-12 text-center text-[13px] text-ink-mute">
              Nothing blocked. Add a holiday or a break on the right.
            </div>
          ) : (
            list.data.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-4 px-5 py-3.5 border-t border-border first:border-t-0"
              >
                <div>
                  <div className="text-[14px] font-medium text-ink">
                    {t.resourceName ?? `Everyone at ${t.locationName}`}
                  </div>
                  <div className="text-[12px] text-ink-mute">
                    {when(t.startsAt, t.endsAt, t.timezone)}
                    {t.reason ? ` · ${t.reason}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className="text-[12px] text-ink-mute hover:text-danger"
                  onClick={() => remove.mutate({ id: t.id })}
                  disabled={remove.isPending}
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>

        <form
          onSubmit={submit}
          className="bg-surface border border-border rounded-xl p-5 space-y-3 h-fit"
        >
          <div className="text-[11px] uppercase tracking-wider text-ink-soft font-mono">
            Block time
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to-who">Who</Label>
            <select
              id="to-who"
              className={SELECT_CLASS}
              value={selected}
              onChange={(e) => setWho(e.target.value)}
            >
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="to-start">From</Label>
              <Input
                id="to-start"
                type="date"
                value={startDate || today}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to-end">To (optional)</Label>
              <Input
                id="to-end"
                type="date"
                value={endDate}
                min={startDate || today}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-[12px] text-ink">
            <input
              type="checkbox"
              checked={partDay}
              onChange={(e) => setPartDay(e.target.checked)}
            />
            Only part of the day
          </label>
          {partDay && (
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="time"
                aria-label="Start time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
              <Input
                type="time"
                aria-label="End time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="to-reason">Reason (optional)</Label>
            <Input
              id="to-reason"
              placeholder="Diwali, leave, lunch…"
              value={reason}
              maxLength={200}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {add.error && <div className="text-[12px] text-danger">{add.error.message}</div>}
          <Button type="submit" size="sm" disabled={!selected || add.isPending}>
            {add.isPending ? 'Saving…' : 'Block time'}
          </Button>
          {conflicts &&
            (conflicts.length === 0 ? (
              <div className="text-[12px] text-success">Blocked. No bookings were affected.</div>
            ) : (
              <div className="text-[12px] text-ink bg-surface-mute rounded-md p-3 space-y-1">
                <div className="font-medium">
                  {conflicts.length} existing booking{conflicts.length > 1 ? 's' : ''} in this time:
                </div>
                {conflicts.map((c) => (
                  <div key={c.id} className="text-ink-mute">
                    {c.customerName} · {c.resourceName} · {c.slotStart.toLocaleString()}
                  </div>
                ))}
                <Link href="/bookings" className="underline">
                  Move or cancel them in Bookings
                </Link>
              </div>
            ))}
        </form>
      </div>
    </div>
  );
}
