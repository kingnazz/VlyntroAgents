'use client';
import { useState, useEffect, useCallback } from 'react';
import { api, date, mutation } from '../api';
import type { Task, Agent, User } from '../types';
import {
  PageHeader as PageHeading,
  StatusBadge as Badge,
  Panel,
  LoadingState,
} from '../components/ui';
import { RunTable } from '../components/run-table';
import { ArtifactCard } from '../components/artifact-card';
import { EventList } from '../components/activity-list';

export function TaskView({
  id,
  agents,
  refresh,
  user,
  onRun,
}: {
  id: string;
  agents: Agent[];
  refresh: () => Promise<void>;
  user: User;
  onRun: (id: string) => void;
}) {
  const [task, setTask] = useState<Task | null>(null),
    [error, setError] = useState('');
  const load = useCallback(
    () =>
      api<Task>('/tasks/' + id)
        .then(setTask)
        .catch((e) => setError(e.message)),
    [id],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function status(value: string) {
    try {
      await api('/tasks/' + id, mutation({ status: value }, 'PATCH'));
      await load();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!task)
    return error ? (
      <p className="error" role="alert">
        {error}
      </p>
    ) : (
      <LoadingState label="Loading task..." />
    );
  return (
    <>
      <PageHeading
        eyebrow={'WORK / ' + id.slice(0, 8)}
        title={task.title}
        description={task.description || 'No additional description.'}
        action={<Badge status={task.status} />}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Panel title="Task details">
        <div className="settings-row">
          <span>Assigned agent</span>
          <span>
            {agents.find((a) => a.id === task.assigned_agent_id)
              ?.display_name ?? 'Unassigned'}
          </span>
          <span>Priority {task.priority}</span>
        </div>
        <div className="settings-row">
          <span>Due date</span>
          <span>{task.due_at ? date(task.due_at) : 'No due date'}</span>
        </div>
        {user.role !== 'viewer' && (
          <div className="settings-row">
            <span>Update status</span>
            <select
              aria-label="Task status"
              value={task.status}
              onChange={(e) => void status(e.target.value)}
            >
              {[
                'backlog',
                'queued',
                'running',
                'blocked',
                'needs_approval',
                'completed',
                'failed',
                'cancelled',
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        )}
      </Panel>
      {!!task.dependencies?.length && (
        <Panel title="Dependencies">
          {task.dependencies.map((t) => (
            <div className="settings-row" key={t.id}>
              <a href={'/?view=task&id=' + t.id}>{t.title}</a>
              <Badge status={t.status} />
            </div>
          ))}
        </Panel>
      )}
      <RunTable runs={task.runs ?? []} agents={agents} onRun={onRun} />
      <Panel title="Related approvals">
        {task.approvals?.length ? (
          task.approvals.map((a) => (
            <div className="settings-row" key={a.id}>
              <a href={'/?view=approvals&id=' + a.id}>{a.title}</a>
              <Badge status={a.status} />
            </div>
          ))
        ) : (
          <p className="panel-note">No approvals attached.</p>
        )}
      </Panel>
      <Panel title="Artifacts">
        {task.artifacts?.length ? (
          task.artifacts.map((a) => <ArtifactCard key={a.id} artifact={a} />)
        ) : (
          <p className="panel-note">No outputs attached.</p>
        )}
      </Panel>
      <Panel title="Related messages">
        {task.messages?.length ? (
          task.messages.map((m) => (
            <p className="panel-note" key={m.id}>
              {m.body}
            </p>
          ))
        ) : (
          <p className="panel-note">No messages attached.</p>
        )}
      </Panel>
      <Panel title="Task timeline">
        <EventList events={task.timeline ?? []} detailed />
      </Panel>
    </>
  );
}
