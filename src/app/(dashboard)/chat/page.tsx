'use client';


import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { ChannelList } from '@/components/chat/channel-list';
import { MessageList } from '@/components/chat/message-list';
import { MessageInput } from '@/components/chat/message-input';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getInitials } from '@/lib/utils';
import type { ChatChannel, ChatMessage, ChatChannelMember, Profile } from '@/types/database';
import { ArrowLeft, MessageCircle, FolderKanban, Users, Check, AlertTriangle, Search, X } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

export default function ChatPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [teamMembers, setTeamMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [showChannels, setShowChannels] = useState(true);
  const [error, setError] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // Fetch channels
  const fetchChannels = useCallback(async () => {
    if (!profile) return;

    try {
      // Ensure team channel exists
      await supabase.rpc('setup_team_chat');

      // Fetch channels with members
      const { data: memberData } = await supabase
        .from('chat_channel_members')
        .select('channel_id, user_id, profile:profiles(id, full_name, role, avatar_url, is_active)')
        .eq('user_id', profile.id);

      if (!memberData) { setLoading(false); return; }

      const channelIds = memberData.map((m) => m.channel_id);

      const { data: channelData } = await supabase
        .from('chat_channels')
        .select('*')
        .in('id', channelIds)
        .order('created_at');

      if (!channelData) { setLoading(false); return; }

      // Also create project channels for active projects the user is a member of
      const { data: userProjects } = await supabase
        .from('project_members')
        .select('project_id')
        .eq('user_id', profile.id);

      if (userProjects) {
        await Promise.all(
          userProjects.map((pm) =>
            supabase.rpc('get_or_create_project_channel', { p_project_id: pm.project_id })
          )
        );
      }

      // Re-fetch all channel IDs after potential new channels were created
      const { data: allMemberData } = await supabase
        .from('chat_channel_members')
        .select('channel_id')
        .eq('user_id', profile.id);

      const allChannelIds = allMemberData?.map((m) => m.channel_id) ?? channelIds;

      // Fetch new channels if any were added
      const newIds = allChannelIds.filter((id) => !channelIds.includes(id));
      let allChannelData = [...channelData];
      if (newIds.length > 0) {
        const { data: newChannels } = await supabase
          .from('chat_channels')
          .select('*')
          .in('id', newIds);
        if (newChannels) allChannelData = [...allChannelData, ...newChannels];
      }

      const finalChannelIds = allChannelData.map((ch) => ch.id);

      // Batch: fetch ALL members for ALL channels in 1 query
      // Batch: fetch ALL last messages for ALL channels in 1 query (latest per channel via order+limit trick)
      const [allMembersRes, allLastMsgsRes] = await Promise.all([
        supabase
          .from('chat_channel_members')
          .select('*, profile:profiles(id, full_name, role, avatar_url, is_active)')
          .in('channel_id', finalChannelIds),
        supabase
          .from('chat_messages')
          .select('*')
          .in('channel_id', finalChannelIds)
          .order('created_at', { ascending: false })
          .limit(500),
      ]);

      const membersByChannel = new Map<string, ChatChannelMember[]>();
      for (const m of allMembersRes.data ?? []) {
        const list = membersByChannel.get(m.channel_id) ?? [];
        list.push(m as ChatChannelMember);
        membersByChannel.set(m.channel_id, list);
      }

      const lastMsgByChannel = new Map<string, ChatMessage>();
      for (const msg of allLastMsgsRes.data ?? []) {
        if (!lastMsgByChannel.has(msg.channel_id)) {
          lastMsgByChannel.set(msg.channel_id, msg as ChatMessage);
        }
      }

      const enriched = allChannelData.map((ch) => ({
        ...ch,
        members: membersByChannel.get(ch.id) ?? [],
        last_message: lastMsgByChannel.get(ch.id),
      } as ChatChannel));

      // Sort: team first, then projects, then by last message time
      enriched.sort((a, b) => {
        const order = { team: 0, project: 1, direct: 2 };
        const aOrder = order[a.type] ?? 2;
        const bOrder = order[b.type] ?? 2;
        if (aOrder !== bOrder) return aOrder - bOrder;
        const aTime = a.last_message?.created_at || a.created_at;
        const bTime = b.last_message?.created_at || b.created_at;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });

      setChannels(enriched);

      // Auto-select first channel
      if (!selectedChannelId && enriched.length > 0) {
        setSelectedChannelId(enriched[0].id);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [profile, selectedChannelId]);

  // Fetch team members
  useEffect(() => {
    const fetchTeam = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('is_active', true)
        .order('full_name');
      if (data) setTeamMembers(data as Profile[]);
    };
    fetchTeam();
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  // Fetch messages when channel changes
  const fetchMessages = useCallback(async (channelId: string) => {
    setMessagesLoading(true);
    const { data } = await supabase
      .from('chat_messages')
      .select('*, sender:profiles!chat_messages_sender_id_fkey(id, full_name, role, avatar_url)')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })
      .limit(100);

    setMessages((data as ChatMessage[]) || []);
    setMessagesLoading(false);
  }, []);

  // Subscribe to realtime messages
  useEffect(() => {
    if (!selectedChannelId) return;

    fetchMessages(selectedChannelId);

    // Clean up previous subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    // Subscribe to new messages
    const channel = supabase
      .channel(`chat-${selectedChannelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `channel_id=eq.${selectedChannelId}`,
        },
        async (payload) => {
          // Fetch the full message with sender profile
          const { data } = await supabase
            .from('chat_messages')
            .select('*, sender:profiles!chat_messages_sender_id_fkey(id, full_name, role, avatar_url)')
            .eq('id', payload.new.id)
            .single();

          if (data) {
            setMessages((prev) => [...prev, data as ChatMessage]);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedChannelId, supabase, fetchMessages]);

  // Send message
  const handleSendMessage = async (content: string) => {
    if (!profile || !selectedChannelId) return;

    try {
      const { error } = await supabase.from('chat_messages').insert({
        channel_id: selectedChannelId,
        sender_id: profile.id,
        content,
      });
      if (error) throw error;
    } catch {
      toast.error('Errore nell\'invio del messaggio');
    }
  };

  // Start direct chat
  const handleStartDirect = async (otherUserId: string) => {
    if (!profile) return;

    const { data: channelId } = await supabase.rpc('get_or_create_direct_channel', {
      p_user1: profile.id,
      p_user2: otherUserId,
    });

    if (channelId) {
      await fetchChannels();
      setSelectedChannelId(channelId);
      setShowChannels(false);
    }
  };

  const handleSelectChannel = (channelId: string) => {
    setSelectedChannelId(channelId);
    setShowChannels(false);
  };

  const toggleGroupMember = (userId: string) => {
    setGroupMembers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleCreateGroup = async () => {
    if (!profile || !groupName.trim() || groupMembers.length === 0) return;
    setCreatingGroup(true);

    try {
      // Create channel
      const { data: newChannel, error } = await supabase
        .from('chat_channels')
        .insert({ name: groupName.trim(), type: 'group', created_by: profile.id })
        .select()
        .single();

      if (error || !newChannel) { setCreatingGroup(false); return; }

      // Add members (including self)
      const allMembers = [...new Set([profile.id, ...groupMembers])];
      await supabase.from('chat_channel_members').insert(
        allMembers.map((userId) => ({ channel_id: newChannel.id, user_id: userId }))
      );

      setShowCreateGroup(false);
      setGroupName('');
      setGroupMembers([]);
      setCreatingGroup(false);
      await fetchChannels();
      setSelectedChannelId(newChannel.id);
      setShowChannels(false);
      toast.success('Gruppo creato con successo');
    } catch {
      toast.error('Errore nella creazione del gruppo');
      setCreatingGroup(false);
    }
  };

  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-pw-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
        <AlertTriangle size={48} className="text-red-400" />
        <h2 className="text-xl font-semibold text-pw-text">Errore nel caricamento</h2>
        <p className="text-pw-text-muted max-w-md text-sm">Non è stato possibile caricare i dati. Riprova.</p>
        <button onClick={() => { setLoading(true); setError(false); fetchChannels(); }} className="px-4 py-2 rounded-xl bg-pw-accent text-[#0A263A] text-sm font-medium hover:bg-pw-accent-hover transition-colors duration-200 ease-out">Riprova</button>
      </div>
    );
  }

  const selectedChannel = channels.find((c) => c.id === selectedChannelId);
  const channelDisplayName = selectedChannel
    ? selectedChannel.type === 'team' || selectedChannel.type === 'project' || selectedChannel.type === 'group'
      ? selectedChannel.name
      : selectedChannel.members?.find((m) => m.user_id !== profile.id)?.profile?.full_name || 'Chat'
    : 'Chat';

  return (
    <div className="h-[calc(100vh-theme(spacing.14)-theme(spacing.8))] flex rounded-2xl border border-pw-border overflow-hidden bg-pw-surface animate-slide-up">
      {/* Channel list — desktop always, mobile toggle */}
      <div className={`w-72 border-r border-pw-border bg-pw-surface-2 shrink-0 ${
        showChannels ? 'block' : 'hidden lg:block'
      }`}>
        <div className="h-14 flex items-center px-4 border-b border-pw-border">
          <MessageCircle size={18} className="text-pw-accent mr-2" />
          <h2 className="text-sm font-[var(--font-syne)] font-semibold text-pw-text">Chat</h2>
        </div>
        <ChannelList
          channels={channels}
          teamMembers={teamMembers}
          selectedChannelId={selectedChannelId}
          currentUserId={profile.id}
          onSelectChannel={handleSelectChannel}
          onStartDirect={handleStartDirect}
          onCreateGroup={() => { setGroupName(''); setGroupMembers([]); setShowCreateGroup(true); }}
        />
      </div>

      {/* Messages area */}
      <div className={`flex-1 flex flex-col min-w-0 ${
        showChannels ? 'hidden lg:flex' : 'flex'
      }`}>
        {/* Channel header */}
        <div className="h-14 flex items-center gap-3 px-4 border-b border-pw-border shrink-0">
          <button
            onClick={() => setShowChannels(true)}
            className="lg:hidden p-2 rounded-lg text-pw-text-muted hover:bg-pw-surface-2"
          >
            <ArrowLeft size={18} />
          </button>
          {selectedChannel?.type === 'team' ? (
            <div className="w-8 h-8 rounded-full bg-pw-accent/20 flex items-center justify-center">
              <MessageCircle size={16} className="text-pw-accent" />
            </div>
          ) : selectedChannel?.type === 'project' ? (
            <div className="w-8 h-8 rounded-full bg-pw-red/20 flex items-center justify-center">
              <FolderKanban size={16} className="text-pw-red" />
            </div>
          ) : selectedChannel?.type === 'group' ? (
            <div className="w-8 h-8 rounded-full bg-pw-gold/20 flex items-center justify-center">
              <Users size={16} className="text-pw-gold" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-pw-navy flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">
                {channelDisplayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </span>
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-pw-text">{channelDisplayName}</p>
            {(selectedChannel?.type === 'team' || selectedChannel?.type === 'project' || selectedChannel?.type === 'group') && (
              <p className="text-[10px] text-pw-text-dim">
                {selectedChannel.members?.length || 0} membri
                {selectedChannel.type === 'project' && ' · Progetto'}
                {selectedChannel.type === 'group' && ' · Gruppo'}
              </p>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {showSearch ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cerca nei messaggi..."
                  className="w-48 px-3 py-1.5 rounded-lg border border-pw-border bg-pw-surface-2 text-pw-text text-xs focus:ring-2 focus:ring-pw-accent/30 outline-none"
                  autoFocus
                />
                <button
                  onClick={() => { setShowSearch(false); setSearchQuery(''); }}
                  className="p-1.5 rounded-lg text-pw-text-dim hover:text-pw-text hover:bg-pw-surface-2"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSearch(true)}
                className="p-2 rounded-lg text-pw-text-dim hover:text-pw-text hover:bg-pw-surface-2 transition-colors duration-200 ease-out"
                title="Cerca nei messaggi"
              >
                <Search size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        {selectedChannelId ? (
          <>
            <MessageList
              messages={searchQuery
                ? messages.filter((m) => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
                : messages
              }
              currentUserId={profile.id}
              loading={messagesLoading}
            />
            <MessageInput onSend={handleSendMessage} members={teamMembers} />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageCircle size={48} className="text-pw-text-dim mx-auto mb-3" />
              <p className="text-pw-text-muted text-sm">Seleziona una conversazione</p>
            </div>
          </div>
        )}
      </div>

      {/* Create group modal */}
      <Modal
        open={showCreateGroup}
        onClose={() => setShowCreateGroup(false)}
        title="Crea Gruppo"
      >
        <div className="space-y-4">
          <Input
            id="group-name"
            label="Nome del Gruppo *"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="es. Marketing, Sviluppo, Design..."
          />

          <div>
            <p className="text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted mb-3">
              Seleziona Membri *
            </p>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {teamMembers
                .filter((m) => m.id !== profile.id && m.is_active)
                .map((member) => {
                  const isSelected = groupMembers.includes(member.id);
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => toggleGroupMember(member.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ease-out ${
                        isSelected
                          ? 'bg-pw-accent/10 text-pw-accent'
                          : 'text-pw-text-muted hover:text-pw-text hover:bg-pw-surface-2'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-pw-accent' : 'bg-pw-surface-3'
                      }`}>
                        {isSelected ? (
                          <Check size={14} className="text-[#0A263A]" />
                        ) : (
                          <span className="text-pw-text-muted text-[9px] font-bold">{getInitials(member.full_name)}</span>
                        )}
                      </div>
                      <span className="font-medium">{member.full_name}</span>
                    </button>
                  );
                })}
            </div>
            {groupMembers.length > 0 && (
              <p className="text-xs text-pw-text-dim mt-2">
                {groupMembers.length} {groupMembers.length === 1 ? 'membro selezionato' : 'membri selezionati'} + te
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowCreateGroup(false)} className="flex-1">
              Annulla
            </Button>
            <Button
              onClick={handleCreateGroup}
              loading={creatingGroup}
              disabled={!groupName.trim() || groupMembers.length === 0}
              className="flex-1"
            >
              <Users size={16} />
              Crea Gruppo
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
