'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Send } from 'lucide-react';
import type { Profile } from '@/types/database';

interface MessageInputProps {
  onSend: (content: string) => Promise<void>;
  disabled?: boolean;
  members?: Profile[];
}

export function MessageInput({ onSend, disabled, members = [] }: MessageInputProps) {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const filteredMembers = members.filter((m) =>
    m.full_name.toLowerCase().includes(mentionFilter.toLowerCase())
  );

  const handleSend = async () => {
    const trimmed = content.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setContent('');
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const insertMention = useCallback((member: Profile) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursorPos = textarea.selectionStart;
    const textBefore = content.substring(0, cursorPos);
    const textAfter = content.substring(cursorPos);
    // Find the @ that started this mention
    const atIndex = textBefore.lastIndexOf('@');
    const newText = textBefore.substring(0, atIndex) + `@${member.full_name} ` + textAfter;
    setContent(newText);
    setShowMentions(false);
    setMentionFilter('');
    textarea.focus();
  }, [content]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setContent(value);

    // Check for @mention trigger
    const cursorPos = e.target.selectionStart;
    const textBefore = value.substring(0, cursorPos);
    const atIndex = textBefore.lastIndexOf('@');

    if (atIndex >= 0) {
      const charBefore = atIndex > 0 ? textBefore[atIndex - 1] : ' ';
      if (charBefore === ' ' || charBefore === '\n' || atIndex === 0) {
        const query = textBefore.substring(atIndex + 1);
        if (!query.includes(' ') && query.length <= 30) {
          setMentionFilter(query);
          setShowMentions(true);
          setMentionIndex(0);
          return;
        }
      }
    }
    setShowMentions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentions && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, filteredMembers.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredMembers[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setShowMentions(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-pw-border p-3 relative">
      {/* @mention dropdown */}
      {showMentions && filteredMembers.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 mb-1 bg-pw-surface border border-pw-border rounded-xl shadow-lg overflow-hidden z-50 max-h-48 overflow-y-auto">
          {filteredMembers.map((member, i) => (
            <button
              key={member.id}
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(member);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                i === mentionIndex ? 'bg-pw-accent/10 text-pw-accent' : 'text-pw-text hover:bg-pw-surface-2'
              }`}
            >
              <span className="font-medium">{member.full_name}</span>
              <span className="text-[10px] text-pw-text-dim">{member.role}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Scrivi un messaggio... (usa @ per menzionare)"
          disabled={disabled || sending}
          rows={1}
          className="flex-1 px-4 py-2.5 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text placeholder:text-pw-text-dim focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none transition-all text-sm resize-none max-h-32"
          style={{ minHeight: '42px' }}
        />
        <button
          onClick={handleSend}
          disabled={!content.trim() || sending || disabled}
          className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-pw-accent text-pw-bg hover:bg-pw-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          aria-label="Invia messaggio"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
