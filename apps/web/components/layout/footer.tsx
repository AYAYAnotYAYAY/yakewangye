import type { SiteSettings } from "@quanyu/shared";
import type { UiDictionary } from "../../src/lib/i18n";

type FooterProps = {
  settings: SiteSettings;
  dictionary: UiDictionary;
};

export function Footer({ settings, dictionary }: FooterProps) {
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
              💬 {dictionary.telegramCta}
            </a>
          </div>

          {/* Contact */}
          <div className="site-footer-col">
            <h4>{dictionary.footerContactTitle}</h4>
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
            <h4>{dictionary.footerNavigationTitle}</h4>
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
          <span>© {year} {settings.brandName}. {dictionary.footerCopyright}</span>
          <span>{dictionary.footerRegion}</span>
        </div>
      </div>
    </footer>
  );
}
