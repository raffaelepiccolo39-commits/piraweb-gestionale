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
5. `test-rls.mjs` fa `SET ROLE authenticated` e ripete le stesse domande nei
   panni di una dipendente: cosa vede, cosa può scrivere.

## Perché esiste test-rls.mjs

All'inizio queste suite giravano solo da superutente, e da superutente la RLS
non scatta: passavano anche con le policy sbagliate. Il 18/08/2026 una prova
in produzione con un account `content_creator` ha mostrato che si potevano
attaccare attività a trattative che quell'account non riusciva nemmeno a
leggere. La 20260818f ha chiuso il buco, e questa suite serve a impedirgli di
tornare: togliendo quella migration dall'elenco, tre test falliscono.

## Cosa NON coprono

- L'interfaccia. Il drag & drop, il modale della vista Oggi e la Sales Review
  si provano con un browser.
- I ruoli che non esistono ancora nell'enum `user_role`, Sales Ops in testa.

[pglite]: https://pglite.dev
