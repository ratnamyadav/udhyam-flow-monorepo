'use client';

import { Button, Input, Label } from '@udyamflow/ui';
import { useMemo, useState } from 'react';
import { MemberNote, useActiveRole } from '@/components/app-shell/use-role';
import {
  browserTimezone,
  CURRENCIES,
  type Currency,
  defaultCurrencyFor,
  timezoneOptions,
} from '@/lib/timezones';
import { trpc } from '@/lib/trpc/react';

const SELECT_CLASS =
  'w-full text-[13px] bg-surface border border-border rounded-md px-2.5 py-1.5 text-ink';

export default function LocationsSettingsPage() {
  const utils = trpc.useUtils();
  const { isAdmin } = useActiveRole();
  const list = trpc.location.list.useQuery();
  const create = trpc.location.create.useMutation({
    onSuccess: () => utils.location.list.invalidate(),
  });
  const remove = trpc.location.remove.useMutation({
    onSuccess: () => utils.location.list.invalidate(),
  });

  const initialTz = useMemo(() => browserTimezone(), []);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [timezone, setTimezone] = useState(initialTz);
  const [currency, setCurrency] = useState<Currency>(defaultCurrencyFor(initialTz));
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const tzOptions = useMemo(
    () => timezoneOptions(...(list.data ?? []).map((l) => l.timezone)),
    [list.data],
  );

  async function onCreate() {
    setError(null);
    if (name.trim().length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }
    await create
      .mutateAsync({
        name: name.trim(),
        address: address.trim() || undefined,
        timezone,
        currency,
      })
      .then(() => {
        setName('');
        setAddress('');
      })
      .catch((e: Error) => setError(e.message));
  }

  return (
    <div className="px-12 py-10 max-w-[1280px] mx-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
          <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-2 font-mono">
            Settings · Locations
          </div>
          <h1 className="text-[32px] font-medium tracking-tight text-ink">Locations</h1>
        </div>
      </div>

      {!isAdmin && <MemberNote what="add, edit or remove locations" />}

      <div className={isAdmin ? 'grid grid-cols-[1fr_360px] gap-6' : 'grid gap-6'}>
        <div className="bg-surface border border-border rounded-xl h-fit">
          <div className="grid grid-cols-[1fr_180px_90px_110px] px-5 py-3 border-b border-border text-[10px] uppercase tracking-wider text-ink-soft font-mono">
            <div>Location</div>
            <div>Timezone</div>
            <div>Currency</div>
            <div>{isAdmin ? 'Actions' : ''}</div>
          </div>
          {list.isLoading ? (
            <div className="p-8 text-center text-[13px] text-ink-mute">Loading…</div>
          ) : list.error ? (
            <div className="p-8 text-center text-[13px] text-danger">{list.error.message}</div>
          ) : list.data && list.data.length > 0 ? (
            list.data.map((l) =>
              editingId === l.id ? (
                <EditLocationRow
                  key={l.id}
                  location={l}
                  tzOptions={tzOptions}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <div
                  key={l.id}
                  className="grid grid-cols-[1fr_180px_90px_110px] px-5 py-3.5 border-t border-border first:border-t-0 hover:bg-surface-mute items-center"
                >
                  <div>
                    <div className="text-[14px] font-medium text-ink">{l.name}</div>
                    {l.address && <div className="text-[12px] text-ink-mute">{l.address}</div>}
                  </div>
                  <div className="text-[13px] text-ink-mute font-mono">{l.timezone}</div>
                  <div className="text-[13px] text-ink font-mono">{l.currency}</div>
                  <div className="flex gap-2">
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          className="text-[12px] text-ink-mute hover:text-ink"
                          onClick={() => setEditingId(l.id)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-[12px] text-ink-mute hover:text-danger"
                          disabled={remove.isPending}
                          onClick={() => {
                            if (confirm(`Remove ${l.name}? Past bookings are kept.`)) {
                              remove.mutate({ id: l.id });
                            }
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
              No locations yet — add your first one to start taking bookings.
            </div>
          )}
          {remove.error && (
            <div className="px-5 py-3 text-[12px] text-danger border-t border-border">
              {remove.error.message}
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="bg-surface border border-border rounded-xl p-5 space-y-3 h-fit">
            <div className="text-[11px] uppercase tracking-wider text-ink-soft font-mono">
              Add location
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lname">Name</Label>
              <Input
                id="lname"
                placeholder="e.g. Powai Clinic"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="laddr">Address</Label>
              <Input
                id="laddr"
                placeholder="optional"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-[1fr_96px] gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="ltz">Timezone</Label>
                <select
                  id="ltz"
                  className={SELECT_CLASS}
                  value={timezone}
                  onChange={(e) => {
                    setTimezone(e.target.value);
                    setCurrency(defaultCurrencyFor(e.target.value));
                  }}
                >
                  {tzOptions.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lcur">Currency</Label>
                <select
                  id="lcur"
                  className={SELECT_CLASS}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as Currency)}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {error && <div className="text-[12px] text-danger">{error}</div>}
            <Button onClick={onCreate} disabled={create.isPending} className="w-full">
              {create.isPending ? 'Adding…' : '+ Add location'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function EditLocationRow({
  location,
  tzOptions,
  onDone,
}: {
  location: {
    id: string;
    name: string;
    address: string | null;
    timezone: string;
    currency: string;
  };
  tzOptions: string[];
  onDone: () => void;
}) {
  const utils = trpc.useUtils();
  const update = trpc.location.update.useMutation({
    onSuccess: async () => {
      await utils.location.list.invalidate();
      onDone();
    },
  });
  const [name, setName] = useState(location.name);
  const [address, setAddress] = useState(location.address ?? '');
  const [timezone, setTimezone] = useState(location.timezone);
  const [currency, setCurrency] = useState<Currency>(location.currency === 'USD' ? 'USD' : 'INR');
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    if (name.trim().length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }
    update.mutate({
      id: location.id,
      name: name.trim(),
      address: address.trim() || null,
      timezone,
      currency,
    });
  }

  return (
    <div className="px-5 py-4 border-t border-border first:border-t-0 bg-surface-mute space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`ename-${location.id}`}>Name</Label>
          <Input
            id={`ename-${location.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`eaddr-${location.id}`}>Address</Label>
          <Input
            id={`eaddr-${location.id}`}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-[1fr_120px] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`etz-${location.id}`}>Timezone</Label>
          <select
            id={`etz-${location.id}`}
            className={SELECT_CLASS}
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            {tzOptions.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`ecur-${location.id}`}>Currency</Label>
          <select
            id={`ecur-${location.id}`}
            className={SELECT_CLASS}
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
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
