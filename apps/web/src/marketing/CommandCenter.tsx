'use client';
import { useState } from 'react';
import {
  ArrowUpRight,
  Check,
  ShieldCheck,
  TriangleAlert,
  X,
} from 'lucide-react';
import { AgentAvatar, Panel, StatusBadge } from '../components/ui';
import { DemoFrame } from './ProductPreview';
const work = [
  {
    name: 'Codex',
    task: 'Landing page update',
    status: 'running',
    detail: 'Building the approved page update from the shared project brief.',
  },
  {
    name: 'Muse',
    task: 'Campaign Concept 02',
    status: 'needs_approval',
    detail:
      'Final draft is ready. A human decision is required before the next step.',
  },
  {
    name: 'ChatGPT',
    task: 'Launch research',
    status: 'completed',
    detail:
      'Research and three positioning directions are attached to the shared task.',
  },
];
export function CommandCenter() {
  const [detail, setDetail] = useState<number | null>(null);
  return (
    <section
      id="command-center"
      className="mk-section mk-wrap"
      aria-labelledby="command-title"
    >
      <div className="mk-section-intro">
        <h2 id="command-title">
          Know what your
          <br />
          AI team is doing.
        </h2>
        <p className="mk-lede">
          Agent HQ gives operators one place to see what’s running, what’s
          blocked, what finished, and what needs human attention.
        </p>
      </div>
      <div className="mk-command-surface">
        <DemoFrame label="Command Center">
          <div className="mk-command-heading">
            <div>
              <p className="eyebrow">VLYNTRO / AGENT OPERATIONS</p>
              <h3>
                Command Center<span className="mk-coral">.</span>
              </h3>
              <p>Your team at a glance.</p>
            </div>
            <span className="badge tone-success">
              <span className="dot" />
              Example workspace
            </span>
          </div>
          <div className="mk-command-summary">
            <span>
              <b>1</b>Running now
            </span>
            <span>
              <b>1</b>Needs approval
            </span>
            <span>
              <b>1</b>Recently completed
            </span>
            <span>
              <b>1</b>Failed
            </span>
          </div>
          <div className="mk-command-grid">
            <div>
              <Panel title="Work in progress">
                <div className="mk-demo-task-list">
                  {work.slice(0, 2).map((item, i) => (
                    <button key={item.name} onClick={() => setDetail(i)}>
                      <AgentAvatar name={item.name} />
                      <span>
                        <strong>{item.task}</strong>
                        <small>{item.name}</small>
                      </span>
                      <StatusBadge status={item.status} />
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                </div>
              </Panel>
              <Panel title="Agent roster">
                <div className="mk-demo-roster">
                  {work.map((item, i) => (
                    <button key={item.name} onClick={() => setDetail(i)}>
                      <AgentAvatar name={item.name} />
                      <span>
                        <strong>{item.name}</strong>
                        <small>
                          {item.status === 'needs_approval'
                            ? 'Waiting for human'
                            : item.status === 'completed'
                              ? 'Standing by'
                              : 'Building landing page'}
                        </small>
                      </span>
                      <StatusBadge
                        status={
                          item.status === 'completed'
                            ? 'online'
                            : item.status === 'needs_approval'
                              ? 'waiting'
                              : 'running'
                        }
                      />
                    </button>
                  ))}
                </div>
              </Panel>
            </div>
            <div>
              <Panel
                title="Waiting on you"
                className="approval-panel has-pending"
              >
                <button
                  className="mk-command-approval"
                  onClick={() => setDetail(1)}
                >
                  <ShieldCheck size={19} />
                  <strong>Approve Campaign Concept 02</strong>
                  <p>Muse requested your review.</p>
                  <span>
                    Review request
                    <ArrowUpRight size={14} />
                  </span>
                </button>
              </Panel>
              <Panel title="Failed work">
                <div className="mk-demo-failure">
                  <TriangleAlert size={17} />
                  <div>
                    <strong>Research source unavailable</strong>
                    <p>Source fetch failed. Review before retrying.</p>
                  </div>
                </div>
              </Panel>
            </div>
          </div>
          <Panel title="Recently completed">
            <button className="mk-completed-task" onClick={() => setDetail(2)}>
              <Check size={17} />
              <span>Launch research and positioning directions</span>
              <StatusBadge status="completed" />
              <ArrowUpRight size={14} />
            </button>
          </Panel>
          {detail !== null && (
            <div
              className="mk-demo-inspector"
              role="region"
              aria-label="Example task details"
            >
              <div>
                <b>{work[detail].task}</b>
                <button
                  onClick={() => setDetail(null)}
                  aria-label="Close task details"
                >
                  <X size={18} />
                </button>
              </div>
              <p>{work[detail].detail}</p>
              <StatusBadge status={work[detail].status} />
            </div>
          )}
        </DemoFrame>
      </div>
      <p className="mk-preview-caption">
        The same Agent HQ components, with illustrative workspace data.
      </p>
    </section>
  );
}
