import type { ReactNode } from 'react';
import {
  AudioLines,
  Braces,
  ChevronDown,
  Feather,
  Inbox,
  Network,
  Workflow,
} from 'lucide-react';
import { BrandFace } from '../brand/BrandFace';
import { agentTone, statusTone } from '../brand/brand';
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={'badge tone-' + statusTone(status)}>
      <span className="dot" />
      {status.replaceAll('_', ' ')}
    </span>
  );
}
export function AgentAvatar({
  name,
  large = false,
  actorType,
}: {
  name: string;
  large?: boolean;
  actorType?: string;
}) {
  const icon =
    name === 'ChatGPT' ? (
      <AudioLines />
    ) : name === 'Muse' ? (
      <Feather />
    ) : name === 'Codex' ? (
      <Braces />
    ) : name === 'Grokbot' ? (
      <Network />
    ) : name === 'System' ? (
      <Workflow />
    ) : (
      name.slice(0, 1)
    );
  return (
    <span
      aria-hidden="true"
      className={
        'avatar tone-' +
        (actorType === 'user' ? 'human' : agentTone(name)) +
        (large ? ' large' : '')
      }
    >
      {icon}
    </span>
  );
}
export function EmptyState({
  icon = <Inbox size={22} />,
  title,
  children,
  brand = false,
}: {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
  brand?: boolean;
}) {
  return (
    <div className="empty">
      <span className={brand ? 'empty-brand' : 'empty-icon'}>
        {brand ? <BrandFace size={38} /> : icon}
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function LoadingState({
  label = 'Connecting to your workspace...',
}: {
  label?: string;
}) {
  return (
    <div className="loading-state" role="status">
      <BrandFace size={32} />
      <span>{label}</span>
    </div>
  );
}
export function Panel({
  title,
  aside,
  children,
  className = '',
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={'panel ' + className}>
      <div className="panel-heading">
        <h2>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>
          {title}
          <span className="heading-dot">.</span>
        </h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Filter({
  label,
  value,
  onChange,
  values,
  labels,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  values: string[];
  labels?: string[];
}) {
  return (
    <label className="filter">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">
          {label === 'Status'
            ? 'All statuses'
            : label === 'Priority'
              ? 'All priorities'
              : 'All ' + label.toLowerCase() + 's'}
        </option>
        {values.map((v, i) => (
          <option value={v} key={v}>
            {labels?.[i] ?? v.replaceAll('_', ' ')}
          </option>
        ))}
      </select>
      <ChevronDown size={13} />
    </label>
  );
}
