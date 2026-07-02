'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/ui/page-header';
import { SkeletonList } from '@/components/ui/skeleton';
import type { BusinessControlRow, BusinessSection } from '@/types/database';
import { Plus, Trash2, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

const MONTHS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
const COLS = [...MONTHS, 'I° Trim', 'II° Trim', 'III° Trim', 'IV° Trim', 'Totale'];

const TEMPLATE: Record<BusinessSection, string[]> = {
  ricavi_agenzia: [
    'Sviluppo One Shot', 'Sviluppo Recurrent', 'E-Commerce One Shot',
    'E-Commerce Recurrent', 'Riaddebito Spese Marketing Clienti',
  ],
  ricavi_extra: [
    'Consulenze One Shot', 'Consulenze Recurrent', 'Coaching One Shot',
    'Coaching Recurrent', 'Ricavi Vari',
  ],
  costi: [
    'Personale', 'Lavorazioni di terzi p/produzione servizi',
    'Tenuta paghe, contabilità e dichiarazioni fiscali', 'Attrezzature',
    'Cancelleria e beni di consumo', 'Spese di Marketing', 'Spese di Marketing Clienti',
    'Spese legali', 'Spese telefoniche', 'Pasti e soggiorni',
    'Ricerca, addestramento e formazione', 'Oneri bancari', 'Fitti passivi (beni immobili)',
    'Spese Condominiali', 'Pulizie', "Licenza d'uso software di esercizio",
    'Assicurazioni non obbligatorie', 'Imposta di bollo', 'Tassa sui rifiuti',
    'Altre imposte e tasse deducibili', 'Altri oneri di gestione deducibili',
    'Interessi passivi su mutui', 'Soci rimborsi', 'Altri costi Soci',
  ],
};

const zero12 = () => Array(12).fill(0);
function expand(m: number[]): number[] {
  const q = [0, 1, 2, 3].map((qi) => (m[qi * 3] || 0) + (m[qi * 3 + 1] || 0) + (m[qi * 3 + 2] || 0));
  const total = m.reduce((a, b) => a + (b || 0), 0);
  return [...m, ...q, total];
}
function sumRows(rows: BusinessControlRow[]): number[] {
  const acc = zero12();
  for (const r of rows) for (let i = 0; i < 12; i++) acc[i] += Number(r.months?.[i] || 0);
  return acc;
}
const fmtN = (n: number) => n.toLocaleString('it-IT', { maximumFractionDigits: 0 });
const fmtEuro = (n: number) => '€ ' + n.toLocaleString('it-IT', { maximumFractionDigits: 0 });
const fmtPct = (p: number) => (isFinite(p) ? p.toFixed(1).replace('.', ',') : '0,0') + '%';

export default function ControlloGestionePage() {
  const supabase = createClient();
  const toast = useToast();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const nowYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(nowYear);
  const [rows, setRows] = useState<BusinessControlRow[]>([]);
  const [loading, setLoading] = useState(true);
  const rowsRef = useRef<BusinessControlRow[]>([]);
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  const fetchData = useCallback(async () => {
    const { data } = await supabase
      .from('business_control')
      .select('*')
      .eq('year', year)
      .order('section')
      .order('sort_order');
    const norm = ((data as BusinessControlRow[]) || []).map((r) => ({
      ...r,
      months: (r.months || zero12()).map((v) => Number(v || 0)).concat(zero12()).slice(0, 12),
    }));
    setRows(norm);
    setLoading(false);
  }, [supabase, year]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  const bySection = (s: BusinessSection) => rows.filter((r) => r.section === s).sort((a, b) => a.sort_order - b.sort_order);

  const agenzia = bySection('ricavi_agenzia');
  const extra = bySection('ricavi_extra');
  const costi = bySection('costi');

  const totAgenzia = sumRows(agenzia);
  const totExtra = sumRows(extra);
  const totRicavi = totAgenzia.map((v, i) => v + totExtra[i]);
  const totCosti = sumRows(costi);
  const margine = totRicavi.map((v, i) => v - totCosti[i]);
  const ricaviCols = expand(totRicavi);

  const setCell = (id: string, m: number, val: number) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, months: r.months.map((v, i) => (i === m ? val : v)) } : r)));
  };
  const saveMonths = async (id: string) => {
    const r = rowsRef.current.find((x) => x.id === id);
    if (!r) return;
    const { error } = await supabase.from('business_control').update({ months: r.months }).eq('id', id);
    if (error) toast.error(error.message || 'Errore nel salvataggio');
  };
  const saveLabel = async (id: string, label: string) => {
    const { error } = await supabase.from('business_control').update({ label }).eq('id', id);
    if (error) toast.error(error.message || 'Errore nel salvataggio');
  };
  const addRow = async (section: BusinessSection) => {
    if (!profile) return;
    const order = Math.max(0, ...rows.filter((r) => r.section === section).map((r) => r.sort_order)) + 1;
    const { error } = await supabase.from('business_control').insert({
      year, section, label: 'Nuova voce', sort_order: order, months: zero12(), created_by: profile.id,
    });
    if (error) { toast.error(error.message || 'Errore'); return; }
    fetchData();
  };
  const deleteRow = async (id: string) => {
    const { error } = await supabase.from('business_control').delete().eq('id', id);
    if (error) { toast.error(error.message || 'Errore'); return; }
    fetchData();
  };
  const loadTemplate = async () => {
    if (!profile) return;
    const inserts: Array<Partial<BusinessControlRow>> = [];
    (Object.keys(TEMPLATE) as BusinessSection[]).forEach((section) => {
      TEMPLATE[section].forEach((label, i) => {
        inserts.push({ year, section, label, sort_order: i, months: zero12(), created_by: profile.id });
      });
    });
    const { error } = await supabase.from('business_control').insert(inserts);
    if (error) { toast.error(error.message || 'Errore nel caricamento modello'); return; }
    toast.success('Modello caricato');
    fetchData();
  };

  if (!isAdmin) {
    return <div className="p-8 text-center text-pw-text-muted">Sezione riservata agli amministratori.</div>;
  }
  if (loading) {
    return <div className="space-y-6 animate-slide-up"><SkeletonList variant="row" count={8} /></div>;
  }

  // Larghezza celle
  const cellCls = 'border border-pw-border px-1.5 py-1 text-right tabular-nums whitespace-nowrap';

  // Riga calcolata (totali/margine) — 17 colonne di valore + %
  const computedRow = (label: string, months: number[], tone: 'group' | 'total' | 'margin') => {
    const cols = expand(months);
    const bg = tone === 'margin' ? 'bg-pw-accent/10' : tone === 'total' ? 'bg-pw-surface-3' : 'bg-pw-surface-2';
    return (
      <tr key={label} className={`${bg} font-semibold`}>
        <td className={`sticky left-0 z-10 ${bg} border border-pw-border px-2 py-1 text-left text-pw-text`}>{label}</td>
        {cols.map((v, i) => (
          <td key={i} className={cellCls}>
            <div className="text-pw-text">{fmtEuro(v)}</div>
            <div className="text-[9px] text-pw-text-dim">{fmtPct(ricaviCols[i] ? (v / ricaviCols[i]) * 100 : 0)}</div>
          </td>
        ))}
      </tr>
    );
  };

  // Riga voce editabile
  const leafRow = (row: BusinessControlRow) => {
    const cols = expand(row.months);
    return (
      <tr key={row.id} className="hover:bg-pw-surface-2/40 group">
        <td className="sticky left-0 z-10 bg-pw-surface border border-pw-border px-1 py-0.5 text-left">
          <div className="flex items-center gap-1">
            <input
              defaultValue={row.label}
              onBlur={(e) => { if (e.target.value !== row.label) saveLabel(row.id, e.target.value); }}
              className="w-40 bg-transparent text-pw-text text-xs outline-none focus:bg-pw-surface-2 rounded px-1 py-0.5"
            />
            <button onClick={() => deleteRow(row.id)} className="opacity-0 group-hover:opacity-100 text-pw-text-dim hover:text-red-400 shrink-0" aria-label="Elimina voce">
              <Trash2 size={12} />
            </button>
          </div>
        </td>
        {cols.map((v, i) => {
          if (i < 12) {
            return (
              <td key={i} className="border border-pw-border p-0">
                <input
                  type="number"
                  value={row.months[i] || ''}
                  onChange={(e) => setCell(row.id, i, parseFloat(e.target.value) || 0)}
                  onBlur={() => saveMonths(row.id)}
                  placeholder="0"
                  className="w-16 bg-transparent text-right tabular-nums text-xs px-1.5 py-1 outline-none focus:bg-pw-accent/5"
                />
                <div className="text-[9px] text-pw-text-dim text-right px-1.5 pb-0.5">{fmtPct(ricaviCols[i] ? (v / ricaviCols[i]) * 100 : 0)}</div>
              </td>
            );
          }
          // trimestri + totale (calcolati)
          return (
            <td key={i} className={`${cellCls} bg-pw-surface-2/50`}>
              <div className="text-pw-text-muted">{fmtN(v)}</div>
              <div className="text-[9px] text-pw-text-dim">{fmtPct(ricaviCols[i] ? (v / ricaviCols[i]) * 100 : 0)}</div>
            </td>
          );
        })}
      </tr>
    );
  };

  const sectionAddRow = (section: BusinessSection) => (
    <tr key={`add-${section}`}>
      <td colSpan={COLS.length + 1} className="border border-pw-border px-2 py-1">
        <button onClick={() => addRow(section)} className="inline-flex items-center gap-1 text-xs text-pw-accent hover:underline">
          <Plus size={12} /> Aggiungi voce
        </button>
      </td>
    </tr>
  );

  const empty = rows.length === 0;

  return (
    <div className="space-y-4 animate-slide-up">
      <PageHeader
        title="Controllo e Gestione Aziendale"
        subtitle="Conto economico gestionale mensile: ricavi, costi e marginalità"
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => setYear((y) => y - 1)} className="p-1.5 rounded-lg border border-pw-border text-pw-text-muted hover:text-pw-text" aria-label="Anno precedente"><ChevronLeft size={16} /></button>
            <span className="text-sm font-semibold text-pw-text w-12 text-center">{year}</span>
            <button onClick={() => setYear((y) => y + 1)} className="p-1.5 rounded-lg border border-pw-border text-pw-text-muted hover:text-pw-text" aria-label="Anno successivo"><ChevronRight size={16} /></button>
          </div>
        }
      />

      {empty ? (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
          <p className="text-pw-text-muted text-sm">Nessuna voce per il {year}.</p>
          <button onClick={loadTemplate} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-pw-accent text-[#0A263A] text-sm font-semibold hover:bg-pw-accent-hover transition-colors">
            <Sparkles size={16} /> Carica modello (ricavi + costi)
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto no-scrollbar rounded-xl border border-pw-border">
          <table className="border-collapse text-xs">
            <thead>
              <tr className="bg-pw-surface-2">
                <th className="sticky left-0 z-20 bg-pw-surface-2 border border-pw-border px-2 py-2 text-left text-pw-text-dim font-medium min-w-[180px]">Voce</th>
                {COLS.map((c) => (
                  <th key={c} className="border border-pw-border px-1.5 py-2 text-right text-pw-text-dim font-medium min-w-[72px] whitespace-nowrap">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* RICAVI */}
              {computedRow('Totale Ricavi (per competenza)', totRicavi, 'total')}
              {computedRow('RICAVI AGENZIA', totAgenzia, 'group')}
              {agenzia.map((r) => leafRow(r))}
              {sectionAddRow('ricavi_agenzia')}
              {computedRow('RICAVI EXTRA AGENZIA', totExtra, 'group')}
              {extra.map((r) => leafRow(r))}
              {sectionAddRow('ricavi_extra')}
              {/* COSTI */}
              {computedRow('Totale Costi (per competenza)', totCosti, 'total')}
              {costi.map((r) => leafRow(r))}
              {sectionAddRow('costi')}
              {/* MARGINE */}
              {computedRow('Marginalità GH', margine, 'margin')}
            </tbody>
          </table>
        </div>
      )}

      {!empty && (
        <p className="text-[11px] text-pw-text-dim">
          Le celle mensili sono modificabili. Totali, percentuali (sul totale ricavi), trimestri, totale generale e marginalità sono calcolati automaticamente.
        </p>
      )}
    </div>
  );
}
