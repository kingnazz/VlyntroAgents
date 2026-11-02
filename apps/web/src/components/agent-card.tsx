import { ArrowUpRight } from 'lucide-react';
import type { Agent } from '../types';
import { date } from '../api';
import { AgentAvatar, StatusBadge } from './ui';
export function AgentCard({
  agent: a,
  onOpen,
}: {
  agent: Agent;
  onOpen: () => void;
}) {
  return (
    <button className="agent-card" onClick={onOpen}>
      <AgentAvatar name={a.display_name} />
      <span className="agent-card-identity">
        <strong>{a.display_name}</strong>
        <small>{a.role_description}</small>
      </span>
      <StatusBadge status={a.status} />
      <span className="agent-card-work">
        {a.current_task ||
          (a.status === 'offline'
            ? 'Awaiting connection'
            : a.status === 'disabled'
              ? 'Paused by operator'
              : 'Standing by')}
      </span>
      <span className="agent-card-activity">
        {a.last_activity
          ? 'Last active ' + date(a.last_activity)
          : 'No activity yet'}
      </span>
      <ArrowUpRight size={15} />
    </button>
  );
}
