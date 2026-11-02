'use client';
import { useState, useEffect, useRef, type FormEvent } from 'react';
import { X, ArrowUpRight } from 'lucide-react';
import { api, mutation } from '../api';
import type { Agent, Channel } from '../types';

export function TaskModal({
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
