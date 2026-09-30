import { Logo } from '@udyamflow/ui';
import Link from 'next/link';
import { getStaff } from '@/lib/staff';
import { SignOutButton } from './sign-out-button';

const NAV = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/organizations', label: 'Organizations' },
  { href: '/dashboard/users', label: 'Users' },
  { href: '/gst', label: 'GST thresholds' },
];

// Gates every page under /dashboard: `user.role === 'admin'` or a 403 page.
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { user, caller } = await getStaff();

  return (
    <div className="min-h-screen bg-bg">
      <div className="flex items-center justify-between px-7 py-3 border-b border-border bg-surface">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="text-[10px] uppercase tracking-wider text-ink-soft font-mono px-2 py-0.5 rounded bg-surface-mute border border-border">
              Internal
            </span>
          </div>
          {caller && (
            <nav className="flex items-center gap-4 text-[13px]">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="text-ink-mute hover:text-ink">
                  {n.label}
                </Link>
              ))}
            </nav>
          )}
        </div>
        <div className="flex items-center gap-3 text-[13px] text-ink-mute">
          {user.email}
          <SignOutButton />
        </div>
      </div>

      <div className="px-12 py-10 max-w-[1100px] mx-auto">
        {caller ? (
          children
        ) : (
          <div className="bg-surface border border-border rounded-2xl p-12 text-center">
            <div className="text-[32px] font-medium tracking-tight text-ink mb-3">
              Access denied
            </div>
            <div className="text-[14px] text-ink-mute max-w-[420px] mx-auto leading-relaxed">
              This panel is restricted to UdyamFlow staff. If you think you should have access, ask
              an existing admin to update your role.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const dynamic = 'force-dynamic';
