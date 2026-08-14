'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { SkeletonStats } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/utils';
import { ESITO_LABEL, ESITO_TONE, etichettaInSospeso, type AiGenerationRow } from '@/lib/ai-act/db';
import { ShieldCheck, Cpu, GraduationCap, Tag, FileText, ArrowRight, CircleAlert, CircleCheck } from 'lucide-react';

type Semaforo = 'ok' | 'attenzione' | 'critico';

interface StatoCard {
  titolo: string;
  valore: string;
  dettaglio: string;
  semaforo: Semaforo;
  href: string;
  icon: React.ElementType;
}

const DOT: Record<Semaforo, string> = { ok: 'bg-green-500', attenzione: 'bg-amber-500', critico: 'bg-pw-danger' };

export default function AiActDashboard() {
  const supabase = createClient();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<StatoCard[]>([]);
  const [ultime, setUltime] = useState<AiGenerationRow[]>([]);

  const carica = useCallback(async () => {
    setLoading(true);
    const dodiciMesiFa = new Date();
    dodiciMesiFa.setMonth(dodiciMesiFa.getMonth() - 12);
    const oggi = new Date().toISOString();

    const [sistemiRes, genRes, sessioniRes, docRes, timelineRes] = await Promise.all([
      supabase.from('ai_systems').select('id, attivo, data_ultima_revisione').eq('attivo', true),
      supabase.from('ai_generations').select('esito_etichetta, etichetta_applicata, pubblicato').limit(5000),
      supabase.from('ai_training_sessions').select('stato, scadenza'),
      supabase.from('ai_documents').select('id, tipo, vigente').eq('tipo', 'POLICY_INTERNA').eq('vigente', true),
      supabase.from('ai_generations').select('*').order('created_at', { ascending: false }).limit(10),
    ]);

    const sistemi = sistemiRes.data ?? [];
    const senzaRevisione = sistemi.filter((s) => !s.data_ultima_revisione || s.data_ultima_revisione < dodiciMesiFa.toISOString().slice(0, 10)).length;

    const gen = (genRes.data ?? []) as Pick<AiGenerationRow, 'esito_etichetta' | 'etichetta_applicata' | 'pubblicato'>[];
    const daEtichettare = gen.filter(etichettaInSospeso).length;

    const sessioni = sessioniRes.data ?? [];
    const inRegola = sessioni.filter((s) => s.stato === 'PRESA_VISIONE' && (!s.scadenza || s.scadenza > oggi)).length;
    const percFormazione = sessioni.length ? Math.round((inRegola / sessioni.length) * 100) : 0;

    const policyVigente = (docRes.data ?? []).length > 0;

    setCards([
      {
        titolo: 'Sistemi censiti', valore: String(sistemi.length),
        dettaglio: senzaRevisione > 0 ? `${senzaRevisione} da rivedere (oltre 12 mesi)` : 'Tutti revisionati di recente',
        semaforo: senzaRevisione > 0 ? 'attenzione' : 'ok', href: '/ai-act/sistemi', icon: Cpu,
      },
      {
        titolo: 'Formazione team', valore: `${percFormazione}%`,
        dettaglio: sessioni.length ? `${inRegola} su ${sessioni.length} in regola` : 'Nessuna sessione assegnata',
        semaforo: sessioni.length === 0 ? 'critico' : percFormazione === 100 ? 'ok' : 'attenzione',
        href: '/ai-act/formazione', icon: GraduationCap,
      },
      {
        titolo: 'Contenuti da etichettare', valore: String(daEtichettare),
        dettaglio: daEtichettare > 0 ? 'Etichetta richiesta e non applicata' : 'Nessuna etichetta in sospeso',
        semaforo: daEtichettare > 0 ? 'critico' : 'ok', href: '/ai-act/generazioni', icon: Tag,
      },
      {
        titolo: 'Policy interna', valore: policyVigente ? 'Vigente' : 'Mancante',
        dettaglio: policyVigente ? 'Documento in vigore' : 'Carica la policy interna',
        semaforo: policyVigente ? 'ok' : 'critico', href: '/ai-act/documenti', icon: FileText,
      },
    ]);
    setUltime((timelineRes.data ?? []) as AiGenerationRow[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { carica(); }, [carica]);

  return (
    <div className="space-y-6 animate-slide-up">
      <PageHeader
        eyebrow="Conformità"
        title="Conformità IA"
        subtitle="Registro dei sistemi di IA, tracciabilità delle generazioni e formazione del team — Reg. UE 2024/1689 (AI Act)"
        actions={isAdmin ? <Link href="/ai-act/dossier" className="inline-flex items-center gap-1.5 rounded-lg bg-pw-accent px-3 py-2 text-sm font-medium text-[#0A263A] hover:opacity-90"><FileText size={15} /> Genera dossier</Link> : undefined}
      />

      {loading ? (
        <SkeletonStats />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((c) => (
              <Link key={c.titolo} href={c.href} className="group">
                <Card className="h-full transition-colors hover:border-pw-accent/50">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pw-surface-2 text-pw-text-muted">
                        <c.icon size={18} />
                      </div>
                      <span className={`mt-1 h-2.5 w-2.5 rounded-full ${DOT[c.semaforo]}`} />
                    </div>
                    <p className="mt-3 text-2xl font-bold text-pw-text leading-none">{c.valore}</p>
                    <p className="mt-1 text-sm font-medium text-pw-text">{c.titolo}</p>
                    <p className="mt-0.5 text-xs text-pw-text-muted">{c.dettaglio}</p>
                    <span className="mt-3 inline-flex items-center gap-1 text-xs text-pw-accent opacity-0 transition-opacity group-hover:opacity-100">
                      Apri <ArrowRight size={12} />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="flex items-center gap-2 border-b border-pw-border px-4 py-3">
                <ShieldCheck size={16} className="text-pw-text-muted" />
                <span className="font-semibold text-pw-text">Ultime generazioni</span>
              </div>
              {ultime.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-pw-text-muted">
                  Ancora nessuna generazione registrata. Appena il team usa l&apos;AI dal gestionale, comparirà qui.
                </p>
              ) : (
                <div className="divide-y divide-pw-border">
                  {ultime.map((g) => {
                    const sospeso = etichettaInSospeso(g);
                    return (
                      <div key={g.id} className="flex items-center gap-3 px-4 py-2.5">
                        {sospeso ? <CircleAlert size={16} className="text-pw-danger shrink-0" /> : <CircleCheck size={16} className="text-green-500 shrink-0" />}
                        <span className="w-28 shrink-0 text-xs text-pw-text-muted tabular-nums">{formatDate(g.created_at)}</span>
                        <span className="text-xs text-pw-text-dim">{g.modello}</span>
                        <span className="flex-1" />
                        <Badge tone={ESITO_TONE[g.esito_etichetta]} size="sm">{ESITO_LABEL[g.esito_etichetta]}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {!isAdmin && (
            <p className="text-xs text-pw-text-dim">
              Alcune sezioni (registro sistemi, documenti) sono riservate agli amministratori. La tua formazione è sempre accessibile.
            </p>
          )}
        </>
      )}
    </div>
  );
}
