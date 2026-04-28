import { PROFESSIONS, TEMPLATES } from '@udyamflow/tokens';

export function TemplatesGrid() {
  return (
    <section className="px-14 py-30 max-w-[1280px] mx-auto" style={{ padding: '120px 56px' }}>
      <div className="grid grid-cols-[1fr_1.4fr] gap-20 items-start">
        <div className="sticky top-24">
          <div
            className="text-xs uppercase tracking-wider mb-3.5 font-medium"
            style={{ color: '#c8704a' }}
          >
            One platform · six templates
          </div>
          <h2
            className="text-[48px] leading-[1.05] font-medium m-0 text-ink"
            style={{ letterSpacing: '-1.4px', textWrap: 'balance' }}
          >
            Built for whatever
            <br />
            gets booked.
          </h2>
          <p className="text-base text-ink-mute mt-5 leading-relaxed">
            Each template ships with the right fields, slot lengths, and policies for your trade.
            You change the parts that matter — never the plumbing.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {TEMPLATES.map((t) => (
            <div
              key={t.id}
              className="bg-surface border border-border rounded-xl p-6 hover:border-border-strong transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-surface-mute grid place-items-center text-base text-ink mb-4">
                {PROFESSIONS[t.id].icon}
              </div>
              <div className="text-base font-medium mb-1 text-ink">{t.title}</div>
              <div className="text-[13px] text-ink-mute mb-3.5 leading-relaxed">{t.tagline}</div>
              <div className="flex flex-wrap gap-1.5">
                {t.features.slice(0, 3).map((f) => (
                  <span
                    key={f}
                    className="text-[11px] px-2 py-0.5 bg-surface-mute text-ink-mute rounded"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
