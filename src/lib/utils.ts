import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: 'Admin',
    social_media_manager: 'Social Media Manager',
    content_creator: 'Content Creator',
    graphic_social: 'Graphic Social',
    graphic_brand: 'Graphic Brand',
  };
  return labels[role] || role;
}

export function getRoleColor(role: string): string {
  const colors: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    social_media_manager: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    content_creator: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    graphic_social: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    graphic_brand: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  };
  return colors[role] || 'bg-gray-100 text-gray-800';
}

export function getPriorityColor(priority: string): string {
  const colors: Record<string, string> = {
    low: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    medium: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    high: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
    urgent: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  };
  return colors[priority] || '';
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    backlog: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    todo: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    in_progress: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    review: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    done: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  };
  return colors[status] || '';
}

export function formatCurrency(amount: number | string): string {
  const value = Number(amount) || 0;
  const isNegative = value < 0;
  const abs = Math.abs(value);
  const [intPart, decPart] = abs.toFixed(2).split('.');
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${isNegative ? '-' : ''}€ ${withDots},${decPart}`;
}

export function formatTime(date: string | Date | null): string {
  if (!date) return '--:--';
  return new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(new Date(date));
}

export function formatHours(hours: number | string): string {
  const h = Math.floor(Number(hours) || 0);
  const m = Math.round(((Number(hours) || 0) - h) * 60);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

export function getAttendanceStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    working: 'Al lavoro',
    lunch_break: 'In pausa pranzo',
    completed: 'Giornata completata',
    absent: 'Assente',
  };
  return labels[status] || status;
}

export function getAttendanceStatusColor(status: string): string {
  const colors: Record<string, string> = {
    working: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    lunch_break: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    completed: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    absent: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}
