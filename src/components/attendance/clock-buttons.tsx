'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { formatTime, getAttendanceStatusLabel, getAttendanceStatusColor } from '@/lib/utils';
import type { AttendanceRecord } from '@/types/database';
import { LogIn, LogOut, Coffee, UtensilsCrossed, Clock, CheckCircle2 } from 'lucide-react';

interface ClockButtonsProps {
  record: AttendanceRecord | null;
  onAction: (action: 'clock_in' | 'lunch_start' | 'lunch_end' | 'clock_out') => Promise<void>;
  loading: boolean;
}

export function ClockButtons({ record, onAction, loading }: ClockButtonsProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const status = record?.status || 'absent';
  const canClockIn = !record || !record.clock_in;
  const canLunchStart = status === 'working' && !record?.lunch_start;
  const canLunchEnd = status === 'lunch_break';
  const canClockOut = status === 'working' && !!record?.clock_in;
  const isCompleted = status === 'completed';

  const handleClockOut = () => setShowExitConfirm(true);
  const confirmClockOut = async () => {
    await onAction('clock_out');
    setShowExitConfirm(false);
  };

  return (
    <>
      <div className="bg-pw-surface rounded-2xl border border-pw-border p-6">
        {/* Current time and status */}
        <div className="text-center mb-6">
          <p className="text-5xl font-bold text-pw-text font-mono">
            {currentTime.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
          <p className="text-sm text-pw-text-muted mt-1">
            {currentTime.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <div className="mt-3">
            <Badge className={getAttendanceStatusColor(status)}>
              {getAttendanceStatusLabel(status)}
            </Badge>
          </div>
        </div>

        {/* Completed message */}
        {isCompleted && (
          <div className="text-center py-6">
            <CheckCircle2 size={48} className="text-green-500 mx-auto mb-3" />
            <p className="text-lg font-semibold text-pw-text">Buon riposo!</p>
            <p className="text-sm text-pw-text-muted">Giornata completata</p>
          </div>
        )}

        {/* Action buttons */}
        {!isCompleted && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => onAction('clock_in')}
              disabled={!canClockIn || loading}
              className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 hover:bg-green-100 dark:hover:bg-green-900/40 enabled:hover:shadow-md"
            >
              <LogIn size={28} className="text-green-400" />
              <span className="text-sm font-semibold text-green-400">Entrata</span>
            </button>

            <button
              onClick={() => onAction('lunch_start')}
              disabled={!canLunchStart || loading}
              className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/40 enabled:hover:shadow-md"
            >
              <Coffee size={28} className="text-amber-400" />
              <span className="text-sm font-semibold text-amber-400">Pausa Pranzo</span>
            </button>

            <button
              onClick={() => onAction('lunch_end')}
              disabled={!canLunchEnd || loading}
              className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/40 enabled:hover:shadow-md"
            >
              <UtensilsCrossed size={28} className="text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-semibold text-blue-400">Fine Pausa</span>
            </button>

            <button
              onClick={handleClockOut}
              disabled={!canClockOut || loading}
              className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-900/40 enabled:hover:shadow-md"
            >
              <LogOut size={28} className="text-red-400" />
              <span className="text-sm font-semibold text-red-400">Uscita</span>
            </button>
          </div>
        )}

        {/* Timeline */}
        {record && record.clock_in && (
          <div className="mt-6 pt-4 border-t border-pw-border">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <Clock size={14} className="text-green-500 mx-auto mb-0.5" />
                  <p className="text-xs text-pw-text-dim">Entrata</p>
                  <p className="font-semibold text-pw-text">{formatTime(record.clock_in)}</p>
                </div>
                {record.lunch_start && (
                  <>
                    <div className="w-8 h-px bg-pw-surface-3" />
                    <div className="text-center">
                      <Coffee size={14} className="text-amber-500 mx-auto mb-0.5" />
                      <p className="text-xs text-pw-text-dim">Pausa</p>
                      <p className="font-semibold text-pw-text">{formatTime(record.lunch_start)}</p>
                    </div>
                  </>
                )}
                {record.lunch_end && (
                  <>
                    <div className="w-8 h-px bg-pw-surface-3" />
                    <div className="text-center">
                      <UtensilsCrossed size={14} className="text-blue-500 mx-auto mb-0.5" />
                      <p className="text-xs text-pw-text-dim">Rientro</p>
                      <p className="font-semibold text-pw-text">{formatTime(record.lunch_end)}</p>
                    </div>
                  </>
                )}
                {record.clock_out && (
                  <>
                    <div className="w-8 h-px bg-pw-surface-3" />
                    <div className="text-center">
                      <LogOut size={14} className="text-red-500 mx-auto mb-0.5" />
                      <p className="text-xs text-pw-text-dim">Uscita</p>
                      <p className="font-semibold text-pw-text">{formatTime(record.clock_out)}</p>
                    </div>
                  </>
                )}
              </div>
              {record.total_hours > 0 && (
                <div className="text-right">
                  <p className="text-xs text-pw-text-dim">Totale</p>
                  <p className="text-lg font-bold text-pw-accent">
                    {Math.floor(Number(record.total_hours))}h {Math.round((Number(record.total_hours) % 1) * 60).toString().padStart(2, '0')}m
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Exit confirmation */}
      <Modal open={showExitConfirm} onClose={() => setShowExitConfirm(false)} title="Conferma Uscita" size="sm">
        <div>
          <p className="text-pw-text-muted text-sm mb-4">
            Stai per registrare l&apos;uscita e chiudere la giornata lavorativa.
          </p>
          <p className="text-2xl font-bold text-pw-text mb-6">
            {currentTime.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setShowExitConfirm(false)} className="flex-1">
              Annulla
            </Button>
            <Button variant="danger" onClick={confirmClockOut} loading={loading} className="flex-1">
              <LogOut size={16} />
              Conferma Uscita
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
