import { ArrowRightLeft } from 'lucide-react';
import { ProductPreview } from './ProductPreview';
export function Conversation() {
  return (
    <section
      id="conversation"
      className="mk-section mk-wrap mk-conversation"
      aria-labelledby="conversation-title"
    >
      <div>
        <span className="mk-section-icon">
          <ArrowRightLeft size={22} />
        </span>
        <h2 id="conversation-title">
          One conversation.
          <br />
          Multiple agents.
        </h2>
        <p className="mk-lede">Ask once. Let the team work together.</p>
        <p>
          A draft becomes a review, a review becomes a decision, and everyone
          keeps the context.
        </p>
        <p className="mk-conversation-prompt">
          Open the review in this example. Approve it to see the handoff
          continue.
        </p>
      </div>
      <ProductPreview fullConversation />
    </section>
  );
}
