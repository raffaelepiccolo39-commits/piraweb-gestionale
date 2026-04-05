'use client';

import { getInitials, formatTime } from '@/lib/utils';
import type { ChatChannel, Profile } from '@/types/database';
import { Hash, FolderKanban, Users, Plus } from 'lucide-react';

interface ChannelListProps {
  channels: ChatChannel[];
  teamMembers: Profile[];
  selectedChannelId: string | null;
  currentUserId: string;
  onSelectChannel: (channelId: string) => void;
  onStartDirect: (userId: string) => void;
  onCreateGroup: () => void;
}

export function ChannelList({
  channels,
  teamMembers,
  selectedChannelId,
  currentUserId,
  onSelectChannel,
  onStartDirect,
  onCreateGroup,
}: ChannelListProps) {
  const teamChannels = channels.filter((c) => c.type === 'team');
  const projectChannels = channels.filter((c) => c.type === 'project');
  const groupChannels = channels.filter((c) => c.type === 'group');
  const directChannels = channels.filter((c) => c.type === 'direct');

  const getDirectName = (channel: ChatChannel): string => {
    const other = channel.members?.find((m) => m.user_id !== currentUserId);
    return other?.profile?.full_name || 'Utente';
  };

  const getDirectInitials = (channel: ChatChannel): string => {
    return getInitials(getDirectName(channel));
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      {/* Team channels */}
      <div className="p-3">
        <p className="text-[10px] uppercase tracking-widest text-pw-text-dim font-medium px-2 mb-2">
          Canali
        </p>
        {teamChannels.map((channel) => (
          <button
            key={channel.id}
            onClick={() => onSelectChannel(channel.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all ${
              selectedChannelId === channel.id
                ? 'bg-pw-accent/10 text-pw-accent'
                : 'text-pw-text-muted hover:text-pw-text hover:bg-pw-surface-2'
            }`}
          >
            <Hash size={16} className="shrink-0" />
            <span className="truncate font-medium">{channel.name}</span>
          </button>
        ))}
      </div>

      {/* Group channels */}
      <div className="p-3 border-t border-pw-border">
        <div className="flex items-center justify-between px-2 mb-2">
          <p className="text-[10px] uppercase tracking-widest text-pw-text-dim font-medium">
            Gruppi
          </p>
          <button
            onClick={onCreateGroup}
            className="p-1 rounded-lg text-pw-text-dim hover:text-pw-accent hover:bg-pw-surface-2 transition-colors"
            title="Crea gruppo"
          >
            <Plus size={14} />
          </button>
        </div>
        {groupChannels.map((channel) => (
          <button
            key={channel.id}
            onClick={() => onSelectChannel(channel.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all ${
              selectedChannelId === channel.id
                ? 'bg-pw-accent/10 text-pw-accent'
                : 'text-pw-text-muted hover:text-pw-text hover:bg-pw-surface-2'
            }`}
          >
            <Users size={16} className="shrink-0" />
            <div className="flex-1 min-w-0 text-left">
              <p className="truncate font-medium">{channel.name}</p>
              {channel.last_message && (
                <p className="text-[10px] text-pw-text-dim truncate">
                  {channel.last_message.content}
                </p>
              )}
            </div>
            {channel.last_message && (
              <span className="text-[10px] text-pw-text-dim shrink-0">
                {formatTime(channel.last_message.created_at)}
              </span>
            )}
          </button>
        ))}
        {groupChannels.length === 0 && (
          <p className="text-[10px] text-pw-text-dim px-3 py-1">Nessun gruppo</p>
        )}
      </div>

      {/* Project channels */}
      {projectChannels.length > 0 && (
        <div className="p-3 border-t border-pw-border">
          <p className="text-[10px] uppercase tracking-widest text-pw-text-dim font-medium px-2 mb-2">
            Progetti
          </p>
          {projectChannels.map((channel) => (
            <button
              key={channel.id}
              onClick={() => onSelectChannel(channel.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all ${
                selectedChannelId === channel.id
                  ? 'bg-pw-accent/10 text-pw-accent'
                  : 'text-pw-text-muted hover:text-pw-text hover:bg-pw-surface-2'
              }`}
            >
              <FolderKanban size={16} className="shrink-0" />
              <div className="flex-1 min-w-0 text-left">
                <p className="truncate font-medium">{channel.name}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Direct messages */}
      <div className="p-3 border-t border-pw-border flex-1">
        <p className="text-[10px] uppercase tracking-widest text-pw-text-dim font-medium px-2 mb-2">
          Messaggi Diretti
        </p>

        {directChannels.map((channel) => (
          <button
            key={channel.id}
            onClick={() => onSelectChannel(channel.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all ${
              selectedChannelId === channel.id
                ? 'bg-pw-accent/10 text-pw-accent'
                : 'text-pw-text-muted hover:text-pw-text hover:bg-pw-surface-2'
            }`}
          >
            <div className="w-6 h-6 rounded-full bg-pw-purple flex items-center justify-center shrink-0">
              <span className="text-white text-[8px] font-bold">{getDirectInitials(channel)}</span>
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="truncate font-medium">{getDirectName(channel)}</p>
              {channel.last_message && (
                <p className="text-[10px] text-pw-text-dim truncate">
                  {channel.last_message.content}
                </p>
              )}
            </div>
          </button>
        ))}

        {/* Team members for new direct chat */}
        <p className="text-[10px] uppercase tracking-widest text-pw-text-dim font-medium px-2 mb-2 mt-4">
          Team
        </p>
        {teamMembers
          .filter((m) => m.id !== currentUserId && m.is_active)
          .map((member) => {
            const hasExisting = directChannels.some((c) =>
              c.members?.some((m) => m.user_id === member.id)
            );
            if (hasExisting) return null;
            return (
              <button
                key={member.id}
                onClick={() => onStartDirect(member.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-pw-text-muted hover:text-pw-text hover:bg-pw-surface-2 transition-all"
              >
                <div className="w-6 h-6 rounded-full bg-pw-surface-3 flex items-center justify-center shrink-0">
                  <span className="text-pw-text-muted text-[8px] font-bold">{getInitials(member.full_name)}</span>
                </div>
                <span className="truncate">{member.full_name}</span>
              </button>
            );
          })}
      </div>
    </div>
  );
}
