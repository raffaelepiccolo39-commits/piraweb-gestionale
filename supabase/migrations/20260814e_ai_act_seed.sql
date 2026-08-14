-- ============================================================
-- Seed AI Act: sistemi in uso + modulo di formazione art. 4
-- ============================================================
--
-- UUID FISSI allineati a src/lib/ai-act/sistemi.ts (il codice referenzia i
-- sistemi per costante). Idempotente: ON CONFLICT aggiorna i campi editoriali
-- ma non ricrea. Responsabile = Raffaele (admin).
--
-- ⚠️ Da rivedere prima dell'uso reale: motivazione_rischio, url_doc_fornitore,
-- training_opt_out vanno verificati sulle CONDIZIONI CONTRATTUALI effettive,
-- non presunti. Gemini è aggiunto perché generate-script lo usa in fallback,
-- anche se non era nella lista della specifica.
-- ============================================================

INSERT INTO ai_systems (id, nome, fornitore, finalita, descrizione_uso, ruolo_pira_web, classif_rischio, motivazione_rischio, output_pubblicato, responsabile_id, data_attivazione)
VALUES
  ('0a1ac701-0000-4000-8000-000000000001', 'Claude (API)', 'Anthropic PBC',
   'Generazione script e copy nel gestionale', 'Chiamate API dal gestionale per generare script video, copy e descrizioni. Output rilavorato dal team prima della pubblicazione.',
   'ENTRAMBI', 'LIMITATO', 'Sistema di IA generativa per contenuti testuali: soggetto agli obblighi di trasparenza (art. 50) ma non rientra in alcuna categoria dell''Allegato III. Nessuna decisione automatizzata su persone.', true,
   '9a137a74-d917-4f22-8113-89d8824fdb01', CURRENT_DATE),

  ('0a1ac701-0000-4000-8000-000000000002', 'Claude (interfaccia)', 'Anthropic PBC',
   'Supporto operativo, analisi, redazione documenti', 'Uso dell''interfaccia web di Claude per attività interne di supporto. Nessun output pubblicato direttamente.',
   'DEPLOYER', 'LIMITATO', 'Assistente generativo per uso interno: nessun output pubblicato automaticamente, nessuna categoria Allegato III.', false,
   '9a137a74-d917-4f22-8113-89d8824fdb01', CURRENT_DATE),

  ('0a1ac701-0000-4000-8000-000000000003', 'ChatGPT', 'OpenAI',
   'Supporto operativo', 'Uso in fallback nella generazione contenuti e per supporto interno.',
   'DEPLOYER', 'LIMITATO', 'IA generativa testuale, uso interno e in fallback: obblighi di trasparenza ma non alto rischio.', false,
   '9a137a74-d917-4f22-8113-89d8824fdb01', CURRENT_DATE),

  ('0a1ac701-0000-4000-8000-000000000004', 'Gemini', 'Google',
   'Generazione contenuti in fallback', 'Provider di fallback nella generazione script quando Claude non risponde.',
   'ENTRAMBI', 'LIMITATO', 'IA generativa testuale usata in fallback dal gestionale: stessa classificazione di Claude API.', true,
   '9a137a74-d917-4f22-8113-89d8824fdb01', CURRENT_DATE),

  ('0a1ac701-0000-4000-8000-000000000005', 'Midjourney', 'Midjourney Inc.',
   'Generazione immagini per concept e moodboard', 'Generazione immagini per concept creativi. Le immagini sono rilavorate da un designer prima dell''uso.',
   'DEPLOYER', 'LIMITATO', 'Generazione immagini: soggetta ad art. 50 se l''output è fotorealistico e pubblicato; non alto rischio. Nessuna persona reale rappresentata di norma.', true,
   '9a137a74-d917-4f22-8113-89d8824fdb01', CURRENT_DATE),

  ('0a1ac701-0000-4000-8000-000000000006', 'CapCut (funzioni IA)', 'Bytedance',
   'Editing video assistito, sottotitoli automatici', 'Funzioni IA di editing e sottotitolazione automatica nel montaggio video.',
   'DEPLOYER', 'MINIMO', 'Funzioni di supporto all''editing (sottotitoli, tagli): rischio minimo, nessun contenuto sintetico spacciato per autentico.', true,
   '9a137a74-d917-4f22-8113-89d8824fdb01', CURRENT_DATE),

  ('0a1ac701-0000-4000-8000-000000000007', 'Canva (funzioni IA)', 'Canva Pty Ltd',
   'Generazione e ritocco grafiche', 'Funzioni IA di Canva per generazione e ritocco di elementi grafici, rilavorati dal team.',
   'DEPLOYER', 'MINIMO', 'Strumenti di ritocco e generazione grafica assistita: rischio minimo.', true,
   '9a137a74-d917-4f22-8113-89d8824fdb01', CURRENT_DATE),

  ('0a1ac701-0000-4000-8000-000000000008', 'Meta Advantage+', 'Meta Platforms',
   'Ottimizzazione campagne pubblicitarie', 'Ottimizzazione automatica di targeting e budget delle campagne pubblicitarie.',
   'DEPLOYER', 'LIMITATO', 'Ottimizzazione pubblicitaria: non rientra nell''Allegato III (non è scoring creditizio, occupazione, ecc.); nessuna decisione su persone con effetti giuridici.', false,
   '9a137a74-d917-4f22-8113-89d8824fdb01', CURRENT_DATE)
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome, fornitore = EXCLUDED.fornitore, finalita = EXCLUDED.finalita,
  descrizione_uso = EXCLUDED.descrizione_uso, ruolo_pira_web = EXCLUDED.ruolo_pira_web,
  classif_rischio = EXCLUDED.classif_rischio, motivazione_rischio = EXCLUDED.motivazione_rischio,
  output_pubblicato = EXCLUDED.output_pubblicato, updated_at = now();

-- ── Modulo di formazione art. 4 (alfabetizzazione IA) ───────
INSERT INTO ai_training_modules (id, titolo, descrizione, durata_minuti, validita_mesi, obbligatorio, attivo)
VALUES
  ('0a1ac701-0000-4000-8000-0000000000f1',
   'Art. 4 AI Act — Alfabetizzazione IA, edizione 2026',
   'Modulo obbligatorio ex art. 4 Reg. UE 2024/1689: concetti base dell''IA, obblighi di trasparenza (art. 50), uso responsabile degli strumenti generativi, riconoscimento dei casi che richiedono etichettatura o revisione editoriale.',
   90, 12, true, true)
ON CONFLICT (id) DO UPDATE SET titolo = EXCLUDED.titolo, descrizione = EXCLUDED.descrizione;

NOTIFY pgrst, 'reload schema';
