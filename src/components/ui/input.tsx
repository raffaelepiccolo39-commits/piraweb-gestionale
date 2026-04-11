import { forwardRef, useId } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const autoId = useId();
    const inputId = id || autoId;
    const errorId = error ? `${inputId}-error` : undefined;

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error || undefined}
          aria-describedby={errorId}
          className={cn(
            'w-full px-4 py-2.5 rounded-xl border bg-pw-surface-2/80 text-pw-text placeholder:text-pw-text-dim outline-none transition-all duration-200 text-sm',
            'focus:ring-2 focus:ring-pw-accent/20 focus:border-pw-accent/40 focus:bg-pw-surface-2',
            'hover:border-pw-border-hover',
            error ? 'border-red-500/50 focus:ring-red-500/20 focus:border-red-500/40' : 'border-pw-border/60',
            className
          )}
          {...props}
        />
        {error && <p id={errorId} role="alert" className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
export { Input };
