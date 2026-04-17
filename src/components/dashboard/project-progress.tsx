'use client';

import { memo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { FolderKanban } from 'lucide-react';

interface ProjectWithTasks {
  id: string;
  name: string;
  color: string;
  tasks: { id: string; status: string }[];
}

interface ProjectProgressProps {
  projects: ProjectWithTasks[];
}

export const ProjectProgress = memo(function ProjectProgress({ projects }: ProjectProgressProps) {
  if (projects.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderKanban size={16} className="text-pw-accent" />
            <h2 className="text-sm font-semibold text-pw-text">Progetti</h2>
          </div>
          <Link href="/projects" className="text-xs text-pw-accent hover:underline">Tutti</Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {projects.map((project) => {
          const total = project.tasks.length;
          const done = project.tasks.filter((t) => t.status === 'done').length;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;

          return (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="block p-3 rounded-xl bg-pw-surface-2 hover:bg-pw-surface-3 transition-colors group"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
                <span className="text-sm font-medium text-pw-text truncate group-hover:text-pw-accent transition-colors">
                  {project.name}
                </span>
              </div>
              <div className="h-1.5 bg-pw-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-pw-accent rounded-full transition-all duration-500 progress-animated"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between mt-1.5 text-xs text-pw-text-dim">
                <span>{done}/{total} task</span>
                <span>{pct}%</span>
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
});
