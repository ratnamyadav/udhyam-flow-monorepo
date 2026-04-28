import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../cn';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink',
        'placeholder:text-ink-soft focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink-mute',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
