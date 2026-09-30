'use client';

import { APPROACHING_RATIO, formatLakh } from '@udyamflow/api/gst';
import { Button, Input } from '@udyamflow/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc/react';

// GST registration limit: FY turnover through UdyamFlow against the ₹20
// lakh (₹10 lakh in some NE states) threshold. Unregistered stores are told
// when they're close and when they must register; registered stores just
// see their turnover.

const SOURCE_LABEL = {
  store: 'your setting',
  state: 'lower limit for your state',
  platform: 'UdyamFlow default',
  statutory: 'standard limit for services',
} as const;

function lakh(cents: number) {
  return formatLakh(cents);
}

export function GstTurnoverPanel() {
  const utils = trpc.useUtils();
  const t = trpc.invoicing.gstTurnover.useQuery();
  const save = trpc.invoicing.setGstTurnoverLimit.useMutation({
    onSuccess: () => {
      utils.invoicing.gstTurnover.invalidate();
      setEditing(false);
    },
  });
  const [editing, setEditing] = useState(false);
  const [custom, setCustom] = useState('');
  useEffect(() => {
    if (t.data?.storeLimitCents) setCustom(String(t.data.storeLimitCents / 100));
  }, [t.data?.storeLimitCents]);

  const d = t.data;
  if (!d?.applicable) return null;
  const pct = Math.min(100, Math.round((d.turnoverCents / d.limitCents) * 100));
  const warn = !d.registered && d.level !== 'ok';

  return (
    <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[15px] font-medium text-ink">GST registration limit</div>
          <div className="text-[12px] text-ink-mute mt-1">
            FY {d.financialYear} turnover through UdyamFlow:{' '}
            <strong>{lakh(d.turnoverCents)}</strong> of {lakh(d.limitCents)} (
            {SOURCE_LABEL[d.limitSource]}).
          </div>
        </div>
        <span
          className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded shrink-0"
          style={{
            background: d.registered ? 'var(--accent-soft)' : 'var(--color-surface-mute)',
            color: d.registered ? 'var(--accent-ink)' : 'var(--color-ink-mute)',
          }}
        >
          {d.registered ? 'GST registered' : 'Not registered'}
        </span>
      </div>

      <div className="h-2 rounded-full bg-surface-mute overflow-hidden" aria-hidden>
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: warn ? 'var(--color-danger)' : 'var(--accent)',
          }}
        />
      </div>

      {d.registered ? (
        <div className="text-[12px] text-ink-mute">
          You're GST-registered, so GST is charged on every invoice.
        </div>
      ) : d.level === 'exceeded' ? (
        <div className="text-[13px] text-danger">
          Your turnover has crossed {lakh(d.limitCents)}. You must apply for GST registration within
          30 days. Once you have a GSTIN, turn on <em>GST-registered</em> in the GST profile below —
          invoices will then charge GST.
        </div>
      ) : d.level === 'approaching' ? (
        <div className="text-[13px] text-ink">
          You're at {pct}% of the {lakh(d.limitCents)} limit. Plan your GST registration — you must
          register within 30 days of crossing it.
        </div>
      ) : (
        <div className="text-[12px] text-ink-mute">
          Below the limit — you can issue Bills of Supply without GST. We'll warn you at{' '}
          {Math.round(APPROACHING_RATIO * 100)}%.
        </div>
      )}
      <div className="text-[11px] text-ink-soft">
        Counts paid bookings and membership payments in INR through UdyamFlow only — add any other
        sales under the same PAN when judging the limit.
      </div>

      {editing ? (
        <div className="flex items-center gap-2 text-[13px] text-ink">
          Limit ₹
          <Input
            aria-label="Registration limit in rupees"
            type="number"
            min={100000}
            step={100000}
            className="w-36 h-8"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
          <Button
            size="sm"
            disabled={save.isPending}
            onClick={() => save.mutate({ limitCents: Math.round(Number(custom) * 100) })}
          >
            Save
          </Button>
          {d.storeLimitCents !== null && (
            <Button
              size="sm"
              variant="ghost"
              disabled={save.isPending}
              onClick={() => save.mutate({ limitCents: null })}
            >
              Use default
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <button
          type="button"
          className="text-[12px] text-ink-mute hover:text-ink"
          onClick={() => setEditing(true)}
        >
          Change limit
        </button>
      )}
      {save.error && <div className="text-[12px] text-danger">{save.error.message}</div>}
    </div>
  );
}

// Compact nudge for the dashboard — only when an unregistered store is
// close to or over the limit.
export function GstTurnoverBanner() {
  const t = trpc.invoicing.gstTurnover.useQuery();
  const d = t.data;
  if (!d?.applicable || d.registered || d.level === 'ok') return null;
  return (
    <div
      className="mb-6 px-4 py-3 rounded-lg border text-[13px] flex items-center justify-between gap-4"
      style={{
        borderColor: d.level === 'exceeded' ? 'var(--color-danger)' : 'var(--color-border)',
      }}
    >
      <span className={d.level === 'exceeded' ? 'text-danger' : 'text-ink'}>
        {d.level === 'exceeded'
          ? `Turnover this year has crossed ${lakh(d.limitCents)} — GST registration is due within 30 days.`
          : `You've reached ${lakh(d.turnoverCents)} of the ${lakh(d.limitCents)} GST registration limit.`}
      </span>
      <Link
        href="/settings/invoicing"
        className="text-ink underline-offset-2 hover:underline shrink-0"
      >
        Review GST →
      </Link>
    </div>
  );
}
