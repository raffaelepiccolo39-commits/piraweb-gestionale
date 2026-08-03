-- Le due viste dei pagamenti giravano coi permessi di chi le ha create
-- (postgres), non di chi le interroga: cosi' scavalcavano l'RLS delle tabelle
-- sotto. Verificato il 2026-08-01 con l'accesso di un cliente del portale:
-- `clients` e `projects` gli restituivano 0 righe (giusto), ma
-- v_project_payment_summary gli dava budget, incassato e residuo di TUTTI i
-- 16 progetti, e v_client_open_installments i saldi aperti di altri clienti.
--
-- security_invoker le fa girare coi permessi di chi legge: da qui in poi le
-- viste vedono esattamente quello che l'utente vedrebbe interrogando le
-- tabelle a mano. Il team continua a leggerle come prima, il cliente no.
--
-- Le due viste sono definite in 20260601_client_installments.sql: se un
-- domani vengono ricreate con CREATE OR REPLACE VIEW, l'impostazione resta
-- (e' una proprieta' della vista), ma se vengono DROPpate va rimessa.

ALTER VIEW public.v_project_payment_summary SET (security_invoker = on);
ALTER VIEW public.v_client_open_installments SET (security_invoker = on);
