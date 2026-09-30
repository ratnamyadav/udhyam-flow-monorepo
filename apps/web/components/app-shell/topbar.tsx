'use client';

import { authClient, signOut } from '@udyamflow/auth/client';
import type { TenantTheme } from '@udyamflow/tokens';
import { Button } from '@udyamflow/ui';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useCallback, useRef, useState, useTransition } from 'react';
import { useOutsideClick } from '@/lib/use-outside-click';

export type OrgOption = {
  id: string;
  name: string;
  slug: string;
  logo: string;
  logoUrl?: string | null;
  accent: string;
};

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/bookings', label: 'Bookings' },
  { href: '/customers', label: 'Customers' },
  { href: '/settings/resources', label: 'Resources' },
  { href: '/settings/services', label: 'Services' },
  { href: '/settings/locations', label: 'Locations' },
  { href: '/settings/team', label: 'Team' },
  { href: '/settings/payments', label: 'Payments' },
  { href: '/settings/invoicing', label: 'Invoicing' },
  { href: '/settings/branding', label: 'Branding' },
  { href: '/settings/templates', label: 'Template' },
  { href: '/settings/channels', label: 'Channels' },
];

export function Topbar({
  orgs,
  activeOrgId,
  activeTheme,
  user,
}: {
  orgs: OrgOption[];
  activeOrgId: string | null;
  activeTheme: TenantTheme;
  user: { name: string | null; email: string };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [openLoc, setOpenLoc] = useState(false);
  const [openUser, setOpenUser] = useState(false);

  const locRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const closeLoc = useCallback(() => setOpenLoc(false), []);
  const closeUser = useCallback(() => setOpenUser(false), []);
  useOutsideClick(locRef, closeLoc, openLoc);
  useOutsideClick(userRef, closeUser, openUser);

  function switchOrg(id: string) {
    startTransition(async () => {
      await authClient.organization.setActive({ organizationId: id });
      setOpenLoc(false);
      router.refresh();
    });
  }

  const initials = (user.name ?? user.email)
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="relative flex items-center justify-between px-7 py-3 border-b border-border bg-surface">
      <div className="flex items-center gap-6">
        <div ref={locRef} className="relative">
          <button
            type="button"
            onClick={() => setOpenLoc((v) => !v)}
            disabled={isPending || orgs.length === 0}
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-surface-mute transition-colors disabled:opacity-50"
          >
            <div
              className="w-7 h-7 grid place-items-center text-white text-[10px] font-semibold overflow-hidden"
              style={{ background: activeTheme.accent, borderRadius: 'calc(var(--radius) - 2px)' }}
            >
              {activeTheme.logoUrl ? (
                // biome-ignore lint/performance/noImgElement: tenant logos are
                // external R2 URLs, not local assets — next/image isn't needed.
                <img
                  src={activeTheme.logoUrl}
                  alt={activeTheme.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                activeTheme.logo
              )}
            </div>
            <div className="text-left">
              <div className="text-[13px] font-medium text-ink leading-tight">
                {activeTheme.name || 'No workspace'}
              </div>
              <div className="text-[11px] text-ink-mute">
                {orgs.length > 1 ? `${orgs.length} workspaces` : 'Switch workspace'}
              </div>
            </div>
            <span className="text-ink-soft text-xs ml-1">⌄</span>
          </button>
          {openLoc && orgs.length > 0 && (
            <div className="absolute top-14 left-7 z-20 bg-surface border border-border rounded-xl p-1.5 shadow-[0_12px_32px_rgba(0,0,0,.08)] min-w-[280px]">
              {orgs.map((o) => {
                const active = o.id === activeOrgId;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => switchOrg(o.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-surface-mute text-left disabled:opacity-50"
                    style={{ background: active ? 'var(--color-surface-mute)' : 'transparent' }}
                    disabled={isPending}
                  >
                    <div
                      className="w-6 h-6 grid place-items-center text-white text-[10px] font-semibold overflow-hidden"
                      style={{ background: o.accent, borderRadius: 6 }}
                    >
                      {o.logoUrl ? (
                        // biome-ignore lint/performance/noImgElement: external R2 URL
                        <img
                          src={o.logoUrl}
                          alt={o.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        o.logo
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="text-[13px] font-medium text-ink">{o.name}</div>
                      <div className="text-[11px] text-ink-mute font-mono">/{o.slug}</div>
                    </div>
                    {active && <span className="text-success text-xs">✓</span>}
                  </button>
                );
              })}
              <div className="border-t border-border my-1" />
              <Link
                href="/onboarding/account"
                className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-surface-mute text-[13px] text-ink-mute"
              >
                + New workspace
              </Link>
            </div>
          )}
        </div>
        <nav className="flex gap-1">
          {NAV.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="text-[13px] px-3 py-1.5 rounded-md transition-colors"
                style={{
                  color: active ? 'var(--color-ink)' : 'var(--color-ink-mute)',
                  background: active ? 'var(--color-surface-mute)' : 'transparent',
                  fontWeight: active ? 500 : 400,
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div ref={userRef} className="flex items-center gap-2 relative">
        <Button variant="ghost" size="sm">
          Help
        </Button>
        <button
          type="button"
          onClick={() => setOpenUser((v) => !v)}
          className="w-8 h-8 rounded-full bg-surface-mute grid place-items-center text-[11px] font-medium text-ink hover:bg-border"
        >
          {initials}
        </button>
        {openUser && (
          <div className="absolute top-11 right-0 z-20 bg-surface border border-border rounded-xl p-1.5 shadow-[0_12px_32px_rgba(0,0,0,.08)] min-w-[220px]">
            <div className="px-3 py-2 border-b border-border">
              <div className="text-[13px] font-medium text-ink">{user.name ?? 'Signed in'}</div>
              <div className="text-[11px] text-ink-mute">{user.email}</div>
            </div>
            <ThemeToggle />
            <button
              type="button"
              onClick={async () => {
                await signOut();
                router.push('/sign-in');
              }}
              className="w-full text-left px-3 py-2 rounded-md hover:bg-surface-mute text-[13px] text-ink-mute"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ThemeToggle() {
  // Light / Dark / System cycle. We intentionally don't auto-call setTheme
  // on mount — next-themes hydrates from localStorage, which works without
  // our help.
  const { theme, setTheme } = useTheme();
  const next = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="w-full text-left px-3 py-2 rounded-md hover:bg-surface-mute text-[13px] text-ink-mute"
    >
      Theme · {theme ?? 'system'}
    </button>
  );
}
