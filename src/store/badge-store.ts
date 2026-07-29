import { create } from 'zustand';

/**
 * Contatori delle pastiglie di navigazione (task aperti, chat non letta,
 * notifiche non lette).
 *
 * Perché uno store e non due useState: Header e Sidebar mostrano gli STESSI
 * numeri e li calcolavano ognuno per conto proprio, con una sottoscrizione
 * realtime a testa. Risultato: ogni messaggio in chat scritto da chiunque
 * faceva partire quattro query su ogni scheda aperta di ogni membro del team —
 * la prima voce di traffico dell'app dopo la dashboard (1.709 chiamate in
 * quattro giorni solo per due numerini). Con lo store il calcolo è uno solo e
 * i due componenti lo leggono.
 *
 * Bonus: prima i due badge della chat non coincidevano nemmeno — l'Header
 * contava i messaggi dall'ultima apertura di /chat, la Sidebar quelli delle
 * ultime 24 ore. Ora la definizione è una: non letti dall'ultima visita.
 */

interface BadgeState {
  myTasks: number;
  chatUnread: number;
  notifUnread: number;
  setCounts: (counts: Partial<Pick<BadgeState, 'myTasks' | 'chatUnread' | 'notifUnread'>>) => void;
  bumpChat: () => void;
  bumpNotif: () => void;
  clearChat: () => void;
  setNotifUnread: (n: number) => void;
}

export const useBadgeStore = create<BadgeState>((set) => ({
  myTasks: 0,
  chatUnread: 0,
  notifUnread: 0,
  setCounts: (counts) => set(counts),
  bumpChat: () => set((s) => ({ chatUnread: s.chatUnread + 1 })),
  bumpNotif: () => set((s) => ({ notifUnread: s.notifUnread + 1 })),
  clearChat: () => set({ chatUnread: 0 }),
  setNotifUnread: (notifUnread) => set({ notifUnread }),
}));
