import Link from 'next/link';

// Root not-found. Renders for any unmatched URL across the app, including
// /book/<bad-slug> if a tenant's never set up.

export default function NotFound() {
  return (
    <div className="min-h-screen bg-bg grid place-items-center px-6">
      <div className="max-w-[520px] text-center">
        <div
          className="text-[120px] font-medium tracking-tight text-ink leading-none"
          style={{ letterSpacing: '-4px' }}
        >
          404
        </div>
        <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-3 font-mono mt-4">
          Nothing here
        </div>
        <h1 className="text-[28px] font-medium tracking-tight text-ink m-0">
          We couldn't find that page.
        </h1>
        <p className="text-[14px] text-ink-mute mt-3 leading-relaxed">
          The link may be stale, or the workspace you're looking for has been deleted. If you
          followed a tenant booking link, ask the business for a fresh one.
        </p>
        <div className="mt-7 flex justify-center gap-3">
          <Link
            href="/"
            className="px-5 py-2.5 text-bg text-[13px] font-medium rounded-md"
            style={{ background: 'var(--color-ink, #1a1815)' }}
          >
            Back to home
          </Link>
          <Link
            href="/pricing"
            className="px-5 py-2.5 text-[13px] font-medium rounded-md border border-border text-ink hover:bg-surface-mute"
          >
            See pricing
          </Link>
        </div>
      </div>
    </div>
  );
}
