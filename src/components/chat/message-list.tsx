'use client';

import { useEffect, useMemo, useRef } from 'react';
import { getInitials, formatTime } from '@/lib/utils';
import type { ChatMessage } from '@/types/database';

interface MessageListProps {
  messages: ChatMessage[];
  currentUserId: string;
  onLoadMore?: () => void;
  loading?: boolean;
}

function getDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Oggi';
  if (date.toDateString() === yesterday.toDateString()) return 'Ieri';
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Render message content with @mention highlights */
function MessageContent({ content, isOwn }: { content: string; isOwn: boolean }) {
  const parts = content.split(/(@\S+(?:\s\S+)?)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('@') ? (
          <span key={i} className={`font-semibold ${isOwn ? 'text-white/90' : 'text-pw-accent'}`}>
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export function MessageList({ messages, currentUserId, loading }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Group messages by date (memoized to avoid recalc on every render)
  const grouped = useMemo(() => {
    const result: { date: string; messages: ChatMessage[] }[] = [];
    let currentDate = '';
    messages.forEach((msg) => {
      const dateLabel = getDateLabel(msg.created_at);
      if (dateLabel !== currentDate) {
        currentDate = dateLabel;
        result.push({ date: dateLabel, messages: [msg] });
      } else {
        result[result.length - 1].messages.push(msg);
      }
    });
    return result;
  }, [messages]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
      {loading && (
        <div className="flex justify-center py-4">
          <div className="w-6 h-6 border-3 border-pw-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {messages.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <p className="text-pw-text-muted text-sm">Nessun messaggio ancora</p>
          <p className="text-pw-text-dim text-xs mt-1">Inizia la conversazione!</p>
        </div>
      )}

      {grouped.map((group) => (
        <div key={group.date}>
          {/* Date separator */}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-pw-border" />
            <span className="text-[10px] uppercase tracking-widest text-pw-text-dim font-medium">
              {group.date}
            </span>
            <div className="flex-1 h-px bg-pw-border" />
          </div>

          {/* Messages */}
          <div className="space-y-2">
            {group.messages.map((msg, idx) => {
              const isOwn = msg.sender_id === currentUserId;
              const senderName = (msg.sender as { full_name: string } | undefined)?.full_name || '?';
              const showAvatar = idx === 0 ||
                group.messages[idx - 1]?.sender_id !== msg.sender_id;

              return (
                <div
                  key={msg.id}
                  className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}
                >
                  {/* Avatar */}
                  <div className="w-7 shrink-0">
                    {showAvatar && !isOwn && (
                      <div className="w-7 h-7 rounded-full bg-pw-navy flex items-center justify-center">
                        <span className="text-white text-[9px] font-bold">
                          {getInitials(senderName)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Message bubble */}
                  <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
                    {showAvatar && !isOwn && (
                      <p className="text-[10px] text-pw-text-dim mb-0.5 ml-1">{senderName}</p>
                    )}
                    <div
                      className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
                        isOwn
                          ? 'bg-pw-accent text-[#0A263A] rounded-br-md'
                          : 'bg-pw-surface-3 text-pw-text rounded-bl-md'
                      }`}
                    >
                      <MessageContent content={msg.content} isOwn={isOwn} />
                    </div>
                    <p className={`text-[10px] text-pw-text-dim mt-0.5 ${isOwn ? 'text-right mr-1' : 'ml-1'}`}>
                      {formatTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div ref={bottomRef} />
    </div>
  );
}
