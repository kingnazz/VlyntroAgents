'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowUpRight,
  FileText,
  Plus,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { api, mutation } from './api';
import type {
  Agent,
  Approval,
  Artifact,
  Channel,
  Event,
  Health,
  Run,
  Task,
  User,
  Workspace,
} from './types';
import { Sidebar } from './components/sidebar';
import { Topbar } from './components/topbar';
import { TaskTable } from './components/task-table';
import { AgentCard } from './components/agent-card';
import { CommandCenter } from './views/command-center';
import { BrainViews } from './views/brain';
import { Connections } from './views/connections';
import { BrainActionsProvider } from './components/brain-actions';
type Data = {
  user: User;
  workspaces: Workspace[];
  agents: Agent[];
  channels: Channel[];
  tasks: Task[];
  approvals: Approval[];
  runs: Run[];
  artifacts: Artifact[];
  events: Event[];
  health: Health | null;
};
const initial: Data = {
  user: { id: '', display_name: '', email: '', role: '' },
  workspaces: [],
  agents: [],
  channels: [],
  tasks: [],
  approvals: [],
  runs: [],
  artifacts: [],
  events: [],
  health: null,
};
const titles: Record<string, string> = {
  today: 'Today',
  memory: 'Memory',
  projects: 'Projects',
  people: 'People',
  decisions: 'Decisions',
  inbox: 'Brain Inbox',
  'memory-detail': 'Memory detail',
  project: 'Project detail',
  person: 'Person detail',
  organization: 'Organization detail',
  organizations: 'Organizations',
  overview: 'Command Center',
  tasks: 'Tasks',
  approvals: 'Approvals',
  runs: 'Runs',
  artifacts: 'Artifacts',
  activity: 'Activity',
  settings: 'Settings',
  connections: 'Connect your AI',
  agents: 'Agents',
  blackboard: 'Blackboard',
};

import { EventList } from './components/activity-list';
import { ChannelView } from './views/channel';
import { RunTable } from './components/run-table';
import { ApprovalCard } from './components/approval-card';
import { AgentView } from './views/agent';
import { TaskView } from './views/task';
import { RunView } from './views/run';
import { ArtifactCard } from './components/artifact-card';
import { Blackboard } from './views/blackboard';
import { TaskModal } from './components/task-modal';
import {
  StatusBadge as Badge,
  EmptyState as Empty,
  Panel,
  PageHeader as PageHeading,
  Filter,
  LoadingState,
} from './components/ui';
export default function Console() {
  const [data, setData] = useState<Data>(initial),
    [screen, setScreen] = useState('today'),
    [selected, setSelected] = useState(''),
    [workspace, setWorkspace] = useState('vlyntro'),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [connected, setConnected] = useState(false),
    [mobile, setMobile] = useState(false),
    [newTask, setNewTask] = useState(false);
  const [status, setStatus] = useState(''),
    [agentFilter, setAgentFilter] = useState(''),
    [priority, setPriority] = useState('');
  const closeNavigation = useCallback(() => setMobile(false), []);
  const refresh = useCallback(async () => {
    try {
      const [
        user,
        workspaces,
        agents,
        channels,
        tasks,
        approvals,
        runs,
        artifacts,
        events,
        health,
      ] = await Promise.all([
        api<User>('/auth/me'),
        api<Workspace[]>('/workspaces'),
        api<Agent[]>('/agents'),
        api<Channel[]>('/workspaces/' + workspace + '/channels'),
        api<Task[]>('/tasks?workspace=' + workspace),
        api<Approval[]>('/approvals?workspace=' + workspace),
        api<Run[]>('/runs?workspace=' + workspace),
        api<Artifact[]>('/artifacts?workspace=' + workspace),
        api<Event[]>('/events?workspace=' + workspace),
        api<Health>('/health').catch(() => null),
      ]);
      setData({
        user,
        workspaces,
        agents,
        channels,
        tasks,
        approvals,
        runs,
        artifacts,
        events,
        health,
      });
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed.');
    } finally {
      setLoading(false);
    }
  }, [workspace]);
  const navigate = useCallback((view: string, id = '') => {
    setScreen(view);
    setSelected(id);
    setMobile(false);
    setStatus('');
    window.history.pushState(
      {},
      '',
      `/app?view=${view}${id ? '&id=' + encodeURIComponent(id) : ''}`,
    );
  }, []);
  useEffect(() => {
    const read = () => {
      const query = new URLSearchParams(window.location.search);
      setScreen(query.get('view') ?? 'today');
      setSelected(query.get('id') ?? '');
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const stream = new EventSource('/api/v1/stream?workspace=' + workspace);
    let timer: ReturnType<typeof setTimeout> | undefined;
    stream.onopen = () => {
      setConnected(true);
      void refresh();
    };
    stream.onerror = () => setConnected(false);
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void refresh();
      }, 150);
    };
    for (const event of [
      'brain.capture.created',
      'brain.capture.processed',
      'brain.capture.retry',
      'brain.item.created',
      'brain.item.updated',
      'brain.item.superseded',
      'brain.inbox.created',
      'brain.inbox.resolved',
      'brain.entity.linked',
      'project.created',
      'project.updated',
      'person.created',
      'person.updated',
      'organization.created',
      'organization.updated',
      'message.created',
      'task.created',
      'task.updated',
      'job.started',
      'job.completed',
      'job.failed',
      'approval.created',
      'approval.resolved',
      'agent.status',
      'document.updated',
      'handoff.blocked',
      'settings.agent_updated',
    ])
      stream.addEventListener(event, update);
    const poll = setInterval(() => {
      void refresh();
    }, 30000);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      stream.close();
    };
  }, [refresh, workspace]);
  const pending = data.approvals.filter((a) => a.status === 'pending');
  const agentName = (id: string) =>
    data.agents.find((a) => a.id === id)?.display_name ?? 'Agent';
  const currentChannel = data.channels.find(
    (c) => c.id === selected || c.slug === selected,
  );
  const workspaceId =
    data.workspaces.find((w) => w.slug === workspace)?.id ?? '';
  async function logout() {
    try {
      await api('/auth/logout', mutation({}));
      window.location.assign('/login');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <BrainActionsProvider
      workspaceId={workspaceId}
      canWrite={['owner', 'admin'].includes(data.user.role)}
      onChanged={() => void refresh()}
    >
      <div className="app-shell">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Sidebar
          screen={screen}
          selected={selected}
          workspace={workspace}
          workspaces={data.workspaces}
          agents={data.agents}
          channels={data.channels}
          user={data.user}
          pending={pending.length}
          connected={connected}
          open={mobile}
          onWorkspace={setWorkspace}
          onNavigate={navigate}
          onClose={closeNavigation}
          onLogout={() => void logout()}
        />
        <div className="main-shell">
          <Topbar
            title={
              screen === 'channel'
                ? (currentChannel?.name ?? 'Channel')
                : (titles[screen] ??
                  (screen === 'agent'
                    ? agentName(selected)
                    : screen === 'task'
                      ? 'Task detail'
                      : 'Run detail'))
            }
            onMenu={() => setMobile(true)}
          />
          <main
            id="main"
            className={
              'main-content ' + (screen === 'channel' ? 'channel-content' : '')
            }
          >
            {error && (
              <div className="error-banner" role="alert">
                <TriangleAlert size={16} />
                {error}
                <button onClick={() => void refresh()}>Retry</button>
              </div>
            )}
            {loading ? (
              <LoadingState />
            ) : (
              <>
                {[
                  'today',
                  'memory',
                  'decisions',
                  'inbox',
                  'projects',
                  'people',
                  'organizations',
                  'memory-detail',
                  'project',
                  'person',
                  'organization',
                ].includes(screen) && (
                  <BrainViews
                    workspaceId={workspaceId}
                    screen={screen}
                    selected={selected}
                    user={data.user}
                    agents={data.agents}
                    revision={String(data.events[0]?.id ?? '')}
                    onNavigate={navigate}
                    onChanged={() => void refresh()}
                  />
                )}
                {screen === 'overview' && (
                  <CommandCenter
                    agents={data.agents}
                    tasks={data.tasks}
                    approvals={data.approvals}
                    runs={data.runs}
                    events={data.events}
                    health={data.health}
                    connected={connected}
                    onNavigate={navigate}
                    onNewTask={() => setNewTask(true)}
                  />
                )}
                {screen === 'connections' && (
                  <Connections
                    key={workspaceId}
                    workspaceId={workspaceId}
                    canManage={['owner', 'admin'].includes(data.user.role)}
                  />
                )}
                {screen === 'channel' && currentChannel && (
                  <ChannelView
                    key={currentChannel.id}
                    channel={currentChannel}
                    events={data.events}
                    user={data.user}
                    agents={data.agents}
                    onError={setError}
                  />
                )}
                {screen === 'agents' && (
                  <>
                    <PageHeading
                      eyebrow="TEAM / DIRECTORY"
                      title="Your agents"
                      description="Roles, availability, and recent work across your operation."
                    />
                    <div className="agent-directory">
                      {data.agents.map((a) => (
                        <AgentCard
                          key={a.id}
                          agent={a}
                          onOpen={() => navigate('agent', a.id)}
                        />
                      ))}
                    </div>
                  </>
                )}
                {screen === 'agent' && (
                  <AgentView
                    key={selected}
                    id={selected}
                    runs={data.runs}
                    tasks={data.tasks}
                    refresh={refresh}
                    onRun={(id) => navigate('run', id)}
                    user={data.user}
                  />
                )}
                {screen === 'tasks' && (
                  <>
                    <PageHeading
                      eyebrow="WORK / TASKS"
                      title="Tasks"
                      description="A clear view of ownership, progress, and dependencies."
                      action={
                        <button
                          className="primary"
                          onClick={() => setNewTask(true)}
                        >
                          <Plus size={16} />
                          New task
                        </button>
                      }
                    />
                    <div className="filterbar">
                      <Filter
                        label="Status"
                        value={status}
                        onChange={setStatus}
                        values={[
                          'backlog',
                          'queued',
                          'running',
                          'blocked',
                          'needs_approval',
                          'completed',
                          'failed',
                          'cancelled',
                        ]}
                      />
                      <Filter
                        label="Agent"
                        value={agentFilter}
                        onChange={setAgentFilter}
                        values={data.agents.map((a) => a.id)}
                        labels={data.agents.map((a) => a.display_name)}
                      />
                      <Filter
                        label="Priority"
                        value={priority}
                        onChange={setPriority}
                        values={['0', '1', '2', '3', '4']}
                      />
                      <span>{data.tasks.length} recent tasks</span>
                    </div>
                    <Panel title="All work">
                      {
                        <TaskTable
                          agents={data.agents}
                          onOpen={(id) => navigate('task', id)}
                          tasks={data.tasks.filter(
                            (t) =>
                              (!status || t.status === status) &&
                              (!agentFilter ||
                                t.assigned_agent_id === agentFilter) &&
                              (!priority || String(t.priority) === priority),
                          )}
                        />
                      }
                    </Panel>
                  </>
                )}
                {screen === 'task' && (
                  <TaskView
                    key={selected}
                    id={selected}
                    agents={data.agents}
                    refresh={refresh}
                    user={data.user}
                    onRun={(id) => navigate('run', id)}
                  />
                )}
                {screen === 'approvals' && (
                  <>
                    <PageHeading
                      eyebrow="WORK / HUMAN REVIEW"
                      title="Approvals"
                      description="Review the action. Check the details. Make the call."
                    />
                    <div className="filterbar">
                      <Filter
                        label="Status"
                        value={status}
                        onChange={setStatus}
                        values={[
                          'pending',
                          'approved',
                          'rejected',
                          'cancelled',
                        ]}
                      />
                      <span>{pending.length} waiting for a decision</span>
                    </div>
                    {data.approvals.filter(
                      (a) => !status || a.status === status,
                    ).length ? (
                      <div className="approval-list">
                        {data.approvals
                          .filter((a) => !status || a.status === status)
                          .map((a) => (
                            <ApprovalCard
                              key={a.id}
                              approval={a}
                              name={agentName(a.requested_by_agent_id)}
                              refresh={refresh}
                              canResolve={['owner', 'admin'].includes(
                                data.user.role,
                              )}
                            />
                          ))}
                      </div>
                    ) : (
                      <Empty
                        icon={<ShieldCheck size={25} />}
                        title="Nothing waiting on you."
                      >
                        Requests that need a human decision will appear here.
                      </Empty>
                    )}
                  </>
                )}
                {screen === 'runs' && (
                  <>
                    <PageHeading
                      eyebrow="WORK / EXECUTION"
                      title="Runs"
                      description="Every attempt, its outcome, and the actions behind it."
                    />
                    <div className="filterbar">
                      <Filter
                        label="Status"
                        value={status}
                        onChange={setStatus}
                        values={['running', 'completed', 'failed']}
                      />
                      <span>{data.runs.length} recent runs</span>
                    </div>
                    <RunTable
                      runs={data.runs.filter(
                        (r) => !status || r.status === status,
                      )}
                      agents={data.agents}
                      onRun={(id) => navigate('run', id)}
                    />
                  </>
                )}
                {screen === 'run' && (
                  <RunView key={selected} id={selected} agents={data.agents} />
                )}
                {screen === 'artifacts' && (
                  <>
                    <PageHeading
                      eyebrow="WORK / OUTPUTS"
                      title="Artifacts"
                      description="Durable outputs attached to tasks and agent runs."
                    />
                    {data.artifacts.length ? (
                      <div className="artifact-grid">
                        {data.artifacts.map((a) => (
                          <ArtifactCard key={a.id} artifact={a} />
                        ))}
                      </div>
                    ) : (
                      <Empty
                        icon={<FileText size={24} />}
                        title="No artifacts yet"
                      >
                        Saved text, code, JSON, and file references will appear
                        here after agent work.
                      </Empty>
                    )}
                  </>
                )}
                {screen === 'activity' && (
                  <>
                    <PageHeading
                      eyebrow="SYSTEM / AUDIT TRAIL"
                      title="Activity"
                      description="An append-only record of decisions, changes, and execution."
                    />
                    <div className="filterbar">
                      <Filter
                        label="Action"
                        value={status}
                        onChange={setStatus}
                        values={[...new Set(data.events.map((e) => e.action))]}
                      />
                      <span>Newest first · up to 100 events</span>
                    </div>
                    <Panel title="Workspace events">
                      <EventList
                        events={data.events.filter(
                          (e) => !status || e.action === status,
                        )}
                        detailed
                      />
                    </Panel>
                  </>
                )}
                {screen === 'blackboard' && (
                  <Blackboard
                    user={data.user}
                    onError={setError}
                    events={data.events}
                  />
                )}
                {screen === 'settings' && (
                  <>
                    <PageHeading
                      eyebrow="SYSTEM / CONFIGURATION"
                      title="Workspace settings"
                      description="Connection details and the boundaries of your operation."
                    />
                    <Panel title="Your account">
                      <div className="settings-row">
                        <span>Signed in as</span>
                        <b>{data.user.display_name}</b>
                        <span className="muted">{data.user.email}</span>
                      </div>
                      <div className="settings-row">
                        <span>Access role</span>
                        <Badge status={data.user.role} />
                        <button className="secondary" onClick={logout}>
                          Sign out
                        </button>
                      </div>
                    </Panel>
                    <Panel title="Agent connections">
                      <div className="settings-row">
                        <span>
                          Connect ChatGPT, Claude, Codex, Grok and other AI apps
                        </span>
                        <button
                          className="primary"
                          onClick={() => navigate('connections')}
                        >
                          Connect your AI
                        </button>
                      </div>
                      <div className="settings-row">
                        <span>MCP endpoint</span>
                        <code>
                          {typeof window !== 'undefined'
                            ? window.location.origin
                            : ''}
                          /mcp
                        </code>
                        <span className="muted">Streamable HTTP</span>
                      </div>
                      <div className="settings-row">
                        <span>Authentication</span>
                        <span>Scoped OAuth or access token</span>
                        <span className="muted">
                          Managed in Connect your AI
                        </span>
                      </div>
                      <div className="settings-row">
                        <span>API specification</span>
                        <a
                          href="/api/v1/openapi.json"
                          target="_blank"
                          rel="noreferrer"
                        >
                          OpenAPI 3.1 <ArrowUpRight size={13} />
                        </a>
                      </div>
                    </Panel>
                    <Panel title="Provider readiness">
                      {data.agents
                        .filter((a) => a.agent_type !== 'system')
                        .map((a) => (
                          <div key={a.id} className="settings-row">
                            <span>{a.display_name}</span>
                            <span>
                              {a.provider ?? 'Configured local command'}
                            </span>
                            <Badge status={a.status} />
                          </div>
                        ))}
                    </Panel>
                    <p className="muted fineprint">
                      Provider credentials and command settings are configured
                      on the server. Secret values are never sent to this
                      dashboard.
                    </p>
                  </>
                )}
              </>
            )}
          </main>
          <footer className="app-footer">
            <span>VLYNTRO AGENT HQ</span>
            <span>
              <span className={'dot ' + (connected ? 'green' : 'amber')} />
              {connected
                ? 'Live workspace connected'
                : 'Live connection interrupted'}
            </span>
          </footer>
        </div>
        {newTask && (
          <TaskModal
            workspaceId={workspaceId}
            agents={data.agents}
            channels={data.channels}
            onClose={() => setNewTask(false)}
            onSaved={async () => {
              await refresh();
              navigate('tasks');
              setNewTask(false);
            }}
          />
        )}
      </div>
    </BrainActionsProvider>
  );
}
