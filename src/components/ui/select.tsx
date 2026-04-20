import { forwardRef, useId } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, options, placeholder, id, ...props }, ref) => {
    const autoId = useId();
    const selectId = id || autoId;
    const errorId = error ? `${selectId}-error` : undefined;

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={selectId} className="block text-xs uppercase tracking-[0.08em] font-semibold text-pw-text">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          aria-invalid={!!error || undefined}
          aria-describedby={errorId}
          className={cn(
            'w-full px-4 py-2.5 rounded-xl border bg-pw-surface-2/80 text-pw-text focus:ring-2 focus:ring-pw-accent/20 focus:border-pw-accent/40 focus:bg-pw-surface-2 outline-none transition-all duration-200 text-sm hover:border-pw-border-hover',
            error
              ? 'border-red-500 ring-2 ring-red-500/30 focus:ring-red-500/40 focus:border-red-500'
              : 'border-pw-border/60',
            className
          )}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && (
          <p id={errorId} role="alert" className="flex items-center gap-1.5 text-xs font-medium text-red-500">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
export { Select };
