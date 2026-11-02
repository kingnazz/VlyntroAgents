import {
  ArrowUpRight,
  Check,
  Plus,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import type { Agent, Approval, Task, Run, Event, Health } from '../types';
import { AgentCard } from '../components/agent-card';
import { EventList } from '../components/activity-list';
import { TaskTable } from '../components/task-table';
import { EmptyState, PageHeader, Panel, StatusBadge } from '../components/ui';
import { Mascot } from '../brand/Mascot';
export function CommandCenter({
  agents,
  tasks,
  approvals,
  runs,
  events,
  health,
  connected,
  onNavigate,
  onNewTask,
}: {
  agents: Agent[];
  tasks: Task[];
  approvals: Approval[];
  runs: Run[];
  events: Event[];
  health: Health | null;
  connected: boolean;
  onNavigate: (view: string, id?: string) => void;
  onNewTask: () => void;
}) {
  const pending = approvals.filter((a) => a.status === 'pending'),
    active = tasks.filter((t) =>
      ['running', 'queued', 'in_review'].includes(t.status),
    ),
    failed = runs.filter((r) => r.status === 'failed'),
    completed = tasks.filter((t) => t.status === 'completed'),
    running = agents.filter((a) => ['running', 'busy'].includes(a.status)),
    healthy = health?.status === 'healthy' && connected;
  const agentName = (id: string) =>
    agents.find((a) => a.id === id)?.display_name || 'Agent';
  const link = (label: string, view: string) => (
    <button className="text-button" onClick={() => onNavigate(view)}>
      {label}
      <ArrowUpRight size={14} />
    </button>
  );
  return (
    <>
      <PageHeader
        eyebrow="VLYNTRO / AGENT OPERATIONS"
        title="Command Center"
        description={
          running.length
            ? `${running.length} agents at work. Here’s what needs your attention.`
            : 'Your team is standing by. Keep work moving from here.'
        }
        action={
          <button className="primary" onClick={onNewTask}>
            <Plus size={16} />
            New task
          </button>
        }
      />
      <div className="operations-summary">
        <span>
          <span className={'dot ' + (healthy ? 'green' : 'amber')} />
          {healthy ? 'Systems healthy' : 'Check system health'}
        </span>
        <span>
          <b>{running.length}</b> running agents
        </span>
        <span>
          <b>{active.length}</b> work in progress
        </span>
        <button onClick={() => onNavigate('approvals')}>
          <b>{pending.length}</b> waiting on you
          <ArrowUpRight size={13} />
        </button>
      </div>
      <div className="command-grid">
        <div className="command-main">
          <Panel title="Work in progress" aside={link('All tasks', 'tasks')}>
            {active.length ? (
              <TaskTable
                tasks={active.slice(0, 5)}
                agents={agents}
                onOpen={(id) => onNavigate('task', id)}
              />
            ) : (
              <div className="standby-state">
                <Mascot size={68} track={false} />
                <div>
                  <h3>Agents are standing by.</h3>
                  <p>Create a task or mention an agent in a channel.</p>
                </div>
              </div>
            )}
          </Panel>
          <Panel title="Agent roster" aside={link('View team', 'agents')}>
            <div className="agent-roster">
              {agents.map((a) => (
                <AgentCard
                  key={a.id}
                  agent={a}
                  onOpen={() => onNavigate('agent', a.id)}
                />
              ))}
            </div>
          </Panel>
        </div>
        <div className="command-aside">
          <Panel
            title="Waiting on you"
            className={
              pending.length ? 'approval-panel has-pending' : 'approval-panel'
            }
            aside={
              <span className="subtle-count">{pending.length} pending</span>
            }
          >
            {pending.length ? (
              <div className="compact-approvals">
                {pending.slice(0, 3).map((a) => (
                  <button
                    key={a.id}
                    onClick={() => onNavigate('approvals', a.id)}
                  >
                    <span className="eyebrow">
                      {agentName(a.requested_by_agent_id)} REQUESTED REVIEW
                    </span>
                    <strong>{a.title}</strong>
                    <p>
                      {a.description ||
                        'Review this action before it goes ahead.'}
                    </p>
                    <span className="text-button">
                      Review request
                      <ArrowUpRight size={14} />
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<ShieldCheck size={23} />}
                title="Nothing waiting on you."
              >
                Human decisions will land here.
              </EmptyState>
            )}
          </Panel>
          <Panel
            title="Failed work"
            aside={<span className="subtle-count">{failed.length} runs</span>}
          >
            {failed.length ? (
              <div className="failure-list">
                {failed.slice(0, 3).map((r) => (
                  <button key={r.id} onClick={() => onNavigate('run', r.id)}>
                    <TriangleAlert size={17} />
                    <span>
                      <strong>{agentName(r.agent_id)}</strong>
                      <small>
                        {r.error ||
                          'Execution failed. Open the run for details.'}
                      </small>
                    </span>
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="quiet-state">
                <Check size={18} />
                <div>
                  <strong>Everything looks clean.</strong>
                  <p>No failed runs in recent history.</p>
                </div>
              </div>
            )}
          </Panel>
          <Panel
            title="System health"
            aside={<StatusBadge status={health?.status ?? 'degraded'} />}
          >
            {[
              [
                'Database',
                health?.database === 'connected' ? 'Connected' : 'Unavailable',
              ],
              [
                'Worker',
                health?.worker.healthy
                  ? 'Heartbeat received'
                  : 'Heartbeat missing',
              ],
              ['Live updates', connected ? 'Connected' : 'Reconnecting'],
            ].map(([label, value]) => (
              <div className="health-row" key={label}>
                <span>{label}</span>
                <span>
                  <span
                    className={
                      'dot ' +
                      ([
                        'Unavailable',
                        'Heartbeat missing',
                        'Reconnecting',
                      ].includes(value)
                        ? 'amber'
                        : 'green')
                    }
                  />
                  {value}
                </span>
              </div>
            ))}
          </Panel>
        </div>
      </div>
      <Panel title="Recently completed" aside={link('All tasks', 'tasks')}>
        {completed.length ? (
          <TaskTable
            tasks={completed.slice(0, 4)}
            agents={agents}
            onOpen={(id) => onNavigate('task', id)}
          />
        ) : (
          <div className="panel-note">
            Finished work will appear here, ready to pick up.
          </div>
        )}
      </Panel>
      <Panel title="Recent activity" aside={link('Open log', 'activity')}>
        <EventList events={events.slice(0, 5)} />
      </Panel>
    </>
  );
}
