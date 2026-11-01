import { ArrowUpRight, ListTodo, Zap } from 'lucide-react';
import { time } from '../api';
import type { Message } from '../types';
import { AgentAvatar } from './ui';
export function MessageItem({
  message: m,
  name,
  timeLabel,
}: {
  message: Message;
  name: string;
  timeLabel?: string;
}) {
  const event = String(m.metadata.event_type ?? m.metadata.action ?? '');
  const tone = event.includes('approval')
    ? 'waiting'
    : event.includes('completed')
      ? 'success'
      : m.sender_type === 'user'
        ? 'human'
        : m.sender_type === 'agent'
          ? 'agent'
          : 'neutral';
  return (
    <article className={'message tone-' + tone}>
      <AgentAvatar name={name} actorType={m.sender_type} />
      <div>
        <header>
          <b>{name}</b>
          <span className="message-kind">
            {m.sender_type === 'user' ? 'human' : m.sender_type}
          </span>
          <time dateTime={m.created_at}>{timeLabel ?? time(m.created_at)}</time>
        </header>
        <p>
          {m.body
            .split(/(@(?:ChatGPT|Muse|Codex|Grokbot)\b)/g)
            .map((part, i) =>
              /^@(?:ChatGPT|Muse|Codex|Grokbot)$/.test(part) ? (
                <span key={i} className="mention-token">
                  {part}
                </span>
              ) : (
                part
              ),
            )}
        </p>
        {typeof m.metadata.task_id === 'string' && (
          <a
            className="message-link"
            href={'/app?view=task&id=' + m.metadata.task_id}
          >
            <ListTodo size={12} />
            Linked task
            <ArrowUpRight size={12} />
          </a>
        )}
        {typeof m.metadata.run_id === 'string' && (
          <a
            className="message-link"
            href={'/app?view=run&id=' + m.metadata.run_id}
          >
            <Zap size={12} />
            Linked run
            <ArrowUpRight size={12} />
          </a>
        )}
      </div>
    </article>
  );
}
