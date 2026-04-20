import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'accent' | 'ghost' | 'secondary' | 'outline' | 'soft' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'ghost', size = 'md', loading, disabled, children, ...props }, ref) => {
    const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
      primary: 'bg-[var(--pw-navy)] hover:bg-[var(--pw-navy-deep)] text-white border border-transparent font-semibold',
      accent: 'bg-[var(--pw-gold)] hover:bg-[var(--pw-gold-hover)] text-[#2a2100] border border-transparent font-semibold',
      ghost: 'bg-pw-surface hover:bg-pw-surface-soft text-pw-text border border-pw-border hover:border-pw-border-strong',
      secondary: 'bg-pw-surface hover:bg-pw-surface-soft text-pw-text border border-pw-border hover:border-pw-border-strong',
      outline: 'bg-transparent hover:bg-pw-surface-soft text-pw-text border border-pw-border hover:border-pw-border-strong',
      soft: 'bg-pw-surface-soft hover:bg-pw-surface-hi text-pw-text border border-pw-border',
      danger: 'bg-[var(--pw-danger)] hover:brightness-90 text-white border border-transparent font-semibold',
    };

    const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
      sm: 'px-3 py-1.5 text-xs rounded-md min-h-[30px] gap-1.5',
      md: 'px-3.5 py-2 text-[13px] rounded-md min-h-[34px] gap-2',
      lg: 'px-4 py-2.5 text-sm rounded-md min-h-[40px] gap-2',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-colors duration-150 ease-out disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]',
          variants[variant],
          sizes[size],
          className
        )}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
export { Button };
