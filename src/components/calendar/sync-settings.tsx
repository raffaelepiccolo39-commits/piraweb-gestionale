'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';
import { RefreshCw, Settings2, CheckCircle2, AlertTriangle } from 'lucide-react';

interface SyncSettingsProps {
  onSync: () => Promise<void>;
  syncing: boolean;
}

interface SyncConfig {
  caldav_url: string;
  caldav_username: string | null;
  calendar_path: string | null;
  last_synced_at: string | null;
  sync_status: string;
  sync_error: string | null;
}

export function SyncSettings({ onSync, syncing }: SyncSettingsProps) {
  const [config, setConfig] = useState<SyncConfig | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [form, setForm] = useState({ caldav_username: '', caldav_password: '', caldav_url: 'https://caldav.icloud.com' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/calendar/config')
      .then((r) => r.json())
      .then((d) => {
        if (d.config) {
          setConfig(d.config);
          setForm((prev) => ({
            ...prev,
            caldav_username: d.config.caldav_username || '',
            caldav_url: d.config.caldav_url || 'https://caldav.icloud.com',
          }));
        }
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch('/api/calendar/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowSettings(false);
      // Refresh config
      const r = await fetch('/api/calendar/config');
      const d = await r.json();
      if (d.config) setConfig(d.config);
    }
    setSaving(false);
  };

  return (
    <div className="flex items-center gap-3">
      {config?.last_synced_at && (
        <span className="text-xs text-pw-text-dim">
          Ultimo sync: {formatDateTime(config.last_synced_at)}
        </span>
      )}
      {config?.sync_status === 'error' && (
        <Badge className="bg-red-500/15 text-red-400">
          <AlertTriangle size={12} className="mr-1" />
          Errore sync
        </Badge>
      )}
      {config?.sync_status === 'active' && config.last_synced_at && (
        <Badge className="bg-green-500/15 text-green-400">
          <CheckCircle2 size={12} className="mr-1" />
          Sincronizzato
        </Badge>
      )}

      <Button size="sm" variant="outline" onClick={onSync} loading={syncing} disabled={!config?.caldav_username}>
        <RefreshCw size={14} />
        Sincronizza
      </Button>

      <Button size="sm" variant="ghost" onClick={() => setShowSettings(!showSettings)}>
        <Settings2 size={14} />
      </Button>

      {showSettings && (
        <div className="absolute right-0 top-12 w-80 bg-pw-surface-2 rounded-xl shadow-2xl border border-pw-border z-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-pw-text">Configurazione iCloud CalDAV</p>
          <Input
            label="Apple ID (email)"
            value={form.caldav_username}
            onChange={(e) => setForm((p) => ({ ...p, caldav_username: e.target.value }))}
            placeholder="tuoemail@icloud.com"
          />
          <Input
            label="App-Specific Password"
            type="password"
            value={form.caldav_password}
            onChange={(e) => setForm((p) => ({ ...p, caldav_password: e.target.value }))}
            placeholder="xxxx-xxxx-xxxx-xxxx"
          />
          <p className="text-[10px] text-pw-text-dim">
            Genera una password specifica per app su appleid.apple.com → Sicurezza → Password specifiche per app
          </p>
          <Button onClick={handleSave} loading={saving} size="sm" className="w-full">
            Salva configurazione
          </Button>
        </div>
      )}
    </div>
  );
}
