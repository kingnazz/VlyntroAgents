'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { MarketingBrand } from './Brand';
import { marketingLinks, requestAccessUrl } from './config';
export function MarketingNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) =>
      setScrolled(!entry.isIntersecting),
    );
    if (sentinel.current) observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menu.current?.contains(event.target) &&
        !toggle.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', outside);
    };
  }, [open]);
  return (
    <>
      <div className="mk-nav-sentinel" ref={sentinel} aria-hidden="true" />
      <header className="mk-nav" data-defined={scrolled || open}>
        <nav className="mk-wrap mk-nav-inner" aria-label="Primary">
          <a href="/" aria-label="Vlyntro Agents home" className="mk-home">
            <MarketingBrand />
          </a>
          <div className="mk-nav-links">
            {marketingLinks.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </div>
          <div className="mk-nav-actions">
            <a className="mk-signin" href="/login">
              Sign In
            </a>
            <a className="mk-button mk-button-small" href={requestAccessUrl}>
              Request Access
              <ArrowUpRight size={15} />
            </a>
            <button
              ref={toggle}
              className="mk-menu-toggle"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              aria-controls="marketing-menu"
              onClick={() => setOpen(!open)}
            >
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </nav>
        <div
          id="marketing-menu"
          ref={menu}
          className="mk-mobile-menu"
          hidden={!open}
        >
          {marketingLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => {
                setOpen(false);
                toggle.current?.focus();
              }}
            >
              {link.label}
              <ArrowUpRight size={20} />
            </a>
          ))}
          <a href="/login">
            Sign In
            <ArrowUpRight size={20} />
          </a>
        </div>
      </header>
    </>
  );
}
