'use client';
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type FormEvent,
} from 'react';
import { Hash, ShieldCheck, Send } from 'lucide-react';
import { api, mutation } from '../api';
import type { Channel, Event, User, Agent, Message } from '../types';
import { EmptyState as Empty, LoadingState } from '../components/ui';
import { MessageItem } from '../components/message-item';

export function ChannelView({
  channel,
  events,
  user,
  agents,
  onError,
}: {
  channel: Channel;
  events: Event[];
  user: User;
  agents: Agent[];
  onError: (message: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]),
    [body, setBody] = useState(''),
    [busy, setBusy] = useState(false),
    [history, setHistory] = useState(false),
    [ready, setReady] = useState(false);
  const bottom = useRef<HTMLDivElement>(null),
    key = useRef<string | null>(null);
  const load = useCallback(async () => {
    try {
      const rows = await api<Message[]>(
        '/channels/' + channel.id + '/messages?limit=60',
      );
      setMessages(rows.reverse());
      setReady(true);
    } catch (e) {
      onError((e as Error).message);
    }
  }, [channel.id, onError]);
  useEffect(() => {
    setMessages([]);
    setReady(false);
    void load();
  }, [load]);
  useEffect(() => {
    void load();
  }, [events, load]);
  useEffect(() => {
    bottom.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
      block: 'end',
    });
  }, [messages.length]);
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    key.current ??= crypto.randomUUID();
    try {
      await api(
        '/channels/' + channel.id + '/messages',
        mutation({ body, idempotency_key: key.current }),
      );
      setBody('');
      key.current = null;
      await load();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function older() {
    if (!messages.length) return;
    setHistory(true);
    try {
      const rows = await api<Message[]>(
        '/channels/' +
          channel.id +
          '/messages?limit=60&before=' +
          messages[0].id,
      );
      setMessages((m) => [...rows.reverse(), ...m]);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setHistory(false);
    }
  }
  return (
    <div className="channel-workroom">
      <div className="channel-heading">
        <div>
          <h1>
            <Hash size={23} />
            {channel.name}
          </h1>
          <p>{channel.description}</p>
        </div>
        <span className="channel-members">HUMANS + AGENTS</span>
      </div>
      <div className="channel-notice">
        <ShieldCheck size={15} />
        <span>
          This is a shared workroom. Mention an agent to create a job.
          Publishing always needs human approval.
        </span>
      </div>
      <div className="messages" aria-live="polite">
        {!ready ? (
          <LoadingState label="Loading messages..." />
        ) : !messages.length ? (
          <Empty icon={<Hash size={28} />} title="Start the conversation.">
            Share context, ask a question, or mention @ChatGPT to begin the
            content workflow.
          </Empty>
        ) : (
          <>
            <button className="load-older" onClick={older} disabled={history}>
              {history ? 'Loading...' : 'Load earlier messages'}
            </button>
            {messages.map((m) => (
              <MessageItem
                key={m.id}
                message={m}
                name={
                  m.sender_name ||
                  (m.sender_type === 'user'
                    ? user.display_name
                    : agents.find((a) => a.id === m.sender_id)?.display_name ||
                      'System')
                }
              />
            ))}
          </>
        )}
        <div ref={bottom} />
      </div>
      <form className="composer" onSubmit={send}>
        <label className="sr-only" htmlFor="message">
          Message {channel.name}
        </label>
        <textarea
          id="message"
          placeholder={
            'Message #' + channel.name.toLowerCase().replaceAll(' ', '-')
          }
          value={body}
          maxLength={12000}
          onChange={(e) => {
            setBody(e.target.value);
            key.current = null;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(e);
            }
          }}
        />
        <div className="composer-tools">
          <div className="mention-tools">
            {agents
              .filter((a) => a.agent_type !== 'system')
              .map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setBody((b) => b + '@' + a.display_name + ' ')}
                >
                  @{a.display_name}
                </button>
              ))}
          </div>
          <button
            className="primary send-button"
            disabled={busy || !body.trim()}
            aria-label="Send message"
          >
            <Send size={15} />
            <span>{busy ? 'Sending' : 'Send'}</span>
          </button>
        </div>
        <p>
          Enter to send <span>·</span> Shift + Enter for a new line
        </p>
      </form>
    </div>
  );
}
