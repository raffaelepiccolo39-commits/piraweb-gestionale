// Modulo server-only: usa il service role di Supabase. Dal browser gli errori
// non si scrivono a mano — passano da POST /api/logs, che poi chiama logError().
// Guardia: se un modulo client importa (e usa) questo file, il build fallisce
// indicando questa riga invece di supabase/server.ts, che è solo una dipendenza.
import 'server-only';
import type { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export type ErrorLevel = 'error' | 'warning' | 'info';
export type ErrorSource = 'client' | 'server' | 'api' | 'cron' | 'boundary';

export interface LogErrorEntry {
  /** L'errore vero, oppure un messaggio se non hai un Error in mano. */
  error: unknown;
  /** Dove è successo: '/tasks', '/api/webhook/contact-form', 'cron:lead-scout'. */
  route?: string | null;
  source?: ErrorSource;
  level?: ErrorLevel;
  userId?: string | null;
  userEmail?: string | null;
  /** Qualsiasi cosa aiuti a capire: id entità, payload, parametri della query. */
  context?: Record<string, unknown>;
  request?: NextRequest | null;
  /** Stack già serializzato (arriva così dagli errori del browser). */
  stack?: string | null;
  userAgent?: string | null;
  buildId?: string | null;
}

/** Estrae un messaggio leggibile da qualunque cosa venga lanciata. */
function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    // Gli errori Supabase/Postgres sono oggetti { message, code, details, hint }
    const maybe = error as { message?: unknown };
    if (typeof maybe.message === 'string') return maybe.message;
    try {
      return JSON.stringify(error).slice(0, 500);
    } catch {
      return 'Errore non serializzabile';
    }
  }
  return String(error);
}

function stackOf(error: unknown): string | null {
  if (error instanceof Error && error.stack) return error.stack.slice(0, 8000);
  return null;
}

/**
 * Normalizza il messaggio per il raggruppamento: toglie le parti variabili
 * (id, numeri, date, url) così "task 3f2a… non trovato" e "task 9b1c… non
 * trovato" finiscono nello stesso gruppo invece di generare rumore.
 */
function normalize(message: string): string {
  return message
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>')
    .replace(/https?:\/\/[^\s"')]+/g, '<url>')
    .replace(/\b\d{4}-\d{2}-\d{2}(t[\d:.]+z?)?\b/g, '<date>')
    .replace(/\b\d+\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

/** Hash stabile (djb2) — serve solo a raggruppare, non a proteggere nulla. */
function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function fingerprintOf(source: string, route: string | null | undefined, message: string): string {
  return hash(`${source}|${route ?? '-'}|${normalize(message)}`);
}

/**
 * Registra un errore in error_logs.
 *
 * Non lancia MAI e non blocca il flusso chiamante: se il logging fallisce,
 * lo segnala in console e basta. Un errore nel logger non deve mai diventare
 * un secondo errore per l'utente.
 *
 * Usa il service role perché error_logs non ha policy di INSERT (stesso
 * pattern di logAudit in lib/audit.ts).
 */
/**
 * Cose che finivano in /log come errori ma non lo sono.
 *
 * Il 21/07 su trenta "errori" registrati, venti erano comportamenti previsti:
 * la difesa che respinge un cliente, due schede aperte che si contendono la
 * sessione, una password riscritta uguale. Un registro pieno di roba normale
 * e' un registro che non si guarda piu', ed e' cosi' che passano inosservati
 * quelli veri.
 *
 * Non si nasconde niente: restano tutti in /log, ma come warning. La riga
 * dice anche PERCHE' non e' un errore, cosi' chi la incontra fra sei mesi non
 * deve rifare questo ragionamento.
 */
const PREVISTI: { indizio: RegExp; perche: string }[] = [
  {
    indizio: /accesso cliente: non pu.* avere un profilo del team/i,
    perche: 'la difesa contro i clienti promossi a dipendenti sta funzionando',
  },
  {
    indizio: /duplicate key value violates unique constraint "profiles_pkey"/i,
    perche: 'il profilo esisteva gia: due richieste in parallelo, nessun dato perso',
  },
  {
    indizio: /Lock .*(stole|steal|broken)/i,
    perche: 'due schede aperte che si contendono la sessione: Supabase se la sbriga',
  },
  {
    indizio: /Failed to load chunk|ChunkLoadError|Loading chunk \d+ failed/i,
    perche: 'scheda rimasta aperta da prima di un rilascio: basta ricaricare',
  },
  {
    indizio: /New password should be different from the old password/i,
    perche: "l'utente ha riscritto la stessa password: glielo dice la schermata",
  },
  {
    indizio: /Email link is invalid or has expired/i,
    perche: 'link di invito scaduto: si rimanda dalla scheda del cliente',
  },
  {
    // [\s\S] e non '.': il messaggio di OpenAI va a capo, e il punto non
    // attraversa le righe. Il flag 's' farebbe lo stesso ma il progetto
    // compila per ES2017, che non lo ammette.
    indizio: /Whisper \d+:[\s\S]*(quota|insufficient)/i,
    perche: "riserva di trascrizione senza credito: il motore primario e' Gemini",
  },
];

function previsto(message: string): string | null {
  return PREVISTI.find((p) => p.indizio.test(message))?.perche ?? null;
}

export async function logError(entry: LogErrorEntry): Promise<void> {
  try {
    const message = messageOf(entry.error);
    const source = entry.source ?? 'server';
    const route = entry.route ?? null;

    const supabase = await createServiceRoleClient();

    const userAgent = entry.userAgent
      ?? entry.request?.headers.get('user-agent')
      ?? null;

    // Se e' una delle cose previste, scende a warning: resta consultabile ma
    // non conta come problema. Chi passa un livello piu' basso di 'error' lo
    // ha gia' deciso, e non glielo si tocca.
    const spiegazione = previsto(message);
    const livello = entry.level && entry.level !== 'error'
      ? entry.level
      : spiegazione ? 'warning' : (entry.level ?? 'error');

    await supabase.from('error_logs').insert({
      level: livello,
      source,
      message: message.slice(0, 2000),
      stack: entry.stack ?? stackOf(entry.error),
      route,
      fingerprint: fingerprintOf(source, route, message),
      user_id: entry.userId ?? null,
      user_email: entry.userEmail ?? null,
      context: spiegazione
        ? { ...(entry.context ?? {}), previsto: spiegazione }
        : entry.context ?? {},
      user_agent: userAgent,
      build_id: entry.buildId ?? process.env.NEXT_PUBLIC_BUILD_ID ?? null,
    });
  } catch (err) {
    // Ultima spiaggia: se non riusciamo nemmeno a loggare, almeno non
    // facciamo esplodere il chiamante.
    console.error('[logger] impossibile scrivere error_logs:', err);
  }
}

/**
 * Wrapper per le route API: esegue l'handler e, se lancia, logga l'errore
 * con la rotta già compilata prima di rilanciare.
 *
 * ```ts
 * export const POST = withErrorLogging('/api/tasks', async (req) => { ... });
 * ```
 */
export function withErrorLogging<T extends unknown[]>(
  route: string,
  handler: (...args: T) => Promise<Response>,
): (...args: T) => Promise<Response> {
  return async (...args: T): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      const request = (args[0] && typeof args[0] === 'object' && 'headers' in (args[0] as object)
        ? args[0]
        : null) as NextRequest | null;

      await logError({ error: err, route, source: 'api', request });
      throw err;
    }
  };
}
