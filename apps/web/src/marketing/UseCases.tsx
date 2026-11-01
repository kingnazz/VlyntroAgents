import { ArrowRight, BarChart3, Braces, FileText, Users } from 'lucide-react';
const patterns = [
  {
    title: 'Content operations',
    icon: FileText,
    steps: ['Research', 'Draft', 'Review', 'Approve', 'Publish'],
    copy: 'Keep the brief, draft, and final decision together.',
  },
  {
    title: 'Software development',
    icon: Braces,
    steps: ['Plan', 'Build', 'Review', 'Test', 'Deploy approval'],
    copy: 'Let agents prepare the work. Keep release decisions explicit.',
  },
  {
    title: 'Sales operations',
    icon: Users,
    steps: ['Research', 'Enrich', 'Draft', 'Review', 'Outreach approval'],
    copy: 'Coordinate preparation before a customer hears from you.',
  },
  {
    title: 'Internal operations',
    icon: BarChart3,
    steps: ['Analyze', 'Prepare', 'Escalate', 'Approve', 'Record'],
    copy: 'Turn scattered requests into visible, accountable work.',
  },
];
export function UseCases() {
  return (
    <section
      id="use-cases"
      className="mk-section mk-wrap"
      aria-labelledby="usecases-title"
    >
      <div className="mk-section-intro">
        <h2 id="usecases-title">
          Built for work that
          <br />
          crosses tools and agents.
        </h2>
        <p className="mk-lede">
          Start with the workflow your team already needs.
        </p>
      </div>
      <div className="mk-usecases">
        {patterns.map(({ title, icon: Icon, steps, copy }) => (
          <article key={title}>
            <Icon size={23} />
            <h3>{title}</h3>
            <p>{copy}</p>
            <ol>
              {steps.map((step, i) => (
                <li key={step}>
                  {i > 0 && <ArrowRight size={13} aria-hidden="true" />}
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </article>
        ))}
      </div>
      <p className="mk-pattern-note">
        Workflow patterns, configured around your tools. External publishing,
        outreach, and deployment steps require their own integrations and
        policies.
      </p>
    </section>
  );
}
