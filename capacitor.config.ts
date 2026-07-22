import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Configurazione dell'app iOS/Android.
 *
 * L'app e' lo STESSO codice del sito, esportato staticamente in `out/` da
 * `npm run build:app`. Le API non stanno nel pacchetto (l'export statico non
 * le tollera): restano su Vercel e l'app le chiama da remoto — vedi
 * lib/api-origin.ts, che usa NEXT_PUBLIC_API_ORIGIN.
 *
 * webDir punta a `out`, dove il build:app deposita i file statici.
 */
const config: CapacitorConfig = {
  // Rovescio del dominio: convenzione degli identificativi app. Deve restare
  // STABILE per sempre — cambiarlo su uno store significa un'app nuova.
  appId: 'it.piraweb.gestionale',
  appName: 'Pira Web',
  webDir: 'out',

  // In produzione l'app carica i file impacchettati (out/). Durante lo
  // sviluppo si puo' puntare al server live togliendo il commento a `server`.
  // server: { url: 'https://gestionale.piraweb.it', cleartext: false },

  ios: {
    // La barra di stato non deve finire sotto il notch.
    contentInset: 'always',
  },
};

export default config;
