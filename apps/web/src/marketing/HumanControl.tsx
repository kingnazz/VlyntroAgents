import { ArrowRight, Check, LockKeyhole, ShieldCheck } from 'lucide-react';
export function HumanControl() {
  return (
    <section
      id="control"
      className="mk-section mk-wrap mk-control"
      aria-labelledby="control-title"
    >
      <div>
        <span className="mk-section-icon">
          <ShieldCheck size={22} />
        </span>
        <h2 id="control-title">
          Autonomous where it helps.
          <br />
          Human where it matters.
        </h2>
        <p className="mk-lede">
          Not every action should require permission. Not every action should
          happen without it.
        </p>
        <p>
          Let workflows continue automatically, with explicit approval gates in
          front of important actions.
        </p>
        <a className="mk-link" href="#conversation">
          Try a human decision
          <ArrowRight size={16} />
        </a>
      </div>
      <div className="mk-policy">
        <div className="mk-policy-title">
          <span>Workflow policy</span>
          <span className="mk-demo-label">Configuration example</span>
        </div>
        <div className="mk-policy-group">
          <h3>
            <span className="mk-policy-icon tone-success">
              <Check size={16} />
            </span>
            Keep work moving
          </h3>
          {['Draft content', 'Research', 'Analyze data', 'Prepare code'].map(
            (label) => (
              <div className="mk-policy-row" key={label}>
                <span>{label}</span>
                <span className="mk-policy-auto">
                  Automatic
                  <Check size={13} />
                </span>
              </div>
            ),
          )}
        </div>
        <div className="mk-policy-group mk-policy-gated">
          <h3>
            <span className="mk-policy-icon tone-human">
              <LockKeyhole size={16} />
            </span>
            Bring in a human
          </h3>
          {[
            'Publish content',
            'Send customer email',
            'Deploy production',
            'Modify sensitive settings',
          ].map((label) => (
            <div className="mk-policy-row" key={label}>
              <span>{label}</span>
              <span className="mk-policy-required">Requires approval</span>
            </div>
          ))}
        </div>
        <p className="mk-policy-note">
          Illustrative policy. Actions, approval gates, and external tools are
          configured for each deployment. These are not prebuilt publishing,
          email, or deployment integrations.
        </p>
      </div>
    </section>
  );
}
