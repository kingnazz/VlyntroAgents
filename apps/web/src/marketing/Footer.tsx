import { ArrowUpRight } from 'lucide-react';
import { MarketingBrand } from './Brand';
import { marketingLinks } from './config';
export function Footer() {
  return (
    <footer className="mk-footer mk-wrap">
      <div className="mk-footer-main">
        <a href="/" aria-label="Vlyntro Agents home">
          <MarketingBrand />
        </a>
        <nav aria-label="Footer">
          {marketingLinks.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
      </div>
      <div className="mk-footer-bottom">
        <span>© {new Date().getFullYear()} Vlyntro</span>
        <div>
          <a href="https://vlyntro.com">
            vlyntro.com
            <ArrowUpRight size={13} />
          </a>
          <a href="/login">
            Sign In
            <ArrowUpRight size={13} />
          </a>
        </div>
      </div>
    </footer>
  );
}
