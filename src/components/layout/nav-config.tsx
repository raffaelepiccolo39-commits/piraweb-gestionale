import {
  LayoutDashboard,
  Calendar,
  MessageSquare,
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
  // Una lista sola, senza gruppi.
  //
  // I gruppi erano cinque per tredici voci: più etichette che sezioni, e
  // ogni volta che una pagina cambiava casa bisognava discutere in quale
  // gruppo mettere. Senza, l'unica cosa che guida l'occhio è l'ordine — e
  // l'ordine è quello d'uso: prima quello che si apre ogni giorno, in fondo
  // quello che si apre quando serve. Le voci riservate stanno in coda, così
  // per chi non è admin la lista finisce pulita.
  {
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      // La bacheca vive dentro /team come prima scheda: il contatore delle
      // proprie task aperte segue lei.
      { label: 'Bacheca team', href: '/team', icon: MessageSquare, badgeKey: 'tasks' },
      { label: 'Calendario', href: '/calendario', icon: Calendar },
      { label: 'Piano Editoriale', href: '/contenuti', icon: Sparkles },
      { label: 'Clienti', href: '/clients', icon: Users },
      // Non adminOnly: il team vede le credenziali (scelta del 2026-08-03).
      { label: 'Accessi', href: '/accessi', icon: KeyRound },
      { label: 'Note Clienti', href: '/note-clienti', icon: NotebookPen },
      { label: 'Ferie & Permessi', href: '/ferie', icon: Plane },
      { label: 'Suggerimenti & Bug', href: '/note-dev', icon: MessageSquareWarning },

      // Da qui in giù solo per la direzione.
      { label: 'Gestione', href: '/gestione', icon: Crown, adminOnly: true },
      { label: 'Gestione Siti', href: '/gestione-siti', icon: Globe, adminOnly: true },
      { label: 'Crediti', href: '/crediti', icon: HandCoins, adminOnly: true },
      { label: 'Log errori', href: '/log', icon: ScrollText, adminOnly: true },
    ],
  },
];
