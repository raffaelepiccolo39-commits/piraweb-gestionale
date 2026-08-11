'use client';

import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import type { ClientFinancialSummary } from '@/types/database';
import { Euro, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface FinancialSummaryProps {
  summary: ClientFinancialSummary;
  /**
   * Acconti del cliente. Sono INCASSI, non valore in più: quanto il cliente
   * deve resta il contratto, e l'acconto lo scala. Sommarli al totale
   * gonfierebbe il dovuto con soldi che il cliente ha già dato.
   */
  acconti?: { paid: number; pending: number };
}

export function FinancialSummary({ summary, acconti }: FinancialSummaryProps) {
  const accontiIncassati = acconti?.paid ?? 0;
  // Le quattro card restano sul solo contratto (è quello il "Valore Contratto"),
  // il conto vero col cliente sta nella riga in fondo.
  const incassatoCliente = Number(summary.total_paid) + accontiIncassati;
  const residuoCliente = Number(summary.total_value) - incassatoCliente;
  const progressPercent = summary.total_value > 0
    ? Math.round((incassatoCliente / summary.total_value) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 text-indigo-600 bg-indigo-500/15">
              <Euro size={20} />
            </div>
            <p className="text-xl font-bold text-pw-text animate-count">
              {formatCurrency(summary.total_value)}
            </p>
            <p className="text-xs text-pw-text-muted mt-0.5">Valore Contratto</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 text-green-600 bg-green-500/15">
              <CheckCircle2 size={20} />
            </div>
            <p className="text-xl font-bold text-green-400 animate-count">
              {formatCurrency(summary.total_paid)}
            </p>
            <p className="text-xs text-pw-text-muted mt-0.5">Totale Incassato</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 text-amber-600 bg-amber-500/15">
              <AlertTriangle size={20} />
            </div>
            <p className="text-xl font-bold text-amber-400 animate-count">
              {formatCurrency(summary.remaining)}
            </p>
            <p className="text-xs text-pw-text-muted mt-0.5">Rimanente</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 text-blue-600 bg-blue-500/15">
              <TrendingUp size={20} />
            </div>
            <p className="text-xl font-bold text-pw-text">
              {summary.months_paid} / {summary.months_paid + summary.months_remaining}
            </p>
            <p className="text-xs text-pw-text-muted mt-0.5">Mesi Pagati</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress bar */}
      <div className="bg-pw-surface rounded-xl border border-pw-border p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-pw-text-muted">Avanzamento Pagamenti</span>
          <span className={`text-sm font-bold ${
            progressPercent >= 75 ? 'text-green-600' :
            progressPercent >= 50 ? 'text-blue-600' :
            progressPercent >= 25 ? 'text-amber-600' : 'text-red-500'
          }`}>
            {progressPercent}%
          </span>
        </div>
        <div className="h-3 bg-pw-surface-3 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 progress-animated ${
              progressPercent >= 75 ? 'bg-green-500' :
              progressPercent >= 50 ? 'bg-blue-500' :
              progressPercent >= 25 ? 'bg-amber-500' : 'bg-red-500'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Il conto vero col cliente, con gli acconti già scalati. */}
      {accontiIncassati > 0 && (
        <div className="bg-pw-surface rounded-xl border border-pw-border p-4">
          <p className="text-sm font-medium text-pw-text-muted mb-3">Acconti scalati</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-lg font-bold text-pw-text tabular-nums">{formatCurrency(summary.total_value)}</p>
              <p className="text-xs text-pw-text-muted mt-0.5">Ti deve in tutto</p>
            </div>
            <div>
              <p className="text-lg font-bold text-green-500 tabular-nums">{formatCurrency(incassatoCliente)}</p>
              <p className="text-xs text-pw-text-muted mt-0.5">Ha gia&apos; pagato</p>
            </div>
            <div>
              <p className={`text-lg font-bold tabular-nums ${residuoCliente < 0 ? 'text-pw-danger' : 'text-amber-500'}`}>
                {formatCurrency(residuoCliente)}
              </p>
              <p className="text-xs text-pw-text-muted mt-0.5">Restano da avere</p>
            </div>
          </div>
          <p className="text-xs text-pw-text-dim mt-3">
            Di cui {formatCurrency(accontiIncassati)} arrivati come acconto, gia&apos; tolti dal residuo
            {(acconti?.pending ?? 0) > 0 && <> · altri {formatCurrency(acconti!.pending)} di acconti sono registrati ma non ancora incassati</>}.
            {residuoCliente < 0 && ' Il cliente ha versato più del valore del contratto.'}
          </p>
        </div>
      )}
    </div>
  );
}
