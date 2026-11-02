import { sql } from '../packages/db/src/client.js';
import { searchBrain } from '../packages/shared/src/brain/retrieval.js';
// Read-only EXPLAIN of the actual parameterized application query. No document text,
// connection settings or parameter values are printed.
type Plan = {
  'Node Type': string;
  'Index Name'?: string;
  'Actual Rows'?: number;
  Plans?: Plan[];
};
const originalDebug = sql.options.debug;
try {
  const [owner] =
    await sql`SELECT id FROM users WHERE role='owner' ORDER BY created_at LIMIT 1`;
  const [workspace] = await sql`SELECT id FROM workspaces WHERE slug='vlyntro'`;
  if (!owner || !workspace)
    throw new Error('An existing owner and workspace are required.');
  for (const q of ['', process.env.BRAIN_PLAN_QUERY ?? 'architecture']) {
    let statement: { query: string; parameters: unknown[] } | undefined;
    sql.options.debug = (_connection, query, parameters) => {
      if (query.startsWith('SELECT b.id,b.workspace_id'))
        statement = { query, parameters };
    };
    await searchBrain(
      { type: 'user', id: owner.id, role: 'owner' },
      { workspace_id: workspace.id, q, limit: 30 },
    );
    sql.options.debug = originalDebug;
    if (!statement) throw new Error('Search query was not captured.');
    const result = await sql.unsafe(
      'EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ' + statement.query,
      statement.parameters as never,
    );
    const plan = result[0]['QUERY PLAN'][0];
    const nodes: { node: string; index?: string; rows?: number }[] = [];
    function collect(node: Plan) {
      nodes.push({
        node: node['Node Type'],
        index: node['Index Name'],
        rows: node['Actual Rows'],
      });
      for (const child of node.Plans ?? []) collect(child);
    }
    collect(plan.Plan);
    console.info(
      JSON.stringify({
        search: q ? 'text' : 'recent',
        planning_ms: plan['Planning Time'],
        execution_ms: plan['Execution Time'],
        nodes,
      }),
    );
  }
} finally {
  sql.options.debug = originalDebug;
  await sql.end();
}
