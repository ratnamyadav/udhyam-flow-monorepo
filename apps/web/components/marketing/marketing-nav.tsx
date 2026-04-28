import { Logo } from '@udyamflow/ui';
import Link from 'next/link';

export function MarketingNav({ activeHref }: { activeHref?: string }) {
  const items = [
    { href: '/', label: 'Product' },
    { href: '/templates', label: 'Templates' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/customers', label: 'Customers' },
    { href: '/docs', label: 'Docs' },
  ];

  return (
    <div className="sticky top-0 z-10 backdrop-blur-md bg-bg/85 border-b border-border">
      <div className="flex items-center justify-between px-14 py-5">
        <div className="flex items-center gap-10">
          <Link href="/">
            <Logo />
          </Link>
          <nav className="flex gap-7 text-sm text-ink-mute">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={
                  activeHref === item.href
                    ? 'text-ink font-medium'
                    : 'hover:text-ink transition-colors'
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/sign-in" className="text-ink-mute hover:text-ink">
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="bg-ink text-bg px-3.5 py-2.5 rounded-md text-[13px] font-medium hover:opacity-90"
          >
            Start free for 6 months →
          </Link>
        </div>
      </div>
    </div>
  );
}
