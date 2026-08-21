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
import { accessoNegato } from '@/lib/rotte-admin';

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
  /**
   * Visibile solo a questi ruoli. L'admin vede sempre tutto, quindi non va
   * elencato. Serve per le voci che riguardano un mestiere solo — le
   * credenziali dei social le usa chi i social li gestisce.
   */
  roles?: string[];
}

export interface NavSection {
  label?: string;
  items: NavItem[];
  adminOnly?: boolean;
}

/**
 * Chi vede una voce. Una funzione sola, usata dalla barra laterale e dal
 * foglio del menu: erano due filtri identici scritti due volte, e bastava
 * ritoccarne uno per farli divergere senza accorgersene.
 */
export function voceVisibile(item: NavItem, ruolo: string | null | undefined): boolean {
  const isAdmin = ruolo === 'admin';
  if (item.adminOnly && !isAdmin) return false;
  if (item.roles && !isAdmin && !item.roles.includes(ruolo ?? '')) return false;
  // Doppia mandata: anche la regola del middleware deve essere d'accordo.
  // Se i due elenchi divergono si sbaglia nascondendo, non esponendo —
  // dimenticare una voce qui fa sparire un link, dimenticarla in
  // rotte-admin.ts lasciava una pagina aperta a tutti.
  return !accessoNegato(item.href, ruolo);
}

export const navSections: NavSection[] = [
  // Una lista sola, senza gruppi, nell'ordine deciso dal referente.
  //
  // Le voci riservate NON stanno più tutte in coda: sono intercalate dove
  // servono. Per chi non è admin la lista si accorcia da sola — restano
  // otto voci, senza buchi visibili.
  {
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      // La bacheca vive dentro /team come prima scheda: il contatore delle
      // proprie task aperte segue lei.
      { label: 'Bacheca team', href: '/team', icon: MessageSquare, badgeKey: 'tasks' },
      { label: 'Calendario', href: '/calendario', icon: Calendar },
      { label: 'Piano Editoriale', href: '/contenuti', icon: Sparkles },
      { label: 'Gestione', href: '/gestione', icon: Crown, adminOnly: true },
      { label: 'Gestione Siti', href: '/gestione-siti', icon: Globe, adminOnly: true },
      { label: 'Crediti', href: '/crediti', icon: HandCoins, adminOnly: true },
      { label: 'Ferie & Permessi', href: '/ferie', icon: Plane },
      // Fuori dal menu del team dal 21/08/2026, per scelta del referente.
      // Attenzione: qui si nasconde soltanto. La pagina resta APERTA a chi
      // conosce l'indirizzo, ed e' voluto — il team continua a usare la
      // scheda cliente per materiali, messaggi, idee, asset e knowledge base.
      // Se un giorno servisse chiuderla davvero, la porta e' ADMIN_ROUTES in
      // lib/rotte-admin.ts, non questa riga.
      { label: 'Clienti', href: '/clients', icon: Users, adminOnly: true },
      // Le credenziali dei profili social: le vede chi i social li gestisce.
      // L'archivio è ancora vuoto (zero credenziali al 18-08-2026).
      { label: 'Accessi', href: '/accessi', icon: KeyRound, roles: ['social_media_manager'] },
      { label: 'Note Clienti', href: '/note-clienti', icon: NotebookPen },
      { label: 'Suggerimenti & Bug', href: '/note-dev', icon: MessageSquareWarning },
      { label: 'Log errori', href: '/log', icon: ScrollText, adminOnly: true },
    ],
  },
];
