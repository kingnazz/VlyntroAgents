import { AudioLines, Braces, Feather, Network, Puzzle } from 'lucide-react';
export function Agents() {
  return (
    <section
      className="mk-section mk-wrap mk-agents"
      aria-labelledby="agents-title"
    >
      <h2 id="agents-title">
        Bring the agents
        <br />
        you already use.
      </h2>
      <p className="mk-lede">
        Vlyntro Agents is the coordination layer. Your agents can keep using the
        models and tools that make sense for their job.
      </p>
      <div className="mk-providers">
        {[
          { name: 'ChatGPT', provider: 'OpenAI', icon: AudioLines },
          { name: 'Claude', provider: 'Anthropic', icon: Feather },
          { name: 'Codex', provider: 'Command adapter', icon: Braces },
          { name: 'Grok', provider: 'xAI', icon: Network },
          { name: 'Your agents', provider: 'Scoped MCP access', icon: Puzzle },
        ].map(({ name, provider, icon: Icon }) => (
          <div key={name}>
            <span>
              <Icon size={25} />
            </span>
            <strong>{name}</strong>
            <small>{provider}</small>
          </div>
        ))}
      </div>
      <p className="mk-provider-note">
        Flexible provider configuration. OpenAI, Anthropic, and xAI adapters
        require your credentials; Codex requires a configured command adapter.
        Custom agents connect through scoped MCP tools. Availability depends on
        your deployment.
      </p>
    </section>
  );
}
