import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Estrae il testo semplice da una descrizione in HTML (editor rich-text),
 * per mostrarla in anteprime/liste senza tag. Robusto anche su testo già
 * semplice (nessun tag → ritorna il testo così com'è).
 */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Rende un nome file sicuro come chiave di Supabase Storage.
 * Lo storage rifiuta/gestisce male chiavi con spazi, apostrofi (es.
 * "NOTAIO D'AUSILIO.pdf") e lettere accentate → l'upload falliva.
 * Mantiene l'estensione; il nome originale va salvato a parte per la UI.
 */
export function safeStorageName(name: string): string {
  const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, ''); // via accenti
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  const clean = strip(base)
    .replace(/[^a-zA-Z0-9._-]+/g, '_') // spazi/apostrofi/simboli → _
    .replace(/_+/g, '_').replace(/^_|_$/g, '');
  const cleanExt = strip(ext).replace(/[^a-zA-Z0-9.]+/g, '');
  return (clean || 'file') + cleanExt;
}

/**
 * Restituisce una data come 'YYYY-MM-DD' usando i componenti LOCALI
 * (anno/mese/giorno del fuso del browser), non UTC.
 *
 * Perché esiste: `new Date().toISOString().split('T')[0]` produce la data
 * in UTC. A Casapesenna (UTC+1/+2 con DST) un timestamp alle 23:30 locali
 * cade nel giorno successivo in UTC → query/filtri per "oggi" sballano di
 * un giorno alla sera. Tutta la logica "data di calendario" deve usare questa.
 */
export function formatDateLocal(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Data odierna in formato 'YYYY-MM-DD' fuso locale. */
export function todayLocal(): string {
  return formatDateLocal(new Date());
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

export function getUserColor(profile?: { color?: string | null } | null): string {
  return profile?.color || '#ff4d1c';
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
  return colors[role] || 'bg-pw-surface-2 text-pw-text';
}

export function getPriorityColor(priority: string): string {
  const colors: Record<string, string> = {
    low: 'bg-pw-surface-3 text-pw-text-muted',
    medium: 'bg-[#FFD108]/10 text-[#FFD108]',
    high: 'bg-[#ff4d1c]/10 text-[#ff6633]',
    urgent: 'bg-red-500/15 text-red-400',
  };
  return colors[priority] || '';
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    todo: 'bg-[#FFD108]/10 text-[#FFD108]',
    in_progress: 'bg-[#ff4d1c]/10 text-[#ff6633]',
    review: 'bg-[#22d3ee]/10 text-[#22d3ee]',
    done: 'bg-green-500/10 text-green-400',
    archived: 'bg-white/5 text-pw-text-dim',
  };
  return colors[status] || '';
}

/** Colore pieno (hex) per lo stato di una task — per bordi/strisce nelle card. */
export function getStatusBarColor(status: string): string {
  const colors: Record<string, string> = {
    todo: '#FFD108',        // brand giallo — Da fare
    in_progress: '#ff4d1c', // accent arancio — In corso
    review: '#22d3ee',      // cyan — Review
    done: '#22c55e',        // green-500 — Fatto
    archived: '#6b7280',    // gray-500 — Archiviato
  };
  return colors[status] || '#6b7280';
}

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

export function getStatusTone(status: string): BadgeTone {
  const tones: Record<string, BadgeTone> = {
    todo: 'brand',
    in_progress: 'accent',
    review: 'info',
    done: 'success',
    archived: 'neutral',
  };
  return tones[status] || 'neutral';
}

export function getPriorityTone(priority: string): BadgeTone {
  const tones: Record<string, BadgeTone> = {
    low: 'neutral',
    medium: 'brand',
    high: 'accent',
    urgent: 'danger',
  };
  return tones[priority] || 'neutral';
}

export function getAttendanceStatusTone(status: string): BadgeTone {
  const tones: Record<string, BadgeTone> = {
    working: 'success',
    lunch_break: 'warning',
    completed: 'info',
    absent: 'neutral',
  };
  return tones[status] || 'neutral';
}

export function getRoleTone(role: string): BadgeTone {
  const tones: Record<string, BadgeTone> = {
    admin: 'accent',
    social_media_manager: 'info',
    content_creator: 'success',
    graphic_social: 'warning',
    graphic_brand: 'brand',
  };
  return tones[role] || 'neutral';
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
    absent: 'bg-gray-100 text-gray-800 dark:bg-pw-surface-2 dark:text-pw-text-dim',
  };
  return colors[status] || 'bg-pw-surface-2 text-pw-text';
}

export function getDevNoteCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    bug: 'bg-red-500/15 text-red-400',
    feature_request: 'bg-blue-500/15 text-blue-400',
    improvement: 'bg-emerald-500/15 text-emerald-400',
  };
  return colors[category] || 'bg-pw-surface-2 text-pw-text-dim';
}

export function getDevNoteCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    bug: 'Bug',
    feature_request: 'Nuova Funzionalità',
    improvement: 'Miglioramento',
  };
  return labels[category] || category;
}

export function getDevNoteStatusColor(status: string): string {
  const colors: Record<string, string> = {
    open: 'bg-yellow-500/15 text-yellow-400',
    in_progress: 'bg-blue-500/15 text-blue-400',
    resolved: 'bg-green-500/15 text-green-400',
    closed: 'bg-pw-surface-2 text-pw-text-dim',
  };
  return colors[status] || 'bg-pw-surface-2 text-pw-text-dim';
}

export function getDevNoteStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    open: 'Aperta',
    in_progress: 'In lavorazione',
    resolved: 'Risolta',
    closed: 'Chiusa',
  };
  return labels[status] || status;
}

export function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'Adesso';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min fa`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ore fa`;
  if (seconds < 172800) return 'Ieri';
  return formatDate(date);
}
