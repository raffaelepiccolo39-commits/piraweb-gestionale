'use client';

import { memo } from 'react';
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';

interface MessagesPreviewProps {
  unreadCount: number;
}

export const MessagesPreview = memo(function MessagesPreview({ unreadCount }: MessagesPreviewProps) {
  return (
    <Link
      href="/chat"
      className="relative inline-flex items-center justify-center w-12 h-12 rounded-full bg-pw-surface border border-pw-border hover:bg-pw-surface-2 hover:border-pw-accent/40 transition-colors"
      aria-label={unreadCount > 0 ? `${unreadCount} messaggi non letti` : 'Apri chat'}
      title={unreadCount > 0 ? `${unreadCount} messaggi non letti` : 'Chat'}
    >
      <MessageCircle size={20} className="text-pw-text-muted" />
      {unreadCount > 0 && (
        <span
          className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-pw-accent text-[#0A263A] text-[11px] font-semibold flex items-center justify-center tabular-nums shadow-sm"
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Link>
  );
});
