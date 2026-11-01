'use client';
import { useState, useEffect } from 'react';
import { api, date } from '../api';
import type { Run, Agent } from '../types';
import {
  PageHeader as PageHeading,
  StatusBadge as Badge,
  Panel,
  LoadingState,
} from '../components/ui';

export function RunView({ id, agents }: { id: string; agents: Agent[] }) {
  const [run, setRun] = useState<Run | null>(null),
    [steps, setSteps] = useState<
      {
        id: string;
        name: string;
        status: string;
        output: { summary?: string };
        error?: string;
      }[]
    >([]),
    [error, setError] = useState('');
  useEffect(() => {
    void Promise.all([
      api<Run>('/runs/' + id),
      api<typeof steps>('/runs/' + id + '/steps'),
    ])
      .then(([r, s]) => {
        setRun(r);
        setSteps(s);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  if (!run)
    return error ? (
      <p className="error" role="alert">
        {error}
      </p>
    ) : (
      <LoadingState label="Loading run..." />
    );
  return (
    <>
      <PageHeading
        eyebrow={'EXECUTION / ' + id.slice(0, 8)}
        title={agents.find((a) => a.id === run.agent_id)?.display_name + ' run'}
        description={date(run.started_at)}
        action={<Badge status={run.status} />}
      />
      <Panel title="Execution summary">
        <p className="panel-note">
          {run.output_summary || run.error || 'Agent is working.'}
        </p>
        <p className="panel-note muted">{run.input_summary}</p>
      </Panel>
      <Panel title="Action steps">
        <div className="run-steps">
          {steps.map((s, i) => (
            <div key={s.id}>
              <span className="step-number">{i + 1}</span>
              <div>
                <h3>{s.name}</h3>
                <p>{s.output?.summary || s.error || 'Action recorded.'}</p>
              </div>
              <Badge status={s.status} />
            </div>
          ))}
        </div>
      </Panel>
      <p className="fineprint muted">
        Action summaries show what happened. Private model reasoning is never
        stored or displayed.
      </p>
    </>
  );
}
