'use client';

import { useEffect, useRef, useState } from 'react';
import { cn, getInitials, getContrastTextColor } from '@/lib/utils';
import { Check, ChevronDown, X, Users } from 'lucide-react';

export interface AssigneeOption {
  id: string;
  full_name: string;
  color?: string | null;
}

interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
  members: AssigneeOption[];
  label?: string;
  placeholder?: string;
}

export function AssigneeMultiSelect({ value, onChange, members, label, placeholder = 'Non assegnato' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  };

  const selected = members.filter((m) => value.includes(m.id));

  return (
    <div ref={ref} className="relative">
      {label && (
        <label className="block text-xs uppercase tracking-[0.08em] font-semibold text-pw-text mb-1.5">{label}</label>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full min-h-[42px] flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-pw-border bg-pw-surface-2 text-sm text-pw-text hover:border-pw-border-hover focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none transition-all"
      >
        <span className="flex items-center gap-1.5 flex-wrap min-w-0">
          {selected.length === 0 ? (
            <span className="text-pw-text-dim flex items-center gap-1.5"><Users size={14} /> {placeholder}</span>
          ) : (
            selected.map((m) => (
              <span key={m.id} className="inline-flex items-center gap-1 pl-0.5 pr-1.5 py-0.5 rounded-full bg-pw-surface text-xs">
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold"
                  style={{ backgroundColor: m.color || 'var(--pw-navy)', color: getContrastTextColor(m.color || 'var(--pw-navy)') }}
                >
                  {getInitials(m.full_name)}
                </span>
                <span className="text-pw-text">{m.full_name.split(' ')[0]}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); toggle(m.id); }}
                  className="text-pw-text-dim hover:text-pw-danger cursor-pointer"
                >
                  <X size={11} />
                </span>
              </span>
            ))
          )}
        </span>
        <ChevronDown size={16} className="text-pw-text-dim shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-pw-border bg-pw-surface shadow-xl py-1">
          {members.length === 0 ? (
            <p className="px-3 py-2 text-xs text-pw-text-dim">Nessun membro</p>
          ) : (
            members.map((m) => {
              const active = value.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggle(m.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-pw-surface-2 transition-colors text-left"
                >
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                    style={{ backgroundColor: m.color || 'var(--pw-navy)', color: getContrastTextColor(m.color || 'var(--pw-navy)') }}
                  >
                    {getInitials(m.full_name)}
                  </span>
                  <span className="flex-1 text-pw-text truncate">{m.full_name}</span>
                  {active && <Check size={15} className="text-pw-accent shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
