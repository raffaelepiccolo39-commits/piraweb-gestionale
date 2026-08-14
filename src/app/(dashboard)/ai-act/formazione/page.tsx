'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/utils';
import { reportUnknown } from '@/lib/report-error';
import type { AiTrainingModuleRow, AiTrainingSessionRow } from '@/lib/ai-act/db';
import { ArrowLeft, GraduationCap, Check, ExternalLink, Award } from 'lucide-react';

interface Membro { id: string; full_name: string }
type Semaforo = 'verde' | 'giallo' | 'rosso' | 'grigio';

const CELLA: Record<Semaforo, string> = {
  verde: 'bg-green-500', giallo: 'bg-amber-500', rosso: 'bg-pw-danger', grigio: 'bg-pw-border',
};

function semaforo(s: AiTrainingSessionRow | undefined): Semaforo {
  if (!s || s.stato === 'DA_EROGARE') return 'grigio';
  if (s.stato === 'SCADUTA') return 'rosso';
  if (s.stato === 'PRESA_VISIONE') {
    if (!s.scadenza) return 'verde';
    const giorni = (new Date(s.scadenza).getTime() - Date.now()) / 86_400_000;
    if (giorni < 0) return 'rosso';
    if (giorni < 30) return 'giallo';
    return 'verde';
  }
  return 'grigio';
}

export default function Formazione() {
  const supabase = createClient();
  const { profile } = useAuth();
  const toast = useToast();
  const isAdmin = profile?.role === 'admin';

  const [moduli, setModuli] = useState<AiTrainingModuleRow[]>([]);
  const [membri, setMembri] = useState<Membro[]>([]);
  const [sessioni, setSessioni] = useState<AiTrainingSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const carica = useCallback(async () => {
    const reqs: Promise<unknown>[] = [
      supabase.from('ai_training_modules').select('*').eq('attivo', true).order('created_at'),
      supabase.from('ai_training_sessions').select('*'),
    ];
    if (isAdmin) reqs.push(supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'));
    const [modRes, sesRes, memRes] = await Promise.all(reqs) as { data: unknown; error: unknown }[];
    setModuli((modRes.data as AiTrainingModuleRow[]) ?? []);
    setSessioni((sesRes.data as AiTrainingSessionRow[]) ?? []);
    if (isAdmin && memRes) setMembri((memRes.data as Membro[]) ?? []);
    setLoading(false);
  }, [supabase, isAdmin]);

  useEffect(() => { carica(); }, [carica]);

  const sessioneDi = (moduloId: string, utenteId: string) => sessioni.find((s) => s.modulo_id === moduloId && s.utente_id === utenteId);

  const assegnaATeam = async (moduloId: string) => {
    setBusy(moduloId);
    try {
      const daAssegnare = membri.filter((m) => !sessioneDi(moduloId, m.id));
      if (daAssegnare.length === 0) { toast.info?.('Già assegnato a tutti'); setBusy(null); return; }
      const { error } = await supabase.from('ai_training_sessions').insert(
        daAssegnare.map((m) => ({ modulo_id: moduloId, utente_id: m.id, stato: 'DA_EROGARE' as const })),
      );
      if (error) throw error;
      toast.success(`Assegnato a ${daAssegnare.length} persone`);
      carica();
    } catch (e) { reportUnknown(e, 'client', { stage: 'ai-form-assegna' }); toast.error('Errore assegnazione'); }
    finally { setBusy(null); }
  };

  const presaVisione = async (sessione: AiTrainingSessionRow, modulo: AiTrainingModuleRow) => {
    if (modulo.contenuto_url) window.open(modulo.contenuto_url, '_blank', 'noopener');
    setBusy(sessione.id);
    try {
      const res = await fetch('/api/ai-act/formazione/presa-visione', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessione_id: sessione.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('Presa visione registrata');
      carica();
    } catch (e) { reportUnknown(e, 'client', { stage: 'ai-form-visione' }); toast.error('Registrazione non riuscita'); }
    finally { setBusy(null); }
  };

  const mieSessioni = sessioni.filter((s) => s.utente_id === profile?.id);

  return (
    <div className="space-y-6 animate-slide-up">
      <Link href="/ai-act" className="inline-flex items-center gap-1 text-sm text-pw-text-muted hover:text-pw-text">
        <ArrowLeft size={15} /> Conformità IA
      </Link>
      <PageHeader eyebrow="Art. 4 — Alfabetizzazione" title="Formazione IA"
        subtitle="La competenza sull'uso dell'IA che l'AI Act richiede a chi la usa per conto dell'organizzazione." />

      {loading ? <p className="text-sm text-pw-text-muted">Caricamento…</p> : (
        <>
          {/* La mia formazione (tutti) */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-pw-text">La mia formazione</h2>
            {moduli.length === 0 ? (
              <p className="text-sm text-pw-text-muted">Nessun modulo attivo.</p>
            ) : moduli.map((m) => {
              const s = mieSessioni.find((x) => x.modulo_id === m.id);
              const stato = semaforo(s);
              return (
                <Card key={m.id}><CardContent className="flex items-center gap-3 p-4">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${CELLA[stato]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-pw-text">{m.titolo}</p>
                    <p className="text-xs text-pw-text-muted">{m.durata_minuti} min · validità {m.validita_mesi} mesi
                      {s?.presa_visione && <> · presa visione il {formatDate(s.presa_visione)}</>}
                      {s?.scadenza && <> · scade il {formatDate(s.scadenza)}</>}</p>
                  </div>
                  {!s ? (
                    <span className="text-xs text-pw-text-dim">Non assegnato</span>
                  ) : s.stato === 'PRESA_VISIONE' ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-xs text-green-600"><Check size={14} /> Completato</span>
                      <Link href={`/ai-act/formazione/attestato?sessione=${s.id}`} className="inline-flex items-center gap-1 text-xs text-pw-accent hover:underline"><Award size={13} /> Attestato</Link>
                    </div>
                  ) : (
                    <Button size="sm" loading={busy === s.id} onClick={() => presaVisione(s, m)}>
                      <ExternalLink size={14} /> Ho preso visione
                    </Button>
                  )}
                </CardContent></Card>
              );
            })}
          </section>

          {/* Matrice team (admin) */}
          {isAdmin && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-pw-text">Stato del team</h2>
              <Card><CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-pw-border text-left text-xs text-pw-text-muted">
                      <th className="px-4 py-2.5 font-medium">Persona</th>
                      {moduli.map((m) => <th key={m.id} className="px-3 py-2.5 font-medium text-center">{m.titolo.split('—')[0].trim()}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pw-border">
                    {membri.map((mb) => (
                      <tr key={mb.id}>
                        <td className="px-4 py-2.5 text-pw-text whitespace-nowrap">{mb.full_name}</td>
                        {moduli.map((m) => {
                          const stato = semaforo(sessioneDi(m.id, mb.id));
                          return <td key={m.id} className="px-3 py-2.5 text-center"><span className={`inline-block h-3 w-3 rounded-full ${CELLA[stato]}`} title={stato} /></td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent></Card>
              <div className="flex flex-wrap gap-2">
                {moduli.map((m) => (
                  <Button key={m.id} variant="outline" size="sm" loading={busy === m.id} onClick={() => assegnaATeam(m.id)}>
                    Assegna a tutto il team: {m.titolo.split('—')[0].trim()}
                  </Button>
                ))}
              </div>
              <p className="flex items-center gap-4 text-xs text-pw-text-dim">
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-green-500" /> in regola</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> in scadenza</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-pw-danger" /> scaduta/mancante</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-pw-border" /> non assegnata</span>
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
