import {
  LayoutDashboard,
  ListTodo,
  FolderKanban,
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
  Briefcase,
  Globe,
  HandCoins,
  Wallet,
  Crown,
  ScrollText,
  ShieldCheck,
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
      { label: 'Bacheca', href: '/tasks', icon: ListTodo, badgeKey: 'tasks' },
      { label: 'Progetti', href: '/projects', icon: FolderKanban },
      { label: 'Calendario', href: '/calendario', icon: Calendar },
    ],
  },
  {
    label: 'Team',
    items: [
      { label: 'Bacheca Task', href: '/team', icon: MessageSquare },
      { label: 'Pianificazione', href: '/pianificazione', icon: CalendarClock },
      { label: 'Timesheet', href: '/timesheet', icon: Clock },
      { label: 'Note Clienti', href: '/note-clienti', icon: NotebookPen },
      { label: 'Ferie & Permessi', href: '/ferie', icon: Plane },
      { label: 'Suggerimenti & Bug', href: '/note-dev', icon: MessageSquareWarning },
    ],
  },
  {
    label: 'Lavoro',
    items: [
      { label: 'Contenuti', href: '/contenuti', icon: Sparkles },
    ],
  },
  {
    label: 'Business',
    items: [
      { label: 'Clienti', href: '/clients', icon: Users },
      // Non adminOnly: il team vede le credenziali (scelta del 2026-08-03).
      { label: 'Accessi', href: '/accessi', icon: KeyRound },
      { label: 'CRM', href: '/crm', icon: Briefcase, adminOnly: true },
      { label: 'Gestione Siti', href: '/gestione-siti', icon: Globe, adminOnly: true },
      { label: 'Crediti', href: '/crediti', icon: HandCoins, adminOnly: true },
      { label: 'Cashflow', href: '/cashflow', icon: Wallet, adminOnly: true },
      // Non adminOnly: il team deve accedere alla propria formazione (art. 4).
      { label: 'Conformità IA', href: '/ai-act', icon: ShieldCheck },
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
