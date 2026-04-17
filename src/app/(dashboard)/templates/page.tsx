'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
import { PRIORITY_LABELS, ROLE_LABELS } from '@/lib/constants';
import type { ProjectTemplate, TemplateTask, Client } from '@/types/database';
import {
  LayoutTemplate,
  Plus,
  Play,
  Trash2,
  GripVertical,
  Clock,
  User,
} from 'lucide-react';

const CATEGORY_LABELS: Record<string, string> = {
  social_media: 'Social Media',
  branding: 'Branding',
  web: 'Sito Web',
  video: 'Video',
  marketing: 'Marketing',
  other: 'Altro',
};

export default function TemplatesPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();

  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);
  const [templateTasks, setTemplateTasks] = useState<TemplateTask[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showUse, setShowUse] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);

  const isAdmin = profile?.role === 'admin';

  const [form, setForm] = useState({ name: '', description: '', category: 'other' });
  const [useForm, setUseForm] = useState({ project_name: '', client_id: '' });
  const [taskForm, setTaskForm] = useState({
    title: '', description: '', assigned_role: '', priority: 'medium', estimated_hours: '', day_offset: '0',
  });

  const fetchTemplates = useCallback(async () => {
    const { data } = await supabase.from('project_templates').select('*').order('name');
    setTemplates((data as ProjectTemplate[]) || []);
  }, [supabase]);

  const fetchTemplateTasks = useCallback(async (templateId: string) => {
    const { data } = await supabase
      .from('template_tasks')
      .select('*')
      .eq('template_id', templateId)
      .order('position');
    setTemplateTasks((data as TemplateTask[]) || []);
  }, [supabase]);

  useEffect(() => {
    Promise.all([
      fetchTemplates(),
      supabase.from('clients').select('id, name, company').eq('is_active', true).order('company').then((r) => setClients((r.data as Client[]) || [])),
    ]).finally(() => setLoading(false));
  }, [fetchTemplates, supabase]);

  useEffect(() => {
    if (selectedTemplate) fetchTemplateTasks(selectedTemplate.id);
  }, [selectedTemplate, fetchTemplateTasks]);

  const handleCreateTemplate = async () => {
    if (!form.name) { toast.error('Nome obbligatorio'); return; }
    const { error } = await supabase.from('project_templates').insert({
      name: form.name, description: form.description || null, category: form.category, created_by: profile!.id,
    });
    if (!error) {
      toast.success('Template creato');
      setShowCreate(false);
      setForm({ name: '', description: '', category: 'other' });
      fetchTemplates();
    }
  };

  const handleAddTemplateTask = async () => {
    if (!taskForm.title || !selectedTemplate) return;
    const { error } = await supabase.from('template_tasks').insert({
      template_id: selectedTemplate.id,
      title: taskForm.title,
      description: taskForm.description || null,
      assigned_role: taskForm.assigned_role || null,
      priority: taskForm.priority,
      estimated_hours: taskForm.estimated_hours ? parseFloat(taskForm.estimated_hours) : null,
      day_offset: parseInt(taskForm.day_offset) || 0,
      position: templateTasks.length,
    });
    if (!error) {
      setShowAddTask(false);
      setTaskForm({ title: '', description: '', assigned_role: '', priority: 'medium', estimated_hours: '', day_offset: '0' });
      fetchTemplateTasks(selectedTemplate.id);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    await supabase.from('template_tasks').delete().eq('id', taskId);
    if (selectedTemplate) fetchTemplateTasks(selectedTemplate.id);
  };

  const handleUseTemplate = async () => {
    if (!useForm.project_name || !selectedTemplate) return;
    const { data, error } = await supabase.rpc('create_project_from_template', {
      p_template_id: selectedTemplate.id,
      p_project_name: useForm.project_name,
      p_client_id: useForm.client_id || null,
      p_created_by: profile!.id,
    });
    if (error) {
      toast.error('Errore nella creazione del progetto');
    } else {
      toast.success('Progetto creato da template!');
      setShowUse(false);
      router.push(`/projects/${data}`);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-3 border-pw-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)] flex items-center gap-2">
            <LayoutTemplate size={24} className="text-pw-accent" />
            Project Templates
          </h1>
          <p className="text-sm text-pw-text-muted mt-1">Template riutilizzabili per avviare progetti con task preconfigurate</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={16} />
            Nuovo Template
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Template list */}
        <div className="space-y-3">
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => setSelectedTemplate(tpl)}
              className={`w-full text-left p-4 rounded-xl transition-colors duration-200 ease-out border ${
                selectedTemplate?.id === tpl.id
                  ? 'bg-pw-accent/10 border-pw-accent/30'
                  : 'bg-pw-surface-2 border-transparent hover:bg-pw-surface-3'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-medium text-pw-text">{tpl.name}</h3>
                {tpl.category && <Badge>{CATEGORY_LABELS[tpl.category] || tpl.category}</Badge>}
              </div>
              {tpl.description && <p className="text-[10px] text-pw-text-dim line-clamp-2">{tpl.description}</p>}
            </button>
          ))}
          {templates.length === 0 && (
            <div className="text-center py-12">
              <LayoutTemplate size={48} className="text-pw-text-dim mx-auto mb-3" />
              <p className="text-pw-text-muted">Nessun template ancora</p>
              <p className="text-xs text-pw-text-dim mt-1">Crea template riutilizzabili per avviare progetti rapidamente</p>
              {isAdmin && (
                <Button className="mt-4" onClick={() => setShowCreate(true)}>
                  <Plus size={14} />
                  Crea Template
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Template detail */}
        <div className="lg:col-span-2">
          {selectedTemplate ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-pw-text">{selectedTemplate.name}</h2>
                    {selectedTemplate.description && (
                      <p className="text-sm text-pw-text-muted mt-1">{selectedTemplate.description}</p>
                    )}
                  </div>
                  <Button onClick={() => { setUseForm({ project_name: '', client_id: '' }); setShowUse(true); }}>
                    <Play size={14} />
                    Usa Template
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-pw-text-muted">Task del template ({templateTasks.length})</p>
                  {isAdmin && (
                    <Button size="sm" variant="ghost" onClick={() => setShowAddTask(true)}>
                      <Plus size={12} />
                      Aggiungi task
                    </Button>
                  )}
                </div>
                {templateTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-3 p-3 rounded-xl bg-pw-surface-2 group">
                    <GripVertical size={14} className="text-pw-text-dim shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-pw-text">{task.title}</p>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-pw-text-dim">
                        {task.assigned_role && (
                          <span className="flex items-center gap-1">
                            <User size={8} />
                            {ROLE_LABELS[task.assigned_role] || task.assigned_role}
                          </span>
                        )}
                        {task.estimated_hours && (
                          <span className="flex items-center gap-1">
                            <Clock size={8} />
                            {task.estimated_hours}h
                          </span>
                        )}
                        {task.day_offset > 0 && (
                          <span>Giorno +{task.day_offset}</span>
                        )}
                        <Badge className="text-[8px]">{PRIORITY_LABELS[task.priority]}</Badge>
                      </div>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="p-1 rounded text-pw-text-dim hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
                {templateTasks.length === 0 && (
                  <p className="text-sm text-pw-text-dim text-center py-6">Nessuna task nel template</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center justify-center h-64 text-center">
              <div>
                <LayoutTemplate size={48} className="text-pw-text-dim mx-auto mb-3" />
                <p className="text-pw-text-muted text-sm">Seleziona un template</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create template modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nuovo Template">
        <div className="space-y-4">
          <Input label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Es: Social Media Management" required />
          <Select label="Categoria" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} options={Object.entries(CATEGORY_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
          <Textarea label="Descrizione" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setShowCreate(false)}>Annulla</Button><Button onClick={handleCreateTemplate}>Crea</Button></div>
        </div>
      </Modal>

      {/* Use template modal */}
      <Modal open={showUse} onClose={() => setShowUse(false)} title="Crea Progetto da Template">
        <div className="space-y-4">
          <Input label="Nome Progetto" value={useForm.project_name} onChange={(e) => setUseForm({ ...useForm, project_name: e.target.value })} placeholder="Es: Social Media - Cliente X" required />
          <Select label="Cliente" value={useForm.client_id} onChange={(e) => setUseForm({ ...useForm, client_id: e.target.value })} options={[{ value: '', label: 'Nessun cliente' }, ...clients.map((c) => ({ value: c.id, label: c.company || c.name }))]} />
          <p className="text-xs text-pw-text-dim">Verranno create {templateTasks.length} task automaticamente con deadline calcolate dalla data di oggi.</p>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setShowUse(false)}>Annulla</Button><Button onClick={handleUseTemplate}><Play size={14} />Crea Progetto</Button></div>
        </div>
      </Modal>

      {/* Add task to template modal */}
      <Modal open={showAddTask} onClose={() => setShowAddTask(false)} title="Aggiungi Task al Template">
        <div className="space-y-4">
          <Input label="Titolo" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} required />
          <Textarea label="Descrizione" value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} rows={2} />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Ruolo assegnato" value={taskForm.assigned_role} onChange={(e) => setTaskForm({ ...taskForm, assigned_role: e.target.value })} options={[{ value: '', label: 'Nessuno' }, ...Object.entries(ROLE_LABELS).map(([v, l]) => ({ value: v, label: l }))]} />
            <Select label="Priorita'" value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })} options={Object.entries(PRIORITY_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Ore stimate" type="number" value={taskForm.estimated_hours} onChange={(e) => setTaskForm({ ...taskForm, estimated_hours: e.target.value })} />
            <Input label="Giorno offset (dalla partenza)" type="number" value={taskForm.day_offset} onChange={(e) => setTaskForm({ ...taskForm, day_offset: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setShowAddTask(false)}>Annulla</Button><Button onClick={handleAddTemplateTask}>Aggiungi</Button></div>
        </div>
      </Modal>
    </div>
  );
}
