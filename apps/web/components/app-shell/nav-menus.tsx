'use client';

import Link from 'next/link';
import { type KeyboardEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import { useOutsideClick } from '@/lib/use-outside-click';

export type NavItem = { href: string; label: string };

// Top-level destinations shown inline on desktop.
export const PRIMARY_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/bookings', label: 'Bookings' },
  { href: '/customers', label: 'Customers' },
];

// Everything under /settings, grouped behind the Settings menu.
export const SETTINGS_NAV: NavItem[] = [
  { href: '/settings/resources', label: 'Resources' },
  { href: '/settings/services', label: 'Services' },
  { href: '/settings/locations', label: 'Locations' },
  { href: '/settings/team', label: 'Team' },
  { href: '/settings/payments', label: 'Payments' },
  { href: '/settings/branding', label: 'Branding' },
  { href: '/settings/templates', label: 'Template' },
  { href: '/settings/notifications', label: 'Notifications' },
];

export function isActivePath(pathname: string | null, href: string) {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function itemStyle(active: boolean): React.CSSProperties {
  return {
    color: active ? 'var(--color-ink)' : 'var(--color-ink-mute)',
    // Unset when inactive so the hover:bg-* class can show through.
    background: active ? 'var(--color-surface-mute)' : undefined,
    fontWeight: active ? 500 : 400,
  };
}

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink-mute)]';

/** Inline desktop links (Dashboard, Bookings, Customers). */
export function PrimaryNavLinks({ pathname }: { pathname: string | null }) {
  return PRIMARY_NAV.map((item) => {
    const active = isActivePath(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={`text-[13px] px-3 py-1.5 rounded-md transition-colors hover:text-ink hover:bg-surface-mute ${FOCUS}`}
        style={itemStyle(active)}
      >
        {item.label}
      </Link>
    );
  });
}

/**
 * "Settings ⌄" menu button. Follows the WAI-ARIA menu-button pattern:
 * Enter / Space / ArrowDown open and focus the first item, ArrowUp opens on
 * the last; inside, arrows / Home / End move focus, Escape closes and returns
 * focus to the button, Tab closes, and a click outside closes.
 */
export function SettingsMenu({ pathname }: { pathname: string | null }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  // Which item to focus once the menu has rendered (null = leave focus alone).
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const menuId = useId();
  const buttonId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setFocusIndex(null);
  }, []);
  useOutsideClick(rootRef, close, open);

  useEffect(() => {
    if (open && focusIndex !== null) itemRefs.current[focusIndex]?.focus();
  }, [open, focusIndex]);

  const last = SETTINGS_NAV.length - 1;
  const sectionActive = SETTINGS_NAV.some((i) => isActivePath(pathname, i.href));

  function openAt(index: number) {
    setOpen(true);
    setFocusIndex(index);
  }

  function onButtonKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      openAt(0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      openAt(last);
    }
  }

  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const current = itemRefs.current.indexOf(document.activeElement as HTMLAnchorElement);
    const move = (index: number) => {
      e.preventDefault();
      setFocusIndex(index);
      itemRefs.current[index]?.focus();
    };
    switch (e.key) {
      case 'ArrowDown':
        move(current < 0 || current >= last ? 0 : current + 1);
        break;
      case 'ArrowUp':
        move(current <= 0 ? last : current - 1);
        break;
      case 'Home':
        move(0);
        break;
      case 'End':
        move(last);
        break;
      case 'Escape':
        e.preventDefault();
        close();
        buttonRef.current?.focus();
        break;
      case 'Tab':
        close();
        break;
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(e) => {
          if (open) {
            close();
            return;
          }
          // detail === 0 → activated from the keyboard (Enter / Space):
          // move focus into the menu. Mouse users keep focus on the button.
          if (e.detail === 0) openAt(0);
          else setOpen(true);
        }}
        onKeyDown={onButtonKeyDown}
        className={`flex items-center gap-1 text-[13px] px-3 py-1.5 rounded-md transition-colors hover:text-ink hover:bg-surface-mute ${FOCUS}`}
        style={itemStyle(sectionActive || open)}
      >
        Settings
        <span aria-hidden className="text-[10px] text-ink-soft">
          ▾
        </span>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-labelledby={buttonId}
          onKeyDown={onMenuKeyDown}
          className="absolute top-full left-0 mt-2 z-30 bg-surface border border-border rounded-xl p-1.5 shadow-[0_12px_32px_rgba(0,0,0,.08)] min-w-[200px]"
        >
          {SETTINGS_NAV.map((item, i) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                href={item.href}
                role="menuitem"
                tabIndex={-1}
                aria-current={active ? 'page' : undefined}
                onClick={close}
                className="flex items-center justify-between px-3 py-2 rounded-md text-[13px] hover:bg-surface-mute focus:bg-surface-mute focus:outline-none"
                style={{
                  color: active ? 'var(--color-ink)' : 'var(--color-ink-mute)',
                  fontWeight: active ? 500 : 400,
                }}
              >
                {item.label}
                {active && (
                  <span aria-hidden className="text-[10px] text-ink-soft">
                    ●
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Hamburger shown below md. Opens a full-width panel under the top bar with
 * every destination (primary + settings) and Help. Escape closes it and
 * returns focus to the toggle; clicking outside or following a link closes it.
 * Must sit inside the (position: relative) top bar so the panel spans it.
 */
export function MobileNav({ pathname }: { pathname: string | null }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const [focusFirst, setFocusFirst] = useState(false);
  const panelId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setFocusFirst(false);
  }, []);
  useOutsideClick(rootRef, close, open);

  useEffect(() => {
    if (open && focusFirst) firstLinkRef.current?.focus();
  }, [open, focusFirst]);

  const link = (item: NavItem, first = false) => {
    const active = isActivePath(pathname, item.href);
    return (
      <li key={item.href}>
        <Link
          ref={first ? firstLinkRef : undefined}
          href={item.href}
          aria-current={active ? 'page' : undefined}
          onClick={close}
          className={`block px-3 py-2.5 rounded-md text-[14px] hover:bg-surface-mute ${FOCUS}`}
          style={itemStyle(active)}
        >
          {item.label}
        </Link>
      </li>
    );
  };

  return (
    <div ref={rootRef} className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={(e) => {
          if (open) {
            close();
          } else {
            setOpen(true);
            setFocusFirst(e.detail === 0);
          }
        }}
        className={`w-9 h-9 grid place-items-center rounded-md text-ink hover:bg-surface-mute ${FOCUS}`}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="none">
          {open ? (
            <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.6" />
          ) : (
            <path d="M2.5 5h13M2.5 9h13M2.5 13h13" stroke="currentColor" strokeWidth="1.6" />
          )}
        </svg>
      </button>
      <nav
        id={panelId}
        aria-label="Main"
        hidden={!open}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            close();
            buttonRef.current?.focus();
          }
        }}
        className="absolute left-0 right-0 top-full z-30 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-border bg-surface px-4 py-3 shadow-[0_12px_32px_rgba(0,0,0,.08)]"
      >
        <ul className="m-0 p-0 list-none grid gap-0.5">
          {PRIMARY_NAV.map((item, i) => link(item, i === 0))}
        </ul>
        <div className="mt-3 mb-1 px-3 text-[10px] uppercase tracking-wider text-ink-soft font-mono">
          Settings
        </div>
        <ul className="m-0 p-0 list-none grid gap-0.5">{SETTINGS_NAV.map((item) => link(item))}</ul>
        <div className="border-t border-border mt-3 pt-3">
          <a
            href="mailto:support@udyamflow.com"
            className={`block px-3 py-2.5 rounded-md text-[14px] text-ink-mute hover:bg-surface-mute ${FOCUS}`}
          >
            Help
          </a>
        </div>
      </nav>
    </div>
  );
}
