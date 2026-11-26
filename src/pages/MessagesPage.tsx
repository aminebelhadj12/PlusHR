import React, { useEffect, useRef, useState } from 'react';
import { Send, Paperclip, Reply, Pencil, Trash2, Search, MessageSquare, Circle } from 'lucide-react';
import { apiRequest } from '../services/api';
import { useApp } from '../contexts/AppContext';
import type { ChatMessage } from '../types';

interface Colleague {
  user_id: string;
  full_name: string;
  role_code: string;
  department_name: string;
  matricule: string | null;
}

interface ConversationSummary {
  id: string;
  peer_user_id: string | null;
  peer_name: string;
  peer_role: string;
  unread_count: number;
  last_message: ChatMessage | null;
}

export const MessagesPage: React.FC = () => {
  const { user, socket, addToast } = useApp();

  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [activeConvId, setActiveConvId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [colleagueFilter, setColleagueFilter] = useState('');

  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [typingPeer, setTypingPeer] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadWorkspace = async () => {
    try {
      const res = await apiRequest<{
        colleagues: Colleague[];
        conversations: ConversationSummary[];
        onlineUserIds: string[];
      }>('/api/messages/workspace');
      setColleagues(res.colleagues);
      setConversations(res.conversations);
      setOnlineUserIds(res.onlineUserIds);
      if (!activeConvId && res.conversations.length > 0) {
        openConversation(res.conversations[0].id);
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur chargement messagerie', 'error');
    }
  };

  const openConversation = async (convId: string) => {
    setActiveConvId(convId);
    setReplyTo(null);
    setEditingMsg(null);
    try {
      const res = await apiRequest<{ messages: ChatMessage[] }>(`/api/messages/conversations/${convId}`);
      setMessages(res.messages);
      setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c)));
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur ouverture discussion', 'error');
    }
  };

  useEffect(() => {
    loadWorkspace();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!socket) return;

    const onPresence = (payload: { onlineUserIds: string[] }) => {
      setOnlineUserIds(payload.onlineUserIds || []);
    };

    const onMessage = (msg: ChatMessage) => {
      if (msg.conversation_id === activeConvId) {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      }
      loadWorkspace();
    };

    const onUpdated = (msg: ChatMessage) => {
      if (msg.conversation_id === activeConvId) {
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
      }
    };

    const onTyping = (payload: { conversationId: string; userId: string; isTyping: boolean }) => {
      if (payload.conversationId === activeConvId && payload.userId !== user?.id) {
        setTypingPeer(payload.isTyping ? payload.userId : null);
      }
    };

    socket.on('presence:update', onPresence);
    socket.on('chat:message', onMessage);
    socket.on('chat:updated', onUpdated);
    socket.on('chat:typing', onTyping);

    return () => {
      socket.off('presence:update', onPresence);
      socket.off('chat:message', onMessage);
      socket.off('chat:updated', onUpdated);
      socket.off('chat:typing', onTyping);
    };
  }, [socket, activeConvId, user?.id]);

  const startPrivateChat = async (peerUserId: string) => {
    try {
      const res = await apiRequest<{ conversationId: string }>('/api/messages/conversations', {
        method: 'POST',
        body: JSON.stringify({ peerUserId }),
      });
      await loadWorkspace();
      await openConversation(res.conversationId);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Impossible de démarrer la discussion', 'error');
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConvId) return;

    if (editingMsg) {
      if (!draft.trim()) return;
      try {
        await apiRequest(`/api/messages/${editingMsg.id}`, {
          method: 'PUT',
          body: JSON.stringify({ content: draft.trim() }),
        });
        setEditingMsg(null);
        setDraft('');
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Erreur modification message', 'error');
      }
      return;
    }

    if (!draft.trim() && !attachment) return;
    try {
      const fd = new FormData();
      if (draft.trim()) fd.append('content', draft.trim());
      if (replyTo) fd.append('reply_to_message_id', replyTo.id);
      if (attachment) fd.append('attachment', attachment);

      const res = await apiRequest<{ message: ChatMessage }>(`/api/messages/conversations/${activeConvId}`, {
        method: 'POST',
        body: fd,
      });
      setMessages((prev) => (prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]));
      setDraft('');
      setAttachment(null);
      setReplyTo(null);
      socket?.emit('chat:typing', { conversationId: activeConvId, isTyping: false });
      loadWorkspace();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur envoi message', 'error');
    }
  };

  const handleDeleteMsg = async (msgId: string) => {
    try {
      await apiRequest(`/api/messages/${msgId}`, { method: 'DELETE' });
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur suppression', 'error');
    }
  };

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const filteredColleagues = colleagues.filter(
    (c) =>
      c.full_name.toLowerCase().includes(colleagueFilter.toLowerCase()) ||
      c.department_name.toLowerCase().includes(colleagueFilter.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Messagerie interne</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Échanges directs temps réel entre collaborateurs de votre entreprise
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-[calc(100vh-220px)] min-h-[500px]">
        {/* Left pane: conversations & colleagues */}
        <aside className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-200 dark:border-slate-800">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                value={colleagueFilter}
                onChange={(e) => setColleagueFilter(e.target.value)}
                placeholder="Rechercher un collègue…"
                className="w-full ps-9 pe-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {conversations.length > 0 && (
              <div className="p-2">
                <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Discussions récentes
                </div>
                {conversations.map((conv) => {
                  const isOnline = conv.peer_user_id ? onlineUserIds.includes(conv.peer_user_id) : false;
                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => openConversation(conv.id)}
                      className={`w-full text-start px-3 py-2.5 rounded-lg flex items-center justify-between gap-2 transition-colors ${
                        activeConvId === conv.id
                          ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Circle
                            className={`w-2 h-2 shrink-0 ${
                              isOnline ? 'fill-emerald-500 text-emerald-500' : 'fill-slate-300 text-slate-300 dark:fill-slate-600 dark:text-slate-600'
                            }`}
                          />
                          <span className="text-sm font-medium truncate">{conv.peer_name}</span>
                        </div>
                        {conv.last_message && (
                          <div className="text-xs text-slate-400 truncate mt-0.5 ps-4">{conv.last_message.content}</div>
                        )}
                      </div>
                      {conv.unread_count > 0 && (
                        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                          {conv.unread_count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="p-2">
              <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Annuaire interne ({filteredColleagues.length})
              </div>
              {filteredColleagues.map((col) => {
                const isOnline = onlineUserIds.includes(col.user_id);
                return (
                  <button
                    key={col.user_id}
                    type="button"
                    onClick={() => startPrivateChat(col.user_id)}
                    className="w-full text-start px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Circle
                          className={`w-2 h-2 shrink-0 ${
                            isOnline ? 'fill-emerald-500 text-emerald-500' : 'fill-slate-300 text-slate-300 dark:fill-slate-600 dark:text-slate-600'
                          }`}
                        />
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{col.full_name}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 ps-4 truncate">
                        {col.department_name} · {col.matricule || col.role_code}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Right pane: chat thread */}
        <section className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col overflow-hidden">
          {!activeConvId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400">
              <MessageSquare className="w-10 h-10 mb-2" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Sélectionnez un collègue pour démarrer une discussion privée
              </p>
            </div>
          ) : (
            <>
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <div className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                    {activeConv?.peer_name || 'Conversation'}
                  </div>
                  <div className="text-xs text-slate-400">
                    {activeConv?.peer_user_id && onlineUserIds.includes(activeConv.peer_user_id) ? 'En ligne' : 'Hors ligne'}
                    {typingPeer ? ' · En train d’écrire…' : ''}
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((m) => {
                  const isMine = m.sender_user_id === user?.id;
                  const parentMsg = m.reply_to_message_id ? messages.find((x) => x.id === m.reply_to_message_id) : null;
                  return (
                    <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`group max-w-[78%] rounded-xl px-4 py-2.5 text-sm ${
                          isMine
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100'
                        }`}
                      >
                        {parentMsg && (
                          <div
                            className={`text-[11px] mb-1.5 pb-1 border-b ${
                              isMine ? 'border-blue-400/40 text-blue-100' : 'border-slate-200 dark:border-slate-700 text-slate-500'
                            }`}
                          >
                            Réponse à : {parentMsg.content.slice(0, 60)}
                          </div>
                        )}
                        <p className={m.is_deleted ? 'italic opacity-70' : ''}>{m.content}</p>
                        {m.attachment && !m.is_deleted && (
                          <a
                            href={m.attachment.file_path}
                            target="_blank"
                            rel="noreferrer"
                            className={`mt-1.5 inline-flex items-center gap-1 text-xs underline ${
                              isMine ? 'text-blue-100' : 'text-blue-600 dark:text-blue-400'
                            }`}
                          >
                            <Paperclip className="w-3 h-3" />
                            {m.attachment.file_name}
                          </a>
                        )}
                        <div className="mt-1 flex items-center justify-between gap-3 text-[10px] opacity-75">
                          <span className="tabular-nums">
                            {new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            {m.is_edited && !m.is_deleted ? ' (modifié)' : ''}
                          </span>
                          {!m.is_deleted && (
                            <span className="inline-flex items-center gap-2">
                              <button type="button" onClick={() => setReplyTo(m)} title="Répondre">
                                <Reply className="w-3 h-3" />
                              </button>
                              {isMine && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingMsg(m);
                                      setDraft(m.content);
                                    }}
                                    title="Modifier"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button type="button" onClick={() => handleDeleteMsg(m.id)} title="Supprimer">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              {(replyTo || editingMsg) && (
                <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/70 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-300 truncate">
                    {editingMsg ? `Modification du message : "${editingMsg.content}"` : `Réponse à : "${replyTo?.content}"`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setReplyTo(null);
                      setEditingMsg(null);
                      setDraft('');
                    }}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    Annuler
                  </button>
                </div>
              )}

              <form onSubmit={handleSend} className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
                {!editingMsg && (
                  <label className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                    <Paperclip className="w-4 h-4" />
                    <input type="file" className="hidden" onChange={(e) => setAttachment(e.target.files?.[0] || null)} />
                  </label>
                )}
                <input
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    socket?.emit('chat:typing', { conversationId: activeConvId, isTyping: e.target.value.length > 0 });
                  }}
                  placeholder={attachment ? `Fichier prêt : ${attachment.name}` : 'Écrire un message…'}
                  className="flex-1 px-3.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
};
