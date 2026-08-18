'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SkeletonList } from '@/components/ui/skeleton';

/**
 * La bacheca è confluita in /tasks.
 *
 * Erano due pagine sulla stessa tabella: questa smistava il lavoro fra le
 * persone, /tasks serviva a ritrovarlo. Ora sono due viste della stessa
 * pagina. L'indirizzo sopravvissuto è /tasks perché ci puntano le card della
 * dashboard, la scorciatoia dell'app e il widget del profilo.
 *
 * Il reindirizzamento è lato client e non in next.config: la build del
 * pacchetto iOS/Android usa `output: 'export'`, dove i redirect di
 * configurazione non esistono e questa pagina resterebbe un vicolo cieco.
 */
export default function BachecaRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/tasks');
  }, [router]);

  return <SkeletonList variant="card" count={4} />;
}
