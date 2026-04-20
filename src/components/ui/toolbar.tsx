import { cn } from '@/lib/utils';

interface BaseProps {
  children: React.ReactNode;
  className?: string;
}

export function Toolbar({ children, className }: BaseProps) {
  return <div className={cn('flex flex-col gap-4', className)}>{children}</div>;
}

interface ToolbarHeaderProps extends BaseProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}

export function ToolbarHeader({ title, subtitle, actions, className }: Omit<ToolbarHeaderProps, 'children'>) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        {typeof title === 'string' ? (
          <h1 className="text-2xl font-bold text-pw-text">{title}</h1>
        ) : (
          title
        )}
        {subtitle && (
          typeof subtitle === 'string'
            ? <p className="text-sm text-pw-text-muted mt-0.5">{subtitle}</p>
            : subtitle
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function ToolbarFilters({ children, className }: BaseProps) {
  return <div className={cn('flex flex-wrap items-end gap-3', className)}>{children}</div>;
}

export function ToolbarActions({ children, className }: BaseProps) {
  return <div className={cn('flex items-center gap-2', className)}>{children}</div>;
}
