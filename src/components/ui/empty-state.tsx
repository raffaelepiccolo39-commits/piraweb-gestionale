import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="relative flex flex-col items-center justify-center py-14 px-4 animate-slide-up overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.35] bg-[radial-gradient(circle_at_center,rgba(255,209,8,0.08),transparent_55%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-50 [mask-image:radial-gradient(circle_at_center,black,transparent_70%)]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.06) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      <div className="relative mb-5">
        <div
          aria-hidden="true"
          className="absolute inset-0 -m-2 rounded-3xl bg-pw-accent/10 blur-xl"
        />
        <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-pw-surface-2 to-pw-surface-3 ring-1 ring-pw-border/60 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <Icon size={28} className="text-pw-accent/90" />
        </div>
      </div>

      <h3 className="relative text-lg font-[var(--font-syne)] font-semibold text-pw-text mb-1.5 tracking-tight">
        {title}
      </h3>
      {description && (
        <p className="relative text-sm text-pw-text-muted text-center max-w-sm mb-5 leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="relative">{action}</div>}
    </div>
  );
}
