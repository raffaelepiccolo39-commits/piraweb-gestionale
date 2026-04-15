'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { formatDate, formatDateTime, getInitials, getPriorityColor, getRoleLabel } from '@/lib/utils';
import type { Task, Profile, TaskComment, TaskAttachment, Client } from '@/types/database';
import {
  Calendar,
  User,
  Tag,
  CheckSquare,
  MessageSquare,
  Save,
  Trash2,
  Send,
  Clock,
  Paperclip,
  FileText,
  Download,
  X,
  Sparkles,
  Loader2,
  ExternalLink,
} from 'lucide-react';

interface TaskDetailModalProps {
  task: Task | null;
  members: Profile[];
  clients: Client[];
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

const statusOptions = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'Da fare' },
  { value: 'in_progress', label: 'In corso' },
  { value: 'review', label: 'Review' },
  { value: 'done', label: 'Fatto' },
];

const priorityOptions = [
  { value: 'low', label: 'Bassa' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];

export function TaskDetailModal({ task, members, clients, open, onClose, onUpdate }: TaskDetailModalProps) {
  const supabase = createClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [deadline, setDeadline] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [deliveryUrl, setDeliveryUrl] = useState('');

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setAssignedTo(task.assigned_to || '');
      setStatus(task.status);
      setPriority(task.priority);
      setDeadline(task.deadline ? task.deadline.split('T')[0] : '');
      setEstimatedHours(task.estimated_hours ? String(task.estimated_hours) : '');
      setDeliveryUrl(task.delivery_url || '');
      fetchComments(task.id);
      fetchAttachments(task.id);
    }
  }, [task]);

  const fetchComments = async (taskId: string) => {
    const { data } = await supabase
      .from('task_comments')
      .select('*, user:profiles!task_comments_user_id_fkey(id, full_name)')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });
    setComments((data as TaskComment[]) || []);
  };

  const fetchAttachments = async (taskId: string) => {
    const { data } = await supabase
      .from('task_attachments')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });
    setAttachments((data as TaskAttachment[]) || []);
  };

  const handleFileUpload = async (files: FileList) => {
    if (!task) return;
    setUploadingFile(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setUploadingFile(false); return; }

    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        console.warn(`File "${file.name}" exceeds 10MB limit, skipping.`);
        continue;
      }
      const path = `${task.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from('attachments').upload(path, file);
      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path);
        const { error: insertError } = await supabase.from('task_attachments').insert({
          task_id: task.id,
          file_name: file.name,
          file_url: urlData.publicUrl,
          file_type: file.type,
          file_size: file.size,
          uploaded_by: user.id,
        });
        if (insertError) console.error('Error saving attachment:', insertError);
      }
    }
    await fetchAttachments(task.id);
    setUploadingFile(false);
  };

  const handleDeleteAttachment = async (att: TaskAttachment) => {
    const { error } = await supabase.from('task_attachments').delete().eq('id', att.id);
    if (error) { console.error('Error deleting attachment:', error); return; }
    if (task) await fetchAttachments(task.id);
  };

  const handleAiDescription = async () => {
    if (!title.trim()) return;
    setGeneratingAi(true);
    try {
      const res = await fetch('/api/ai/describe-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, client_name: clientName }),
      });
      const data = await res.json();
      if (res.ok && data.description) {
        setDescription(data.description);
      }
    } catch { /* ignore */ }
    setGeneratingAi(false);
  };

  const handleSave = async () => {
    if (!task) return;
    // Require delivery URL when marking as done
    if (status === 'done' && !deliveryUrl.trim() && !task.delivery_url) {
      alert('Per segnare come "Fatto" inserisci il link al lavoro (Google Drive, Figma, ecc.)');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('tasks').update({
      title,
      description: description || null,
      assigned_to: assignedTo || null,
      status,
      priority,
      deadline: deadline || null,
      estimated_hours: estimatedHours ? Number(estimatedHours) : null,
      delivery_url: deliveryUrl.trim() || null,
    }).eq('id', task.id);
    setSaving(false);
    if (error) { console.error('Error updating task:', error); return; }
    onUpdate();
  };

  const handleDelete = async () => {
    if (!task || !confirm('Eliminare questa task?')) return;
    const { error } = await supabase.from('tasks').delete().eq('id', task.id);
    if (error) { console.error('Error deleting task:', error); return; }
    onClose();
    onUpdate();
  };

  const handleSendComment = async () => {
    if (!task || !newComment.trim()) return;
    setSendingComment(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase.from('task_comments').insert({
        task_id: task.id,
        user_id: user.id,
        content: newComment.trim(),
      });
      if (error) { console.error('Error adding comment:', error); setSendingComment(false); return; }
      setNewComment('');
      await fetchComments(task.id);
    }
    setSendingComment(false);
  };

  const assigneeName = members.find((m) => m.id === assignedTo)?.full_name || '';
  const projectInfo = task?.project as { name: string; client?: { name: string; company: string | null } } | undefined;
  const clientName = projectInfo?.client?.company || projectInfo?.client?.name || projectInfo?.name || '';

  return (
    <Modal open={open} onClose={onClose} title="" size="xl">
      {task && (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left: main content */}
          <div className="flex-1 min-w-0 space-y-5">
            {/* Assigned to badge */}
            <div className="flex items-center gap-2">
              <Select
                id="detail-assignee"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                options={members.map((m) => ({ value: m.id, label: m.full_name }))}
                placeholder="Non assegnato"
              />
            </div>

            {/* Title */}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-xl font-bold text-pw-text bg-transparent border-none outline-none font-[var(--font-syne)] placeholder:text-pw-text-dim"
              placeholder="Titolo task..."
            />

            {/* Quick actions bar */}
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pw-surface-3 text-xs text-pw-text-muted">
                <Tag size={12} />
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="bg-transparent outline-none text-pw-text-muted"
                >
                  {priorityOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pw-surface-3 text-xs text-pw-text-muted">
                <Calendar size={12} />
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="bg-transparent outline-none text-pw-text-muted"
                />
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pw-surface-3 text-xs text-pw-text-muted">
                <CheckSquare size={12} />
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="bg-transparent outline-none text-pw-text-muted"
                >
                  {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pw-surface-3 text-xs text-pw-text-muted">
                <Clock size={12} />
                <input
                  type="number"
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(e.target.value)}
                  placeholder="Ore"
                  className="bg-transparent outline-none text-pw-text-muted w-12"
                  min="0"
                  step="0.5"
                />
              </div>
            </div>

            {/* Delivery URL / Drive link */}
            <div className="mt-3">
              <label className="text-[10px] uppercase tracking-widest text-pw-text-dim mb-1 block">
                Link Lavoro (Google Drive, Figma, Canva...)
              </label>
              <input
                type="url"
                value={deliveryUrl}
                onChange={(e) => setDeliveryUrl(e.target.value)}
                placeholder="https://drive.google.com/..."
                className="w-full px-3 py-2 rounded-lg border border-pw-border bg-pw-surface-2 text-pw-text text-xs focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none"
              />
              {deliveryUrl && (
                <a href={deliveryUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-pw-accent hover:underline mt-1 inline-flex items-center gap-1">
                  Apri link <ExternalLink size={8} />
                </a>
              )}
            </div>

            {/* Client info */}
            {clientName && (
              <p className="text-xs text-pw-text-dim">
                Cliente: <span className="text-pw-text-muted">{clientName}</span>
                {' · '}Ultima modifica: <span className="text-pw-text-muted">{formatDateTime(task.updated_at)}</span>
              </p>
            )}

            {/* Description */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-2 text-sm font-medium text-pw-text">
                  <MessageSquare size={16} />
                  Descrizione
                </label>
                <button
                  type="button"
                  onClick={handleAiDescription}
                  disabled={generatingAi || !title.trim()}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-pw-accent/15 text-pw-accent hover:bg-pw-accent/25 disabled:opacity-40 transition-colors"
                >
                  {generatingAi ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {generatingAi ? 'Generando...' : 'Scrivi con AI'}
                </button>
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Aggiungi una descrizione dettagliata..."
                rows={8}
                className="w-full px-4 py-3 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text placeholder:text-pw-text-dim focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none transition-all text-sm resize-y"
              />
            </div>

            {/* Attachments */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-2 text-sm font-medium text-pw-text">
                  <Paperclip size={16} />
                  Allegati
                </label>
                <label
                  htmlFor="detail-file-upload"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-pw-surface-3 text-pw-text-muted hover:bg-pw-surface-2 cursor-pointer transition-colors"
                >
                  {uploadingFile ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
                  {uploadingFile ? 'Caricando...' : 'Carica file'}
                  <input
                    id="detail-file-upload"
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                  />
                </label>
              </div>
              {attachments.length === 0 ? (
                <p className="text-xs text-pw-text-dim text-center py-3 border border-dashed border-pw-border rounded-xl">
                  Nessun allegato
                </p>
              ) : (
                <div className="space-y-1.5">
                  {attachments.map((att) => (
                    <div key={att.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-pw-surface-3">
                      <FileText size={14} className="text-pw-accent shrink-0" />
                      <span className="text-xs text-pw-text truncate flex-1">{att.file_name}</span>
                      {att.file_size && (
                        <span className="text-[10px] text-pw-text-dim shrink-0">
                          {(att.file_size / 1024).toFixed(0)} KB
                        </span>
                      )}
                      <a
                        href={att.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-pw-text-dim hover:text-pw-accent transition-colors"
                      >
                        <Download size={14} />
                      </a>
                      <button
                        onClick={() => handleDeleteAttachment(att)}
                        className="shrink-0 text-pw-text-dim hover:text-red-400 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Save + Delete */}
            <div className="flex items-center gap-3">
              <Button onClick={handleSave} loading={saving}>
                <Save size={14} />
                Salva
              </Button>
              <Button variant="outline" onClick={onClose}>
                Annulla
              </Button>
              <div className="flex-1" />
              <Button variant="danger" size="sm" onClick={handleDelete}>
                <Trash2 size={14} />
              </Button>
            </div>
          </div>

          {/* Right: comments */}
          <div className="w-full lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-pw-border pt-4 lg:pt-0 lg:pl-6">
            <h3 className="text-sm font-semibold text-pw-text mb-3 flex items-center gap-2">
              <MessageSquare size={14} />
              Commenti e attività
            </h3>

            {/* New comment */}
            <div className="flex gap-2 mb-4">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Scrivi un commento..."
                rows={2}
                className="flex-1 px-3 py-2 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text placeholder:text-pw-text-dim focus:ring-2 focus:ring-pw-accent/30 outline-none text-xs resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendComment(); }
                }}
              />
              <button
                onClick={handleSendComment}
                disabled={!newComment.trim() || sendingComment}
                className="p-2 rounded-lg bg-pw-accent text-pw-bg hover:bg-pw-accent-hover disabled:opacity-40 transition-colors self-end"
              >
                <Send size={14} />
              </button>
            </div>

            {/* Comments list */}
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {comments.length === 0 && (
                <p className="text-xs text-pw-text-dim text-center py-4">Nessun commento</p>
              )}
              {comments.map((comment) => {
                const commenter = (comment.user as { full_name: string } | undefined)?.full_name || '?';
                return (
                  <div key={comment.id} className="flex gap-2">
                    <div className="w-6 h-6 rounded-full bg-pw-purple flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-white text-[8px] font-bold">{getInitials(commenter)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-pw-text">{commenter}</span>
                        <span className="text-[10px] text-pw-text-dim">{formatDateTime(comment.created_at)}</span>
                      </div>
                      <p className="text-xs text-pw-text-muted mt-0.5 whitespace-pre-wrap">{comment.content}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
