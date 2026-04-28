export function FeatureRow({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <div className="grid grid-cols-[44px_1fr] gap-4 py-6 border-b border-border last:border-b-0">
      <div className="text-xs text-ink-soft font-mono pt-1">{num}</div>
      <div>
        <div className="text-base font-medium text-ink mb-1.5">{title}</div>
        <div className="text-[13px] text-ink-mute leading-relaxed max-w-[420px]">{body}</div>
      </div>
    </div>
  );
}
