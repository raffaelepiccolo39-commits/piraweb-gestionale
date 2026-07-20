/**
 * Tavolozza "category tints" del gestionale: 6 tinte soffuse (+ neutra) usate
 * con sistema per i chip delle icone e le etichette di sezione. Ogni area ha la
 * sua tinta fissa, coerente in tutta l'app. È SOLO decorativa: lo stato
 * (successo/attenzione/errore) resta ai token semantici success/warning/danger.
 *
 * I valori sono definiti come CSS variables in globals.css (chiaro + scuro), qui
 * ci sono solo le coppie di classi Tailwind che le applicano. Le stringhe sono
 * letterali intere apposta, così il JIT di Tailwind le rileva.
 */
export type Tint = 'blue' | 'violet' | 'green' | 'teal' | 'amber' | 'rose' | 'neutral';

export const TINT: Record<Tint, { bg: string; fg: string }> = {
  blue: { bg: 'bg-[var(--pw-tint-blue-bg)]', fg: 'text-[var(--pw-tint-blue-fg)]' },
  violet: { bg: 'bg-[var(--pw-tint-violet-bg)]', fg: 'text-[var(--pw-tint-violet-fg)]' },
  green: { bg: 'bg-[var(--pw-tint-green-bg)]', fg: 'text-[var(--pw-tint-green-fg)]' },
  teal: { bg: 'bg-[var(--pw-tint-teal-bg)]', fg: 'text-[var(--pw-tint-teal-fg)]' },
  amber: { bg: 'bg-[var(--pw-tint-amber-bg)]', fg: 'text-[var(--pw-tint-amber-fg)]' },
  rose: { bg: 'bg-[var(--pw-tint-rose-bg)]', fg: 'text-[var(--pw-tint-rose-fg)]' },
  neutral: { bg: 'bg-pw-surface-hi', fg: 'text-pw-text-muted' },
};

/** Tinta fissa per area/percorso, così lo stesso concetto ha sempre lo stesso colore. */
export function tintForPath(href: string): Tint {
  if (href.startsWith('/clienti') || href.startsWith('/clients')) return 'blue';
  if (href.startsWith('/progetti') || href.startsWith('/projects')) return 'violet';
  if (href.startsWith('/tasks') || href.startsWith('/calendario')) return 'green';
  if (href.startsWith('/presenze') || href.startsWith('/ferie')) return 'teal';
  if (href.startsWith('/cattura') || href.startsWith('/team')) return 'amber';
  if (href.startsWith('/cfo') || href.startsWith('/gestione-siti') || href.startsWith('/direzione')) return 'rose';
  return 'neutral';
}
