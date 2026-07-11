import type { TaskPriority } from '@/types/database';

/**
 * Sequenza di task generati quando si registra uno shooting per un cliente.
 * offsetDays è relativo alla data di shooting (negativo = prima).
 * defaultHours è il punto di partenza: le ore reali si imparano nel tempo
 * (funzione SQL shooting_learned_hours).
 * role è il ruolo del profilo a cui assegnare il task.
 */
export interface ShootingStep {
  key: string;
  title: string;
  description: string;
  role: string;
  offsetDays: number;
  defaultHours: number;
  priority: TaskPriority;
}

export const SHOOTING_STEPS: ShootingStep[] = [
  {
    key: 'moodboard',
    title: 'Moodboard da mandare al cliente',
    description: 'Prepara la moodboard di riferimento per lo shooting e inviala al cliente per conferma.',
    role: 'social_media_manager',
    offsetDays: -3,
    defaultHours: 2,
    priority: 'high',
  },
  {
    key: 'script_ideas',
    title: 'Script video + idee contenuti',
    description: 'Definisci le idee dei contenuti e scrivi gli script dei video da girare allo shooting.',
    role: 'content_creator',
    offsetDays: -3,
    defaultHours: 4,
    priority: 'high',
  },
  {
    key: 'montaggio',
    title: 'Montaggio video (10-15 contenuti)',
    description: 'Monta i video girati allo shooting (circa 10-15 contenuti).',
    role: 'content_creator',
    offsetDays: 1,
    defaultHours: 4,
    priority: 'medium',
  },
  {
    key: 'edit_foto',
    title: 'Edit foto',
    description: 'Seleziona e ritocca le foto dello shooting.',
    role: 'graphic_social',
    offsetDays: 1,
    defaultHours: 1,
    priority: 'medium',
  },
  {
    key: 'ped',
    title: 'Piano editoriale (PED)',
    description: 'Prepara il piano editoriale del mese con i contenuti dello shooting.',
    role: 'social_media_manager',
    offsetDays: 3,
    defaultHours: 2,
    priority: 'medium',
  },
  {
    key: 'grafiche',
    title: 'Fare grafiche',
    description: 'Realizza le grafiche dei post a partire dai contenuti e dal piano editoriale.',
    role: 'graphic_social',
    offsetDays: 3,
    defaultHours: 1,
    priority: 'medium',
  },
  {
    key: 'programmazione',
    title: 'Programmare post e storie',
    description: 'Programma post e storie sui canali social secondo il piano editoriale.',
    role: 'social_media_manager',
    offsetDays: 5,
    defaultHours: 2,
    priority: 'medium',
  },
];

/** Data (YYYY-MM-DD) sommando offsetDays a una data ISO. */
export function offsetDate(baseIso: string, offsetDays: number): string {
  const d = new Date(baseIso);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
