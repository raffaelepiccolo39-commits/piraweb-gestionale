import { cn } from '@/lib/utils';

type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
type BadgeVariant = 'default' | 'outline' | 'glow' | 'brand';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
  variant?: BadgeVariant;
  tone?: BadgeTone;
  size?: BadgeSize;
  dot?: boolean;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-pw-surface-hi text-pw-text-muted border border-pw-border',
  brand:   'bg-[var(--pw-gold-soft)] text-[var(--pw-gold-soft-fg)] border border-[rgba(212,168,0,0.25)]',
  success: 'bg-[var(--pw-success-soft)] text-[var(--pw-success)] border border-[rgba(5,150,105,0.25)]',
  warning: 'bg-[var(--pw-warning-soft)] text-[var(--pw-warning)] border border-[rgba(212,168,0,0.25)]',
  danger:  'bg-[var(--pw-danger-soft)] text-[var(--pw-danger)] border border-[rgba(224,67,26,0.25)]',
  info:    'bg-[var(--pw-info-soft)] text-[var(--pw-info)] border border-[rgba(37,99,235,0.25)]',
  accent:  'bg-[rgba(224,67,26,0.08)] text-[var(--pw-danger)] border border-[rgba(224,67,26,0.25)]',
};

const DOT_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-pw-text-muted',
  brand:   'bg-[var(--pw-gold)]',
  success: 'bg-[var(--pw-success)]',
  warning: 'bg-[var(--pw-warning)]',
  danger:  'bg-[var(--pw-danger)]',
  info:    'bg-[var(--pw-info)]',
  accent:  'bg-[var(--pw-danger)]',
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-[1px] text-[10px] rounded-[5px]',
  md: 'px-2 py-[2px] text-[11px] rounded-[6px]',
};

export function Badge({
  children,
  className,
  variant = 'default',
  tone,
  size = 'md',
  dot = false,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium tracking-[0.01em] whitespace-nowrap',
        SIZE_CLASSES[size],
        tone && TONE_CLASSES[tone],
        !tone && variant === 'default' && 'bg-pw-surface-hi text-pw-text-muted border border-pw-border',
        !tone && variant === 'outline' && 'border border-pw-border bg-transparent',
        !tone && variant === 'glow' && 'shadow-[0_0_8px_-2px_currentColor]',
        !tone && variant === 'brand' && 'bg-[var(--pw-gold-soft)] text-[var(--pw-gold-soft-fg)]',
        className,
      )}
    >
      {dot && tone && (
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', DOT_CLASSES[tone])} aria-hidden="true" />
      )}
      {children}
    </span>
  );
}
