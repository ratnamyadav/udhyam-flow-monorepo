// Static preview of the theme customizer for the marketing page.
export function ThemePreviewCard() {
  return (
    <div className="rounded-xl border border-border bg-bg p-7 shadow-[0_12px_32px_rgba(0,0,0,.06)]">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-xs text-ink-mute">
          <span className="w-1.5 h-1.5 rounded-full bg-[#3d7c4d]" />
          Live preview
        </div>
        <div className="text-[11px] text-ink-soft uppercase tracking-wider font-mono">
          tenant.kavya
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-6">
        {[
          { label: 'Clinic', accent: '#0f766e' },
          { label: 'Tutor', accent: '#7c3aed' },
          { label: 'Sports', accent: '#ea580c' },
        ].map((p, i) => (
          <div
            key={p.label}
            className="rounded-md border border-border bg-surface p-3 text-xs text-ink-mute flex items-center gap-2"
            style={{ borderColor: i === 1 ? p.accent : undefined }}
          >
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.accent }} />
            {p.label}
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {['Accent color', 'Radius', 'Font pairing'].map((l) => (
          <div key={l} className="flex justify-between items-center text-xs">
            <span className="text-ink-mute">{l}</span>
            <span className="text-ink-soft font-mono">— —</span>
          </div>
        ))}
      </div>
      <div
        className="mt-6 px-3.5 py-2.5 rounded-lg text-xs text-white font-medium text-center"
        style={{ background: '#7c3aed' }}
      >
        Book a lesson
      </div>
    </div>
  );
}
