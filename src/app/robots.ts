// Statico anche in esportazione: senza questa riga il build in modalita app
// si ferma qui ("dynamic non configurato"). Non dipendono dalla richiesta,
// quindi dichiararlo e' corretto anche per il sito.
export const dynamic = 'force-static';

import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/settings/', '/note-dev/'],
      },
    ],
  };
}
