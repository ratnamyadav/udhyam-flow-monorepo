'use client';

import { Button, Input, Label } from '@udyamflow/ui';
import { useState } from 'react';
import { trpc } from '@/lib/trpc/react';

// GST controls for the service catalog: SAC code, GST slab, exempt flag.
// Kept separate from the services page so the page only mounts it.
//
// Suggestions are common choices per profession under GST 2.0 (22 Sep
// 2025) — shown as hints, the tenant (or their CA) confirms.

export type ServiceGst = { sacCode: string; gstRateBps: number; gstExempt: boolean };

const SLABS = [
  { bps: 0, label: '0%' },
  { bps: 500, label: '5%' },
  { bps: 1800, label: '18%' },
  { bps: 4000, label: '40%' },
];

const SUGGESTED: Record<string, ServiceGst & { note: string }> = {
  doctor: {
    sacCode: '999312',
    gstRateBps: 0,
    gstExempt: true,
    note: 'Healthcare by a clinical establishment is usually GST-exempt.',
  },
  therapist: {
    sacCode: '999319',
    gstRateBps: 0,
    gstExempt: true,
    note: 'Exempt when provided by a recognised health professional.',
  },
  teacher: {
    sacCode: '999293',
    gstRateBps: 1800,
    gstExempt: false,
    note: 'Private coaching and tuition are usually 18%.',
  },
  salon: {
    sacCode: '999721',
    gstRateBps: 500,
    gstExempt: false,
    note: 'Beauty services are 5% (without input tax credit) from 22 Sep 2025.',
  },
  fitness: {
    sacCode: '999723',
    gstRateBps: 500,
    gstExempt: false,
    note: 'Gyms, health clubs and yoga are 5% (without ITC) from 22 Sep 2025.',
  },
  sports: {
    sacCode: '999652',
    gstRateBps: 1800,
    gstExempt: false,
    note: 'Sports facility operation is usually 18%.',
  },
};

const selectCls = 'h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink';

export function useSuggestedGst(): (ServiceGst & { note: string }) | null {
  const settings = trpc.tenant.getSettings.useQuery();
  return SUGGESTED[settings.data?.profession ?? ''] ?? null;
}

export function defaultServiceGst(s: ServiceGst | null): ServiceGst {
  return s
    ? { sacCode: s.sacCode, gstRateBps: s.gstRateBps, gstExempt: s.gstExempt }
    : { sacCode: '', gstRateBps: 1800, gstExempt: false };
}

export function ServiceGstInputs({
  value,
  onChange,
  idPrefix = 'sgst',
}: {
  value: ServiceGst;
  onChange: (v: ServiceGst) => void;
  idPrefix?: string;
}) {
  const hint = useSuggestedGst();
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-sac`}>SAC code</Label>
          <Input
            id={`${idPrefix}-sac`}
            inputMode="numeric"
            placeholder={hint?.sacCode ?? '9997xx'}
            value={value.sacCode}
            onChange={(e) => onChange({ ...value, sacCode: e.target.value.replace(/\D/g, '') })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-rate`}>GST</Label>
          <select
            id={`${idPrefix}-rate`}
            className={selectCls}
            value={value.gstExempt ? 'exempt' : String(value.gstRateBps)}
            onChange={(e) =>
              onChange(
                e.target.value === 'exempt'
                  ? { ...value, gstExempt: true, gstRateBps: 0 }
                  : { ...value, gstExempt: false, gstRateBps: Number(e.target.value) },
              )
            }
          >
            {SLABS.map((s) => (
              <option key={s.bps} value={s.bps}>
                {s.label}
              </option>
            ))}
            <option value="exempt">Exempt</option>
          </select>
        </div>
      </div>
      {hint && (
        <div className="text-[11px] text-ink-soft">
          Suggested: SAC {hint.sacCode}, {hint.gstExempt ? 'exempt' : `${hint.gstRateBps / 100}%`}.{' '}
          {hint.note} Prices include GST.
        </div>
      )}
    </div>
  );
}

// Row summary + inline editor for an existing service.
export function ServiceGstEditor({
  service,
}: {
  service: { id: string; sacCode: string | null; gstRateBps: number; gstExempt: boolean };
}) {
  const utils = trpc.useUtils();
  const update = trpc.service.update.useMutation({
    onSuccess: () => {
      utils.service.list.invalidate();
      setOpen(false);
    },
  });
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<ServiceGst>({
    sacCode: service.sacCode ?? '',
    gstRateBps: service.gstRateBps,
    gstExempt: service.gstExempt,
  });

  const summary = `${service.sacCode ? `SAC ${service.sacCode} · ` : ''}${
    service.gstExempt ? 'GST exempt' : `GST ${service.gstRateBps / 100}%`
  }`;

  if (!open) {
    return (
      <button
        type="button"
        className="mt-1 text-[11px] font-mono text-ink-soft hover:text-ink"
        onClick={() => setOpen(true)}
      >
        {summary} · edit
      </button>
    );
  }
  return (
    <div className="mt-2 space-y-2 max-w-[360px]">
      <ServiceGstInputs value={v} onChange={setV} idPrefix={`gst-${service.id}`} />
      {update.error && <div className="text-[12px] text-danger">{update.error.message}</div>}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={update.isPending}
          onClick={() =>
            update.mutate({
              id: service.id,
              sacCode: v.sacCode.trim() || null,
              gstRateBps: v.gstRateBps,
              gstExempt: v.gstExempt,
            })
          }
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
