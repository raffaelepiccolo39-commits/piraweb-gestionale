'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { reportSupabaseError } from '@/lib/report-error';
import { KeyRound, Plus, Mail, Ban, RotateCcw, Loader2, Send, BellRing } from 'lucide-react';

/**
 * Accessi al portale per un cliente.
 *
 * Chi accede da qui NON è un membro del team: non ha riga in `profiles`,
 * quindi non vede nulla del gestionale interno. Vede solo i dati del
 * proprio cliente, tramite le policy costruite su current_client_id().
 */

interface PortalUser {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  last_login_at: string | null;
  password_set_at: string | null;
  created_at: string;
}

export function PortalAccess({ clientId, clientName }: { clientId: string; clientName: string }) {
  const supabase = createClient();
  const toast = useToast();

  const [users, setUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');

  const fetchUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from('client_portal_users')
      .select('id, email, full_name, is_active, last_login_at, password_set_at, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true });

    if (error) reportSupabaseError(error, 'portale-accessi-lista', { clientId });
    setUsers((data as PortalUser[]) || []);
    setLoading(false);
  }, [clientId, supabase]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleCreate = async () => {
    if (!email.trim()) { toast.error('Serve un indirizzo email'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/portal/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, email: email.trim(), full_name: fullName.trim() }),
      });
      const body = await res.json();

      if (!res.ok) { toast.error(body.error || 'Errore nella creazione dell\'accesso'); return; }

      // L'accesso esiste comunque: se l'email non parte va detto, non nascosto,
      // altrimenti si resta ad aspettare un invito che non arriverà mai.
      if (body.emailSent) {
        toast.success(`Invito inviato a ${email.trim()}`);
      } else {
        toast.error('Accesso creato, ma l\'email non è partita: manda tu il link di invito');
      }

      setEmail('');
      setFullName('');
      setAdding(false);
      await fetchUsers();
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (u: PortalUser) => {
    const res = await fetch('/api/portal/access', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: u.id, is_active: !u.is_active }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error || 'Errore nella modifica dell\'accesso');
      return;
    }
    toast.success(u.is_active ? 'Accesso revocato' : 'Accesso riattivato');
    await fetchUsers();
  };

  const handleResend = async (u: PortalUser) => {
    const res = await fetch('/api/portal/access', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: u.id, resend: true }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error || 'Invio non riuscito'); return; }
    toast.success(`Nuovo invito inviato a ${u.email}`);
  };

  /** Manda subito il riepilogo di ciò che aspetta una risposta. */
  const avvisa = async () => {
    const res = await fetch('/api/portal/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error || 'Invio non riuscito'); return; }
    if (body.inviate > 0) toast.success(`Avviso mandato: ${body.post} contenuti, ${body.materiali} documenti`);
    else toast.error(body.motivo === 'niente in attesa di risposta'
      ? 'Non c\'è nulla in attesa: nessun avviso mandato'
      : 'Il cliente non ha un accesso attivo');
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <KeyRound size={18} className="text-pw-accent" />
            <h3 className="text-base font-semibold text-pw-text">Accesso al portale</h3>
          </div>
          <div className="flex items-center gap-2">
            {users.some((u) => u.is_active) && (
              <Button size="sm" variant="outline" onClick={avvisa} title="Manda subito il riepilogo di ciò che aspetta una risposta">
                <BellRing size={14} /> Avvisa
              </Button>
            )}
            {!adding && (
              <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                <Plus size={14} /> Nuovo accesso
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-pw-text-dim mb-4">
          Chi ha un accesso vede il piano editoriale, il contratto e i pagamenti di {clientName}. Nient&apos;altro del gestionale.
        </p>

        {adding && (
          <div className="rounded-xl border border-pw-border bg-pw-surface-2 p-4 mb-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@cliente.it"
                className="w-full px-3 py-2 rounded-lg bg-pw-surface border border-pw-border text-sm text-pw-text placeholder:text-pw-text-dim"
              />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nome e cognome (facoltativo)"
                className="w-full px-3 py-2 rounded-lg bg-pw-surface border border-pw-border text-sm text-pw-text placeholder:text-pw-text-dim"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => { setAdding(false); setEmail(''); setFullName(''); }}>
                Annulla
              </Button>
              <Button size="sm" variant="primary" onClick={handleCreate} loading={submitting}>
                <Mail size={14} /> Crea e invia invito
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-6 text-pw-text-dim"><Loader2 size={18} className="animate-spin" /></div>
        ) : users.length === 0 ? (
          <p className="text-sm text-pw-text-muted py-4 text-center">
            Nessun accesso attivo. Il cliente non può ancora entrare.
          </p>
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-3 rounded-xl border border-pw-border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-pw-text truncate">{u.full_name || u.email}</p>
                  {u.full_name && <p className="text-xs text-pw-text-dim truncate">{u.email}</p>}
                  <p className="text-[11px] text-pw-text-dim mt-0.5">
                    {u.last_login_at
                      ? `Ultimo accesso: ${new Date(u.last_login_at).toLocaleDateString('it-IT')}`
                      : 'Non è ancora mai entrato'}
                  </p>
                  {!u.password_set_at && u.is_active && (
                    <p className="text-[11px] text-amber-500 mt-0.5">
                      Password non ancora scelta: entra solo col link dell&apos;invito, che scade.
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge tone={u.is_active ? 'success' : 'neutral'} dot>
                    {u.is_active ? 'Attivo' : 'Revocato'}
                  </Badge>
                  {!u.password_set_at && u.is_active && (
                    <Button size="sm" variant="outline" onClick={() => handleResend(u)} title="Rimanda il link di primo accesso">
                      <Send size={14} /> Reinvia
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => handleToggle(u)}>
                    {u.is_active ? <><Ban size={14} /> Revoca</> : <><RotateCcw size={14} /> Riattiva</>}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
