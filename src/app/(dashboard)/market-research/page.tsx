'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  BarChart3,
  Search,
  Globe,
  Users,
  Star,
  TrendingUp,
  Target,
  CheckCircle,
  XCircle,
  Loader2,
  MapPin,
  ExternalLink,
  Copy,
} from 'lucide-react';

interface MarketStats {
  total: number;
  withWebsite: number; withWebsitePct: number;
  withSSL: number; withSSLPct: number;
  withMobile: number; withMobilePct: number;
  withSocial: number; withSocialPct: number;
  withInstagram: number; withInstagramPct: number;
  withFacebook: number; withFacebookPct: number;
  withAnalytics: number; withAnalyticsPct: number;
  withAds: number; withAdsPct: number;
  avgRating: number | null;
  avgReviews: number | null;
}

interface MarketBusiness {
  name: string;
  address: string;
  rating: number | null;
  reviews: number | null;
  website: string | null;
  mapsUrl: string | null;
  has_website: boolean;
  has_ssl: boolean;
  has_mobile: boolean;
  has_social: boolean;
  has_instagram: boolean;
  has_facebook: boolean;
  has_analytics: boolean;
  has_ads: boolean;
  social_count: number;
}

interface MarketData {
  sector: string;
  city: string;
  stats: MarketStats;
  businesses: MarketBusiness[];
  topRated: MarketBusiness[];
  noWebsite: MarketBusiness[];
  noSocial: MarketBusiness[];
  noAds: MarketBusiness[];
  aiInsights: string;
}

function StatBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = Math.round((value / total) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-pw-text-muted w-28 shrink-0">{label}</span>
      <div className="flex-1 h-3 bg-pw-surface-2 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-pw-text w-16 text-right">{value}/{total}</span>
      <span className={`text-xs font-bold w-10 text-right ${pct >= 60 ? 'text-green-400' : pct >= 30 ? 'text-yellow-400' : 'text-red-400'}`}>{pct}%</span>
    </div>
  );
}

export default function MarketResearchPage() {
  const { profile } = useAuth();
  const toast = useToast();

  const [sector, setSector] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MarketData | null>(null);

  const handleSearch = async () => {
    if (!sector || !city) { toast.error('Inserisci settore e citta\''); return; }
    setLoading(true);
    setData(null);
    try {
      const res = await fetch('/api/prospects/market-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sector, city }),
      });
      const result = await res.json();
      if (res.ok) {
        setData(result as MarketData);
        toast.success(`Analisi completata: ${result.stats.total} attivita\' analizzate`);
      } else {
        toast.error(result.error || 'Errore nell\'analisi');
      }
    } catch {
      toast.error('Errore di connessione');
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)] flex items-center gap-2">
          <BarChart3 size={24} className="text-pw-accent" />
          Indagine di Mercato
        </h1>
        <p className="text-sm text-pw-text-muted mt-1">
          Analizza un intero settore in una citta': quanti competitor ci sono, chi ha sito/social/ads, dove ci sono opportunita'
        </p>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input label="Settore" value={sector} onChange={(e) => setSector(e.target.value)} placeholder="Es: ristoranti, parrucchieri, dentisti, palestre..." />
            </div>
            <div className="flex-1">
              <Input label="Citta'" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Es: Casapesenna, Aversa, Napoli..." />
            </div>
            <div className="flex items-end">
              <Button onClick={handleSearch} loading={loading} className="w-full sm:w-auto">
                <Search size={16} />
                Analizza Mercato
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="text-center py-12">
          <Loader2 size={32} className="text-pw-accent mx-auto mb-3 animate-spin" />
          <p className="text-sm text-pw-text-muted">Analizzo il mercato "{sector}" a {city}...</p>
          <p className="text-xs text-pw-text-dim mt-1">Cerco attivita', analizzo siti web, social e advertising</p>
        </div>
      )}

      {/* Results */}
      {data && (
        <div className="space-y-6 animate-slide-up">
          {/* Overview KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 stagger-children">
            <Card>
              <CardContent className="p-4 text-center">
                <Users size={18} className="text-pw-accent mx-auto mb-1" />
                <p className="text-2xl font-bold text-pw-text font-[var(--font-bebas)]">{data.stats.total}</p>
                <p className="text-[10px] text-pw-text-muted">Attivita' trovate</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Globe size={18} className="text-blue-400 mx-auto mb-1" />
                <p className="text-2xl font-bold text-pw-text font-[var(--font-bebas)]">{data.stats.withWebsitePct}%</p>
                <p className="text-[10px] text-pw-text-muted">Ha un sito web</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Target size={18} className="text-purple-400 mx-auto mb-1" />
                <p className="text-2xl font-bold text-pw-text font-[var(--font-bebas)]">{data.stats.withSocialPct}%</p>
                <p className="text-[10px] text-pw-text-muted">Ha social media</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <TrendingUp size={18} className="text-orange-400 mx-auto mb-1" />
                <p className="text-2xl font-bold text-pw-text font-[var(--font-bebas)]">{data.stats.withAdsPct}%</p>
                <p className="text-[10px] text-pw-text-muted">Fa advertising</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Star size={18} className="text-yellow-400 mx-auto mb-1" />
                <p className="text-2xl font-bold text-pw-text font-[var(--font-bebas)]">{data.stats.avgRating || '—'}</p>
                <p className="text-[10px] text-pw-text-muted">Rating medio</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Digital Maturity Chart */}
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-pw-text flex items-center gap-2">
                  <BarChart3 size={14} className="text-pw-accent" />
                  Maturita' Digitale del Settore
                </h2>
              </CardHeader>
              <CardContent className="space-y-3">
                <StatBar label="Sito web" value={data.stats.withWebsite} total={data.stats.total} color="bg-blue-500" />
                <StatBar label="HTTPS/SSL" value={data.stats.withSSL} total={data.stats.total} color="bg-green-500" />
                <StatBar label="Mobile friendly" value={data.stats.withMobile} total={data.stats.total} color="bg-cyan-500" />
                <StatBar label="Instagram" value={data.stats.withInstagram} total={data.stats.total} color="bg-pink-500" />
                <StatBar label="Facebook" value={data.stats.withFacebook} total={data.stats.total} color="bg-blue-600" />
                <StatBar label="Google Analytics" value={data.stats.withAnalytics} total={data.stats.total} color="bg-yellow-500" />
                <StatBar label="Advertising" value={data.stats.withAds} total={data.stats.total} color="bg-red-500" />
              </CardContent>
            </Card>

            {/* Opportunities */}
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-pw-text flex items-center gap-2">
                  <Target size={14} className="text-pw-accent" />
                  Opportunita' per PiraWeb
                </h2>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* No website */}
                <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/15">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-red-400">Senza sito web</p>
                    <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">{data.noWebsite.length} attivita'</Badge>
                  </div>
                  <div className="space-y-0.5">
                    {data.noWebsite.slice(0, 5).map((b, i) => (
                      <p key={i} className="text-[10px] text-pw-text-dim flex items-center gap-1">
                        <XCircle size={8} className="text-red-400" /> {b.name}
                      </p>
                    ))}
                    {data.noWebsite.length > 5 && <p className="text-[10px] text-pw-text-dim">...e altri {data.noWebsite.length - 5}</p>}
                  </div>
                </div>

                {/* No social */}
                <div className="p-3 rounded-xl bg-orange-500/5 border border-orange-500/15">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-orange-400">Senza social media</p>
                    <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">{data.noSocial.length} attivita'</Badge>
                  </div>
                  <div className="space-y-0.5">
                    {data.noSocial.slice(0, 5).map((b, i) => (
                      <p key={i} className="text-[10px] text-pw-text-dim flex items-center gap-1">
                        <XCircle size={8} className="text-orange-400" /> {b.name}
                      </p>
                    ))}
                    {data.noSocial.length > 5 && <p className="text-[10px] text-pw-text-dim">...e altri {data.noSocial.length - 5}</p>}
                  </div>
                </div>

                {/* No ads */}
                <div className="p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/15">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-yellow-400">Senza advertising</p>
                    <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">{data.noAds.length} attivita'</Badge>
                  </div>
                  <div className="space-y-0.5">
                    {data.noAds.slice(0, 5).map((b, i) => (
                      <p key={i} className="text-[10px] text-pw-text-dim flex items-center gap-1">
                        <XCircle size={8} className="text-yellow-400" /> {b.name}
                      </p>
                    ))}
                    {data.noAds.length > 5 && <p className="text-[10px] text-pw-text-dim">...e altri {data.noAds.length - 5}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* All businesses table */}
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-pw-text">Tutte le attivita' analizzate ({data.stats.total})</h2>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-pw-border text-[10px] text-pw-text-dim">
                      <th className="text-left px-4 py-2">Attivita'</th>
                      <th className="text-center px-2 py-2">Rating</th>
                      <th className="text-center px-2 py-2">Sito</th>
                      <th className="text-center px-2 py-2">SSL</th>
                      <th className="text-center px-2 py-2">Mobile</th>
                      <th className="text-center px-2 py-2">IG</th>
                      <th className="text-center px-2 py-2">FB</th>
                      <th className="text-center px-2 py-2">Analytics</th>
                      <th className="text-center px-2 py-2">ADV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.businesses.map((biz, i) => (
                      <tr key={i} className="border-b border-pw-border/30 hover:bg-pw-surface-2/30">
                        <td className="px-4 py-2">
                          <p className="font-medium text-pw-text">{biz.name}</p>
                          <div className="flex gap-2 mt-0.5">
                            {biz.website ? (
                              <a href={biz.website} target="_blank" rel="noopener noreferrer" className="text-pw-accent hover:underline flex items-center gap-0.5">
                                <Globe size={8} /> Sito
                              </a>
                            ) : null}
                            {biz.mapsUrl ? (
                              <a href={biz.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-pw-text-dim hover:text-pw-text flex items-center gap-0.5">
                                <MapPin size={8} /> Maps
                              </a>
                            ) : null}
                          </div>
                        </td>
                        <td className="text-center px-2 py-2">
                          {biz.rating ? (
                            <span className="flex items-center justify-center gap-0.5">
                              <Star size={8} className="text-yellow-400 fill-yellow-400" />
                              {biz.rating}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="text-center px-2 py-2">{biz.has_website ? <CheckCircle size={12} className="text-green-400 mx-auto" /> : <XCircle size={12} className="text-red-400 mx-auto" />}</td>
                        <td className="text-center px-2 py-2">{biz.has_ssl ? <CheckCircle size={12} className="text-green-400 mx-auto" /> : <XCircle size={12} className="text-red-400 mx-auto" />}</td>
                        <td className="text-center px-2 py-2">{biz.has_mobile ? <CheckCircle size={12} className="text-green-400 mx-auto" /> : <XCircle size={12} className="text-red-400 mx-auto" />}</td>
                        <td className="text-center px-2 py-2">{biz.has_instagram ? <CheckCircle size={12} className="text-green-400 mx-auto" /> : <XCircle size={12} className="text-red-400 mx-auto" />}</td>
                        <td className="text-center px-2 py-2">{biz.has_facebook ? <CheckCircle size={12} className="text-green-400 mx-auto" /> : <XCircle size={12} className="text-red-400 mx-auto" />}</td>
                        <td className="text-center px-2 py-2">{biz.has_analytics ? <CheckCircle size={12} className="text-green-400 mx-auto" /> : <XCircle size={12} className="text-red-400 mx-auto" />}</td>
                        <td className="text-center px-2 py-2">{biz.has_ads ? <CheckCircle size={12} className="text-green-400 mx-auto" /> : <XCircle size={12} className="text-red-400 mx-auto" />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* AI Insights */}
          {data.aiInsights && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-pw-text flex items-center gap-2">
                    <TrendingUp size={14} className="text-pw-accent" />
                    Analisi e Raccomandazioni
                  </h2>
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(data.aiInsights); toast.success('Report copiato!'); }}>
                    <Copy size={12} /> Copia
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-pw-text-muted leading-relaxed whitespace-pre-wrap">
                  {data.aiInsights}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
