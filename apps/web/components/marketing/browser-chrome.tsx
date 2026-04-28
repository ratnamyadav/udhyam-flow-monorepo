export function BrowserChrome({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden border border-border bg-surface shadow-[0_24px_80px_rgba(0,0,0,.08),0_4px_16px_rgba(0,0,0,.04)]">
      <div className="flex items-center gap-2 px-3.5 py-3 bg-surface-mute border-b border-border">
        <div className="flex gap-1.5">
          <span className="w-[11px] h-[11px] rounded-full bg-[#e0ddd4]" />
          <span className="w-[11px] h-[11px] rounded-full bg-[#e0ddd4]" />
          <span className="w-[11px] h-[11px] rounded-full bg-[#e0ddd4]" />
        </div>
        <div className="flex-1 ml-2.5 px-3 py-1 bg-surface rounded-md text-xs text-ink-mute text-center font-mono">
          {url}
        </div>
      </div>
      {children}
    </div>
  );
}
