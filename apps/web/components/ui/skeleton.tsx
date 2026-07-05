// Lightweight skeleton placeholder for loading states. We avoid a
// dependency-heavy Suspense + spinner setup; pages that need this just
// render `<SkeletonRow />` until their query resolves.

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-md bg-surface-mute ${className}`} aria-hidden="true" />
  );
}

export function SkeletonRow({ cols = 4, className = '' }: { cols?: number; className?: string }) {
  return (
    <div
      className={`grid gap-4 px-5 py-3.5 border-t border-border first:border-t-0 ${className}`}
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton
          key={i}
          className={i === 0 ? 'h-4 w-4/5' : i === cols - 1 ? 'h-4 w-1/3' : 'h-4 w-2/3'}
        />
      ))}
    </div>
  );
}
