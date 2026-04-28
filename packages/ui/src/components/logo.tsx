import { cn } from '../cn';

export function Logo({ className, mark = false }: { className?: string; mark?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="grid place-items-center h-7 w-7 rounded-md bg-ink text-bg text-[11px] font-semibold tracking-wider">
        UF
      </div>
      {!mark && (
        <span className="text-[15px] font-semibold tracking-tight text-ink">UdyamFlow</span>
      )}
    </div>
  );
}
