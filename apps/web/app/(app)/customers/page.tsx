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
    <div className="px-4 sm:px-8 lg:px-12 py-8 sm:py-10 max-w-[1280px] mx-auto">
      <div className="flex flex-wrap justify-between items-end gap-4 mb-8">
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
          className="w-full sm:w-[320px]"
        />
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="hidden md:grid grid-cols-[minmax(0,1fr)_220px_180px_140px] gap-3 px-5 py-3 border-b border-border text-[10px] uppercase tracking-wider text-ink-soft font-mono">
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
              className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_220px_180px_140px] gap-x-3 gap-y-0.5 px-4 sm:px-5 py-3.5 border-t border-border first:border-t-0 items-center hover:bg-surface-mute"
            >
              <div className="text-[14px] font-medium text-ink break-words">{c.name}</div>
              <div className="text-[12px] text-ink-soft font-mono text-right md:text-left md:order-last">
                {c.lastBookingAt
                  ? c.lastBookingAt.toLocaleDateString([], { month: 'short', day: 'numeric' })
                  : '—'}
              </div>
              <div className="col-span-2 md:col-span-1 text-[13px] text-ink-mute truncate">
                {c.email ?? '—'}
              </div>
              <div className="col-span-2 md:col-span-1 text-[13px] text-ink-mute font-mono">
                {c.phone ?? '—'}
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
