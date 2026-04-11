import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'outline' | 'glow';
}

export function Badge({ children, className, variant = 'default' }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium tracking-wide whitespace-nowrap',
        variant === 'outline' && 'border border-pw-border/60 bg-transparent',
        variant === 'glow' && 'shadow-[0_0_8px_-2px_currentColor]',
        className
      )}
    >
      {children}
    </span>
  );
}
