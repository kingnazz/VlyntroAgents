'use client';
import { useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Hash,
  LayoutDashboard,
  ListTodo,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { BrandFace } from '../brand/BrandFace';
import { AgentAvatar, StatusBadge } from '../components/ui';
import { MessageItem } from '../components/message-item';
import { demoMessages } from './demo-data';

export function DemoFrame({
  children,
  label,
  compact = false,
}: {
  children: React.ReactNode;
  label: string;
  compact?: boolean;
}) {
  return (
    <div className={'mk-demo-frame' + (compact ? ' mk-demo-compact' : '')}>
      <div className="mk-demo-chrome">
        <span>
          <BrandFace size={22} />
          <b>Agent HQ</b>
          <ChevronRight size={13} />
          <span className="mk-frame-label">{label}</span>
        </span>
        <span className="mk-demo-label">Interactive demo</span>
      </div>
      <div className="mk-demo-layout">
        <div className="mk-demo-rail" aria-hidden="true">
          <LayoutDashboard size={18} />
          <span className="selected">
            <Hash size={18} />
          </span>
          <ListTodo size={18} />
          <ShieldCheck size={18} />
          <Users size={18} />
        </div>
        <div className="mk-demo-body">{children}</div>
      </div>
    </div>
  );
}
export function ProductPreview({
  fullConversation = false,
}: {
  fullConversation?: boolean;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [approved, setApproved] = useState(false);
  const messages = fullConversation
    ? demoMessages.slice(0, approved ? 6 : 4)
    : demoMessages.slice(1, 4);
  return (
    <DemoFrame label="Launch workspace" compact={!fullConversation}>
      <div className="mk-channel-heading">
        <span>
          <Hash size={17} />
          <b>launch-campaign</b>
        </span>
        <span className="mk-channel-context">Shared context</span>
      </div>
      <div className="mk-demo-messages" aria-live="polite">
        {messages.map((message, i) => (
          <MessageItem
            key={message.id}
            name={message.sender_name}
            message={message}
            timeLabel={'9:0' + (i + 1)}
          />
        ))}
      </div>
      <div
        className={
          'approval-card mk-demo-approval ' +
          (approved ? 'approved' : 'pending')
        }
      >
        <div className="mk-approval-heading">
          <ShieldCheck size={17} />
          <span>{approved ? 'Human approved' : 'Waiting on Nazar'}</span>
          <StatusBadge status={approved ? 'approved' : 'pending'} />
        </div>
        <strong>
          {fullConversation
            ? 'Approve Campaign Concept 02'
            : 'Publish Campaign Concept 02'}
        </strong>
        <p>
          {approved
            ? 'Decision recorded. Muse can continue to the next step.'
            : 'Muse has a final draft ready for your decision.'}
        </p>
        {reviewing && !approved && (
          <div className="mk-review-detail">
            <b>Campaign Concept 02</b>
            <p>
              “Your AI team, in one place.” Positioning and launch copy prepared
              for review.
            </p>
            <p>
              This example records a decision only. Publishing requires a
              configured workflow.
            </p>
          </div>
        )}
        <div className="mk-demo-decision">
          {approved ? (
            <button
              onClick={() => {
                setApproved(false);
                setReviewing(false);
              }}
            >
              Replay demo
              <ArrowRight size={14} />
            </button>
          ) : reviewing ? (
            <>
              <button className="mk-approve" onClick={() => setApproved(true)}>
                <Check size={14} />
                Approve in demo
              </button>
              <button
                aria-label="Close review"
                onClick={() => setReviewing(false)}
              >
                <X size={15} />
              </button>
            </>
          ) : (
            <button onClick={() => setReviewing(true)}>
              Review
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="mk-running">
        <AgentAvatar name="Codex" />
        <span>
          <b>Codex</b>
          <small>Building landing page update</small>
        </span>
        <StatusBadge status="running" />
      </div>
    </DemoFrame>
  );
}
