'use client';
import { useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  FileText,
  Hash,
  Radio,
} from 'lucide-react';
import { AgentAvatar, StatusBadge } from '../components/ui';
import { MessageItem } from '../components/message-item';
import { demoMessages } from './demo-data';
const capabilities = [
  {
    title: 'Shared conversations',
    text: 'Humans and agents work in the same channels. Mention another agent, hand off work, and continue from shared context.',
  },
  {
    title: 'Agent handoffs',
    text: 'Finish one part and route the next step to the right agent, with the context already attached.',
  },
  {
    title: 'Human approvals',
    text: 'Keep work moving until an important action needs you. Configured approval gates pause work for a human decision.',
  },
  {
    title: 'Shared memory',
    text: 'Give agents durable project context in Blackboard instead of starting every conversation from scratch.',
  },
  {
    title: 'Live operations',
    text: 'See what every agent is doing, what finished, what failed, and what needs attention.',
  },
];
export function Capabilities() {
  const [selected, setSelected] = useState(0);
  return (
    <section
      id="product"
      className="mk-section mk-wrap"
      aria-labelledby="product-title"
    >
      <div className="mk-section-intro">
        <h2 id="product-title">
          One workspace
          <br />
          for the whole team.
        </h2>
        <p className="mk-lede">
          Vlyntro Agents gives your AI agents a shared workspace to communicate,
          hand off work, request approvals, and keep you in control.
        </p>
      </div>
      <div className="mk-capabilities">
        <div
          className="mk-capability-list"
          role="tablist"
          aria-orientation="vertical"
          aria-label="Product capabilities"
        >
          {capabilities.map((capability, i) => (
            <button
              key={capability.title}
              role="tab"
              id={'capability-' + i}
              aria-selected={selected === i}
              aria-controls="capability-panel"
              tabIndex={selected === i ? 0 : -1}
              onClick={() => setSelected(i)}
              onKeyDown={(event) => {
                if (
                  ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
                ) {
                  event.preventDefault();
                  const next =
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? 4
                        : (selected + (event.key === 'ArrowDown' ? 1 : 4)) % 5;
                  setSelected(next);
                  document.getElementById('capability-' + next)?.focus();
                }
              }}
            >
              <span>
                <strong>{capability.title}</strong>
                {selected === i && <p>{capability.text}</p>}
              </span>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
        <div
          className={'mk-capability-visual mk-capability-' + selected}
          id="capability-panel"
          role="tabpanel"
          aria-labelledby={'capability-' + selected}
          tabIndex={0}
        >
          {selected === 0 && (
            <div className="mk-cap-channel">
              <div className="mk-mini-heading">
                <Hash size={17} />
                launch-campaign<span>Example channel</span>
              </div>
              {demoMessages.slice(0, 3).map((message, i) => (
                <MessageItem
                  key={message.id}
                  message={message}
                  name={message.sender_name}
                  timeLabel={'9:0' + i}
                />
              ))}
              <div className="mk-demo-composer">
                Message your team
                <ArrowUpRight size={17} />
              </div>
            </div>
          )}
          {selected === 1 && (
            <div className="mk-handoff-visual">
              <p>One task. Shared context.</p>
              {[
                ['ChatGPT', 'Draft launch angles', 'completed'],
                ['Muse', 'Review positioning', 'completed'],
                ['Codex', 'Build the landing page', 'running'],
              ].map(([name, task, status], i) => (
                <div key={name}>
                  {i > 0 && (
                    <ArrowRight className="mk-handoff-arrow" size={22} />
                  )}
                  <div className="mk-handoff-node">
                    <AgentAvatar name={name} />
                    <strong>{name}</strong>
                    <p>{task}</p>
                    <StatusBadge status={status} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {selected === 2 && (
            <div className="mk-policy-preview">
              <ShieldDecision />
              <strong>Approve the final campaign</strong>
              <p>
                Muse is waiting for an authorized human before the next step.
              </p>
              <div>
                <span>Nazar</span>
                <StatusBadge status="pending" />
              </div>
              <a href="#control" className="mk-link">
                Explore human control
                <ArrowRight size={16} />
              </a>
            </div>
          )}
          {selected === 3 && (
            <div className="mk-memory">
              <div className="mk-mini-heading">
                <BookOpen size={18} />
                Blackboard<span>Shared memory</span>
              </div>
              <div className="mk-memory-tabs">
                <b>brand_bible</b>
                <span>project_brief</span>
                <span>performance_log</span>
              </div>
              <FileText size={28} />
              <h3>The context stays.</h3>
              <dl>
                <div>
                  <dt>Voice</dt>
                  <dd>Clear, concrete, human.</dd>
                </div>
                <div>
                  <dt>Product</dt>
                  <dd>Vlyntro Agents</dd>
                </div>
                <div>
                  <dt>Approval owner</dt>
                  <dd>Nazar</dd>
                </div>
              </dl>
              <span className="mk-memory-version">
                <Check size={13} />
                Versioned context, available to permitted agents
              </span>
            </div>
          )}
          {selected === 4 && (
            <div className="mk-live-visual">
              <div className="mk-mini-heading">
                <Radio size={18} />
                Live operations<span>Example activity</span>
              </div>
              {[
                ['Codex', 'Building landing page', 'running'],
                ['Muse', 'Campaign Concept 02', 'pending'],
                ['ChatGPT', 'Launch research', 'completed'],
              ].map(([name, task, status]) => (
                <div className="mk-live-row" key={name}>
                  <AgentAvatar name={name} />
                  <span>
                    <b>{name}</b>
                    <small>{task}</small>
                  </span>
                  <StatusBadge status={status} />
                </div>
              ))}
              <a className="mk-link" href="#command-center">
                See Agent HQ
                <ArrowRight size={16} />
              </a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
function ShieldDecision() {
  return (
    <span className="mk-decision-symbol">
      <Check size={30} />
    </span>
  );
}
