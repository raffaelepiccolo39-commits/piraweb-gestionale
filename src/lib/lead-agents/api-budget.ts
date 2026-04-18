/**
 * Sistema di tracking budget API Google Places.
 * Limite: 100€/mese (~3000 ricerche a $0.032/ricerca)
 * Salva il conteggio in Supabase per persistenza tra deploy.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const MONTHLY_BUDGET_EUR = 100;
const COST_PER_SEARCH_EUR = 0.03; // ~$0.032 ≈ €0.03
const MAX_MONTHLY_SEARCHES = Math.floor(MONTHLY_BUDGET_EUR / COST_PER_SEARCH_EUR); // ~3333

/**
 * Controlla se ci sono ancora crediti disponibili per il mese corrente.
 * Ritorna il numero di ricerche rimanenti, o 0 se budget esaurito.
 */
export async function checkApiBudget(supabase: SupabaseClient): Promise<{
  allowed: boolean;
  used: number;
  remaining: number;
  limit: number;
  budgetEur: number;
  spentEur: number;
}> {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { data } = await supabase
    .from('api_usage')
    .select('count')
    .eq('service', 'google_places')
    .eq('month', monthKey)
    .maybeSingle();

  const used = data?.count || 0;
  const remaining = Math.max(0, MAX_MONTHLY_SEARCHES - used);
  const spentEur = Math.round(used * COST_PER_SEARCH_EUR * 100) / 100;

  return {
    allowed: remaining > 0,
    used,
    remaining,
    limit: MAX_MONTHLY_SEARCHES,
    budgetEur: MONTHLY_BUDGET_EUR,
    spentEur,
  };
}

/**
 * Registra N ricerche Google Places effettuate.
 * Usa upsert per incrementare il contatore atomicamente.
 */
export async function trackApiUsage(supabase: SupabaseClient, searches: number): Promise<void> {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Try upsert: increment if exists, insert if not
  const { data: existing } = await supabase
    .from('api_usage')
    .select('id, count')
    .eq('service', 'google_places')
    .eq('month', monthKey)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('api_usage')
      .update({ count: existing.count + searches, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('api_usage')
      .insert({ service: 'google_places', month: monthKey, count: searches });
  }
}

export { MAX_MONTHLY_SEARCHES, MONTHLY_BUDGET_EUR, COST_PER_SEARCH_EUR };
