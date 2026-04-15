'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';
import type { Automation, AutomationLog } from '@/types/database';
import { Zap, Plus, Play, Pause, Trash2, ArrowRight, CheckCircle, XCircle, Clock } from 'lucide-react';

const TRIGGER_LABELS: Record<string, string> = {
  deal_stage_changed: 'Deal cambia stadio',
  task_completed: 'Task completata',
  task_overdue: 'Task scaduta',
  client_payment_overdue: 'Pagamento scaduto',
  approval_submitted: 'Contenuto inviato per approvazione',
  approval_reviewed: 'Contenuto revisionato',
};

const ACTION_LABELS: Record<string, string> = {
  create_project_from_template: 'Crea progetto da template',
  create_notification: 'Crea notifica',
  change_task_status: 'Cambia stato task',
  assign_task: 'Assegna task',
  send_email: 'Invia email',
};

export default function AutomationsPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();

  const [automations, setAutomations] = useState<Automation[]>([]);
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '', description: '', trigger_type: 'deal_stage_changed',
    trigger_config: '', action_type: 'create_notification', action_config: '',
  });

  const fetchAutomations = useCallback(async () => {
    const { data } = await supabase.from('automations').select('*').order('created_at', { ascending: false });
    setAutomations((data as Automation[]) || []);
  }, [supabase]);

  const fetchLogs = useCallback(async (automationId: string) => {
    const { data } = await supabase.from('automation_logs').select('*').eq('automation_id', automationId).order('created_at', { ascending: false }).limit(20);
    setLogs((data as AutomationLog[]) || []);
  }, [supabase]);

  useEffect(() => {
    fetchAutomations().finally(() => setLoading(false));
  }, [fetchAutomations]);

  useEffect(() => {
    if (selectedId) fetchLogs(selectedId);
  }, [selectedId, fetchLogs]);

  const handleCreate = async () => {
    if (!form.name) { toast.error('Nome obbligatorio'); return; }
    let triggerConfig = {};
    let actionConfig = {};
    try { if (form.trigger_config) triggerConfig = JSON.parse(form.trigger_config); } catch { /* ignore */ }
    try { if (form.action_config) actionConfig = JSON.parse(form.action_config); } catch { /* ignore */ }

    const { error } = await supabase.from('automations').insert({
      name: form.name,
      description: form.description || null,
      trigger_type: form.trigger_type,
      trigger_config: triggerConfig,
      action_type: form.action_type,
      action_config: actionConfig,
      created_by: profile!.id,
    });
    if (!error) {
      toast.success('Automazione creata');
      setShowForm(false);
      setForm({ name: '', description: '', trigger_type: 'deal_stage_changed', trigger_config: '', action_type: 'create_notification', action_config: '' });
      fetchAutomations();
    }
  };

  const handleToggle = async (a: Automation) => {
    const { error } = await supabase.from('automations').update({ is_active: !a.is_active }).eq('id', a.id);
    if (!error) fetchAutomations();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminare questa automazione?')) return;
    const { error } = await supabase.from('automations').delete().eq('id', id);
    if (!error) fetchAutomations();
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-3 border-pw-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-pw-text flex items-center gap-2">
            <Zap size={24} className="text-pw-accent" />
            Automazioni
          </h1>
          <p className="text-sm text-pw-text-muted mt-1">Configura azioni automatiche: quando succede X → fai Y</p>
        </div>
        <Button onClick={() => setShowForm(true)}><Plus size={16} />Nuova Automazione</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {automations.map((a) => (
          <Card key={a.id} className={!a.is_active ? 'opacity-50' : ''}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-pw-text flex items-center gap-2">
                    <Zap size={12} className={a.is_active ? 'text-pw-accent' : 'text-pw-text-dim'} />
                    {a.name}
                  </h3>
                  {a.description && <p className="text-[10px] text-pw-text-dim mt-0.5">{a.description}</p>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => handleToggle(a)} className="p-1.5 rounded-lg text-pw-text-dim hover:bg-pw-surface-2" title={a.is_active ? 'Disattiva' : 'Attiva'}>
                    {a.is_active ? <Pause size={12} /> : <Play size={12} />}
                  </button>
                  <button onClick={() => handleDelete(a.id)} className="p-1.5 rounded-lg text-pw-text-dim hover:text-red-400 hover:bg-pw-surface-2">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* Trigger → Action */}
              <div className="flex items-center gap-2 mb-3">
                <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 text-[10px]">
                  {TRIGGER_LABELS[a.trigger_type]}
                </Badge>
                <ArrowRight size={12} className="text-pw-text-dim" />
                <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 text-[10px]">
                  {ACTION_LABELS[a.action_type]}
                </Badge>
              </div>

              <div className="flex items-center gap-4 text-[10px] text-pw-text-dim">
                <span>Eseguita {a.run_count} volte</span>
                {a.last_run_at && <span>Ultima: {formatDateTime(a.last_run_at)}</span>}
                <button onClick={() => setSelectedId(selectedId === a.id ? null : a.id)} className="text-pw-accent hover:underline">
                  {selectedId === a.id ? 'Nascondi log' : 'Vedi log'}
                </button>
              </div>

              {/* Logs */}
              {selectedId === a.id && logs.length > 0 && (
                <div className="mt-3 pt-3 border-t border-pw-border space-y-1.5">
                  {logs.map((log) => (
                    <div key={log.id} className="flex items-center gap-2 text-[10px]">
                      {log.success ? <CheckCircle size={10} className="text-green-400" /> : <XCircle size={10} className="text-red-400" />}
                      <span className="text-pw-text-dim">{formatDateTime(log.created_at)}</span>
                      {log.error_message && <span className="text-red-400">{log.error_message}</span>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {automations.length === 0 && (
        <div className="text-center py-12">
          <Zap size={48} className="text-pw-text-dim mx-auto mb-3" />
          <p className="text-pw-text-muted">Nessuna automazione configurata</p>
          <p className="text-xs text-pw-text-dim mt-1">Crea regole per automatizzare il lavoro ripetitivo</p>
        </div>
      )}

      {/* Examples */}
      <Card>
        <CardHeader><h2 className="text-sm font-semibold text-pw-text">Esempi di automazioni utili</h2></CardHeader>
        <CardContent className="space-y-2 text-xs text-pw-text-muted">
          <p>- <strong>Deal vinto → Crea progetto</strong>: Quando un deal passa a "Chiuso Vinto", crea automaticamente un progetto da template</p>
          <p>- <strong>Task completata → Notifica</strong>: Quando una task viene completata, notifica il project manager</p>
          <p>- <strong>Pagamento scaduto → Alert</strong>: Quando un pagamento supera la scadenza, invia notifica all'admin</p>
          <p>- <strong>Approvazione → Email</strong>: Quando un contenuto viene approvato, invia email al team</p>
        </CardContent>
      </Card>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nuova Automazione">
        <div className="space-y-4">
          <Input label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Es: Deal vinto → Crea progetto" required />
          <Textarea label="Descrizione" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          <Select label="Quando (trigger)" value={form.trigger_type} onChange={(e) => setForm({ ...form, trigger_type: e.target.value })} options={Object.entries(TRIGGER_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
          <Textarea label="Configurazione trigger (JSON opzionale)" value={form.trigger_config} onChange={(e) => setForm({ ...form, trigger_config: e.target.value })} placeholder='{"stage": "closed_won"}' rows={2} />
          <Select label="Allora (azione)" value={form.action_type} onChange={(e) => setForm({ ...form, action_type: e.target.value })} options={Object.entries(ACTION_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
          <Textarea label="Configurazione azione (JSON opzionale)" value={form.action_config} onChange={(e) => setForm({ ...form, action_config: e.target.value })} placeholder='{"template_id": "...", "message": "Nuovo progetto creato!"}' rows={2} />
          <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" onClick={() => setShowForm(false)}>Annulla</Button><Button onClick={handleCreate}>Crea</Button></div>
        </div>
      </Modal>
    </div>
  );
}
