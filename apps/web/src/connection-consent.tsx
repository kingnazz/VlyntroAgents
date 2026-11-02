'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api, mutation } from './api';
import { Brand } from './brand/BrandLockup';
import type { Workspace } from './types';
type Consent = {
  client_name: string;
  scopes: string[];
  redirect_uri: string;
  expires_at: string;
};
const clients = [
  'chatgpt',
  'codex',
  'claude',
  'claude-code',
  'grok',
  'muse',
  'other',
];
export function ConnectionConsent({ request }: { request: string }) {
  const [consent, setConsent] = useState<Consent | null>(null),
    [workspaces, setWorkspaces] = useState<Workspace[]>([]),
    [workspace, setWorkspace] = useState('');
  const [kind, setKind] = useState('other'),
    [label, setLabel] = useState(''),
    [capture, setCapture] = useState(true),
    [remember, setRemember] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void Promise.all([
      api<Consent>('/connections/oauth-requests/' + request),
      api<Workspace[]>('/workspaces'),
    ])
      .then(([c, w]) => {
        if (!live) return;
        setConsent(c);
        setWorkspaces(w);
        setWorkspace(w[0]?.id ?? '');
        setLabel(c.client_name);
      })
      .catch((e) => {
        if (live) setError((e as Error).message);
      });
    return () => {
      live = false;
    };
  }, [request]);
  async function decide(decision: 'allow' | 'deny') {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ redirect: string }>(
        '/connections/oauth-consent',
        mutation({
          request,
          workspace_id: workspace,
          client_kind: kind,
          label,
          allow_capture: capture,
          remember,
          decision,
        }),
      );
      window.location.assign(result.redirect);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="consent-shell">
      <a href="/" aria-label="Vlyntro home">
        <Brand />
      </a>
      <section className="consent-panel">
        <div className="eyebrow">
          <ShieldCheck size={16} /> BRAIN CONNECTION
        </div>
        <h1>Connect your AI</h1>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!consent ? (
          <p>
            {error
              ? 'Start a new connection from your AI app if this request has expired.'
              : 'Loading connection request…'}
          </p>
        ) : (
          <>
            <p>
              <b>{consent.client_name}</b> is requesting access to your Second
              Brain.
            </p>
            <p className="muted">
              The app supplied this name. Confirm you started this connection
              and recognize its callback:
            </p>
            <code className="consent-callback">
              {new URL(consent.redirect_uri).origin}
              {new URL(consent.redirect_uri).pathname}
            </code>
            <form
              className="connection-form"
              onSubmit={(e) => {
                e.preventDefault();
                void decide('allow');
              }}
            >
              <label>
                Workspace
                <select
                  required
                  value={workspace}
                  onChange={(e) => setWorkspace(e.target.value)}
                >
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                AI app
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  {clients.map((c) => (
                    <option key={c} value={c}>
                      {c === 'other' ? 'Other AI' : c}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Connection label
                <input
                  required
                  maxLength={100}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </label>
              <div className="consent-permissions">
                <b>Read Brain context</b>
                <p className="muted">
                  Search memories, projects, people, organizations and decisions
                  in the selected workspace.
                </p>
                {consent.scopes.includes('brain.propose') && (
                  <label className="consent-check">
                    <input
                      type="checkbox"
                      checked={capture}
                      onChange={(e) => setCapture(e.target.checked)}
                    />
                    <span>
                      Allow submitting captures to the Brain Inbox for
                      processing or review
                    </span>
                  </label>
                )}
                {consent.scopes.includes('offline_access') && (
                  <label className="consent-check">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                    />
                    <span>
                      Stay connected using renewable credentials, for up to 90
                      days
                    </span>
                  </label>
                )}
              </div>
              <p className="muted">
                You can revoke access at any time in Connect your AI. This
                connection cannot edit existing memories, approve decisions, run
                tasks, or manage agents.
              </p>
              <div className="connection-actions">
                <button className="primary" disabled={busy || !workspace}>
                  {busy ? 'Connecting…' : 'Allow connection'}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || !workspace}
                  onClick={() => void decide('deny')}
                >
                  Deny
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
