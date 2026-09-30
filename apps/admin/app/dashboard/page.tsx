import Link from 'next/link';
import { requireStaffCaller } from '@/lib/staff';
import { PageHeader } from './ui';

export default async function AdminOverviewPage() {
  const caller = await requireStaffCaller();
  const [stats, recent] = await Promise.all([
    caller.admin.overview(),
    caller.admin.listOrganizations({ limit: 8, offset: 0 }),
  ]);

  const tiles = [
    { label: 'Organizations', value: stats.organizations },
    { label: 'Users', value: stats.users },
    { label: 'Bookings (30d)', value: stats.bookings30d },
    { label: 'Paid bookings (30d)', value: stats.paidBookings30d },
  ];

  return (
    <>
      <PageHeader eyebrow="UdyamFlow internal" title="Platform overview" />
      <div className="grid grid-cols-4 gap-4 mb-10">
        {tiles.map((t) => (
          <div key={t.label} className="bg-surface border border-border rounded-xl p-5">
            <div className="text-[12px] text-ink-mute">{t.label}</div>
            <div className="text-[28px] font-medium tracking-tight text-ink mt-1 font-mono">
              {t.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[16px] font-medium text-ink">Newest organizations</h2>
        <Link href="/dashboard/organizations" className="text-[13px] text-ink-mute hover:text-ink">
          View all →
        </Link>
      </div>
      <div className="bg-surface border border-border rounded-xl divide-y divide-border">
        {recent.length === 0 && (
          <div className="p-5 text-[13px] text-ink-mute">No organizations yet.</div>
        )}
        {recent.map((o) => (
          <div key={o.id} className="flex items-center justify-between px-5 py-3 text-[13px]">
            <div>
              <div className="text-ink font-medium">{o.name}</div>
              <div className="text-ink-soft font-mono text-[12px]">/{o.slug}</div>
            </div>
            <div className="text-ink-mute">
              {o.bookingCount} bookings · {o.createdAt.toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
