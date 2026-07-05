'use client';

import { Input } from '@udyamflow/ui';
import Link from 'next/link';
import { useState } from 'react';
import { SkeletonRow } from '@/components/ui/skeleton';
import { trpc } from '@/lib/trpc/react';

export default function CustomersPage() {
  const [query, setQuery] = useState('');
  const list = trpc.customer.list.useQuery({ query: query || undefined, limit: 200 });

  return (
    <div className="px-12 py-10 max-w-[1280px] mx-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
          <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-2 font-mono">
            Customers
          </div>
          <h1 className="text-[32px] font-medium tracking-tight text-ink">All customers</h1>
        </div>
        <Input
          placeholder="Search name, email, phone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-[320px]"
        />
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_220px_180px_140px] px-5 py-3 border-b border-border text-[10px] uppercase tracking-wider text-ink-soft font-mono">
          <div>Name</div>
          <div>Email</div>
          <div>Phone</div>
          <div>Last booking</div>
        </div>
        {list.isLoading ? (
          <>
            <SkeletonRow cols={4} />
            <SkeletonRow cols={4} />
            <SkeletonRow cols={4} />
          </>
        ) : list.data && list.data.length > 0 ? (
          list.data.map((c) => (
            <Link
              key={c.id}
              href={`/customers/${c.id}`}
              className="grid grid-cols-[1fr_220px_180px_140px] px-5 py-3.5 border-t border-border first:border-t-0 items-center hover:bg-surface-mute"
            >
              <div className="text-[14px] font-medium text-ink">{c.name}</div>
              <div className="text-[13px] text-ink-mute">{c.email ?? '—'}</div>
              <div className="text-[13px] text-ink-mute font-mono">{c.phone ?? '—'}</div>
              <div className="text-[12px] text-ink-soft font-mono">
                {c.lastBookingAt
                  ? c.lastBookingAt.toLocaleDateString([], { month: 'short', day: 'numeric' })
                  : '—'}
              </div>
            </Link>
          ))
        ) : (
          <div className="p-12 text-center text-[13px] text-ink-mute">
            {query ? 'No customers match that search.' : 'No customers yet.'}
          </div>
        )}
      </div>
    </div>
  );
}
