import {
  ArrowUpRight,
  Fingerprint,
  History,
  KeyRound,
  LockKeyhole,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { BrandFace } from '../brand/BrandFace';
import { requestAccessUrl } from './config';
export function Security() {
  return (
    <section
      className="mk-section mk-wrap mk-security"
      aria-labelledby="security-title"
    >
      <div className="mk-environment">
        <div className="mk-environment-top">
          <Server size={21} />
          <span>Your controlled environment</span>
          <LockKeyhole size={17} />
        </div>
        <div className="mk-environment-hq">
          <BrandFace size={44} />
          <strong>Agent HQ</strong>
          <span>Configured around your organization</span>
        </div>
        <div className="mk-environment-bottom">
          <span>Agents</span>
          <span>Workflows</span>
          <span>Project context</span>
        </div>
        <p>Dedicated deployment. Scoped access.</p>
      </div>
      <div>
        <h2 id="security-title">
          Your agents.
          <br />
          Your workflows.
          <br />
          Your environment.
        </h2>
        <p className="mk-lede">
          For organizations that want control over how agents communicate, what
          they can access, and which actions require approval.
        </p>
        <p>
          Vlyntro deploys and configures Agent HQ around your workflows and
          agents, in a controlled environment. Workspace and namespace
          permissions scope agent access; separate customer deployments keep
          environments isolated.
        </p>
        <div className="mk-security-facts">
          {[
            { icon: KeyRound, text: 'Scoped agent permissions' },
            { icon: Fingerprint, text: 'Hashed credentials and tokens' },
            { icon: ShieldCheck, text: 'Human approval gates' },
            { icon: History, text: 'Activity history and auditable actions' },
          ].map(({ icon: Icon, text }) => (
            <span key={text}>
              <Icon size={16} />
              {text}
            </span>
          ))}
        </div>
        <a className="mk-link" href={requestAccessUrl}>
          Talk to Vlyntro
          <ArrowUpRight size={16} />
        </a>
      </div>
    </section>
  );
}
