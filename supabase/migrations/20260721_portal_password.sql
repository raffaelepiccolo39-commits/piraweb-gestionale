-- ============================================================
-- Portale: sapere se il cliente ha scelto la sua password
-- ============================================================
--
-- L'invito porta a una sessione già aperta tramite link firmato, ma la
-- password non veniva mai impostata: l'account nasceva con una casuale che
-- nessuno conosce. Risultato — l'unico modo per entrare era quel link, e
-- quando scadeva il cliente restava fuori senza rimedio.
--
-- Questa colonna dice se la password è stata scelta. Finché è NULL, il
-- portale porta l'utente alla schermata di benvenuto invece che alla
-- griglia.
-- ============================================================

ALTER TABLE client_portal_users
  ADD COLUMN IF NOT EXISTS password_set_at TIMESTAMPTZ;

COMMENT ON COLUMN client_portal_users.password_set_at IS
  'Quando il cliente ha scelto la propria password. NULL = entra solo col link di invito, che scade.';

-- Gli accessi già creati prima di questa correzione non hanno una password
-- scelta: restano NULL e alla prossima entrata verrà chiesta.

NOTIFY pgrst, 'reload schema';
