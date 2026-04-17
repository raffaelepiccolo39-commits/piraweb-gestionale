'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { SocialPost, Client, SocialPlatform, SocialPostStatus } from '@/types/database';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Hash,
  Calendar,
  Filter,
  AtSign,
  Globe,
  Tv,
  Share2,
  MessageCircle,
  Link2,
  Send,
  CheckCircle,
  Loader2,
} from 'lucide-react';

const PLATFORM_ICONS: Record<string, typeof Hash> = {
  instagram: AtSign,
  facebook: Globe,
  linkedin: Share2,
  youtube: Tv,
  twitter: MessageCircle,
  tiktok: Hash,
  pinterest: Hash,
};

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'text-pink-500',
  facebook: 'text-blue-600',
  tiktok: 'text-cyan-400',
  linkedin: 'text-blue-700',
  youtube: 'text-red-500',
  twitter: 'text-sky-400',
  pinterest: 'text-red-600',
  other: 'text-pw-text-dim',
};

const STATUS_COLORS: Record<SocialPostStatus, string> = {
  idea: 'bg-gray-100 text-gray-700 dark:bg-pw-surface-2 dark:text-pw-text-muted',
  draft: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  ready: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  scheduled: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  published: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

const STATUS_LABELS: Record<SocialPostStatus, string> = {
  idea: 'Idea',
  draft: 'Bozza',
  ready: 'Pronto',
  scheduled: 'Programmato',
  published: 'Pubblicato',
  rejected: 'Rifiutato',
};

const PLATFORM_OPTIONS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'twitter', label: 'Twitter/X' },
  { value: 'pinterest', label: 'Pinterest' },
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Monday = 0
}

export default function SocialCalendarPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filterClient, setFilterClient] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('');
  // Meta integration
  const [metaConnected, setMetaConnected] = useState(false);
  const [metaPages, setMetaPages] = useState<{ id: string; page_name: string; instagram_username: string | null; client_id: string | null }[]>([]);
  const [metaUserName, setMetaUserName] = useState('');
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [showPublish, setShowPublish] = useState<SocialPost | null>(null);
  const [publishPage, setPublishPage] = useState('');
  const [publishPlatform, setPublishPlatform] = useState('facebook');

  const isAdmin = profile?.role === 'admin';

  const [form, setForm] = useState({
    title: '',
    caption: '',
    platforms: [] as string[],
    status: 'draft' as SocialPostStatus,
    scheduled_at: '',
    client_id: '',
    hashtags: '',
    notes: '',
  });

  const fetchPosts = useCallback(async () => {
    const startDate = new Date(year, month, 1).toISOString();
    const endDate = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

    let query = supabase
      .from('social_posts')
      .select('*, client:clients(id, name, company, logo_url)')
      .gte('scheduled_at', startDate)
      .lte('scheduled_at', endDate)
      .order('scheduled_at', { ascending: true });

    if (filterClient) query = query.eq('client_id', filterClient);

    const { data } = await query;
    let filtered = (data as SocialPost[]) || [];
    if (filterPlatform) {
      filtered = filtered.filter((p) => p.platforms.includes(filterPlatform as SocialPlatform));
    }
    setPosts(filtered);
  }, [supabase, year, month, filterClient, filterPlatform]);

  const fetchClients = useCallback(async () => {
    const { data } = await supabase.from('clients').select('id, name, company').eq('is_active', true).order('company');
    if (data) setClients(data as Client[]);
  }, [supabase]);

  useEffect(() => {
    Promise.all([fetchPosts(), fetchClients()]).finally(() => setLoading(false));
    // Fetch Meta connection
    fetch('/api/meta/pages').then((r) => r.json()).then((data) => {
      setMetaConnected(data.connected || false);
      setMetaPages(data.pages || []);
      setMetaUserName(data.user_name || '');
    }).catch(() => {});
  }, [fetchPosts, fetchClients]);

  const handleCreate = async () => {
    if (!form.title || !form.client_id || form.platforms.length === 0) {
      toast.error('Compila titolo, cliente e almeno una piattaforma');
      return;
    }
    const { error } = await supabase.from('social_posts').insert({
      title: form.title,
      caption: form.caption || null,
      platforms: form.platforms,
      status: form.status,
      scheduled_at: form.scheduled_at || null,
      client_id: form.client_id,
      hashtags: form.hashtags || null,
      notes: form.notes || null,
      created_by: profile!.id,
    });
    if (error) {
      toast.error('Errore nella creazione');
    } else {
      toast.success('Post pianificato');
      setShowForm(false);
      setForm({ title: '', caption: '', platforms: [], status: 'draft', scheduled_at: '', client_id: '', hashtags: '', notes: '' });
      fetchPosts();
    }
  };

  const handleStatusChange = async (postId: string, newStatus: SocialPostStatus) => {
    const updates: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'published') updates.published_at = new Date().toISOString();
    await supabase.from('social_posts').update(updates).eq('id', postId);
    fetchPosts();
  };

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  const monthName = new Date(year, month).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  const weekDays = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

  const getPostsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return posts.filter((p) => p.scheduled_at?.startsWith(dateStr));
  };

  const isToday = (day: number) => {
    return year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
  };

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
            <Calendar size={24} className="text-pw-accent" />
            Piano Editoriale
          </h1>
          <p className="text-sm text-pw-text-muted mt-1">Pianifica e gestisci i contenuti social dei tuoi clienti</p>
        </div>
        <div className="flex gap-2">
          {metaConnected ? (
            <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 flex items-center gap-1">
              <CheckCircle size={10} />
              Meta: {metaUserName}
            </Badge>
          ) : isAdmin ? (
            <Button variant="outline" size="sm" onClick={() => window.location.href = '/api/meta/auth'}>
              <Link2 size={14} />
              Collega Meta
            </Button>
          ) : null}
          <Button onClick={() => { setShowForm(true); setForm((f) => ({ ...f, scheduled_at: selectedDate || '' })); }}>
            <Plus size={16} />
            Nuovo Post
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-1 text-pw-text-muted">
          <Filter size={14} />
          <span className="text-xs">Filtri:</span>
        </div>
        <select
          value={filterClient}
          onChange={(e) => setFilterClient(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-pw-border bg-pw-surface-2 text-pw-text text-xs"
        >
          <option value="">Tutti i clienti</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.company || c.name}</option>
          ))}
        </select>
        <select
          value={filterPlatform}
          onChange={(e) => setFilterPlatform(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-pw-border bg-pw-surface-2 text-pw-text text-xs"
        >
          <option value="">Tutte le piattaforme</option>
          {PLATFORM_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* Calendar navigation */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-pw-surface-2 text-pw-text-muted hover:text-pw-text transition-colors duration-200 ease-out">
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-lg font-semibold text-pw-text capitalize">{monthName}</h2>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-pw-surface-2 text-pw-text-muted hover:text-pw-text transition-colors duration-200 ease-out">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="rounded-2xl border border-pw-border overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 bg-pw-surface-2">
          {weekDays.map((d) => (
            <div key={d} className="text-center text-[10px] uppercase tracking-widest text-pw-text-dim font-medium py-2 border-b border-pw-border">
              {d}
            </div>
          ))}
        </div>

        {/* Days */}
        <div className="grid grid-cols-7">
          {/* Empty cells before first day */}
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-[120px] border-b border-r border-pw-border bg-pw-surface/50" />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayPosts = getPostsForDay(day);
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

            return (
              <div
                key={day}
                className={`min-h-[120px] border-b border-r border-pw-border p-1.5 cursor-pointer hover:bg-pw-surface-2/50 transition-colors duration-200 ease-out ${
                  isToday(day) ? 'bg-pw-accent/5' : ''
                }`}
                onClick={() => {
                  setSelectedDate(dateStr);
                  setShowForm(true);
                  setForm((f) => ({ ...f, scheduled_at: `${dateStr}T10:00` }));
                }}
              >
                <div className={`text-xs font-medium mb-1 ${isToday(day) ? 'text-pw-accent' : 'text-pw-text-muted'}`}>
                  {day}
                </div>
                <div className="space-y-1">
                  {dayPosts.slice(0, 3).map((post) => (
                    <div
                      key={post.id}
                      className="px-1.5 py-1 rounded-md text-[10px] truncate cursor-pointer hover:opacity-80"
                      style={{ backgroundColor: post.color + '20', color: post.color, borderLeft: `2px solid ${post.color}` }}
                      onClick={(e) => {
                        e.stopPropagation();
                        // TODO: open post detail modal
                      }}
                    >
                      <div className="flex items-center gap-1">
                        {post.platforms.slice(0, 2).map((p) => {
                          const Icon = PLATFORM_ICONS[p] || Hash;
                          return <Icon key={p} size={8} className={PLATFORM_COLORS[p]} />;
                        })}
                        <span className="truncate font-medium">{post.title}</span>
                      </div>
                    </div>
                  ))}
                  {dayPosts.length > 3 && (
                    <div className="text-[9px] text-pw-text-dim text-center">
                      +{dayPosts.length - 3} altri
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Posts summary below calendar */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
        {posts.filter((p) => p.status !== 'published').slice(0, 6).map((post) => {
          const client = post.client as Client | undefined;
          return (
            <Card key={post.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-medium text-pw-text line-clamp-1">{post.title}</h3>
                  <Badge className={STATUS_COLORS[post.status]}>{STATUS_LABELS[post.status]}</Badge>
                </div>
                <p className="text-xs text-pw-text-muted mb-2">{client?.company || client?.name || '—'}</p>
                <div className="flex items-center gap-2 mb-3">
                  {post.platforms.map((p) => {
                    const Icon = PLATFORM_ICONS[p] || Hash;
                    return <Icon key={p} size={14} className={PLATFORM_COLORS[p]} />;
                  })}
                </div>
                {post.scheduled_at && (
                  <p className="text-[10px] text-pw-text-dim">
                    {new Date(post.scheduled_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
                {/* Quick status buttons */}
                <div className="flex gap-1 mt-3">
                  {post.status === 'draft' && (
                    <button onClick={() => handleStatusChange(post.id, 'ready')} className="text-[10px] px-2 py-1 rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20">
                      Segna Pronto
                    </button>
                  )}
                  {post.status === 'ready' && (
                    <button onClick={() => handleStatusChange(post.id, 'published')} className="text-[10px] px-2 py-1 rounded-md bg-green-500/10 text-green-400 hover:bg-green-500/20">
                      Segna Pubblicato
                    </button>
                  )}
                  {metaConnected && (post.status === 'ready' || post.status === 'scheduled') && (
                    <button onClick={() => { setShowPublish(post); setPublishPage(''); setPublishPlatform(post.platforms.includes('instagram') ? 'instagram' : 'facebook'); }} className="text-[10px] px-2 py-1 rounded-md bg-pw-accent/10 text-pw-accent hover:bg-pw-accent/20 flex items-center gap-1">
                      <Send size={8} /> Pubblica su Meta
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Create post modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nuovo Post Social">
        <div className="space-y-4">
          <Input
            label="Titolo"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Es: Post Instagram - Lancio prodotto"
            required
          />
          <Select
            label="Cliente"
            value={form.client_id}
            onChange={(e) => setForm({ ...form, client_id: e.target.value })}
            placeholder="Seleziona cliente"
            options={clients.map((c) => ({ value: c.id, label: c.company || c.name }))}
            required
          />
          <div>
            <label className="block text-sm font-medium text-pw-text-muted mb-2">Piattaforme</label>
            <div className="flex flex-wrap gap-2">
              {PLATFORM_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => {
                    setForm((f) => ({
                      ...f,
                      platforms: f.platforms.includes(p.value)
                        ? f.platforms.filter((x) => x !== p.value)
                        : [...f.platforms, p.value],
                    }));
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ease-out border ${
                    form.platforms.includes(p.value)
                      ? 'border-pw-accent bg-pw-accent/10 text-pw-accent'
                      : 'border-pw-border bg-pw-surface-2 text-pw-text-muted hover:border-pw-accent/50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <Textarea
            label="Caption"
            value={form.caption}
            onChange={(e) => setForm({ ...form, caption: e.target.value })}
            placeholder="Testo del post..."
            rows={3}
          />
          <Input
            label="Hashtags"
            value={form.hashtags}
            onChange={(e) => setForm({ ...form, hashtags: e.target.value })}
            placeholder="#marketing #socialmedia"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Data programmazione"
              type="datetime-local"
              value={form.scheduled_at}
              onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
            />
            <Select
              label="Stato"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as SocialPostStatus })}
              options={Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            />
          </div>
          <Textarea
            label="Note interne"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Note per il team..."
            rows={2}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowForm(false)}>Annulla</Button>
            <Button onClick={handleCreate}>Crea Post</Button>
          </div>
        </div>
      </Modal>

      {/* Publish to Meta modal */}
      <Modal open={!!showPublish} onClose={() => setShowPublish(null)} title="Pubblica su Meta">
        {showPublish && (
          <div className="space-y-4">
            <p className="text-sm text-pw-text">
              Pubblica <strong>&ldquo;{showPublish.title}&rdquo;</strong> su Facebook o Instagram
            </p>

            <Select
              label="Pagina Meta"
              value={publishPage}
              onChange={(e) => setPublishPage(e.target.value)}
              options={metaPages.map((p) => ({
                value: p.id,
                label: `${p.page_name}${p.instagram_username ? ` (@${p.instagram_username})` : ''}`,
              }))}
              placeholder="Seleziona pagina..."
            />

            <div>
              <label className="block text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted mb-2">Piattaforma</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPublishPlatform('facebook')}
                  className={`px-4 py-2 rounded-xl text-xs font-medium border transition-all duration-200 ease-out ${publishPlatform === 'facebook' ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-pw-border text-pw-text-muted'}`}
                >
                  Facebook
                </button>
                <button
                  type="button"
                  onClick={() => setPublishPlatform('instagram')}
                  className={`px-4 py-2 rounded-xl text-xs font-medium border transition-all duration-200 ease-out ${publishPlatform === 'instagram' ? 'border-pink-500 bg-pink-500/10 text-pink-400' : 'border-pw-border text-pw-text-muted'}`}
                >
                  Instagram
                </button>
              </div>
            </div>

            {publishPlatform === 'instagram' && (
              <p className="text-[10px] text-orange-400 bg-orange-500/5 p-2 rounded-lg">
                Instagram richiede un&apos;immagine. Assicurati che il post abbia un URL immagine nelle media.
              </p>
            )}

            <div className="p-3 rounded-xl bg-pw-surface-2 text-sm text-pw-text-muted">
              <p className="font-medium text-pw-text mb-1">Anteprima:</p>
              <p className="whitespace-pre-wrap">{showPublish.caption || showPublish.title}</p>
              {showPublish.hashtags && <p className="mt-1 text-pw-accent">{showPublish.hashtags}</p>}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setShowPublish(null)}>Annulla</Button>
              <Button
                loading={publishingId === showPublish.id}
                disabled={!publishPage}
                onClick={async () => {
                  if (!showPublish || !publishPage) return;
                  setPublishingId(showPublish.id);
                  try {
                    const message = `${showPublish.caption || showPublish.title}${showPublish.hashtags ? '\n\n' + showPublish.hashtags : ''}`;
                    const res = await fetch('/api/meta/publish', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        page_id: publishPage,
                        platform: publishPlatform,
                        message,
                        media_url: showPublish.media_urls?.[0] || null,
                        social_post_id: showPublish.id,
                      }),
                    });
                    const data = await res.json();
                    if (res.ok) {
                      toast.success(`Post ${data.status === 'scheduled' ? 'programmato' : 'pubblicato'} su ${publishPlatform}!`);
                      setShowPublish(null);
                      fetchPosts();
                    } else {
                      toast.error(data.error || 'Errore nella pubblicazione');
                    }
                  } catch {
                    toast.error('Errore di connessione');
                  }
                  setPublishingId(null);
                }}
              >
                <Send size={14} />
                {publishPlatform === 'facebook' ? 'Pubblica su Facebook' : 'Pubblica su Instagram'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
