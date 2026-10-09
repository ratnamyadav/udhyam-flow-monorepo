'use client';

import { Button, Input, Label } from '@udyamflow/ui';
import { useState } from 'react';
import { ymdInZone } from '@/lib/timezones';
import { trpc } from '@/lib/trpc/react';

const SELECT_CLASS =
  'w-full text-[13px] bg-surface border border-border rounded-md px-2.5 py-1.5 text-ink';

// Free slots for one resource on a date, plus "any other time" — staff may
// book off the grid as long as nothing overlaps (the server checks).
function TimePicker(props: {
  resourceId: string;
  serviceId?: string;
  date: string;
  value: string;
  onChange: (hhmm: string) => void;
}) {
  const open = trpc.booking.openSlots.useQuery(
    { date: props.date, resourceId: props.resourceId, serviceId: props.serviceId },
    { enabled: !!props.resourceId && !!props.date },
  );
  const slots = open.data?.resources[0]?.slots ?? [];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {open.isLoading ? (
          <span className="text-[12px] text-ink-mute">Loading free times…</span>
        ) : slots.length === 0 ? (
          <span className="text-[12px] text-ink-mute">No free slots in working hours.</span>
        ) : (
          slots.map((s) => (
            <button
              key={s.start}
              type="button"
              onClick={() => props.onChange(s.displayTime)}
              className={`text-[12px] font-mono px-2 py-1 rounded border ${
                props.value === s.displayTime
                  ? 'bg-ink text-bg border-ink'
                  : 'border-border text-ink hover:bg-surface-mute'
              }`}
            >
              {s.displayTime}
            </button>
          ))
        )}
      </div>
      <label className="flex items-center gap-2 text-[12px] text-ink-mute">
        Other time
        <input
          type="time"
          className="text-[13px] bg-surface border border-border rounded-md px-2 py-1 text-ink"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
        />
      </label>
    </div>
  );
}

export function StaffBookingForm({ onDone }: { onDone: (msg: string) => void }) {
  const utils = trpc.useUtils();
  const resources = trpc.resource.list.useQuery();
  const services = trpc.service.list.useQuery();
  const locations = trpc.location.list.useQuery();

  const [serviceId, setServiceId] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notify, setNotify] = useState(true);

  const service = services.data?.find((s) => s.id === serviceId);
  // A service with no linked resources is offered by everyone.
  const eligible = (resources.data ?? []).filter(
    (r) => !service || service.resourceIds.length === 0 || service.resourceIds.includes(r.id),
  );
  const resource = eligible.find((r) => r.id === resourceId) ?? eligible[0];
  const tz = locations.data?.find((l) => l.id === resource?.locationId)?.timezone ?? 'UTC';
  const day = date || ymdInZone(new Date(), tz);

  const create = trpc.booking.createByStaff.useMutation({
    onSuccess: async (res) => {
      await utils.booking.invalidate();
      onDone(`Booked ${name.trim()} with ${res.resourceName} · ref ${res.referenceCode}`);
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!resource || !time) return;
    create.mutate({
      resourceId: resource.id,
      serviceId: serviceId || undefined,
      date: day,
      time,
      customerName: name,
      customerPhone: phone.trim() || undefined,
      customerEmail: email.trim() || undefined,
      notifyCustomer: notify,
    });
  }

  if (resources.data && resources.data.length === 0) {
    return (
      <div className="text-[13px] text-ink-mute">
        Add a staff member or resource in Settings → Resources first.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="nb-service">Service</Label>
        <select
          id="nb-service"
          className={SELECT_CLASS}
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
        >
          <option value="">No specific service</option>
          {(services.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.durationMin} min
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nb-resource">With</Label>
        <select
          id="nb-resource"
          className={SELECT_CLASS}
          value={resource?.id ?? ''}
          onChange={(e) => setResourceId(e.target.value)}
        >
          {eligible.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nb-date">Date</Label>
        <Input
          id="nb-date"
          type="date"
          value={day}
          onChange={(e) => {
            setDate(e.target.value);
            setTime('');
          }}
        />
      </div>
      <div className="space-y-1.5 md:row-span-2">
        <Label>Time</Label>
        {resource && (
          <TimePicker
            resourceId={resource.id}
            serviceId={serviceId || undefined}
            date={day}
            value={time}
            onChange={setTime}
          />
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nb-name">Customer name</Label>
        <Input
          id="nb-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nb-phone">Phone</Label>
        <Input id="nb-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nb-email">Email</Label>
        <Input
          id="nb-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="md:col-span-2 flex items-center justify-between gap-3 flex-wrap pt-1">
        <label className="flex items-center gap-2 text-[12px] text-ink">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Send the customer a confirmation
        </label>
        <div className="flex items-center gap-3">
          {create.error && <span className="text-[12px] text-danger">{create.error.message}</span>}
          <Button type="submit" size="sm" disabled={!resource || !time || create.isPending}>
            {create.isPending ? 'Booking…' : time ? `Book at ${time}` : 'Pick a time'}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function RescheduleForm(props: {
  booking: { id: string; resourceId: string; serviceId: string | null; timezone: string };
  onDone: (msg: string) => void;
  onCancel: () => void;
}) {
  const utils = trpc.useUtils();
  const [date, setDate] = useState(ymdInZone(new Date(), props.booking.timezone));
  const [time, setTime] = useState('');
  const [notify, setNotify] = useState(true);
  const move = trpc.booking.reschedule.useMutation({
    onSuccess: async () => {
      await utils.booking.invalidate();
      props.onDone(`Moved to ${date} at ${time}.`);
    },
  });
  return (
    <div className="px-5 py-4 bg-surface-mute border-t border-border space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <Label htmlFor={`mv-${props.booking.id}`}>Move to</Label>
        <Input
          id={`mv-${props.booking.id}`}
          type="date"
          className="w-auto"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setTime('');
          }}
        />
      </div>
      <TimePicker
        resourceId={props.booking.resourceId}
        serviceId={props.booking.serviceId ?? undefined}
        date={date}
        value={time}
        onChange={setTime}
      />
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-[12px] text-ink">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Tell the customer
        </label>
        <Button
          size="sm"
          disabled={!time || move.isPending}
          onClick={() => move.mutate({ id: props.booking.id, date, time, notifyCustomer: notify })}
        >
          {move.isPending ? 'Moving…' : 'Move booking'}
        </Button>
        <Button size="sm" variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
        {move.error && <span className="text-[12px] text-danger">{move.error.message}</span>}
      </div>
    </div>
  );
}
