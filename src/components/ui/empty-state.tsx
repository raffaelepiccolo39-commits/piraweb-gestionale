import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center rounded-[10px] bg-pw-surface border border-dashed border-pw-border">
      <div className="w-14 h-14 rounded-[12px] bg-pw-surface-soft flex items-center justify-center text-pw-text-dim mb-4">
        <Icon size={24} strokeWidth={1.5} aria-hidden="true" />
      </div>
      <h3 className="text-[15px] font-semibold text-pw-text mb-1.5">
        {title}
      </h3>
      {description && (
        <p className="text-[13px] text-pw-text-muted max-w-[380px] leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
