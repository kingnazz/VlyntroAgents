'use client';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { BookmarkPlus, Plus, X } from 'lucide-react';
import { api, mutation } from '../api';
import type { BrainLink, Capture, Entity, Memory } from '../brain-types';

type Source = {
  type: 'message' | 'task' | 'run' | 'artifact';
  id: string;
  title: string;
  body: string;
};
type Actions = {
  save: (source: Source) => void;
  capture: () => void;
  canWrite: boolean;
};
const ActionsContext = createContext<Actions>({
  save: () => {},
  capture: () => {},
  canWrite: false,
});
export const useBrainActions = () => useContext(ActionsContext);
export function SaveToBrain({ source }: { source: Source }) {
  const actions = useBrainActions();
  if (!actions.canWrite) return null;
  return (
    <button
      className="brain-save secondary"
      onClick={() => actions.save(source)}
    >
      <BookmarkPlus size={14} />
      Save to Brain
    </button>
  );
}
export function BrainDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    el?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      'input:not([type="checkbox"]),textarea',
    )?.focus();
    return () => el?.close();
  }, []);
  return (
    <dialog className="modal brain-modal" ref={dialog} onCancel={onClose}>
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function MemoryForm({
  workspaceId,
  item,
  source,
  captureId,
  initialBody,
  onClose,
  onSaved,
  supersede = false,
}: {
  workspaceId: string;
  item?: Memory;
  source?: Source;
  captureId?: string;
  initialBody?: string;
  onClose: () => void;
  onSaved: () => void;
  supersede?: boolean;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [entities, setEntities] = useState<{
      projects: Entity[];
      people: Entity[];
      organizations: Entity[];
    }>({ projects: [], people: [], organizations: [] });
  const [links, setLinks] = useState<BrainLink[]>(
    item?.links.map(({ target_type, target_id, relation }) => ({
      target_type,
      target_id,
      relation,
    })) ?? [],
  );
  useEffect(() => {
    let current = true;
    void Promise.all(
      ['projects', 'people', 'organizations'].map((path) =>
        api<Entity[]>('/' + path + '?workspace_id=' + workspaceId),
      ),
    )
      .then(([projects, people, organizations]) => {
        if (current) setEntities({ projects, people, organizations });
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [workspaceId]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    const data = {
      kind: f.get('kind'),
      title: f.get('title'),
      body: f.get('body'),
      summary: f.get('summary') || null,
      importance: f.get('importance'),
      occurred_at: f.get('occurred_at')
        ? new Date(String(f.get('occurred_at'))).toISOString()
        : null,
      links,
    };
    try {
      if (captureId)
        await api(
          '/brain/inbox/' + captureId + '/confirm?workspace_id=' + workspaceId,
          mutation(data),
        );
      else if (item && !supersede)
        await api(
          '/brain/items/' + item.id + '?workspace_id=' + workspaceId,
          mutation(
            {
              ...data,
              expected_revision: item.revision_number,
              change_reason: f.get('reason') || undefined,
            },
            'PATCH',
          ),
        );
      else if (item && supersede)
        await api(
          '/brain/items/' + item.id + '/supersede?workspace_id=' + workspaceId,
          mutation({
            ...data,
            expected_revision: item.revision_number,
            source_type: 'manual',
          }),
        );
      else
        await api(
          '/brain/items',
          mutation({
            ...data,
            workspace_id: workspaceId,
            source_type: source?.type ?? 'manual',
            source_id: source?.id,
          }),
        );
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <BrainDialog
      title={
        supersede
          ? 'Supersede memory'
          : item
            ? 'Edit memory'
            : source
              ? 'Save to Brain'
              : 'New memory'
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        {source && (
          <p className="muted">
            Source: {source.type} · {source.id.slice(0, 8)}. Original authorship
            stays attached.
          </p>
        )}
        <div className="form-grid">
          <label>
            Kind
            <select
              aria-label="Kind"
              name="kind"
              defaultValue={item?.kind ?? 'note'}
            >
              {[
                'note',
                'fact',
                'observation',
                'decision',
                'preference',
                'idea',
                'reference',
              ].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label>
            Importance
            <select
              name="importance"
              aria-label="Importance"
              defaultValue={item?.importance ?? 'normal'}
            >
              {['low', 'normal', 'high', 'critical'].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Title
          <input
            name="title"
            aria-label="Title"
            autoFocus
            required
            maxLength={240}
            defaultValue={item?.title ?? source?.title ?? ''}
          />
        </label>
        <label>
          Content
          <textarea
            name="body"
            aria-label="Content"
            required
            maxLength={16000}
            defaultValue={item?.body ?? source?.body ?? initialBody ?? ''}
            rows={6}
          />
        </label>
        <label>
          Summary
          <textarea
            name="summary"
            aria-label="Summary"
            maxLength={2000}
            defaultValue={item?.summary ?? ''}
          />
        </label>
        <label>
          Occurred at (optional)
          <input
            name="occurred_at"
            aria-label="Occurred at (optional)"
            type="datetime-local"
            defaultValue={
              item?.occurred_at
                ? new Date(
                    new Date(item.occurred_at).getTime() -
                      new Date(item.occurred_at).getTimezoneOffset() * 60000,
                  )
                    .toISOString()
                    .slice(0, 16)
                : ''
            }
          />
        </label>
        {(['project', 'person', 'organization'] as const).map((type, i) => (
          <fieldset className="brain-links-picker" key={type}>
            <legend>
              Related {['projects', 'people', 'organizations'][i]}
            </legend>
            {entities[
              (['projects', 'people', 'organizations'] as const)[i]
            ].map((entity) => (
              <label key={entity.id}>
                <input
                  type="checkbox"
                  checked={links.some((l) => l.target_id === entity.id)}
                  onChange={(e) =>
                    setLinks((prev) =>
                      e.target.checked
                        ? [
                            ...prev,
                            {
                              target_type: type,
                              target_id: entity.id,
                              relation: 'ABOUT',
                            },
                          ]
                        : prev.filter((l) => l.target_id !== entity.id),
                    )
                  }
                />
                {entity.name ?? entity.display_name}
              </label>
            ))}
          </fieldset>
        ))}
        {item && !supersede && (
          <label>
            Change reason
            <input name="reason" maxLength={1000} />
          </label>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save memory'}
        </button>
      </form>
    </BrainDialog>
  );
}
export function BrainActionsProvider({
  workspaceId,
  canWrite,
  onChanged,
  children,
}: {
  workspaceId: string;
  canWrite: boolean;
  onChanged: () => void;
  children: ReactNode;
}) {
  const [mode, setMode] = useState<'capture' | 'memory' | null>(null),
    [source, setSource] = useState<Source | undefined>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [captured, setCaptured] = useState<Capture | null>(null);
  const captureKey = useRef('');
  function openCapture() {
    captureKey.current = crypto.randomUUID();
    setCaptured(null);
    setError('');
    setMode('capture');
  }
  useEffect(() => {
    if (!canWrite) return;
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        captureKey.current = crypto.randomUUID();
        setCaptured(null);
        setError('');
        setMode('capture');
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [canWrite]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const c = await api<Capture>(
        '/brain/capture',
        mutation({
          workspace_id: workspaceId,
          raw_text: f.get('raw_text'),
          idempotency_key: captureKey.current,
        }),
      );
      setCaptured(c);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ActionsContext.Provider
      value={{
        save: (s) => {
          setSource(s);
          setMode('memory');
        },
        capture: openCapture,
        canWrite,
      }}
    >
      {children}
      {mode === 'memory' && (
        <MemoryForm
          workspaceId={workspaceId}
          source={source}
          onClose={() => setMode(null)}
          onSaved={onChanged}
        />
      )}
      {mode === 'capture' && (
        <BrainDialog title="Capture" onClose={() => setMode(null)}>
          {captured ? (
            <div className="capture-success" role="status">
              <h3>Captured</h3>
              <p>
                {captured.sensitive
                  ? 'Held for human review. Secret-like content will not be sent to agents.'
                  : 'Your original text is saved. Processing will begin when a provider is available. You can also convert it manually in Brain Inbox.'}
              </p>
              <button className="primary" onClick={() => setMode(null)}>
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <p className="muted">
                A thought, a conversation, a decision. Capture now; organize
                later.
              </p>
              <label>
                What would you like to remember?
                <textarea
                  autoFocus
                  name="raw_text"
                  required
                  maxLength={16000}
                  rows={7}
                  placeholder="Met John from Acme today…"
                />
              </label>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <button className="primary" disabled={busy || !workspaceId}>
                <Plus size={16} />
                {busy ? 'Saving…' : 'Capture'}
              </button>
              <small className="muted">
                ⌘K / Ctrl+K · Raw text is preserved.
              </small>
            </form>
          )}
        </BrainDialog>
      )}
    </ActionsContext.Provider>
  );
}
