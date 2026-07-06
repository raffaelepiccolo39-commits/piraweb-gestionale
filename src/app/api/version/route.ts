export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

/**
 * Ritorna l'id della build in produzione (commit SHA). Il client lo confronta
 * con quello con cui è stato caricato: se differiscono, è uscita una versione
 * nuova e va proposto il reload.
 */
export async function GET() {
  return NextResponse.json(
    { id: process.env.VERCEL_GIT_COMMIT_SHA || 'dev' },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
