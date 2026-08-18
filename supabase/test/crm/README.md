# Test del CRM commerciale

Le migration del CRM (`20260818*`) portano regole che vivono nel database:
validazioni bloccanti, transizioni di stage, lead score calcolato, calendario
delle ore lavorative. Sono la parte che non si può provare guardandola.

Questi test le eseguono davvero, su un PostgreSQL vero — [PGlite][pglite],
Postgres compilato in WebAssembly. Non serve Docker, non serve un server, e
soprattutto non si tocca il database di produzione.

```bash
npm run test:crm
```

## Cosa fa

1. `prereq.sql` ricostruisce lo schema esistente su cui la migration poggia
   (profiles, deals, clients, notifications, company_settings, gli enum e i
   trigger legacy). È una copia delle migration reali: se cambia il vero
   schema, va aggiornato anche questo, altrimenti i test danno una sicurezza
   che non hanno.
2. `seed.sql` mette dentro cinque trattative nella forma in cui stavano in
   produzione prima del rilascio, così si verifica anche il backfill.
3. `test.mjs` applica le migration in ordine e ripercorre i criteri di
   accettazione della §12 della specifica.
4. `test-import.mjs` compila il modulo vero di import CSV e lo prova su un
   tracciato con una riga volutamente sbagliata (AC-15).

## Cosa NON coprono

- La RLS: PGlite gira come superutente e le policy non scattano. Le regole di
  accesso vanno provate in ambiente vero, con un utente non admin.
- L'interfaccia. Il drag & drop, il modale della vista Oggi e la Sales Review
  si provano con un browser.

[pglite]: https://pglite.dev
