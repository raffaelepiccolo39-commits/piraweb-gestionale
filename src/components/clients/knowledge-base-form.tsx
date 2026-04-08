'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ClientKnowledgeBase } from '@/types/database';
import { Save, Brain } from 'lucide-react';

interface KnowledgeBaseFormProps {
  data: ClientKnowledgeBase | null;
  onSave: (data: Partial<ClientKnowledgeBase>) => Promise<void>;
}

const FIELDS: { key: keyof ClientKnowledgeBase; label: string; placeholder: string; rows: number }[] = [
  { key: 'strategy', label: 'Strategia', placeholder: 'Descrivi la strategia generale per questo cliente: posizionamento, approccio, piano di crescita...', rows: 4 },
  { key: 'objectives', label: 'Obiettivi', placeholder: 'Obiettivi da raggiungere: aumentare follower del 20%, generare 50 lead al mese, lanciare e-commerce entro giugno...', rows: 3 },
  { key: 'target_audience', label: 'Target Audience', placeholder: 'Pubblico target: età 25-45, professionisti, interessati a moda sostenibile, area Campania...', rows: 3 },
  { key: 'tone_of_voice', label: 'Tone of Voice', placeholder: 'Come comunica il brand: professionale ma amichevole, uso di emoji moderato, linguaggio inclusivo...', rows: 3 },
  { key: 'brand_guidelines', label: 'Brand Guidelines', placeholder: 'Colori brand, font, stile visivo, do & don\'t, valori del brand...', rows: 3 },
  { key: 'services', label: 'Servizi Attivi', placeholder: 'Gestione social (Instagram, Facebook, TikTok), brand identity, sito web, e-commerce, newsletter...', rows: 2 },
  { key: 'competitors', label: 'Competitor', placeholder: 'Competitor principali: Azienda X (forte su Instagram), Azienda Y (leader e-commerce)...', rows: 2 },
  { key: 'keywords', label: 'Parole Chiave', placeholder: 'Parole chiave importanti per SEO e contenuti: moda sostenibile, made in Italy, artigianato...', rows: 2 },
  { key: 'additional_notes', label: 'Note Aggiuntive', placeholder: 'Altre informazioni utili per l\'AI: preferenze del cliente, cose da evitare, eventi in programma...', rows: 3 },
];

export function KnowledgeBaseForm({ data, onSave }: KnowledgeBaseFormProps) {
  const [form, setForm] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    FIELDS.forEach((f) => {
      initial[f.key] = (data?.[f.key] as string) || '';
    });
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    await onSave(form as Partial<ClientKnowledgeBase>);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const hasChanges = FIELDS.some((f) => form[f.key] !== ((data?.[f.key] as string) || ''));
  const hasContent = FIELDS.some((f) => form[f.key]?.trim());

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-xl bg-pw-accent/10 text-pw-accent text-sm flex items-start gap-2">
        <Brain size={18} className="shrink-0 mt-0.5" />
        <p>
          Queste informazioni vengono iniettate automaticamente in ogni richiesta AI per questo cliente.
          Più dettagli inserisci, più i contenuti generati saranno precisi e coerenti con il brand.
        </p>
      </div>

      {FIELDS.map((field) => (
        <div key={field.key}>
          <label className="block text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted mb-1.5">
            {field.label}
          </label>
          <textarea
            value={form[field.key] || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
            placeholder={field.placeholder}
            rows={field.rows}
            className="w-full px-4 py-2.5 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text placeholder:text-pw-text-dim focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none transition-all text-sm resize-y"
          />
        </div>
      ))}

      <div className="flex items-center gap-3 pt-2">
        <Button onClick={handleSave} loading={saving} disabled={!hasChanges && !(!data && hasContent)}>
          <Save size={14} />
          {data ? 'Aggiorna Knowledge Base' : 'Salva Knowledge Base'}
        </Button>
        {saved && (
          <span className="text-sm text-green-400 font-medium">Salvato!</span>
        )}
      </div>
    </div>
  );
}
