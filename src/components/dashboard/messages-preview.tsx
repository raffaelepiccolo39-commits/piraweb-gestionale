'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { timeAgo } from '@/lib/utils';
import { MessageCircle } from 'lucide-react';

interface RecentMessage {
  id: string;
  content: string;
  created_at: string;
  sender: { full_name: string } | null;
  channel: { name: string } | null;
}

interface MessagesPreviewProps {
  messages: RecentMessage[];
  unreadCount: number;
}

export function MessagesPreview({ messages, unreadCount }: MessagesPreviewProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle size={16} className="text-pw-accent" />
            <h2 className="text-sm font-semibold text-pw-text">Messaggi</h2>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Badge className="bg-pw-accent text-pw-bg">{unreadCount}</Badge>
            )}
            <Link href="/chat" className="text-xs text-pw-accent hover:underline">Apri chat</Link>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {messages.length === 0 ? (
          <p className="px-6 py-4 text-sm text-pw-text-muted text-center">Nessun messaggio recente</p>
        ) : (
          <div className="divide-y divide-pw-border">
            {messages.map((msg) => (
              <Link
                key={msg.id}
                href="/chat"
                className="block px-6 py-3 hover:bg-pw-surface-2 transition-colors"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-xs text-pw-text-muted">
                    {msg.sender?.full_name}
                    {msg.channel?.name && <span className="text-pw-text-dim"> in #{msg.channel.name}</span>}
                  </p>
                  <span className="text-[10px] text-pw-text-dim">{timeAgo(msg.created_at)}</span>
                </div>
                <p className="text-sm text-pw-text truncate">{msg.content}</p>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
