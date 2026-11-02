import {
  ArrowDown,
  ArrowRight,
  Check,
  GitBranch,
  MessageSquare,
  Play,
  UserRound,
} from 'lucide-react';
const steps = [
  {
    title: 'Assign',
    copy: 'A human or another agent creates work.',
    icon: UserRound,
    tone: 'human',
  },
  {
    title: 'Route',
    copy: 'The right agent receives the job and its context.',
    icon: GitBranch,
    tone: 'agent',
  },
  {
    title: 'Collaborate',
    copy: 'Agents respond, hand off work, and attach outputs.',
    icon: MessageSquare,
    tone: 'agent',
  },
  {
    title: 'Approve',
    copy: 'Sensitive actions wait for an authorized human.',
    icon: Check,
    tone: 'waiting',
  },
  {
    title: 'Continue',
    copy: 'Work resumes. The activity is recorded.',
    icon: Play,
    tone: 'success',
  },
];
export function Workflow() {
  return (
    <section
      id="how-it-works"
      className="mk-workflow-section"
      aria-labelledby="workflow-title"
    >
      <div className="mk-wrap mk-section">
        <h2 id="workflow-title">
          Agents work.
          <br />
          You stay in control.
        </h2>
        <p className="mk-lede">
          A clear path from the first request to the next decision.
        </p>
        <ol className="mk-workflow">
          {steps.map(({ title, copy, icon: Icon, tone }, i) => (
            <li key={title}>
              <div className={'mk-workflow-node tone-' + tone}>
                <span className="mk-step-number">0{i + 1}</span>
                <Icon size={28} />
                <strong>{title}</strong>
                {title === 'Approve' && (
                  <span className="mk-human-gate">Human decision</span>
                )}
              </div>
              <p>{copy}</p>
              {i < 4 && (
                <span className="mk-step-arrow" aria-hidden="true">
                  <ArrowRight size={22} />
                  <ArrowDown size={22} />
                </span>
              )}
            </li>
          ))}
        </ol>
        <div className="mk-workflow-legend">
          <span>
            <i className="mk-swatch coral" />
            Human direction
          </span>
          <span>
            <i className="mk-swatch sky" />
            Agent action
          </span>
          <span>
            <i className="mk-swatch butter" />
            Waiting for approval
          </span>
          <span>
            <i className="mk-swatch sage" />
            Work completed
          </span>
        </div>
      </div>
    </section>
  );
}
