'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageHeader } from '@/components/ui/page-header';
import { SkeletonList } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { NotebookPen, Plus, Pencil, Trash2, Lock, Check, X } from 'lucide-react';
import { reportSupabaseError } from '@/lib/report-error';

interface ClientRow { id: string; name: string; company: string | null }
interface ClientNote {
  id: string;
  client_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function NoteClientiPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [selected, setSelected] = useState('');
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingNotes, setLoadingNotes] = useState(false);

  const [newContent, setNewContent] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [deleting, setDeleting] = useState<ClientNote | null>(null);

  useEffect(() => {
    const fetchClients = async () => {
      const { data } = await supabase.from('clients').select('id, name, company').order('company', { nullsFirst: false });
      setClients((data as ClientRow[]) || []);
      setLoadingClients(false);
    };
    fetchClients();
  }, [supabase]);

  const fetchNotes = useCallback(async (clientId: string) => {
    if (!clientId) { setNotes([]); return; }
    setLoadingNotes(true);
    const { data } = await supabase
      .from('client_notes')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    setNotes((data as ClientNote[]) || []);
    setLoadingNotes(false);
  }, [supabase]);

  useEffect(() => { fetchNotes(selected); }, [selected, fetchNotes]);

  const handleAdd = async () => {
    const content = newContent.trim();
    if (!profile || !selected || !content) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('client_notes')
      .insert({ client_id: selected, user_id: profile.id, content })
      .select('*')
      .single();
    setSaving(false);
    if (error) { reportSupabaseError(error, 'note-clienti-crea', { clientId: selected }); toast.error('Errore nel salvare la nota'); return; }
    setNotes((prev) => [data as ClientNote, ...prev]);
    setNewContent('');
    toast.success('Nota aggiunta');
  };

  const handleSaveEdit = async (id: string) => {
    const content = editContent.trim();
    if (!content) return;
    const { data, error } = await supabase
      .from('client_notes')
      .update({ content })
      .eq('id', id)
      .select('*')
      .single();
    if (error) { reportSupabaseError(error, 'note-clienti-modifica', { noteId: id }); toast.error('Errore nel salvare le modifiche'); return; }
    setNotes((prev) => prev.map((n) => (n.id === id ? (data as ClientNote) : n)));
    setEditingId(null);
    setEditContent('');
    toast.success('Nota aggiornata');
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from('client_notes').delete().eq('id', deleting.id);
    if (error) { reportSupabaseError(error, 'note-clienti-elimina', { noteId: deleting.id }); toast.error('Errore durante l\'eliminazione'); return; }
    setNotes((prev) => prev.filter((n) => n.id !== deleting.id));
    toast.success('Nota eliminata');
  };

  const selectedClient = clients.find((c) => c.id === selected);
  const clientName = selectedClient?.company || selectedClient?.name;

  return (
    <div className="space-y-6 animate-slide-up">
      <PageHeader
        title="Note Clienti"
        subtitle="I tuoi appunti privati, cliente per cliente"
      />

      <div className="flex items-center gap-2 text-xs text-pw-text-dim">
        <Lock size={13} /> Note private: le vedi e le modifichi solo tu.
      </div>

      <div className="max-w-md">
        <Select
          id="nc-client"
          label="Cliente"
          value={selected}
          onChange={(e) => { setSelected(e.target.value); setEditingId(null); }}
          placeholder={loadingClients ? 'Caricamento…' : 'Scegli un cliente…'}
          options={clients.map((c) => ({ value: c.id, label: c.company || c.name }))}
        />
      </div>

      {!selected ? (
        <EmptyState
          icon={NotebookPen}
          title="Scegli un cliente"
          description="Seleziona un cliente qui sopra per vedere e aggiungere le tue note."
        />
      ) : (
        <div className="space-y-6">
          {/* Nuova nota */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <Textarea
                id="nc-new"
                label={`Nuova nota su ${clientName || 'cliente'}`}
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Scrivi qui quello che vuoi ricordarti su questo cliente…"
                rows={4}
              />
              <div className="flex justify-end">
                <Button variant="primary" onClick={handleAdd} disabled={saving || !newContent.trim()}>
                  <Plus size={14} /> Aggiungi nota
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Diario */}
          {loadingNotes ? (
            <SkeletonList />
          ) : notes.length === 0 ? (
            <EmptyState
              icon={NotebookPen}
              title="Nessuna nota"
              description="Non hai ancora scritto note per questo cliente. Aggiungine una qui sopra."
            />
          ) : (
            <div className="space-y-2">
              {notes.map((n) => (
                <Card key={n.id}>
                  <CardContent className="p-4">
                    {editingId === n.id ? (
                      <div className="space-y-3">
                        <Textarea
                          id={`nc-edit-${n.id}`}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          rows={4}
                        />
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" onClick={() => { setEditingId(null); setEditContent(''); }}>
                            <X size={14} /> Annulla
                          </Button>
                          <Button variant="primary" onClick={() => handleSaveEdit(n.id)} disabled={!editContent.trim()}>
                            <Check size={14} /> Salva
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm text-pw-text whitespace-pre-wrap break-words">{n.content}</p>
                          <p className="text-xs text-pw-text-dim mt-2">
                            {formatWhen(n.created_at)}
                            {n.updated_at !== n.created_at ? ' · modificata' : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => { setEditingId(n.id); setEditContent(n.content); }}
                            className="p-1.5 rounded-lg text-pw-text-dim hover:bg-pw-surface-2 hover:text-pw-text transition-colors"
                            title="Modifica"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => setDeleting(n)}
                            className="p-1.5 rounded-lg text-pw-text-dim hover:bg-pw-surface-2 hover:text-pw-danger transition-colors"
                            title="Elimina"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Eliminare la nota?"
        description="La nota verrà eliminata definitivamente. Questa azione non è reversibile."
        confirmLabel="Elimina"
        variant="danger"
      />
    </div>
  );
}
