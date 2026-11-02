'use client';
import { useState, type FormEvent } from 'react';
import { ArrowUpRight, LockKeyhole } from 'lucide-react';
import { Brand } from './brand/BrandLockup';
import { Mascot } from './brand/Mascot';
export default function Login({ next = '/app' }: { next?: string }) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const passwordField = event.currentTarget.elements.namedItem('password');
    if (passwordField instanceof HTMLInputElement) passwordField.value = '';
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error?.message ?? 'Sign in failed.');
      window.location.assign(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection unavailable.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-shell">
      <a className="login-brand" href="/" aria-label="Vlyntro Agents home">
        <Brand />
      </a>
      <div className="login-panel">
        <div className="eyebrow">
          <LockKeyhole size={14} /> PRIVATE OPERATIONS
        </div>
        <div className="login-welcome">
          <h1>
            Your AI team,
            <br />
            in one place<span className="heading-dot">.</span>
          </h1>
          <Mascot size={76} track={false} />
        </div>
        <p className="muted">
          Sign in to Agent HQ, your Vlyntro Agents workspace.
        </p>
        <form onSubmit={submit}>
          <label>
            Email address
            <input
              name="email"
              type="email"
              required
              autoComplete="username"
              placeholder="you@vlyntro.com"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? 'Signing in...' : 'Enter workspace'}
            <ArrowUpRight size={17} />
          </button>
        </form>
        <p className="login-note">
          Private access. Contact your workspace owner to join.
        </p>
        <a className="login-back" href="/">
          Explore Vlyntro Agents
        </a>
      </div>
      <footer>
        VLYNTRO AGENT HQ <span>HUMAN DIRECTION. AGENT EXECUTION.</span>
      </footer>
    </main>
  );
}
