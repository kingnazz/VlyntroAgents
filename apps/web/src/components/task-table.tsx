import { date } from '../api';
import type { Task, Agent } from '../types';
import {
  StatusBadge as Badge,
  AgentAvatar as Avatar,
  EmptyState as Empty,
} from './ui';
export function TaskTable({
  tasks,
  agents,
  onOpen,
}: {
  tasks: Task[];
  agents: Agent[];
  onOpen: (id: string) => void;
}) {
  const agentName = (id: string) =>
    agents.find((a) => a.id === id)?.display_name || 'Agent';
  return tasks.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Task</th>
            <th>Status</th>
            <th>Agent</th>
            <th>Priority</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} onClick={() => onOpen(t.id)}>
              <td>
                <button
                  className="row-title"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(t.id);
                  }}
                >
                  {t.title}
                </button>
                <span className="row-id">{t.id.slice(0, 8)}</span>
              </td>
              <td>
                <Badge status={t.status} />
              </td>
              <td>
                {t.assigned_agent_id ? (
                  <span className="inline-agent">
                    <Avatar name={agentName(t.assigned_agent_id)} />
                    {agentName(t.assigned_agent_id)}
                  </span>
                ) : (
                  <span className="muted">Unassigned</span>
                )}
              </td>
              <td>
                <span className={'priority p' + t.priority}>P{t.priority}</span>
              </td>
              <td className="muted nowrap">{date(t.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty title="No tasks in this view">
      Create a task or mention an agent in a channel to start work.
    </Empty>
  );
}
