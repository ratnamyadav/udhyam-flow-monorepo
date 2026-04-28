import { Logo } from '@udyamflow/ui';
import Link from 'next/link';
import { BrowserChrome } from '@/components/marketing/browser-chrome';
import { FeatureRow } from '@/components/marketing/feature-row';
import { HeroBookingPreview } from '@/components/marketing/hero-booking-preview';
import { LocationsPreview } from '@/components/marketing/locations-preview';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { Stat } from '@/components/marketing/stat';
import { TemplatesGrid } from '@/components/marketing/templates-grid';
import { ThemePreviewCard } from '@/components/marketing/theme-preview-card';

export default function MarketingLandingPage() {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <MarketingNav activeHref="/" />

      <section className="px-14 pt-28 pb-20 max-w-[1280px] mx-auto">
        <div className="inline-flex items-center gap-2 text-xs text-ink-mute px-3 py-1 border border-border rounded-full bg-surface mb-8 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-[#3d7c4d]" />
          Free for the first 6 months · No card required
        </div>

        <h1
          className="text-[84px] font-medium m-0 max-w-[980px] text-ink"
          style={{ lineHeight: 0.96, letterSpacing: '-2.6px', textWrap: 'balance' }}
        >
          Bookings, branded —
          <br />
          <span className="text-ink-mute">
            for the way{' '}
            <em
              className="not-italic"
              style={{
                fontFamily: '"Fraunces", Georgia, serif',
                fontStyle: 'italic',
                fontWeight: 400,
              }}
            >
              you
            </em>{' '}
            work.
          </span>
        </h1>

        <p className="text-[19px] leading-[1.55] text-ink-mute max-w-[620px] mt-8">
          One booking platform that adapts to{' '}
          <strong className="text-ink font-medium">doctors, tutors, courts, salons</strong> — or
          whatever you do. Pick a template, recolor it, and you're taking bookings the same
          afternoon.
        </p>

        <div className="flex gap-3 mt-10 items-center">
          <Link
            href="/sign-up"
            className="bg-ink text-bg px-5.5 py-3.5 rounded-lg text-[15px] font-medium hover:opacity-90"
          >
            Start free trial
          </Link>
          <Link
            href="/book/patel-clinic"
            className="border border-border-strong text-ink px-5 py-3 rounded-lg text-[15px] font-medium hover:bg-surface-mute"
          >
            See live demo
          </Link>
          <span className="text-[13px] text-ink-soft ml-2">· 5 minute setup</span>
        </div>

        <div className="mt-20 relative">
          <BrowserChrome url="patel-clinic.udyamflow.com">
            <HeroBookingPreview />
          </BrowserChrome>
          <div className="absolute -right-4 top-16 bg-surface border border-border rounded-xl px-4.5 py-3.5 text-xs shadow-[0_12px_32px_rgba(0,0,0,.06)]">
            <div className="text-ink-soft text-[11px] uppercase tracking-wider mb-1">This week</div>
            <div className="text-[28px] font-medium font-mono leading-none text-ink">148</div>
            <div className="text-ink-mute text-xs mt-1">bookings · ▲ 22% vs. last</div>
          </div>
        </div>
      </section>

      <section className="px-14 py-10 border-y border-border">
        <div className="max-w-[1280px] mx-auto flex items-center gap-14">
          <span className="text-xs text-ink-soft whitespace-nowrap uppercase tracking-wider">
            Trusted by 4,200+ businesses
          </span>
          <div className="flex gap-12 flex-1 justify-around text-ink-soft text-[17px] font-medium">
            {[
              'Northshore Clinic',
              'Lumen Tutors',
              'Baseline Sports',
              'Evergreen Spa',
              'Forge Fitness',
              'Quietmind',
            ].map((n, i) => (
              <span
                key={n}
                style={{
                  fontFamily: i % 2 ? '"Fraunces", serif' : 'inherit',
                  fontStyle: i % 2 ? 'italic' : 'normal',
                  opacity: 0.7,
                }}
              >
                {n}
              </span>
            ))}
          </div>
        </div>
      </section>

      <TemplatesGrid />

      <section
        className="px-14 py-30 bg-surface border-y border-border"
        style={{ padding: '120px 56px' }}
      >
        <div className="max-w-[1280px] mx-auto">
          <h2
            className="text-[48px] leading-[1.05] font-medium m-0 max-w-[700px] text-ink"
            style={{ letterSpacing: '-1.4px', textWrap: 'balance' }}
          >
            Your booking page should look like{' '}
            <em
              style={{
                fontFamily: '"Fraunces", serif',
                fontWeight: 400,
                fontStyle: 'italic',
                color: '#c8704a',
              }}
            >
              your business
            </em>
            , not ours.
          </h2>
          <div className="grid grid-cols-[1.1fr_1fr] gap-20 mt-16 items-center">
            <ThemePreviewCard />
            <div>
              <FeatureRow
                num="01"
                title="Drop in your logo."
                body="SVG, PNG, or whatever your designer left you with. Crop, color-shift, done."
              />
              <FeatureRow
                num="02"
                title="Pick your colors — or steal them."
                body="Paste any URL and we extract the palette. Or pick from oklch-balanced presets."
              />
              <FeatureRow
                num="03"
                title="Choose a font pairing."
                body="Inter, Fraunces, JetBrains Mono — and 12 more pairings tuned for legibility."
              />
              <FeatureRow
                num="04"
                title="Density and radius to taste."
                body="Compact medical, soft & rounded for spas, sharp for sports."
              />
            </div>
          </div>
        </div>
      </section>

      <section className="px-14 py-30 max-w-[1280px] mx-auto" style={{ padding: '120px 56px' }}>
        <div className="grid grid-cols-2 gap-20">
          <div>
            <div
              className="text-xs uppercase tracking-wider mb-3.5 font-medium"
              style={{ color: '#c8704a' }}
            >
              Multi-location
            </div>
            <h2
              className="text-[48px] leading-[1.05] font-medium m-0 text-ink"
              style={{ letterSpacing: '-1.4px', textWrap: 'balance' }}
            >
              One account.
              <br />
              Every location.
            </h2>
            <p className="text-base text-ink-mute mt-5 leading-relaxed max-w-[460px]">
              Switch between branches in the top bar. Each location keeps its own staff, hours,
              prices, and policies — but rolls up into one dashboard so you see the whole business
              at once.
            </p>
            <div className="mt-9 flex gap-6">
              <Stat n="∞" l="Locations on every plan" />
              <Stat n="1" l="Unified dashboard" />
              <Stat n="6" l="Templates" />
            </div>
          </div>
          <LocationsPreview />
        </div>
      </section>

      <section className="px-14 py-30 bg-ink text-bg" style={{ padding: '120px 56px' }}>
        <div className="max-w-[1100px] mx-auto text-center">
          <div className="text-xs uppercase tracking-wider mb-4 font-medium text-white/50">
            Simple pricing
          </div>
          <h2
            className="text-[56px] m-0 font-medium"
            style={{ lineHeight: 1.02, letterSpacing: '-1.6px', textWrap: 'balance' }}
          >
            Free for six months.
            <br />
            <span className="text-white/50">Then $10 per location.</span>
          </h2>
          <p className="text-base text-white/60 mt-6 leading-relaxed max-w-[540px] mx-auto">
            No per-booking fees. No per-staff fees. Cancel any time, keep your data.
          </p>
          <div className="flex gap-3 mt-10 justify-center">
            <Link
              href="/sign-up"
              className="bg-bg text-ink px-5.5 py-3.5 rounded-lg text-[15px] font-medium hover:opacity-90"
            >
              Start free trial
            </Link>
            <Link
              href="/pricing"
              className="border border-white/20 text-bg px-5 py-3 rounded-lg text-[15px] font-medium hover:bg-white/10"
            >
              See full pricing →
            </Link>
          </div>
        </div>
      </section>

      <footer className="px-14 py-12 border-t border-border text-[13px] text-ink-soft">
        <div className="max-w-[1280px] mx-auto flex justify-between items-center">
          <Logo />
          <span>© 2026 UdyamFlow. Made with care in Bengaluru & Berlin.</span>
        </div>
      </footer>
    </div>
  );
}
