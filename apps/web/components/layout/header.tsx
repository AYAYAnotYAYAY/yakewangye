import type { SiteSettings } from "@quanyu/shared";
import { useEffect, useRef, useState } from "react";

type HeaderProps = {
  settings: SiteSettings;
};

function toAnchor(href: string): string {
  if (href.startsWith("#")) return href;
  if (href.startsWith("/") && href.length > 1) return `#${href.slice(1)}`;
  return href;
}

export function Header({ settings }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const handleNavClick = () => setMenuOpen(false);

  return (
    <header className={`site-header${scrolled ? " scrolled" : ""}`} ref={navRef as React.RefObject<HTMLElement>}>
      <div className="site-header-inner">
        {/* Logo */}
        <a href="#" className="site-logo">
          <span className="site-logo-notice">{settings.topbarNotice}</span>
          <span className="site-logo-name">{settings.brandName}</span>
        </a>

        {/* Desktop nav */}
        <nav className="site-nav">
          {settings.navigation.map((item) => (
            <a key={item.id} href={toAnchor(item.href)} onClick={handleNavClick}>
              {item.label}
            </a>
          ))}
          <a
            className="button primary site-nav-cta"
            href={settings.primaryContact.telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            💬 Telegram 咨询
          </a>
        </nav>

        {/* Mobile hamburger */}
        <button
          className={`site-menu-toggle${menuOpen ? " open" : ""}`}
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="菜单"
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {/* Mobile drawer */}
      <div className={`site-nav-mobile${menuOpen ? " open" : ""}`}>
        {settings.navigation.map((item) => (
          <a key={item.id} href={toAnchor(item.href)} onClick={handleNavClick}>
            {item.label}
          </a>
        ))}
        <a
          className="button primary"
          href={settings.primaryContact.telegramUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleNavClick}
        >
          💬 Telegram 咨询
        </a>
      </div>
    </header>
  );
}
