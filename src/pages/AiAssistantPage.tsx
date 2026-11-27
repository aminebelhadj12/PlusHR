import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, Copy, LoaderCircle, MessageSquare, PanelLeft, Pencil, Plus, Search, Send, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Modal } from '../components/ui/ConfirmModal';
import { useApp } from '../contexts/AppContext';
import { apiRequest, apiStream } from '../services/api';
import { assistantCopy, assistantSuggestions } from '../utils/aiAssistantCopy';
import './AiAssistantPage.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}
interface Conversation {
  id: string;
  title: string;
  archived: boolean;
}
type ChatEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; conversationId: string; answer: string; usedGemini: boolean }
  | { type: 'error'; error: string };

const symbol = new URL('../assets/brand/logo.png', import.meta.url).href;
const route = '/api/ai/conversations';
const iconButton = 'grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800';
const markdownComponents: Components = {
  a: ({ children }) => <span>{children}</span>,
  table: ({ children }) => <div className="ai-markdown-scroll" tabIndex={0}><table>{children}</table></div>,
  pre: ({ children }) => <pre className="ai-markdown-scroll" tabIndex={0} dir="ltr">{children}</pre>,
};

function AssistantIcon({ large = false }: { large?: boolean }) {
  return <img src={symbol} alt="" width={1312} height={1199} className={large ? 'ai-welcome-icon' : 'ai-message-icon'} />;
}

export function AiAssistantPage() {
  const { user, lang, addToast } = useApp();
  const copy = assistantCopy[lang];
  const historyId = useId();
  const questionId = useId();
  const [history, setHistory] = useState<Conversation[]>([]);
  const [query, setQuery] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [opening, setOpening] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);
  const [localResponse, setLocalResponse] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<{ type: 'rename' | 'delete'; conversation: Conversation } | null>(null);
  const [title, setTitle] = useState('');
  const [updating, setUpdating] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const transcript = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const request = useRef<AbortController | null>(null);
  const detail = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setHistoryLoading(true);
    setLoadError(false);
    const timer = window.setTimeout(() => {
      const search = new URLSearchParams({ summary: '1', q: query.trim() });
      void apiRequest<{ conversations: Conversation[] }>(route + '?' + search, { signal: controller.signal })
        .then((data) => { if (!controller.signal.aborted) setHistory(data.conversations); })
        .catch(() => { if (!controller.signal.aborted) setLoadError(true); })
        .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    }, query ? 180 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, revision]);

  useEffect(() => () => {
    request.current?.abort();
    detail.current?.abort();
  }, []);

  useLayoutEffect(() => {
    if (followLatest.current && transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [messages, sending]);

  function newChat() {
    detail.current?.abort();
    followLatest.current = true;
    setSelected(null);
    setOpening(false);
    setMessages([]);
    setQuestion('');
    setError('');
    setLocalResponse(false);
    setHistoryOpen(false);
  }

  async function openConversation(conversation: Conversation) {
    detail.current?.abort();
    const controller = new AbortController();
    detail.current = controller;
    followLatest.current = true;
    setOpening(true);
    setSelected(conversation);
    setMessages([]);
    setError('');
    setLocalResponse(false);
    setHistoryOpen(false);
    try {
      const data = await apiRequest<{ conversation: Conversation & { messages: Message[] } }>(
        route + '/' + encodeURIComponent(conversation.id), { signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      setSelected(data.conversation);
      setMessages(data.conversation.messages);
    } catch {
      if (!controller.signal.aborted) {
        setSelected(null);
        setError(copy.error);
      }
    } finally {
      if (!controller.signal.aborted) setOpening(false);
    }
  }

  async function send(prompt = question) {
    const value = prompt.trim();
    if (!value || request.current || opening || selected?.archived) return;
    const controller = new AbortController();
    const assistantId = 'assistant-' + Date.now();
    request.current = controller;
    followLatest.current = true;
    setQuestion('');
    setError('');
    setLocalResponse(false);
    setSending(true);
    setMessages((prev) => [...prev, { id: 'user-' + Date.now(), role: 'user', content: value },
      { id: assistantId, role: 'assistant', content: '' }]);
    let finished = false;
    try {
      await apiStream<ChatEvent>('/api/ai/chat', {
        method: 'POST', signal: controller.signal,
        body: JSON.stringify({ question: value, lang, conversationId: selected?.id }),
      }, (event) => {
        if (event.type === 'error') throw new Error(event.error);
        setMessages((prev) => prev.map((message) => message.id !== assistantId ? message : {
          ...message, content: event.type === 'delta' ? message.content + event.text : event.answer,
        }));
        if (event.type === 'done') {
          finished = true;
          setSelected((current) => current ?? { id: event.conversationId, title: value.slice(0, 60), archived: false });
          setLocalResponse(!event.usedGemini);
          setRevision((prev) => prev + 1);
        }
      });
      if (!finished) throw new Error('Incomplete assistant response');
    } catch {
      if (!controller.signal.aborted) {
        setError(copy.error);
        setMessages(messages);
        setQuestion(value);
      }
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setSending(false);
    }
  }

  async function updateConversation(event: React.FormEvent) {
    event.preventDefault();
    if (!dialog || updating) return;
    const { type, conversation } = dialog;
    const url = route + '/' + encodeURIComponent(conversation.id);
    setUpdating(true);
    setDialogError('');
    try {
      if (type === 'delete') {
        await apiRequest(url, { method: 'DELETE' });
        if (selected?.id === conversation.id) newChat();
      } else {
        const result = await apiRequest<{ conversation: Conversation }>(url, {
          method: 'PATCH', body: JSON.stringify({ title: title.trim() }),
        });
        setSelected((active) => active?.id === conversation.id ? { ...active, title: result.conversation.title } : active);
      }
      setRevision((prev) => prev + 1);
      setDialog(null);
    } catch {
      setDialogError(copy.error);
    } finally {
      setUpdating(false);
    }
  }

  async function copyMessage(message: Message) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      addToast(copy.copied, 'success');
    } catch {
      addToast(copy.copyError, 'error');
    }
  }

  const disabled = sending || opening || Boolean(selected?.archived);

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-bold text-slate-950 dark:text-white">{copy.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setHistoryOpen(!historyOpen)} aria-controls={historyId} aria-expanded={historyOpen}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 lg:hidden">
            <PanelLeft className="size-4" aria-hidden="true" />{copy.history}
          </button>
          <button type="button" onClick={newChat} disabled={sending}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            <Plus className="size-4" aria-hidden="true" />{copy.newChat}
          </button>
        </div>
      </header>

      <div className="conversation-layout grid grid-cols-1 gap-3 lg:grid-rows-1">
        <aside id={historyId} aria-label={copy.history}
          className={'conversation-sidebar min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:flex ' + (historyOpen ? 'flex' : 'hidden')}>
          <div className="border-b border-slate-200 p-3 dark:border-slate-800">
            <h2 className="mb-2 text-sm font-semibold">{copy.history}</h2>
            <div className="relative">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
              <input type="search" aria-label={copy.search} placeholder={copy.search} maxLength={100} value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pe-2 ps-8 text-sm dark:border-slate-700 dark:bg-slate-800" />
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-2">
            {loadError && <p role="alert" className="p-2 text-sm text-red-700 dark:text-red-300">{copy.error}</p>}
            {!loadError && history.length === 0 && (
              <p role="status" className="p-2 text-sm text-slate-500">{historyLoading ? copy.loading : query.trim() ? copy.noResults : copy.empty}</p>
            )}
            {history.map((conversation) => {
              const active = selected?.id === conversation.id;
              return (
                <div key={conversation.id} className={'flex min-w-0 items-center rounded-lg ' + (active ? 'bg-blue-50 dark:bg-blue-950/50' : 'hover:bg-slate-50 dark:hover:bg-slate-800')}>
                  <button type="button" disabled={sending} aria-current={active ? 'true' : undefined}
                    onClick={() => void openConversation(conversation)} title={conversation.title}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg p-2 text-start text-sm">
                    <MessageSquare className="size-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                    <span dir="auto" className="truncate">{conversation.title}</span>
                  </button>
                  <button type="button" disabled={sending} className={iconButton} aria-label={copy.rename} title={copy.rename}
                    onClick={() => { setTitle(conversation.title); setDialogError(''); setDialog({ type: 'rename', conversation }); }}>
                    <Pencil className="size-4" aria-hidden="true" />
                  </button>
                  <button type="button" disabled={sending} className={iconButton} aria-label={copy.delete} title={copy.delete}
                    onClick={() => { setDialogError(''); setDialog({ type: 'delete', conversation }); }}>
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        </aside>

        <section aria-label={copy.title} className="conversation-content flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div ref={transcript} className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            onScroll={(event) => { const pane = event.currentTarget; followLatest.current = pane.scrollHeight - pane.clientHeight - pane.scrollTop < 72; }}>
            <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 px-3 py-4 sm:px-6">
              {opening && <p role="status" className="m-auto text-sm text-slate-500">{copy.loading}</p>}
              {!opening && selected?.archived && <p role="status" className="m-auto max-w-sm text-center text-sm text-slate-600 dark:text-slate-300">{copy.archived}</p>}
              {!opening && !selected?.archived && messages.length === 0 && !error && (
                <div className="m-auto w-full max-w-lg py-4 text-center">
                  <AssistantIcon large />
                  <h2 className="mt-3 font-display text-xl font-bold">{copy.welcome}</h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{copy.intro}</p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {assistantSuggestions(user?.role_code, lang).map((suggestion) => (
                      <button key={suggestion} type="button" onClick={() => void send(suggestion)}
                        className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-start text-sm hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:hover:bg-blue-950/50">
                        <Sparkles className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((message) => message.role === 'user' ? (
                <div key={message.id} dir="auto" className="max-w-[88%] self-end whitespace-pre-wrap rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-950 dark:bg-blue-950/60 dark:text-blue-100">{message.content}</div>
              ) : (
                <article key={message.id} className="flex min-w-0 items-start gap-2 sm:gap-3">
                  <AssistantIcon />
                  <div className="min-w-0 flex-1">
                    {message.content ? (
                      <div dir="auto" className="ai-markdown text-slate-800 dark:text-slate-100">
                        <Markdown skipHtml disallowedElements={['img']} remarkPlugins={[remarkGfm]} components={markdownComponents}>{message.content}</Markdown>
                      </div>
                    ) : (
                      <div role="status" className="flex items-center gap-2 py-2 text-sm text-slate-600 dark:text-slate-300">
                        <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" />{copy.thinking}
                      </div>
                    )}
                    {message.content && !(sending && messages.at(-1)?.id === message.id) && (
                      <button type="button" className={iconButton} aria-label={copy.copy} title={copy.copy} onClick={() => void copyMessage(message)}>
                        {copiedId === message.id ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {sending && messages.at(-1)?.content && (
                <span role="status" className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="size-2 rounded-full bg-blue-500 motion-safe:animate-pulse" aria-hidden="true" />{copy.streaming}
                </span>
              )}
              {localResponse && <p className="text-xs text-slate-500">{copy.local}</p>}
              {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
            </div>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); void send(); }}
            className="shrink-0 border-t border-slate-200 px-3 py-2 dark:border-slate-800 sm:px-5">
            <div className="mx-auto max-w-3xl">
              <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-slate-50 p-2 focus-within:border-blue-500 dark:border-slate-700 dark:bg-slate-800/70">
                <label htmlFor={questionId} className="sr-only">{copy.input}</label>
                <textarea id={questionId} rows={2} maxLength={1200} value={question} disabled={Boolean(selected?.archived)}
                  onChange={(event) => setQuestion(event.target.value)} placeholder={copy.input}
                  className="min-w-0 flex-1 resize-none bg-transparent px-2 py-1 text-base outline-none sm:text-sm"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      if (!disabled) void send();
                    }
                  }} />
                <button type="submit" aria-label={copy.send} title={copy.send} disabled={disabled || !question.trim()}
                  className="grid size-10 shrink-0 place-items-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-45">
                  <Send className="size-4" aria-hidden="true" />
                </button>
              </div>
              <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <ShieldCheck className="size-3.5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />{copy.privacy}
              </p>
            </div>
          </form>
        </section>
      </div>

      <Modal open={Boolean(dialog)} title={dialog?.type === 'rename' ? copy.rename : copy.delete}
        onClose={() => { if (!updating) setDialog(null); }} maxWidth="max-w-md">
        <form onSubmit={updateConversation} className="space-y-3">
          {dialog?.type === 'rename' ? (
            <input aria-label={copy.rename} value={title} maxLength={100} required autoFocus onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-transparent p-2 dark:border-slate-700" />
          ) : <p className="text-sm">{copy.deletePrompt}</p>}
          {dialogError && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{dialogError}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" disabled={updating} className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700" onClick={() => setDialog(null)}>{copy.cancel}</button>
            <button type="submit" disabled={updating || (dialog?.type === 'rename' && !title.trim())}
              className={'rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 ' + (dialog?.type === 'delete' ? 'bg-red-700' : 'bg-blue-600')}>
              {dialog?.type === 'delete' ? copy.delete : copy.save}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
