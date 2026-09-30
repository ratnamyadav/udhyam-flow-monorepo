'use client';

import { authClient, signOut } from '@udyamflow/auth/client';
import { readableTextOn, type TenantTheme } from '@udyamflow/tokens';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useCallback, useRef, useState, useTransition } from 'react';
import { useOutsideClick } from '@/lib/use-outside-click';
import { MobileNav, PrimaryNavLinks, SettingsMenu } from './nav-menus';

export type OrgOption = {
  id: string;
  name: string;
  slug: string;
  logo: string;
  logoUrl?: string | null;
  accent: string;
};

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
  // Workspace (organization) switcher — not to be confused with a
  // business's physical locations, which live under Settings → Locations.
  const [openOrg, setOpenOrg] = useState(false);
  const [openUser, setOpenUser] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const orgRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const closeOrg = useCallback(() => setOpenOrg(false), []);
  const closeUser = useCallback(() => setOpenUser(false), []);
  useOutsideClick(orgRef, closeOrg, openOrg);
  useOutsideClick(userRef, closeUser, openUser);

  function switchOrg(id: string) {
    setSwitchError(null);
    startTransition(async () => {
      try {
        const res = await authClient.organization.setActive({ organizationId: id });
        if (res.error) {
          setSwitchError(res.error.message ?? 'Could not switch workspace');
          return;
        }
        setOpenOrg(false);
        router.refresh();
      } catch (e) {
        setSwitchError(e instanceof Error ? e.message : 'Could not switch workspace');
      }
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
    <div className="relative flex items-center justify-between gap-3 px-4 md:px-7 py-3 border-b border-border bg-surface">
      <div className="flex items-center gap-6 min-w-0">
        <div ref={orgRef} className="relative min-w-0">
          <button
            type="button"
            onClick={() => setOpenOrg((v) => !v)}
            disabled={isPending || orgs.length === 0}
            aria-expanded={openOrg}
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-surface-mute transition-colors disabled:opacity-50 max-w-full"
          >
            <div
              className="w-7 h-7 shrink-0 grid place-items-center text-[10px] font-semibold overflow-hidden"
              style={{
                background: activeTheme.accent,
                color: readableTextOn(activeTheme.accent),
                borderRadius: 'calc(var(--radius) - 2px)',
              }}
            >
              {activeTheme.logoUrl ? (
                // Tenant logos are external R2 URLs, not local assets.
                <img
                  src={activeTheme.logoUrl}
                  alt={activeTheme.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                activeTheme.logo
              )}
            </div>
            <div className="text-left min-w-0 max-w-[150px] sm:max-w-[220px] lg:max-w-[260px]">
              <div className="text-[13px] font-medium text-ink leading-tight truncate">
                {activeTheme.name || 'No workspace'}
              </div>
              <div className="text-[11px] text-ink-mute truncate">
                {orgs.length > 1 ? `${orgs.length} workspaces` : 'Switch workspace'}
              </div>
            </div>
            <span aria-hidden className="text-ink-soft text-xs ml-1">
              ⌄
            </span>
          </button>
          {openOrg && orgs.length > 0 && (
            <div className="absolute top-14 left-0 md:left-7 z-20 bg-surface border border-border rounded-xl p-1.5 shadow-[0_12px_32px_rgba(0,0,0,.08)] min-w-[min(280px,calc(100vw-2rem))]">
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
                      className="w-6 h-6 shrink-0 grid place-items-center text-[10px] font-semibold overflow-hidden"
                      style={{
                        background: o.accent,
                        color: readableTextOn(o.accent),
                        borderRadius: 6,
                      }}
                    >
                      {o.logoUrl ? (
                        <img
                          src={o.logoUrl}
                          alt={o.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        o.logo
                      )}
                    </div>
                    <div className="flex-1 min-w-0 break-words">
                      <div className="text-[13px] font-medium text-ink">{o.name}</div>
                      <div className="text-[11px] text-ink-mute font-mono">/{o.slug}</div>
                    </div>
                    {active && <span className="text-success text-xs">✓</span>}
                  </button>
                );
              })}
              {switchError && (
                <div className="px-3 py-2 text-[12px] text-danger">{switchError}</div>
              )}
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
        <nav aria-label="Main" className="hidden md:flex items-center gap-1">
          <PrimaryNavLinks pathname={pathname} />
          <SettingsMenu pathname={pathname} />
        </nav>
      </div>
      <div className="flex items-center gap-1 md:gap-2 shrink-0">
        <div ref={userRef} className="flex items-center gap-2 relative">
          <a
            href="mailto:support@udyamflow.com"
            className="hidden md:inline-block text-[13px] px-3 py-1.5 rounded-md text-ink-mute hover:text-ink hover:bg-surface-mute transition-colors"
          >
            Help
          </a>
          <button
            type="button"
            aria-expanded={openUser}
            aria-label="Account menu"
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
        <MobileNav pathname={pathname} />
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
