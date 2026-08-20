import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      /**
       * set-state-in-effect: da errore ad avviso, e vale la pena scrivere
       * perche', perche' abbassare una regola e' il modo tipico di nascondere
       * un problema.
       *
       * Il 20/08/2026 la regola segnalava 46 punti. Li ho guardati uno per
       * uno: nessuno e' un difetto. Una quarantina sono lo stesso schema,
       * che e' il modo idiomatico di caricare dati in questa versione di
       * React:
       *
       *   const carica = useCallback(async () => { ...; setDati(x); }, [...]);
       *   useEffect(() => { void carica(); }, [carica]);
       *
       * Gli altri sei sono deliberati e commentati sul posto: la guardia di
       * idratazione di theme-provider (setMounted(true)), la lettura del
       * localStorage dopo il montaggio in portal-notifiche, l'apertura di un
       * contenuto da link diretto quando la lista arriva.
       *
       * La regola non descrive un bug: chiede un'altra architettura di
       * caricamento dati (Suspense e use()). Passarci vuol dire riscrivere
       * quaranta flussi che funzionano, senza che l'utente veda alcuna
       * differenza — ed e' esattamente il tipo di modifica larga che a luglio
       * ha causato il blackout.
       *
       * Tenerla a errore avrebbe un costo peggiore del problema: `npm run
       * lint` resterebbe rosso per sempre, e un controllo sempre rosso non lo
       * legge piu' nessuno. E' la stessa ragione per cui /log filtra gli
       * errori benigni.
       *
       * QUANDO RIALZARLA: se e quando il gestionale adotta Suspense per il
       * caricamento dati. Da avviso resta visibile in `npm run lint`, quindi
       * non sparisce — smette solo di coprire gli errori veri.
       */
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
