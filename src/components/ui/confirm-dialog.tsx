'use client';

import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { AlertTriangle, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  variant?: 'danger' | 'primary';
  /** Sostituisce il triangolo rosso: le conferme non sono tutte allarmi. */
  icon?: LucideIcon;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Conferma',
  variant = 'danger',
  icon,
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const isDanger = variant === 'danger';
  const Icon = icon ?? AlertTriangle;

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div
            className={
              isDanger
                ? 'w-10 h-10 rounded-md bg-[var(--pw-danger-soft)] border border-[rgba(224,67,26,0.25)] flex items-center justify-center shrink-0'
                : 'w-10 h-10 rounded-md bg-[var(--pw-accent-light)] border border-[var(--pw-border)] flex items-center justify-center shrink-0'
            }
          >
            <Icon size={18} className={isDanger ? 'text-[var(--pw-danger)]' : 'text-[var(--pw-accent)]'} />
          </div>
          <div className="text-[13px] text-pw-text-muted leading-relaxed pt-0.5">
            {description}
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Annulla
          </Button>
          <Button
            variant={variant}
            onClick={handleConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
