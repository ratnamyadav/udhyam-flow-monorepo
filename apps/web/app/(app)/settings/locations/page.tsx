'use client';

import { Button, Input, Label } from '@udyamflow/ui';
import { useState } from 'react';
import { trpc } from '@/lib/trpc/react';

export default function LocationsSettingsPage() {
  const utils = trpc.useUtils();
  const list = trpc.location.list.useQuery();
  const create = trpc.location.create.useMutation({
    onSuccess: () => utils.location.list.invalidate(),
  });

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onCreate() {
    setError(null);
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    await create
      .mutateAsync({ name: name.trim(), address: address.trim() || undefined })
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

      <div className="grid grid-cols-[1fr_360px] gap-6">
        <div className="bg-surface border border-border rounded-xl">
          <div className="grid grid-cols-[1fr_180px_140px] px-5 py-3 border-b border-border text-[10px] uppercase tracking-wider text-ink-soft font-mono">
            <div>Location</div>
            <div>Timezone</div>
            <div>Currency</div>
          </div>
          {list.isLoading ? (
            <div className="p-8 text-center text-[13px] text-ink-mute">Loading…</div>
          ) : list.data && list.data.length > 0 ? (
            list.data.map((l) => (
              <div
                key={l.id}
                className="grid grid-cols-[1fr_180px_140px] px-5 py-3.5 border-t border-border first:border-t-0 hover:bg-surface-mute"
              >
                <div>
                  <div className="text-[14px] font-medium text-ink">{l.name}</div>
                  {l.address && <div className="text-[12px] text-ink-mute">{l.address}</div>}
                </div>
                <div className="text-[13px] text-ink-mute font-mono">{l.timezone}</div>
                <div className="text-[13px] text-ink font-mono">{l.currency}</div>
              </div>
            ))
          ) : (
            <div className="p-12 text-center text-[13px] text-ink-mute">
              No locations yet — add your first one to start taking bookings.
            </div>
          )}
        </div>

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
          {error && <div className="text-[12px] text-danger">{error}</div>}
          <Button onClick={onCreate} disabled={create.isPending} className="w-full">
            {create.isPending ? 'Adding…' : '+ Add location'}
          </Button>
        </div>
      </div>
    </div>
  );
}
