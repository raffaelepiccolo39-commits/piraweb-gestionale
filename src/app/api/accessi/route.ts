export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { utenteDellaRichiesta } from '@/lib/auth-richiesta';
import { cifra, decifra, cifraturaConfigurata } from '@/lib/cifratura';
import { logAudit } from '@/lib/audit';
import { logError } from '@/lib/logger';

/**
 * Archivio accessi dei clienti (sito, Instagram, Facebook, TikTok, LinkedIn…).
 *
 * Le password non passano mai dal client in chiaro verso il database: si
 * cifrano qui. E non tornano indietro insieme all'elenco — per vederne una
 * bisogna chiederla apposta (`?id=…&mostra=1`), e quella richiesta lascia una
 * traccia nel registro. Non e' sfiducia verso il team: e' che il giorno che
 * una password gira dove non doveva, si vuole poter risalire a quando e' stata
 * letta l'ultima volta.
 */

/** Solo il team: i clienti del portale qui non entrano mai. */
async function verificaTeam(userId: string) {
  const service = await createServiceRoleClient();
  const { data } = await service.from('profiles').select('id, role').eq('id', userId).maybeSingle();
  return data ? { service, profilo: data } : { service, profilo: null };
}

export async function GET(request: NextRequest) {
  const utente = await utenteDellaRichiesta(request);
  if (!utente) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const { service, profilo } = await verificaTeam(utente.id);
  if (!profilo) return NextResponse.json({ error: 'Riservato al team' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const mostra = searchParams.get('mostra') === '1';

  // Richiesta di UNA password in chiaro: deliberata, e registrata.
  if (id && mostra) {
    const { data, error } = await service
      .from('client_credentials')
      .select('id, piattaforma, etichetta, password_cifrata, client:clients(name, company)')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return NextResponse.json({ error: 'Accesso non trovato' }, { status: 404 });

    const riga = data as unknown as {
      piattaforma: string; etichetta: string | null; password_cifrata: string | null;
      client: { name: string; company: string | null } | null;
    };

    await logAudit({
      action: 'credenziale.letta',
      actorId: utente.id,
      actorEmail: utente.email,
      entityType: 'client_credentials',
      entityId: id,
      details: { piattaforma: riga.piattaforma, cliente: riga.client?.company || riga.client?.name },
      request,
    });

    return NextResponse.json({ password: decifra(riga.password_cifrata) });
  }

  // Elenco: senza password. Serve a sapere cosa c'e', non a leggerlo tutto.
  let query = service
    .from('client_credentials')
    .select('id, client_id, piattaforma, etichetta, username, url, note, updated_at, client:clients(name, company)')
    .order('piattaforma');

  const clientId = searchParams.get('client_id');
  if (clientId) query = query.eq('client_id', clientId);

  const { data, error } = await query;
  if (error) {
    await logError({ error, route: '/api/accessi', source: 'api', context: { op: 'elenco' } });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ accessi: data ?? [] });
}

export async function POST(request: NextRequest) {
  const utente = await utenteDellaRichiesta(request);
  if (!utente) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const { service, profilo } = await verificaTeam(utente.id);
  if (!profilo) return NextResponse.json({ error: 'Riservato al team' }, { status: 403 });

  if (!cifraturaConfigurata()) {
    return NextResponse.json({
      error: 'Cifratura non configurata sul server: la password non verrebbe protetta. Avvisa chi gestisce il gestionale.',
    }, { status: 503 });
  }

  const corpo = await request.json().catch(() => ({}));
  const { client_id, piattaforma, etichetta, username, password, url, note } = corpo;

  if (!client_id || !piattaforma) {
    return NextResponse.json({ error: 'Servono il cliente e la piattaforma' }, { status: 400 });
  }

  const { data, error } = await service
    .from('client_credentials')
    .insert({
      client_id,
      piattaforma,
      etichetta: etichetta || null,
      username: username || null,
      password_cifrata: password ? cifra(password) : null,
      url: url || null,
      note: note || null,
      creato_da: utente.id,
    })
    .select('id')
    .single();

  if (error) {
    await logError({ error, route: '/api/accessi', source: 'api', context: { op: 'crea' } });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logAudit({
    action: 'credenziale.creata',
    actorId: utente.id,
    actorEmail: utente.email,
    entityType: 'client_credentials',
    entityId: data.id,
    details: { piattaforma },
    request,
  });

  return NextResponse.json({ id: data.id }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const utente = await utenteDellaRichiesta(request);
  if (!utente) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const { service, profilo } = await verificaTeam(utente.id);
  if (!profilo) return NextResponse.json({ error: 'Riservato al team' }, { status: 403 });

  const corpo = await request.json().catch(() => ({}));
  const { id, piattaforma, etichetta, username, password, url, note } = corpo;
  if (!id) return NextResponse.json({ error: 'id obbligatorio' }, { status: 400 });

  const aggiornamento: Record<string, unknown> = {};
  if (piattaforma !== undefined) aggiornamento.piattaforma = piattaforma;
  if (etichetta !== undefined) aggiornamento.etichetta = etichetta || null;
  if (username !== undefined) aggiornamento.username = username || null;
  if (url !== undefined) aggiornamento.url = url || null;
  if (note !== undefined) aggiornamento.note = note || null;

  // La password si tocca solo se ne arriva una nuova: un campo lasciato vuoto
  // nel modulo significa "non cambiarla", non "cancellala".
  if (password) {
    if (!cifraturaConfigurata()) {
      return NextResponse.json({ error: 'Cifratura non configurata sul server' }, { status: 503 });
    }
    aggiornamento.password_cifrata = cifra(password);
  }

  const { error } = await service.from('client_credentials').update(aggiornamento).eq('id', id);
  if (error) {
    await logError({ error, route: '/api/accessi', source: 'api', context: { op: 'modifica', id } });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logAudit({
    action: 'credenziale.modificata',
    actorId: utente.id,
    actorEmail: utente.email,
    entityType: 'client_credentials',
    entityId: id,
    details: { password_cambiata: Boolean(password) },
    request,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const utente = await utenteDellaRichiesta(request);
  if (!utente) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const { service, profilo } = await verificaTeam(utente.id);
  if (!profilo) return NextResponse.json({ error: 'Riservato al team' }, { status: 403 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id obbligatorio' }, { status: 400 });

  const { error } = await service.from('client_credentials').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logAudit({
    action: 'credenziale.eliminata',
    actorId: utente.id,
    actorEmail: utente.email,
    entityType: 'client_credentials',
    entityId: id,
    request,
  });

  return NextResponse.json({ ok: true });
}
