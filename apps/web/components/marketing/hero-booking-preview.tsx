// A faux booking page — mocked so the marketing hero doesn't need a tenant context.
export function HeroBookingPreview() {
  const slots = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30'];

  return (
    <div className="grid grid-cols-[320px_1fr] h-[540px] bg-surface">
      <div className="p-8 border-r border-border bg-bg">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-10 h-10 rounded-lg bg-[#0f766e] text-white grid place-items-center text-sm font-semibold">
            PC
          </div>
          <div>
            <div className="text-sm font-semibold text-ink">Dr. Anika Patel</div>
            <div className="text-xs text-ink-mute">General Practitioner</div>
          </div>
        </div>
        <h3 className="text-[22px] font-medium tracking-tight leading-tight mb-1.5 text-ink">
          30-minute consultation
        </h3>
        <p className="text-[13px] text-ink-mute leading-relaxed mb-6">
          Routine check-ins, follow-ups, and prescription renewals. Bring your last lab results.
        </p>
        <div className="grid gap-2 text-xs text-ink-mute">
          <div>◷ &nbsp;30 minutes</div>
          <div>◉ &nbsp;Bandra Clinic · Mumbai</div>
          <div>₹ &nbsp;₹800 · paid at clinic</div>
        </div>
      </div>
      <div className="px-9 py-8">
        <div className="flex justify-between items-center mb-4">
          <div className="text-sm font-medium text-ink">April 2026</div>
          <div className="flex gap-1.5">
            <button
              type="button"
              className="w-7 h-7 rounded-md border border-border bg-surface text-ink-mute"
            >
              ‹
            </button>
            <button
              type="button"
              className="w-7 h-7 rounded-md border border-border bg-surface text-ink-mute"
            >
              ›
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-6">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <div key={`${d}-${i}`} className="text-[11px] text-ink-soft text-center p-1">
              {d}
            </div>
          ))}
          {Array.from({ length: 28 }).map((_, i) => {
            const isSelected = i === 14;
            const isUnavailable = i % 7 === 6 || i < 3;
            return (
              <div
                key={i}
                className="grid place-items-center h-9 text-xs rounded-md transition-colors"
                style={{
                  background: isSelected ? '#0f766e' : 'transparent',
                  color: isSelected ? '#fff' : isUnavailable ? '#c8c4ba' : '#1a1815',
                  border: !isSelected && !isUnavailable ? '1px solid transparent' : 'none',
                }}
              >
                {i + 1}
              </div>
            );
          })}
        </div>
        <div className="text-xs text-ink-mute uppercase tracking-wider mb-3">Available slots</div>
        <div className="grid grid-cols-4 gap-2">
          {slots.map((s) => (
            <button
              key={s}
              type="button"
              className="py-2 text-xs font-medium rounded-md border border-border bg-surface text-ink hover:border-[#0f766e] hover:text-[#0f766e] transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
