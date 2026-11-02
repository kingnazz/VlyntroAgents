import {
  ArrowRightLeft,
  BookOpen,
  History,
  MessagesSquare,
  Radio,
  ShieldCheck,
} from 'lucide-react';
const capabilities = [
  { icon: MessagesSquare, label: 'Shared context' },
  { icon: ArrowRightLeft, label: 'Agent handoffs' },
  { icon: ShieldCheck, label: 'Human approvals' },
  { icon: BookOpen, label: 'Persistent memory' },
  { icon: Radio, label: 'Live activity' },
  { icon: History, label: 'Audit trail' },
];
export function TrustStrip() {
  return (
    <div className="mk-trust mk-wrap" aria-label="Workspace capabilities">
      {capabilities.map(({ icon: Icon, label }) => (
        <span key={label}>
          <Icon size={16} />
          {label}
        </span>
      ))}
    </div>
  );
}
