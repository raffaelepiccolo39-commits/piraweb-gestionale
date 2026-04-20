import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glass?: boolean;
  padding?: 0 | 'sm' | 'md' | 'lg';
}

const PADDING_MAP = {
  0: 'p-0',
  sm: 'p-4',
  md: 'p-[18px]',
  lg: 'p-6',
} as const;

export function Card({ children, className, hover = false, padding = 'md', ...props }: CardProps) {
  const paddingCls = typeof padding === 'number' ? PADDING_MAP[0] : PADDING_MAP[padding];
  return (
    <div
      className={cn(
        'bg-pw-surface border border-pw-border rounded-[10px]',
        paddingCls,
        hover && 'cursor-pointer transition-colors duration-150 hover:border-pw-border-strong',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: Pick<CardProps, 'children' | 'className'>) {
  return (
    <div className={cn('px-5 py-3.5 border-b border-pw-border', className)}>
      {children}
    </div>
  );
}

export function CardContent({ children, className }: Pick<CardProps, 'children' | 'className'>) {
  return <div className={cn('px-5 py-3.5', className)}>{children}</div>;
}
