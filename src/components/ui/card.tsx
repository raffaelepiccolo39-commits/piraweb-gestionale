import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glass?: boolean;
}

export function Card({ children, className, hover = false, glass = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-pw-border/60 overflow-hidden',
        glass
          ? 'glass'
          : 'bg-gradient-to-br from-pw-surface via-pw-surface to-pw-surface-2/50',
        hover && 'card-hover cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: CardProps) {
  return (
    <div className={cn('px-6 py-4 border-b border-pw-border/40', className)}>
      {children}
    </div>
  );
}

export function CardContent({ children, className }: CardProps) {
  return <div className={cn('px-6 py-4', className)}>{children}</div>;
}
