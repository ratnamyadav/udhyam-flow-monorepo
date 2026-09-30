import { Logo } from '@udyamflow/ui';
import Link from 'next/link';
import { OnboardingProvider } from '@/components/onboarding/store';
import { OnboardingSteps } from '@/components/onboarding/wizard-shell';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <OnboardingProvider>
      <div className="min-h-screen w-full bg-bg text-ink flex">
        <aside className="w-[280px] p-7 border-r border-border bg-surface flex flex-col">
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
        <main className="flex-1 flex flex-col">{children}</main>
      </div>
    </OnboardingProvider>
  );
}
