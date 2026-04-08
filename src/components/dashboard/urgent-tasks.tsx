'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';

interface UrgentTask {
  id: string;
  title: string;
  deadline: string;
  project: { name: string; color: string } | null;
  assignee: { full_name: string } | null;
}

interface UrgentTasksProps {
  tasks: UrgentTask[];
  isAdmin: boolean;
}

export function UrgentTasks({ tasks, isAdmin }: UrgentTasksProps) {
  if (tasks.length === 0) return null;

  const today = new Date().toISOString().split('T')[0];

  return (
    <Card className="border-red-500/20 bg-red-500/[0.03]">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-red-400" />
          <h2 className="text-lg font-semibold text-pw-text font-[var(--font-syne)]">
            Richiede attenzione
          </h2>
          <Badge className="bg-red-500/15 text-red-400">{tasks.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-red-500/10">
          {tasks.map((task) => (
            <Link
              key={task.id}
              href="/tasks"
              className="block px-6 py-3 hover:bg-red-500/5 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {task.project && (
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: task.project.color }} />
                  )}
                  <span className="text-sm font-medium text-pw-text truncate">{task.title}</span>
                  {isAdmin && task.assignee && (
                    <span className="text-xs text-pw-text-dim shrink-0">· {task.assignee.full_name}</span>
                  )}
                </div>
                <span className={`text-xs shrink-0 font-medium ${
                  task.deadline < today ? 'text-red-400' : 'text-yellow-400'
                }`}>
                  {task.deadline < today ? `Scaduta ${formatDate(task.deadline)}` : 'Scade oggi'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
