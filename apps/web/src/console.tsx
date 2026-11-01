'use client';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  Activity,
  ArrowUpRight,
  AudioLines,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Clock3,
  Command,
  FileText,
  Hash,
  Inbox,
  Layers3,
  ListTodo,
  LogOut,
  Menu,
  Plus,
  Radio,
  Send,
  Settings2,
  ShieldCheck,
  Terminal,
  TriangleAlert,
  X,
  Zap,
} from 'lucide-react';
import { api, date, mutation, time } from './api';
import type {
  Agent,
  Approval,
  Artifact,
  Channel,
  Document,
  Event,
  Health,
  Message,
  Run,
  Task,
  User,
  Workspace,
} from './types';
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
  overview: 'Command Center',
  tasks: 'Tasks',
  approvals: 'Approvals',
  runs: 'Runs',
  artifacts: 'Artifacts',
  activity: 'Activity',
  settings: 'Settings',
  agents: 'Agents',
  blackboard: 'Blackboard',
};
function Badge({ status }: { status: string }) {
  return (
    <span className={'badge ' + status}>
      <span className="dot" />
      {status.replaceAll('_', ' ')}
    </span>
  );
}
function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  return (
    <span className={'avatar ' + name.toLowerCase() + (large ? ' large' : '')}>
      {name === 'ChatGPT' ? (
        <AudioLines size={large ? 25 : 18} />
      ) : name === 'Codex' ? (
        <Terminal size={large ? 25 : 18} />
      ) : name === 'Muse' ? (
        <span className="muse-mark">m</span>
      ) : (
        name.slice(0, 1)
      )}
    </span>
  );
}
function Empty({
  icon = <Inbox size={22} />,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Panel({
  title,
  aside,
  children,
  className = '',
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={'panel ' + className}>
      <div className="panel-heading">
        <h2>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
export default function Console() {
  const [data, setData] = useState<Data>(initial),
    [screen, setScreen] = useState('overview'),
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
      `/?view=${view}${id ? '&id=' + encodeURIComponent(id) : ''}`,
    );
  }, []);
  useEffect(() => {
    const read = () => {
      const query = new URLSearchParams(window.location.search);
      setScreen(query.get('view') ?? 'overview');
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
  const pending = data.approvals.filter((a) => a.status === 'pending'),
    active = data.tasks.filter((t) => ['queued', 'running'].includes(t.status)),
    failed = data.runs.filter((r) => r.status === 'failed');
  const agentName = (id: string) =>
    data.agents.find((a) => a.id === id)?.display_name ?? 'Agent';
  const currentChannel = data.channels.find(
    (c) => c.id === selected || c.slug === selected,
  );
  const workspaceId =
    data.workspaces.find((w) => w.slug === workspace)?.id ?? '';
  const nav = (
    view: string,
    label: string,
    icon: ReactNode,
    count?: number,
    id = '',
  ) => (
    <button
      aria-label={label}
      className={
        'nav-item ' +
        (screen === view && (!id || selected === id) ? 'active' : '')
      }
      onClick={() => navigate(view, id)}
    >
      {icon}
      <span>{label}</span>
      {count ? <span className="nav-count">{count}</span> : null}
    </button>
  );
  async function logout() {
    try {
      await api('/auth/logout', mutation({}));
      window.location.assign('/login');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const tableTasks = (tasks: Task[]) =>
    tasks.length ? (
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
              <tr key={t.id} onClick={() => navigate('task', t.id)}>
                <td>
                  <button className="row-title">{t.title}</button>
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
                  <span className={'priority p' + t.priority}>
                    P{t.priority}
                  </span>
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
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {mobile && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={'sidebar ' + (mobile ? 'open' : '')}>
        <button className="brand" onClick={() => navigate('overview')}>
          <div className="brand-symbol">
            V<span>.</span>
          </div>
          <div>
            VLYNTRO<span>AGENT HQ</span>
          </div>
        </button>
        <label className="workspace-picker">
          <span className="workspace-icon">V</span>
          <select
            aria-label="Workspace"
            value={workspace}
            onChange={(e) => setWorkspace(e.target.value)}
          >
            {data.workspaces.length ? (
              data.workspaces.map((w) => (
                <option key={w.id} value={w.slug}>
                  {w.name}
                </option>
              ))
            ) : (
              <option>Vlyntro</option>
            )}
          </select>
          <ChevronsUpDown size={13} />
        </label>
        <nav>
          {nav('overview', 'Command Center', <Command size={17} />)}
          <div className="nav-section">MESSAGES</div>
          {data.channels.map((c) => (
            <div key={c.id}>
              {nav('channel', c.name, <Hash size={17} />, undefined, c.id)}
            </div>
          ))}
          <div className="nav-section">
            AGENTS <span>{data.agents.length}</span>
          </div>
          {data.agents
            .filter((a) => a.agent_type !== 'system')
            .map((a) => (
              <div key={a.id}>
                {nav(
                  'agent',
                  a.display_name,
                  <span className={'tiny-agent ' + a.slug}>
                    {a.display_name.slice(0, 1)}
                  </span>,
                  undefined,
                  a.id,
                )}
              </div>
            ))}
          <div className="nav-section">WORK</div>
          {nav('tasks', 'Tasks', <ListTodo size={17} />)}
          {nav(
            'approvals',
            'Approvals',
            <ShieldCheck size={17} />,
            pending.length,
          )}
          {nav('runs', 'Runs', <Zap size={17} />)}
          {nav('artifacts', 'Artifacts', <FileText size={17} />)}
          {nav('blackboard', 'Blackboard', <Layers3 size={17} />)}
          <div className="nav-section">SYSTEM</div>
          {nav('activity', 'Activity', <Activity size={17} />)}
          {nav('settings', 'Settings', <Settings2 size={17} />)}
        </nav>
        <div className="sidebar-bottom">
          <div className="live-label">
            <span className={'dot ' + (connected ? 'green' : 'amber')} />
            {connected ? 'Live connection' : 'Reconnecting'}
            <Radio size={13} />
          </div>
          <button className="profile" onClick={logout} title="Sign out">
            <Avatar name={data.user.display_name || 'N'} />
            <span>
              {data.user.display_name || 'Loading'}
              <small>{data.user.role || 'Private workspace'}</small>
            </span>
            <LogOut size={15} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <b>
              {screen === 'channel'
                ? (currentChannel?.name ?? 'Channel')
                : (titles[screen] ??
                  (screen === 'agent'
                    ? agentName(selected)
                    : screen === 'task'
                      ? 'Task detail'
                      : 'Run detail'))}
            </b>
          </div>
          <div className="topbar-right">
            <span className="private-label">
              <LockIcon />
              Private workspace
            </span>
            <span className="key-hint">HQ / 01</span>
          </div>
        </header>
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
            <div className="loading-state">
              <span className="loading-dot" />
              Connecting to your workspace...
            </div>
          ) : (
            <>
              {screen === 'overview' && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">OPERATIONS / OVERVIEW</div>
                      <h1>
                        Command Center<span className="heading-dot">.</span>
                      </h1>
                      <p>
                        Your agents, their work, and what needs your attention.
                      </p>
                    </div>
                    <button
                      className="primary"
                      onClick={() => setNewTask(true)}
                    >
                      <Plus size={16} />
                      New task
                    </button>
                  </div>
                  <div className="metrics-strip">
                    {[
                      [
                        'Active agents',
                        data.agents.filter((a) =>
                          ['idle', 'online', 'busy'].includes(a.status),
                        ).length +
                          '/' +
                          data.agents.length,
                        'Configured and available',
                      ],
                      [
                        'In progress',
                        active.length,
                        'Queued and running tasks',
                      ],
                      [
                        'Needs approval',
                        pending.length,
                        'Waiting for your decision',
                      ],
                      ['Failed runs', failed.length, 'Recent attempts'],
                    ].map(([label, value, note], i) => (
                      <button
                        key={String(label)}
                        className={
                          'metric ' +
                          (i === 2 && pending.length ? 'attention' : '')
                        }
                        onClick={() =>
                          navigate(['agents', 'tasks', 'approvals', 'runs'][i])
                        }
                      >
                        <span>
                          {label}
                          <ArrowUpRight size={14} />
                        </span>
                        <strong>{value}</strong>
                        <small>{note}</small>
                      </button>
                    ))}
                  </div>
                  <div className="overview-grid">
                    <Panel
                      title="Agent roster"
                      aside={
                        <button
                          className="text-button"
                          onClick={() => navigate('agents')}
                        >
                          View all <ArrowUpRight size={13} />
                        </button>
                      }
                    >
                      <div className="agent-roster">
                        {data.agents.map((a) => (
                          <button
                            className="agent-row"
                            key={a.id}
                            onClick={() => navigate('agent', a.id)}
                          >
                            <Avatar name={a.display_name} />
                            <div className="agent-row-name">
                              <b>{a.display_name}</b>
                              <small>{a.role_description}</small>
                            </div>
                            <div className="agent-task">
                              {a.current_task ??
                                (a.status === 'offline'
                                  ? 'Awaiting configuration'
                                  : a.status === 'disabled'
                                    ? 'Disabled by operator'
                                    : 'Ready for work')}
                            </div>
                            <Badge status={a.status} />
                          </button>
                        ))}
                      </div>
                    </Panel>
                    <Panel
                      title="Approval inbox"
                      aside={
                        <span className="subtle-count">
                          {pending.length} pending
                        </span>
                      }
                      className="approval-panel"
                    >
                      {pending.length ? (
                        <div className="compact-approvals">
                          {pending.slice(0, 3).map((a) => (
                            <button
                              key={a.id}
                              onClick={() => navigate('approvals', a.id)}
                            >
                              <span className="eyebrow">
                                {agentName(a.requested_by_agent_id)} REQUESTED
                                REVIEW
                              </span>
                              <b>{a.title}</b>
                              <p>
                                {a.description ||
                                  'Review the exact action and payload before approving.'}
                              </p>
                              <span className="text-button">
                                Review request <ArrowUpRight size={14} />
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <Empty
                          icon={<ShieldCheck size={24} />}
                          title="You’re all caught up"
                        >
                          Requests that need a human decision will appear here.
                        </Empty>
                      )}
                    </Panel>
                  </div>
                  <Panel
                    title="Work in motion"
                    aside={
                      <button
                        className="text-button"
                        onClick={() => navigate('tasks')}
                      >
                        All tasks <ArrowUpRight size={13} />
                      </button>
                    }
                  >
                    {tableTasks(active.slice(0, 5))}
                  </Panel>
                  <div className="overview-grid lower-grid">
                    <Panel
                      title="Recent activity"
                      aside={
                        <button
                          className="text-button"
                          onClick={() => navigate('activity')}
                        >
                          Open log <ArrowUpRight size={13} />
                        </button>
                      }
                    >
                      <EventList events={data.events.slice(0, 5)} />
                    </Panel>
                    <Panel
                      title="System health"
                      aside={
                        <Badge status={data.health?.status ?? 'degraded'} />
                      }
                    >
                      {[
                        [
                          'Database',
                          data.health?.database === 'connected'
                            ? 'Connected'
                            : 'Unavailable',
                        ],
                        [
                          'Worker',
                          data.health?.worker.healthy
                            ? 'Heartbeat received'
                            : 'Heartbeat missing',
                        ],
                        [
                          'Live updates',
                          connected ? 'Connected' : 'Reconnecting',
                        ],
                        ['Human approval', 'Required before publishing'],
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
                  <Panel title="Recently completed" aside={<Check size={15} />}>
                    {tableTasks(
                      data.tasks
                        .filter((t) => t.status === 'completed')
                        .slice(0, 4),
                    )}
                  </Panel>
                </>
              )}
              {screen === 'channel' && currentChannel && (
                <ChannelView
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
                      <button
                        key={a.id}
                        onClick={() => navigate('agent', a.id)}
                        className="agent-directory-row"
                      >
                        <Avatar name={a.display_name} large />
                        <div>
                          <h2>{a.display_name}</h2>
                          <p>{a.role_description}</p>
                        </div>
                        <div className="agent-provider">
                          {a.provider ?? a.agent_type}
                          <small>{a.model ?? 'Local runtime'}</small>
                        </div>
                        <div className="agent-activity">
                          <span>{a.current_task ?? 'No active task'}</span>
                          <small>
                            {a.last_activity
                              ? 'Last active ' + date(a.last_activity)
                              : 'No activity recorded'}
                          </small>
                        </div>
                        <Badge status={a.status} />
                        <ChevronRight size={16} />
                      </button>
                    ))}
                  </div>
                </>
              )}
              {screen === 'agent' && (
                <AgentView
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
                    {tableTasks(
                      data.tasks.filter(
                        (t) =>
                          (!status || t.status === status) &&
                          (!agentFilter ||
                            t.assigned_agent_id === agentFilter) &&
                          (!priority || String(t.priority) === priority),
                      ),
                    )}
                  </Panel>
                </>
              )}
              {screen === 'task' && (
                <TaskView
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
                      values={['pending', 'approved', 'rejected', 'cancelled']}
                    />
                    <span>{pending.length} waiting for a decision</span>
                  </div>
                  {data.approvals.filter((a) => !status || a.status === status)
                    .length ? (
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
                      title="No approval requests"
                    >
                      Muse can request review through the content pipeline or
                      MCP. Every decision is recorded.
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
                <RunView id={selected} agents={data.agents} />
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
                      <span>Scoped agent bearer token</span>
                      <span className="muted">
                        Created through the admin CLI
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
                    Provider credentials and command settings are configured on
                    the server. Secret values are never sent to this dashboard.
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
            setNewTask(false);
            await refresh();
            navigate('tasks');
          }}
        />
      )}
    </div>
  );
}
function LockIcon() {
  return <ShieldCheck size={13} />;
}
function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>
          {title}
          <span className="heading-dot">.</span>
        </h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function Filter({
  label,
  value,
  onChange,
  values,
  labels,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  values: string[];
  labels?: string[];
}) {
  return (
    <label className="filter">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">
          {label === 'Status'
            ? 'All statuses'
            : 'All ' + label.toLowerCase() + 's'}
        </option>
        {values.map((v, i) => (
          <option value={v} key={v}>
            {labels?.[i] ?? v.replaceAll('_', ' ')}
          </option>
        ))}
      </select>
      <ChevronDown size={12} />
    </label>
  );
}
function EventList({
  events,
  detailed = false,
}: {
  events: Event[];
  detailed?: boolean;
}) {
  return events.length ? (
    <div className="event-list">
      {events.map((e) => (
        <div className="event-row" key={e.id}>
          <span
            className={
              'event-icon ' + (e.action.includes('failed') ? 'bad' : '')
            }
          >
            <Activity size={14} />
          </span>
          <div>
            <b>{e.action.replaceAll('.', ' / ').replaceAll('_', ' ')}</b>
            <small>
              {e.actor_type} · {e.actor_id.slice(0, 12)}
              {detailed ? ' · Event ' + e.id : ''}
            </small>
            {detailed && (
              <code className="event-payload">{JSON.stringify(e.payload)}</code>
            )}
          </div>
          <time>{date(e.created_at)}</time>
        </div>
      ))}
    </div>
  ) : (
    <Empty title="No activity in this view">
      Workspace actions will appear here as they happen.
    </Empty>
  );
}
function ChannelView({
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
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
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
          <div className="loading-state">Loading messages...</div>
        ) : !messages.length ? (
          <Empty
            icon={<Hash size={28} />}
            title={'Start the conversation in ' + channel.name}
          >
            Share context, ask a question, or mention @ChatGPT to begin the
            content workflow.
          </Empty>
        ) : (
          <>
            <button className="load-older" onClick={older} disabled={history}>
              {history ? 'Loading...' : 'Load earlier messages'}
            </button>
            {messages.map((m) => (
              <article className="message" key={m.id}>
                <Avatar
                  name={
                    m.sender_name ??
                    (m.sender_type === 'user'
                      ? user.display_name
                      : (agents.find((a) => a.id === m.sender_id)
                          ?.display_name ?? 'System'))
                  }
                />
                <div>
                  <header>
                    <b>{m.sender_name ?? 'System'}</b>
                    <span className={'message-kind ' + m.sender_type}>
                      {m.sender_type}
                    </span>
                    <time>{time(m.created_at)}</time>
                  </header>
                  <p>{m.body}</p>
                  {typeof m.metadata.task_id === 'string' && (
                    <a
                      className="message-link"
                      href={'/?view=task&id=' + m.metadata.task_id}
                    >
                      <ListTodo size={12} />
                      Linked task <ArrowUpRight size={12} />
                    </a>
                  )}
                </div>
              </article>
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
function RunTable({
  runs,
  agents,
  onRun,
}: {
  runs: Run[];
  agents: Agent[];
  onRun: (id: string) => void;
}) {
  return (
    <Panel title="Execution history">
      {runs.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Run</th>
                <th>Agent</th>
                <th>Status</th>
                <th>Started</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} onClick={() => onRun(r.id)}>
                  <td>
                    <button className="row-title">
                      {r.output_summary.slice(0, 75) ||
                        r.error ||
                        'Agent execution'}
                    </button>
                    <span className="row-id">{r.id.slice(0, 8)}</span>
                  </td>
                  <td>
                    {agents.find((a) => a.id === r.agent_id)?.display_name ??
                      'Agent'}
                  </td>
                  <td>
                    <Badge status={r.status} />
                  </td>
                  <td className="nowrap muted">{date(r.started_at)}</td>
                  <td>
                    {r.completed_at
                      ? Math.max(
                          0,
                          Math.round(
                            (+new Date(r.completed_at) -
                              +new Date(r.started_at)) /
                              1000,
                          ),
                        ) + 's'
                      : 'In progress'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon={<Zap size={23} />} title="No runs yet">
          Each agent attempt creates a run with visible action summaries.
        </Empty>
      )}
    </Panel>
  );
}
function ApprovalCard({
  approval: a,
  name,
  refresh,
  canResolve,
}: {
  approval: Approval;
  name: string;
  refresh: () => Promise<void>;
  canResolve: boolean;
}) {
  const [comment, setComment] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function decide(action: string) {
    setBusy(true);
    setError('');
    try {
      await api('/approvals/' + a.id + '/' + action, mutation({ comment }));
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className={'approval-card ' + a.status}>
      <header>
        <span className="inline-agent">
          <Avatar name={name} />
          <b>{name}</b>
          <span className="muted">requested review</span>
        </span>
        <Badge status={a.status} />
      </header>
      <div className="approval-card-body">
        <div className="eyebrow">
          {a.approval_type === 'content.publish'
            ? 'AUTHORIZE CONTENT FOR PUBLICATION'
            : 'REVIEW PROPOSED ACTION'}
        </div>
        <h2>{a.title}</h2>
        <p>{a.description}</p>
        <pre className="payload">{JSON.stringify(a.payload, null, 2)}</pre>
        <div className="approval-meta">
          <span>
            <Clock3 size={13} />
            {date(a.created_at)}
          </span>
          {a.task_id && (
            <a href={'/?view=task&id=' + a.task_id}>
              Related task <ArrowUpRight size={12} />
            </a>
          )}
          {a.run_id && (
            <a href={'/?view=run&id=' + a.run_id}>
              Related run <ArrowUpRight size={12} />
            </a>
          )}
        </div>
        {a.review_comment && (
          <p className="review-comment">Decision note: {a.review_comment}</p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {a.status === 'pending' && canResolve && (
          <div className="approval-actions">
            <label className="sr-only" htmlFor={'comment-' + a.id}>
              Decision comment
            </label>
            <input
              id={'comment-' + a.id}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a decision note (optional)"
              maxLength={4000}
            />
            <div>
              <button
                className="secondary danger"
                disabled={busy}
                onClick={() => void decide('reject')}
              >
                <X size={15} />
                Reject
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void decide('approve')}
              >
                <Check size={15} />
                {busy
                  ? 'Saving...'
                  : 'Approve ' +
                    (a.approval_type === 'content.publish'
                      ? 'this content'
                      : 'this action')}
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
function AgentView({
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
  if (!agent) return <p>{error || 'Loading agent...'}</p>;
  return (
    <>
      <PageHeading
        eyebrow="TEAM / AGENT PROFILE"
        title={agent.display_name}
        description={agent.description}
        action={<Badge status={agent.status} />}
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
function TaskView({
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
  if (!task) return <p>{error || 'Loading task...'}</p>;
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
function RunView({ id, agents }: { id: string; agents: Agent[] }) {
  const [run, setRun] = useState<Run | null>(null),
    [steps, setSteps] = useState<
      {
        id: string;
        name: string;
        status: string;
        output: { summary?: string };
        error?: string;
      }[]
    >([]),
    [error, setError] = useState('');
  useEffect(() => {
    void Promise.all([
      api<Run>('/runs/' + id),
      api<typeof steps>('/runs/' + id + '/steps'),
    ])
      .then(([r, s]) => {
        setRun(r);
        setSteps(s);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  if (!run) return <p>{error || 'Loading run...'}</p>;
  return (
    <>
      <PageHeading
        eyebrow={'EXECUTION / ' + id.slice(0, 8)}
        title={agents.find((a) => a.id === run.agent_id)?.display_name + ' run'}
        description={date(run.started_at)}
        action={<Badge status={run.status} />}
      />
      <Panel title="Execution summary">
        <p className="panel-note">
          {run.output_summary || run.error || 'Agent is working.'}
        </p>
        <p className="panel-note muted">{run.input_summary}</p>
      </Panel>
      <Panel title="Action steps">
        <div className="run-steps">
          {steps.map((s, i) => (
            <div key={s.id}>
              <span className="step-number">{i + 1}</span>
              <div>
                <h3>{s.name}</h3>
                <p>{s.output?.summary || s.error || 'Action recorded.'}</p>
              </div>
              <Badge status={s.status} />
            </div>
          ))}
        </div>
      </Panel>
      <p className="fineprint muted">
        Action summaries show what happened. Private model reasoning is never
        stored or displayed.
      </p>
    </>
  );
}
function ArtifactCard({ artifact: a }: { artifact: Artifact }) {
  return (
    <article className="artifact-card">
      <FileText size={20} />
      <div>
        <h3>{a.name}</h3>
        <span className="eyebrow">
          {a.artifact_type} · {date(a.created_at)}
        </span>
        {a.content_text && <pre>{a.content_text}</pre>}
      </div>
    </article>
  );
}
function Blackboard({
  user,
  onError,
  events,
}: {
  user: User;
  onError: (message: string) => void;
  events: Event[];
}) {
  const [keys, setKeys] = useState<Document[]>([]),
    [selected, setSelected] = useState('brand_bible'),
    [doc, setDoc] = useState<Document | null>(null),
    [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    void api<Document[]>('/state/vlyntro-ig')
      .then(setKeys)
      .catch((e) => onError(e.message));
  }, [events, onError]);
  useEffect(() => {
    setDirty(false);
    void api<Document>('/state/vlyntro-ig/' + selected)
      .then((d) => {
        setDoc(d);
        setText(JSON.stringify(d.value, null, 2));
      })
      .catch((e) => onError(e.message));
  }, [selected, onError]);
  async function save() {
    if (!doc) return;
    setBusy(true);
    try {
      const result = await api<Document>(
        '/state/vlyntro-ig/' + selected,
        mutation({ value: JSON.parse(text), expected_version: doc.version }),
      );
      setDoc(result);
      setDirty(false);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="SHARED STATE / VLYNTRO-IG"
        title="Blackboard"
        description="Versioned context shared by agents, with every write audited."
      />
      <div className="blackboard-tabs">
        {keys.map((k) => (
          <button
            className={selected === k.key ? 'active' : ''}
            key={k.key}
            onClick={() => setSelected(k.key)}
          >
            {k.key.replaceAll('_', ' ')}
            <span>v{k.version}</span>
          </button>
        ))}
      </div>
      {doc && (
        <Panel
          title={doc.key}
          aside={<span className="muted">Version {doc.version}</span>}
        >
          <label htmlFor="state-json" className="sr-only">
            Document JSON
          </label>
          <textarea
            id="state-json"
            className="json-editor"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setDirty(true);
            }}
            readOnly={
              user.role === 'viewer' ||
              (selected === 'brand_bible' && user.role !== 'owner')
            }
            spellCheck={false}
          />
          <div className="editor-footer">
            <span className="muted">
              Updated by {doc.updated_by} · {date(doc.updated_at)}
            </span>
            {user.role !== 'viewer' && (
              <button
                className="primary"
                onClick={save}
                disabled={!dirty || busy}
              >
                {busy ? 'Saving...' : 'Save version'}
              </button>
            )}
          </div>
        </Panel>
      )}
    </>
  );
}
function TaskModal({
  workspaceId,
  agents,
  channels,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  agents: Agent[];
  channels: Channel[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await api(
        '/tasks',
        mutation({
          workspace_id: workspaceId,
          title: f.get('title'),
          description: f.get('description'),
          assigned_agent_id: f.get('agent') || null,
          channel_id: f.get('channel') || null,
          priority: Number(f.get('priority')),
        }),
      );
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog ref={dialog} className="modal" onCancel={onClose}>
      <div className="modal-heading">
        <div>
          <div className="eyebrow">WORK / CREATE</div>
          <h2>New task</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close task dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <form onSubmit={submit}>
        <label>
          Title
          <input
            name="title"
            autoFocus
            required
            maxLength={200}
            placeholder="What needs to happen?"
          />
        </label>
        <label>
          Description
          <textarea
            name="description"
            maxLength={12000}
            placeholder="Give the agent context and a clear outcome."
          />
        </label>
        <div className="form-grid">
          <label>
            Assign to
            <select name="agent">
              <option value="">Unassigned</option>
              {agents
                .filter((a) => a.agent_type !== 'system')
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.display_name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Priority
            <select name="priority" defaultValue="2">
              {[0, 1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  P{n}
                  {n === 2 ? ' · Normal' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Channel
          <select name="channel">
            <option value="">No channel</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy || !workspaceId}>
          {busy ? 'Creating...' : 'Create task'}
          <ArrowUpRight size={15} />
        </button>
      </form>
    </dialog>
  );
}
