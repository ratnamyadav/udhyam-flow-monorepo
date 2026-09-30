import { requireStaffCaller } from '@/lib/staff';
import { PAGE_SIZE, PageHeader, Pager, parsePage, SearchForm } from '../ui';

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: rawPage } = await searchParams;
  const page = parsePage(rawPage);
  const caller = await requireStaffCaller();
  const rows = await caller.admin.listUsers({
    query: q || undefined,
    limit: PAGE_SIZE + 1,
    offset: (page - 1) * PAGE_SIZE,
  });
  const users = rows.slice(0, PAGE_SIZE);

  return (
    <>
      <PageHeader eyebrow="Accounts" title="Users" />
      <SearchForm q={q} placeholder="Search by name or email" />
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-surface-mute text-ink-mute text-left">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Verified</th>
              <th className="px-4 py-2.5 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink-mute">
                  No users match.
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2.5 text-ink font-medium">{u.name}</td>
                <td className="px-4 py-2.5 text-ink-mute">{u.email}</td>
                <td className="px-4 py-2.5 font-mono text-[12px]">{u.role}</td>
                <td className="px-4 py-2.5">{u.emailVerified ? 'Yes' : 'No'}</td>
                <td className="px-4 py-2.5 text-ink-mute">{u.createdAt.toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager basePath="/dashboard/users" q={q} page={page} hasMore={rows.length > PAGE_SIZE} />
    </>
  );
}
