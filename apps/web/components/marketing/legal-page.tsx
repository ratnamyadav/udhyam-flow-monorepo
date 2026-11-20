import { MarketingNav } from '@/components/marketing/marketing-nav';
import { SiteFooter } from '@/components/site-footer';

// Contact for privacy, legal and grievance requests. Shown on every legal page.
export const LEGAL_CONTACT_EMAIL = 'udhyamflow@nextflytech.com';
export const LEGAL_ENTITY = 'Nextfly Technologies';

export type LegalSection = { heading: string; body: React.ReactNode };

export function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: React.ReactNode;
  sections: LegalSection[];
}) {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <MarketingNav />
      <main className="px-4 sm:px-8 lg:px-14 pt-12 sm:pt-16 pb-20 max-w-[760px] mx-auto">
        <h1
          className="text-[34px] sm:text-[44px] font-medium m-0 text-ink"
          style={{ lineHeight: 1.1, letterSpacing: '-1.2px' }}
        >
          {title}
        </h1>
        <p className="text-[13px] text-ink-soft mt-3">Last updated {updated}</p>
        <div className="text-[15px] leading-[1.7] text-ink-mute mt-8 space-y-4">{intro}</div>
        {sections.map((s) => (
          <section key={s.heading} className="mt-10">
            <h2 className="text-[19px] font-medium text-ink m-0">{s.heading}</h2>
            <div className="text-[15px] leading-[1.7] text-ink-mute mt-3 space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_a]:underline [&_a]:underline-offset-2">
              {s.body}
            </div>
          </section>
        ))}
        <section className="mt-10">
          <h2 className="text-[19px] font-medium text-ink m-0">Contact</h2>
          <p className="text-[15px] leading-[1.7] text-ink-mute mt-3">
            {LEGAL_ENTITY}, India ·{' '}
            <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="underline underline-offset-2">
              {LEGAL_CONTACT_EMAIL}
            </a>
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
