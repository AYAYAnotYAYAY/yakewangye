import type { SiteSettings } from "@quanyu/shared";

type FooterProps = {
  settings: SiteSettings;
};

export function Footer({ settings }: FooterProps) {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="site-footer-grid">
          {/* Brand */}
          <div>
            <div className="site-footer-brand">{settings.brandName}</div>
            <p className="site-footer-desc">{settings.footerDescription}</p>
            <a
              className="button primary site-footer-cta"
              href={settings.primaryContact.telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              💬 Telegram 咨询
            </a>
          </div>

          {/* Contact */}
          <div className="site-footer-col">
            <h4>联系方式</h4>
            <div>{settings.primaryContact.phone}</div>
            <div>{settings.primaryContact.address}</div>
            <div className="site-footer-link-wrap">
              <a
                href={settings.primaryContact.telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="site-footer-link"
              >
                {settings.primaryContact.telegramHandle}
              </a>
            </div>
          </div>

          {/* Quick links */}
          <div className="site-footer-col">
            <h4>快速导航</h4>
            {settings.navigation.map((item) => (
              <div key={item.id}>
                <a href={item.href} className="site-footer-link">
                  {item.label}
                </a>
              </div>
            ))}
          </div>
        </div>

        <div className="site-footer-bottom">
          <span>© {year} {settings.brandName}. 保留所有权利。</span>
          <span>黑龙江省黑河市 · 跨境牙科咨询</span>
        </div>
      </div>
    </footer>
  );
}
