'use client';

import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import type { ClientFinancialSummary } from '@/types/database';
import { Euro, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface FinancialSummaryProps {
  summary: ClientFinancialSummary;
  /**
   * Acconti del cliente (lavori one-shot fuori dal canone). Le quattro card
   * restano sul contratto — mescolarci dentro un acconto renderebbe falso
   * "Valore Contratto" — e la somma dei due mondi va nella riga in fondo.
   */
  acconti?: { paid: number; pending: number };
}

export function FinancialSummary({ summary, acconti }: FinancialSummaryProps) {
  const progressPercent = summary.total_value > 0
    ? Math.round((summary.total_paid / summary.total_value) * 100)
    : 0;

  const totaleAcconti = (acconti?.paid ?? 0) + (acconti?.pending ?? 0);
  const totaleCliente = Number(summary.total_value) + totaleAcconti;
  const incassatoCliente = Number(summary.total_paid) + (acconti?.paid ?? 0);

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

      {/* Contratto + acconti: il totale vero del cliente. */}
      {totaleAcconti > 0 && (
        <div className="bg-pw-surface rounded-xl border border-pw-border p-4">
          <p className="text-sm font-medium text-pw-text-muted mb-3">Contratto + acconti</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-lg font-bold text-pw-text tabular-nums">{formatCurrency(totaleCliente)}</p>
              <p className="text-xs text-pw-text-muted mt-0.5">Totale cliente</p>
            </div>
            <div>
              <p className="text-lg font-bold text-green-500 tabular-nums">{formatCurrency(incassatoCliente)}</p>
              <p className="text-xs text-pw-text-muted mt-0.5">Incassato</p>
            </div>
            <div>
              <p className="text-lg font-bold text-amber-500 tabular-nums">{formatCurrency(totaleCliente - incassatoCliente)}</p>
              <p className="text-xs text-pw-text-muted mt-0.5">Ancora da incassare</p>
            </div>
          </div>
          <p className="text-xs text-pw-text-dim mt-3">
            Di cui acconti: {formatCurrency(acconti?.paid ?? 0)} incassati
            {(acconti?.pending ?? 0) > 0 && <> · {formatCurrency(acconti!.pending)} in attesa</>}
          </p>
        </div>
      )}
    </div>
  );
}
