import { Logo } from '@udyamflow/ui';
import Link from 'next/link';

// Public-facing footer. Used on the marketing landing + pricing pages. Renders
// the Nextfly attribution + the three legal URLs. Also exported as `LEGAL_LINKS`
// so anywhere else in the app that needs the same URL list can reuse this.
export const LEGAL_LINKS = [
  { label: 'Privacy', href: '/legal/privacy' },
  { label: 'Terms', href: '/legal/terms' },
  { label: 'Cancellation & refunds', href: '/legal/cancellation' },
] as const;

export const NEXTFLY_URL = 'https://nextflytech.com';
export const COPYRIGHT_TEXT = 'Built with love in India 🇮🇳 © Nextfly Technologies';

// Renders the copyright line with "Nextfly Technologies" linked to the parent
// company site. Reused in the auth layout so the link styling stays in one place.
export function CopyrightLine({ className }: { className?: string }) {
  return (
    <span className={className}>
      Built with love in India 🇮🇳 ©{' '}
      <a
        href={NEXTFLY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-ink transition-colors underline-offset-2 hover:underline"
      >
        Nextfly Technologies
      </a>
    </span>
  );
}

export function SiteFooter() {
  return (
    <footer className="px-4 sm:px-8 lg:px-14 py-10 border-t border-border text-[13px] text-ink-soft">
      <div className="max-w-[1280px] mx-auto flex flex-wrap gap-6 justify-between items-center">
        <div className="flex flex-wrap items-center gap-4">
          <Logo />
          <CopyrightLine />
        </div>
        <nav className="flex flex-wrap items-center gap-5">
          {LEGAL_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-ink transition-colors">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
