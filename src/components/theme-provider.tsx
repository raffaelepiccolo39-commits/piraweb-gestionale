'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  toggleTheme: () => {},
  setTheme: () => {},
});

/**
 * Il tema e' fisso sul chiaro.
 *
 * La modalita' notte e' stata tolta: due temi vogliono dire ogni schermata
 * disegnata due volte e controllata due volte, e ogni colore scritto a mano
 * invece che con un token diventa un difetto che si vede solo in uno dei due
 * (e' successo davvero: il logo bianco su fondo bianco nel portale).
 *
 * Il contesto resta in piedi, cosi' chi legge useTheme() continua a
 * funzionare senza modifiche, e riaccenderla un domani vuol dire rimettere
 * queste venti righe — non ricucire mezza applicazione.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
    // Si toglie anche la preferenza salvata: chi aveva scelto lo scuro
    // altrimenti se la ritroverebbe al primo riaccendersi della funzione.
    try {
      localStorage.removeItem('pw-theme');
      localStorage.removeItem('darkMode');
    } catch { /* modalita' privata */ }
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <ThemeContext.Provider value={{ theme: 'light', toggleTheme: () => {}, setTheme: () => {} }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
