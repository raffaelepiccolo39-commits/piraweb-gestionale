import { cn } from '@/lib/utils';

interface PageHeaderProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4 mb-7', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-xs text-pw-text-dim mb-1.5">{eyebrow}</div>
        )}
        {typeof title === 'string' ? (
          <h1 className="font-[var(--font-syne)] text-[28px] font-semibold text-pw-text tracking-[-0.025em] leading-tight m-0">
            {title}
          </h1>
        ) : (
          title
        )}
        {subtitle && (
          typeof subtitle === 'string'
            ? <div className="text-[13px] text-pw-text-muted mt-1.5">{subtitle}</div>
            : <div className="mt-1.5">{subtitle}</div>
        )}
      </div>
      {/* flex-wrap e niente shrink-0: su un telefono tre pulsanti in fila
          sono piu' larghi dello schermo, e con shrink-0 il blocco non poteva
          ne' restringersi ne' andare a capo — sfondava la pagina, e la barra
          di navigazione in basso (fixed inset-x-0) si allungava con lei. */}
      {actions && <div className="flex flex-wrap items-center justify-end gap-2 max-w-full">{actions}</div>}
    </div>
  );
}
