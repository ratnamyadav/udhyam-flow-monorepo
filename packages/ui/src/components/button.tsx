import { cva, type VariantProps } from 'class-variance-authority';
import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink-mute disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-ink text-bg hover:bg-ink/90',
        accent: 'bg-[var(--accent)] text-white hover:opacity-90',
        outline: 'border border-border-strong text-ink hover:bg-surface-mute',
        ghost: 'text-ink-mute hover:bg-surface-mute',
        link: 'underline-offset-4 hover:underline text-ink',
      },
      size: {
        sm: 'h-8 px-3 rounded-md',
        md: 'h-10 px-4 rounded-md',
        lg: 'h-12 px-5 rounded-lg text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  ),
);
Button.displayName = 'Button';
