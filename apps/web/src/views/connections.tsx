'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Link2,
  ShieldCheck,
} from 'lucide-react';
import { api, mutation } from '../api';
import type { Connection, Guide } from '../connection-types';
import { PageHeader, Panel, LoadingState } from '../components/ui';

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false),
    [error, setError] = useState('');
  return (
    <>
      <button
        className="secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setError('');
          } catch {
            setError('Copy unavailable. Select and copy the text below.');
          }
        }}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
        {copied ? 'Copied' : label}
      </button>
      {error && <small role="status">{error}</small>}
    </>
  );
}
const displayDate = (value: string) => new Date(value).toLocaleString();
export function Connections({
  workspaceId,
  canManage,
}: {
  workspaceId: string;
  canManage: boolean;
}) {
  const [connections, setConnections] = useState<Connection[]>([]),
    [guides, setGuides] = useState<Guide[]>([]),
    [kind, setKind] = useState('chatgpt');
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const [secret, setSecret] = useState(''),
    [label, setLabel] = useState(''),
    [access, setAccess] = useState('propose'),
    [days, setDays] = useState(30),
    [revealed, setRevealed] = useState(false);
  const refresh = useCallback(async () => {
    if (!workspaceId || !canManage) {
      setLoading(false);
      return;
    }
    try {
      const result = await api<{ connections: Connection[]; guides: Guide[] }>(
        '/connections?workspace_id=' + workspaceId,
      );
      setConnections(result.connections);
      setGuides(result.guides);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, canManage]);
  useEffect(() => {
    setSecret('');
    setRevealed(false);
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => void refresh(), 30000);
    return () => clearInterval(timer);
  }, [refresh]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const guide = guides.find((g) => g.kind === kind);
  if (!canManage)
    return (
      <Panel title="Connect your AI">
        <p>A workspace owner or administrator can manage AI connections.</p>
      </Panel>
    );
  return (
    <div className="connections-view">
      <PageHeader
        eyebrow="BRAIN / CONNECTIONS"
        title="Connect your AI"
        description="Give the AI apps you already use a shared memory. Each app signs in with its own identity and permissions."
      />
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button onClick={() => void refresh()}>Retry</button>
        </div>
      )}
      {notice && (
        <p role="status" className="connection-notice">
          {notice}
        </p>
      )}
      {loading ? (
        <LoadingState />
      ) : (
        <>
          <Panel title="Choose your AI" className="connection-panel">
            <div
              className="connection-clients"
              role="group"
              aria-label="AI client"
            >
              {guides.map((g) => (
                <button
                  key={g.kind}
                  aria-pressed={kind === g.kind}
                  className={
                    'connection-client ' + (kind === g.kind ? 'selected' : '')
                  }
                  onClick={() => {
                    setKind(g.kind);
                    setSecret('');
                    setRevealed(false);
                  }}
                >
                  <Link2 size={18} />
                  <span>{g.name}</span>
                  {kind === g.kind && <Check size={15} />}
                </button>
              ))}
            </div>
            {guide && (
              <div className="connection-guide">
                <div>
                  <h3>
                    {guide.name === 'Muse'
                      ? 'Muse inside Agent HQ'
                      : `Add Vlyntro Brain to ${guide.name}`}
                  </h3>
                  <p className="muted">
                    Sign in once through your browser. You choose the workspace
                    and whether the app may submit captures for review.
                  </p>
                </div>
                <div className="connection-copy">
                  <code>{guide.mcp_url}</code>
                  <CopyButton value={guide.mcp_url} label="Copy MCP URL" />
                </div>
                <ol className="connection-steps">
                  {guide.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                {guide.command && (
                  <div className="connection-copy">
                    <code>{guide.command}</code>
                    <CopyButton value={guide.command} label="Copy command" />
                  </div>
                )}
                <div className="connection-actions">
                  <CopyButton
                    value={guide.setup_prompt}
                    label="Copy setup prompt"
                  />
                  <a
                    className="secondary"
                    href={guide.home}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open {guide.name}
                    <ExternalLink size={14} />
                  </a>
                  <a href={guide.docs} target="_blank" rel="noreferrer">
                    Official instructions
                  </a>
                </div>
                <details>
                  <summary>View the prompt you can paste into your AI</summary>
                  <p className="connection-prompt">{guide.setup_prompt}</p>
                </details>
                <div className="connection-downloads">
                  <ShieldCheck size={19} />
                  <div>
                    <b>Optional skill and plugin</b>
                    <p className="muted">
                      Adds guidance for searching before work and capturing
                      durable outcomes. Install in a client that supports skills
                      or local plugins; browser consent still grants access.
                    </p>
                    <div className="connection-actions">
                      <a className="secondary" href={guide.skill_url} download>
                        <Download size={14} />
                        Download skill
                      </a>
                      <a className="secondary" href={guide.plugin_url} download>
                        <Download size={14} />
                        Download local plugin
                      </a>
                    </div>
                  </div>
                </div>
                <p className="muted fineprint">
                  Your AI can search this workspace and, if approved, submit
                  captures to the Brain Inbox. Captures retain their source and
                  require processing or review. Connecting an app does not
                  import its past chats or sync every conversation.
                </p>
              </div>
            )}
          </Panel>
          <Panel title="Your connections" className="connection-panel">
            <div className="connection-list-header">
              <p className="muted">
                Status reflects authenticated use of this connector.
              </p>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void refresh()}
              >
                Refresh status
              </button>
            </div>
            {!connections.length && (
              <p>
                No connections yet. Add the MCP URL in your AI app and complete
                browser sign-in.
              </p>
            )}
            {connections.map((c) => {
              const active =
                !c.revoked_at && new Date(c.expires_at).getTime() > Date.now();
              return (
                <article className="connection-record" key={c.id}>
                  <div>
                    <h3>{c.label}</h3>
                    <span className="connection-state">
                      {c.revoked_at
                        ? 'Revoked'
                        : !active
                          ? 'Expired'
                          : c.last_seen_at
                            ? 'Used successfully'
                            : 'Awaiting first use'}
                    </span>
                    <p className="muted">
                      {c.client_kind} ·{' '}
                      {c.auth_method === 'oauth'
                        ? 'Browser sign-in'
                        : 'Access token'}{' '}
                      · Read
                      {c.scopes.includes('brain.propose')
                        ? ' + capture'
                        : ' only'}
                    </p>
                    <small>
                      Expires {displayDate(c.expires_at)}
                      {c.last_seen_at &&
                        ` · Last used ${displayDate(c.last_seen_at)}`}
                    </small>
                  </div>
                  <div className="connection-actions">
                    {active && (
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            const result = await api<{
                              last_authenticated_use: string | null;
                            }>(
                              '/connections/' +
                                c.id +
                                '/verify?workspace_id=' +
                                workspaceId,
                            );
                            setNotice(
                              result.last_authenticated_use
                                ? `${c.label} authenticated at ${displayDate(result.last_authenticated_use)}.`
                                : `${c.label} has not authenticated yet. Ask it to call get_brain_connection.`,
                            );
                            await refresh();
                          })
                        }
                      >
                        Check connection
                      </button>
                    )}
                    {active && c.auth_method === 'token' && (
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            const result = await api<{ token: string }>(
                              '/connections/' +
                                c.id +
                                '/rotate?workspace_id=' +
                                workspaceId,
                              mutation({}),
                            );
                            setSecret(result.token);
                            setRevealed(false);
                            setNotice(
                              'Replacement token created. The previous token is revoked.',
                            );
                            await refresh();
                          })
                        }
                      >
                        Replace token
                      </button>
                    )}
                    {active && (
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            await api(
                              '/connections/' +
                                c.id +
                                '/revoke?workspace_id=' +
                                workspaceId,
                              mutation({}),
                            );
                            setSecret('');
                            setNotice(`${c.label} was revoked.`);
                            await refresh();
                          })
                        }
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </Panel>
          <details className="connection-advanced">
            <summary>Advanced: access token for other clients</summary>
            <p className="muted">
              Use this when your client supports a secure Authorization header
              instead of OAuth. Store the token in its secure settings. Each
              connection gets a separate identity.
            </p>
            <form
              className="connection-form"
              onSubmit={(event) => {
                event.preventDefault();
                void act(async () => {
                  const result = await api<{ token: string }>(
                    '/connections',
                    mutation({
                      workspace_id: workspaceId,
                      client_kind: kind,
                      label,
                      access,
                      expires_in_days: days,
                    }),
                  );
                  setSecret(result.token);
                  setRevealed(false);
                  setNotice('Token created. Copy it before leaving this page.');
                  await refresh();
                });
              }}
            >
              <label>
                Connection label
                <input
                  required
                  maxLength={100}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="My Claude desktop"
                />
              </label>
              <label>
                Access
                <select
                  value={access}
                  onChange={(e) => setAccess(e.target.value)}
                >
                  <option value="read">Read only</option>
                  <option value="propose">Read and submit captures</option>
                </select>
              </label>
              <label>
                Expires in days
                <input
                  type="number"
                  min={1}
                  max={90}
                  required
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                />
              </label>
              <button className="primary" disabled={busy || !workspaceId}>
                Create access token
              </button>
            </form>
          </details>
          {secret && (
            <section
              className="connection-secret"
              aria-label="New access token"
            >
              <h3>Save this token now</h3>
              <p>
                Shown once. It disappears when you leave or reload this page.
                Add it as <code>Authorization: Bearer &lt;token&gt;</code> in
                your client’s secure connection settings.
              </p>
              <label>
                Access token
                <input
                  readOnly
                  type={revealed ? 'text' : 'password'}
                  value={secret}
                  autoComplete="off"
                />
              </label>
              <div className="connection-actions">
                <button
                  className="secondary"
                  onClick={() => setRevealed(!revealed)}
                >
                  {revealed ? 'Hide token' : 'Reveal token'}
                </button>
                <CopyButton value={secret} label="Copy token" />
                <button className="secondary" onClick={() => setSecret('')}>
                  Done
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
