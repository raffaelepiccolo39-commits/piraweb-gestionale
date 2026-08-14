/**
 * Logger delle generazioni IA (art. 12 e considerando sulla tracciabilità).
 *
 * Ogni chiamata a un modello IA dal gestionale scrive qui la propria evidenza,
 * in ai_generations. Regole vincolanti (§5 della specifica):
 *   - il prompt NON si salva mai in chiaro: solo hash SHA-256;
 *   - la sintesi è opzionale, sanificata, e in dubbio resta null;
 *   - nessuna chiave API tocca il database o i log;
 *   - scrittura con service role, come error_logs/perf_logs (RLS: nessuna
 *     policy INSERT pubblica su ai_generations).
 *
 * NON BLOCCANTE: se la scrittura fallisce, la generazione dell'utente non deve
 * fallire. L'errore va in console e nel registro errori, non all'utente.
 */

import { createHash } from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';
import { valutaEtichetta, type ContestoGenerazione } from './valutaEtichetta';
import type { TipoOutput } from './tipi';

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/**
 * Toglie i dati personali strutturati dal testo (email, telefoni, CF, P.IVA).
 *
 * ⚠️ I nomi propri dell'anagrafica clienti NON sono ancora coperti: finché
 * questa funzione non è testata sull'anagrafica reale (§9), la sintesi resta
 * DISATTIVATA e si salva solo l'hash. È il comportamento "in dubbio, null".
 */
export function sanitizza(testo: string): string {
  return testo
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\b(?:\+39\s?)?(?:\d[\s.-]?){9,10}\d\b/g, '[tel]')
    .replace(/\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/gi, '[cf]') // codice fiscale
    .replace(/\b\d{11}\b/g, '[piva]')
    .trim();
}

/**
 * Contesto conservativo di default: nessun contenuto sintetico, nessuna
 * finalità informativa pubblica → l'etichetta risulta NON_RICHIESTA (R6). È il
 * default giusto per copy/script/descrizioni interne; i casi che richiedono
 * etichetta (voce clonata, testo di interesse pubblico) vanno marcati a mano.
 */
export function contestoNeutro(tipoOutput: TipoOutput): ContestoGenerazione {
  return {
    tipoOutput,
    contieneVoceClonata: false,
    contieneVoltoSintetico: false,
    rappresentaPersonaReale: false,
    scenaFotorealistica: false,
    finalitaInformativaPubblica: false,
    operaManifestamenteCreativa: false,
    revisioneEditorialeUmana: false,
    responsabileEditoriale: null,
  };
}

export interface DatiGenerazione {
  sistemaId: string;
  modello: string;
  tipoOutput: TipoOutput;
  prompt: string;
  utenteId: string;
  clienteId?: string | null;
  progetto?: string | null;
  contesto: ContestoGenerazione;
  usage?: { input_tokens?: number; output_tokens?: number };
  outputRef?: string | null;
  outputHash?: string | null;
}

/**
 * Registra una generazione. Ritorna l'id della riga, o null se il logging è
 * fallito (senza mai sollevare).
 */
export async function logGenerazione(dati: DatiGenerazione): Promise<string | null> {
  try {
    const valutazione = valutaEtichetta(dati.contesto);
    const service = await createServiceRoleClient();

    const { data, error } = await service
      .from('ai_generations')
      .insert({
        sistema_id: dati.sistemaId,
        modello: dati.modello,
        tipo_output: dati.tipoOutput,
        prompt_hash: sha256(dati.prompt),
        // Sintesi disattivata finché sanitizza() non è validata sull'anagrafica
        // reale: si salva solo l'hash. Vedi commento su sanitizza().
        prompt_sintesi: null,
        token_input: dati.usage?.input_tokens ?? null,
        token_output: dati.usage?.output_tokens ?? null,
        utente_id: dati.utenteId,
        cliente_id: dati.clienteId ?? null,
        progetto: dati.progetto ?? null,
        output_ref: dati.outputRef ?? null,
        output_hash: dati.outputHash ?? null,
        esito_etichetta: valutazione.esito,
        regola_applicata: valutazione.regolaApplicata,
        testo_etichetta: valutazione.testoSuggerito,
      })
      .select('id')
      .single();

    if (error) throw new Error(error.message);
    return data.id;
  } catch (err) {
    // Non blocca la generazione: registra e prosegue.
    await logError({ error: err, route: 'ai-act/logger', source: 'api', context: { sistemaId: dati.sistemaId } });
    return null;
  }
}
