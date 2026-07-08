'use client';

import { useCallback, useEffect, useState } from 'react';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { it } from 'date-fns/locale';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getInitials } from '@/lib/utils';
import { Camera, CheckCircle2, Plus, X, RotateCcw } from 'lucide-react';

interface ShootingClient {
  id: string;
  name: string;
  company: string | null;
  logo_url: string | null;
  color: string | null;
}

interface ShootingPanelProps {
  month: Date;
  /** Apre la creazione evento pre-compilata per lo shooting del cliente. */
  onProgram: (client: ShootingClient) => void;
  /** Cambia questo valore per forzare un refresh (es. dopo aver creato un evento). */
  reloadKey?: number;
}

const label = (c: ShootingClient) => c.company || c.name;

export function ShootingPanel({ month, onProgram, reloadKey }: ShootingPanelProps) {
  const supabase = createClient();
  const { profile } = useAuth();
  const toast = useToast();

  const [clients, setClients] = useState<ShootingClient[]>([]);
  const [scheduled, setScheduled] = useState<Set<string>>(new Set());
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const monthStr = format(month, 'yyyy-MM');
  const monthLabel = format(month, 'MMMM yyyy', { locale: it });

  const fetchData = useCallback(async () => {
    const startIso = startOfMonth(month).toISOString();
    const endIso = endOfMonth(month).toISOString();
    const [clientsRes, eventsRes, skipsRes] = await Promise.all([
      supabase
        .from('clients')
        .select('id, name, company, logo_url, color')
        .eq('needs_monthly_shooting', true)
        .eq('is_active', true)
        .is('paused_at', null)
        .order('company'),
      supabase
        .from('calendar_events')
        .select('client_id')
        .eq('event_type', 'shooting')
        .not('client_id', 'is', null)
        .gte('start_time', startIso)
        .lte('start_time', endIso),
      supabase
        .from('client_shooting_skips')
        .select('client_id')
        .eq('month', monthStr),
    ]);
    setClients((clientsRes.data as ShootingClient[]) || []);
    setScheduled(new Set(((eventsRes.data as { client_id: string }[]) || []).map((e) => e.client_id)));
    setSkipped(new Set(((skipsRes.data as { client_id: string }[]) || []).map((s) => s.client_id)));
    setLoading(false);
  }, [supabase, month, monthStr]);

  useEffect(() => { fetchData(); }, [fetchData, reloadKey]);

  const handleSkip = async (clientId: string) => {
    setSkipped((prev) => new Set(prev).add(clientId)); // ottimistico
    const { error } = await supabase
      .from('client_shooting_skips')
      .insert({ client_id: clientId, month: monthStr, created_by: profile?.id });
    if (error) { toast.error('Errore, riprova'); fetchData(); return; }
    toast.success('Shooting saltato per questo mese');
  };

  const handleRestore = async (clientId: string) => {
    setSkipped((prev) => { const n = new Set(prev); n.delete(clientId); return n; }); // ottimistico
    const { error } = await supabase
      .from('client_shooting_skips')
      .delete()
      .eq('client_id', clientId)
      .eq('month', monthStr);
    if (error) { toast.error('Errore, riprova'); fetchData(); }
  };

  const pending = clients.filter((c) => !scheduled.has(c.id) && !skipped.has(c.id));
  const skippedClients = clients.filter((c) => skipped.has(c.id));
  const doneCount = clients.filter((c) => scheduled.has(c.id)).length;

  if (loading) return null;
  if (clients.length === 0) return null; // nessun cliente con shooting mensile

  const Avatar = ({ c }: { c: ShootingClient }) =>
    c.logo_url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={c.logo_url} alt={label(c)} className="w-8 h-8 rounded-md object-contain p-0.5 border border-pw-border bg-white shrink-0" />
    ) : (
      <span className="w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: c.color || '#0A263A' }}>
        {getInitials(label(c))}
      </span>
    );

  return (
    <Card className="border-pink-500/25 bg-pink-500/[0.03]">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-pw-text flex items-center gap-2">
            <Camera size={16} className="text-pink-400" /> Shooting da programmare
            <span className="text-pw-text-dim font-normal capitalize">· {monthLabel}</span>
          </h2>
          <span className="text-[11px] text-pw-text-dim">{doneCount}/{clients.length} programmati</span>
        </div>

        {pending.length === 0 ? (
          <p className="text-sm text-pw-text-dim flex items-center gap-2">
            <CheckCircle2 size={15} className="text-pw-success" /> Tutti gli shooting di {monthLabel} sono gestiti.
          </p>
        ) : (
          <div className="space-y-1.5">
            {pending.map((c) => (
              <div key={c.id} className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-pw-surface-2/60">
                <Avatar c={c} />
                <span className="text-sm text-pw-text flex-1 truncate">{label(c)}</span>
                <Button variant="primary" size="sm" onClick={() => onProgram(c)}>
                  <Plus size={14} /> Programma
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleSkip(c.id)} title="Salta questo mese">
                  <X size={14} /> Salta
                </Button>
              </div>
            ))}
          </div>
        )}

        {skippedClients.length > 0 && (
          <div className="mt-3 pt-3 border-t border-pw-border/60">
            <p className="text-[11px] uppercase tracking-wide text-pw-text-dim mb-1.5">Saltati questo mese</p>
            <div className="flex flex-wrap gap-1.5">
              {skippedClients.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleRestore(c.id)}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-pw-surface-2 text-pw-text-muted hover:text-pw-text"
                  title="Ripristina nella lista"
                >
                  {label(c)} <RotateCcw size={11} />
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
