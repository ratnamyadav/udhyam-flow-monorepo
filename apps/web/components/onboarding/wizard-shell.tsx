'use client';

import { Button } from '@udyamflow/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useOnboarding } from './store';

const STEPS = ['account', 'template', 'brand', 'locations', 'ready'] as const;
const STEP_LABELS = ['Account', 'Template', 'Brand', 'Locations', 'Ready'] as const;

export type StepKey = (typeof STEPS)[number];

// Sidebar step list. "Ready" is only reachable once the workspace exists —
// before that the wizard hasn't created anything to be ready.
export function OnboardingSteps() {
  const pathname = usePathname();
  const { state } = useOnboarding();
  const created = !!state.organizationId;

  return (
    <div className="mt-14 flex flex-col gap-1">
      {STEPS.map((key, i) => {
        const href = `/onboarding/${key}`;
        const active = pathname === href;
        const locked = key === 'ready' && !created;
        const inner = (
          <>
            <div
              className="w-[22px] h-[22px] rounded-full text-[11px] font-semibold grid place-items-center font-mono border"
              style={{
                background: active ? 'var(--color-ink)' : 'var(--color-surface-mute)',
                color: active ? 'var(--color-bg)' : 'var(--color-ink-soft)',
                borderColor: active ? 'var(--color-ink)' : 'var(--color-border)',
              }}
            >
              {i + 1}
            </div>
            <div className={`text-[13px] ${active ? 'text-ink font-medium' : 'text-ink-mute'}`}>
              {STEP_LABELS[i]}
            </div>
          </>
        );
        return locked ? (
          <div
            key={key}
            aria-disabled
            title="Create your workspace first"
            className="flex items-center gap-3.5 px-3 py-2.5 rounded-lg opacity-50 cursor-not-allowed"
          >
            {inner}
          </div>
        ) : (
          <Link
            key={key}
            href={href}
            aria-current={active ? 'step' : undefined}
            className="flex items-center gap-3.5 px-3 py-2.5 rounded-lg hover:bg-surface-mute transition-colors"
          >
            {inner}
          </Link>
        );
      })}
    </div>
  );
}

export function StepHeading({
  kicker,
  title,
  subtitle,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-9">
      <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-3 font-medium font-mono">
        {kicker}
      </div>
      <h2
        className="text-[36px] font-medium m-0 text-ink"
        style={{ letterSpacing: '-1.2px', lineHeight: 1.05 }}
      >
        {title}
      </h2>
      {subtitle && (
        <p className="text-[15px] text-ink-mute mt-3 leading-relaxed max-w-[540px]">{subtitle}</p>
      )}
    </div>
  );
}

export function WizardFooter({
  step,
  nextHref,
  prevHref,
  nextLabel,
  nextDisabled,
  onNext,
  onFinish,
  pending,
  error,
}: {
  step: StepKey;
  nextHref?: string;
  prevHref?: string;
  nextLabel?: string;
  nextDisabled?: boolean;
  onNext?: () => void | Promise<void>;
  /** Last step only: runs when the user leaves via "Open dashboard". */
  onFinish?: () => void;
  pending?: boolean;
  error?: string | null;
}) {
  const isFirst = step === 'account';
  const isLast = step === 'ready';

  return (
    <div className="px-20 py-5 border-t border-border bg-surface flex justify-between items-center gap-4">
      {isFirst || !prevHref ? (
        <span />
      ) : (
        <Link href={prevHref ?? '#'}>
          <Button variant="outline" size="md">
            ← Back
          </Button>
        </Link>
      )}
      <div className="flex items-center gap-3">
        {error && <span className="text-[12px] text-danger">{error}</span>}
        {isLast ? (
          <Link href="/dashboard" onClick={onFinish}>
            <Button>Open dashboard →</Button>
          </Link>
        ) : onNext ? (
          <Button onClick={() => onNext()} disabled={pending || nextDisabled}>
            {pending ? 'Saving…' : (nextLabel ?? 'Continue →')}
          </Button>
        ) : nextHref ? (
          nextDisabled ? (
            <Button disabled>{nextLabel ?? 'Continue →'}</Button>
          ) : (
            <Link href={nextHref}>
              <Button>{nextLabel ?? 'Continue →'}</Button>
            </Link>
          )
        ) : null}
      </div>
    </div>
  );
}
