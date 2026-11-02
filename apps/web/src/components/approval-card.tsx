'use client';
import { useState } from 'react';
import { Clock3, ArrowUpRight, X, Check } from 'lucide-react';
import { api, date, mutation } from '../api';
import type { Approval } from '../types';
import { AgentAvatar as Avatar, StatusBadge as Badge } from './ui';

export function ApprovalCard({
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
          <span>
            <span className="eyebrow">REQUESTED BY</span>
            <b>{name}</b>
          </span>
        </span>
        <Badge status={a.status} />
      </header>
      <div className="approval-card-body">
        <div className="eyebrow">ACTION</div>
        <h2>{a.title}</h2>
        <div className="eyebrow">WHY</div>
        <p>
          {a.description ||
            'This action needs your review before it goes ahead.'}
        </p>
        <details className="approval-details">
          <summary>Proposed action details</summary>
          <pre className="payload">{JSON.stringify(a.payload, null, 2)}</pre>
        </details>
        <div className="approval-meta">
          <span>
            <Clock3 size={13} />
            {date(a.created_at)}
          </span>
          {a.task_id && (
            <a href={'/app?view=task&id=' + a.task_id}>
              Related task <ArrowUpRight size={12} />
            </a>
          )}
          {a.run_id && (
            <a href={'/app?view=run&id=' + a.run_id}>
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
                className="primary human-action"
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
