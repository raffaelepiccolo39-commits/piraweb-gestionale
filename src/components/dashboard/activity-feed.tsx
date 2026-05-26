'use client';

import { memo, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { getInitials, timeAgo } from '@/lib/utils';
import { Activity, ChevronDown } from 'lucide-react';

interface ActivityItem {
  id: string;
  action: string;
  entity_type: string;
  entity_name: string | null;
  created_at: string;
  user: { full_name: string } | null;
}

interface ActivityFeedProps {
  activities: ActivityItem[];
}

function getActionLabel(action: string, entityType: string): string {
  const labels: Record<string, Record<string, string>> = {
    created: { task: 'ha creato il task', project: 'ha creato il progetto', client: 'ha aggiunto il cliente', post: 'ha pubblicato', ai_script: 'ha generato' },
    completed: { task: 'ha completato', project: 'ha concluso' },
    updated: { task: 'ha aggiornato', project: 'ha aggiornato', client: 'ha aggiornato' },
    assigned: { task: 'ha assegnato' },
    status_changed: { task: 'ha cambiato stato di' },
    commented: { task: 'ha commentato su', post: 'ha commentato su' },
    deleted: { task: 'ha eliminato', project: 'ha eliminato' },
  };
  return labels[action]?.[entityType] || `ha ${action}`;
}

export const ActivityFeed = memo(function ActivityFeed({ activities }: ActivityFeedProps) {
  const [open, setOpen] = useState(false);

  if (activities.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 group w-full text-left"
          aria-expanded={open}
          aria-controls="activity-feed-list"
        >
          <Activity size={16} className="text-pw-accent" />
          <h2 className="text-sm font-semibold text-pw-text group-hover:text-pw-accent transition-colors">
            Attività recenti
          </h2>
          <span className="text-[11px] text-pw-text-dim font-medium tabular-nums">
            {activities.length}
          </span>
          <ChevronDown
            size={14}
            className={`text-pw-text-dim transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </CardHeader>
      {open && (
        <CardContent className="p-0">
          <div id="activity-feed-list" className="divide-y divide-pw-border animate-slide-up">
            {activities.map((item) => (
              <div key={item.id} className="px-6 py-3 flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-pw-surface-3 flex items-center justify-center shrink-0">
                  <span className="text-[9px] font-bold text-pw-text-muted">
                    {item.user ? getInitials(item.user.full_name) : '?'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-pw-text truncate">
                    <span className="font-medium">{item.user?.full_name || 'Utente'}</span>
                    {' '}{getActionLabel(item.action, item.entity_type)}
                    {item.entity_name && (
                      <span className="font-medium"> &ldquo;{item.entity_name}&rdquo;</span>
                    )}
                  </p>
                </div>
                <span className="text-[10px] text-pw-text-dim shrink-0">{timeAgo(item.created_at)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
});
