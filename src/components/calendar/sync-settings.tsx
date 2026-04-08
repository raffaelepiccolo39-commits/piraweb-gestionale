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

interface CalendarOption {
  url: string;
  displayName: string;
}

export function SyncSettings({ onSync, syncing }: SyncSettingsProps) {
  const [config, setConfig] = useState<SyncConfig | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [form, setForm] = useState({ caldav_username: '', caldav_password: '', caldav_url: 'https://caldav.icloud.com' });
  const [saving, setSaving] = useState(false);
  const [calendars, setCalendars] = useState<CalendarOption[]>([]);
  const [selectedCalendar, setSelectedCalendar] = useState<string>('');
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [savingCalendar, setSavingCalendar] = useState(false);

  const refreshConfig = async () => {
    const r = await fetch('/api/calendar/config');
    const d = await r.json();
    if (d.config) {
      setConfig(d.config);
      if (d.config.calendar_path) {
        setSelectedCalendar(d.config.calendar_path);
      }
    }
  };

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
          if (d.config.calendar_path) {
            setSelectedCalendar(d.config.calendar_path);
          }
        }
      });
  }, []);

  const fetchCalendars = async () => {
    setLoadingCalendars(true);
    setCalendarError(null);
    try {
      const res = await fetch('/api/calendar/calendars');
      const data = await res.json();
      if (res.ok && data.calendars) {
        setCalendars(data.calendars);
        if (data.selected) {
          setSelectedCalendar(data.selected);
        }
      } else {
        setCalendarError(data.error || 'Impossibile recuperare i calendari');
      }
    } catch {
      setCalendarError('Errore di connessione');
    }
    setLoadingCalendars(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch('/api/calendar/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      await refreshConfig();
      // Fetch calendars after saving credentials
      await fetchCalendars();
    }
    setSaving(false);
  };

  const handleSelectCalendar = async (url: string) => {
    setSavingCalendar(true);
    setSelectedCalendar(url);
    try {
      const res = await fetch('/api/calendar/config/calendar-path', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendar_path: url }),
      });
      if (res.ok) {
        await refreshConfig();
      }
    } catch {
      // revert
      setSelectedCalendar(config?.calendar_path || '');
    }
    setSavingCalendar(false);
  };

  // Auto-load calendars when settings panel opens
  useEffect(() => {
    if (showSettings && config?.caldav_username && calendars.length === 0 && !loadingCalendars) {
      fetchCalendars();
    }
  }, [showSettings]);

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
            Genera una password specifica per app su appleid.apple.com &rarr; Sicurezza &rarr; Password specifiche per app
          </p>
          <Button onClick={handleSave} loading={saving} size="sm" className="w-full">
            Salva configurazione
          </Button>

          {/* Calendar selection */}
          {calendars.length > 0 && (
            <div className="pt-2 border-t border-pw-border space-y-2">
              <p className="text-xs font-semibold text-pw-text">Scegli calendario da sincronizzare</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {calendars.map((cal) => (
                  <button
                    key={cal.url}
                    onClick={() => handleSelectCalendar(cal.url)}
                    disabled={savingCalendar}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedCalendar === cal.url
                        ? 'bg-pw-accent/15 text-pw-accent font-medium'
                        : 'text-pw-text hover:bg-pw-surface-3'
                    }`}
                  >
                    {cal.displayName}
                    {selectedCalendar === cal.url && (
                      <CheckCircle2 size={14} className="inline ml-2" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loadingCalendars && (
            <p className="text-xs text-pw-text-dim flex items-center gap-2">
              <RefreshCw size={12} className="animate-spin" />
              Recupero calendari...
            </p>
          )}

          {calendarError && (
            <div className="space-y-2">
              <p className="text-xs text-red-400">{calendarError}</p>
              <Button onClick={fetchCalendars} size="sm" variant="outline" className="w-full">
                <RefreshCw size={14} />
                Riprova
              </Button>
            </div>
          )}

          {config?.caldav_username && calendars.length === 0 && !loadingCalendars && !calendarError && (
            <Button onClick={fetchCalendars} size="sm" variant="outline" className="w-full">
              Carica calendari disponibili
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
