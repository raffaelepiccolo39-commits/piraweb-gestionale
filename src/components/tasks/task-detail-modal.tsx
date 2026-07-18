'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { AssigneeMultiSelect } from '@/components/tasks/assignee-multi-select';
import { formatDateTime, getInitials, safeStorageName } from '@/lib/utils';
import type { Task, Profile, TaskComment, TaskAttachment, Client, TimeEntry } from '@/types/database';
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
  Pencil,
  Check,
  ImagePlus,
  Play,
  CheckCircle2,
} from 'lucide-react';
import { reportSupabaseError, reportUnknown } from '@/lib/report-error';

interface TaskDetailModalProps {
  task: Task | null;
  members: Profile[];
  clients: Client[];
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

const statusOptions = [
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
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteCommentId, setConfirmDeleteCommentId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [deadline, setDeadline] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [commentImage, setCommentImage] = useState<File | null>(null);
  const [commentImagePreview, setCommentImagePreview] = useState('');
  const [commentImageUrls, setCommentImageUrls] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [aiError, setAiError] = useState(false);
  const [deliveryUrl, setDeliveryUrl] = useState('');
  const [runningEntry, setRunningEntry] = useState<{ id: string; started_at: string } | null>(null);
  const [elapsed, setElapsed] = useState('00:00:00');
  const [timerBusy, setTimerBusy] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Registrazione manuale ore + giustificazione
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [logHours, setLogHours] = useState('');
  const [logNote, setLogNote] = useState('');
  const [loggingHours, setLoggingHours] = useState(false);
  // Completamento task senza tempo tracciato: chiede le ore (regola B)
  const [askHours, setAskHours] = useState(false);
  const [completeHours, setCompleteHours] = useState('');
  // Copertura PED: se questa è la task "Programmare post e storie" di uno shooting,
  // qui si segna fino a quando il cliente è coperto → alimenta l'avviso shooting.
  const [pedClientId, setPedClientId] = useState<string | null>(null);
  const [pedCoveredUntil, setPedCoveredUntil] = useState('');
  const [pedSaving, setPedSaving] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setAssigneeIds(task.assigned_to ? [task.assigned_to] : []);
      setStatus(task.status);
      setPriority(task.priority);
      setDeadline(task.deadline ? task.deadline.split('T')[0] : '');
      setEstimatedHours(task.estimated_hours ? String(task.estimated_hours) : '');
      setDeliveryUrl(task.delivery_url || '');
      setNewComment('');
      setCommentImage(null);
      setCommentImagePreview('');
      fetchComments(task.id);
      fetchAttachments(task.id);
      // Carica la lista completa degli assegnatari (multi)
      supabase.from('task_assignees').select('user_id').eq('task_id', task.id).then(({ data }) => {
        if (data && data.length > 0) setAssigneeIds(data.map((r) => r.user_id as string));
      });
    }
  }, [task]);

  // Utente corrente: serve a mostrare modifica/elimina solo sui propri commenti
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rileva se la task è la "Programmare post e storie" di uno shooting e carica
  // la copertura PED già impostata per il cliente.
  useEffect(() => {
    if (!task) { setPedClientId(null); setPedCoveredUntil(''); return; }
    let active = true;
    (async () => {
      const { data: link } = await supabase
        .from('shooting_workflow_tasks')
        .select('client_id')
        .eq('task_id', task.id)
        .eq('step_key', 'programmazione')
        .maybeSingle();
      if (!active) return;
      const cid = (link as { client_id: string } | null)?.client_id ?? null;
      setPedClientId(cid);
      if (cid) {
        const { data: cov } = await supabase
          .from('client_ped_coverage')
          .select('covered_until')
          .eq('client_id', cid)
          .maybeSingle();
        if (active) setPedCoveredUntil((cov as { covered_until: string | null } | null)?.covered_until ?? '');
      } else {
        setPedCoveredUntil('');
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);

  const savePedCoverage = async () => {
    if (!pedClientId || !pedCoveredUntil) return;
    setPedSaving(true);
    const { error } = await supabase.rpc('set_ped_coverage', {
      p_client_id: pedClientId,
      p_covered_until: pedCoveredUntil,
    });
    setPedSaving(false);
    if (error) { reportSupabaseError(error, 'task-ped-copertura', { clientId: pedClientId }); toast.error(error.message || 'Salvataggio non riuscito'); return; }
    toast.success('Copertura piano editoriale salvata');
  };

  // Timer: carica l'eventuale sessione in corso dell'utente su questa task
  useEffect(() => {
    if (!task || !currentUserId) { setRunningEntry(null); return; }
    supabase
      .from('time_entries')
      .select('id, started_at')
      .eq('task_id', task.id)
      .eq('user_id', currentUserId)
      .eq('is_running', true)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setRunningEntry(data ? { id: data.id, started_at: data.started_at } : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, currentUserId]);

  // Carica le ore registrate (di tutti) su questa task, con giustificazione
  const fetchTimeEntries = async (taskId: string) => {
    const { data } = await supabase
      .from('time_entries')
      .select('*, user:profiles!time_entries_user_id_fkey(id, full_name)')
      .eq('task_id', taskId)
      .eq('is_running', false)
      .order('started_at', { ascending: false });
    setTimeEntries((data as TimeEntry[]) || []);
  };

  useEffect(() => {
    if (task?.id) fetchTimeEntries(task.id);
    else setTimeEntries([]);
    setLogHours('');
    setLogNote('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  // Tick del cronometro
  useEffect(() => {
    if (!runningEntry) { setElapsed('00:00:00'); return; }
    const tick = () => {
      const s = Math.max(0, Math.floor((Date.now() - new Date(runningEntry.started_at).getTime()) / 1000));
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      setElapsed(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`);
    };
    tick();
    tickRef.current = setInterval(tick, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [runningEntry]);

  const handleStartTask = async () => {
    if (!task || !currentUserId) return;
    setTimerBusy(true);
    const { data, error } = await supabase
      .from('time_entries')
      .insert({ task_id: task.id, user_id: currentUserId, started_at: new Date().toISOString(), is_running: true })
      .select('id, started_at')
      .single();
    if (error || !data) {
      reportSupabaseError(error, 'task-avvia-timer', { taskId: task.id });
      toast.error(error?.message || 'Errore nell\'avvio della task');
      setTimerBusy(false);
      return;
    }
    setRunningEntry({ id: data.id, started_at: data.started_at });
    // La task passa "In corso" (se non lo è già)
    if (status !== 'in_progress') {
      const { error: stErr } = await supabase.from('tasks').update({ status: 'in_progress' }).eq('id', task.id);
      if (stErr) { reportSupabaseError(stErr, 'task-avvia-aggiorna-stato', { taskId: task.id }); toast.error(stErr.message || 'Timer avviato ma stato non aggiornato'); }
      else { setStatus('in_progress'); }
    }
    setTimerBusy(false);
    toast.success('Task avviata');
  };

  const stopRunningEntry = async () => {
    if (!runningEntry) return true;
    const { error } = await supabase
      .from('time_entries')
      .update({ ended_at: new Date().toISOString(), is_running: false })
      .eq('id', runningEntry.id);
    if (error) {
      reportSupabaseError(error, 'task-stop-timer', { entryId: runningEntry.id });
      toast.error(error.message || 'Errore nello stop del timer');
      return false;
    }
    setRunningEntry(null);
    return true;
  };

  const markDone = async () => {
    if (!task) return;
    const { error } = await supabase.from('tasks').update({ status: 'done' }).eq('id', task.id);
    if (error) {
      reportSupabaseError(error, 'task-completa', { taskId: task.id });
      toast.error(error.message || 'Errore nel completamento della task');
      return false;
    }
    setStatus('done');
    if (!deliveryUrl.trim() && !task.delivery_url) {
      toast.success('Task completata — ricordati di aggiungere il link al lavoro');
    } else {
      toast.success('Task completata');
    }
    onUpdate?.();
    return true;
  };

  const handleCompleteTask = async () => {
    if (!task) return;
    // Regola B: senza tempo tracciato, chiedi le ore prima di completare.
    const hasTracked = !!runningEntry || timeEntries.length > 0 || Number(task.logged_hours || 0) > 0;
    if (!hasTracked) { setAskHours(true); return; }

    setTimerBusy(true);
    if (runningEntry) {
      const ok = await stopRunningEntry();
      if (!ok) { setTimerBusy(false); return; }
    }
    await markDone();
    setTimerBusy(false);
  };

  // Completa registrando le ore inserite a mano (task mai tracciata).
  const confirmCompleteWithHours = async () => {
    if (!task || !currentUserId) return;
    const hours = parseFloat(completeHours.replace(',', '.'));
    if (!hours || hours <= 0) { toast.error('Inserisci le ore lavorate'); return; }
    setTimerBusy(true);
    const now = new Date().toISOString();
    const { error: e1 } = await supabase.from('time_entries').insert({
      task_id: task.id,
      user_id: currentUserId,
      started_at: now,
      ended_at: now,
      duration_minutes: Math.round(hours * 60),
      is_running: false,
    });
    if (e1) { reportSupabaseError(e1, 'task-completa-con-ore', { taskId: task.id }); setTimerBusy(false); toast.error(e1.message || 'Errore nella registrazione delle ore'); return; }
    await fetchTimeEntries(task.id);
    const ok = await markDone();
    setTimerBusy(false);
    if (ok) { setAskHours(false); setCompleteHours(''); }
  };

  const handleLogHours = async () => {
    if (!task || !currentUserId) return;
    const hours = parseFloat(logHours.replace(',', '.'));
    if (!hours || hours <= 0) {
      toast.error('Inserisci un numero di ore valido');
      return;
    }
    setLoggingHours(true);
    const now = new Date().toISOString();
    const { error } = await supabase.from('time_entries').insert({
      task_id: task.id,
      user_id: currentUserId,
      description: logNote.trim() || null,
      started_at: now,
      ended_at: now,
      duration_minutes: Math.round(hours * 60),
      is_running: false,
    });
    setLoggingHours(false);
    if (error) {
      reportSupabaseError(error, 'task-registra-ore', { taskId: task.id });
      toast.error(error.message || 'Errore nella registrazione delle ore');
      return;
    }
    setLogHours('');
    setLogNote('');
    await fetchTimeEntries(task.id);
    toast.success('Ore registrate');
    onUpdate?.();
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!task) return;
    const { error } = await supabase.from('time_entries').delete().eq('id', entryId);
    if (error) {
      reportSupabaseError(error, 'task-elimina-registrazione', { taskId: task.id, entryId });
      toast.error(error.message || 'Errore nell\'eliminazione della registrazione');
      return;
    }
    await fetchTimeEntries(task.id);
    onUpdate?.();
  };

  const fetchComments = async (taskId: string) => {
    const { data } = await supabase
      .from('task_comments')
      .select('*, user:profiles!task_comments_user_id_fkey(id, full_name)')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });
    const list = (data as TaskComment[]) || [];
    setComments(list);
    // Signed URL per le immagini allegate ai commenti (bucket privato)
    const withImg = list.filter((c) => c.image_path);
    if (withImg.length > 0) {
      const entries = await Promise.all(
        withImg.map(async (c) => {
          const { data: signed } = await supabase.storage
            .from('attachments')
            .createSignedUrl(c.image_path as string, 3600);
          return [c.id, signed?.signedUrl ?? ''] as const;
        })
      );
      setCommentImageUrls(Object.fromEntries(entries.filter(([, u]) => u)));
    } else {
      setCommentImageUrls({});
    }
  };

  const pickCommentImage = (file: File) => {
    if (commentImagePreview) URL.revokeObjectURL(commentImagePreview);
    setCommentImage(file);
    setCommentImagePreview(URL.createObjectURL(file));
  };

  const clearCommentImage = () => {
    if (commentImagePreview) URL.revokeObjectURL(commentImagePreview);
    setCommentImage(null);
    setCommentImagePreview('');
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
    let uploaded = 0;
    let failed = 0;
    let skippedSize = 0;
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        skippedSize++;
        continue;
      }
      const path = `${task.id}/${Date.now()}_${safeStorageName(file.name)}`;
      const { error: uploadError } = await supabase.storage.from('attachments').upload(path, file);
      if (uploadError) {
        reportSupabaseError(uploadError, 'task-upload-allegato', { taskId: task.id, file: file.name });
        failed++;
        continue;
      }
      const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path);
      const { error: insertError } = await supabase.from('task_attachments').insert({
        task_id: task.id,
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_type: file.type,
        file_size: file.size,
        uploaded_by: user.id,
      });
      if (insertError) {
        reportSupabaseError(insertError, 'task-salva-allegato', { taskId: task.id, file: file.name });
        failed++;
      } else {
        uploaded++;
      }
    }
    await fetchAttachments(task.id);
    setUploadingFile(false);
    if (uploaded > 0) toast.success(`${uploaded} allegato${uploaded === 1 ? '' : 'i'} caricato${uploaded === 1 ? '' : 'i'}`);
    if (failed > 0) toast.error(`${failed} allegato${failed === 1 ? '' : 'i'} non caricato${failed === 1 ? '' : 'i'}`);
    if (skippedSize > 0) toast.error(`${skippedSize} file superano i 10MB e non sono stati caricati`);
  };

  const handleDeleteAttachment = async (att: TaskAttachment) => {
    const { error } = await supabase.from('task_attachments').delete().eq('id', att.id);
    if (error) {
      reportSupabaseError(error, 'task-elimina-allegato', { attachmentId: att.id });
      toast.error('Errore nella rimozione dell\'allegato');
      return;
    }
    if (task) await fetchAttachments(task.id);
    toast.success('Allegato rimosso');
  };

  const handleDownloadAttachment = async (att: TaskAttachment) => {
    // Il bucket "attachments" è privato: il public URL salvato non scarica (403).
    // Ricaviamo il path dall'URL e usiamo download() con la sessione autenticata
    // (policy SELECT per authenticated), poi forziamo il download nel browser.
    try {
      const marker = '/attachments/';
      const idx = att.file_url.indexOf(marker);
      const path = idx >= 0 ? decodeURIComponent(att.file_url.slice(idx + marker.length)) : null;
      if (!path) {
        window.open(att.file_url, '_blank', 'noopener');
        return;
      }
      const { data, error } = await supabase.storage.from('attachments').download(path);
      if (error || !data) throw error || new Error('Download vuoto');
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.file_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      reportUnknown(e, 'client', { op: 'task-download-allegato', attachmentId: att.id });
      toast.error('Errore nel download dell\'allegato');
    }
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
      } else {
        setAiError(true); setTimeout(() => setAiError(false), 3000);
      }
    } catch (err) { reportUnknown(err, 'client', { op: 'task-ai-descrizione' }); setAiError(true); setTimeout(() => setAiError(false), 3000); }
    setGeneratingAi(false);
  };

  const handleSave = async () => {
    if (!task) return;
    // Il link al lavoro è facoltativo: chiunque (incluso l'assegnatario) può
    // spostare la task in "Review"/"Fatto" anche senza link.
    setSaving(true);
    const { data, error } = await supabase.from('tasks').update({
      title,
      description: description || null,
      assigned_to: assigneeIds[0] || null,
      status,
      priority,
      deadline: deadline || null,
      estimated_hours: estimatedHours ? Number(estimatedHours) : null,
      delivery_url: deliveryUrl.trim() || null,
    }).eq('id', task.id).select('id');
    setSaving(false);
    if (error) {
      reportSupabaseError(error, 'task-salva', { taskId: task.id });
      toast.error('Errore nel salvataggio della task');
      return;
    }
    // Nessuna riga aggiornata = RLS ha bloccato l'update in silenzio
    // (es. la modifica "si salvava" ma poi tornava indietro).
    if (!data || data.length === 0) {
      toast.error('Non hai i permessi per modificare questa task');
      return;
    }
    // Aggiorna la lista completa degli assegnatari (multi) + notifiche ai nuovi
    await supabase.rpc('set_task_assignees', { p_task_id: task.id, p_user_ids: assigneeIds });
    toast.success('Task aggiornata');
    onUpdate();
  };

  const handleDelete = async () => {
    if (!task) return;
    const { data, error } = await supabase.from('tasks').delete().eq('id', task.id).select('id');
    if (error) {
      reportSupabaseError(error, 'task-elimina', { taskId: task.id });
      toast.error('Errore nella rimozione della task');
      return;
    }
    // Nessuna riga eliminata = RLS ha bloccato in silenzio (prima mostrava
    // "Task eliminata" pur non cancellando nulla).
    if (!data || data.length === 0) {
      toast.error('Non hai i permessi per eliminare questa task');
      return;
    }
    toast.success('Task eliminata');
    onClose();
    onUpdate();
  };

  const handleSendComment = async () => {
    if (!task || (!newComment.trim() && !commentImage)) return;
    setSendingComment(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Devi essere autenticato per commentare');
      setSendingComment(false);
      return;
    }
    let imagePath: string | null = null;
    if (commentImage) {
      const MAX = 10 * 1024 * 1024; // 10MB
      if (commentImage.size > MAX) {
        toast.error('L\'immagine supera i 10MB');
        setSendingComment(false);
        return;
      }
      const path = `comments/${task.id}/${Date.now()}_${commentImage.name}`;
      const { error: upErr } = await supabase.storage.from('attachments').upload(path, commentImage);
      if (upErr) {
        reportSupabaseError(upErr, 'task-commento-upload-immagine', { taskId: task.id });
        toast.error('Errore nel caricamento dell\'immagine');
        setSendingComment(false);
        return;
      }
      imagePath = path;
    }
    const { error } = await supabase.from('task_comments').insert({
      task_id: task.id,
      user_id: user.id,
      content: newComment.trim(),
      image_path: imagePath,
    });
    if (error) {
      reportSupabaseError(error, 'task-invia-commento', { taskId: task.id });
      toast.error('Errore nell\'invio del commento');
      setSendingComment(false);
      return;
    }
    setNewComment('');
    clearCommentImage();
    await fetchComments(task.id);
    setSendingComment(false);
  };

  const startEditComment = (comment: TaskComment) => {
    setEditingCommentId(comment.id);
    setEditingContent(comment.content);
  };

  const cancelEditComment = () => {
    setEditingCommentId(null);
    setEditingContent('');
  };

  const handleSaveEditComment = async (commentId: string) => {
    if (!task || !editingContent.trim()) return;
    setSavingEdit(true);
    const { error } = await supabase
      .from('task_comments')
      .update({ content: editingContent.trim() })
      .eq('id', commentId);
    setSavingEdit(false);
    if (error) {
      reportSupabaseError(error, 'task-modifica-commento', { commentId });
      toast.error('Errore nella modifica del commento');
      return;
    }
    cancelEditComment();
    await fetchComments(task.id);
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!task) return;
    const { error } = await supabase.from('task_comments').delete().eq('id', commentId);
    if (error) {
      reportSupabaseError(error, 'task-elimina-commento', { commentId });
      toast.error('Errore nell\'eliminazione del commento');
      return;
    }
    await fetchComments(task.id);
    toast.success('Commento eliminato');
  };

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
              <AssigneeMultiSelect
                value={assigneeIds}
                onChange={setAssigneeIds}
                members={members.map((m) => ({ id: m.id, full_name: m.full_name, color: m.color }))}
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
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pw-surface-3 text-xs text-pw-text-muted" title="Ore stimate">
                <Clock size={12} />
                <span className="text-[10px] text-pw-text-dim">Stim.</span>
                <input
                  type="number"
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(e.target.value)}
                  placeholder="—"
                  className="bg-transparent outline-none text-pw-text-muted w-10"
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

            {/* Copertura PED: solo sulla task "Programmare post e storie" di uno shooting */}
            {pedClientId && (
              <div className="mt-3 rounded-xl border border-pink-500/30 bg-pink-500/[0.05] p-3">
                <label className="text-[11px] font-semibold text-pw-text flex items-center gap-1.5 mb-1.5">
                  <Calendar size={13} className="text-pink-400" />
                  Fino a quando hai programmato i contenuti?
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={pedCoveredUntil}
                    onChange={(e) => setPedCoveredUntil(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg border border-pw-border bg-pw-surface-2 text-pw-text text-xs focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none"
                  />
                  <Button variant="outline" size="sm" onClick={savePedCoverage} loading={pedSaving}>
                    <Save size={14} /> Salva
                  </Button>
                </div>
                <p className="text-[10px] text-pw-text-dim mt-1.5">
                  Serve ad avvisare l&apos;admin di programmare il prossimo shooting prima che il cliente resti senza contenuti.
                </p>
              </div>
            )}

            {/* Client info — nome cliente/progetto cliccabile → apre il progetto */}
            {clientName && (
              <p className="text-xs text-pw-text-dim">
                Cliente:{' '}
                {task.project_id ? (
                  <a
                    href={`/projects/${task.project_id}`}
                    className="text-pw-accent hover:underline inline-flex items-center gap-1"
                    title="Apri il progetto"
                  >
                    {clientName}
                    <ExternalLink size={9} />
                  </a>
                ) : (
                  <span className="text-pw-text-muted">{clientName}</span>
                )}
                {' · '}Ultima modifica: <span className="text-pw-text-muted">{formatDateTime(task.updated_at)}</span>
              </p>
            )}

            {/* Timer task → registra le ore nel Timesheet (time_entries).
                "Inizia task" mette In corso; "Task completata" ferma e mette Fatto. */}
            <div className="rounded-xl border border-pw-border bg-pw-surface-2 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-pw-text-muted">
                  <Clock size={14} className="text-pw-accent" />
                  <span>
                    Registrate <strong className="text-pw-text">{(task.logged_hours || 0).toFixed(1)}h</strong>
                    {task.estimated_hours ? ` / ${task.estimated_hours}h stimate` : ''}
                  </span>
                </div>
                {runningEntry && (
                  <span className="font-mono text-sm font-semibold text-pw-accent tabular-nums">{elapsed}</span>
                )}
              </div>
              <div className="mt-3 flex items-center gap-2">
                {askHours ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-pw-text-muted">Ore lavorate:</span>
                    <input
                      type="number" min="0" step="0.25" autoFocus
                      value={completeHours}
                      onChange={(e) => setCompleteHours(e.target.value)}
                      placeholder="Ore"
                      className="w-20 px-2 py-1 rounded-lg border border-pw-border bg-pw-surface-2 text-pw-text text-xs outline-none focus:ring-2 focus:ring-pw-accent/30"
                    />
                    <button
                      type="button"
                      onClick={confirmCompleteWithHours}
                      disabled={timerBusy}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      {timerBusy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                      Completa
                    </button>
                    <button type="button" onClick={() => { setAskHours(false); setCompleteHours(''); }} className="text-xs text-pw-text-dim hover:text-pw-text">
                      Annulla
                    </button>
                  </div>
                ) : !runningEntry ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleStartTask}
                      disabled={timerBusy || status === 'done'}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-pw-accent text-[#0A263A] hover:bg-pw-accent-hover disabled:opacity-40 transition-colors"
                    >
                      {timerBusy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                      Inizia task
                    </button>
                    {status !== 'done' && (
                      <button
                        type="button"
                        onClick={handleCompleteTask}
                        disabled={timerBusy}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                      >
                        {timerBusy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        Task completata
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleCompleteTask}
                    disabled={timerBusy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {timerBusy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    Task completata
                  </button>
                )}
              </div>

              {/* Registra ore manualmente + giustificazione */}
              <div className="mt-3 pt-3 border-t border-pw-border">
                <p className="text-[11px] uppercase tracking-widest text-pw-text-dim mb-2">Registra ore</p>
                <div className="flex items-end gap-2">
                  <div className="w-20">
                    <Input
                      type="number"
                      min="0"
                      step="0.25"
                      value={logHours}
                      onChange={(e) => setLogHours(e.target.value)}
                      placeholder="Ore"
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      value={logNote}
                      onChange={(e) => setLogNote(e.target.value)}
                      placeholder="Giustificazione (es. montaggio video reel)"
                    />
                  </div>
                  <Button size="sm" onClick={handleLogHours} loading={loggingHours} disabled={!logHours}>
                    <Clock size={14} />
                    Registra
                  </Button>
                </div>

                {timeEntries.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {timeEntries.map((entry) => (
                      <div key={entry.id} className="flex items-start gap-2 text-xs">
                        <span className="font-mono font-semibold text-pw-accent tabular-nums shrink-0 w-12">
                          {((entry.duration_minutes || 0) / 60).toFixed(2)}h
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className="text-pw-text-muted">{entry.user?.full_name || 'Utente'}</span>
                          {entry.description && <span className="text-pw-text"> — {entry.description}</span>}
                        </div>
                        {entry.user_id === currentUserId && (
                          <button
                            type="button"
                            onClick={() => handleDeleteEntry(entry.id)}
                            className="text-pw-text-dim hover:text-red-400 transition-colors shrink-0"
                            title="Elimina registrazione"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

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
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-pw-accent hover:text-pw-accent-hover transition-colors duration-200 disabled:opacity-40"
                >
                  {generatingAi ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {generatingAi ? 'Generazione...' : 'Scrivi con AI'}
                </button>
                {aiError && <span className="text-[11px] text-red-400 ml-2">Errore, riprova</span>}
              </div>
              <RichTextEditor
                value={description}
                onChange={setDescription}
                placeholder="Aggiungi una descrizione dettagliata..."
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
                      <button
                        type="button"
                        onClick={() => handleDownloadAttachment(att)}
                        className="shrink-0 text-pw-text-dim hover:text-pw-accent transition-colors"
                        title="Scarica allegato"
                      >
                        <Download size={14} />
                      </button>
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
              <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
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
            <div className="mb-4">
              <div className="flex gap-2">
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
                <div className="flex flex-col gap-1.5 self-end">
                  <label
                    htmlFor="comment-image-upload"
                    className="p-2 rounded-lg bg-pw-surface-3 text-pw-text-muted hover:bg-pw-surface-2 cursor-pointer transition-colors"
                    title="Allega un'immagine"
                  >
                    <ImagePlus size={14} />
                    <input
                      id="comment-image-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { if (e.target.files?.[0]) pickCommentImage(e.target.files[0]); e.target.value = ''; }}
                    />
                  </label>
                  <button
                    onClick={handleSendComment}
                    disabled={(!newComment.trim() && !commentImage) || sendingComment}
                    className="p-2 rounded-lg bg-pw-accent text-[#0A263A] hover:bg-pw-accent-hover disabled:opacity-40 transition-colors"
                  >
                    {sendingComment ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  </button>
                </div>
              </div>
              {/* Anteprima immagine selezionata */}
              {commentImagePreview && (
                <div className="mt-2 relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={commentImagePreview} alt="Anteprima" className="max-h-24 rounded-lg border border-pw-border" />
                  <button
                    type="button"
                    onClick={clearCommentImage}
                    className="absolute -top-2 -right-2 p-0.5 rounded-full bg-pw-surface-3 border border-pw-border text-pw-text-dim hover:text-red-400"
                    title="Rimuovi immagine"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>

            {/* Comments list */}
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {comments.length === 0 && (
                <p className="text-xs text-pw-text-dim text-center py-4">Nessun commento</p>
              )}
              {comments.map((comment) => {
                const commenter = (comment.user as { full_name: string } | undefined)?.full_name || '?';
                const isOwn = !!currentUserId && comment.user_id === currentUserId;
                const isEditing = editingCommentId === comment.id;
                return (
                  <div key={comment.id} className="flex gap-2 group">
                    <div className="w-6 h-6 rounded-full bg-pw-navy flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-white text-[8px] font-bold">{getInitials(commenter)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-pw-text">{commenter}</span>
                        <span className="text-[10px] text-pw-text-dim">{formatDateTime(comment.created_at)}</span>
                        {comment.updated_at !== comment.created_at && (
                          <span className="text-[9px] text-pw-text-dim italic">modificato</span>
                        )}
                        {isOwn && !isEditing && (
                          <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => startEditComment(comment)}
                              className="text-pw-text-dim hover:text-pw-accent transition-colors"
                              title="Modifica commento"
                            >
                              <Pencil size={11} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteCommentId(comment.id)}
                              className="text-pw-text-dim hover:text-red-400 transition-colors"
                              title="Elimina commento"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        )}
                      </div>
                      {isEditing ? (
                        <div className="mt-1">
                          <textarea
                            value={editingContent}
                            onChange={(e) => setEditingContent(e.target.value)}
                            rows={2}
                            autoFocus
                            className="w-full px-2 py-1.5 rounded-lg border border-pw-border bg-pw-surface-2 text-pw-text text-xs focus:ring-2 focus:ring-pw-accent/30 outline-none resize-none"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEditComment(comment.id); }
                              if (e.key === 'Escape') cancelEditComment();
                            }}
                          />
                          <div className="flex items-center gap-1.5 mt-1">
                            <button
                              type="button"
                              onClick={() => handleSaveEditComment(comment.id)}
                              disabled={!editingContent.trim() || savingEdit}
                              className="flex items-center gap-1 px-2 py-1 rounded-md bg-pw-accent text-[#0A263A] text-[10px] font-medium hover:bg-pw-accent-hover disabled:opacity-40 transition-colors"
                            >
                              {savingEdit ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                              Salva
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditComment}
                              className="px-2 py-1 rounded-md text-[10px] text-pw-text-muted hover:text-pw-text transition-colors"
                            >
                              Annulla
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {comment.content && (
                            <p className="text-xs text-pw-text-muted mt-0.5 whitespace-pre-wrap">{comment.content}</p>
                          )}
                          {comment.image_path && commentImageUrls[comment.id] && (
                            <a href={commentImageUrls[comment.id]} target="_blank" rel="noopener noreferrer" className="block mt-1.5">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={commentImageUrls[comment.id]}
                                alt="Immagine del commento"
                                className="max-h-40 rounded-lg border border-pw-border hover:opacity-90 transition-opacity"
                              />
                            </a>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Elimina task"
        description="Sei sicuro di voler eliminare questa task? Verranno rimossi anche commenti e allegati associati."
        confirmLabel="Elimina"
      />
      <ConfirmDialog
        open={confirmDeleteCommentId !== null}
        onClose={() => setConfirmDeleteCommentId(null)}
        onConfirm={() => {
          if (confirmDeleteCommentId) handleDeleteComment(confirmDeleteCommentId);
          setConfirmDeleteCommentId(null);
        }}
        title="Elimina commento"
        description="Sei sicuro di voler eliminare questo commento? L'azione non è reversibile."
        confirmLabel="Elimina"
      />
    </Modal>
  );
}
