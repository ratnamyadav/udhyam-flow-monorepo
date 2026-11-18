import { Logo } from '@udyamflow/ui';
import Link from 'next/link';

export function MarketingNav({ activeHref }: { activeHref?: string }) {
  const items = [
    { href: '/', label: 'Product' },
    { href: '/#templates', label: 'Templates' },
    { href: '/#features', label: 'Features' },
    { href: '/#locations', label: 'Multi-location' },
    { href: '/pricing', label: 'Pricing' },
  ];
  return (
    <header className="sticky top-0 z-20 backdrop-blur-md bg-bg/85 border-b border-border">
      <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-3 px-4 sm:px-8 lg:px-14 py-4">
        <Link href="/" className="shrink-0">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden lg:flex gap-5 text-sm text-ink-mute">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={activeHref === item.href ? 'page' : undefined}
              className="hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 shrink-0 text-sm">
          <Link href="/sign-in" className="text-ink-mute hover:text-ink">
            Sign in
          </Link>
          <Link href="/sign-up" className="hidden sm:block bg-ink text-bg px-3 py-2 rounded-md">
            Start free →
          </Link>
          <details className="lg:hidden relative">
            <summary
              className="cursor-pointer list-none rounded-md border border-border px-2 py-2"
              aria-label="Navigation menu"
            >
              Menu
            </summary>
            <nav
              aria-label="Mobile"
              className="absolute right-0 top-12 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface p-2 shadow-lg"
            >
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-md px-3 py-2 hover:bg-surface-mute"
                >
                  {item.label}
                </Link>
              ))}
              <Link href="/sign-up" className="block rounded-md px-3 py-2 font-medium">
                Start free for six months →
              </Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
