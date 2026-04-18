'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import {
  Sparkles,
  Search,
  Globe,
  Phone,
  MapPin,
  Star,
  ExternalLink,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Target,
  TrendingUp,
  Users,
  Loader2,
  ChevronDown,
  ChevronUp,
  Copy,
  Send,
  ArrowRight,
} from 'lucide-react';

const REGIONI = [
  'Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Emilia-Romagna', 'Friuli-Venezia Giulia',
  'Lazio', 'Liguria', 'Lombardia', 'Marche', 'Molise', 'Piemonte', 'Puglia',
  'Sardegna', 'Sicilia', 'Toscana', 'Trentino-Alto Adige', 'Umbria', "Valle d'Aosta", 'Veneto',
];

const SETTORI = [
  'Ristoranti e Pizzerie', 'Bar e Caffetterie', 'Parrucchieri e Barbieri', 'Centri Estetici e Spa',
  'Palestre e Centri Fitness', 'Dentisti e Studi Medici', 'Avvocati e Studi Legali',
  'Commercialisti', 'Agenzie Immobiliari', 'Hotel e B&B', 'Negozi di Abbigliamento',
  'Gioiellerie', 'Fioristi', 'Autofficine e Carrozzerie', 'Farmacie', 'Ottici',
  'Scuole e Corsi', 'Veterinari', 'Arredamento e Design', 'Edilizia e Ristrutturazioni',
];

interface Lead {
  name: string;
  address: string;
  rating: number | null;
  reviews: number | null;
  website: string | null;
  phone: string | null;
  mapsUrl: string | null;
  has_website: boolean;
  has_instagram: boolean;
  has_facebook: boolean;
  has_ads: boolean;
  has_analytics: boolean;
  has_ssl: boolean;
  has_mobile: boolean;
  social_count: number;
  score: number;
  issues: string[];
  priority: string;
  instagram_url?: string;
  facebook_url?: string;
}

interface SearchResult {
  sector: string;
  location: string;
  total: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
  stats: { noWebsite: number; noInstagram: number; noFacebook: number; noAds: number; noAnalytics: number };
  leads: Lead[];
  aiInsights: string;
}

export default function LeadAIPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();

  const [sector, setSector] = useState('');
  const [customSector, setCustomSector] = useState('');
  const [provincia, setProvincia] = useState('');
  const [regione, setRegione] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [savingLead, setSavingLead] = useState<string | null>(null);

  const handleSearch = async () => {
    const finalSector = sector === 'custom' ? customSector : sector;
    if (!finalSector) { toast.error('Seleziona un settore'); return; }
    if (!provincia && !regione) { toast.error('Inserisci almeno provincia o regione'); return; }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/prospects/ai-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sector: finalSector, provincia, regione }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data as SearchResult);
        toast.success(`Trovati ${data.total} lead - ${data.highPriority} ad alta priorita'`);
      } else {
        toast.error(data.error || 'Errore nella ricerca');
      }
    } catch {
      toast.error('Errore di connessione');
    }
    setLoading(false);
  };

  const handleSaveLead = async (lead: Lead) => {
    setSavingLead(lead.name);
    const { error } = await supabase.from('lead_prospects').insert({
      business_name: lead.name,
      address: lead.address,
      city: provincia || regione,
      sector: sector === 'custom' ? customSector : sector,
      phone: lead.phone,
      website: lead.website,
      google_maps_url: lead.mapsUrl,
      google_rating: lead.rating,
      google_reviews_count: lead.reviews,
      instagram_url: lead.instagram_url || null,
      facebook_url: lead.facebook_url || null,
      score_website: lead.has_website ? 50 : 0,
      score_social: lead.social_count > 0 ? 40 : 0,
      score_advertising: lead.has_ads ? 40 : 0,
      score_total: Math.max(0, 100 - lead.score * 15),
      search_query: `AI: ${sector} ${provincia} ${regione}`,
      created_by: profile!.id,
    });
    if (error) {
      toast.error(error.message.includes('duplicate') ? 'Gia\' salvato' : 'Errore nel salvataggio');
    } else {
      toast.success(`${lead.name} salvato nei prospect`);
    }
    setSavingLead(null);
  };

  const priorityConfig = {
    alta: { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', label: 'Alta Priorita\'' },
    media: { color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20', label: 'Media Priorita\'' },
    bassa: { color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20', label: 'Bassa Priorita\'' },
  };

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Sparkles size={40} className="mx-auto text-pw-text-dim mb-3" />
          <p className="text-pw-text font-semibold">Accesso non autorizzato</p>
          <p className="text-sm text-pw-text-muted mt-1">Solo gli amministratori possono accedere a questa sezione</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)] flex items-center gap-2">
          <Sparkles size={24} className="text-pw-accent" />
          Lead AI
        </h1>
        <p className="text-sm text-pw-text-muted mt-1">
          Ricerca intelligente di potenziali clienti per settore, provincia e regione
        </p>
      </div>

      {/* Search form */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Settore"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              options={[
                ...SETTORI.map((s) => ({ value: s, label: s })),
                { value: 'custom', label: 'Altro (inserisci manualmente)' },
              ]}
              placeholder="Seleziona settore..."
            />
            {sector === 'custom' && (
              <Input
                label="Settore personalizzato"
                value={customSector}
                onChange={(e) => setCustomSector(e.target.value)}
                placeholder="Es: Lavanderie, Ferramenta..."
              />
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Provincia"
              value={provincia}
              onChange={(e) => setProvincia(e.target.value)}
              placeholder="Es: Caserta, Napoli, Milano..."
            />
            <Select
              label="Regione"
              value={regione}
              onChange={(e) => setRegione(e.target.value)}
              options={REGIONI.map((r) => ({ value: r, label: r }))}
              placeholder="Seleziona regione..."
            />
          </div>
          <Button onClick={handleSearch} loading={loading} className="w-full sm:w-auto">
            <Sparkles size={16} />
            Avvia Ricerca AI
          </Button>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="text-center py-12">
          <Loader2 size={32} className="text-pw-accent mx-auto mb-3 animate-spin" />
          <p className="text-sm text-pw-text-muted">L&apos;AI sta cercando e analizzando le attivita&apos;...</p>
          <p className="text-xs text-pw-text-dim mt-1">Ricerca su Google Maps + analisi sito web + verifica social e advertising</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6 animate-slide-up">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 stagger-children">
            <Card>
              <CardContent className="p-3 text-center">
                <Users size={18} className="text-pw-accent mx-auto mb-1" />
                <p className="text-2xl font-bold text-pw-text font-[var(--font-bebas)]">{result.total}</p>
                <p className="text-[10px] text-pw-text-muted">Attivita' trovate</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <Target size={18} className="text-red-400 mx-auto mb-1" />
                <p className="text-2xl font-bold text-red-400 font-[var(--font-bebas)]">{result.highPriority}</p>
                <p className="text-[10px] text-pw-text-muted">Alta priorita'</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <AlertTriangle size={18} className="text-yellow-400 mx-auto mb-1" />
                <p className="text-2xl font-bold text-yellow-400 font-[var(--font-bebas)]">{result.mediumPriority}</p>
                <p className="text-[10px] text-pw-text-muted">Media priorita'</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <Globe size={18} className="text-blue-400 mx-auto mb-1" />
                <p className="text-2xl font-bold text-pw-text font-[var(--font-bebas)]">{result.stats.noWebsite}</p>
                <p className="text-[10px] text-pw-text-muted">Senza sito</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <TrendingUp size={18} className="text-green-400 mx-auto mb-1" />
                <p className="text-2xl font-bold text-green-400 font-[var(--font-bebas)]">{result.stats.noAds}</p>
                <p className="text-[10px] text-pw-text-muted">Senza ADV</p>
              </CardContent>
            </Card>
          </div>

          {/* AI Insights */}
          {result.aiInsights && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-pw-text flex items-center gap-2">
                    <Sparkles size={14} className="text-pw-accent" />
                    Analisi AI del Mercato
                  </h2>
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(result.aiInsights); toast.success('Copiato!'); }}>
                    <Copy size={12} /> Copia
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-pw-text-muted leading-relaxed whitespace-pre-wrap">{result.aiInsights}</div>
              </CardContent>
            </Card>
          )}

          {/* Lead list grouped by priority */}
          {(['alta', 'media', 'bassa'] as const).map((priority) => {
            const leads = result.leads.filter((l) => l.priority === priority);
            if (leads.length === 0) return null;
            const config = priorityConfig[priority];

            return (
              <div key={priority}>
                <p className={`text-sm font-bold ${config.color} flex items-center gap-2 mb-3`}>
                  {priority === 'alta' ? <Target size={14} /> : priority === 'media' ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
                  {config.label} ({leads.length})
                </p>
                <div className="space-y-2">
                  {leads.map((lead, i) => {
                    const isOpen = expandedLead === `${priority}-${i}`;
                    return (
                      <Card key={i}>
                        <CardContent className="p-0">
                          <button
                            onClick={() => setExpandedLead(isOpen ? null : `${priority}-${i}`)}
                            className="w-full text-left p-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors duration-200 ease-out"
                          >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${config.bg}`}>
                              <span className={`text-[10px] font-bold ${config.color}`}>{lead.score}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-semibold text-pw-text truncate">{lead.name}</h3>
                              <p className="text-[10px] text-pw-text-dim truncate">{lead.address}</p>
                            </div>
                            {/* Quick indicators */}
                            <div className="hidden sm:flex items-center gap-1 shrink-0">
                              <span className={`w-2 h-2 rounded-full ${lead.has_website ? 'bg-green-500' : 'bg-red-500'}`} title="Sito" />
                              <span className={`w-2 h-2 rounded-full ${lead.has_instagram ? 'bg-green-500' : 'bg-red-500'}`} title="Instagram" />
                              <span className={`w-2 h-2 rounded-full ${lead.has_facebook ? 'bg-green-500' : 'bg-red-500'}`} title="Facebook" />
                              <span className={`w-2 h-2 rounded-full ${lead.has_ads ? 'bg-green-500' : 'bg-red-500'}`} title="ADV" />
                            </div>
                            {lead.rating ? (
                              <div className="flex items-center gap-0.5 shrink-0">
                                <Star size={10} className="text-yellow-400 fill-yellow-400" />
                                <span className="text-[10px] text-pw-text">{lead.rating}</span>
                              </div>
                            ) : null}
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleSaveLead(lead); }} loading={savingLead === lead.name}>
                              Salva
                            </Button>
                            {isOpen ? <ChevronUp size={14} className="text-pw-text-dim" /> : <ChevronDown size={14} className="text-pw-text-dim" />}
                          </button>

                          {isOpen && (
                            <div className="px-3 pb-3 border-t border-pw-border/20 pt-3 space-y-3 animate-slide-up">
                              {/* Links */}
                              <div className="flex flex-wrap gap-3 text-[10px]">
                                {lead.website ? (
                                  <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-pw-accent hover:underline flex items-center gap-1">
                                    <Globe size={9} /> Sito <ExternalLink size={7} />
                                  </a>
                                ) : <span className="text-red-400 flex items-center gap-1"><XCircle size={9} /> No sito</span>}
                                {lead.mapsUrl ? (
                                  <a href={lead.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-pw-accent hover:underline flex items-center gap-1">
                                    <MapPin size={9} /> Maps <ExternalLink size={7} />
                                  </a>
                                ) : null}
                                {lead.phone ? (
                                  <a href={`tel:${lead.phone}`} className="text-pw-text-muted flex items-center gap-1"><Phone size={9} /> {lead.phone}</a>
                                ) : null}
                              </div>

                              {/* Checklist */}
                              <div className="flex flex-wrap gap-1.5 text-[10px]">
                                {[
                                  { label: 'Sito', ok: lead.has_website },
                                  { label: 'HTTPS', ok: lead.has_ssl },
                                  { label: 'Mobile', ok: lead.has_mobile },
                                  { label: 'IG', ok: lead.has_instagram },
                                  { label: 'FB', ok: lead.has_facebook },
                                  { label: 'Analytics', ok: lead.has_analytics },
                                  { label: 'ADV', ok: lead.has_ads },
                                ].map((c) => (
                                  <span key={c.label} className={`flex items-center gap-1 px-2 py-0.5 rounded ${c.ok ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'}`}>
                                    {c.ok ? <CheckCircle size={8} /> : <XCircle size={8} />} {c.label}
                                  </span>
                                ))}
                              </div>

                              {/* Issues */}
                              <div className="flex flex-wrap gap-1.5">
                                {lead.issues.map((issue, j) => (
                                  <span key={j} className="text-[10px] px-2 py-1 rounded bg-red-500/5 text-red-400 flex items-center gap-1">
                                    <XCircle size={8} /> {issue}
                                  </span>
                                ))}
                              </div>

                              {/* Suggested services */}
                              <div className="p-2 rounded-lg bg-pw-accent/5 border border-pw-accent/15">
                                <p className="text-[10px] font-semibold text-pw-accent mb-1 flex items-center gap-1">
                                  <ArrowRight size={8} /> Servizi da proporre:
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {!lead.has_website && <Badge className="text-[9px] bg-blue-500/10 text-blue-400">Sito Web</Badge>}
                                  {!lead.has_instagram && <Badge className="text-[9px] bg-pink-500/10 text-pink-400">Gestione Instagram</Badge>}
                                  {!lead.has_facebook && <Badge className="text-[9px] bg-blue-600/10 text-blue-300">Gestione Facebook</Badge>}
                                  {!lead.has_ads && <Badge className="text-[9px] bg-red-500/10 text-red-400">Campagne ADV</Badge>}
                                  {!lead.has_analytics && <Badge className="text-[9px] bg-yellow-500/10 text-yellow-400">Analytics/SEO</Badge>}
                                  {lead.has_website && !lead.has_mobile && <Badge className="text-[9px] bg-cyan-500/10 text-cyan-400">Restyling Mobile</Badge>}
                                </div>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
