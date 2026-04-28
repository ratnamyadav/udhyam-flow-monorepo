import { forwardRef, type LabelHTMLAttributes } from 'react';
import { cn } from '../cn';

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    // biome-ignore lint/a11y/noLabelWithoutControl: consumers pass htmlFor
    <label
      ref={ref}
      className={cn('text-xs font-medium text-ink-mute uppercase tracking-wider', className)}
      {...props}
    />
  ),
);
Label.displayName = 'Label';
