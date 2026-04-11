'use client';

import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { ClientAsset, AssetType } from '@/types/database';
import {
  Palette,
  Image,
  FileText,
  Type,
  Video,
  Plus,
  Trash2,
  ExternalLink,
  Copy,
  FolderOpen,
} from 'lucide-react';

interface AssetLibraryProps {
  clientId: string;
}

const TYPE_ICONS: Record<AssetType, typeof Palette> = {
  logo: Image,
  color: Palette,
  font: Type,
  image: Image,
  template: FileText,
  guideline: FileText,
  video: Video,
  other: FolderOpen,
};

const TYPE_LABELS: Record<AssetType, string> = {
  logo: 'Logo',
  color: 'Colore',
  font: 'Font',
  image: 'Immagine',
  template: 'Template',
  guideline: 'Linea Guida',
  video: 'Video',
  other: 'Altro',
};

const TYPE_OPTIONS = Object.entries(TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }));

export function AssetLibrary({ clientId }: AssetLibraryProps) {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();

  const [assets, setAssets] = useState<ClientAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [filterType, setFilterType] = useState<string>('');
  const [form, setForm] = useState({
    name: '',
    description: '',
    type: 'other' as AssetType,
    file_url: '',
    metadata_hex: '', // for color type
    metadata_font: '', // for font type
    tags: '',
  });

  const fetchAssets = useCallback(async () => {
    let query = supabase
      .from('client_assets')
      .select('*')
      .eq('client_id', clientId)
      .order('type')
      .order('name');
    if (filterType) query = query.eq('type', filterType);
    const { data } = await query;
    setAssets((data as ClientAsset[]) || []);
  }, [supabase, clientId, filterType]);

  useEffect(() => {
    fetchAssets().finally(() => setLoading(false));
  }, [fetchAssets]);

  const handleAdd = async () => {
    if (!form.name) { toast.error('Nome obbligatorio'); return; }

    const metadata: Record<string, unknown> = {};
    if (form.type === 'color' && form.metadata_hex) metadata.hex = form.metadata_hex;
    if (form.type === 'font' && form.metadata_font) metadata.font_family = form.metadata_font;

    const { error } = await supabase.from('client_assets').insert({
      client_id: clientId,
      name: form.name,
      description: form.description || null,
      type: form.type,
      file_url: form.file_url || null,
      metadata,
      tags: form.tags ? form.tags.split(',').map((t) => t.trim()) : [],
      uploaded_by: profile!.id,
    });

    if (error) {
      toast.error('Errore nel salvataggio');
    } else {
      toast.success('Asset aggiunto');
      setShowAdd(false);
      setForm({ name: '', description: '', type: 'other', file_url: '', metadata_hex: '', metadata_font: '', tags: '' });
      fetchAssets();
    }
  };

  const handleDelete = async (assetId: string) => {
    await supabase.from('client_assets').delete().eq('id', assetId);
    fetchAssets();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiato!');
  };

  // Group by type
  const grouped = assets.reduce<Record<string, ClientAsset[]>>((acc, asset) => {
    acc[asset.type] = acc[asset.type] || [];
    acc[asset.type].push(asset);
    return acc;
  }, {});

  if (loading) {
    return <div className="py-8 text-center text-pw-text-dim text-sm">Caricamento asset...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-pw-text flex items-center gap-2">
            <FolderOpen size={16} className="text-pw-accent" />
            Asset Library
          </h3>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-2 py-1 rounded-lg border border-pw-border bg-pw-surface-2 text-pw-text text-[10px]"
          >
            <option value="">Tutti</option>
            {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <Badge className="bg-pw-surface-2 text-pw-text-muted">{assets.length}</Badge>
        </div>
        <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
          <Plus size={12} />
          Aggiungi
        </Button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="p-4 rounded-xl border border-pw-border bg-pw-surface space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Nome"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Es: Logo principale"
              required
            />
            <Select
              label="Tipo"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as AssetType })}
              options={TYPE_OPTIONS}
            />
          </div>
          <Input
            label="URL file / link"
            value={form.file_url}
            onChange={(e) => setForm({ ...form, file_url: e.target.value })}
            placeholder="https://drive.google.com/... o link Figma"
          />
          {form.type === 'color' && (
            <div className="flex items-center gap-3">
              <Input
                label="Codice HEX"
                value={form.metadata_hex}
                onChange={(e) => setForm({ ...form, metadata_hex: e.target.value })}
                placeholder="#FF5733"
              />
              {form.metadata_hex && (
                <div
                  className="w-10 h-10 rounded-lg border border-pw-border mt-5 shrink-0"
                  style={{ backgroundColor: form.metadata_hex }}
                />
              )}
            </div>
          )}
          {form.type === 'font' && (
            <Input
              label="Font Family"
              value={form.metadata_font}
              onChange={(e) => setForm({ ...form, metadata_font: e.target.value })}
              placeholder="Es: Inter, Montserrat"
            />
          )}
          <Input
            label="Tag (separati da virgola)"
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            placeholder="brand, social, header"
          />
          <Input
            label="Descrizione"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Note sull'asset..."
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd}>Salva</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Annulla</Button>
          </div>
        </div>
      )}

      {/* Assets grid grouped by type */}
      {Object.entries(grouped).map(([type, typeAssets]) => {
        const Icon = TYPE_ICONS[type as AssetType] || FolderOpen;
        return (
          <div key={type}>
            <p className="text-[10px] uppercase tracking-widest text-pw-text-dim font-medium mb-2 flex items-center gap-1">
              <Icon size={10} />
              {TYPE_LABELS[type as AssetType] || type} ({typeAssets.length})
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {typeAssets.map((asset) => (
                <div key={asset.id} className="flex items-center gap-3 p-3 rounded-xl bg-pw-surface-2 group">
                  {/* Color swatch for color type */}
                  {asset.type === 'color' && (asset.metadata as Record<string, string>).hex && (
                    <div
                      className="w-8 h-8 rounded-lg border border-pw-border shrink-0"
                      style={{ backgroundColor: (asset.metadata as Record<string, string>).hex }}
                    />
                  )}
                  {asset.type !== 'color' && (
                    <div className="w-8 h-8 rounded-lg bg-pw-surface-3 flex items-center justify-center shrink-0">
                      <Icon size={14} className="text-pw-text-dim" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-pw-text truncate">{asset.name}</p>
                    {asset.description && (
                      <p className="text-[10px] text-pw-text-dim truncate">{asset.description}</p>
                    )}
                    {asset.type === 'color' && (asset.metadata as Record<string, string>).hex && (
                      <button
                        onClick={() => copyToClipboard((asset.metadata as Record<string, string>).hex)}
                        className="text-[10px] text-pw-accent hover:underline flex items-center gap-1 mt-0.5"
                      >
                        <Copy size={8} />
                        {(asset.metadata as Record<string, string>).hex}
                      </button>
                    )}
                    {asset.type === 'font' && (asset.metadata as Record<string, string>).font_family && (
                      <p className="text-[10px] text-pw-text-dim" style={{ fontFamily: (asset.metadata as Record<string, string>).font_family }}>
                        {(asset.metadata as Record<string, string>).font_family}
                      </p>
                    )}
                    {asset.tags.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {asset.tags.map((tag) => (
                          <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-pw-surface-3 text-pw-text-dim">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {asset.file_url && (
                      <a
                        href={asset.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-pw-text-dim hover:text-pw-accent hover:bg-pw-surface-3"
                      >
                        <ExternalLink size={12} />
                      </a>
                    )}
                    <button
                      onClick={() => handleDelete(asset.id)}
                      className="p-1.5 rounded-lg text-pw-text-dim hover:text-red-400 hover:bg-pw-surface-3"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {assets.length === 0 && !showAdd && (
        <div className="text-center py-8">
          <FolderOpen size={32} className="text-pw-text-dim mx-auto mb-2" />
          <p className="text-sm text-pw-text-muted">Nessun asset ancora</p>
          <p className="text-xs text-pw-text-dim">Aggiungi loghi, colori, font e template</p>
        </div>
      )}
    </div>
  );
}
