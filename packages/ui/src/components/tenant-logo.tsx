import { cn } from '../cn';

export function TenantLogo({
  text,
  name,
  className,
  showName = true,
}: {
  text: string;
  name?: string;
  className?: string;
  showName?: boolean;
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        className="grid place-items-center h-8 w-8 text-[11px] font-semibold tracking-wider text-white"
        style={{
          background: 'var(--accent)',
          borderRadius: 'calc(var(--radius) - 2px)',
        }}
      >
        {text}
      </div>
      {showName && name && (
        <span
          className="text-[15px] font-semibold tracking-tight text-ink"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {name}
        </span>
      )}
    </div>
  );
}
