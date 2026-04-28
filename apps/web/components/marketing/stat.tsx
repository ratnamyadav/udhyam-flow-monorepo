export function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div>
      <div className="text-[32px] font-medium tracking-tight text-ink leading-none">{n}</div>
      <div className="text-xs text-ink-mute mt-1.5 max-w-[140px]">{l}</div>
    </div>
  );
}
