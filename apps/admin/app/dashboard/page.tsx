import { auth } from '@udyamflow/auth';
import { Logo } from '@udyamflow/ui';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignOutButton } from './sign-out-button';

export default async function AdminDashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/sign-in');

  // Simple role gate. The user.role column is on the BetterAuth user table.
  const user = session.user as typeof session.user & { role?: string };
  const isAdmin = user.role === 'admin';

  return (
    <div className="min-h-screen bg-bg">
      <div className="flex items-center justify-between px-7 py-3 border-b border-border bg-surface">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="text-[10px] uppercase tracking-wider text-ink-soft font-mono px-2 py-0.5 rounded bg-surface-mute border border-border">
            Internal
          </span>
        </div>
        <div className="flex items-center gap-3 text-[13px] text-ink-mute">
          {user.email}
          <SignOutButton />
        </div>
      </div>

      <div className="px-12 py-10 max-w-[1100px] mx-auto">
        {!isAdmin ? (
          <div className="bg-surface border border-border rounded-2xl p-12 text-center">
            <div className="text-[32px] font-medium tracking-tight text-ink mb-3">
              Access denied
            </div>
            <div className="text-[14px] text-ink-mute max-w-[420px] mx-auto leading-relaxed">
              This panel is restricted to UdyamFlow staff. If you think you should have access, ask
              an existing admin to update your role.
            </div>
          </div>
        ) : (
          <>
            <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-2 font-mono">
              UdyamFlow internal
            </div>
            <h1 className="text-[32px] font-medium tracking-tight text-ink">
              Welcome back, {user.name?.split(' ')[0]}
            </h1>
            <p className="text-[14px] text-ink-mute mt-2 max-w-[640px] leading-relaxed">
              Auth scaffolding only for now — tenant management, billing, and feature flags ship
              next. This panel shares the BetterAuth session with the main app via the same DB.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
