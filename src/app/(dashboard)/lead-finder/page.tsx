'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import type { LeadProspect, OutreachStatus } from '@/types/database';
import {
  Search,
  MapPin,
  Globe,
  Phone,
  Star,
  ExternalLink,
  MessageCircle,
  Mail,
  Send,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Sparkles,
  Target,
  ArrowRight,
  Copy,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Eye,
  FileText,
} from 'lucide-react';

function ScoreDot({ score, label }: { score: number; label: string }) {
  const color = score >= 70 ? 'bg-green-500 shadow-green-500/40' :
                score >= 40 ? 'bg-yellow-500 shadow-yellow-500/40' :
                score > 0 ? 'bg-red-500 shadow-red-500/40' :
                'bg-gray-600';
  return (
    <div className="flex items-center gap-1.5" title={`${label}: ${score}/100`}>
      <div className={`w-2.5 h-2.5 rounded-full ${color} shadow-[0_0_6px]`} />
      <span className="text-[10px] text-pw-text-dim">{label}</span>
    </div>
  );
}

const OUTREACH_LABELS: Record<OutreachStatus, { label: string; color: string }> = {
  new: { label: 'Nuovo', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  to_contact: { label: 'Da contattare', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  contacted: { label: 'Contattato', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' },
  interested: { label: 'Interessato', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  not_interested: { label: 'Non interessato', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
  converted: { label: 'Convertito', color: 'bg-pw-accent/20 text-pw-accent' },
};

export default function LeadFinderPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();

  const [searchCity, setSearchCity] = useState('');
  const [searchSector, setSearchSector] = useState('');
  const [searchName, setSearchName] = useState('');
  const [searchMode, setSearchMode] = useState<'sector' | 'name' | 'manual'>('sector');
  // Manual entry fields
  const [manualName, setManualName] = useState('');
  const [manualWebsite, setManualWebsite] = useState('');
  const [manualInstagram, setManualInstagram] = useState('');
  const [manualFacebook, setManualFacebook] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualCity, setManualCity] = useState('');
  const [manualSector, setManualSector] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Record<string, unknown>[]>([]);
  const [prospects, setProspects] = useState<LeadProspect[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState<string | null>(null);
  const [tab, setTab] = useState<'search' | 'saved'>('search');

  const fetchProspects = useCallback(async () => {
    const { data } = await supabase
      .from('lead_prospects')
      .select('*')
      .order('created_at', { ascending: false });
    setProspects((data as LeadProspect[]) || []);
  }, [supabase]);

  useEffect(() => {
    fetchProspects().finally(() => setLoading(false));
  }, [fetchProspects]);

  const handleSearch = async () => {
    if (searchMode === 'sector' && !searchCity && !searchSector) {
      toast.error('Inserisci almeno citta\' o settore');
      return;
    }
    if (searchMode === 'name' && !searchName) {
      toast.error('Inserisci il nome dell\'attivita\'');
      return;
    }
    setSearching(true);
    setSearchResults([]);

    try {
      const query = searchMode === 'name'
        ? `${searchName} ${searchCity}`.trim()
        : `${searchSector} ${searchCity}`.trim();
      const res = await fetch('/api/prospects/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, city: searchCity, sector: searchMode === 'name' ? searchName : searchSector }),
      });
      const data = await res.json();
      if (res.ok) {
        setSearchResults(data.results || []);
        toast.success(`Trovati ${data.count} risultati`);
      } else {
        toast.error(data.error || 'Errore nella ricerca');
      }
    } catch {
      toast.error('Errore di connessione');
    }
    setSearching(false);
  };

  const handleManualAnalysis = async () => {
    if (!manualName) {
      toast.error('Inserisci almeno il nome dell\'attivita\'');
      return;
    }
    setSearching(true);
    setSearchResults([]);

    try {
      const res = await fetch('/api/prospects/analyze-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: manualName,
          website: manualWebsite || null,
          instagram_url: manualInstagram || null,
          facebook_url: manualFacebook || null,
          phone: manualPhone || null,
          city: manualCity || null,
          sector: manualSector || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSearchResults([data.result]);
        toast.success('Analisi completata');
      } else {
        toast.error(data.error || 'Errore nell\'analisi');
      }
    } catch {
      toast.error('Errore di connessione');
    }
    setSearching(false);
  };

  const handleSaveProspect = async (result: Record<string, unknown>) => {
    // Check if already saved (by place_id or name+city)
    const placeId = result.google_place_id as string | null;
    if (placeId) {
      const { data: existing } = await supabase
        .from('lead_prospects')
        .select('id')
        .eq('google_place_id', placeId)
        .maybeSingle();
      if (existing) {
        toast.error(`${result.business_name} gia' salvato`);
        return;
      }
    }

    const { error } = await supabase.from('lead_prospects').insert({
      business_name: result.business_name,
      address: result.address,
      city: result.city || searchCity,
      sector: searchSector,
      phone: result.phone || null,
      website: result.website || null,
      google_place_id: placeId,
      google_rating: result.google_rating || null,
      google_reviews_count: result.google_reviews_count || null,
      google_maps_url: result.google_maps_url || null,
      instagram_url: result.instagram_url || null,
      facebook_url: result.facebook_url || null,
      search_query: `${searchSector} ${searchCity}`,
      created_by: profile!.id,
    });

    if (error) {
      toast.error(`Errore nel salvataggio: ${error.message}`);
    } else {
      toast.success(`${result.business_name} salvato`);
      fetchProspects();
    }
  };

  const handleSaveAll = async () => {
    for (const result of searchResults) {
      await handleSaveProspect(result);
    }
    toast.success(`${searchResults.length} prospect salvati`);
    setTab('saved');
  };

  const handleAnalyze = async (prospectId: string) => {
    setAnalyzingId(prospectId);
    try {
      const res = await fetch('/api/prospects/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_id: prospectId }),
      });
      if (res.ok) {
        toast.success('Analisi completata');
        fetchProspects();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Errore nell\'analisi');
      }
    } catch {
      toast.error('Errore di connessione');
    }
    setAnalyzingId(null);
  };

  const handleGenerateReport = async (prospectId: string) => {
    setGeneratingReport(prospectId);
    try {
      const res = await fetch('/api/prospects/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_id: prospectId }),
      });
      const data = await res.json();
      if (res.ok) {
        setReportId(prospectId);
        setReportContent(data.report);
        toast.success('Report generato');
      } else {
        toast.error(data.error || 'Errore nella generazione');
      }
    } catch {
      toast.error('Errore di connessione');
    }
    setGeneratingReport(null);
  };

  const handleGenerateOutreach = async (prospectId: string, channel: string) => {
    setGeneratingId(prospectId);
    try {
      const res = await fetch('/api/prospects/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_id: prospectId, channel }),
      });
      if (res.ok) {
        toast.success('Messaggio generato');
        fetchProspects();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Errore nella generazione');
      }
    } catch {
      toast.error('Errore di connessione');
    }
    setGeneratingId(null);
  };

  const handleStatusChange = async (prospectId: string, status: OutreachStatus) => {
    await supabase.from('lead_prospects').update({ outreach_status: status }).eq('id', prospectId);
    fetchProspects();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiato negli appunti!');
  };

  const lowScoreProspects = prospects.filter((p) => p.score_total > 0 && p.score_total < 50);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-pw-text flex items-center gap-2">
          <Target size={24} className="text-pw-accent" />
          Lead Finder
        </h1>
        <p className="text-sm text-pw-text-muted mt-1">
          Cerca attivita' per citta' e settore, analizza la loro presenza digitale, genera messaggi di outreach
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab('search')} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === 'search' ? 'bg-pw-accent text-pw-bg' : 'bg-pw-surface-2 text-pw-text-muted hover:text-pw-text'}`}>
          <Search size={14} className="inline mr-1.5" />Cerca
        </button>
        <button onClick={() => setTab('saved')} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === 'saved' ? 'bg-pw-accent text-pw-bg' : 'bg-pw-surface-2 text-pw-text-muted hover:text-pw-text'}`}>
          <Eye size={14} className="inline mr-1.5" />Salvati ({prospects.length})
        </button>
      </div>

      {tab === 'search' && (
        <>
          {/* Search bar */}
          <Card>
            <CardContent className="p-4 space-y-3">
              {/* Search mode toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setSearchMode('sector')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${searchMode === 'sector' ? 'bg-pw-accent text-pw-bg' : 'bg-pw-surface-2 text-pw-text-muted hover:text-pw-text'}`}
                >
                  Per settore + citta'
                </button>
                <button
                  onClick={() => setSearchMode('name')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${searchMode === 'name' ? 'bg-pw-accent text-pw-bg' : 'bg-pw-surface-2 text-pw-text-muted hover:text-pw-text'}`}
                >
                  Per nome attivita'
                </button>
                <button
                  onClick={() => setSearchMode('manual')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${searchMode === 'manual' ? 'bg-pw-accent text-pw-bg' : 'bg-pw-surface-2 text-pw-text-muted hover:text-pw-text'}`}
                >
                  Analisi manuale
                </button>
              </div>

              {/* Sector / Name search */}
              {searchMode !== 'manual' && (
                <div className="flex flex-col sm:flex-row gap-3">
                  {searchMode === 'sector' ? (
                    <div className="flex-1">
                      <Input
                        label="Settore / Tipo attivita'"
                        value={searchSector}
                        onChange={(e) => setSearchSector(e.target.value)}
                        placeholder="Es: ristoranti, parrucchieri, palestre, dentisti..."
                      />
                    </div>
                  ) : (
                    <div className="flex-1">
                      <Input
                        label="Nome attivita'"
                        value={searchName}
                        onChange={(e) => setSearchName(e.target.value)}
                        placeholder="Es: Pizzeria Da Mario, Salone Bella Vita..."
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <Input
                      label="Citta' (opzionale)"
                      value={searchCity}
                      onChange={(e) => setSearchCity(e.target.value)}
                      placeholder="Es: Roma, Milano, Napoli..."
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleSearch} loading={searching} className="w-full sm:w-auto">
                      <Search size={16} />
                      Cerca
                    </Button>
                  </div>
                </div>
              )}

              {/* Manual entry */}
              {searchMode === 'manual' && (
                <div className="space-y-3">
                  <p className="text-xs text-pw-text-dim">
                    Inserisci i dati che conosci dell'attivita'. Il sistema analizzera' sito web, profili social e advertising.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input label="Nome attivita' *" value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Es: Pizzeria Da Mario" />
                    <Input label="Citta'" value={manualCity} onChange={(e) => setManualCity(e.target.value)} placeholder="Es: Casapesenna" />
                  </div>
                  <Input label="Sito web" value={manualWebsite} onChange={(e) => setManualWebsite(e.target.value)} placeholder="https://www.esempio.it" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input label="Profilo Instagram" value={manualInstagram} onChange={(e) => setManualInstagram(e.target.value)} placeholder="https://instagram.com/nomeprofilo" />
                    <Input label="Pagina Facebook" value={manualFacebook} onChange={(e) => setManualFacebook(e.target.value)} placeholder="https://facebook.com/nomepagina" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input label="Telefono" value={manualPhone} onChange={(e) => setManualPhone(e.target.value)} placeholder="+39 081..." />
                    <Input label="Settore" value={manualSector} onChange={(e) => setManualSector(e.target.value)} placeholder="Es: ristorazione, parrucchiere..." />
                  </div>
                  <Button onClick={handleManualAnalysis} loading={searching} className="w-full">
                    <Search size={16} />
                    Analizza Attivita'
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Search results with analysis */}
          {searching && (
            <div className="text-center py-12">
              <Loader2 size={32} className="text-pw-accent mx-auto mb-3 animate-spin" />
              <p className="text-sm text-pw-text-muted">Ricerca e analisi in corso...</p>
              <p className="text-xs text-pw-text-dim mt-1">Sto cercando le attivita' e analizzando siti web, social e advertising</p>
            </div>
          )}

          {!searching && searchResults.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-pw-text">{searchResults.length} risultati analizzati</p>
                <Button size="sm" variant="secondary" onClick={handleSaveAll}>
                  Salva tutti
                </Button>
              </div>

              {searchResults.map((r, i) => {
                const scoreTotal = r.score_total as number;
                const scoreW = r.score_website as number;
                const scoreS = r.score_social as number;
                const scoreA = r.score_advertising as number;
                const scoreE = r.score_seo as number;
                const wIssues = (r.website_issues as string[]) || [];
                const sIssues = (r.social_issues as string[]) || [];
                const aIssues = (r.adv_issues as string[]) || [];
                const totalIssues = wIssues.length + sIssues.length + aIssues.length;
                const verdict = scoreTotal >= 60 ? 'Ben gestito' : scoreTotal >= 35 ? 'Da migliorare' : 'Opportunita\' alta';
                const verdictColor = scoreTotal >= 60 ? 'text-green-400' : scoreTotal >= 35 ? 'text-yellow-400' : 'text-red-400';
                const verdictBg = scoreTotal >= 60 ? 'bg-green-500/10 border-green-500/20' : scoreTotal >= 35 ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-red-500/10 border-red-500/20';

                const ScoreBar = ({ score, label }: { score: number; label: string }) => (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-pw-text-dim w-10 shrink-0">{label}</span>
                    <div className="flex-1 h-1.5 bg-pw-surface rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${score >= 60 ? 'bg-green-500' : score >= 30 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${score}%` }} />
                    </div>
                    <span className={`text-[10px] font-bold w-6 text-right ${score >= 60 ? 'text-green-400' : score >= 30 ? 'text-yellow-400' : 'text-red-400'}`}>{score}</span>
                  </div>
                );

                return (
                  <Card key={i}>
                    <CardContent className="p-4">
                      {/* Header */}
                      <div className="flex items-start gap-3 mb-3">
                        {/* Score circle */}
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 border-2 ${verdictBg}`}>
                          <span className={`text-sm font-bold ${verdictColor}`}>{scoreTotal}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-pw-text truncate">{r.business_name as string}</h3>
                            {r.google_rating ? (
                              <div className="flex items-center gap-0.5 shrink-0">
                                <Star size={10} className="text-yellow-400 fill-yellow-400" />
                                <span className="text-[10px] text-pw-text">{String(r.google_rating)}</span>
                              </div>
                            ) : null}
                          </div>
                          <p className="text-[10px] text-pw-text-dim">{r.address as string}</p>
                          {/* Quick links */}
                          <div className="flex items-center gap-2 mt-1">
                            {r.website ? (
                              <a href={String(r.website)} target="_blank" rel="noopener noreferrer" className="text-[10px] text-pw-accent hover:underline flex items-center gap-0.5">
                                <Globe size={9} /> Sito web
                              </a>
                            ) : (
                              <span className="text-[10px] text-red-400 flex items-center gap-0.5"><XCircle size={9} /> No sito</span>
                            )}
                            {r.google_maps_url ? (
                              <a href={String(r.google_maps_url)} target="_blank" rel="noopener noreferrer" className="text-[10px] text-pw-accent hover:underline flex items-center gap-0.5">
                                <MapPin size={9} /> Google Maps
                              </a>
                            ) : null}
                            {r.phone ? (
                              <a href={`tel:${String(r.phone)}`} className="text-[10px] text-pw-text-muted hover:text-pw-text flex items-center gap-0.5">
                                <Phone size={9} /> {String(r.phone)}
                              </a>
                            ) : null}
                          </div>
                          <p className={`text-[10px] font-semibold mt-0.5 ${verdictColor}`}>{verdict} — {totalIssues} problemi trovati</p>
                        </div>
                      </div>

                      {/* Score bars */}
                      <div className="space-y-1.5 mb-3">
                        <ScoreBar score={scoreW} label="Sito" />
                        <ScoreBar score={scoreS} label="Social" />
                        <ScoreBar score={scoreA} label="ADV" />
                        <ScoreBar score={scoreE} label="SEO" />
                      </div>

                      {/* Instagram verdict */}
                      {r.instagram_verdict ? (
                        <div className={`text-[10px] mb-2 px-2 py-1.5 rounded ${r.instagram_is_curated === false ? 'text-orange-400 bg-orange-500/5' : r.instagram_is_curated === true ? 'text-green-400 bg-green-500/5' : 'text-pw-text-dim bg-pw-surface-2/50'}`}>
                          <span className="font-semibold">Instagram:</span> {String(r.instagram_verdict)}
                          {r.instagram_posts_last_month != null && Number(r.instagram_posts_last_month) < 10 ? (
                            <span className="block mt-0.5 text-red-400">
                              Solo {String(r.instagram_posts_last_month)} post nell&apos;ultimo mese (servono almeno 10 tra foto, grafiche e reel)
                            </span>
                          ) : null}
                        </div>
                      ) : null}

                      {/* Quick checks */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-3 text-[10px]">
                        <div className={`flex items-center gap-1 px-2 py-1 rounded ${r.has_website ? 'text-green-400' : 'text-red-400'}`}>
                          {r.has_website ? <CheckCircle size={9} /> : <XCircle size={9} />} Sito web
                        </div>
                        <div className={`flex items-center gap-1 px-2 py-1 rounded ${r.has_ssl ? 'text-green-400' : 'text-red-400'}`}>
                          {r.has_ssl ? <CheckCircle size={9} /> : <XCircle size={9} />} HTTPS
                        </div>
                        <div className={`flex items-center gap-1 px-2 py-1 rounded ${r.has_mobile ? 'text-green-400' : 'text-red-400'}`}>
                          {r.has_mobile ? <CheckCircle size={9} /> : <XCircle size={9} />} Mobile
                        </div>
                        <div className={`flex items-center gap-1 px-2 py-1 rounded ${r.has_analytics ? 'text-green-400' : 'text-red-400'}`}>
                          {r.has_analytics ? <CheckCircle size={9} /> : <XCircle size={9} />} Analytics
                        </div>
                      </div>

                      {/* Social detection */}
                      <div className="flex flex-wrap gap-1.5 mb-3 text-[10px]">
                        {/* Instagram with details */}
                        {r.instagram_url ? (
                          <a href={String(r.instagram_url)} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-1 px-2 py-0.5 rounded hover:underline ${r.instagram_is_curated === false ? 'text-orange-400 bg-orange-500/10' : 'text-green-400 bg-green-500/10'}`}>
                            {r.instagram_is_curated === false ? <AlertTriangle size={8} /> : <CheckCircle size={8} />}
                            IG {r.instagram_posts_last_month != null
                              ? `(${r.instagram_posts_last_month} post/mese${r.instagram_posts ? `, ${r.instagram_posts} totali` : ''}${r.instagram_followers ? `, ${r.instagram_followers} foll.` : ''})`
                              : r.instagram_posts != null
                              ? `(${r.instagram_posts} post${r.instagram_followers ? `, ${r.instagram_followers} foll.` : ''})`
                              : ''}
                          </a>
                        ) : (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-red-400 bg-red-500/10">
                            <XCircle size={8} /> IG
                          </span>
                        )}
                        {/* Facebook */}
                        {r.facebook_url ? (
                          <a href={String(r.facebook_url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2 py-0.5 rounded text-green-400 bg-green-500/10 hover:underline">
                            <CheckCircle size={8} /> FB
                          </a>
                        ) : (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-red-400 bg-red-500/10">
                            <XCircle size={8} /> FB
                          </span>
                        )}
                        {/* TikTok */}
                        {r.tiktok_url ? (
                          <a href={String(r.tiktok_url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2 py-0.5 rounded text-green-400 bg-green-500/10 hover:underline">
                            <CheckCircle size={8} /> TK
                          </a>
                        ) : (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-red-400 bg-red-500/10">
                            <XCircle size={8} /> TK
                          </span>
                        )}
                        {/* ADV checks */}
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded ${r.has_facebook_pixel ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'}`}>
                          {r.has_facebook_pixel ? <CheckCircle size={8} /> : <XCircle size={8} />} FB Pixel
                        </span>
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded ${r.has_google_ads ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'}`}>
                          {r.has_google_ads ? <CheckCircle size={8} /> : <XCircle size={8} />} Google Ads
                        </span>
                        {r.has_meta_ads ? (
                          <a href={String(r.meta_ads_url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2 py-0.5 rounded text-green-400 bg-green-500/10 hover:underline">
                            <CheckCircle size={8} /> Meta Ads ({String(r.meta_ads_count)})
                          </a>
                        ) : (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-red-400 bg-red-500/10">
                            <XCircle size={8} /> No Meta Ads
                          </span>
                        )}
                      </div>

                      {/* Contact + actions */}
                      <div className="flex items-center justify-between pt-2 border-t border-pw-border/20">
                        <div className="flex items-center gap-3 text-[10px] text-pw-text-muted">
                          {r.website ? (
                            <a href={String(r.website)} target="_blank" rel="noopener noreferrer" className="text-pw-accent hover:underline flex items-center gap-1">
                              <Globe size={9} /> Sito
                            </a>
                          ) : null}
                          {r.phone ? <span className="flex items-center gap-1"><Phone size={9} /> {String(r.phone)}</span> : null}
                          {r.google_maps_url ? (
                            <a href={String(r.google_maps_url)} target="_blank" rel="noopener noreferrer" className="hover:text-pw-text flex items-center gap-1">
                              <MapPin size={9} /> Maps
                            </a>
                          ) : null}
                        </div>
                        <Button size="sm" variant="outline" onClick={() => handleSaveProspect(r)}>
                          Salva
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === 'saved' && (
        <>
          {/* Alert for low-score prospects */}
          {lowScoreProspects.length > 0 && (
            <div className="p-4 rounded-2xl bg-pw-accent/5 border border-pw-accent/20 flex items-start gap-3">
              <Sparkles size={20} className="text-pw-accent shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-pw-accent">
                  {lowScoreProspects.length} attivita' con presenza digitale debole
                </p>
                <p className="text-xs text-pw-text-muted mt-1">
                  Queste attivita' hanno bisogno di aiuto con il digitale. Genera un messaggio di outreach per proporti!
                </p>
              </div>
            </div>
          )}

          {/* Saved prospects */}
          <div className="space-y-2">
            {prospects.map((prospect) => {
              const isExpanded = expandedId === prospect.id;
              const notes = prospect.analysis_notes as Record<string, Record<string, unknown>>;
              const allIssues = [
                ...((notes?.website?.issues as string[]) || []),
                ...((notes?.social?.issues as string[]) || []),
                ...((notes?.seo?.issues as string[]) || []),
                ...((notes?.content?.issues as string[]) || []),
                ...(prospect.score_advertising < 20 && prospect.analyzed_at ? ['Nessuna campagna pubblicitaria rilevata'] : []),
              ];
              const outreach = OUTREACH_LABELS[prospect.outreach_status];

              return (
                <Card key={prospect.id}>
                  <CardContent className="p-0">
                    {/* Summary row */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : prospect.id)}
                      className="w-full text-left p-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors"
                    >
                      {/* Score circle */}
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 border-2 ${
                        prospect.score_total >= 70 ? 'border-green-500/50 bg-green-500/10' :
                        prospect.score_total >= 40 ? 'border-yellow-500/50 bg-yellow-500/10' :
                        prospect.score_total > 0 ? 'border-red-500/50 bg-red-500/10' :
                        'border-pw-border bg-pw-surface-2'
                      }`}>
                        <span className={`text-sm font-bold ${
                          prospect.score_total >= 70 ? 'text-green-400' :
                          prospect.score_total >= 40 ? 'text-yellow-400' :
                          prospect.score_total > 0 ? 'text-red-400' :
                          'text-pw-text-dim'
                        }`}>
                          {prospect.analyzed_at ? prospect.score_total : '?'}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-pw-text truncate">{prospect.business_name}</h3>
                          <Badge className={outreach.color}>{outreach.label}</Badge>
                        </div>
                        <p className="text-[10px] text-pw-text-dim mt-0.5">
                          {prospect.city}{prospect.sector ? ` · ${prospect.sector}` : ''}
                        </p>
                        {/* Score dots */}
                        {prospect.analyzed_at && (
                          <div className="flex gap-3 mt-1.5">
                            <ScoreDot score={prospect.score_website} label="Sito" />
                            <ScoreDot score={prospect.score_social} label="Social" />
                            <ScoreDot score={prospect.score_content} label="Contenuti" />
                            <ScoreDot score={prospect.score_advertising} label="ADV" />
                            <ScoreDot score={prospect.score_seo} label="SEO" />
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {!prospect.analyzed_at && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => { e.stopPropagation(); handleAnalyze(prospect.id); }}
                            loading={analyzingId === prospect.id}
                          >
                            <RefreshCw size={12} />
                            Analizza
                          </Button>
                        )}
                        {prospect.google_rating && (
                          <div className="flex items-center gap-1 text-xs">
                            <Star size={11} className="text-yellow-400 fill-yellow-400" />
                            <span className="text-pw-text">{prospect.google_rating}</span>
                          </div>
                        )}
                        {isExpanded ? <ChevronUp size={16} className="text-pw-text-dim" /> : <ChevronDown size={16} className="text-pw-text-dim" />}
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-pw-border/30 pt-4 space-y-5 animate-slide-up">
                        {/* Contact info */}
                        <div className="flex flex-wrap gap-3 text-xs text-pw-text-muted">
                          {prospect.website && (
                            <a href={prospect.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-pw-accent hover:underline">
                              <Globe size={11} /> {prospect.website.replace(/https?:\/\/(www\.)?/, '').split('/')[0]}
                            </a>
                          )}
                          {prospect.phone && (
                            <a href={`tel:${prospect.phone}`} className="flex items-center gap-1 hover:text-pw-text">
                              <Phone size={11} /> {prospect.phone}
                            </a>
                          )}
                          {prospect.google_maps_url && (
                            <a href={prospect.google_maps_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-pw-text">
                              <MapPin size={11} /> Google Maps
                            </a>
                          )}
                        </div>

                        {/* Analysis scores as visual bars */}
                        {prospect.analyzed_at && (
                          <div>
                            <p className="text-xs font-semibold text-pw-text mb-3 flex items-center gap-1.5">
                              <Target size={12} className="text-pw-accent" />
                              Analisi Presenza Digitale
                            </p>
                            <div className="space-y-2.5">
                              {([
                                { label: 'Sito Web', icon: '🌐', score: prospect.score_website },
                                { label: 'Social Media', icon: '📱', score: prospect.score_social },
                                { label: 'Advertising', icon: '📢', score: prospect.score_advertising },
                                { label: 'SEO', icon: '🔍', score: prospect.score_seo },
                                { label: 'Contenuti', icon: '📝', score: prospect.score_content },
                              ] as const).map((area) => {
                                const barColor = area.score >= 61 ? 'bg-green-500' : area.score >= 31 ? 'bg-yellow-500' : 'bg-red-500';
                                const textColor = area.score >= 61 ? 'text-green-400' : area.score >= 31 ? 'text-yellow-400' : 'text-red-400';
                                const scoreLabel = area.score >= 71 ? 'Ottimo' : area.score >= 51 ? 'Discreto' : area.score >= 31 ? 'Da migliorare' : area.score > 0 ? 'Critico' : 'Assente';
                                return (
                                  <div key={area.label} className="flex items-center gap-3">
                                    <span className="text-sm w-5 text-center shrink-0">{area.icon}</span>
                                    <span className="text-xs text-pw-text-muted w-24 shrink-0">{area.label}</span>
                                    <div className="flex-1 h-2.5 bg-pw-surface-2 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${barColor} transition-all duration-500`}
                                        style={{ width: `${area.score}%` }}
                                      />
                                    </div>
                                    <span className={`text-xs font-bold w-8 text-right shrink-0 ${textColor}`}>{area.score}</span>
                                    <span className="text-[10px] text-pw-text-dim w-24 shrink-0">{scoreLabel}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Social media detection */}
                        {prospect.analyzed_at && (
                          <div>
                            <p className="text-xs font-semibold text-pw-text mb-2 flex items-center gap-1.5">
                              📱 Social Media Rilevati
                            </p>
                            <div className="flex flex-wrap gap-3">
                              {([
                                { name: 'Instagram', url: prospect.instagram_url },
                                { name: 'Facebook', url: prospect.facebook_url },
                                { name: 'TikTok', url: prospect.tiktok_url },
                              ] as const).map((platform) => (
                                <div key={platform.name} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs ${platform.url ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                  {platform.url ? <CheckCircle size={12} /> : <XCircle size={12} />}
                                  {platform.url ? (
                                    <a href={platform.url} target="_blank" rel="noopener noreferrer" className="hover:underline font-medium">
                                      {platform.name}
                                    </a>
                                  ) : (
                                    <span>{platform.name}</span>
                                  )}
                                  {platform.url ? (
                                    <a href={platform.url} target="_blank" rel="noopener noreferrer" className="ml-0.5">
                                      <ExternalLink size={10} />
                                    </a>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Report dettagliato per categoria */}
                        {prospect.analyzed_at && (() => {
                          // Issues can be AnalysisIssue objects { area, detail, severity } or strings
                          const extractIssues = (data: unknown): string[] => {
                            if (!Array.isArray(data)) return [];
                            return data.map((item: unknown) => {
                              if (typeof item === 'string') return item;
                              if (item && typeof item === 'object' && 'detail' in item) return (item as { detail: string }).detail;
                              return String(item);
                            });
                          };

                          const websiteAnalysis = notes?.website as Record<string, unknown> | undefined;
                          const socialAnalysis = notes?.social as Record<string, unknown> | undefined;
                          const seoAnalysis = notes?.seo as Record<string, unknown> | undefined;
                          const contentAnalysis = notes?.content as Record<string, unknown> | undefined;

                          const issueCategories = [
                            { key: 'website', label: 'Sito Web', icon: '🌐', score: prospect.score_website, issues: extractIssues(websiteAnalysis?.issues), details: websiteAnalysis },
                            { key: 'social', label: 'Social Media', icon: '📱', score: prospect.score_social, issues: extractIssues(socialAnalysis?.issues), details: socialAnalysis },
                            { key: 'advertising', label: 'Advertising', icon: '📢', score: prospect.score_advertising, issues: prospect.score_advertising < 20 ? ['Nessuna campagna pubblicitaria online rilevata (Facebook Ads, Google Ads, TikTok Ads)'] : [], details: null },
                            { key: 'seo', label: 'SEO / Google', icon: '🔍', score: prospect.score_seo, issues: extractIssues(seoAnalysis?.issues), details: seoAnalysis },
                            { key: 'content', label: 'Contenuti', icon: '📝', score: prospect.score_content, issues: extractIssues(contentAnalysis?.issues), details: contentAnalysis },
                          ];

                          const totalIssues = issueCategories.reduce((sum, cat) => sum + cat.issues.length, 0);

                          return (
                            <div className="space-y-4">
                              {/* Report header */}
                              <div className="p-4 rounded-xl bg-pw-surface-2/80 border border-pw-border/30">
                                <div className="flex items-center justify-between mb-3">
                                  <p className="text-sm font-bold text-pw-text flex items-center gap-2">
                                    <AlertTriangle size={14} className="text-orange-400" />
                                    Report Analisi Digitale
                                  </p>
                                  <span className={`text-lg font-bold ${prospect.score_total >= 60 ? 'text-green-400' : prospect.score_total >= 35 ? 'text-yellow-400' : 'text-red-400'}`}>
                                    {prospect.score_total}/100
                                  </span>
                                </div>
                                <p className="text-xs text-pw-text-muted">
                                  {totalIssues} {totalIssues === 1 ? 'problema trovato' : 'problemi trovati'} —
                                  {prospect.score_total < 35
                                    ? ' Presenza digitale molto debole. Cliente ideale per proporre i nostri servizi.'
                                    : prospect.score_total < 60
                                    ? ' Presenza digitale da migliorare. Ci sono buone opportunita\' di vendita.'
                                    : ' Presenza digitale discreta. Possiamo proporre ottimizzazioni mirate.'}
                                </p>
                              </div>

                              {/* Detailed sections per category */}
                              {issueCategories.map((cat) => {
                                const barColor = cat.score >= 61 ? 'bg-green-500' : cat.score >= 31 ? 'bg-yellow-500' : 'bg-red-500';
                                const textColor = cat.score >= 61 ? 'text-green-400' : cat.score >= 31 ? 'text-yellow-400' : 'text-red-400';
                                const verdict = cat.score >= 71 ? 'Buono' : cat.score >= 51 ? 'Discreto' : cat.score >= 31 ? 'Da migliorare' : cat.score > 0 ? 'Critico' : 'Assente';

                                return (
                                  <div key={cat.key} className="rounded-xl border border-pw-border/20 overflow-hidden">
                                    {/* Category header with score */}
                                    <div className="px-4 py-3 bg-pw-surface-2/50 flex items-center gap-3">
                                      <span className="text-base">{cat.icon}</span>
                                      <span className="text-xs font-bold text-pw-text flex-1">{cat.label}</span>
                                      <div className="w-24 h-2 bg-pw-surface rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${cat.score}%` }} />
                                      </div>
                                      <span className={`text-xs font-bold w-8 text-right ${textColor}`}>{cat.score}</span>
                                      <span className={`text-[10px] font-medium ${textColor}`}>{verdict}</span>
                                    </div>

                                    {/* Website specific details */}
                                    {cat.key === 'website' && cat.details && (
                                      <div className="px-4 py-3 border-b border-pw-border/10">
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                                          {[
                                            { label: 'HTTPS/SSL', ok: cat.details.ssl },
                                            { label: 'Mobile', ok: cat.details.mobile_responsive },
                                            { label: 'Analytics', ok: cat.details.has_analytics },
                                            { label: 'Form contatto', ok: cat.details.has_contact_form },
                                            { label: 'Cookie/GDPR', ok: cat.details.has_cookie_banner },
                                            { label: 'SEO Tags', ok: cat.details.has_og_tags },
                                            { label: 'Schema.org', ok: cat.details.has_structured_data },
                                            { label: 'Design moderno', ok: !cat.details.looks_outdated },
                                          ].map((check) => (
                                            <div key={check.label} className={`flex items-center gap-1.5 px-2 py-1 rounded ${check.ok ? 'text-green-400' : 'text-red-400'}`}>
                                              {check.ok ? <CheckCircle size={9} /> : <XCircle size={9} />}
                                              {check.label}
                                            </div>
                                          ))}
                                        </div>
                                        {cat.details.response_time_ms ? (
                                          <p className="text-[10px] text-pw-text-dim mt-2">
                                            Tempo di risposta: {String(cat.details.response_time_ms)}ms
                                            {Number(cat.details.response_time_ms) > 3000 ? ' (lento!)' : Number(cat.details.response_time_ms) > 1500 ? ' (migliorabile)' : ' (buono)'}
                                          </p>
                                        ) : null}
                                      </div>
                                    )}

                                    {/* Social specific details */}
                                    {cat.key === 'social' && cat.details && (
                                      <div className="px-4 py-3 border-b border-pw-border/10">
                                        <div className="flex flex-wrap gap-2 text-[10px]">
                                          {['Instagram', 'Facebook', 'TikTok', 'LinkedIn', 'YouTube'].map((platform) => {
                                            const urls = (cat.details as Record<string, unknown>)?.detected_urls as Record<string, string | null> | undefined;
                                            const url = urls?.[platform.toLowerCase()] || null;
                                            const found = ((cat.details as Record<string, unknown>)?.platforms_found as string[] || []).includes(platform.toLowerCase());
                                            return (
                                              <div key={platform} className={`flex items-center gap-1 px-2 py-1 rounded ${found ? 'text-green-400 bg-green-500/5' : 'text-red-400 bg-red-500/5'}`}>
                                                {found ? <CheckCircle size={9} /> : <XCircle size={9} />}
                                                {url ? (
                                                  <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">{platform}</a>
                                                ) : platform}
                                              </div>
                                            );
                                          })}
                                        </div>
                                        {(cat.details as Record<string, unknown>)?.instagram_meta ? (
                                          <div className="mt-2 text-[10px] text-pw-text-dim">
                                            Instagram: {String(((cat.details as Record<string, unknown>)?.instagram_meta as Record<string, string | null>)?.followers || '?')} follower, {String(((cat.details as Record<string, unknown>)?.instagram_meta as Record<string, string | null>)?.posts || '?')} post
                                          </div>
                                        ) : null}
                                      </div>
                                    )}

                                    {/* Issues */}
                                    {cat.issues.length > 0 && (
                                      <div className="p-3 space-y-1.5">
                                        {cat.issues.map((issue, i) => (
                                          <div key={i} className="flex items-start gap-2 text-xs text-pw-text-muted px-1 py-1">
                                            <XCircle size={10} className="text-red-400 shrink-0 mt-0.5" />
                                            <span>{issue}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {cat.issues.length === 0 && cat.score > 0 && (
                                      <div className="px-4 py-2">
                                        <p className="text-[10px] text-green-400 flex items-center gap-1">
                                          <CheckCircle size={9} /> Nessun problema critico trovato
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}

                        {/* Opportunita' di vendita */}
                        {prospect.analyzed_at && (() => {
                          const opportunities = [
                            ...(prospect.score_social < 40 ? [{ service: 'Gestione Social Media', icon: '📱' }] : []),
                            ...(prospect.score_website < 40 ? [{ service: 'Sviluppo/Restyling Sito Web', icon: '🌐' }] : []),
                            ...(prospect.score_advertising === 0 ? [{ service: 'Campagne Advertising', icon: '📢' }] : []),
                            ...(prospect.score_content < 40 ? [{ service: 'Content Marketing', icon: '📝' }] : []),
                            ...(prospect.score_seo < 40 ? [{ service: 'Ottimizzazione SEO', icon: '🔍' }] : []),
                          ];

                          if (opportunities.length === 0) return null;

                          return (
                            <div className="p-4 rounded-xl bg-pw-accent/5 border border-pw-accent/20">
                              <p className="text-xs font-semibold text-pw-accent mb-3 flex items-center gap-1.5">
                                <Sparkles size={12} />
                                Opportunita&apos; di vendita ({opportunities.length} {opportunities.length === 1 ? 'servizio' : 'servizi'})
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {opportunities.map((opp) => (
                                  <div key={opp.service} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pw-accent/10 text-xs font-medium text-pw-accent">
                                    <span>{opp.icon}</span>
                                    <ArrowRight size={10} />
                                    {opp.service}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Re-analyze */}
                        {prospect.analyzed_at && (
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="ghost" onClick={() => handleAnalyze(prospect.id)} loading={analyzingId === prospect.id}>
                              <RefreshCw size={12} /> Ri-analizza
                            </Button>
                            <span className="text-[10px] text-pw-text-dim">
                              Analizzato {formatDate(prospect.analyzed_at)}
                            </span>
                          </div>
                        )}

                        {/* Marketing Report */}
                        {prospect.analyzed_at && (
                          <div className="border-t border-pw-border/30 pt-4">
                            <p className="text-xs font-semibold text-pw-text mb-3 flex items-center gap-1.5">
                              <FileText size={12} className="text-pw-accent" />
                              Report Marketing
                            </p>

                            {reportId === prospect.id && reportContent ? (
                              <div className="space-y-3">
                                <div className="p-4 rounded-xl bg-pw-surface-2 prose prose-invert prose-sm max-w-none max-h-[500px] overflow-y-auto text-sm text-pw-text-muted leading-relaxed whitespace-pre-wrap">
                                  {reportContent}
                                </div>
                                <div className="flex gap-2">
                                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(reportContent); toast.success('Report copiato!'); }}>
                                    <Copy size={12} /> Copia Report
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => handleGenerateReport(prospect.id)} loading={generatingReport === prospect.id}>
                                    <RefreshCw size={12} /> Rigenera
                                  </Button>
                                </div>
                              </div>
                            ) : prospect.outreach_notes && prospect.outreach_notes.includes('# Audit') ? (
                              <div className="space-y-3">
                                <div className="p-4 rounded-xl bg-pw-surface-2 max-h-[500px] overflow-y-auto text-sm text-pw-text-muted leading-relaxed whitespace-pre-wrap">
                                  {prospect.outreach_notes}
                                </div>
                                <div className="flex gap-2">
                                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(prospect.outreach_notes!); toast.success('Report copiato!'); }}>
                                    <Copy size={12} /> Copia Report
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => handleGenerateReport(prospect.id)} loading={generatingReport === prospect.id}>
                                    <RefreshCw size={12} /> Rigenera
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => handleGenerateReport(prospect.id)}
                                loading={generatingReport === prospect.id}
                              >
                                <FileText size={12} />
                                Genera Report Dettagliato
                              </Button>
                            )}
                          </div>
                        )}

                        {/* Generate outreach */}
                        <div className="border-t border-pw-border/30 pt-4">
                          <p className="text-xs font-semibold text-pw-text mb-3 flex items-center gap-1.5">
                            <Send size={12} className="text-pw-accent" />
                            Outreach
                          </p>

                          {!prospect.outreach_message ? (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleGenerateOutreach(prospect.id, 'whatsapp')}
                                loading={generatingId === prospect.id}
                              >
                                <MessageCircle size={12} />
                                Genera per WhatsApp
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleGenerateOutreach(prospect.id, 'email')}
                                loading={generatingId === prospect.id}
                              >
                                <Mail size={12} />
                                Genera per Email
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="p-4 rounded-xl bg-pw-surface-2 text-sm text-pw-text whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                                {prospect.outreach_message}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant="outline" onClick={() => copyToClipboard(prospect.outreach_message!)}>
                                  <Copy size={12} /> Copia messaggio
                                </Button>
                                {prospect.phone && (
                                  <a
                                    href={`https://wa.me/${prospect.phone.replace(/\D/g, '')}?text=${encodeURIComponent(prospect.outreach_message!)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <Button size="sm">
                                      <MessageCircle size={12} /> Apri WhatsApp
                                    </Button>
                                  </a>
                                )}
                                <Button size="sm" variant="ghost" onClick={() => handleGenerateOutreach(prospect.id, prospect.outreach_channel || 'whatsapp')} loading={generatingId === prospect.id}>
                                  <RefreshCw size={12} /> Rigenera
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Status change */}
                        <div className="border-t border-pw-border/30 pt-3">
                          <p className="text-[10px] text-pw-text-dim mb-2">Cambia stato:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {(Object.entries(OUTREACH_LABELS) as [OutreachStatus, { label: string }][]).map(([status, cfg]) => (
                              <button
                                key={status}
                                onClick={() => handleStatusChange(prospect.id, status)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${
                                  prospect.outreach_status === status
                                    ? 'bg-pw-accent text-pw-bg'
                                    : 'bg-pw-surface-2 text-pw-text-muted hover:text-pw-text'
                                }`}
                              >
                                {cfg.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {prospects.length === 0 && (
              <div className="text-center py-12">
                <Search size={48} className="text-pw-text-dim mx-auto mb-3" />
                <p className="text-pw-text-muted">Nessun prospect salvato</p>
                <p className="text-xs text-pw-text-dim mt-1">Cerca attivita' nella tab "Cerca" per iniziare</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
