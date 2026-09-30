'use client';

import { Button, Input, Label } from '@udyamflow/ui';
import { useEffect, useState } from 'react';
import { MemberNote, useActiveRole } from '@/components/app-shell/use-role';
import { trpc } from '@/lib/trpc/react';

const SELECT_CLASS =
  'w-full text-[13px] bg-surface border border-border rounded-md px-2.5 py-1.5 text-ink';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function toHHMM(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

function fromHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 24 || mm > 59) return null;
  return h * 60 + mm;
}

export default function ResourcesSettingsPage() {
  const utils = trpc.useUtils();
  const { isAdmin } = useActiveRole();
  const resources = trpc.resource.list.useQuery();
  const locations = trpc.location.list.useQuery();

  const create = trpc.resource.create.useMutation({
    onSuccess: () => utils.resource.list.invalidate(),
  });
  const remove = trpc.resource.remove.useMutation({
    onSuccess: () => utils.resource.list.invalidate(),
  });

  // Add form
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [avatar, setAvatar] = useState('');
  const [locationId, setLocationId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!locationId && locations.data?.[0]) setLocationId(locations.data[0].id);
  }, [locations.data, locationId]);

  const [editingHours, setEditingHours] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function onCreate() {
    setError(null);
    if (name.trim().length < 2) {
      setError('Name is required');
      return;
    }
    if (!locationId) {
      setError('Pick a location');
      return;
    }
    await create
      .mutateAsync({
        name: name.trim(),
        title: title.trim() || undefined,
        avatar: avatar.trim() || undefined,
        locationId,
      })
      .then(() => {
        setName('');
        setTitle('');
        setAvatar('');
      })
      .catch((e: Error) => setError(e.message));
  }

  const locById = new Map((locations.data ?? []).map((l) => [l.id, l]));

  return (
    <div className="px-12 py-10 max-w-[1280px] mx-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
          <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-2 font-mono">
            Settings · Resources
          </div>
          <h1 className="text-[32px] font-medium tracking-tight text-ink">Staff & resources</h1>
        </div>
      </div>

      {!isAdmin && <MemberNote what="add, edit or remove resources and their hours" />}

      <div className={isAdmin ? 'grid grid-cols-[1fr_360px] gap-6' : 'grid gap-6'}>
        <div className="bg-surface border border-border rounded-xl h-fit">
          <div className="grid grid-cols-[1fr_180px_160px] px-5 py-3 border-b border-border text-[10px] uppercase tracking-wider text-ink-soft font-mono">
            <div>Resource</div>
            <div>Location</div>
            <div>Actions</div>
          </div>
          {resources.isLoading ? (
            <div className="p-8 text-center text-[13px] text-ink-mute">Loading…</div>
          ) : resources.error ? (
            <div className="p-8 text-center text-[13px] text-danger">{resources.error.message}</div>
          ) : resources.data && resources.data.length > 0 ? (
            resources.data.map((r) => (
              <div key={r.id} className="border-t border-border first:border-t-0">
                {editingId === r.id ? (
                  <EditResourceRow
                    resource={r}
                    locations={locations.data ?? []}
                    onDone={() => setEditingId(null)}
                  />
                ) : (
                  <div className="grid grid-cols-[1fr_180px_160px] px-5 py-3.5 items-center hover:bg-surface-mute">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 grid place-items-center text-[var(--accent-fg)] text-[10px] font-semibold"
                        style={{ background: 'var(--accent)', borderRadius: 6 }}
                      >
                        {r.avatar ?? r.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-[14px] font-medium text-ink">{r.name}</div>
                        <div className="text-[12px] text-ink-mute">{r.title ?? ''}</div>
                      </div>
                    </div>
                    <div className="text-[13px] text-ink-mute">
                      {locById.get(r.locationId)?.name ?? '—'}
                    </div>
                    <div className="flex gap-2">
                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            className="text-[12px] text-ink-mute hover:text-ink"
                            onClick={() => setEditingHours((curr) => (curr === r.id ? null : r.id))}
                          >
                            Hours
                          </button>
                          <button
                            type="button"
                            className="text-[12px] text-ink-mute hover:text-ink"
                            onClick={() => setEditingId(r.id)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-[12px] text-ink-mute hover:text-danger"
                            onClick={() => {
                              if (confirm(`Remove ${r.name}?`)) {
                                remove.mutate({ id: r.id });
                              }
                            }}
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
                {isAdmin && editingHours === r.id && <HoursEditor resourceId={r.id} />}
              </div>
            ))
          ) : (
            <div className="p-12 text-center text-[13px] text-ink-mute">
              No resources yet — add your first one on the right.
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
              Add resource
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rname">Name</Label>
              <Input
                id="rname"
                placeholder="e.g. Dr. Anika Patel"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rtitle">Title</Label>
              <Input
                id="rtitle"
                placeholder="optional"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ravatar">Avatar (2–4 letters)</Label>
              <Input
                id="ravatar"
                maxLength={4}
                placeholder="e.g. AP"
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rloc">Location</Label>
              <select
                id="rloc"
                className={SELECT_CLASS}
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
              >
                {(locations.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            {error && <div className="text-[12px] text-danger">{error}</div>}
            <Button onClick={onCreate} disabled={create.isPending} className="w-full">
              {create.isPending ? 'Adding…' : '+ Add resource'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function EditResourceRow({
  resource,
  locations,
  onDone,
}: {
  resource: { id: string; name: string; title: string | null; locationId: string };
  locations: Array<{ id: string; name: string }>;
  onDone: () => void;
}) {
  const utils = trpc.useUtils();
  const update = trpc.resource.update.useMutation({
    onSuccess: async () => {
      await utils.resource.list.invalidate();
      onDone();
    },
  });
  const [name, setName] = useState(resource.name);
  const [title, setTitle] = useState(resource.title ?? '');
  const [locationId, setLocationId] = useState(resource.locationId);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    if (name.trim().length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }
    update.mutate({ id: resource.id, name: name.trim(), title: title.trim(), locationId });
  }

  return (
    <div className="px-5 py-4 bg-surface-mute space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`rname-${resource.id}`}>Name</Label>
          <Input
            id={`rname-${resource.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`rtitle-${resource.id}`}>Title</Label>
          <Input
            id={`rtitle-${resource.id}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`rloc-${resource.id}`}>Location</Label>
          <select
            id={`rloc-${resource.id}`}
            className={SELECT_CLASS}
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
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

function HoursEditor({ resourceId }: { resourceId: string }) {
  const utils = trpc.useUtils();
  const query = trpc.resource.listHours.useQuery({ resourceId });
  const save = trpc.resource.setHours.useMutation({
    onSuccess: () => utils.resource.listHours.invalidate({ resourceId }),
  });

  // Local state — a 7-element array of {enabled, open, close} strings.
  const [rows, setRows] = useState<Array<{ enabled: boolean; open: string; close: string }>>(
    Array.from({ length: 7 }, () => ({ enabled: false, open: '09:00', close: '18:00' })),
  );

  useEffect(() => {
    if (!query.data) return;
    setRows((curr) => {
      const next = curr.map(() => ({ enabled: false, open: '09:00', close: '18:00' }));
      for (const row of query.data) {
        next[row.dayOfWeek] = {
          enabled: true,
          open: toHHMM(row.openMin),
          close: toHHMM(row.closeMin),
        };
      }
      return next;
    });
  }, [query.data]);

  function onSave() {
    const hours = rows
      .map((r, dayOfWeek) => {
        if (!r.enabled) return null;
        const o = fromHHMM(r.open);
        const c = fromHHMM(r.close);
        if (o === null || c === null || c <= o) return null;
        return { dayOfWeek, openMin: o, closeMin: c };
      })
      .filter((x): x is { dayOfWeek: number; openMin: number; closeMin: number } => x !== null);
    save.mutate({ resourceId, hours });
  }

  return (
    <div className="px-5 py-4 bg-surface-mute border-t border-border">
      <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-3">
        Weekly hours (location timezone)
      </div>
      <div className="grid grid-cols-[80px_60px_1fr_1fr] gap-2 items-center max-w-[520px]">
        {DAYS.map((d, i) => {
          const row = rows[i]!;
          return (
            <Row
              key={d}
              label={d}
              row={row}
              onToggle={() =>
                setRows((curr) => {
                  const next = [...curr];
                  next[i] = { ...next[i]!, enabled: !next[i]!.enabled };
                  return next;
                })
              }
              onOpen={(v) =>
                setRows((curr) => {
                  const next = [...curr];
                  next[i] = { ...next[i]!, open: v };
                  return next;
                })
              }
              onClose={(v) =>
                setRows((curr) => {
                  const next = [...curr];
                  next[i] = { ...next[i]!, close: v };
                  return next;
                })
              }
            />
          );
        })}
      </div>
      <div className="mt-4 flex gap-3 items-center">
        <Button onClick={onSave} disabled={save.isPending} size="sm">
          {save.isPending ? 'Saving…' : 'Save hours'}
        </Button>
        {save.error && <span className="text-[12px] text-danger">{save.error.message}</span>}
      </div>
    </div>
  );
}

function Row({
  label,
  row,
  onToggle,
  onOpen,
  onClose,
}: {
  label: string;
  row: { enabled: boolean; open: string; close: string };
  onToggle: () => void;
  onOpen: (v: string) => void;
  onClose: (v: string) => void;
}) {
  return (
    <>
      <div className="text-[12px] text-ink-mute font-mono">{label}</div>
      <label className="flex items-center gap-1.5 text-[12px] text-ink">
        <input type="checkbox" checked={row.enabled} onChange={onToggle} />
        <span>{row.enabled ? 'open' : 'closed'}</span>
      </label>
      <Input
        value={row.open}
        onChange={(e) => onOpen(e.target.value)}
        disabled={!row.enabled}
        className="text-[12px] font-mono"
      />
      <Input
        value={row.close}
        onChange={(e) => onClose(e.target.value)}
        disabled={!row.enabled}
        className="text-[12px] font-mono"
      />
    </>
  );
}
