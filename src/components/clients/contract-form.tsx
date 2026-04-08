'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Upload, X } from 'lucide-react';

export interface ContractFormData {
  no_contract: boolean;
  monthly_fee: number;
  duration_months: number;
  start_date: string;
  payment_timing: string;
  notes: string;
  attachment?: File;
}

interface ContractFormProps {
  onSubmit: (data: ContractFormData) => Promise<void>;
  onCancel: () => void;
}

const durationOptions = [
  { value: '6', label: '6 mesi' },
  { value: '12', label: '12 mesi' },
];

const paymentTimingOptions = [
  { value: 'inizio_mese', label: 'Inizio mese (anticipato)' },
  { value: 'fine_mese', label: 'Fine mese (posticipato)' },
];

export function ContractForm({ onSubmit, onCancel }: ContractFormProps) {
  const [noContract, setNoContract] = useState(false);
  const [form, setForm] = useState({
    monthly_fee: '',
    duration_months: '12',
    start_date: new Date().toISOString().split('T')[0],
    payment_timing: 'inizio_mese',
    notes: '',
  });
  const [attachment, setAttachment] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const totalValue = Number(form.monthly_fee || 0) * Number(form.duration_months);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setAttachment(file);
  };

  const handleSubmit = async () => {
    if (!noContract && (!form.monthly_fee || !form.start_date)) return;
    setLoading(true);
    try {
      await onSubmit({
        no_contract: noContract,
        monthly_fee: noContract ? 0 : Number(form.monthly_fee),
        duration_months: noContract ? 0 : Number(form.duration_months),
        start_date: noContract ? new Date().toISOString().split('T')[0] : form.start_date,
        payment_timing: noContract ? 'inizio_mese' : form.payment_timing,
        notes: noContract ? (form.notes || 'Cliente senza contratto scritto') : form.notes,
        attachment: attachment || undefined,
      });
    } catch (err) {
      console.error('Contract form error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toggle senza contratto */}
      <button
        type="button"
        onClick={() => setNoContract(!noContract)}
        className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-colors ${
          noContract
            ? 'border-amber-500 bg-amber-500/10'
            : 'border-pw-border bg-pw-surface-2 hover:border-pw-text-dim'
        }`}
      >
        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
          noContract ? 'border-amber-500 bg-amber-500' : 'border-pw-border'
        }`}>
          {noContract && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <div className="text-left">
          <p className={`text-sm font-medium ${noContract ? 'text-amber-400' : 'text-pw-text'}`}>
            Senza contratto
          </p>
          <p className="text-xs text-pw-text-muted">
            Per clienti storici senza un contratto scritto
          </p>
        </div>
      </button>

      {!noContract && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="monthly-fee" className="block text-sm font-medium text-pw-text-muted mb-1">
                Canone Mensile (EUR) *
              </label>
              <input
                id="monthly-fee"
                type="number"
                min="0"
                step="0.01"
                value={form.monthly_fee}
                onChange={(e) => setForm({ ...form, monthly_fee: e.target.value })}
                placeholder="es. 800"
                className="w-full px-4 py-2.5 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none text-sm"
              />
            </div>
            <Select
              id="duration"
              label="Durata Contratto *"
              value={form.duration_months}
              onChange={(e) => setForm({ ...form, duration_months: e.target.value })}
              options={durationOptions}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              id="start-date"
              label="Data Inizio Contratto *"
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
            <Select
              id="payment-timing"
              label="Modalità Pagamento *"
              value={form.payment_timing}
              onChange={(e) => setForm({ ...form, payment_timing: e.target.value })}
              options={paymentTimingOptions}
            />
          </div>

          {Number(form.monthly_fee) > 0 && (
            <div className="p-3 rounded-xl bg-indigo-500/10 text-pw-accent text-sm">
              <strong>Valore totale contratto:</strong>{' '}
              {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(totalValue)}{' '}
              ({form.duration_months} mesi — {form.payment_timing === 'inizio_mese' ? 'pagamento anticipato' : 'pagamento a fine mese'})
            </div>
          )}

          {/* File attachment */}
          <div>
            <label className="block text-sm font-medium text-pw-text-muted mb-1">
              Contratto Firmato (PDF/immagine)
            </label>
            {!attachment ? (
              <label
                htmlFor="contract-file"
                className="flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-pw-border cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors text-sm text-pw-text-muted"
              >
                <Upload size={18} />
                <span>Clicca per allegare il contratto firmato</span>
                <input
                  id="contract-file"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-pw-surface-2 border border-pw-border">
                <FileText size={18} className="text-indigo-500 shrink-0" />
                <span className="text-sm text-pw-text-muted flex-1 truncate">
                  {attachment.name}
                </span>
                <span className="text-xs text-gray-400 shrink-0">
                  {(attachment.size / 1024).toFixed(0)} KB
                </span>
                <button
                  onClick={() => setAttachment(null)}
                  className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400"
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <Textarea
        id="contract-notes"
        label="Note"
        value={form.notes}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
        placeholder={noContract ? "Note sul cliente (es. accordi verbali, storico collaborazione...)" : "Note aggiuntive sul contratto..."}
        rows={3}
      />

      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onCancel} className="flex-1">
          Annulla
        </Button>
        <Button
          onClick={handleSubmit}
          loading={loading}
          disabled={!noContract && (!form.monthly_fee || !form.start_date)}
          className="flex-1"
        >
          <FileText size={16} />
          {noContract ? 'Salva senza contratto' : 'Crea Contratto'}
        </Button>
      </div>
    </div>
  );
}
