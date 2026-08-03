/**
 * Dove vivono le API quando l'app non è un sito.
 *
 * Nel browser il gestionale chiama `/api/...` e il percorso relativo si
 * risolve sul proprio dominio. Dentro il pacchetto iOS/Android non c'è
 * nessun dominio: le pagine sono file locali, servite su `capacitor://` o
 * `file://`, e un percorso relativo punterebbe dentro il pacchetto stesso —
 * dove le API non ci sono, perché restano su Vercel.
 *
 * Le chiamate a `/api/` nel codice sono 62. Invece di riscriverle tutte, si
 * intercetta `fetch` una volta sola: se stiamo girando nel pacchetto,
 * ai soli percorsi `/api/...` viene anteposto l'indirizzo di produzione.
 * Nel browser la funzione non fa assolutamente nulla.
 *
 * `credentials: 'include'` serve perché i cookie di sessione Supabase
 * viaggiano verso un'origine diversa da quella della pagina.
 */

export function isPackagedApp(): boolean {
  if (typeof window === 'undefined') return false;
  const p = window.location.protocol;
  return p === 'capacitor:' || p === 'file:' || p === 'ionic:';
}

/**
 * Il token della sessione, letto dove Supabase lo ha scritto.
 *
 * Nel pacchetto la sessione sta in localStorage (sullo schema
 * `capacitor://` i cookie non sopravvivono), quindi ogni chiamata a /api
 * arriverebbe al server senza credenziali — e il server risponderebbe 401.
 * Qui si recupera il token per poterlo mettere nell'intestazione.
 */
function tokenSessione(): string | null {
  try {
    const grezzo = window.localStorage.getItem('pw-sessione');
    if (!grezzo) return null;

    const barattolo = JSON.parse(grezzo) as Record<string, string>;
    const pezzi = Object.keys(barattolo).filter((k) => k.includes('auth-token')).sort();
    if (pezzi.length === 0) return null;

    let valore = pezzi.map((k) => barattolo[k]).join('');
    if (valore.startsWith('base64-')) {
      valore = atob(valore.slice(7).replace(/-/g, '+').replace(/_/g, '/'));
    }

    const sessione = JSON.parse(valore) as { access_token?: string };
    return sessione.access_token ?? null;
  } catch {
    return null;
  }
}

let installed = false;

export function installApiOriginPatch(): void {
  if (installed || typeof window === 'undefined') return;
  if (!isPackagedApp()) return;

  const origin = process.env.NEXT_PUBLIC_API_ORIGIN;
  if (!origin) {
    // Meglio saperlo subito che vedere ogni chiamata fallire senza spiegazione.
    console.error('[api-origin] NEXT_PUBLIC_API_ORIGIN non configurato: le chiamate alle API falliranno');
    return;
  }

  const nativeFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (url.startsWith('/api/')) {
      url = origin.replace(/\/$/, '') + url;

      // Il cookie non c'e' e non ci sara': si manda il token. Senza questo
      // ogni rotta protetta risponde 401 e nell'app le funzioni che passano
      // dal server sembrano semplicemente non funzionare.
      const token = tokenSessione();
      const headers = new Headers(init?.headers || (typeof input === 'object' && 'headers' in input ? input.headers : undefined));
      if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);

      return nativeFetch(url, { ...init, headers, credentials: 'include' });
    }
    return nativeFetch(input as RequestInfo, init);
  };

  installed = true;
}
