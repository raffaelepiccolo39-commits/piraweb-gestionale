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
import { formatDate, formatDateTime, getInitials, getUserColor } from '@/lib/utils';
import type { Meeting, MeetingActionItem, Client, Profile, Project } from '@/types/database';
import {
  Video,
  Plus,
  Calendar,
  MapPin,
  Clock,
  Users,
  CheckCircle,
  Circle,
  ArrowRight,
  Sparkles,
  Trash2,
} from 'lucide-react';

export default function MeetingsPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teamMembers, setTeamMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [actionItems, setActionItems] = useState<MeetingActionItem[]>([]);
  const [newAction, setNewAction] = useState('');
  const [meetingNotes, setMeetingNotes] = useState('');

  const isAdmin = profile?.role === 'admin';

  const [form, setForm] = useState({
    title: '',
    description: '',
    client_id: '',
    project_id: '',
    scheduled_at: '',
    duration_minutes: '60',
    location: '',
    attendees: [] as string[],
  });

  const fetchMeetings = useCallback(async () => {
    const { data } = await supabase
      .from('meetings')
      .select('*, client:clients(id, name, company), creator:profiles!meetings_created_by_fkey(id, full_name)')
      .order('scheduled_at', { ascending: false })
      .limit(50);
    setMeetings((data as Meeting[]) || []);
  }, [supabase]);

  const fetchActionItems = useCallback(async (meetingId: string) => {
    const { data } = await supabase
      .from('meeting_action_items')
      .select('*, assignee:profiles!meeting_action_items_assigned_to_fkey(id, full_name, color)')
      .eq('meeting_id', meetingId)
      .order('created_at');
    setActionItems((data as MeetingActionItem[]) || []);
  }, [supabase]);

  useEffect(() => {
    Promise.all([
      fetchMeetings(),
      supabase.from('clients').select('id, name, company').eq('is_active', true).order('company').then((r) => setClients((r.data as Client[]) || [])),
      supabase.from('projects').select('id, name, client_id').order('name').then((r) => setProjects((r.data as Project[]) || [])),
      supabase.from('profiles').select('*').eq('is_active', true).order('full_name').then((r) => setTeamMembers((r.data as Profile[]) || [])),
    ]).finally(() => setLoading(false));
  }, [fetchMeetings, supabase]);

  useEffect(() => {
    if (selectedMeeting) {
      fetchActionItems(selectedMeeting.id);
      setMeetingNotes(selectedMeeting.notes || '');
    }
  }, [selectedMeeting, fetchActionItems]);

  const handleCreate = async () => {
    if (!form.title || !form.scheduled_at) {
      toast.error('Titolo e data sono obbligatori');
      return;
    }
    const { error } = await supabase.from('meetings').insert({
      title: form.title,
      description: form.description || null,
      client_id: form.client_id || null,
      project_id: form.project_id || null,
      scheduled_at: form.scheduled_at,
      duration_minutes: parseInt(form.duration_minutes) || 60,
      location: form.location || null,
      attendees: form.attendees,
      created_by: profile!.id,
    });
    if (error) {
      toast.error('Errore nella creazione');
    } else {
      toast.success('Meeting creato');
      setShowForm(false);
      setForm({ title: '', description: '', client_id: '', project_id: '', scheduled_at: '', duration_minutes: '60', location: '', attendees: [] });
      fetchMeetings();
    }
  };

  const handleAddAction = async () => {
    if (!newAction.trim() || !selectedMeeting) return;
    const { error } = await supabase.from('meeting_action_items').insert({
      meeting_id: selectedMeeting.id,
      content: newAction.trim(),
    });
    if (!error) {
      setNewAction('');
      fetchActionItems(selectedMeeting.id);
    }
  };

  const handleToggleAction = async (item: MeetingActionItem) => {
    await supabase.from('meeting_action_items')
      .update({ completed: !item.completed })
      .eq('id', item.id);
    fetchActionItems(selectedMeeting!.id);
  };

  const handleCreateTaskFromAction = async (item: MeetingActionItem) => {
    if (!selectedMeeting) return;
    // Create task from action item
    const { data: task, error } = await supabase.from('tasks').insert({
      title: item.content,
      description: `Azione dal meeting: "${selectedMeeting.title}"`,
      project_id: selectedMeeting.project_id || (projects[0]?.id || null),
      assigned_to: item.assigned_to,
      status: 'todo',
      priority: 'medium',
      created_by: profile!.id,
    }).select('id').single();

    if (!error && task) {
      await supabase.from('meeting_action_items')
        .update({ task_id: task.id, completed: true })
        .eq('id', item.id);
      toast.success('Task creata dall\'action item');
      fetchActionItems(selectedMeeting.id);
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedMeeting) return;
    await supabase.from('meetings').update({ notes: meetingNotes }).eq('id', selectedMeeting.id);
    toast.success('Note salvate');
  };

  const upcomingMeetings = meetings.filter((m) => new Date(m.scheduled_at) >= new Date() && !m.completed);
  const pastMeetings = meetings.filter((m) => new Date(m.scheduled_at) < new Date() || m.completed);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-3 border-pw-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)] flex items-center gap-2">
            <Video size={24} className="text-pw-accent" />
            Meeting
          </h1>
          <p className="text-sm text-pw-text-muted mt-1">Gestisci meeting con clienti e team, con action items automatici</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus size={16} />
          Nuovo Meeting
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Meeting list */}
        <div className="lg:col-span-1 space-y-4">
          {/* Upcoming */}
          <div>
            <p className="text-xs font-medium text-pw-text-muted uppercase tracking-widest mb-2">
              Prossimi ({upcomingMeetings.length})
            </p>
            {upcomingMeetings.map((meeting) => {
              const client = meeting.client as Client | undefined;
              return (
                <button
                  key={meeting.id}
                  onClick={() => setSelectedMeeting(meeting)}
                  className={`w-full text-left p-3 rounded-xl mb-2 transition-colors duration-200 ease-out ${
                    selectedMeeting?.id === meeting.id
                      ? 'bg-pw-accent/10 border border-pw-accent/30'
                      : 'bg-pw-surface-2 hover:bg-pw-surface-3 border border-transparent'
                  }`}
                >
                  <p className="text-sm font-medium text-pw-text truncate">{meeting.title}</p>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-pw-text-dim">
                    <Calendar size={10} />
                    {formatDateTime(meeting.scheduled_at)}
                  </div>
                  {client && (
                    <p className="text-[10px] text-pw-text-dim mt-0.5">{client.company || client.name}</p>
                  )}
                </button>
              );
            })}
            {upcomingMeetings.length === 0 && (
              <p className="text-xs text-pw-text-dim text-center py-4">Nessun meeting in programma</p>
            )}
          </div>

          {/* Past */}
          <div>
            <p className="text-xs font-medium text-pw-text-muted uppercase tracking-widest mb-2">
              Passati ({pastMeetings.length})
            </p>
            {pastMeetings.slice(0, 10).map((meeting) => (
              <button
                key={meeting.id}
                onClick={() => setSelectedMeeting(meeting)}
                className={`w-full text-left p-3 rounded-xl mb-2 transition-colors duration-200 ease-out opacity-70 ${
                  selectedMeeting?.id === meeting.id
                    ? 'bg-pw-accent/10 border border-pw-accent/30 opacity-100'
                    : 'bg-pw-surface-2 hover:bg-pw-surface-3 border border-transparent'
                }`}
              >
                <p className="text-sm font-medium text-pw-text truncate">{meeting.title}</p>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-pw-text-dim">
                  <Calendar size={10} />
                  {formatDate(meeting.scheduled_at)}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Meeting detail */}
        <div className="lg:col-span-2">
          {selectedMeeting ? (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-lg font-bold text-pw-text mb-2">{selectedMeeting.title}</h2>
                  {selectedMeeting.description && (
                    <p className="text-sm text-pw-text-muted mb-4">{selectedMeeting.description}</p>
                  )}
                  <div className="flex flex-wrap gap-4 text-sm text-pw-text-muted">
                    <span className="flex items-center gap-1">
                      <Calendar size={14} />
                      {formatDateTime(selectedMeeting.scheduled_at)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={14} />
                      {selectedMeeting.duration_minutes} min
                    </span>
                    {selectedMeeting.location && (
                      <a
                        href={selectedMeeting.location.startsWith('http') ? selectedMeeting.location : undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-pw-accent hover:underline"
                      >
                        <MapPin size={14} />
                        {selectedMeeting.location.startsWith('http') ? 'Link Meeting' : selectedMeeting.location}
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Notes */}
              <Card>
                <CardHeader>
                  <h3 className="text-sm font-semibold text-pw-text">Note del Meeting</h3>
                </CardHeader>
                <CardContent>
                  <textarea
                    value={meetingNotes}
                    onChange={(e) => setMeetingNotes(e.target.value)}
                    placeholder="Scrivi le note del meeting..."
                    rows={6}
                    className="w-full px-4 py-3 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text text-sm focus:ring-2 focus:ring-pw-accent/30 outline-none resize-none"
                  />
                  <Button size="sm" className="mt-2" onClick={handleSaveNotes}>
                    Salva Note
                  </Button>
                </CardContent>
              </Card>

              {/* Action Items */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-pw-text flex items-center gap-2">
                      <CheckCircle size={14} className="text-pw-accent" />
                      Action Items ({actionItems.length})
                    </h3>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {actionItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg bg-pw-surface-2/50 group">
                      <button onClick={() => handleToggleAction(item)}>
                        {item.completed ? (
                          <CheckCircle size={16} className="text-green-400" />
                        ) : (
                          <Circle size={16} className="text-pw-text-dim" />
                        )}
                      </button>
                      <span className={`flex-1 text-sm ${item.completed ? 'line-through text-pw-text-dim' : 'text-pw-text'}`}>
                        {item.content}
                      </span>
                      {!item.completed && !item.task_id && (
                        <button
                          onClick={() => handleCreateTaskFromAction(item)}
                          className="text-[10px] px-2 py-1 rounded-md bg-pw-accent/10 text-pw-accent hover:bg-pw-accent/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                          title="Crea task da action item"
                        >
                          <ArrowRight size={10} />
                          Crea Task
                        </button>
                      )}
                      {item.task_id && (
                        <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-[9px]">
                          Task creata
                        </Badge>
                      )}
                    </div>
                  ))}

                  {/* Add action */}
                  <div className="flex gap-2 pt-2 border-t border-pw-border">
                    <input
                      type="text"
                      value={newAction}
                      onChange={(e) => setNewAction(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddAction()}
                      placeholder="Aggiungi action item..."
                      className="flex-1 px-3 py-2 rounded-lg border border-pw-border bg-pw-surface-2 text-pw-text text-sm focus:ring-2 focus:ring-pw-accent/30 outline-none"
                    />
                    <Button size="sm" onClick={handleAddAction} disabled={!newAction.trim()}>
                      <Plus size={14} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-center">
              <div>
                <Video size={48} className="text-pw-text-dim mx-auto mb-3" />
                <p className="text-pw-text-muted text-sm">Seleziona un meeting per vedere i dettagli</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create meeting modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nuovo Meeting">
        <div className="space-y-4">
          <Input
            label="Titolo"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Es: Call settimanale con cliente X"
            required
          />
          <Textarea
            label="Descrizione"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Agenda del meeting..."
            rows={2}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Cliente"
              value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value })}
              placeholder="Nessuno"
              options={[{ value: '', label: 'Nessun cliente' }, ...clients.map((c) => ({ value: c.id, label: c.company || c.name }))]}
            />
            <Select
              label="Progetto"
              value={form.project_id}
              onChange={(e) => setForm({ ...form, project_id: e.target.value })}
              placeholder="Nessuno"
              options={[{ value: '', label: 'Nessun progetto' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Data e ora"
              type="datetime-local"
              value={form.scheduled_at}
              onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
              required
            />
            <Input
              label="Durata (minuti)"
              type="number"
              value={form.duration_minutes}
              onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
            />
          </div>
          <Input
            label="Luogo / Link"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="https://meet.google.com/... o 'Ufficio'"
          />
          {/* Attendees */}
          <div>
            <label className="block text-sm font-medium text-pw-text-muted mb-2">Partecipanti</label>
            <div className="flex flex-wrap gap-2">
              {teamMembers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setForm((f) => ({
                      ...f,
                      attendees: f.attendees.includes(m.id)
                        ? f.attendees.filter((id) => id !== m.id)
                        : [...f.attendees, m.id],
                    }));
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ease-out border ${
                    form.attendees.includes(m.id)
                      ? 'border-pw-accent bg-pw-accent/10 text-pw-accent'
                      : 'border-pw-border bg-pw-surface-2 text-pw-text-muted hover:border-pw-accent/50'
                  }`}
                >
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: getUserColor(m) }}
                  >
                    <span className="text-white text-[6px] font-bold">{getInitials(m.full_name).charAt(0)}</span>
                  </div>
                  {m.full_name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowForm(false)}>Annulla</Button>
            <Button onClick={handleCreate}>Crea Meeting</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
