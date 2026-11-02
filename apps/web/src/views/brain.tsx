'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Brain, Plus, Search } from 'lucide-react';
import { api, mutation, date } from '../api';
import type { Agent, User } from '../types';
import type {
  BrainSearch,
  Capture,
  Entity,
  Memory,
  TodayData,
} from '../brain-types';
import {
  EmptyState,
  Filter,
  LoadingState,
  PageHeader,
  Panel,
  StatusBadge,
} from '../components/ui';
import {
  BrainDialog,
  MemoryForm,
  useBrainActions,
} from '../components/brain-actions';
import { EventList } from '../components/activity-list';
import { ArtifactCard } from '../components/artifact-card';
type Navigate = (view: string, id?: string) => void;
type Props = {
  workspaceId: string;
  screen: string;
  selected: string;
  user: User;
  agents: Agent[];
  revision: string;
  onNavigate: Navigate;
  onChanged: () => void;
};
const name = (entity: Entity) =>
  entity.name ?? entity.display_name ?? 'Unnamed';
const entityPath = {
  project: 'projects',
  person: 'people',
  organization: 'organizations',
} as const;
function MemoryRows({
  items,
  onNavigate,
}: {
  items: Memory[];
  onNavigate: Navigate;
}) {
  return items.length ? (
    <div className="brain-list">
      {items.map((item) => (
        <button
          className="brain-row"
          key={item.id}
          onClick={() => onNavigate('memory-detail', item.id)}
        >
          <div className="brain-row-heading">
            <span
              className={
                'brain-kind ' +
                (item.created_by_type === 'user' ? 'human' : 'agent')
              }
            >
              {item.kind}
            </span>
            <StatusBadge status={item.status} />
            <span className="muted">{item.importance}</span>
          </div>
          <h3>{item.title}</h3>
          <p>{item.summary ?? item.body.slice(0, 240)}</p>
          <div className="brain-meta">
            <span>
              {item.created_by_type === 'user' ? 'By' : 'Contributed by'}{' '}
              {item.author_name}
            </span>
            <span>
              {item.source_type}
              {item.source_id ? ' #' + item.source_id.slice(0, 8) : ''}
            </span>
            <time>{date(item.occurred_at ?? item.created_at)}</time>
            {item.links
              .filter((l) => l.title)
              .map((l) => (
                <span key={l.target_type + l.target_id + l.relation}>
                  {l.title}
                </span>
              ))}
          </div>
          {item.kind === 'decision' && item.created_by_type === 'agent' && (
            <small>
              {item.status === 'proposed'
                ? 'AI suggestion · needs human confirmation'
                : item.metadata.confirmed_by
                  ? 'Human-confirmed AI proposal'
                  : 'Agent observation'}
            </small>
          )}
        </button>
      ))}
    </div>
  ) : (
    <EmptyState icon={<Brain size={24} />} title="Nothing here yet">
      Capture a thought or add a memory to build useful context over time.
    </EmptyState>
  );
}
export function BrainViews(props: Props) {
  if (!props.workspaceId) return <LoadingState />;
  return (
    <BrainRouter
      key={props.workspaceId + props.screen + props.selected}
      {...props}
    />
  );
}
function BrainRouter(props: Props) {
  if (props.screen === 'today') return <Today {...props} />;
  if (props.screen === 'memory-detail') return <MemoryDetail {...props} />;
  if (props.screen === 'inbox') return <Inbox {...props} />;
  if (['projects', 'people', 'organizations'].includes(props.screen))
    return <Entities {...props} />;
  if (['project', 'person', 'organization'].includes(props.screen))
    return <EntityDetail {...props} />;
  return <MemoryList {...props} />;
}
function MemoryList({
  workspaceId,
  screen,
  revision,
  onNavigate,
  onChanged,
  user,
}: Props) {
  const [result, setResult] = useState<BrainSearch | null>(null),
    [error, setError] = useState(''),
    [q, setQ] = useState(''),
    [kind, setKind] = useState(''),
    [project, setProject] = useState(''),
    [person, setPerson] = useState(''),
    [importance, setImportance] = useState(''),
    [source, setSource] = useState(''),
    [status, setStatus] = useState(''),
    [since, setSince] = useState(''),
    [until, setUntil] = useState(''),
    [cursor, setCursor] = useState(0),
    [creating, setCreating] = useState(false);
  const [entities, setEntities] = useState<{
    projects: Entity[];
    people: Entity[];
  }>({ projects: [], people: [] });
  useEffect(() => {
    let active = true;
    void Promise.all([
      api<Entity[]>('/projects?workspace_id=' + workspaceId),
      api<Entity[]>('/people?workspace_id=' + workspaceId),
    ])
      .then(([projects, people]) => {
        if (active) setEntities({ projects, people });
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [workspaceId, revision]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      const query = new URLSearchParams({
        workspace_id: workspaceId,
        q,
        limit: '30',
        cursor: String(cursor),
      });
      for (const [key, value] of Object.entries({
        kind: screen === 'decisions' ? 'decision' : kind,
        project_id: project,
        person_id: person,
        importance,
        source_type: source,
        status,
        since: since ? new Date(since).toISOString() : '',
        until: until ? new Date(until + 'T23:59:59').toISOString() : '',
      }))
        if (value) query.set(key, value);
      void api<BrainSearch>('/brain/search?' + query)
        .then((r) => {
          if (active) {
            setResult(r);
            setError('');
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    workspaceId,
    screen,
    q,
    kind,
    project,
    person,
    importance,
    source,
    status,
    since,
    until,
    cursor,
    revision,
  ]);
  const filter = (setter: (s: string) => void) => (value: string) => {
    setCursor(0);
    setter(value);
  };
  return (
    <>
      <PageHeader
        eyebrow="BRAIN / DURABLE CONTEXT"
        title={screen === 'decisions' ? 'Decisions' : 'Memory'}
        description={
          screen === 'decisions'
            ? 'What was decided, by whom, and what it replaced. AI suggestions remain clearly attributed.'
            : 'Facts, ideas, and history with the people and projects behind them.'
        }
        action={
          user.role !== 'viewer' ? (
            <button className="primary" onClick={() => setCreating(true)}>
              <Plus size={16} />
              New memory
            </button>
          ) : undefined
        }
      />
      <div className="brain-search">
        <Search size={18} />
        <input
          aria-label="Search memory"
          value={q}
          onChange={(e) => filter(setQ)(e.target.value)}
          placeholder="What do we know about…?"
        />
      </div>
      <div className="filterbar brain-filters">
        {screen !== 'decisions' && (
          <Filter
            label="Kind"
            value={kind}
            onChange={filter(setKind)}
            values={[
              'note',
              'fact',
              'observation',
              'decision',
              'preference',
              'idea',
              'reference',
            ]}
          />
        )}
        <Filter
          label="Project"
          value={project}
          onChange={filter(setProject)}
          values={entities.projects.map((e) => e.id)}
          labels={entities.projects.map(name)}
        />
        <Filter
          label="Person"
          value={person}
          onChange={filter(setPerson)}
          values={entities.people.map((e) => e.id)}
          labels={entities.people.map(name)}
        />
        <Filter
          label="Importance"
          value={importance}
          onChange={filter(setImportance)}
          values={['low', 'normal', 'high', 'critical']}
        />
        <Filter
          label="Source"
          value={source}
          onChange={filter(setSource)}
          values={[
            'manual',
            'capture',
            'message',
            'task',
            'run',
            'artifact',
            'agent',
          ]}
        />
        <Filter
          label="Status"
          value={status}
          onChange={filter(setStatus)}
          values={['active', 'proposed', 'superseded', 'archived']}
        />
        <label>
          From
          <input
            type="date"
            aria-label="From date"
            value={since}
            onChange={(e) => filter(setSince)(e.target.value)}
          />
        </label>
        <label>
          Through
          <input
            type="date"
            aria-label="Through date"
            value={until}
            onChange={(e) => filter(setUntil)(e.target.value)}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {result ? (
        <>
          <MemoryRows items={result.items} onNavigate={onNavigate} />
          {q &&
            (['projects', 'people', 'organizations'] as const).map(
              (type, i) =>
                result[type].length > 0 && (
                  <Panel title={'Matching ' + type} key={type}>
                    {result[type].map((e) => (
                      <button
                        className="brain-line"
                        key={e.id}
                        onClick={() =>
                          onNavigate(
                            ['project', 'person', 'organization'][i],
                            e.id,
                          )
                        }
                      >
                        {name(e)}
                      </button>
                    ))}
                  </Panel>
                ),
            )}
          <div className="brain-toolbar">
            {cursor > 0 && (
              <button
                className="secondary"
                onClick={() => setCursor(Math.max(0, cursor - 30))}
              >
                Previous
              </button>
            )}
            {result.next_cursor !== null && (
              <button
                className="secondary"
                onClick={() => setCursor(result.next_cursor!)}
              >
                Next
              </button>
            )}
          </div>
        </>
      ) : (
        !error && <LoadingState label="Searching memory…" />
      )}
      {creating && (
        <MemoryForm
          workspaceId={workspaceId}
          onClose={() => setCreating(false)}
          onSaved={onChanged}
        />
      )}
    </>
  );
}
function MemoryDetail({
  workspaceId,
  selected,
  onNavigate,
  onChanged,
  user,
  revision,
}: Props) {
  const [item, setItem] = useState<Memory | null>(null),
    [history, setHistory] = useState<
      {
        id: string;
        revision_number: number;
        change_reason: string;
        snapshot: Memory;
        created_at: string;
        changed_by_type: string;
        changed_by_id: string;
      }[]
    >([]),
    [error, setError] = useState(''),
    [editing, setEditing] = useState(false),
    [supersede, setSupersede] = useState(false),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const [m, h] = await Promise.all([
        api<Memory>(
          '/brain/items/' + selected + '?workspace_id=' + workspaceId,
        ),
        user.role !== 'viewer'
          ? api<typeof history>(
              '/brain/items/' +
                selected +
                '/revisions?workspace_id=' +
                workspaceId,
            )
          : Promise.resolve([]),
      ]);
      setItem(m);
      setHistory(h);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [workspaceId, selected, user.role]);
  useEffect(() => {
    void load();
  }, [load, revision]);
  async function act(action: 'confirm' | 'archive') {
    if (!item) return;
    setBusy(true);
    try {
      await api(
        '/brain/' +
          (action === 'confirm' ? 'inbox/' : 'items/') +
          selected +
          '/' +
          action +
          '?workspace_id=' +
          workspaceId,
        mutation({ expected_revision: item.revision_number }),
      );
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!item)
    return error ? (
      <p role="alert" className="error">
        {error}
      </p>
    ) : (
      <LoadingState />
    );
  return (
    <>
      <PageHeader
        eyebrow={'BRAIN / ' + item.kind.toUpperCase()}
        title={item.title}
        description={
          (item.created_by_type === 'user' ? 'By ' : 'Contributed by ') +
          item.author_name +
          ' · ' +
          date(item.occurred_at ?? item.created_at)
        }
        action={<StatusBadge status={item.status} />}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {user.role !== 'viewer' && (
        <div className="brain-toolbar">
          <button className="secondary" onClick={() => setEditing(true)}>
            Edit memory
          </button>
          <button
            className="secondary"
            onClick={() => {
              setSupersede(true);
              setEditing(true);
            }}
          >
            Supersede
          </button>
          <button
            className="secondary"
            disabled={busy || item.status === 'archived'}
            onClick={() => void act('archive')}
          >
            Archive
          </button>
          {item.status === 'proposed' && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => void act('confirm')}
            >
              Confirm {item.kind}
            </button>
          )}
        </div>
      )}
      {item.status === 'proposed' && (
        <p className="brain-notice">
          AI suggestion. This is not an authoritative human {item.kind} until an
          owner or administrator confirms it.
        </p>
      )}
      <Panel title="Content">
        <p className="brain-body">{item.body}</p>
        {item.summary && <p className="panel-note">{item.summary}</p>}
      </Panel>
      <Panel title="Provenance">
        <div className="brain-body">
          <p>
            {item.created_by_type === 'user' ? 'Captured by' : 'Contributed by'}{' '}
            {item.author_name} ({item.created_by_type})
          </p>
          <p>
            Source: {item.source_type}
            {item.source_id ? ' #' + item.source_id : ''}
          </p>
          {item.source_attribution && (
            <p>
              Original source author: {item.source_attribution.name} (
              {item.source_attribution.type})
            </p>
          )}
          <p>
            Created {date(item.created_at)} · Importance: {item.importance} ·
            Revision {item.revision_number}
          </p>
          {typeof item.metadata.confirmed_by === 'string' && (
            <p>
              Confirmed by human #{item.metadata.confirmed_by} ·{' '}
              {String(item.metadata.confirmed_at)}
            </p>
          )}
          {item.supersedes_id && (
            <button
              className="text-button"
              onClick={() => onNavigate('memory-detail', item.supersedes_id!)}
            >
              Replaces previous memory #{item.supersedes_id.slice(0, 8)}
            </button>
          )}
          {item.source && (
            <details>
              <summary>
                Original capture · {date(item.source.created_at)}
              </summary>
              <p className="brain-body">{item.source.raw_text}</p>
              <small>
                Original {item.source.captured_by_type} #
                {item.source.captured_by_id}
              </small>
            </details>
          )}
        </div>
      </Panel>
      <Panel title="Related entities and sources">
        {item.links.length ? (
          item.links.map((l) => (
            <button
              className="brain-line"
              key={l.target_type + l.target_id + l.relation}
              onClick={() =>
                onNavigate(
                  l.target_type === 'message'
                    ? 'channel'
                    : l.target_type === 'artifact'
                      ? 'artifacts'
                      : l.target_type === 'approval'
                        ? 'approvals'
                        : l.target_type,
                  l.target_type === 'message'
                    ? (l.channel_id ?? l.target_id)
                    : l.target_id,
                )
              }
            >
              <span>
                {l.title ?? l.target_type} · {l.relation}
              </span>
              <small>
                {l.target_type} #{l.target_id.slice(0, 8)}
              </small>
            </button>
          ))
        ) : (
          <p className="panel-note">
            No relationships yet. Add them with Edit memory.
          </p>
        )}
      </Panel>
      <Panel title="Revision history">
        {history.map((h) => (
          <details className="brain-revision" key={h.id}>
            <summary>
              Version {h.revision_number} · {h.change_reason} ·{' '}
              {date(h.created_at)}
            </summary>
            <p className="brain-body">{h.snapshot.body}</p>
            <p className="panel-note">
              {h.snapshot.status} · {h.snapshot.importance} · Changed by{' '}
              {h.changed_by_type} #{h.changed_by_id.slice(0, 8)}
            </p>
          </details>
        ))}
      </Panel>
      {editing && (
        <MemoryForm
          workspaceId={workspaceId}
          item={item}
          supersede={supersede}
          onClose={() => {
            setEditing(false);
            setSupersede(false);
          }}
          onSaved={() => {
            void load();
            onChanged();
          }}
        />
      )}
    </>
  );
}
function Today({ workspaceId, revision, onNavigate, agents }: Props) {
  const [data, setData] = useState<TodayData | null>(null),
    [error, setError] = useState('');
  const actions = useBrainActions();
  useEffect(() => {
    let active = true;
    void api<TodayData>('/brain/today?workspace_id=' + workspaceId)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [workspaceId, revision]);
  if (!data)
    return error ? (
      <p role="alert" className="error">
        {error}
      </p>
    ) : (
      <LoadingState />
    );
  return (
    <>
      <PageHeader
        eyebrow="YOUR TEAM + YOUR SECOND BRAIN"
        title="Today"
        description="What needs you, what moved forward, and what is worth remembering."
        action={
          actions.canWrite ? (
            <button className="primary" onClick={actions.capture}>
              <Plus size={16} />
              Capture
            </button>
          ) : undefined
        }
      />
      <div className="brain-today-grid">
        <Panel title="Needs you">
          <button
            className="brain-line"
            onClick={() => onNavigate('approvals')}
          >
            <b>{data.approvals.length} pending approvals</b>
            <span>Review actions</span>
          </button>
          <button className="brain-line" onClick={() => onNavigate('inbox')}>
            <b>{data.inbox_count} Brain items to review</b>
            <span>Open Inbox</span>
          </button>
          {data.approvals.map((a) => (
            <p className="panel-note" key={a.id}>
              {a.title}
            </p>
          ))}
        </Panel>
        <Panel title="Follow-ups">
          {data.follow_ups.length ? (
            data.follow_ups.map((t) => (
              <button
                key={t.id}
                className="brain-line"
                onClick={() => onNavigate('task', t.id)}
              >
                <span>{t.title}</span>
                <small>
                  {t.due_at ? date(t.due_at) : 'Timing needs review'}
                </small>
              </button>
            ))
          ) : (
            <p className="panel-note">No follow-ups or due tasks.</p>
          )}
        </Panel>
        <Panel title="Your agents">
          {agents
            .filter((a) => a.agent_type !== 'system')
            .map((a) => (
              <button
                key={a.id}
                className="brain-line"
                onClick={() => onNavigate('agent', a.id)}
              >
                <span>
                  {a.display_name}
                  {a.current_task ? ' · ' + a.current_task : ''}
                </span>
                <StatusBadge status={a.status} />
              </button>
            ))}
        </Panel>
        <Panel title="Recently completed">
          {data.completed.length ? (
            data.completed.map((t) => (
              <button
                key={t.id}
                className="brain-line"
                onClick={() => onNavigate('task', t.id)}
              >
                {t.title}
              </button>
            ))
          ) : (
            <p className="panel-note">Completed work will appear here.</p>
          )}
        </Panel>
      </div>
      <Panel title="Recent important memories">
        <MemoryRows items={data.memories} onNavigate={onNavigate} />
      </Panel>
      <Panel title="Recent decisions">
        <MemoryRows items={data.decisions} onNavigate={onNavigate} />
      </Panel>
      <div className="brain-today-grid">
        <Panel title="Recent captures">
          {data.captures.length ? (
            data.captures.map((c) => (
              <button
                key={c.id}
                className="brain-line"
                onClick={() => onNavigate('inbox')}
              >
                <span>
                  {c.sensitive
                    ? 'Sensitive capture held for review'
                    : c.excerpt}
                </span>
                <StatusBadge status={c.status} />
              </button>
            ))
          ) : (
            <p className="panel-note">Your next thought starts with Capture.</p>
          )}
        </Panel>
        <Panel title="Project activity">
          {data.projects.length ? (
            data.projects.map((p) => (
              <button
                className="brain-line"
                key={p.id}
                onClick={() => onNavigate('project', p.id)}
              >
                <span>{name(p)}</span>
                <small>
                  {p.status} · {date(p.updated_at)}
                </small>
              </button>
            ))
          ) : (
            <p className="panel-note">
              Add a project to connect its people, decisions, and work.
            </p>
          )}
        </Panel>
      </div>
    </>
  );
}
function Inbox({ workspaceId, revision, onNavigate, onChanged }: Props) {
  const [data, setData] = useState<{
      captures: Capture[];
      proposals: Memory[];
    } | null>(null),
    [error, setError] = useState(''),
    [capture, setCapture] = useState<Capture | null>(null),
    [resolving, setResolving] = useState<{
      capture: Capture;
      index: number;
    } | null>(null),
    [busy, setBusy] = useState('');
  const load = useCallback(
    () =>
      api<{ captures: Capture[]; proposals: Memory[] }>(
        '/brain/inbox?workspace_id=' + workspaceId,
      )
        .then(setData)
        .catch((e) => setError(e.message)),
    [workspaceId],
  );
  useEffect(() => {
    void load();
  }, [load, revision]);
  async function act(c: Capture, action: string) {
    setBusy(c.id);
    try {
      await api(
        '/brain/inbox/' + c.id + '/' + action + '?workspace_id=' + workspaceId,
        mutation({}),
      );
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="BRAIN / HUMAN REVIEW"
        title="Brain Inbox"
        description="Unprocessed captures, uncertain matches, and proposals that need your judgment."
      />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!data && !error ? (
        <LoadingState />
      ) : (
        data && (
          <>
            <Panel title="Captures">
              {data.captures.length ? (
                data.captures.map((c) => (
                  <article className="brain-inbox-item" key={c.id}>
                    <div className="brain-row-heading">
                      <StatusBadge status={c.status} />
                      <span>
                        {c.author_name} · {date(c.created_at)}
                      </span>
                    </div>
                    <p className="brain-body">{c.raw_text}</p>
                    {c.processing_error && (
                      <p className="brain-notice">{c.processing_error}</p>
                    )}
                    {c.parsed_result?.suggestions?.map((s, i) => (
                      <div key={i} className="panel-note">
                        Review {s.type}: {JSON.stringify(s.fields)}. {s.reason}
                        {s.resolved_id ? (
                          <span>Resolved</span>
                        ) : (
                          <button
                            className="secondary"
                            onClick={() =>
                              setResolving({ capture: c, index: i })
                            }
                          >
                            Resolve match
                          </button>
                        )}
                      </div>
                    ))}
                    {c.parsed_result?.memory_ids?.map((id) => (
                      <button
                        className="text-button"
                        key={id}
                        onClick={() => onNavigate('memory-detail', id)}
                      >
                        View extracted memory #{id.slice(0, 8)}
                      </button>
                    ))}
                    <div className="brain-toolbar">
                      <button
                        className="secondary"
                        disabled={busy === c.id || c.status === 'processing'}
                        onClick={() => setCapture(c)}
                      >
                        {c.processed_at
                          ? 'Add corrected memory'
                          : 'Edit / convert manually'}
                      </button>
                      {c.processed_at && (
                        <button
                          className="primary"
                          disabled={busy === c.id}
                          onClick={() => void act(c, 'dismiss')}
                        >
                          Confirm reviewed
                        </button>
                      )}
                      <button
                        className="secondary"
                        disabled={
                          !!c.processed_at ||
                          c.sensitive ||
                          busy === c.id ||
                          c.status === 'processing'
                        }
                        onClick={() => void act(c, 'retry')}
                      >
                        Retry
                      </button>
                      <button
                        className="secondary"
                        disabled={busy === c.id || c.status === 'processing'}
                        onClick={() => void act(c, 'dismiss')}
                      >
                        Dismiss
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <p className="panel-note">All captures are processed.</p>
              )}
            </Panel>
            <Panel title="Proposed decisions, preferences, and suggestions">
              <MemoryRows items={data.proposals} onNavigate={onNavigate} />
            </Panel>
          </>
        )
      )}
      {capture && (
        <MemoryForm
          workspaceId={workspaceId}
          captureId={capture.id}
          initialBody={capture.sensitive ? '' : capture.raw_text}
          onClose={() => setCapture(null)}
          onSaved={() => {
            void load();
            onChanged();
          }}
        />
      )}
      {resolving && (
        <CaptureEntityResolution
          workspaceId={workspaceId}
          capture={resolving.capture}
          index={resolving.index}
          onClose={() => setResolving(null)}
          onSaved={() => {
            void load();
            onChanged();
          }}
        />
      )}
    </>
  );
}
function CaptureEntityResolution({
  workspaceId,
  capture,
  index,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  capture: Capture;
  index: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const suggestion = capture.parsed_result!.suggestions![index];
  const [candidates, setCandidates] = useState<Entity[]>([]),
    [selected, setSelected] = useState('new'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void api<Entity[]>(
      '/' +
        entityPath[suggestion.type as keyof typeof entityPath] +
        '?workspace_id=' +
        workspaceId,
    )
      .then(setCandidates)
      .catch((e) => setError(e.message));
  }, [workspaceId, suggestion.type]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(
        '/brain/inbox/' +
          capture.id +
          '/resolve-entity?workspace_id=' +
          workspaceId,
        mutation({
          suggestion_index: index,
          ...(selected === 'new'
            ? { create_new: true }
            : { target_id: selected }),
        }),
      );
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <BrainDialog title="Resolve entity match" onClose={onClose}>
      <form onSubmit={submit}>
        <p>{JSON.stringify(suggestion.fields)}</p>
        <p className="muted">
          Choose the correct record. Related extracted memories and tasks will
          link to your selection, with revision history.
        </p>
        <label>
          Entity
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="new">Create a separate {suggestion.type}</option>
            {candidates.map((e) => (
              <option key={e.id} value={e.id}>
                {name(e)}
                {e.email ? ' · ' + e.email : ''}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          Confirm match
        </button>
      </form>
    </BrainDialog>
  );
}
function EntityForm({
  type,
  workspaceId,
  entity,
  onClose,
  onSaved,
}: {
  type: keyof typeof entityPath;
  workspaceId: string;
  entity?: Entity;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const fields =
    type === 'person'
      ? [
          'display_name',
          'organization_name',
          'title',
          'email',
          'phone',
          'notes',
        ]
      : type === 'project'
        ? ['name', 'description', 'summary']
        : ['name', 'domain', 'description'];
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const values = Object.fromEntries(
      [...f.entries()].map(([k, v]) => [k, v || null]),
    );
    try {
      await api(
        '/' +
          entityPath[type] +
          (entity ? '/' + entity.id + '?workspace_id=' + workspaceId : ''),
        mutation(
          { ...values, ...(!entity ? { workspace_id: workspaceId } : {}) },
          entity ? 'PATCH' : 'POST',
        ),
      );
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <BrainDialog title={(entity ? 'Edit ' : 'New ') + type} onClose={onClose}>
      <form onSubmit={submit}>
        {fields.map((field, i) => (
          <label key={field}>
            {field === 'display_name' ? 'Name' : field.replaceAll('_', ' ')}
            {['notes', 'description', 'summary'].includes(field) ? (
              <textarea
                name={field}
                maxLength={2000}
                defaultValue={String(
                  (entity as unknown as Record<string, unknown>)?.[field] ?? '',
                )}
              />
            ) : (
              <input
                autoFocus={i === 0}
                name={field}
                required={i === 0}
                type={field === 'email' ? 'email' : 'text'}
                maxLength={field === 'email' ? 254 : 240}
                defaultValue={String(
                  (entity as unknown as Record<string, unknown>)?.[field] ?? '',
                )}
              />
            )}
          </label>
        ))}
        {type === 'project' && (
          <label>
            Status
            <select name="status" defaultValue={entity?.status ?? 'active'}>
              {['idea', 'active', 'paused', 'completed', 'archived'].map(
                (s) => (
                  <option key={s}>{s}</option>
                ),
              )}
            </select>
          </label>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save ' + type}
        </button>
      </form>
    </BrainDialog>
  );
}
function Entities({
  workspaceId,
  screen,
  revision,
  onNavigate,
  onChanged,
  user,
}: Props) {
  const type =
    screen === 'projects'
      ? 'project'
      : screen === 'people'
        ? 'person'
        : 'organization';
  const [items, setItems] = useState<Entity[] | null>(null),
    [error, setError] = useState(''),
    [creating, setCreating] = useState(false),
    [q, setQ] = useState('');
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void api<Entity[]>(
        '/' +
          entityPath[type] +
          '?' +
          new URLSearchParams({ workspace_id: workspaceId, q }),
      )
        .then((d) => {
          if (active) setItems(d);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [workspaceId, type, revision, q]);
  return (
    <>
      <PageHeader
        eyebrow="BRAIN / CONNECTIONS"
        title={screen[0].toUpperCase() + screen.slice(1)}
        description={
          type === 'project'
            ? 'Connect the decisions, people, and work behind each project.'
            : type === 'person'
              ? 'Remember who people are and the context you share.'
              : 'Companies and teams connected to your people and projects.'
        }
        action={
          user.role !== 'viewer' ? (
            <button className="primary" onClick={() => setCreating(true)}>
              <Plus size={16} />
              New {type}
            </button>
          ) : undefined
        }
      />
      <div className="brain-toolbar">
        <div className="brain-search">
          <Search size={18} />
          <input
            aria-label={'Search ' + screen}
            placeholder={'Search ' + screen}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {screen !== 'organizations' && (
          <button
            className="secondary"
            onClick={() => onNavigate('organizations')}
          >
            Organizations
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {items ? (
        items.length ? (
          <div className="brain-entity-grid">
            {items.map((e) => (
              <button
                className="brain-entity"
                key={e.id}
                onClick={() => onNavigate(type, e.id)}
              >
                <h2>{name(e)}</h2>
                {e.status && <StatusBadge status={e.status} />}
                <p>
                  {e.summary ??
                    e.description ??
                    e.organization_name ??
                    e.notes ??
                    'Add context as you learn more.'}
                </p>
                {type === 'project' && (
                  <div className="brain-meta">
                    <span>{e.open_tasks ?? 0} open tasks</span>
                    {e.related_people?.map((p) => (
                      <span key={p}>{p}</span>
                    ))}
                    {e.latest_decision && (
                      <span>Decision: {e.latest_decision}</span>
                    )}
                    {e.latest_memory && <span>Memory: {e.latest_memory}</span>}
                    {e.recent_agents?.map((a) => (
                      <span key={a}>{a}</span>
                    ))}
                  </div>
                )}
                <small>Updated {date(e.last_activity ?? e.updated_at)}</small>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState title={'No ' + screen + ' yet'}>
            Add a {type} manually, or capture a conversation to organize it
            later.
          </EmptyState>
        )
      ) : (
        !error && <LoadingState />
      )}
      {creating && (
        <EntityForm
          type={type}
          workspaceId={workspaceId}
          onClose={() => setCreating(false)}
          onSaved={onChanged}
        />
      )}
    </>
  );
}
function EntityDetail({
  workspaceId,
  screen,
  selected,
  revision,
  onNavigate,
  onChanged,
  user,
  agents,
}: Props) {
  const type = screen as keyof typeof entityPath;
  const [entity, setEntity] = useState<Entity | null>(null),
    [error, setError] = useState(''),
    [editing, setEditing] = useState(false),
    [tab, setTab] = useState('Overview'),
    [linking, setLinking] = useState(false);
  const load = useCallback(
    () =>
      api<Entity>(
        '/' +
          entityPath[type] +
          '/' +
          selected +
          '?workspace_id=' +
          workspaceId,
      )
        .then(setEntity)
        .catch((e) => setError(e.message)),
    [type, selected, workspaceId],
  );
  useEffect(() => {
    void load();
  }, [load, revision]);
  if (!entity)
    return error ? (
      <p className="error" role="alert">
        {error}
      </p>
    ) : (
      <LoadingState />
    );
  return (
    <>
      <PageHeader
        eyebrow={'BRAIN / ' + type.toUpperCase()}
        title={name(entity)}
        description={
          entity.summary ??
          entity.description ??
          entity.organization_name ??
          'Connected history, people, and work.'
        }
        action={
          user.role !== 'viewer' ? (
            <button className="secondary" onClick={() => setEditing(true)}>
              Edit {type}
            </button>
          ) : undefined
        }
      />
      <div className="brain-tabs" role="tablist" aria-label="Entity sections">
        {[
          'Overview',
          'Memory',
          'Decisions',
          'People',
          'Projects',
          'Tasks',
          'Messages',
          'Artifacts',
          'Activity',
        ].map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'Overview' && (
        <>
          <Panel title="Context">
            <div className="brain-body">
              <p>
                {entity.notes ??
                  entity.description ??
                  'No additional context yet.'}
              </p>
              {[entity.title, entity.email, entity.phone, entity.domain]
                .filter(Boolean)
                .map((s, i) => (
                  <p key={i}>{s}</p>
                ))}
              {entity.status && <StatusBadge status={entity.status} />}
            </div>
            {user.role !== 'viewer' && (
              <button
                className="secondary brain-margin"
                onClick={() => setLinking(true)}
              >
                Link entity or task
              </button>
            )}
            {entity.organizations?.map((o) => (
              <button
                className="brain-line"
                key={o.id}
                onClick={() => onNavigate('organization', o.id)}
              >
                {name(o)}
              </button>
            ))}
          </Panel>
          <Panel title="Latest memories">
            <MemoryRows
              items={(entity.memories ?? []).slice(0, 5)}
              onNavigate={onNavigate}
            />
          </Panel>
          <Panel title="Latest decisions">
            <MemoryRows
              items={(entity.decisions ?? []).slice(0, 3)}
              onNavigate={onNavigate}
            />
          </Panel>
          <Panel title="Agents recently involved">
            {entity.runs?.length ? (
              entity.runs.slice(0, 5).map((r) => (
                <button
                  key={r.id}
                  className="brain-line"
                  onClick={() => onNavigate('run', r.id)}
                >
                  {agents.find((a) => a.id === r.agent_id)?.display_name ??
                    'Agent'}{' '}
                  · {r.status}
                </button>
              ))
            ) : (
              <p className="panel-note">No linked agent work yet.</p>
            )}
          </Panel>
        </>
      )}
      {tab === 'Memory' && (
        <MemoryRows items={entity.memories ?? []} onNavigate={onNavigate} />
      )}{' '}
      {tab === 'Decisions' && (
        <MemoryRows items={entity.decisions ?? []} onNavigate={onNavigate} />
      )}
      {(tab === 'People' || tab === 'Projects') && (
        <Panel title={'Related ' + tab.toLowerCase()}>
          {(tab === 'People' ? entity.people : entity.projects)?.length ? (
            (tab === 'People' ? entity.people : entity.projects)?.map((e) => (
              <button
                className="brain-line"
                key={e.id}
                onClick={() =>
                  onNavigate(tab === 'People' ? 'person' : 'project', e.id)
                }
              >
                {name(e)}
              </button>
            ))
          ) : (
            <p className="panel-note">
              No relationships yet. Link records from Overview or memory.
            </p>
          )}
        </Panel>
      )}
      {tab === 'Tasks' && (
        <Panel title="Linked tasks">
          {entity.tasks?.length ? (
            entity.tasks.map((t) => (
              <button
                className="brain-line"
                key={t.id}
                onClick={() => onNavigate('task', t.id)}
              >
                <span>{t.title}</span>
                <StatusBadge status={t.status} />
              </button>
            ))
          ) : (
            <p className="panel-note">No linked tasks.</p>
          )}
        </Panel>
      )}
      {tab === 'Messages' && (
        <Panel title="Source conversations">
          {entity.messages?.length ? (
            entity.messages.map((m) => (
              <button
                className="brain-line"
                key={m.id}
                onClick={() => onNavigate('channel', m.channel_id)}
              >
                {m.body.slice(0, 400)}
              </button>
            ))
          ) : (
            <p className="panel-note">
              Save a message to Brain and link it here to preserve conversation
              context.
            </p>
          )}
        </Panel>
      )}
      {tab === 'Artifacts' && (
        <Panel title="Linked artifacts">
          {entity.artifacts?.length ? (
            entity.artifacts.map((a) => (
              <ArtifactCard key={a.id} artifact={a} />
            ))
          ) : (
            <p className="panel-note">No linked artifacts.</p>
          )}
        </Panel>
      )}
      {tab === 'Activity' && (
        <Panel title="Source history and activity">
          <EventList events={entity.activity ?? []} detailed />
        </Panel>
      )}
      {editing && (
        <EntityForm
          type={type}
          workspaceId={workspaceId}
          entity={entity}
          onClose={() => setEditing(false)}
          onSaved={() => {
            void load();
            onChanged();
          }}
        />
      )}
      {linking && (
        <EntityLinkForm
          workspaceId={workspaceId}
          type={type}
          id={selected}
          onClose={() => setLinking(false)}
          onSaved={() => {
            void load();
            onChanged();
          }}
        />
      )}
    </>
  );
}
function EntityLinkForm({
  workspaceId,
  type,
  id,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  type: string;
  id: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [targets, setTargets] = useState<
      { type: string; id: string; title: string }[]
    >([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void Promise.all(
      ['projects', 'people', 'organizations', 'tasks'].map((p) =>
        api<Entity[]>(
          '/' +
            p +
            '?' +
            (p === 'tasks' ? 'workspace=' : 'workspace_id=') +
            workspaceId,
        ),
      ),
    )
      .then((rows) =>
        setTargets(
          rows.flatMap((rs, i) =>
            rs
              .filter((r) => r.id !== id)
              .map((r) => ({
                type: ['project', 'person', 'organization', 'task'][i],
                id: r.id,
                title: r.title ?? name(r),
              })),
          ),
        ),
      )
      .catch((e) => setError(e.message));
  }, [workspaceId, id]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const [to_type, to_id] = String(f.get('target')).split(':');
    try {
      await api(
        '/brain/entity-links',
        mutation({
          workspace_id: workspaceId,
          from_type: type,
          from_id: id,
          to_type,
          to_id,
          relation: f.get('relation'),
        }),
      );
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <BrainDialog title="Link related record" onClose={onClose}>
      <form onSubmit={submit}>
        <label>
          Record
          <select name="target" required>
            {targets.map((t) => (
              <option key={t.id} value={t.type + ':' + t.id}>
                {t.type}: {t.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Relation
          <select name="relation">
            {['RELATED_TO', 'WORKS_AT', 'DEPENDS_ON', 'FOLLOW_UP'].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy || !targets.length}>
          Save relationship
        </button>
      </form>
    </BrainDialog>
  );
}
