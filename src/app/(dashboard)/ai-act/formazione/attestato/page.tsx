'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';
import { Printer, ShieldCheck } from 'lucide-react';
import type { AiTrainingSessionRow, AiTrainingModuleRow } from '@/lib/ai-act/db';

const PIRA = { ragione: 'PIRA WEB S.R.L.', comune: 'Casapesenna (CE)' };

function AttestatoContenuto() {
  const params = useSearchParams();
  const sessioneId = params.get('sessione');
  const supabase = createClient();
  const { profile } = useAuth();
  const [sessione, setSessione] = useState<AiTrainingSessionRow | null>(null);
  const [modulo, setModulo] = useState<AiTrainingModuleRow | null>(null);
  const [loading, setLoading] = useState(true);

  const carica = useCallback(async () => {
    if (!sessioneId) { setLoading(false); return; }
    const { data: s } = await supabase.from('ai_training_sessions').select('*').eq('id', sessioneId).maybeSingle();
    if (s) {
      setSessione(s as AiTrainingSessionRow);
      const { data: m } = await supabase.from('ai_training_modules').select('*').eq('id', (s as AiTrainingSessionRow).modulo_id).single();
      setModulo(m as AiTrainingModuleRow);
    }
    setLoading(false);
  }, [supabase, sessioneId]);

  useEffect(() => { carica(); }, [carica]);

  if (loading) return <p className="p-8 text-sm text-pw-text-muted">Caricamento…</p>;
  if (!sessione || !modulo || sessione.stato !== 'PRESA_VISIONE') {
    return <p className="p-8 text-sm text-pw-text-muted">Attestato non disponibile: la formazione non risulta ancora completata.</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4">
      <div className="flex items-center justify-between print:hidden">
        <a href="/ai-act/formazione" className="text-sm text-pw-text-muted hover:text-pw-text">← Formazione</a>
        <Button onClick={() => window.print()}><Printer size={15} /> Stampa / Salva PDF</Button>
      </div>

      {/* Foglio attestato */}
      <div className="rounded-2xl border-2 border-pw-border bg-pw-surface p-10 text-center print:border-0 print:shadow-none">
        <ShieldCheck size={40} className="mx-auto text-pw-accent" />
        <p className="mt-4 text-xs uppercase tracking-[0.2em] text-pw-text-muted">Attestato di formazione</p>
        <h1 className="mt-2 text-2xl font-bold text-pw-text">Alfabetizzazione sull&apos;Intelligenza Artificiale</h1>
        <p className="mt-1 text-sm text-pw-text-muted">ai sensi dell&apos;art. 4 del Regolamento (UE) 2024/1689 (AI Act)</p>

        <div className="my-8 h-px bg-pw-border" />

        <p className="text-sm text-pw-text-muted">Si attesta che</p>
        <p className="mt-1 text-xl font-semibold text-pw-text">{profile?.full_name ?? '—'}</p>
        <p className="mt-4 text-sm text-pw-text-muted">ha completato il modulo formativo</p>
        <p className="mt-1 font-medium text-pw-text">{modulo.titolo}</p>
        <p className="mt-1 text-sm text-pw-text-muted">durata {modulo.durata_minuti} minuti</p>

        <div className="my-8 h-px bg-pw-border" />

        <div className="grid grid-cols-2 gap-4 text-left text-sm">
          <div><span className="text-pw-text-muted">Presa visione</span><br /><span className="font-medium text-pw-text">{formatDate(sessione.presa_visione!)}</span></div>
          <div><span className="text-pw-text-muted">Valida fino al</span><br /><span className="font-medium text-pw-text">{sessione.scadenza ? formatDate(sessione.scadenza) : '—'}</span></div>
          {sessione.esito_quiz != null && <div><span className="text-pw-text-muted">Esito verifica</span><br /><span className="font-medium text-pw-text">{sessione.esito_quiz}/100</span></div>}
          <div><span className="text-pw-text-muted">Organizzazione</span><br /><span className="font-medium text-pw-text">{PIRA.ragione}</span></div>
        </div>

        <p className="mt-8 text-[11px] text-pw-text-dim">
          {PIRA.ragione} — {PIRA.comune} · Attestato generato dal gestionale il {formatDate(new Date().toISOString())} · rif. sessione {sessione.id.slice(0, 8)}
        </p>
      </div>
    </div>
  );
}

export default function AttestatoPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-pw-text-muted">Caricamento…</p>}>
      <AttestatoContenuto />
    </Suspense>
  );
}
