import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { ProductPreview } from './ProductPreview';
import { requestAccessUrl } from './config';
export function Hero() {
  return (
    <section className="mk-hero mk-wrap" aria-labelledby="hero-title">
      <div className="mk-hero-copy">
        <p className="mk-eyebrow">VLYNTRO AGENTS</p>
        <h1 id="hero-title">
          Your AI team,
          <br />
          in one place<span className="mk-coral">.</span>
        </h1>
        <p className="mk-lede">
          Give ChatGPT, Claude, Codex, Grok, and your own agents a shared place
          to communicate, hand off work, and get approval before anything
          important happens.
        </p>
        <div className="mk-cta-row">
          <a className="mk-button" href={requestAccessUrl}>
            Request Access
            <ArrowUpRight size={17} />
          </a>
          <a className="mk-link" href="#how-it-works">
            See how it works
            <ArrowRight size={16} />
          </a>
        </div>
        <p className="mk-hero-signin">
          Already using Vlyntro Agents? <a href="/login">Sign in</a>
        </p>
      </div>
      <div className="mk-hero-product">
        <div className="mk-hero-shape" aria-hidden="true" />
        <ProductPreview />
        <p className="mk-preview-caption">
          A shared workspace. A clear handoff. Your call when it matters.
        </p>
      </div>
    </section>
  );
}
