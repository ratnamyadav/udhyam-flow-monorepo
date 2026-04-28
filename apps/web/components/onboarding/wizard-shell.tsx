'use client';

import { Button } from '@udyamflow/ui';
import Link from 'next/link';

const STEPS = ['account', 'template', 'brand', 'locations', 'ready'] as const;

export type StepKey = (typeof STEPS)[number];

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
  pending,
  error,
}: {
  step: StepKey;
  nextHref?: string;
  prevHref?: string;
  nextLabel?: string;
  nextDisabled?: boolean;
  onNext?: () => void | Promise<void>;
  pending?: boolean;
  error?: string | null;
}) {
  const isFirst = step === 'account';
  const isLast = step === 'ready';

  return (
    <div className="px-20 py-5 border-t border-border bg-surface flex justify-between items-center gap-4">
      {isFirst ? (
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
          <Link href="/dashboard">
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
