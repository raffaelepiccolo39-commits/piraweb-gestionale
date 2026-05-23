'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { XCircle } from 'lucide-react';

interface LostReasonFormProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
}

export function LostReasonForm({ open, onClose, onConfirm }: LostReasonFormProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm(reason);
      setReason('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setReason('');
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Deal perso" size="sm">
      <div className="space-y-4">
        <Textarea
          id="lost-reason"
          label="Motivo della perdita (opzionale)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Es: Budget insufficiente, scelto competitor..."
          rows={3}
        />
        <div className="flex gap-2 pt-2">
          <Button variant="ghost" onClick={handleClose} className="flex-1" disabled={submitting}>
            Annulla
          </Button>
          <Button onClick={handleConfirm} className="flex-1" disabled={submitting}>
            <XCircle size={14} />
            Conferma
          </Button>
        </div>
      </div>
    </Modal>
  );
}
