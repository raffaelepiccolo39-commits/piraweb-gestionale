import {
  LayoutDashboard,
  Calendar,
  MessageSquare,
  CalendarClock,
  Clock,
  NotebookPen,
  Plane,
  MessageSquareWarning,
  Sparkles,
  Users,
  KeyRound,
  Globe,
  HandCoins,
  Crown,
  ScrollText,
  Settings,
} from 'lucide-react';

/**
 * Config di navigazione condivisa da sidebar (desktop), barra in basso e menu a
 * foglio (mobile). Un'unica fonte: aggiungere una voce qui la fa comparire
 * ovunque, senza duplicazioni.
 */
export interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badgeKey?: string;
  dot?: boolean;
  adminOnly?: boolean;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
  adminOnly?: boolean;
}

export const navSections: NavSection[] = [
  {
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Calendario', href: '/calendario', icon: Calendar },
    ],
  },
  {
    label: 'Team',
    items: [
      // La bacheca vive qui dentro, come prima scheda: il contatore delle
      // proprie task aperte segue lei, altrimenti sparirebbe dal menu.
      { label: 'Bacheca team', href: '/team', icon: MessageSquare, badgeKey: 'tasks' },
      { label: 'Pianificazione', href: '/pianificazione', icon: CalendarClock },
      { label: 'Timesheet', href: '/timesheet', icon: Clock, adminOnly: true },
      { label: 'Note Clienti', href: '/note-clienti', icon: NotebookPen },
      { label: 'Ferie & Permessi', href: '/ferie', icon: Plane },
      { label: 'Suggerimenti & Bug', href: '/note-dev', icon: MessageSquareWarning },
    ],
  },
  {
    label: 'Lavoro',
    items: [
      { label: 'Piano Editoriale', href: '/contenuti', icon: Sparkles },
    ],
  },
  {
    label: 'Business',
    items: [
      { label: 'Clienti', href: '/clients', icon: Users },
      // Non adminOnly: il team vede le credenziali (scelta del 2026-08-03).
      { label: 'Accessi', href: '/accessi', icon: KeyRound },
      // CRM e Cashflow non stanno qui: sono due schede di "Gestione", e
      // avere due strade per la stessa pagina è il disordine che si è
      // tolto il 18-08-2026.
      { label: 'Gestione Siti', href: '/gestione-siti', icon: Globe, adminOnly: true },
      { label: 'Crediti', href: '/crediti', icon: HandCoins, adminOnly: true },
    ],
  },
  {
    label: 'Admin',
    adminOnly: true,
    items: [
      { label: 'Gestione', href: '/gestione', icon: Crown },
      { label: 'Log errori', href: '/log', icon: ScrollText },
      { label: 'Impostazioni', href: '/settings', icon: Settings },
    ],
  },
];
