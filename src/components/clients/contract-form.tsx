'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, FileText, Upload, X } from 'lucide-react';
import { formatDate, todayLocal } from '@/lib/utils';
import { reportUnknown } from '@/lib/report-error';

export interface ContractFormData {
  no_contract: boolean;
  monthly_fee: number;
  duration_months: number;
  start_date: string;
  payment_timing: string;
  /** Giorno preciso del mese, quando non e' ne' il primo ne' l'ultimo. */
  payment_day: number | null;
  /** 'mensile' (canone che si ripete) oppure 'progetto' (acconto + saldo). */
  tipo_contratto: string;
  importo_totale: number | null;
  acconto: number | null;
  data_saldo: string | null;
  notes: string;
  attachment?: File;
}

/** Il minimo che serve per accorgersi di una sovrapposizione. */
export interface ExistingContract {
  id: string;
  start_date: string;
  duration_months: number;
  status: string;
}

interface ContractFormProps {
  onSubmit: (data: ContractFormData) => Promise<void>;
  onCancel: () => void;
  /**
   * Contratti già presenti sul cliente. Se la data di inizio scelta cade dentro
   * il periodo di uno di questi, il form avvisa e chiede conferma: le rate non
   * incassate del vecchio contratto non spariscono da sole e finirebbero a
   * sommarsi a quelle nuove in Crediti e nel cashflow (caso Alma consulenti,
   * due rate al mese — una il 1°, una l'8).
   */
  existingContracts?: ExistingContract[];
}

/** Ultima scadenza coperta da un contratto: start + (durata - 1) mesi. */
function lastDueDate(startDate: string, durationMonths: number): Date | null {
  const parts = startDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN) || durationMonths < 1) return null;
  const [y, m, d] = parts;
  const target = new Date(y, m - 1 + (durationMonths - 1), 1);
  // Clamp al mese più corto (31 gen + 1 mese = 28/29 feb, non 3 marzo).
  const lastDayOfMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, lastDayOfMonth));
  return target;
}

const durationOptions = [
  { value: '6', label: '6 mesi' },
  { value: '12', label: '12 mesi' },
];

const paymentTimingOptions = [
  { value: 'inizio_mese', label: 'Inizio mese (il 1°)' },
  { value: 'fine_mese', label: 'Fine mese (l\'ultimo giorno)' },
  { value: 'giorno_fisso', label: 'Un giorno preciso del mese' },
];

export function ContractForm({ onSubmit, onCancel, existingContracts = [] }: ContractFormProps) {
  const [noContract, setNoContract] = useState(false);
  const [form, setForm] = useState({
    monthly_fee: '',
    duration_months: '12',
    start_date: todayLocal(),
    payment_timing: 'inizio_mese',
    payment_day: '',
    tipo_contratto: 'mensile',
    importo_totale: '',
    acconto: '',
    data_saldo: '',
    notes: '',
  });
  const [attachment, setAttachment] = useState<File | null>(null);
  const [overlapAck, setOverlapAck] = useState(false);
  const [loading, setLoading] = useState(false);

  const totalValue = Number(form.monthly_fee || 0) * Number(form.duration_months);

  // Contratti ancora "in corso" alla data scelta: le loro rate si sommerebbero
  // a quelle del nuovo contratto negli stessi mesi.
  const overlapping = useMemo(() => {
    if (noContract || !form.start_date) return [];
    const start = new Date(`${form.start_date}T00:00:00`);
    if (Number.isNaN(start.getTime())) return [];
    return existingContracts
      .filter((c) => c.status !== 'cancelled' && c.duration_months > 0)
      .map((c) => ({ contract: c, last: lastDueDate(c.start_date, c.duration_months) }))
      .filter((c): c is { contract: ExistingContract; last: Date } => c.last !== null && c.last >= start)
      .sort((a, b) => a.contract.start_date.localeCompare(b.contract.start_date));
  }, [existingContracts, form.start_date, noContract]);

  const blockedByOverlap = overlapping.length > 0 && !overlapAck;

  const setStartDate = (value: string) => {
    setForm({ ...form, start_date: value });
    setOverlapAck(false); // cambio data = avviso da riconfermare
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setAttachment(file);
  };

  const aProgetto = form.tipo_contratto === 'progetto';

  const handleSubmit = async () => {
    if (!noContract && !form.start_date) return;
    // Un progetto chiede il totale, un mensile il canone: non si controlla
    // il campo sbagliato, altrimenti il pulsante non risponde e sembra rotto.
    if (!noContract && (aProgetto ? !form.importo_totale : !form.monthly_fee)) return;
    if (blockedByOverlap) return;
    setLoading(true);
    try {
      await onSubmit({
        no_contract: noContract,
        tipo_contratto: noContract ? 'mensile' : form.tipo_contratto,
        // Su un progetto canone e durata non esistono: restano a zero, e i
        // soldi stanno in totale/acconto.
        monthly_fee: noContract || aProgetto ? 0 : Number(form.monthly_fee),
        duration_months: noContract || aProgetto ? 0 : Number(form.duration_months),
        importo_totale: !noContract && aProgetto ? Number(form.importo_totale) : null,
        acconto: !noContract && aProgetto && form.acconto ? Number(form.acconto) : null,
        data_saldo: !noContract && aProgetto && form.data_saldo ? form.data_saldo : null,
        start_date: noContract ? todayLocal() : form.start_date,
        payment_timing: noContract ? 'inizio_mese' : form.payment_timing,
        payment_day: noContract || !form.payment_day ? null : Number(form.payment_day),
        notes: noContract ? (form.notes || 'Cliente senza contratto scritto') : form.notes,
        attachment: attachment || undefined,
      });
    } catch (err) {
      reportUnknown(err, 'client', { op: 'contratto-submit' });
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
          {/* Prima domanda: si ripete ogni mese o si paga a lavoro finito?
              Da questa dipende tutto il resto del modulo. */}
          <Select
            id="tipo-contratto"
            label="Tipo di contratto *"
            value={form.tipo_contratto}
            onChange={(e) => setForm({ ...form, tipo_contratto: e.target.value })}
            options={[
              { value: 'mensile', label: 'Canone mensile (si ripete ogni mese)' },
              { value: 'progetto', label: 'A progetto (acconto + saldo)' },
            ]}
          />

          {aProgetto ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  id="importo-totale"
                  label="Importo totale (EUR) *"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.importo_totale}
                  onChange={(e) => setForm({ ...form, importo_totale: e.target.value })}
                  placeholder="es. 3000"
                />
                <Input
                  id="acconto"
                  label="Acconto (EUR)"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.acconto}
                  onChange={(e) => setForm({ ...form, acconto: e.target.value })}
                  placeholder="es. 1000"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  id="start-date-progetto"
                  label="Data acconto *"
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <Input
                  id="data-saldo"
                  label="Data saldo"
                  type="date"
                  value={form.data_saldo}
                  onChange={(e) => setForm({ ...form, data_saldo: e.target.value })}
                />
              </div>

              <p className="text-[11px] text-pw-text-dim">
                {Number(form.acconto) > 0
                  ? `Verranno create due scadenze: ${Number(form.acconto).toLocaleString('it-IT')}€ di acconto e ${(Number(form.importo_totale || 0) - Number(form.acconto)).toLocaleString('it-IT')}€ di saldo.`
                  : 'Senza acconto viene creata una sola scadenza col totale. Se la data del saldo manca, si usa un mese dopo l\'acconto.'}
              </p>
            </>
          ) : (
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
              onChange={(e) => setStartDate(e.target.value)}
            />
            <Select
              id="payment-timing"
              label="Modalità Pagamento *"
              value={form.payment_day ? 'giorno_fisso' : form.payment_timing}
              onChange={(e) => {
                // "Giorno preciso" non e' un valore che il database conosce:
                // e' il modo di dire "guarda payment_day invece del resto".
                if (e.target.value === 'giorno_fisso') {
                  setForm({ ...form, payment_day: form.payment_day || '15' });
                } else {
                  setForm({ ...form, payment_timing: e.target.value, payment_day: '' });
                }
              }}
              options={paymentTimingOptions}
            />
          </div>

          {form.payment_day && (
            <Input
              id="payment-day"
              label="Giorno del mese"
              type="number"
              min="1"
              max="31"
              value={form.payment_day}
              onChange={(e) => setForm({ ...form, payment_day: e.target.value })}
            />
          )}
          {form.payment_day && (
            <p className="-mt-2 text-[11px] text-pw-text-dim">
              Nei mesi più corti la scadenza scala all&apos;ultimo giorno disponibile: il 31 a febbraio diventa il 28.
            </p>
          )}
          </>
          )}

          {overlapping.length > 0 && (
            <div role="alert" className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm space-y-2">
              <p className="flex items-start gap-2 font-medium text-pw-warning">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                {overlapping.length === 1
                  ? 'Questo cliente ha già un contratto che copre questo periodo'
                  : `Questo cliente ha già ${overlapping.length} contratti che coprono questo periodo`}
              </p>
              <ul className="pl-6 space-y-0.5 text-pw-text-muted">
                {overlapping.map(({ contract, last }) => (
                  <li key={contract.id}>
                    dal {formatDate(contract.start_date)} al {formatDate(last)} · {contract.duration_months} mesi
                    {contract.status === 'active' ? ' · attivo' : ''}
                  </li>
                ))}
              </ul>
              <p className="pl-6 text-pw-text-muted">
                Le rate non incassate del vecchio contratto <strong>restano aperte</strong>: nei mesi
                sovrapposti il cliente risulterà con due rate, e il doppio importo finirà in Crediti e nel
                cashflow. Se stai correggendo un contratto sbagliato, modifica quello esistente invece di
                crearne un altro.
              </p>
              <label className="flex items-start gap-2 pl-6 pt-1 cursor-pointer text-pw-text">
                <input
                  type="checkbox"
                  checked={overlapAck}
                  onChange={(e) => setOverlapAck(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-pw-border accent-amber-500"
                />
                <span>Ho verificato, la sovrapposizione è voluta</span>
              </label>
            </div>
          )}

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
                <span className="text-xs text-pw-text-dim shrink-0">
                  {(attachment.size / 1024).toFixed(0)} KB
                </span>
                <button
                  onClick={() => setAttachment(null)}
                  className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-pw-surface-3 text-pw-text-dim"
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
          disabled={!noContract && (!form.monthly_fee || !form.start_date || blockedByOverlap)}
          className="flex-1"
        >
          <FileText size={16} />
          {noContract ? 'Salva senza contratto' : 'Crea Contratto'}
        </Button>
      </div>
    </div>
  );
}
