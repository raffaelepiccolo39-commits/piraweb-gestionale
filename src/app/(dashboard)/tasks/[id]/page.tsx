'use client';

import { useEffect, useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { TimeTracker } from '@/components/tasks/time-tracker';
import {
  formatDate,
  formatDateTime,
  getStatusColor,
  getPriorityColor,
  getInitials,
  getRoleLabel,
  getUserColor,
} from '@/lib/utils';
import { STATUS_LABELS, PRIORITY_LABELS } from '@/lib/constants';
import type { Task, TaskComment, TaskAttachment, ContentApproval, Profile } from '@/types/database';
import {
  ArrowLeft,
  Calendar,
  User,
  Flag,
  MessageCircle,
  Paperclip,
  Send,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  FolderKanban,
} from 'lucide-react';

export default function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: taskId } = use(params);
  const { profile } = useAuth();
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();

  const [task, setTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [approvals, setApprovals] = useState<ContentApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);

  const isAdmin = profile?.role === 'admin';

  const fetchTask = useCallback(async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        project:projects(id, name, client:clients(id, name, company)),
        assignee:profiles!tasks_assigned_to_fkey(id, full_name, role, color)
      `)
      .eq('id', taskId)
      .single();

    if (error || !data) {
      router.push('/tasks');
      return;
    }
    setTask(data as Task);
  }, [supabase, taskId, router]);

  const fetchComments = useCallback(async () => {
    const { data } = await supabase
      .from('task_comments')
      .select('*, user:profiles(id, full_name, role, color)')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });
    if (data) setComments(data as TaskComment[]);
  }, [supabase, taskId]);

  const fetchAttachments = useCallback(async () => {
    const { data } = await supabase
      .from('task_attachments')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });
    if (data) setAttachments(data as TaskAttachment[]);
  }, [supabase, taskId]);

  const fetchApprovals = useCallback(async () => {
    const { data } = await supabase
      .from('content_approvals')
      .select('*, submitter:profiles!content_approvals_submitted_by_fkey(id, full_name, role, color), reviewer:profiles!content_approvals_reviewed_by_fkey(id, full_name)')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });
    if (data) setApprovals(data as ContentApproval[]);
  }, [supabase, taskId]);

  useEffect(() => {
    Promise.all([fetchTask(), fetchComments(), fetchAttachments(), fetchApprovals()])
      .finally(() => setLoading(false));
  }, [fetchTask, fetchComments, fetchAttachments, fetchApprovals]);

  // Real-time comments
  useEffect(() => {
    const channel = supabase
      .channel(`task-comments-${taskId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'task_comments',
        filter: `task_id=eq.${taskId}`,
      }, () => fetchComments())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, taskId, fetchComments]);

  const handleAddComment = async () => {
    if (!newComment.trim() || !profile) return;
    setCommentLoading(true);
    const { error } = await supabase.from('task_comments').insert({
      task_id: taskId,
      user_id: profile.id,
      content: newComment.trim(),
    });
    if (error) {
      toast.error('Errore nell\'invio del commento');
    } else {
      setNewComment('');
      fetchComments();
    }
    setCommentLoading(false);
  };

  const handleDeleteComment = async (commentId: string) => {
    await supabase.from('task_comments').delete().eq('id', commentId);
    fetchComments();
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!task) return;
    const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id);
    if (!error) {
      toast.success(`Stato aggiornato: ${STATUS_LABELS[newStatus]}`);
      fetchTask();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-3 border-pw-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!task) return null;

  const assignee = task.assignee as Profile | undefined;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-pw-text-muted">
        <Link href="/tasks" className="hover:text-pw-accent transition-colors flex items-center gap-1">
          <ArrowLeft size={14} />
          Task
        </Link>
        <span>/</span>
        {task.project && (
          <>
            <Link
              href={`/projects/${task.project.id}`}
              className="hover:text-pw-accent transition-colors flex items-center gap-1"
            >
              <FolderKanban size={12} />
              {task.project.name}
            </Link>
            <span>/</span>
          </>
        )}
        <span className="text-pw-text truncate">{task.title}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Task header */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <h1 className="text-xl font-bold text-pw-text">{task.title}</h1>
                <div className="flex gap-2 shrink-0">
                  <Badge className={getStatusColor(task.status)}>
                    {STATUS_LABELS[task.status]}
                  </Badge>
                  <Badge className={getPriorityColor(task.priority)}>
                    {PRIORITY_LABELS[task.priority]}
                  </Badge>
                </div>
              </div>

              {task.description && (
                <p className="text-sm text-pw-text-muted leading-relaxed whitespace-pre-wrap">
                  {task.description}
                </p>
              )}

              {/* Quick status change */}
              {(isAdmin || task.assigned_to === profile?.id) && (
                <div className="mt-4 pt-4 border-t border-pw-border">
                  <p className="text-xs text-pw-text-dim mb-2">Cambia stato:</p>
                  <div className="flex flex-wrap gap-2">
                    {['backlog', 'todo', 'in_progress', 'review', 'done'].map((s) => (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(s)}
                        disabled={task.status === s}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          task.status === s
                            ? 'bg-pw-accent text-white'
                            : 'bg-pw-surface-2 text-pw-text-muted hover:bg-pw-surface-3 hover:text-pw-text'
                        }`}
                      >
                        {STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Time Tracker */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-pw-accent" />
                <h2 className="text-sm font-semibold text-pw-text">Time Tracking</h2>
              </div>
            </CardHeader>
            <CardContent>
              <TimeTracker
                taskId={taskId}
                estimatedHours={task.estimated_hours}
                loggedHours={task.logged_hours ?? 0}
                onUpdate={fetchTask}
              />
            </CardContent>
          </Card>

          {/* Comments */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageCircle size={16} className="text-pw-accent" />
                <h2 className="text-sm font-semibold text-pw-text">
                  Commenti ({comments.length})
                </h2>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Comments list */}
              {comments.length > 0 ? (
                <div className="space-y-3">
                  {comments.map((comment) => {
                    const user = comment.user as Profile | undefined;
                    return (
                      <div key={comment.id} className="flex gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                          style={{ backgroundColor: getUserColor(user) }}
                        >
                          <span className="text-white text-[10px] font-bold">
                            {user ? getInitials(user.full_name) : '?'}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-medium text-pw-text">
                              {user?.full_name || 'Utente'}
                            </span>
                            <span className="text-[10px] text-pw-text-dim">
                              {formatDateTime(comment.created_at)}
                            </span>
                          </div>
                          <p className="text-sm text-pw-text-muted mt-0.5 whitespace-pre-wrap">
                            {comment.content}
                          </p>
                        </div>
                        {(comment.user_id === profile?.id || isAdmin) && (
                          <button
                            onClick={() => handleDeleteComment(comment.id)}
                            className="text-pw-text-dim hover:text-red-400 transition-colors shrink-0"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-pw-text-dim text-center py-4">
                  Nessun commento ancora. Scrivi il primo!
                </p>
              )}

              {/* New comment input */}
              <div className="flex gap-2 pt-2 border-t border-pw-border">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAddComment()}
                  placeholder="Scrivi un commento..."
                  className="flex-1 px-4 py-2.5 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text text-sm focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none"
                />
                <Button
                  size="sm"
                  onClick={handleAddComment}
                  loading={commentLoading}
                  disabled={!newComment.trim()}
                >
                  <Send size={14} />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Content Approvals */}
          {approvals.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CheckCircle size={16} className="text-pw-accent" />
                  <h2 className="text-sm font-semibold text-pw-text">
                    Approvazioni ({approvals.length})
                  </h2>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {approvals.map((approval) => (
                  <div key={approval.id} className="p-4 rounded-xl bg-pw-surface-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-pw-text">{approval.title}</h3>
                      <Badge className={
                        approval.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                        approval.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' :
                        approval.status === 'revision_requested' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' :
                        'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                      }>
                        {approval.status === 'approved' ? 'Approvato' :
                         approval.status === 'rejected' ? 'Rifiutato' :
                         approval.status === 'revision_requested' ? 'Revisione richiesta' :
                         'In attesa'}
                      </Badge>
                    </div>
                    {approval.description && (
                      <p className="text-xs text-pw-text-muted">{approval.description}</p>
                    )}
                    {approval.content_url && (
                      <a
                        href={approval.content_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-pw-accent hover:underline flex items-center gap-1"
                      >
                        <ExternalLink size={10} />
                        Visualizza contenuto
                      </a>
                    )}
                    {approval.review_comment && (
                      <div className="p-2 rounded-lg bg-pw-surface text-xs text-pw-text-muted">
                        <span className="font-medium">Feedback:</span> {approval.review_comment}
                      </div>
                    )}
                    {/* Admin review actions */}
                    {isAdmin && approval.status === 'pending' && (
                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          onClick={async () => {
                            await supabase.from('content_approvals').update({
                              status: 'approved',
                              reviewed_by: profile?.id,
                              reviewed_at: new Date().toISOString(),
                            }).eq('id', approval.id);
                            toast.success('Contenuto approvato');
                            fetchApprovals();
                          }}
                        >
                          <CheckCircle size={12} />
                          Approva
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={async () => {
                            const comment = prompt('Motivo del rifiuto:');
                            if (comment === null) return;
                            await supabase.from('content_approvals').update({
                              status: 'revision_requested',
                              reviewed_by: profile?.id,
                              reviewed_at: new Date().toISOString(),
                              review_comment: comment,
                            }).eq('id', approval.id);
                            toast.success('Revisione richiesta');
                            fetchApprovals();
                          }}
                        >
                          <XCircle size={12} />
                          Richiedi revisione
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Task info */}
          <Card>
            <CardContent className="p-4 space-y-4">
              {/* Assignee */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-pw-text-dim mb-1">Assegnato a</p>
                {assignee ? (
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: getUserColor(assignee) }}
                    >
                      <span className="text-white text-[9px] font-bold">
                        {getInitials(assignee.full_name)}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-pw-text">{assignee.full_name}</p>
                      <p className="text-[10px] text-pw-text-dim">{getRoleLabel(assignee.role)}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-pw-text-muted">Non assegnato</p>
                )}
              </div>

              {/* Project */}
              {task.project && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-pw-text-dim mb-1">Progetto</p>
                  <Link
                    href={`/projects/${task.project.id}`}
                    className="text-sm text-pw-accent hover:underline flex items-center gap-1"
                  >
                    <FolderKanban size={12} />
                    {task.project.name}
                  </Link>
                </div>
              )}

              {/* Deadline */}
              {task.deadline && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-pw-text-dim mb-1">Scadenza</p>
                  <div className="flex items-center gap-1.5 text-sm text-pw-text">
                    <Calendar size={13} />
                    {formatDate(task.deadline)}
                  </div>
                </div>
              )}

              {/* Time summary */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-pw-text-dim mb-1">Ore</p>
                <div className="flex items-center gap-1.5 text-sm text-pw-text">
                  <Clock size={13} />
                  {task.logged_hours ? `${Number(task.logged_hours).toFixed(1)}h loggiate` : '0h loggiate'}
                  {task.estimated_hours ? ` / ${task.estimated_hours}h stimate` : ''}
                </div>
              </div>

              {/* Created */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-pw-text-dim mb-1">Creato</p>
                <p className="text-xs text-pw-text-muted">{formatDateTime(task.created_at)}</p>
              </div>

              {/* Updated */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-pw-text-dim mb-1">Ultimo aggiornamento</p>
                <p className="text-xs text-pw-text-muted">{formatDateTime(task.updated_at)}</p>
              </div>
            </CardContent>
          </Card>

          {/* Attachments */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Paperclip size={14} className="text-pw-accent" />
                <h2 className="text-xs font-semibold text-pw-text">Allegati ({attachments.length})</h2>
              </div>
            </CardHeader>
            <CardContent>
              {attachments.length > 0 ? (
                <div className="space-y-2">
                  {attachments.map((att) => (
                    <a
                      key={att.id}
                      href={att.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 rounded-lg bg-pw-surface-2 hover:bg-pw-surface-3 transition-colors text-xs"
                    >
                      <Paperclip size={12} className="text-pw-text-dim shrink-0" />
                      <span className="text-pw-text truncate">{att.file_name}</span>
                      <ExternalLink size={10} className="text-pw-text-dim shrink-0 ml-auto" />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-pw-text-dim text-center py-2">Nessun allegato</p>
              )}
            </CardContent>
          </Card>

          {/* Submit for approval (non-admin) */}
          {!isAdmin && task.assigned_to === profile?.id && (
            <Button
              className="w-full"
              onClick={async () => {
                const title = prompt('Titolo del contenuto da approvare:');
                if (!title) return;
                const contentUrl = prompt('Link al contenuto (Figma, Google Docs, etc.):');
                await supabase.from('content_approvals').insert({
                  task_id: taskId,
                  title,
                  content_url: contentUrl || null,
                  submitted_by: profile.id,
                });
                toast.success('Contenuto inviato per approvazione');
                fetchApprovals();
              }}
            >
              <CheckCircle size={14} />
              Invia per approvazione
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
