'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { getRoleLabel, formatDate } from '@/lib/utils';
import { PRIORITY_OPTIONS } from '@/lib/constants';
import { reportSupabaseError, reportError } from '@/lib/report-error';
import { toWav16k } from '@/lib/audio-wav';
import { Sparkles, ShieldCheck, Wand2, Check, MessageSquarePlus, Mic, Square, Upload, CreditCard, Globe, Bell, AlertTriangle } from 'lucide-react';

/**
 * Cattura rapida / agente operativo (admin): incolli o detti un messaggio (es.
 * inoltrato da un cliente su WhatsApp), l'AI propone una o più AZIONI — task,
 * pagamento incassato, rinnovo sito, promemoria. Le azioni sui soldi le
 * confermi sempre tu. Fase 1 del flusso WhatsApp→agente.
 */

interface TaskAction {
  type: 'task';
  title: string;
  description: string;
  assigned_to: string | null;
  assigned_to_role: string;
  priority: string;
  estimated_hours: number | null;
  deadline: string | null;
  client_id: string | null;
  _project?: string;
}
interface PaymentAction {
  type: 'payment';
  client_id: string;
  client_name: string;
  month: string;
  payment_id: string | null;
  amount: number | null;
  due_date: string | null;
  resolved: boolean;
}
interface RenewalAction {
  type: 'website_renewal';
  client_id: string;
  client_name: string;
  renewal_id: string | null;
  amount: number | null;
  due_date: string | null;
  resolved: boolean;
}
interface ReminderAction {
  type: 'reminder';
  title: string;
  date: string | null;
}
type Action = (TaskAction | PaymentAction | RenewalAction | ReminderAction) & { done?: boolean };

function euro(n: number | null): string {
  if (n == null) return '';
  return `${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}€`;
}

export default function CatturaPage() {
  const supabase = createClient();
  const { profile } = useAuth();
  const toast = useToast();
  const isAdmin = profile?.role === 'admin';

  const [message, setMessage] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [actions, setActions] = useState<Action[]>([]);
  const [busyIdx, setBusyIdx] = useState<number | null>(null);

  const [clients, setClients] = useState<{ id: string; name: string; company: string | null }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string; client_id: string | null }[]>([]);
  const [team, setTeam] = useState<{ id: string; full_name: string; role: string }[]>([]);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const [cRes, pRes, tRes] = await Promise.all([
        supabase.from('clients').select('id, name, company').eq('is_active', true).is('paused_at', null).order('company'),
        supabase.from('projects').select('id, name, client_id').eq('status', 'active').order('name'),
        supabase.from('profiles').select('id, full_name, role').eq('is_active', true).order('full_name'),
      ]);
      setClients((cRes.data as typeof clients) ?? []);
      setProjects((pRes.data as typeof projects) ?? []);
      setTeam((tRes.data as typeof team) ?? []);
    })();
  }, [supabase, isAdmin]);

  const teamOptions = useMemo(
    () => [{ value: '', label: 'Nessuno' }, ...team.map((m) => ({ value: m.id, label: `${m.full_name} (${getRoleLabel(m.role)})` }))],
    [team],
  );
  const clientOptions = useMemo(
    () => [{ value: '', label: 'Nessun cliente' }, ...clients.map((c) => ({ value: c.id, label: c.company || c.name }))],
    [clients],
  );
  const projectOptionsFor = (clientId: string | null | undefined) => {
    const list = clientId ? projects.filter((p) => p.client_id === clientId) : projects;
    return [{ value: '', label: 'Scegli un progetto' }, ...list.map((p) => ({ value: p.id, label: p.name }))];
  };

  // ── Voce ──────────────────────────────────────────────────────────────
  async function transcribe(blob: Blob, filename: string) {
    setTranscribing(true);
    try {
      // Converte in WAV 16 kHz (il motore non accetta il webm del browser).
      // Se la conversione fallisce, invia l'originale.
      let toSend: Blob = blob;
      let name = filename;
      try {
        toSend = await toWav16k(blob);
        name = filename.replace(/\.[^.]+$/, '') + '.wav';
      } catch {
        // usa l'originale
      }
      const fd = new FormData();
      fd.append('audio', toSend, name);
      const res = await fetch('/api/ai/transcribe', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Trascrizione fallita'); return; }
      setMessage((prev) => (prev ? `${prev}\n${data.text}` : data.text));
      toast.success('Audio trascritto');
    } catch (err) {
      reportError({ message: `transcribe: ${String(err)}`, route: '/cattura' });
      toast.error('Errore nella trascrizione');
    } finally {
      setTranscribing(false);
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        void transcribe(blob, 'nota.webm');
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch {
      toast.error('Microfono non disponibile: consenti l\'accesso');
    }
  }
  function stopRecording() {
    mediaRef.current?.stop();
    setRecording(false);
  }

  // ── Analisi ───────────────────────────────────────────────────────────
  async function analyze() {
    if (!message.trim()) { toast.error('Scrivi o detta prima un messaggio'); return; }
    setAnalyzing(true);
    setActions([]);
    try {
      const res = await fetch('/api/ai/capture-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Errore AI'); return; }
      const list = (data.actions as Action[]) ?? [];
      // Per le task, preseleziona il progetto se il cliente ne ha uno solo.
      for (const a of list) {
        if (a.type === 'task' && a.client_id) {
          const forClient = projects.filter((p) => p.client_id === a.client_id);
          if (forClient.length === 1) a._project = forClient[0].id;
        }
      }
      setActions(list);
      if (!list.length) toast.error('Non ho capito nessuna azione dal messaggio');
    } catch (err) {
      reportError({ message: `capture-action: ${String(err)}`, route: '/cattura' });
      toast.error('Errore di rete, riprova');
    } finally {
      setAnalyzing(false);
    }
  }

  function patchAction(idx: number, changes: Record<string, unknown>) {
    setActions((prev) => prev.map((a, i) => (i === idx ? ({ ...a, ...changes } as Action) : a)));
  }
  function markDone(idx: number) {
    setActions((prev) => prev.map((a, i) => (i === idx ? { ...a, done: true } : a)));
  }

  // ── Esecuzione per tipo ───────────────────────────────────────────────
  async function runTask(idx: number, a: TaskAction) {
    if (!profile) return;
    if (!a._project) { toast.error('Scegli un progetto per la task'); return; }
    if (!a.title.trim()) { toast.error('La task ha bisogno di un titolo'); return; }
    setBusyIdx(idx);
    const { data: created, error } = await supabase.from('tasks').insert({
      title: a.title.trim(),
      description: a.description?.trim() || null,
      project_id: a._project,
      assigned_to: a.assigned_to || null,
      priority: a.priority,
      status: 'todo',
      deadline: a.deadline || null,
      estimated_hours: a.estimated_hours ?? null,
      position: idx,
      created_by: profile.id,
    }).select('id').single();
    if (error || !created) { setBusyIdx(null); reportSupabaseError(error, 'cattura-task'); toast.error('Errore creazione task'); return; }
    if (a.assigned_to) await supabase.rpc('set_task_assignees', { p_task_id: created.id, p_user_ids: [a.assigned_to] });
    setBusyIdx(null); markDone(idx); toast.success('Task creata');
  }

  async function runPayment(idx: number, a: PaymentAction) {
    if (!profile || !a.payment_id) return;
    setBusyIdx(idx);
    const { error } = await supabase.rpc('toggle_payment_paid', { p_payment_id: a.payment_id, p_performed_by: profile.id });
    setBusyIdx(null);
    if (error) { reportSupabaseError(error, 'cattura-payment', { paymentId: a.payment_id }); toast.error('Errore nel segnare il pagamento'); return; }
    markDone(idx); toast.success('Pagamento registrato');
  }

  async function runRenewal(idx: number, a: RenewalAction) {
    if (!a.renewal_id) return;
    setBusyIdx(idx);
    const { error } = await supabase.rpc('pay_website_renewal', { p_renewal_id: a.renewal_id });
    setBusyIdx(null);
    if (error) { reportSupabaseError(error, 'cattura-renewal', { renewalId: a.renewal_id }); toast.error('Errore nel segnare il rinnovo'); return; }
    markDone(idx); toast.success('Rinnovo registrato');
  }

  async function runReminder(idx: number, a: ReminderAction) {
    if (!profile) return;
    if (!a.title.trim()) { toast.error('Il promemoria ha bisogno di un titolo'); return; }
    const day = a.date || new Date().toISOString().slice(0, 10);
    setBusyIdx(idx);
    const { error } = await supabase.from('calendar_events').insert({
      title: a.title.trim(),
      start_time: `${day}T09:00:00`,
      end_time: `${day}T09:30:00`,
      all_day: true,
      assigned_to: [profile.id],
      created_by: profile.id,
    });
    setBusyIdx(null);
    if (error) { reportSupabaseError(error, 'cattura-reminder'); toast.error('Errore nel creare il promemoria'); return; }
    markDone(idx); toast.success('Promemoria aggiunto al calendario');
  }

  if (!isAdmin) {
    return <EmptyState icon={ShieldCheck} title="Area riservata" description="La cattura rapida è disponibile solo agli amministratori." />;
  }

  const pending = actions.filter((a) => !a.done).length;

  return (
    <div className="space-y-6 animate-slide-up">
      <PageHeader
        eyebrow="Task"
        title="Cattura rapida"
        subtitle="Scrivi o detta un messaggio (es. inoltrato da WhatsApp): l'AI propone cosa fare e a chi"
      />

      <Card>
        <CardContent className="space-y-3">
          <Textarea rows={5} placeholder="Incolla qui il messaggio del cliente, oppure detta con il microfono…" value={message} onChange={(e) => setMessage(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            {recording ? (
              <Button variant="danger" onClick={stopRecording}><Square size={15} /> Ferma e trascrivi</Button>
            ) : (
              <Button variant="outline" onClick={startRecording} loading={transcribing} disabled={analyzing}><Mic size={15} /> Detta</Button>
            )}
            <Button variant="ghost" onClick={() => fileRef.current?.click()} disabled={recording || transcribing}><Upload size={15} /> Carica audio</Button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void transcribe(f, f.name); e.target.value = ''; }}
            />
            <div className="ml-auto">
              <Button variant="primary" onClick={analyze} loading={analyzing} disabled={!message.trim() || recording}>
                <Wand2 size={16} /> Analizza
              </Button>
            </div>
          </div>
          {recording && <p className="text-xs text-pw-danger">● Registrazione in corso…</p>}
        </CardContent>
      </Card>

      {actions.length > 0 && (
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-pw-text-muted">
              <Sparkles size={16} className="text-pw-accent" />
              Proposta dell&apos;AI — controlla e conferma ogni azione. {pending === 0 && 'Tutto fatto 🎉'}
            </div>

            <div className="space-y-3">
              {actions.map((a, idx) => {
                if (a.done) {
                  const label = a.type === 'task' ? a.title : a.type === 'reminder' ? a.title : a.type === 'payment' ? `Pagamento ${a.client_name}` : `Rinnovo ${a.client_name}`;
                  return (
                    <div key={idx} className="flex items-center gap-2 rounded-lg border border-pw-border bg-pw-surface px-3 py-2 text-sm text-pw-text-dim">
                      <Check size={15} className="text-pw-success" /> <span className="line-through">{label}</span> — fatto
                    </div>
                  );
                }

                if (a.type === 'task') {
                  return (
                    <div key={idx} className="space-y-2.5 rounded-xl border border-pw-border p-3">
                      <div className="flex items-center gap-2 text-xs font-medium text-pw-accent"><MessageSquarePlus size={14} /> Task</div>
                      <Input value={a.title} onChange={(e) => patchAction(idx, { title: e.target.value })} placeholder="Titolo" />
                      <Textarea rows={2} value={a.description} onChange={(e) => patchAction(idx, { description: e.target.value })} placeholder="Descrizione" />
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        <Select label="Cliente" options={clientOptions} value={a.client_id ?? ''} onChange={(e) => patchAction(idx, { client_id: e.target.value || null, _project: '' })} />
                        <Select label="Progetto" options={projectOptionsFor(a.client_id)} value={a._project ?? ''} onChange={(e) => patchAction(idx, { _project: e.target.value })} />
                      </div>
                      <div className="grid gap-2.5 sm:grid-cols-3">
                        <Select label="Assegna a" options={teamOptions} value={a.assigned_to ?? ''} onChange={(e) => patchAction(idx, { assigned_to: e.target.value || null })} />
                        <Select label="Priorità" options={PRIORITY_OPTIONS} value={a.priority} onChange={(e) => patchAction(idx, { priority: e.target.value })} />
                        <Input label="Scadenza" type="date" value={a.deadline ?? ''} onChange={(e) => patchAction(idx, { deadline: e.target.value || null })} />
                      </div>
                      <div className="flex justify-end">
                        <Button size="sm" variant="primary" loading={busyIdx === idx} onClick={() => runTask(idx, a)}><Check size={15} /> Crea task</Button>
                      </div>
                    </div>
                  );
                }

                if (a.type === 'payment') {
                  return (
                    <div key={idx} className="space-y-2 rounded-xl border border-pw-border p-3">
                      <div className="flex items-center gap-2 text-xs font-medium text-pw-accent"><CreditCard size={14} /> Pagamento cliente</div>
                      {a.resolved ? (
                        <>
                          <p className="text-sm text-pw-text">
                            Segno come incassata la rata di <span className="font-semibold">{a.client_name}</span> in scadenza il{' '}
                            <span className="font-semibold">{a.due_date ? formatDate(a.due_date) : ''}</span> ({euro(a.amount)}).
                          </p>
                          <div className="flex justify-end">
                            <Button size="sm" variant="primary" loading={busyIdx === idx} onClick={() => runPayment(idx, a)}><Check size={15} /> Segna incassato</Button>
                          </div>
                        </>
                      ) : (
                        <p className="flex items-center gap-2 text-sm text-pw-text-dim"><AlertTriangle size={14} className="text-pw-warning" /> Nessuna rata non pagata trovata per {a.client_name} nel mese {a.month}. Controlla in Cashflow/Clienti.</p>
                      )}
                    </div>
                  );
                }

                if (a.type === 'website_renewal') {
                  return (
                    <div key={idx} className="space-y-2 rounded-xl border border-pw-border p-3">
                      <div className="flex items-center gap-2 text-xs font-medium text-pw-accent"><Globe size={14} /> Rinnovo sito</div>
                      {a.resolved ? (
                        <>
                          <p className="text-sm text-pw-text">
                            Segno come incassato il rinnovo sito di <span className="font-semibold">{a.client_name}</span> ({a.due_date ? formatDate(a.due_date) : ''}, {euro(a.amount)}).
                          </p>
                          <div className="flex justify-end">
                            <Button size="sm" variant="primary" loading={busyIdx === idx} onClick={() => runRenewal(idx, a)}><Check size={15} /> Segna incassato</Button>
                          </div>
                        </>
                      ) : (
                        <p className="flex items-center gap-2 text-sm text-pw-text-dim"><AlertTriangle size={14} className="text-pw-warning" /> Nessun rinnovo da incassare trovato per {a.client_name}. Controlla in Gestione Siti.</p>
                      )}
                    </div>
                  );
                }

                // reminder
                return (
                  <div key={idx} className="space-y-2.5 rounded-xl border border-pw-border p-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-pw-accent"><Bell size={14} /> Promemoria</div>
                    <Input value={a.title} onChange={(e) => patchAction(idx, { title: e.target.value })} placeholder="Promemoria" />
                    <div className="max-w-[220px]">
                      <Input label="Quando" type="date" value={a.date ?? ''} onChange={(e) => patchAction(idx, { date: e.target.value || null })} />
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm" variant="primary" loading={busyIdx === idx} onClick={() => runReminder(idx, a)}><Check size={15} /> Aggiungi al calendario</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
