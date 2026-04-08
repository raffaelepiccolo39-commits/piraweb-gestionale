'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getAttendanceStatusLabel, getAttendanceStatusColor, formatTime } from '@/lib/utils';
import { LogIn, LogOut, Coffee } from 'lucide-react';
import type { AttendanceRecord } from '@/types/database';

interface AttendanceWidgetProps {
  record: AttendanceRecord | null;
  loading: boolean;
  onClockIn: () => Promise<void>;
  onLunchBreak: () => Promise<void>;
  onClockOut: () => Promise<void>;
}

export function AttendanceWidget({ record, loading, onClockIn, onLunchBreak, onClockOut }: AttendanceWidgetProps) {
  const status = record?.status || 'absent';

  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] text-pw-text-dim uppercase tracking-wider mb-1">Il tuo stato</p>
            <div className="flex items-center gap-2">
              <Badge className={getAttendanceStatusColor(status)}>
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
                <Button size="sm" variant="outline" onClick={onLunchBreak} loading={loading}>
                  <Coffee size={14} />
                </Button>
                <Button size="sm" variant="secondary" onClick={onClockOut} loading={loading}>
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
  );
}
