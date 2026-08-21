-- ============================================================
-- Un colore per ogni cliente
-- ============================================================
--
-- Nella bacheca task ogni card mostra un quadratino: il logo del cliente se
-- c'è, altrimenti le sue iniziali sul colore del PROGETTO. Quel colore ha un
-- default (#4F46E5) che quasi nessuno cambia, quindi decine di clienti
-- diversi escono con lo stesso quadratino colorato uguale — e a colpo
-- d'occhio si confondono. È il motivo per cui questa colonna esiste.
--
-- Il colore sta sul CLIENTE, non sul progetto: è il cliente che si deve
-- riconoscere, e un cliente può avere più progetti.
--
-- Il riempimento sotto è la parte che conta. Aggiungere solo la colonna
-- avrebbe lasciato tutti i clienti a NULL, cioè esattamente com'erano: il
-- problema si sarebbe risolto solo per i clienti a cui qualcuno fosse andato
-- ad assegnare un colore a mano, uno per uno. Qui invece sono già tutti
-- diversi dal primo caricamento della pagina.
-- ============================================================

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS color text;

COMMENT ON COLUMN public.clients.color IS
  'Colore di riconoscimento nella bacheca task. NULL = ricavato dall''id lato applicazione (vedi lib/colori-cliente.ts), quindi non resta mai senza.';

-- Dodici colori distinguibili fra loro, gli stessi già usati per i profili
-- del team: distribuiti in ordine alfabetico e a rotazione, così due clienti
-- vicini nell'elenco non finiscono mai con lo stesso colore.
WITH numerati AS (
  SELECT
    id,
    (ROW_NUMBER() OVER (ORDER BY COALESCE(company, name), id) - 1) % 12 AS posto
  FROM public.clients
  WHERE color IS NULL
)
UPDATE public.clients c
SET color = (ARRAY[
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#10b981', '#14b8a6', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899'
])[n.posto + 1]
FROM numerati n
WHERE c.id = n.id;

NOTIFY pgrst, 'reload schema';
