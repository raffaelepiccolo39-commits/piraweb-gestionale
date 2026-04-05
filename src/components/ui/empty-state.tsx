import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="w-16 h-16 rounded-2xl bg-pw-surface-2 flex items-center justify-center mb-4">
        <Icon size={28} className="text-pw-text-muted" />
      </div>
      <h3 className="text-lg font-[var(--font-syne)] font-medium text-pw-text mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-pw-text-muted text-center max-w-sm mb-4">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
