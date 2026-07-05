import { Logo } from '@udyamflow/ui';

// Public-facing footer. Used on the marketing landing + pricing pages. Renders
// the Nextfly attribution + the three legal URLs. Also exported as `LEGAL_LINKS`
// so anywhere else in the app that needs the same URL list can reuse this.
export const LEGAL_LINKS = [
  { label: 'Privacy', href: 'https://udyamflow.com/legal/privacy' },
  { label: 'Terms', href: 'https://udyamflow.com/legal/terms' },
  { label: 'Cancellation', href: 'https://udyamflow.com/legal/cancellation' },
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
    <footer className="px-14 py-12 border-t border-border text-[13px] text-ink-soft">
      <div className="max-w-[1280px] mx-auto flex flex-wrap gap-6 justify-between items-center">
        <div className="flex items-center gap-4">
          <Logo />
          <CopyrightLine />
        </div>
        <nav className="flex items-center gap-5">
          {LEGAL_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-ink transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
