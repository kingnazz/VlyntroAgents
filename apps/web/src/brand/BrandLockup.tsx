import { BrandFace } from './BrandFace';
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={'brand-lockup' + (compact ? ' compact' : '')}>
      <BrandFace size={compact ? 29 : 40} />
      <span className="brand-type">
        <span className="brand-wordmark">
          vlyntro<span>.</span>
        </span>
        <span className="brand-caption">Agent HQ</span>
      </span>
    </span>
  );
}
