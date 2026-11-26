import React, { useEffect, useRef, useState } from 'react';
import { Bot, Send, Plus, ShieldCheck, Sparkles, MessageSquare } from 'lucide-react';
import { apiRequest } from '../services/api';
import { useApp } from '../contexts/AppContext';

interface AiMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface AiConv {
  id: string;
  title: string;
  created_at: string;
  messages: AiMsg[];
}

export const AiAssistantPage: React.FC = () => {
  const { user, lang, addToast } = useApp();
  const [conversations, setConversations] = useState<AiConv[]>([]);
  const [activeConvId, setActiveConvId] = useState<string>('');
  const [messages, setMessages] = useState<AiMsg[]>([]);
  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadConversations = async () => {
    try {
      const res = await apiRequest<{ conversations: AiConv[] }>('/api/ai/conversations');
      setConversations(res.conversations);
      if (res.conversations.length > 0 && !activeConvId) {
        setActiveConvId(res.conversations[0].id);
        setMessages(res.conversations[0].messages);
      }
    } catch {
      // ignore initial empty
    }
  };

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const suggestedPrompts =
    user?.role_code === 'EMPLOYEE'
      ? [
          'Quel est mon solde de congés actuel ?',
          'Combien de jours de présence et retards ai-je ce mois-ci ?',
          'Résume mes tâches en cours et mes prochaines réunions.',
        ]
      : user?.role_code === 'SUPER_ADMIN'
      ? [
          'Quel est le statut global de la plateforme et des entreprises ?',
          'Y a-t-il des incidents techniques ouverts ?',
        ]
      : [
          'Quels employés ont un contrat qui expire bientôt ?',
          'Résume les demandes de congés et sorties en attente de validation.',
          'Quels départements présentent un risque de surcharge cette semaine ?',
        ];

  const handleSelectConv = (conv: AiConv) => {
    setActiveConvId(conv.id);
    setMessages(conv.messages);
  };

  const handleNewChat = () => {
    setActiveConvId('');
    setMessages([]);
  };

  const handleSend = async (promptText?: string) => {
    const q = (promptText ?? question).trim();
    if (!q || sending) return;

    const tempUserMsg: AiMsg = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      content: q,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    if (!promptText) setQuestion('');
    setSending(true);

    try {
      const res = await apiRequest<{
        conversationId: string;
        answer: string;
        usedGemini: boolean;
        notice: string | null;
      }>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          question: q,
          lang,
          conversationId: activeConvId || undefined,
        }),
      });

      setActiveConvId(res.conversationId);
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          content: res.answer,
          created_at: new Date().toISOString(),
        },
      ]);
      loadConversations();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erreur assistant IA', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">+HR AI Assistant</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Assistant RH intelligent strictement cloisonné par entreprise et permissions de rôle ({user?.role_code.replace('_', ' ')})
          </p>
        </div>

        <button
          type="button"
          onClick={handleNewChat}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
        >
          <Plus className="w-4 h-4" />
          Nouvelle conversation
        </button>
      </div>

      <div className="bg-blue-50/70 dark:bg-blue-950/25 border border-blue-200 dark:border-blue-800 rounded-xl p-3.5 flex items-center gap-3 text-xs text-blue-900 dark:text-blue-200">
        <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
        <span>
          Protection RBAC active : l’assistant répond uniquement à partir des données autorisées pour votre rôle et votre entreprise (aucune donnée salariale individuelle ou confidentielle n’est exposée).
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-[calc(100vh-270px)] min-h-[480px]">
        {/* History sidebar */}
        <aside className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Historique ({conversations.length})
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {conversations.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">Aucune discussion enregistrée</div>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelectConv(c)}
                  className={`w-full text-start px-4 py-3 text-xs transition-colors flex items-start gap-2.5 ${
                    activeConvId === c.id
                      ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 font-medium'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="line-clamp-2">{c.title}</span>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Chat panel */}
        <section className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-4">
                <div className="w-12 h-12 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Bot className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                    Comment puis-je vous aider aujourd’hui ?
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Posez une question en français, anglais ou arabe sur vos indicateurs RH autorisés.
                  </p>
                </div>
                <div className="w-full space-y-2 pt-2">
                  {suggestedPrompts.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSend(p)}
                      className="w-full text-start px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-500 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>{p}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[82%] rounded-xl px-4 py-3 text-sm whitespace-pre-line leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))
            )}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-xl px-4 py-2.5 text-xs">
                  Analyse des données autorisées en cours…
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Posez votre question RH à +HR AI Assistant…"
              className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
            />
            <button
              type="submit"
              disabled={sending || !question.trim()}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Envoyer</span>
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};
