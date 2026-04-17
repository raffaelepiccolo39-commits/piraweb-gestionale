-- Tabella per salvare i segreti TOTP per la 2FA
create table if not exists user_totp (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  secret text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

-- RLS: solo il service role può accedere (le API usano service role client)
alter table user_totp enable row level security;

-- Policy: nessun accesso diretto dal browser (solo via API server-side con service role)
-- Non creiamo policy per anon/authenticated, così il browser non può leggere/scrivere i secrets
