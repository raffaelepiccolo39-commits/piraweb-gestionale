// Centralized labels and mappings used across the application.
// Import from here instead of duplicating in each component.

export const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'Da fare',
  in_progress: 'In corso',
  review: 'Review',
  done: 'Fatto',
  archived: 'Archiviato',
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: 'Bassa',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
};

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  social_media_manager: 'Social Media Manager',
  content_creator: 'Content Creator',
  graphic_social: 'Graphic Social',
  graphic_brand: 'Graphic Brand',
};

export const TASK_STATUSES = ['backlog', 'todo', 'in_progress', 'review', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const KANBAN_COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'backlog', label: 'Backlog', color: 'bg-gray-400' },
  { id: 'todo', label: 'Da fare', color: 'bg-blue-500' },
  { id: 'in_progress', label: 'In corso', color: 'bg-yellow-500' },
  { id: 'review', label: 'Review', color: 'bg-purple-500' },
  { id: 'done', label: 'Fatto', color: 'bg-green-500' },
];

export const STATUS_OPTIONS = TASK_STATUSES.map((s) => ({
  value: s,
  label: STATUS_LABELS[s],
}));

export const PRIORITY_OPTIONS = TASK_PRIORITIES.map((p) => ({
  value: p,
  label: PRIORITY_LABELS[p],
}));

export const SCRIPT_TYPES: Record<string, string> = {
  social_post: 'Post Social',
  blog_article: 'Articolo Blog',
  email_campaign: 'Campagna Email',
  ad_copy: 'Copy Pubblicitario',
  video_script: 'Script Video',
  brand_guidelines: 'Brand Guidelines',
  other: 'Altro',
};

export const EVENT_COLORS = [
  '#c8f55a', '#8c7af5', '#ef4444', '#f59e0b',
  '#10b981', '#3b82f6', '#ec4899', '#6366f1',
] as const;
