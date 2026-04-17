import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    const variants = {
      primary: 'bg-gradient-to-r from-pw-accent to-[#FFBF00] hover:from-pw-accent-hover hover:to-[#FFD108] text-[#0A263A] font-semibold shadow-[0_2px_12px_-2px_rgba(255,209,8,0.25)] hover:shadow-[0_4px_20px_-2px_rgba(255,209,8,0.35)]',
      secondary: 'bg-pw-surface-2 hover:bg-pw-surface-3 text-pw-text border border-pw-border/40 hover:border-pw-border',
      outline: 'border border-pw-border/60 hover:border-pw-accent/40 hover:bg-pw-accent/5 text-pw-text-muted hover:text-pw-accent',
      ghost: 'hover:bg-white/[0.04] text-pw-text-muted hover:text-pw-text',
      danger: 'bg-gradient-to-r from-[#ff4d1c] to-[#ff6633] hover:from-[#ff6633] hover:to-[#ff7744] text-white shadow-[0_2px_12px_-2px_rgba(255,77,28,0.3)]',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-xs min-h-[34px] rounded-lg',
      md: 'px-4 py-2.5 text-[13px] rounded-xl',
      lg: 'px-6 py-3 text-sm rounded-xl',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 ease-out disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.97] btn-ripple',
          variants[variant],
          sizes[size],
          className
        )}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
export { Button };
