'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { NoteDevForm } from '@/components/note-dev/note-dev-form';
import type { NoteFormData } from '@/components/note-dev/note-dev-form';
import type { DeveloperNote, DevNoteStatus } from '@/types/database';
import {
  formatDate,
  getDevNoteCategoryColor,
  getDevNoteCategoryLabel,
  getDevNoteStatusColor,
  getDevNoteStatusLabel,
  getPriorityColor,
  getInitials,
} from '@/lib/utils';
import {
  Plus,
  MessageSquareWarning,
  Bug,
  Lightbulb,
  Sparkles,
  Trash2,
  Pencil,
  CheckCircle2,
  ExternalLink,
  Image as ImageIcon,
  AlertTriangle,
} from 'lucide-react';
import { useToast } from '@/components/ui/toast';

const priorityLabels: Record<string, string> = {
  low: 'Bassa', medium: 'Media', high: 'Alta', urgent: 'Urgente',
};

export default function NoteDevPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();

  const [notes, setNotes] = useState<DeveloperNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  // Modals
  const [showForm, setShowForm] = useState(false);
  const [editingNote, setEditingNote] = useState<DeveloperNote | null>(null);
  const [showResolve, setShowResolve] = useState(false);
  const [resolvingNote, setResolvingNote] = useState<DeveloperNote | null>(null);
  const [showScreenshot, setShowScreenshot] = useState<string | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  // Resolve modal state
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [members, setMembers] = useState<{ id: string; full_name: string }[]>([]);
  const [resolveProject, setResolveProject] = useState('');
  const [resolveAssignee, setResolveAssignee] = useState('');
  const [resolveLoading, setResolveLoading] = useState(false);

  const isAdmin = profile?.role === 'admin';

  const fetchNotes = useCallback(async () => {
    if (!profile) return;

    try {
      let query = supabase
        .from('developer_notes')
        .select('*, author:profiles!developer_notes_author_id_fkey(id, full_name, role)')
        .order('created_at', { ascending: false })
        .limit(200);

      if (categoryFilter) query = query.eq('category', categoryFilter);
      if (statusFilter) query = query.eq('status', statusFilter);
      if (priorityFilter) query = query.eq('priority', priorityFilter);

      const { data } = await query;
      setNotes((data as unknown as DeveloperNote[]) || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [profile, categoryFilter, statusFilter, priorityFilter]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Fetch projects and members for resolve modal
  const fetchResolveData = useCallback(async () => {
    const [projectsRes, membersRes] = await Promise.all([
      supabase.from('projects').select('id, name').eq('status', 'active').order('name'),
      supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    ]);
    setProjects(projectsRes.data || []);
    setMembers(membersRes.data || []);
  }, []);

  const uploadScreenshot = async (file: File): Promise<string | null> => {
    if (!profile) return null;
    const ext = file.name.split('.').pop();
    const path = `${profile.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('dev-note-screenshots').upload(path, file);
    if (error) return null;
    const { data } = supabase.storage.from('dev-note-screenshots').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleCreate = async (formData: NoteFormData) => {
    if (!profile) return;

    try {
      let screenshotUrl: string | null = null;
      if (formData.screenshot) {
        screenshotUrl = await uploadScreenshot(formData.screenshot);
      }

      const { error } = await supabase.from('developer_notes').insert({
        title: formData.title,
        description: formData.description,
        category: formData.category,
        priority: formData.priority,
        screenshot_url: screenshotUrl,
        author_id: profile.id,
      });
      if (error) throw error;

      setShowForm(false);
      fetchNotes();
      toast.success('Nota creata con successo');
    } catch {
      toast.error('Errore nella creazione della nota');
    }
  };

  const handleEdit = async (formData: NoteFormData) => {
    if (!editingNote) return;

    try {
      let screenshotUrl = editingNote.screenshot_url;
      if (formData.screenshot) {
        screenshotUrl = await uploadScreenshot(formData.screenshot);
      }

      const { error } = await supabase
        .from('developer_notes')
        .update({
          title: formData.title,
          description: formData.description,
          category: formData.category,
          priority: formData.priority,
          screenshot_url: screenshotUrl,
        })
        .eq('id', editingNote.id);
      if (error) throw error;

      setEditingNote(null);
      fetchNotes();
      toast.success('Nota aggiornata con successo');
    } catch {
      toast.error('Errore nell\'aggiornamento della nota');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('developer_notes').delete().eq('id', id);
      if (error) throw error;
      setDeletingNoteId(null);
      fetchNotes();
      toast.success('Nota eliminata');
    } catch {
      toast.error('Errore nell\'eliminazione della nota');
    }
  };

  const handleStatusChange = async (id: string, status: DevNoteStatus) => {
    try {
      const { error } = await supabase.from('developer_notes').update({ status }).eq('id', id);
      if (error) throw error;
      fetchNotes();
      toast.success('Stato aggiornato');
    } catch {
      toast.error('Errore nell\'aggiornamento dello stato');
    }
  };

  const handleResolve = async () => {
    if (!resolvingNote || !resolveProject || !profile) return;
    setResolveLoading(true);

    try {
      // 1. Create task
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .insert({
          title: resolvingNote.title,
          description: `[Dalla nota #${resolvingNote.id.slice(0, 8)}]\n\n${resolvingNote.description}`,
          project_id: resolveProject,
          assigned_to: resolveAssignee || null,
          priority: resolvingNote.priority,
          status: 'todo',
          created_by: profile.id,
        })
        .select('id')
        .single();
      if (taskError) throw taskError;

      // 2. Update note as resolved
      if (task) {
        await supabase
          .from('developer_notes')
          .update({
            status: 'resolved' as DevNoteStatus,
            resolved_task_id: task.id,
            resolved_by: profile.id,
            resolved_at: new Date().toISOString(),
          })
          .eq('id', resolvingNote.id);
      }

      setShowResolve(false);
      setResolvingNote(null);
      setResolveProject('');
      setResolveAssignee('');
      fetchNotes();
      toast.success('Nota risolta e task creato');
    } catch {
      toast.error('Errore nella risoluzione della nota');
    } finally {
      setResolveLoading(false);
    }
  };

  const openResolveModal = (note: DeveloperNote) => {
    setResolvingNote(note);
    setShowResolve(true);
    fetchResolveData();
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'bug': return Bug;
      case 'feature_request': return Sparkles;
      case 'improvement': return Lightbulb;
      default: return MessageSquareWarning;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-pw-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
        <AlertTriangle size={48} className="text-red-400" />
        <h2 className="text-xl font-semibold text-pw-text">Errore nel caricamento</h2>
        <p className="text-pw-text-muted max-w-md text-sm">Non è stato possibile caricare i dati. Riprova.</p>
        <button onClick={() => { setLoading(true); setError(false); fetchNotes(); }} className="px-4 py-2 rounded-xl bg-pw-accent text-pw-bg text-sm font-medium hover:bg-pw-accent-hover transition-colors">Riprova</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)]">
            {isAdmin ? 'Note allo Sviluppatore' : 'Le mie Note'}
          </h1>
          <p className="text-sm text-pw-text-muted">
            {isAdmin
              ? `${notes.length} segnalazioni dal team`
              : 'Segnala bug, richieste e miglioramenti'}
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus size={16} />
          Nuova Nota
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select
          options={[
            { value: 'bug', label: 'Bug' },
            { value: 'feature_request', label: 'Nuova Funzionalità' },
            { value: 'improvement', label: 'Miglioramento' },
          ]}
          placeholder="Tutte le categorie"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="w-48"
        />
        <Select
          options={[
            { value: 'open', label: 'Aperta' },
            { value: 'in_progress', label: 'In lavorazione' },
            { value: 'resolved', label: 'Risolta' },
            { value: 'closed', label: 'Chiusa' },
          ]}
          placeholder="Tutti gli stati"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-48"
        />
        <Select
          options={[
            { value: 'low', label: 'Bassa' },
            { value: 'medium', label: 'Media' },
            { value: 'high', label: 'Alta' },
            { value: 'urgent', label: 'Urgente' },
          ]}
          placeholder="Tutte le priorità"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="w-48"
        />
      </div>

      {/* Notes list */}
      {notes.length === 0 ? (
        <EmptyState
          icon={MessageSquareWarning}
          title="Nessuna nota"
          description={isAdmin ? 'Non ci sono segnalazioni dal team' : 'Non hai ancora inviato segnalazioni'}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {notes.map((note) => {
            const CategoryIcon = getCategoryIcon(note.category);
            const canEdit = isAdmin || (note.author_id === profile?.id && note.status === 'open');
            const canDelete = isAdmin || (note.author_id === profile?.id && note.status === 'open');

            return (
              <Card key={note.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${getDevNoteCategoryColor(note.category)}`}>
                        <CategoryIcon size={16} />
                      </div>
                      <h3 className="text-sm font-semibold text-pw-text truncate">
                        {note.title}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge className={getDevNoteCategoryColor(note.category)}>
                        {getDevNoteCategoryLabel(note.category)}
                      </Badge>
                      <Badge className={getPriorityColor(note.priority)}>
                        {priorityLabels[note.priority]}
                      </Badge>
                      <Badge className={getDevNoteStatusColor(note.status)}>
                        {getDevNoteStatusLabel(note.status)}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-pw-text-muted line-clamp-3 mb-3">
                    {note.description}
                  </p>

                  {/* Screenshot thumbnail */}
                  {note.screenshot_url && (
                    <button
                      onClick={() => setShowScreenshot(note.screenshot_url)}
                      className="mb-3 flex items-center gap-1.5 text-xs text-pw-accent hover:text-pw-accent-hover transition-colors"
                    >
                      <ImageIcon size={14} />
                      Visualizza screenshot
                    </button>
                  )}

                  {/* Meta info */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-pw-text-dim">
                      {isAdmin && note.author && (
                        <>
                          <div className="w-5 h-5 rounded-full bg-pw-surface-3 flex items-center justify-center">
                            <span className="text-[9px] font-bold text-pw-text-muted">
                              {getInitials(note.author.full_name)}
                            </span>
                          </div>
                          <span>{note.author.full_name}</span>
                          <span>·</span>
                        </>
                      )}
                      <span>{formatDate(note.created_at)}</span>
                      {note.resolved_task_id && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1 text-green-400">
                            <CheckCircle2 size={12} />
                            Task creato
                          </span>
                        </>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      {/* Admin: status change */}
                      {isAdmin && note.status !== 'resolved' && note.status !== 'closed' && (
                        <>
                          {note.status === 'open' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleStatusChange(note.id, 'in_progress')}
                            >
                              Prendi in carico
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openResolveModal(note)}
                          >
                            <CheckCircle2 size={14} />
                            Risolvi
                          </Button>
                        </>
                      )}

                      {canEdit && (
                        <button
                          onClick={() => setEditingNote(note)}
                          className="p-1.5 rounded-lg text-pw-text-muted hover:text-pw-text hover:bg-pw-surface-2 transition-colors"
                          aria-label="Modifica nota"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => setDeletingNoteId(note.id)}
                          className="p-1.5 rounded-lg text-pw-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          aria-label="Elimina nota"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={showForm || !!editingNote}
        onClose={() => { setShowForm(false); setEditingNote(null); }}
        title={editingNote ? 'Modifica nota' : 'Nuova nota allo sviluppatore'}
        size="lg"
      >
        <NoteDevForm
          onSubmit={editingNote ? handleEdit : handleCreate}
          onCancel={() => { setShowForm(false); setEditingNote(null); }}
          existing={editingNote || undefined}
        />
      </Modal>

      {/* Resolve Modal */}
      <Modal
        open={showResolve}
        onClose={() => { setShowResolve(false); setResolvingNote(null); }}
        title="Risolvi come Task"
        size="md"
      >
        {resolvingNote && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-pw-surface-2 border border-pw-border">
              <p className="text-xs text-pw-text-muted mb-1">Nota originale</p>
              <p className="text-sm font-medium text-pw-text">{resolvingNote.title}</p>
              <p className="text-xs text-pw-text-muted mt-1 line-clamp-2">{resolvingNote.description}</p>
            </div>

            <Select
              label="Progetto"
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              placeholder="Seleziona progetto"
              value={resolveProject}
              onChange={(e) => setResolveProject(e.target.value)}
              required
            />

            <Select
              label="Assegna a (opzionale)"
              options={members.map((m) => ({ value: m.id, label: m.full_name }))}
              placeholder="Non assegnato"
              value={resolveAssignee}
              onChange={(e) => setResolveAssignee(e.target.value)}
            />

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => { setShowResolve(false); setResolvingNote(null); }}>
                Annulla
              </Button>
              <Button onClick={handleResolve} loading={resolveLoading} disabled={!resolveProject}>
                <CheckCircle2 size={16} />
                Crea Task e Risolvi
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deletingNoteId}
        onClose={() => setDeletingNoteId(null)}
        onConfirm={() => deletingNoteId ? handleDelete(deletingNoteId) : Promise.resolve()}
        title="Elimina nota"
        description="Sei sicuro di voler eliminare questa nota? L'azione non può essere annullata."
        confirmLabel="Elimina"
      />

      {/* Screenshot fullscreen */}
      <Modal
        open={!!showScreenshot}
        onClose={() => setShowScreenshot(null)}
        title="Screenshot"
        size="xl"
      >
        {showScreenshot && (
          <img
            src={showScreenshot}
            alt="Screenshot allegato"
            className="w-full rounded-xl"
          />
        )}
      </Modal>
    </div>
  );
}
