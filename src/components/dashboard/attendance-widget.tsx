'use client';

import { memo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { getAttendanceStatusLabel, getAttendanceStatusTone, formatTime } from '@/lib/utils';
import { LogIn, LogOut, Coffee } from 'lucide-react';
import type { AttendanceRecord } from '@/types/database';

interface AttendanceWidgetProps {
  record: AttendanceRecord | null;
  loading: boolean;
  onClockIn: () => Promise<void>;
  onLunchBreak: () => Promise<void>;
  onClockOut: () => Promise<void>;
}

export const AttendanceWidget = memo(function AttendanceWidget({ record, loading, onClockIn, onLunchBreak, onClockOut }: AttendanceWidgetProps) {
  const status = record?.status || 'absent';
  // Una sola pausa pranzo al giorno, come in /presenze e nel cron auto-lunch-break:
  // il record ha una sola coppia lunch_start/lunch_end, quindi una seconda pausa
  // sovrascriverebbe l'orario di inizio falsando le ore.
  const canLunchStart = status === 'working' && !record?.lunch_start;

  // L'uscita chiude la giornata e fa scattare il cancello (AttendanceGate), quindi
  // passa da una conferma come in /presenze: qui il tasto sta accanto all'icona
  // della pausa ed era il modo più facile per chiudersi fuori alle 13:30.
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const confirmClockOut = async () => {
    await onClockOut();
    setShowExitConfirm(false);
  };

  return (
    <>
    <Card className="relative overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] text-pw-text-dim uppercase tracking-wider mb-1">Il tuo stato</p>
            <div className="flex items-center gap-2">
              <Badge tone={getAttendanceStatusTone(status)} dot>
                {status === 'absent' ? 'Non registrato' : getAttendanceStatusLabel(status)}
              </Badge>
              {status === 'working' && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
              )}
            </div>
            {record?.clock_in && (
              <p className="text-xs text-pw-text-dim mt-1">
                Entrata: {formatTime(record.clock_in)}
                {record.clock_out && ` · Uscita: ${formatTime(record.clock_out)}`}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {!record?.clock_in && (
              <Button size="sm" onClick={onClockIn} loading={loading}>
                <LogIn size={14} />
                Entra
              </Button>
            )}
            {status === 'working' && (
              <>
                {canLunchStart && (
                  <Button size="sm" variant="outline" onClick={onLunchBreak} loading={loading} title="Pausa pranzo">
                    <Coffee size={14} />
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => setShowExitConfirm(true)} loading={loading}>
                  <LogOut size={14} />
                  Esci
                </Button>
              </>
            )}
            {status === 'lunch_break' && (
              <Button size="sm" onClick={onClockIn} loading={loading}>
                <LogIn size={14} />
                Riprendi
              </Button>
            )}
          </div>
        </div>
      </CardContent>
      {status === 'working' && (
        <div className="h-0.5 bg-green-500" />
      )}
      {status === 'lunch_break' && (
        <div className="h-0.5 bg-yellow-500" />
      )}
    </Card>

    <Modal open={showExitConfirm} onClose={() => setShowExitConfirm(false)} title="Conferma Uscita" size="sm">
      <div>
        <p className="text-pw-text-muted text-sm mb-4">
          Stai per registrare l&apos;uscita e chiudere la giornata lavorativa. Se volevi solo fare
          una pausa, annulla e usa il pulsante con la tazzina.
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
});
