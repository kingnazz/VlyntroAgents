'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Activity,
  Command,
  FileText,
  Hash,
  Layers3,
  ListTodo,
  LogOut,
  Radio,
  Settings2,
  ShieldCheck,
  Zap,
  ChevronsUpDown,
  X,
  Brain,
  CalendarDays,
  Folder,
  Users,
  Inbox,
  GitBranch,
} from 'lucide-react';
import { Brand } from '../brand/BrandLockup';
import type { Agent, Channel, User, Workspace } from '../types';
import { AgentAvatar } from './ui';
export function Sidebar({
  screen,
  selected,
  workspace,
  workspaces,
  agents,
  channels,
  user,
  pending,
  connected,
  open,
  onWorkspace,
  onNavigate,
  onClose,
  onLogout,
}: {
  screen: string;
  selected: string;
  workspace: string;
  workspaces: Workspace[];
  agents: Agent[];
  channels: Channel[];
  user: User;
  pending: number;
  connected: boolean;
  open: boolean;
  onWorkspace: (value: string) => void;
  onNavigate: (view: string, id?: string) => void;
  onClose: () => void;
  onLogout: () => void;
}) {
  const aside = useRef<HTMLElement>(null);
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1025px)');
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!open || desktop) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    aside.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key === 'Tab') {
        const elements = Array.from(
          aside.current?.querySelectorAll<HTMLElement>('button,select') ?? [],
        ).filter((e) => e.getClientRects().length > 0);
        const first = elements[0],
          last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keydown);
      previous?.focus();
    };
  }, [open, desktop, onClose]);
  const nav = (
    view: string,
    label: string,
    icon: ReactNode,
    id = '',
    count = 0,
  ) => (
    <button
      key={id || view}
      aria-label={label}
      aria-current={
        screen === view && (!id || selected === id) ? 'page' : undefined
      }
      className={
        'nav-item ' +
        (screen === view && (!id || selected === id) ? 'active' : '')
      }
      onClick={() => onNavigate(view, id)}
    >
      {icon}
      <span>{label}</span>
      {count > 0 && <span className="nav-count">{count}</span>}
    </button>
  );
  return (
    <>
      <button
        className={'sidebar-overlay ' + (open ? 'visible' : '')}
        tabIndex={open ? 0 : -1}
        aria-label="Close navigation"
        onClick={onClose}
      />
      <aside
        ref={aside}
        inert={!desktop && !open}
        className={'sidebar ' + (open ? 'open' : '')}
        aria-label="Workspace navigation"
      >
        <div className="sidebar-brand-row">
          <button
            className="brand-home"
            aria-label="Vlyntro Agent HQ home"
            onClick={() => onNavigate('overview')}
          >
            <Brand />
          </button>
          <button
            className="icon-button sidebar-close"
            aria-label="Close navigation"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <label className="workspace-picker">
          <span className="workspace-icon">
            <Layers3 size={16} />
          </span>
          <select
            aria-label="Workspace"
            value={workspace}
            onChange={(e) => onWorkspace(e.target.value)}
          >
            {workspaces.length ? (
              workspaces.map((w) => (
                <option key={w.id} value={w.slug}>
                  {w.name}
                </option>
              ))
            ) : (
              <option value="vlyntro">Vlyntro</option>
            )}
          </select>
          <ChevronsUpDown size={13} />
        </label>
        <nav>
          <div className="nav-section">TODAY</div>
          {nav('today', 'Today', <CalendarDays size={17} />)}
          {nav('overview', 'Command Center', <Command size={17} />)}
          <div className="nav-section">BRAIN</div>
          {nav('memory', 'Memory', <Brain size={17} />)}
          {nav('projects', 'Projects', <Folder size={17} />)}
          {nav('people', 'People', <Users size={17} />)}
          {nav('decisions', 'Decisions', <GitBranch size={17} />)}
          {user.role !== 'viewer' &&
            nav('inbox', 'Brain Inbox', <Inbox size={17} />)}
          <div className="nav-section">MESSAGES</div>
          {channels.map((c) =>
            nav('channel', c.name, <Hash size={17} />, c.id),
          )}
          <div className="nav-section">
            AGENTS{' '}
            <span>
              {agents.filter((a) => a.agent_type !== 'system').length}
            </span>
          </div>
          {agents
            .filter((a) => a.agent_type !== 'system')
            .map((a) =>
              nav(
                'agent',
                a.display_name,
                <AgentAvatar name={a.display_name} />,
                a.id,
              ),
            )}
          <div className="nav-section">WORK</div>
          {nav('tasks', 'Tasks', <ListTodo size={17} />)}
          {nav(
            'approvals',
            'Approvals',
            <ShieldCheck size={17} />,
            '',
            pending,
          )}
          {nav('runs', 'Runs', <Zap size={17} />)}
          {nav('artifacts', 'Artifacts', <FileText size={17} />)}
          <div className="nav-section">SYSTEM</div>
          {nav('blackboard', 'Blackboard', <Layers3 size={17} />)}
          {nav('activity', 'Activity', <Activity size={17} />)}
          {nav('settings', 'Settings', <Settings2 size={17} />)}
        </nav>
        <div className="sidebar-bottom">
          <div className="live-label">
            <span className={'dot ' + (connected ? 'green' : 'amber')} />
            {connected ? 'Live connection' : 'Reconnecting'}
            <Radio size={13} />
          </div>
          <button className="profile" onClick={onLogout} title="Sign out">
            <AgentAvatar name={user.display_name || 'N'} actorType="user" />
            <span>
              {user.display_name || 'Loading'}
              <small>{user.role || 'Private workspace'}</small>
            </span>
            <LogOut size={15} />
          </button>
        </div>
      </aside>
    </>
  );
}
