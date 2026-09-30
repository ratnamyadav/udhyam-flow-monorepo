import { requireStaffCaller } from '@/lib/staff';
import { PAGE_SIZE, PageHeader, Pager, parsePage, SearchForm } from '../ui';

export default async function AdminOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: rawPage } = await searchParams;
  const page = parsePage(rawPage);
  const caller = await requireStaffCaller();
  const rows = await caller.admin.listOrganizations({
    query: q || undefined,
    limit: PAGE_SIZE + 1,
    offset: (page - 1) * PAGE_SIZE,
  });
  const orgs = rows.slice(0, PAGE_SIZE);

  return (
    <>
      <PageHeader eyebrow="Tenants" title="Organizations" />
      <SearchForm q={q} placeholder="Search by name or slug" />
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-surface-mute text-ink-mute text-left">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Profession</th>
              <th className="px-4 py-2.5 font-medium text-right">Members</th>
              <th className="px-4 py-2.5 font-medium text-right">Locations</th>
              <th className="px-4 py-2.5 font-medium text-right">Bookings</th>
              <th className="px-4 py-2.5 font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {orgs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-ink-mute">
                  No organizations match.
                </td>
              </tr>
            )}
            {orgs.map((o) => (
              <tr key={o.id}>
                <td className="px-4 py-2.5">
                  <div className="text-ink font-medium">{o.name}</div>
                  <div className="text-ink-soft font-mono text-[12px]">/{o.slug}</div>
                </td>
                <td className="px-4 py-2.5 text-ink-mute capitalize">{o.profession ?? '—'}</td>
                <td className="px-4 py-2.5 text-right font-mono">{o.memberCount}</td>
                <td className="px-4 py-2.5 text-right font-mono">{o.locationCount}</td>
                <td className="px-4 py-2.5 text-right font-mono">{o.bookingCount}</td>
                <td className="px-4 py-2.5 text-ink-mute">{o.createdAt.toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager
        basePath="/dashboard/organizations"
        q={q}
        page={page}
        hasMore={rows.length > PAGE_SIZE}
      />
    </>
  );
}
