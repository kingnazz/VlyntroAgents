import { BrandFace } from '../brand/BrandFace';
export function MarketingBrand() {
  return (
    <span className="mk-brand">
      <BrandFace size={32} />
      <span>VLYNTRO</span> <span className="mk-brand-product">AGENTS</span>
    </span>
  );
}
