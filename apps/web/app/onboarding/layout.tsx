import { Logo } from '@udyamflow/ui';
import Link from 'next/link';
import { OnboardingProvider } from '@/components/onboarding/store';

const STEPS = ['Account', 'Template', 'Brand', 'Locations', 'Ready'] as const;
const STEP_PATHS = ['account', 'template', 'brand', 'locations', 'ready'] as const;

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <OnboardingProvider>
      <div className="min-h-screen w-full bg-bg text-ink flex">
        <aside className="w-[280px] p-7 border-r border-border bg-surface flex flex-col">
          <Link href="/">
            <Logo />
          </Link>
          <div className="mt-14 flex flex-col gap-1">
            {STEPS.map((s, i) => (
              <Link
                key={s}
                href={`/onboarding/${STEP_PATHS[i]}`}
                className="flex items-center gap-3.5 px-3 py-2.5 rounded-lg hover:bg-surface-mute transition-colors group"
              >
                <div className="w-[22px] h-[22px] rounded-full text-[11px] font-semibold grid place-items-center font-mono bg-surface-mute text-ink-soft border border-border group-hover:border-border-strong">
                  {i + 1}
                </div>
                <div className="text-[13px] text-ink-mute">{s}</div>
              </Link>
            ))}
          </div>
          <div className="flex-1" />
          <div className="text-[11px] text-ink-soft leading-relaxed">
            <div className="font-mono mb-1">5 quick steps</div>
            You can change any of this later from Settings.
          </div>
        </aside>
        <main className="flex-1 flex flex-col">{children}</main>
      </div>
    </OnboardingProvider>
  );
}
