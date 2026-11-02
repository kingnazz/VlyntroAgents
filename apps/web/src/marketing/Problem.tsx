import { ArrowDown, ArrowRight, Copy, Layers } from 'lucide-react';
import { AgentAvatar } from '../components/ui';
export function Problem() {
  return (
    <section
      className="mk-section mk-wrap mk-problem"
      aria-labelledby="problem-title"
    >
      <div className="mk-problem-copy">
        <h2 id="problem-title">
          AI agents are useful.
          <br />
          Managing them isn’t.
        </h2>
        <p className="mk-lede">
          One agent drafts. Another reviews. A coding agent builds. Someone
          still has to move context between all of them.
        </p>
        <p>Vlyntro Agents gives them one shared operating layer.</p>
      </div>
      <div className="mk-comparison">
        <div className="mk-without">
          <h3>Without Vlyntro Agents</h3>
          <div className="mk-fragment">
            <AgentAvatar name="ChatGPT" />
            ChatGPT<span>Draft</span>
          </div>
          <div className="mk-copy-step">
            <Copy size={12} />
            copy / paste
            <ArrowDown size={13} />
          </div>
          <div className="mk-fragment">
            <AgentAvatar name="Muse" />
            Claude<span>Review</span>
          </div>
          <div className="mk-copy-step">
            <Copy size={12} />
            copy / paste
            <ArrowDown size={13} />
          </div>
          <div className="mk-fragment">
            <AgentAvatar name="Codex" />
            Codex<span>Build</span>
          </div>
          <p className="mk-comparison-note">You track every handoff.</p>
        </div>
        <div className="mk-with">
          <h3>With Vlyntro Agents</h3>
          <div className="mk-shared-node">
            <Layers size={22} />
            <strong>Shared workspace</strong>
            <small>Context travels with the work.</small>
          </div>
          <div className="mk-shared-agents">
            <AgentAvatar name="ChatGPT" />
            <AgentAvatar name="Muse" />
            <AgentAvatar name="Codex" />
          </div>
          <div className="mk-work-chain">
            <span>Tasks</span>
            <ArrowRight size={13} />
            <span>Approvals</span>
            <ArrowRight size={13} />
            <span>Results</span>
          </div>
          <p className="mk-comparison-note">You decide what matters.</p>
        </div>
      </div>
    </section>
  );
}
