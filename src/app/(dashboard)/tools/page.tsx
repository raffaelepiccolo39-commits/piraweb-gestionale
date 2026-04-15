'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import type { TeamTool } from '@/types/database';
import {
  Wrench,
  Plus,
  ExternalLink,
  Copy,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  Check,
  Globe,
  Lock,
} from 'lucide-react';

const CATEGORIES = [
  { value: 'design', label: 'Design' },
  { value: 'social', label: 'Social Media' },
  { value: 'analytics', label: 'Analytics' },
  { value: 'comunicazione', label: 'Comunicazione' },
  { value: 'sviluppo', label: 'Sviluppo' },
  { value: 'produttivita', label: 'Produttivita\'' },
  { value: 'fatturazione', label: 'Fatturazione' },
  { value: 'altro', label: 'Altro' },
];

const CATEGORY_COLORS: Record<string, string> = {
  design: 'bg-pink-500/15 text-pink-400',
  social: 'bg-blue-500/15 text-blue-400',
  analytics: 'bg-green-500/15 text-green-400',
  comunicazione: 'bg-yellow-500/15 text-yellow-400',
  sviluppo: 'bg-purple-500/15 text-purple-400',
  produttivita: 'bg-indigo-500/15 text-indigo-400',
  fatturazione: 'bg-emerald-500/15 text-emerald-400',
  altro: 'bg-gray-500/15 text-gray-400',
};

export default function ToolsPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();

  const [tools, setTools] = useState<TeamTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTool, setEditingTool] = useState<TeamTool | null>(null);
  const [saving, setSaving] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState('');

  const isAdmin = profile?.role === 'admin';

  const [form, setForm] = useState({
    name: '', url: '', icon_url: '', icon_emoji: '',
    category: 'altro', description: '', username: '', password: '', notes: '',
  });

  const fetchTools = useCallback(async () => {
    const { data } = await supabase
      .from('team_tools')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .order('name');
    if (data) {
      // Filter by role client-side
      const filtered = (data as TeamTool[]).filter(tool => {
        if (!tool.roles || tool.roles.length === 0) return true;
        return tool.roles.includes(profile?.role || '');
      });
      setTools(filtered);
    }
    setLoading(false);
  }, [profile?.role]);

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  const resetForm = () => {
    setForm({ name: '', url: '', icon_url: '', icon_emoji: '', category: 'altro', description: '', username: '', password: '', notes: '' });
    setEditingTool(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (tool: TeamTool) => {
    setEditingTool(tool);
    setForm({
      name: tool.name,
      url: tool.url,
      icon_url: tool.icon_url || '',
      icon_emoji: tool.icon_emoji || '',
      category: tool.category,
      description: tool.description || '',
      username: tool.username || '',
      password: tool.password || '',
      notes: tool.notes || '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.url || !profile) {
      toast.error('Nome e URL sono obbligatori');
      return;
    }
    setSaving(true);

    const payload = {
      name: form.name,
      url: form.url.startsWith('http') ? form.url : `https://${form.url}`,
      icon_url: form.icon_url || null,
      icon_emoji: form.icon_emoji || null,
      category: form.category,
      description: form.description || null,
      username: form.username || null,
      password: form.password || null,
      notes: form.notes || null,
    };

    if (editingTool) {
      const { error } = await supabase.from('team_tools').update(payload).eq('id', editingTool.id);
      if (error) toast.error('Errore nel salvataggio');
      else toast.success('Tool aggiornato');
    } else {
      const { error } = await supabase.from('team_tools').insert({ ...payload, created_by: profile.id });
      if (error) toast.error('Errore nella creazione');
      else toast.success('Tool aggiunto');
    }

    setSaving(false);
    setShowForm(false);
    resetForm();
    fetchTools();
  };

  const handleDelete = async (toolId: string) => {
    if (!confirm('Eliminare questo tool?')) return;
    await supabase.from('team_tools').update({ is_active: false }).eq('id', toolId);
    toast.success('Tool rimosso');
    fetchTools();
  };

  const togglePassword = (toolId: string) => {
    setVisiblePasswords(prev => {
      const next = new Set(prev);
      if (next.has(toolId)) next.delete(toolId);
      else next.add(toolId);
      return next;
    });
  };

  const copyToClipboard = async (text: string, toolId: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(toolId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getFaviconUrl = (url: string) => {
    try {
      const domain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    } catch {
      return null;
    }
  };

  // Group tools by category
  const categories = [...new Set(tools.map(t => t.category))];
  const filteredTools = filterCategory ? tools.filter(t => t.category === filterCategory) : tools;
  const groupedTools = categories
    .filter(cat => !filterCategory || cat === filterCategory)
    .map(cat => ({
      category: cat,
      label: CATEGORIES.find(c => c.value === cat)?.label || cat,
      tools: filteredTools.filter(t => t.category === cat),
    }))
    .filter(g => g.tools.length > 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-pw-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)] flex items-center gap-2">
            <Wrench size={24} className="text-pw-accent" />
            Tools
          </h1>
          <p className="text-sm text-pw-text-muted mt-1">Accesso rapido a tutti gli strumenti del team</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-44">
            <Select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              options={CATEGORIES}
              placeholder="Tutte le categorie"
            />
          </div>
          {isAdmin && (
            <Button onClick={openCreate}>
              <Plus size={16} />
              Aggiungi Tool
            </Button>
          )}
        </div>
      </div>

      {tools.length === 0 ? (
        <div className="text-center py-16">
          <Wrench size={48} className="text-pw-text-dim mx-auto mb-3" />
          <p className="text-pw-text-muted">Nessun tool configurato</p>
          {isAdmin && (
            <Button className="mt-4" onClick={openCreate}>
              <Plus size={14} />
              Aggiungi il primo tool
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {groupedTools.map(group => (
            <div key={group.category}>
              <div className="flex items-center gap-2 mb-4">
                <Badge className={CATEGORY_COLORS[group.category] || CATEGORY_COLORS.altro}>
                  {group.label}
                </Badge>
                <span className="text-xs text-pw-text-dim">{group.tools.length} tool</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {group.tools.map(tool => (
                  <Card key={tool.id} className="group hover:shadow-lg transition-all hover:border-pw-accent/30">
                    <CardContent className="p-5">
                      {/* Header con icona e nome */}
                      <div className="flex items-start justify-between mb-3">
                        <a
                          href={tool.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 flex-1 min-w-0"
                        >
                          <div className="w-12 h-12 rounded-xl bg-pw-surface-3 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                            {tool.icon_emoji ? (
                              <span className="text-2xl">{tool.icon_emoji}</span>
                            ) : tool.icon_url ? (
                              <img src={tool.icon_url} alt={tool.name} className="w-8 h-8 rounded" />
                            ) : (
                              <img
                                src={getFaviconUrl(tool.url) || ''}
                                alt={tool.name}
                                className="w-8 h-8"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-pw-text group-hover:text-pw-accent transition-colors truncate">
                              {tool.name}
                            </h3>
                            {tool.description && (
                              <p className="text-xs text-pw-text-muted truncate">{tool.description}</p>
                            )}
                          </div>
                        </a>
                        {isAdmin && (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button onClick={() => openEdit(tool)} className="p-1 rounded hover:bg-pw-surface-3 text-pw-text-dim hover:text-pw-accent">
                              <Pencil size={12} />
                            </button>
                            <button onClick={() => handleDelete(tool.id)} className="p-1 rounded hover:bg-pw-surface-3 text-pw-text-dim hover:text-red-400">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Link */}
                      <a
                        href={tool.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-pw-accent hover:underline mb-3"
                      >
                        <Globe size={11} />
                        Apri {tool.name}
                        <ExternalLink size={9} />
                      </a>

                      {/* Credentials (if any) */}
                      {(tool.username || tool.password) && (
                        <div className="border-t border-pw-border pt-3 space-y-2">
                          <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-pw-text-dim">
                            <Lock size={10} />
                            Credenziali
                          </div>
                          {tool.username && (
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-pw-text-muted truncate flex-1">{tool.username}</span>
                              <button
                                onClick={() => copyToClipboard(tool.username!, tool.id + '-user')}
                                className="p-1 rounded hover:bg-pw-surface-3 text-pw-text-dim hover:text-pw-accent shrink-0"
                                title="Copia username"
                              >
                                {copiedId === tool.id + '-user' ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                              </button>
                            </div>
                          )}
                          {tool.password && (
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-pw-text-muted font-mono truncate flex-1">
                                {visiblePasswords.has(tool.id) ? tool.password : '••••••••'}
                              </span>
                              <div className="flex shrink-0">
                                <button
                                  onClick={() => togglePassword(tool.id)}
                                  className="p-1 rounded hover:bg-pw-surface-3 text-pw-text-dim hover:text-pw-accent"
                                  title={visiblePasswords.has(tool.id) ? 'Nascondi' : 'Mostra'}
                                >
                                  {visiblePasswords.has(tool.id) ? <EyeOff size={12} /> : <Eye size={12} />}
                                </button>
                                <button
                                  onClick={() => copyToClipboard(tool.password!, tool.id + '-pass')}
                                  className="p-1 rounded hover:bg-pw-surface-3 text-pw-text-dim hover:text-pw-accent"
                                  title="Copia password"
                                >
                                  {copiedId === tool.id + '-pass' ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Notes */}
                      {tool.notes && (
                        <p className="text-[10px] text-pw-text-dim mt-2 border-t border-pw-border pt-2">{tool.notes}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); resetForm(); }}
        title={editingTool ? `Modifica - ${editingTool.name}` : 'Nuovo Tool'}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              id="tool-name"
              label="Nome *"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="es. Canva"
            />
            <Select
              id="tool-category"
              label="Categoria"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              options={CATEGORIES}
            />
          </div>

          <Input
            id="tool-url"
            label="URL *"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="https://www.canva.com"
          />

          <Input
            id="tool-description"
            label="Descrizione"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="es. Creazione grafiche social"
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              id="tool-emoji"
              label="Emoji icona"
              value={form.icon_emoji}
              onChange={(e) => setForm({ ...form, icon_emoji: e.target.value })}
              placeholder="es. 🎨"
            />
            <Input
              id="tool-icon"
              label="URL icona (opzionale)"
              value={form.icon_url}
              onChange={(e) => setForm({ ...form, icon_url: e.target.value })}
              placeholder="https://..."
            />
          </div>

          <div className="border-t border-pw-border pt-4">
            <p className="text-xs font-semibold text-pw-text mb-3 flex items-center gap-1.5">
              <Lock size={12} />
              Credenziali di accesso (visibili al team)
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Input
                id="tool-username"
                label="Username / Email"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="es. team@piraweb.it"
              />
              <Input
                id="tool-password"
                label="Password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
              />
            </div>
          </div>

          <Textarea
            id="tool-notes"
            label="Note"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="es. Account Pro, rinnovo annuale a Gennaio"
            rows={2}
          />

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }} className="flex-1">
              Annulla
            </Button>
            <Button onClick={handleSave} loading={saving} disabled={!form.name || !form.url} className="flex-1">
              {editingTool ? 'Salva Modifiche' : 'Aggiungi Tool'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
