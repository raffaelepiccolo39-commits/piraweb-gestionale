'use client';

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
  };
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context.toast;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useMemo(() => ({
    success: (message: string) => addToast(message, 'success'),
    error: (message: string) => addToast(message, 'error'),
    info: (message: string) => addToast(message, 'info'),
  }), [addToast]);

  const icons = {
    success: CheckCircle2,
    error: AlertTriangle,
    info: Info,
  };

  const styles = {
    success: {
      bar: 'border-l-[var(--pw-success)]',
      iconBg: 'bg-[var(--pw-success-soft)] text-[var(--pw-success)]',
    },
    error: {
      bar: 'border-l-[var(--pw-danger)]',
      iconBg: 'bg-[var(--pw-danger-soft)] text-[var(--pw-danger)]',
    },
    info: {
      bar: 'border-l-[var(--pw-info)]',
      iconBg: 'bg-[var(--pw-info-soft)] text-[var(--pw-info)]',
    },
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container — Clarity style */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-6 left-6 z-[60] flex flex-col gap-2 max-w-[400px]"
      >
        {toasts.map((t) => {
          const Icon = icons[t.type];
          const s = styles[t.type];
          return (
            <div
              key={t.id}
              role="alert"
              className={cn(
                'flex items-start gap-3 px-4 py-3 rounded-md border border-pw-border bg-pw-surface shadow-[var(--pw-shadow-lg)] border-l-[3px] min-w-[280px]',
                s.bar
              )}
            >
              <div className={cn('shrink-0 w-[22px] h-[22px] rounded-full flex items-center justify-center', s.iconBg)}>
                <Icon size={12} strokeWidth={2.5} aria-hidden="true" />
              </div>
              <p className="text-[13px] font-medium text-pw-text leading-tight flex-1 pt-[2px]">{t.message}</p>
              <button
                onClick={() => removeToast(t.id)}
                className="shrink-0 p-0.5 text-pw-text-dim hover:text-pw-text transition-colors"
                aria-label="Chiudi notifica"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
