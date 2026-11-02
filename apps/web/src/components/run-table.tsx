'use client';
import { Zap } from 'lucide-react';
import { date } from '../api';
import type { Run, Agent } from '../types';
import { Panel, StatusBadge as Badge, EmptyState as Empty } from './ui';

export function RunTable({
  runs,
  agents,
  onRun,
}: {
  runs: Run[];
  agents: Agent[];
  onRun: (id: string) => void;
}) {
  return (
    <Panel title="Execution history">
      {runs.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Run</th>
                <th>Agent</th>
                <th>Status</th>
                <th>Started</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} onClick={() => onRun(r.id)}>
                  <td>
                    <button
                      className="row-title"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRun(r.id);
                      }}
                    >
                      {r.output_summary.slice(0, 75) ||
                        r.error ||
                        'Agent execution'}
                    </button>
                    <span className="row-id">{r.id.slice(0, 8)}</span>
                  </td>
                  <td>
                    {agents.find((a) => a.id === r.agent_id)?.display_name ??
                      'Agent'}
                  </td>
                  <td>
                    <Badge status={r.status} />
                  </td>
                  <td className="nowrap muted">{date(r.started_at)}</td>
                  <td>
                    {r.completed_at
                      ? Math.max(
                          0,
                          Math.round(
                            (+new Date(r.completed_at) -
                              +new Date(r.started_at)) /
                              1000,
                          ),
                        ) + 's'
                      : 'In progress'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon={<Zap size={23} />} title="No runs yet">
          Each agent attempt creates a run with visible action summaries.
        </Empty>
      )}
    </Panel>
  );
}
