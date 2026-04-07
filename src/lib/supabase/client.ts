import { createBrowserClient } from '@supabase/ssr';

let client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase URL and Anon Key are required.');
  }
  client = createBrowserClient(url, key);
  return client;
}

// Stable reference for use in React components — prevents re-renders
let stableClient: ReturnType<typeof createBrowserClient> | null = null;
export function getSupabase() {
  if (!stableClient) stableClient = createClient();
  return stableClient;
}
