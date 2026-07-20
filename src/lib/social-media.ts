import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Media dei post social.
 *
 * In `social_posts.media_urls` salviamo il PERCORSO nel bucket privato
 * `social-media`, non un URL. È una lezione già pagata: negli allegati della
 * bacheca si salvava getPublicUrl su un bucket privato, ottenendo link che
 * rispondevano 403. Col percorso, il link firmato si genera al momento della
 * lettura e la scadenza la decidiamo noi.
 *
 * Convenzione: social/<client_id>/<file>
 * Il client_id nel percorso è ciò su cui la policy dello storage decide se
 * un cliente può vedere quel file — non è un dettaglio estetico.
 */

export const SOCIAL_MEDIA_BUCKET = 'social-media';

/** Un'ora: il tempo di guardare la griglia, non di girare il link. */
const SIGNED_URL_TTL = 3600;

export function buildMediaPath(clientId: string, fileName: string): string {
  const safe = fileName.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '');
  // Prefisso casuale: due file con lo stesso nome non si sovrascrivono.
  return `social/${clientId}/${crypto.randomUUID().slice(0, 8)}-${safe}`;
}

/**
 * Risolve i percorsi in link firmati, in una sola chiamata.
 * I valori che sono già URL completi (eventuali dati vecchi) passano intatti.
 */
export async function resolveMediaUrls(
  supabase: SupabaseClient,
  paths: string[]
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const toSign: string[] = [];

  for (const p of paths) {
    if (!p) continue;
    if (p.startsWith('http://') || p.startsWith('https://')) out[p] = p;
    else toSign.push(p);
  }

  if (toSign.length === 0) return out;

  const { data } = await supabase.storage
    .from(SOCIAL_MEDIA_BUCKET)
    .createSignedUrls(toSign, SIGNED_URL_TTL);

  for (const item of data || []) {
    if (item.signedUrl && item.path) out[item.path] = item.signedUrl;
  }
  return out;
}
