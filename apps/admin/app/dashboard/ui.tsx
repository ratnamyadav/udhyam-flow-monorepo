import Link from 'next/link';

export function PageHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-8">
      <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-2 font-mono">
        {eyebrow}
      </div>
      <h1 className="text-[32px] font-medium tracking-tight text-ink">{title}</h1>
    </div>
  );
}

export function SearchForm({ q, placeholder }: { q?: string; placeholder: string }) {
  return (
    <form className="mb-4 flex gap-2">
      <input
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        className="flex-1 h-9 px-3 rounded-lg border border-border bg-surface text-[13px] text-ink"
      />
      <button
        type="submit"
        className="h-9 px-4 rounded-lg bg-ink text-white text-[13px] font-medium"
      >
        Search
      </button>
    </form>
  );
}

export function Pager({
  basePath,
  q,
  page,
  hasMore,
}: {
  basePath: string;
  q?: string;
  page: number;
  hasMore: boolean;
}) {
  const href = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (p > 1) params.set('page', String(p));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  return (
    <div className="flex justify-between mt-4 text-[13px]">
      {page > 1 ? (
        <Link href={href(page - 1)} className="text-ink-mute hover:text-ink">
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      {hasMore && (
        <Link href={href(page + 1)} className="text-ink-mute hover:text-ink">
          Next →
        </Link>
      )}
    </div>
  );
}

export const PAGE_SIZE = 50;

export function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 1;
}
