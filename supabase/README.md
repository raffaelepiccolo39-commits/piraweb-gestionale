# Supabase schema

Lo schema del DB è gestito tramite **migration sequenziali** in `supabase/migrations/`.

## Applicare lo schema a un nuovo progetto Supabase

Per ricreare lo schema completo (es. su un nuovo progetto staging o dev), c'è un
bundle pronto da incollare nel SQL Editor di Supabase:

```
deploy/supabase-staging-bootstrap.sql
```

È la concatenazione automatica delle 59 migration in ordine, con bugfix applicati
e un blocco di reset iniziale (`DROP SCHEMA public CASCADE`). Lo aggiorni
rigenerandolo dalle migration:

```bash
{
  for f in supabase/migrations/*.sql; do
    echo "-- $(basename $f)"
    cat "$f"
  done
} > deploy/supabase-staging-bootstrap.sql
```

> Il vecchio `full_setup.sql` è stato **rimosso** perché si era fossilizzato a uno
> stato del DB di marzo 2026 ed era diventato fonte di confusione. Riferirsi solo
> alle migration o al bundle generato.

## Aggiungere una nuova migration

Numera in modo continuativo:

- `00001`..`00056` per le migration storiche
- `YYYYMMDDhhmmss_descrizione.sql` per quelle nuove (è la convenzione che usa anche
  la Supabase CLI)

Le migration devono essere **idempotenti** (`CREATE TABLE IF NOT EXISTS`,
`CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS` prima del `CREATE POLICY`)
così possono essere riapplicate in sicurezza.
