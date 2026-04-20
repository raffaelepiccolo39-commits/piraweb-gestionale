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
  neutral: 'bg-pw-surface-3 text-pw-text-muted ring-1 ring-pw-border/40',
  brand: 'bg-[#FFD108]/12 text-[#FFD108] ring-1 ring-[#FFD108]/25',
  success: 'bg-emerald-500/12 text-emerald-400 ring-1 ring-emerald-500/25',
  warning: 'bg-amber-500/12 text-amber-400 ring-1 ring-amber-500/25',
  danger: 'bg-red-500/12 text-red-400 ring-1 ring-red-500/25',
  info: 'bg-cyan-500/12 text-cyan-400 ring-1 ring-cyan-500/25',
  accent: 'bg-[#FF4D1C]/12 text-[#FF4D1C] ring-1 ring-[#FF4D1C]/25',
};

const DOT_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-pw-text-muted',
  brand: 'bg-[#FFD108]',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  danger: 'bg-red-400',
  info: 'bg-cyan-400',
  accent: 'bg-[#FF4D1C]',
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-2.5 py-0.5 text-[11px]',
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
        'inline-flex items-center gap-1.5 rounded-full font-medium tracking-wide whitespace-nowrap',
        SIZE_CLASSES[size],
        tone && TONE_CLASSES[tone],
        !tone && variant === 'outline' && 'border border-pw-border/60 bg-transparent',
        !tone && variant === 'glow' && 'shadow-[0_0_8px_-2px_currentColor]',
        !tone && variant === 'brand' && 'bg-[#FFD108]/15 text-[#FFD108]',
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
