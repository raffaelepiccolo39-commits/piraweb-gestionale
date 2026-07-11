'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/utils';
import type { ClientInsight, ClientProposedAction } from '@/types/database';
import { Sparkles, Loader2, AlertTriangle, ArrowRight, Check, X, Plus } from 'lucide-react';

const SEVERITY_TONE: Record<string, string> = {
  alta: 'bg-red-500/15 text-red-600 dark:text-red-400',
  media: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  bassa: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
};

const PRIORITY_LABEL: Record<string, string> = {
  bassa: 'Bassa', media: 'Media', alta: 'Alta', urgente: 'Urgente',
  low: 'Bassa', medium: 'Media', high: 'Alta', urgent: 'Urgente',
};

const PRIORITY_TONE: Record<string, 'neutral' | 'warning' | 'danger'> = {
  bassa: 'neutral', media: 'warning', alta: 'danger', urgente: 'danger',
  low: 'neutral', medium: 'warning', high: 'danger', urgent: 'danger',
};

export function ClientAssistant({ clientId }: { clientId: string }) {
  const supabase = createClient();
  const { profile } = useAuth();
  const toast = useToast();

  const [insight, setInsight] = useState<ClientInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const fetchLatest = useCallback(async () => {
    const { data } = await supabase
      .from('client_insights')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setInsight((data as ClientInsight | null) ?? null);
    setLoading(false);
  }, [supabase, clientId]);

  useEffect(() => { fetchLatest(); }, [fetchLatest]);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/ai/client-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Analisi non riuscita');
        return;
      }
      setInsight(json.insight as ClientInsight);
      toast.success('Analisi completata');
    } catch {
      toast.error('Errore di rete durante l\'analisi');
    } finally {
      setGenerating(false);
    }
  };

  // Aggiorna lo stato di un'azione proposta dentro il JSONB dell'insight.
  const patchAction = async (actionId: string, status: ClientProposedAction['status']) => {
    if (!insight) return;
    const updated = insight.proposed_actions.map((a) => (a.id === actionId ? { ...a, status } : a));
    const { error } = await supabase
      .from('client_insights')
      .update({ proposed_actions: updated })
      .eq('id', insight.id);
    if (error) throw error;
    setInsight({ ...insight, proposed_actions: updated });
  };

  const createTask = async (action: ClientProposedAction) => {
    if (!profile) return;
    setActionBusy(action.id);
    try {
      // Un task richiede un progetto: usiamo il progetto del cliente.
      const { data: projects } = await supabase
        .from('projects')
        .select('id')
        .eq('client_id', clientId)
        .order('created_at', { ascending: true })
        .limit(1);
      const projectId = projects?.[0]?.id;
      if (!projectId) {
        toast.error('Nessun progetto collegato al cliente: creane uno prima.');
        return;
      }
      const { error } = await supabase.from('tasks').insert({
        title: action.title,
        description: action.description,
        project_id: projectId,
        priority: action.priority,
        status: 'todo',
        estimated_hours: action.estimated_hours || null,
        ai_generated: true,
        created_by: profile.id,
      });
      if (error) throw error;
      await patchAction(action.id, 'done');
      toast.success('Task creato');
    } catch (e) {
      toast.error((e as { message?: string })?.message || 'Creazione task non riuscita');
    } finally {
      setActionBusy(null);
    }
  };

  const dismiss = async (action: ClientProposedAction) => {
    setActionBusy(action.id);
    try {
      await patchAction(action.id, 'dismissed');
    } catch {
      toast.error('Operazione non riuscita');
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <Card>
      <CardContent className="p-5 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-pw-accent/15 text-pw-accent flex items-center justify-center">
              <Sparkles size={18} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-pw-text">Assistente AI</h2>
              <p className="text-xs text-pw-text-muted">
                {insight
                  ? `Ultima analisi: ${formatDate(insight.created_at)}`
                  : 'Analizza progetti, scadenze e attività per ottimizzare il cliente'}
              </p>
            </div>
          </div>
          <Button variant="primary" onClick={generate} loading={generating}>
            <Sparkles size={16} /> {insight ? 'Ri-analizza' : 'Analizza'}
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-6 text-pw-text-dim">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : !insight ? (
          <p className="text-sm text-pw-text-dim">
            Nessuna analisi ancora. Premi <strong>Analizza</strong> per generare la prima.
          </p>
        ) : (
          <div className="space-y-5">
            {insight.summary && (
              <p className="text-sm text-pw-text leading-relaxed">{insight.summary}</p>
            )}

            {insight.risks.length > 0 && (
              <div>
                <h3 className="text-xs uppercase tracking-wide font-semibold text-pw-text-muted mb-2 flex items-center gap-1.5">
                  <AlertTriangle size={13} /> Rischi
                </h3>
                <div className="space-y-2">
                  {insight.risks.map((r, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium leading-none ${SEVERITY_TONE[r.severity] || SEVERITY_TONE.bassa}`}>
                        {r.severity}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-pw-text">{r.title}</p>
                        <p className="text-xs text-pw-text-muted">{r.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {insight.next_actions.length > 0 && (
              <div>
                <h3 className="text-xs uppercase tracking-wide font-semibold text-pw-text-muted mb-2 flex items-center gap-1.5">
                  <ArrowRight size={13} /> Prossime azioni
                </h3>
                <div className="space-y-2">
                  {insight.next_actions.map((a, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <Badge tone={PRIORITY_TONE[a.priority] || 'neutral'} size="sm">{PRIORITY_LABEL[a.priority] || a.priority}</Badge>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-pw-text">{a.title}</p>
                        <p className="text-xs text-pw-text-muted">{a.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {insight.proposed_actions.length > 0 && (
              <div>
                <h3 className="text-xs uppercase tracking-wide font-semibold text-pw-text-muted mb-2 flex items-center gap-1.5">
                  <Plus size={13} /> Task proposti
                </h3>
                <div className="space-y-2">
                  {insight.proposed_actions.map((a) => (
                    <div key={a.id} className="rounded-xl border border-pw-border bg-pw-surface-2 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-pw-text">{a.title}</p>
                            <Badge tone={PRIORITY_TONE[a.priority] || 'neutral'} size="sm">{PRIORITY_LABEL[a.priority] || a.priority}</Badge>
                          </div>
                          <p className="text-xs text-pw-text-muted mt-0.5">{a.description}</p>
                          {a.estimated_hours ? (
                            <p className="text-[11px] text-pw-text-dim mt-1">Stima: {a.estimated_hours}h</p>
                          ) : null}
                        </div>
                        <div className="shrink-0">
                          {a.status === 'done' ? (
                            <span className="inline-flex items-center gap-1 text-green-500 text-xs font-medium">
                              <Check size={14} /> Creato
                            </span>
                          ) : a.status === 'dismissed' ? (
                            <span className="text-xs text-pw-text-dim">Ignorato</span>
                          ) : (
                            <div className="flex gap-1.5">
                              <Button variant="outline" size="sm" onClick={() => createTask(a)} loading={actionBusy === a.id}>
                                <Plus size={14} /> Crea task
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => dismiss(a)} disabled={actionBusy === a.id} title="Ignora">
                                <X size={14} />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
