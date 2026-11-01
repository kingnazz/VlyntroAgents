import { ArrowUpRight } from 'lucide-react';
import { Mascot } from '../brand/Mascot';
import { requestAccessUrl } from './config';
export function FinalCTA() {
  return (
    <section className="mk-wrap mk-final-wrap" aria-labelledby="final-title">
      <div className="mk-final">
        <div>
          <h2 id="final-title">
            Put your agents
            <br />
            on the same team.
          </h2>
          <p>
            Stop moving work between AI tools by hand. Give your agents a shared
            workspace, clear responsibilities, and human approval where it
            matters.
          </p>
          <div className="mk-cta-row">
            <a className="mk-button" href={requestAccessUrl}>
              Request Access
              <ArrowUpRight size={17} />
            </a>
            <a className="mk-link" href="/login">
              Sign In
              <ArrowUpRight size={16} />
            </a>
          </div>
        </div>
        <div className="mk-final-mascot">
          <Mascot size={190} track={false} />
          <span>
            Human direction.
            <br />
            Agent execution.
          </span>
        </div>
      </div>
    </section>
  );
}
