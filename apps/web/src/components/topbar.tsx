import { ChevronRight, Menu, ShieldCheck } from 'lucide-react';
import { Brand } from '../brand/BrandLockup';
export function Topbar({
  title,
  onMenu,
}: {
  title: string;
  onMenu: () => void;
}) {
  return (
    <header className="topbar">
      <div className="breadcrumb">
        <button
          className="mobile-menu icon-button"
          aria-label="Open navigation"
          onClick={onMenu}
        >
          <Menu size={21} />
        </button>
        <span className="mobile-brand">
          <Brand compact />
        </span>
        <span className="breadcrumb-root">Workspace</span>
        <ChevronRight className="breadcrumb-root" size={13} />
        <b>{title}</b>
      </div>
      <span className="private-label">
        <ShieldCheck size={14} />
        Private workspace
      </span>
    </header>
  );
}
