'use client';
import { useState, useEffect } from 'react';
import { api, date, mutation } from '../api';
import type { Document, User, Event } from '../types';
import { PageHeader as PageHeading, Panel } from '../components/ui';

const coreMemoryKeys = [
  'brand_bible',
  'weekly_brief',
  'pipeline',
  'performance_log',
];
const keyOrder = (key: string) => {
  const index = coreMemoryKeys.indexOf(key);
  return index < 0 ? coreMemoryKeys.length : index;
};

export function Blackboard({
  user,
  onError,
  events,
}: {
  user: User;
  onError: (message: string) => void;
  events: Event[];
}) {
  const [keys, setKeys] = useState<Document[]>([]),
    [selected, setSelected] = useState('brand_bible'),
    [doc, setDoc] = useState<Document | null>(null),
    [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    void api<Document[]>('/state/vlyntro-ig')
      .then(setKeys)
      .catch((e) => onError(e.message));
  }, [events, onError]);
  useEffect(() => {
    setDirty(false);
    void api<Document>('/state/vlyntro-ig/' + selected)
      .then((d) => {
        setDoc(d);
        setText(JSON.stringify(d.value, null, 2));
      })
      .catch((e) => onError(e.message));
  }, [selected, onError]);
  async function save() {
    if (!doc) return;
    setBusy(true);
    try {
      const result = await api<Document>(
        '/state/vlyntro-ig/' + selected,
        mutation({ value: JSON.parse(text), expected_version: doc.version }),
      );
      setDoc(result);
      setDirty(false);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="SHARED MEMORY / VLYNTRO-IG"
        title="Blackboard"
        description="Versioned context shared by agents, with every write audited."
      />
      <div className="blackboard-tabs">
        {[...keys]
          .sort(
            (a, b) =>
              keyOrder(a.key) - keyOrder(b.key) || a.key.localeCompare(b.key),
          )
          .map((k) => (
            <button
              className={selected === k.key ? 'active' : ''}
              key={k.key}
              onClick={() => setSelected(k.key)}
            >
              <small>VLYNTRO-IG</small>
              {k.key.replaceAll('_', ' ')}
              <span>v{k.version}</span>
              <em>
                {date(k.updated_at)}
                <br />
                Editor {k.updated_by.slice(0, 12)}
              </em>
            </button>
          ))}
      </div>
      {doc && (
        <Panel
          title={doc.key}
          aside={<span className="muted">Version {doc.version}</span>}
        >
          <div className="memory-meta">
            <span>
              Namespace <strong>vlyntro-ig</strong>
            </span>
            <span>
              Key <code>{doc.key}</code>
            </span>
            <span>
              Version <strong>{doc.version}</strong>
            </span>
          </div>
          <label htmlFor="state-json" className="sr-only">
            Document JSON
          </label>
          <textarea
            id="state-json"
            className="json-editor"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setDirty(true);
            }}
            readOnly={
              user.role === 'viewer' ||
              (selected === 'brand_bible' && user.role !== 'owner')
            }
            spellCheck={false}
          />
          <div className="editor-footer">
            <span className="muted">
              Updated by {doc.updated_by} · {date(doc.updated_at)}
            </span>
            {user.role !== 'viewer' && (
              <button
                className="primary"
                onClick={save}
                disabled={!dirty || busy}
              >
                {busy ? 'Saving...' : 'Save version'}
              </button>
            )}
          </div>
        </Panel>
      )}
    </>
  );
}
