// Visual representation of the location switcher experience for the marketing page.
export function LocationsPreview() {
  const locs = [
    { name: 'Bandra Clinic', addr: 'Mumbai · 12 staff', count: 84 },
    { name: 'Powai Clinic', addr: 'Mumbai · 6 staff', count: 41 },
    { name: 'Indiranagar', addr: 'Bangalore · 9 staff', count: 23 },
  ];

  return (
    <div className="rounded-xl border border-border bg-surface p-2">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-medium text-ink">
          <div className="w-6 h-6 rounded-md bg-[#0f766e] text-white grid place-items-center text-[10px] font-semibold">
            PC
          </div>
          Patel Clinic
        </div>
        <div className="text-[11px] text-ink-soft font-mono uppercase tracking-wider">switch</div>
      </div>
      <div className="p-2">
        {locs.map((l, i) => (
          <div
            key={l.name}
            className="flex items-center justify-between p-3 rounded-md hover:bg-surface-mute transition-colors"
            style={{ background: i === 0 ? 'rgba(15, 118, 110, 0.06)' : 'transparent' }}
          >
            <div>
              <div className="text-sm font-medium text-ink">{l.name}</div>
              <div className="text-xs text-ink-mute">{l.addr}</div>
            </div>
            <div className="text-right">
              <div className="text-base font-medium text-ink font-mono">{l.count}</div>
              <div className="text-[10px] text-ink-soft uppercase tracking-wider">today</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
