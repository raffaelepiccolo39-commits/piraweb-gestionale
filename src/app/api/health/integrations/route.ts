export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getArubaConfigFromEnv } from '@/lib/aruba/client';
import { logError } from '@/lib/logger';

type CheckResult = { status: 'ok' | 'fail' | 'skipped'; detail?: string };

async function authorize(request: NextRequest): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return { ok: true };

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Non autorizzato' }, { status: 401 }) };
  }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin') {
    return { ok: false, response: NextResponse.json({ error: 'Solo admin' }, { status: 403 }) };
  }
  return { ok: true };
}

async function checkAruba(): Promise<CheckResult> {
  const config = getArubaConfigFromEnv();
  if (!config) return { status: 'skipped', detail: 'ARUBA_FE_USERNAME o ARUBA_FE_PASSWORD non impostati' };

  const baseUrl = config.env === 'production'
    ? 'https://auth.fatturazioneelettronica.aruba.it'
    : 'https://demoauth.fatturazioneelettronica.aruba.it';

  try {
    const res = await fetch(`${baseUrl}/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=password&username=${encodeURIComponent(config.username)}&password=${encodeURIComponent(config.password)}`,
    });
    if (!res.ok) {
      const text = await res.text();
      return { status: 'fail', detail: `HTTP ${res.status} (${config.env}): ${text.slice(0, 200)}` };
    }
    const data = await res.json();
    if (!data.access_token) return { status: 'fail', detail: `nessun access_token nella risposta (${config.env})` };
    return { status: 'ok', detail: `auth ${config.env} riuscita, token expires_in=${data.expires_in}s` };
  } catch (err) {
    await logError({ error: err, route: 'health/integrations', source: 'api', context: { op: 'health-aruba' } });
    return { status: 'fail', detail: err instanceof Error ? err.message : String(err) };
  }
}

async function checkMeta(): Promise<CheckResult> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return { status: 'skipped', detail: 'META_APP_ID o META_APP_SECRET non impostati' };

  try {
    const url = `https://graph.facebook.com/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&grant_type=client_credentials`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || !data.access_token) {
      const errMsg = data?.error?.message || JSON.stringify(data).slice(0, 200);
      return { status: 'fail', detail: `HTTP ${res.status}: ${errMsg}` };
    }
    return { status: 'ok', detail: 'app access token ottenuto, credentials valide' };
  } catch (err) {
    await logError({ error: err, route: 'health/integrations', source: 'api', context: { op: 'health-meta' } });
    return { status: 'fail', detail: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;

  const [aruba, meta] = await Promise.all([checkAruba(), checkMeta()]);

  const allOk = aruba.status !== 'fail' && meta.status !== 'fail';
  return NextResponse.json(
    { ok: allOk, checks: { aruba, meta }, checkedAt: new Date().toISOString() },
    { status: allOk ? 200 : 503 },
  );
}
