'use client';
import { Activity } from 'lucide-react';
import { date } from '../api';
import type { Event } from '../types';
import { EmptyState as Empty } from './ui';

export function EventList({
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
              'event-icon tone-' +
              (e.action.includes('failed')
                ? 'error'
                : e.action.includes('approval')
                  ? 'waiting'
                  : e.action.includes('completed')
                    ? 'success'
                    : e.actor_type === 'user'
                      ? 'human'
                      : e.actor_type === 'agent'
                        ? 'agent'
                        : 'neutral')
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
