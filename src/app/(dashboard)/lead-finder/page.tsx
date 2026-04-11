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
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Record<string, unknown>[]>([]);
  const [prospects, setProspects] = useState<LeadProspect[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
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
    if (!searchCity && !searchSector) {
      toast.error('Inserisci almeno citta\' o settore');
      return;
    }
    setSearching(true);
    setSearchResults([]);

    try {
      const query = `${searchSector} ${searchCity}`.trim();
      const res = await fetch('/api/prospects/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, city: searchCity, sector: searchSector }),
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

  const handleSaveProspect = async (result: Record<string, unknown>) => {
    const { error } = await supabase.from('lead_prospects').upsert({
      business_name: result.business_name,
      address: result.address,
      city: result.city || searchCity,
      sector: searchSector,
      phone: result.phone,
      website: result.website,
      google_place_id: result.google_place_id || null,
      google_rating: result.google_rating,
      google_reviews_count: result.google_reviews_count,
      google_maps_url: result.google_maps_url,
      instagram_url: result.instagram_url || null,
      facebook_url: result.facebook_url || null,
      search_query: `${searchSector} ${searchCity}`,
      created_by: profile!.id,
    });

    if (!error) {
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
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <Input
                    label="Settore / Tipo attivita'"
                    value={searchSector}
                    onChange={(e) => setSearchSector(e.target.value)}
                    placeholder="Es: ristoranti, parrucchieri, palestre, dentisti..."
                  />
                </div>
                <div className="flex-1">
                  <Input
                    label="Citta'"
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
            </CardContent>
          </Card>

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-pw-text">{searchResults.length} risultati trovati</p>
                <Button size="sm" variant="secondary" onClick={handleSaveAll}>
                  Salva tutti e analizza
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 stagger-children">
                {searchResults.map((result, i) => (
                  <Card key={i} hover>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="text-sm font-semibold text-pw-text">{result.business_name as string}</h3>
                        {result.google_rating ? (
                          <div className="flex items-center gap-1 shrink-0">
                            <Star size={12} className="text-yellow-400 fill-yellow-400" />
                            <span className="text-xs text-pw-text">{String(result.google_rating)}</span>
                            <span className="text-[10px] text-pw-text-dim">({String(result.google_reviews_count)})</span>
                          </div>
                        ) : null}
                      </div>
                      <p className="text-[10px] text-pw-text-dim flex items-center gap-1 mb-2">
                        <MapPin size={9} />
                        {result.address as string}
                      </p>
                      <div className="flex items-center gap-3 text-[10px] text-pw-text-muted mb-3">
                        {result.website ? (
                          <a href={String(result.website)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-pw-accent hover:underline">
                            <Globe size={9} /> Sito web
                          </a>
                        ) : (
                          <span className="flex items-center gap-1 text-red-400"><XCircle size={9} /> No sito</span>
                        )}
                        {result.phone ? <span className="flex items-center gap-1"><Phone size={9} /> {String(result.phone)}</span> : null}
                      </div>
                      <Button size="sm" variant="outline" onClick={() => handleSaveProspect(result)} className="w-full">
                        Salva prospect
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
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

                        {/* Issues grouped by category */}
                        {prospect.analyzed_at && (() => {
                          const issueCategories = [
                            { key: 'website', label: 'Sito Web', icon: '🌐', issues: (notes?.website?.issues as string[]) || [] },
                            { key: 'social', label: 'Social Media', icon: '📱', issues: (notes?.social?.issues as string[]) || [] },
                            { key: 'advertising', label: 'Advertising', icon: '📢', issues: prospect.score_advertising < 20 ? ['Nessuna campagna pubblicitaria rilevata'] : [] },
                            { key: 'seo', label: 'SEO', icon: '🔍', issues: (notes?.seo?.issues as string[]) || [] },
                            { key: 'content', label: 'Contenuti', icon: '📝', issues: (notes?.content?.issues as string[]) || [] },
                          ].filter(cat => cat.issues.length > 0);

                          if (issueCategories.length === 0) return null;

                          return (
                            <div>
                              <p className="text-xs font-semibold text-pw-text mb-3 flex items-center gap-1.5">
                                <AlertTriangle size={12} className="text-orange-400" />
                                Problemi trovati ({issueCategories.reduce((sum, cat) => sum + cat.issues.length, 0)})
                              </p>
                              <div className="space-y-3">
                                {issueCategories.map((cat) => (
                                  <div key={cat.key} className="rounded-xl border border-pw-border/20 overflow-hidden">
                                    <div className="px-3 py-2 bg-pw-surface-2/50 flex items-center gap-2">
                                      <span className="text-sm">{cat.icon}</span>
                                      <span className="text-xs font-semibold text-pw-text">{cat.label}</span>
                                      <span className="text-[10px] text-pw-text-dim ml-auto">{cat.issues.length} {cat.issues.length === 1 ? 'problema' : 'problemi'}</span>
                                    </div>
                                    <div className="p-2 space-y-1">
                                      {cat.issues.map((issue, i) => (
                                        <div key={i} className="flex items-start gap-2 text-xs text-pw-text-muted px-2 py-1.5">
                                          <XCircle size={10} className="text-red-400 shrink-0 mt-0.5" />
                                          {issue}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
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
