/**
 * Identificativi dei sistemi di IA censiti (tabella ai_systems).
 *
 * UUID FISSI, non generati: così il codice può referenziare un sistema per
 * costante (come chiede §5 della specifica) e il seed li inserisce con lo
 * stesso id. Devono restare allineati alla migration `20260814e_ai_act_seed`.
 */

export const SISTEMI = {
  CLAUDE_API: '0a1ac701-0000-4000-8000-000000000001',
  CLAUDE_UI: '0a1ac701-0000-4000-8000-000000000002',
  CHATGPT: '0a1ac701-0000-4000-8000-000000000003',
  GEMINI: '0a1ac701-0000-4000-8000-000000000004',
  MIDJOURNEY: '0a1ac701-0000-4000-8000-000000000005',
  CAPCUT: '0a1ac701-0000-4000-8000-000000000006',
  CANVA: '0a1ac701-0000-4000-8000-000000000007',
  META_ADVANTAGE: '0a1ac701-0000-4000-8000-000000000008',
} as const;

/**
 * Le route AI del gestionale scelgono il provider a runtime (Claude primario,
 * Gemini/OpenAI in fallback). Il sistema loggato è quello DAVVERO usato, non
 * quello preferito: qui si risolve dal nome provider.
 */
export function sistemaDaProvider(provider: 'claude' | 'openai' | 'gemini'): string {
  switch (provider) {
    case 'openai':
      return SISTEMI.CHATGPT;
    case 'gemini':
      return SISTEMI.GEMINI;
    case 'claude':
    default:
      return SISTEMI.CLAUDE_API;
  }
}
