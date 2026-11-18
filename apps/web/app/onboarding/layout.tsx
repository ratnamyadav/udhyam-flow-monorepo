import { Logo } from '@udyamflow/ui';
import Link from 'next/link';
import { OnboardingProvider } from '@/components/onboarding/store';
import { OnboardingSteps } from '@/components/onboarding/wizard-shell';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <OnboardingProvider>
      <div className="min-h-screen w-full bg-bg text-ink flex flex-col md:flex-row">
        <aside className="w-full md:w-[280px] shrink-0 p-4 md:p-7 border-b md:border-b-0 md:border-r border-border bg-surface flex flex-col">
          <Link href="/">
            <Logo />
          </Link>
          <OnboardingSteps />
          <div className="flex-1" />
          <div className="text-[11px] text-ink-soft leading-relaxed">
            <div className="font-mono mb-1">5 quick steps</div>
            You can change any of this later from Settings.
          </div>
        </aside>
        <main className="min-w-0 flex-1 flex flex-col">{children}</main>
      </div>
    </OnboardingProvider>
  );
}
