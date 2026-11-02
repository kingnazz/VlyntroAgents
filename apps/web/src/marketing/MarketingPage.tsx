import { MarketingNav } from './MarketingNav';
import { Hero } from './Hero';
import { TrustStrip } from './TrustStrip';
import { Problem } from './Problem';
import { Capabilities } from './Capabilities';
import { Workflow } from './Workflow';
import { HumanControl } from './HumanControl';
import { Agents } from './Agents';
import { CommandCenter } from './CommandCenter';
import { Conversation } from './Conversation';
import { UseCases } from './UseCases';
import { Security } from './Security';
import { FinalCTA } from './FinalCTA';
import { Footer } from './Footer';
import './marketing.css';
export function MarketingPage() {
  return (
    <div className="marketing">
      <a className="skip-link" href="#marketing-main">
        Skip to content
      </a>
      <MarketingNav />
      <main id="marketing-main">
        <Hero />
        <TrustStrip />
        <Problem />
        <Capabilities />
        <Workflow />
        <HumanControl />
        <Agents />
        <CommandCenter />
        <Conversation />
        <UseCases />
        <Security />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
