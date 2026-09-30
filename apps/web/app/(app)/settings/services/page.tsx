'use client';

import { Button, Input, Label } from '@udyamflow/ui';
import { useState } from 'react';
import { MemberNote, useActiveRole } from '@/components/app-shell/use-role';
import {
  defaultServiceGst,
  type ServiceGst,
  ServiceGstEditor,
  ServiceGstInputs,
  useSuggestedGst,
} from '@/components/services/service-gst';
import { trpc } from '@/lib/trpc/react';

const SELECT_CLASS =
  'w-full text-[13px] bg-surface border border-border rounded-md px-2.5 py-1.5 text-ink';
// INR checks out via Cashfree; everything else via Stripe.
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'] as const;
type Currency = (typeof CURRENCIES)[number];
const CURRENCY_LABELS: Record<Currency, string> = {
  INR: 'INR — ₹',
  USD: 'USD — $',
  EUR: 'EUR — €',
  GBP: 'GBP — £',
};
const asCurrency = (c: string): Currency =>
  (CURRENCIES as readonly string[]).includes(c) ? (c as Currency) : 'INR';

function priceFor(cents: number, currency: string) {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export default function ServicesSettingsPage() {
  const utils = trpc.useUtils();
  const { isAdmin } = useActiveRole();
  const services = trpc.service.list.useQuery();
  const resources = trpc.resource.list.useQuery();
  const create = trpc.service.create.useMutation({
    onSuccess: () => utils.service.list.invalidate(),
  });
  const remove = trpc.service.remove.useMutation({
    onSuccess: () => utils.service.list.invalidate(),
  });
  const setRes = trpc.service.setResources.useMutation({
    onSuccess: () => utils.service.list.invalidate(),
  });
  // Online-session toggle (join link on bookings) — see OnlineToggle below.
  const setOnline = trpc.service.update.useMutation({
    onSuccess: () => utils.service.list.invalidate(),
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(30);
  const [price, setPrice] = useState(0);
  const [currency, setCurrency] = useState<Currency>('INR');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const suggestedGst = useSuggestedGst();
  const [gst, setGst] = useState<ServiceGst | null>(null);
  const gstValue = gst ?? defaultServiceGst(suggestedGst);
  const [isOnline, setIsOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCreate() {
    setError(null);
    if (name.trim().length < 2) {
      setError('Name is required');
      return;
    }
    if (!Number.isFinite(duration) || duration < 5 || duration > 480) {
      setError('Duration must be between 5 and 480 minutes');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError('Price must be zero or more');
      return;
    }
    await create
      .mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        durationMin: duration,
        priceCents: Math.round(price * 100),
        currency,
        resourceIds: picked,
        sacCode: gstValue.sacCode.trim() || null,
        gstRateBps: gstValue.gstRateBps,
        gstExempt: gstValue.gstExempt,
        isOnline,
      })
      .then(() => {
        setName('');
        setDescription('');
        setDuration(30);
        setPrice(0);
        setPicked([]);
        setGst(null);
        setIsOnline(false);
      })
      .catch((e: Error) => setError(e.message));
  }

  function toggleResource(id: string) {
    setPicked((curr) => (curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id]));
  }

  function reassign(serviceId: string, current: string[], id: string) {
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    setRes.mutate({ serviceId, resourceIds: next });
  }

  return (
    <div className="px-12 py-10 max-w-[1280px] mx-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
          <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-2 font-mono">
            Settings · Services
          </div>
          <h1 className="text-[32px] font-medium tracking-tight text-ink">Service catalog</h1>
        </div>
      </div>

      {!isAdmin && <MemberNote what="change the service catalog" />}

      <div className={isAdmin ? 'grid grid-cols-[1fr_380px] gap-6' : 'grid gap-6'}>
        <div className="bg-surface border border-border rounded-xl h-fit">
          {services.isLoading ? (
            <div className="p-8 text-center text-[13px] text-ink-mute">Loading…</div>
          ) : services.error ? (
            <div className="p-8 text-center text-[13px] text-danger">{services.error.message}</div>
          ) : services.data && services.data.length > 0 ? (
            services.data.map((s) =>
              editingId === s.id ? (
                <EditServiceRow key={s.id} service={s} onDone={() => setEditingId(null)} />
              ) : (
                <div
                  key={s.id}
                  className="px-5 py-4 border-t border-border first:border-t-0 grid grid-cols-[1fr_140px_120px_140px] gap-4 items-start hover:bg-surface-mute"
                >
                  <div>
                    <div className="text-[14px] font-medium text-ink">{s.name}</div>
                    {s.description && (
                      <div className="text-[12px] text-ink-mute">{s.description}</div>
                    )}
                    {s.currency === 'INR' && <ServiceGstEditor service={s} />}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(resources.data ?? []).map((r) => {
                        const on = s.resourceIds.includes(r.id);
                        return (
                          <button
                            key={r.id}
                            type="button"
                            disabled={!isAdmin || setRes.isPending}
                            onClick={() => reassign(s.id, s.resourceIds, r.id)}
                            className="text-[10px] px-2 py-0.5 rounded font-medium uppercase tracking-wider border"
                            style={{
                              borderColor: on ? 'var(--accent)' : 'var(--color-border)',
                              background: on ? 'var(--accent-soft)' : 'transparent',
                              color: on ? 'var(--accent-ink)' : 'var(--color-ink-mute)',
                            }}
                          >
                            {r.name}
                          </button>
                        );
                      })}
                    </div>
                    {s.resourceIds.length === 0 && (
                      <div className="mt-1 text-[11px] text-ink-soft">
                        Offered by every resource — tag some to restrict it.
                      </div>
                    )}
                    <OnlineToggle
                      checked={s.isOnline}
                      disabled={!isAdmin || setOnline.isPending}
                      onChange={(v) => setOnline.mutate({ id: s.id, isOnline: v })}
                    />
                  </div>
                  <div className="text-[13px] font-mono text-ink-mute">{s.durationMin} min</div>
                  <div className="text-[13px] font-mono text-ink">
                    {priceFor(s.priceCents, s.currency)}
                  </div>
                  <div className="text-right flex gap-2 justify-end">
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          className="text-[12px] text-ink-mute hover:text-ink"
                          onClick={() => setEditingId(s.id)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-[12px] text-ink-mute hover:text-danger"
                          disabled={remove.isPending}
                          onClick={() => {
                            if (confirm(`Remove ${s.name}?`)) remove.mutate({ id: s.id });
                          }}
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ),
            )
          ) : (
            <div className="p-12 text-center text-[13px] text-ink-mute">
              No services yet — add one on the right.
            </div>
          )}
          {(remove.error || setRes.error) && (
            <div className="px-5 py-3 text-[12px] text-danger border-t border-border">
              {remove.error?.message ?? setRes.error?.message}
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="bg-surface border border-border rounded-xl p-5 space-y-3 h-fit">
            <div className="text-[11px] uppercase tracking-wider text-ink-soft font-mono">
              Add service
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sname">Name</Label>
              <Input
                id="sname"
                placeholder="e.g. New patient consultation"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sdesc">Description</Label>
              <Input
                id="sdesc"
                placeholder="optional"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sdur">Duration (min)</Label>
                <Input
                  id="sdur"
                  type="number"
                  min={5}
                  max={480}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sprice">Price</Label>
                <Input
                  id="sprice"
                  type="number"
                  min={0}
                  step={50}
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scur">Currency</Label>
              <select
                id="scur"
                className={SELECT_CLASS}
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {CURRENCY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            {currency === 'INR' && <ServiceGstInputs value={gstValue} onChange={setGst} />}
            <div className="space-y-1.5">
              <Label>Available with</Label>
              <div className="flex flex-wrap gap-1">
                {(resources.data ?? []).map((r) => {
                  const on = picked.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggleResource(r.id)}
                      className="text-[11px] px-2 py-1 rounded border"
                      style={{
                        borderColor: on ? 'var(--accent)' : 'var(--color-border)',
                        background: on ? 'var(--accent-soft)' : 'transparent',
                        color: on ? 'var(--accent-ink)' : 'var(--color-ink-mute)',
                      }}
                    >
                      {r.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <OnlineToggle checked={isOnline} onChange={setIsOnline} />
            {error && <div className="text-[12px] text-danger">{error}</div>}
            <Button onClick={onCreate} disabled={create.isPending} className="w-full">
              {create.isPending ? 'Adding…' : '+ Add service'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function EditServiceRow({
  service,
  onDone,
}: {
  service: {
    id: string;
    name: string;
    description: string | null;
    durationMin: number;
    priceCents: number;
    currency: string;
  };
  onDone: () => void;
}) {
  const utils = trpc.useUtils();
  const update = trpc.service.update.useMutation({
    onSuccess: async () => {
      await utils.service.list.invalidate();
      onDone();
    },
  });
  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.description ?? '');
  const [duration, setDuration] = useState(service.durationMin);
  const [price, setPrice] = useState(service.priceCents / 100);
  const [currency, setCurrency] = useState<Currency>(asCurrency(service.currency));
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    if (name.trim().length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }
    if (!Number.isFinite(duration) || duration < 5 || duration > 480) {
      setError('Duration must be between 5 and 480 minutes');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError('Price must be zero or more');
      return;
    }
    update.mutate({
      id: service.id,
      name: name.trim(),
      description: description.trim() || null,
      durationMin: Math.round(duration),
      priceCents: Math.round(price * 100),
      currency,
    });
  }

  return (
    <div className="px-5 py-4 border-t border-border first:border-t-0 bg-surface-mute space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`sname-${service.id}`}>Name</Label>
          <Input
            id={`sname-${service.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`sdesc-${service.id}`}>Description</Label>
          <Input
            id={`sdesc-${service.id}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`sdur-${service.id}`}>Duration (min)</Label>
          <Input
            id={`sdur-${service.id}`}
            type="number"
            min={5}
            max={480}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`sprice-${service.id}`}>Price</Label>
          <Input
            id={`sprice-${service.id}`}
            type="number"
            min={0}
            step={50}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`scur-${service.id}`}>Currency</Label>
          <select
            id={`scur-${service.id}`}
            className={SELECT_CLASS}
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {CURRENCY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {(error || update.error) && (
        <div className="text-[12px] text-danger">{error ?? update.error?.message}</div>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button size="sm" variant="outline" onClick={onDone} disabled={update.isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// Online sessions get a video link on every booking: the practitioner's own
// Meet/Zoom room (Resources → Meeting link) or a generated Jitsi room.
function OnlineToggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-mute">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>Online session (video link)</span>
    </label>
  );
}
