'use client';
import { useState, useEffect } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { api, date, mutation } from '../api';
import type { Agent, Run, Task, User } from '../types';
import {
  PageHeader as PageHeading,
  StatusBadge as Badge,
  Panel,
  EmptyState as Empty,
  LoadingState,
  AgentAvatar,
} from '../components/ui';
import { RunTable } from '../components/run-table';

export function AgentView({
  id,
  runs,
  tasks,
  refresh,
  onRun,
  user,
}: {
  id: string;
  runs: Run[];
  tasks: Task[];
  refresh: () => Promise<void>;
  onRun: (id: string) => void;
  user: User;
}) {
  const [agent, setAgent] = useState<Agent | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    void api<Agent>('/agents/' + id)
      .then(setAgent)
      .catch((e) => setError(e.message));
  }, [id, runs]);
  async function toggle() {
    if (!agent) return;
    try {
      await api(
        '/agents/' + id,
        mutation(
          { status: agent.status === 'disabled' ? 'offline' : 'disabled' },
          'PATCH',
        ),
      );
      await refresh();
      setAgent(await api<Agent>('/agents/' + id));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!agent)
    return error ? (
      <p className="error" role="alert">
        {error}
      </p>
    ) : (
      <LoadingState label="Loading agent..." />
    );
  return (
    <>
      <PageHeading
        eyebrow="TEAM / AGENT PROFILE"
        title={agent.display_name}
        description={agent.description}
        action={
          <span className="agent-profile-identity">
            <AgentAvatar name={agent.display_name} large />
            <Badge status={agent.status} />
          </span>
        }
      />
      {error && <p className="error">{error}</p>}
      <div className="overview-grid">
        <Panel title="Runtime configuration">
          <div className="settings-row">
            <span>Provider</span>
            <b>{agent.provider ?? agent.agent_type}</b>
          </div>
          <div className="settings-row">
            <span>Model</span>
            <code>{agent.model ?? 'Configured local executable'}</code>
          </div>
          <div className="settings-row">
            <span>Current work</span>
            <span>
              {tasks.find(
                (t) => t.assigned_agent_id === id && t.status === 'running',
              )?.title ?? 'No active task'}
            </span>
          </div>
          <div className="settings-row">
            <span>Availability</span>
            <span>
              {agent.status === 'offline'
                ? 'Provider or command is unconfigured'
                : agent.status === 'error'
                  ? 'Recent execution failed. Inspect runs.'
                  : 'Managed by the persistent worker'}
            </span>
          </div>
          {['owner', 'admin'].includes(user.role) && (
            <div className="settings-row">
              <span>Agent control</span>
              <button className="secondary" onClick={toggle}>
                {agent.status === 'disabled' ? 'Enable agent' : 'Disable agent'}
              </button>
            </div>
          )}
        </Panel>
        <Panel title="Permissions">
          <div className="permissions">
            {agent.permissions?.map((p, i) => (
              <div key={i}>
                <code>{p.permission}</code>
                <small>{p.namespace_id ?? 'Workspace scope'}</small>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <RunTable
        runs={runs.filter((r) => r.agent_id === id)}
        agents={[agent]}
        onRun={onRun}
      />
      <Panel title="Recent messages">
        {agent.recent_messages?.length ? (
          agent.recent_messages.map((message) => (
            <article key={message.id} className="agent-message">
              <header>
                <time>{date(message.created_at)}</time>
                <a href={'/?view=channel&id=' + message.channel_id}>
                  Open channel <ArrowUpRight size={12} />
                </a>
              </header>
              <p>{message.body}</p>
            </article>
          ))
        ) : (
          <Empty title="No messages yet">
            Responses from this agent will appear here after channel work.
          </Empty>
        )}
      </Panel>
      <Panel title="Safe configuration">
        <pre className="payload">
          {JSON.stringify(agent.configuration, null, 2)}
        </pre>
      </Panel>
    </>
  );
}
