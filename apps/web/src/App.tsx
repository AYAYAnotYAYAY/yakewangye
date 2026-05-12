import type { Article, CmsContent, Doctor, GalleryAsset, LandingPage, Language, PageSection, PricingItem, ServiceItem } from "@quanyu/shared";
import { cmsContentSeed } from "@quanyu/shared";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Footer } from "../components/layout/footer";
import { Header } from "../components/layout/header";
import { LanguageMenu } from "../components/language-menu";
import { SectionRenderer } from "../components/section-renderer";
import { ChatWidget } from "./components/chat-widget";
import { ADMIN_TOKEN_STORAGE_KEY, detectPreferredLanguage, fetchContent, resolveAssetUrl, saveContent, sendAnalyticsEvent } from "./lib/api";
import {
  DEFAULT_LANGUAGE,
  normalizeLanguage,
  readStoredLanguage,
  resolveContentForLanguage,
  uiDictionary,
  updateLocalizedContentDraft,
  writeStoredLanguage,
  type UiDictionary,
} from "./lib/i18n";
import { AdminPage } from "./pages/admin-page";
import { MobileMediaPage } from "./pages/mobile-media-page";

const CONTENT_CACHE_KEY = "quanyu_cached_content";
const VISITOR_ID_KEY = "quanyu_visitor_id";
const ANALYTICS_SESSION_ID_KEY = "quanyu_analytics_session_id";

function getStableBrowserId(key: string) {
  try {
    const existing = window.localStorage.getItem(key);

    if (existing) {
      return existing;
    }

    const next = `${key}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(key, next);
    return next;
  } catch {
    return `${key}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function detectSearchEngine(referrer: string) {
  if (!referrer) return undefined;

  try {
    const host = new URL(referrer).hostname.toLowerCase();
    if (host.includes("google.")) return "google";
    if (host.includes("yandex.")) return "yandex";
    if (host.includes("baidu.")) return "baidu";
    if (host.includes("bing.")) return "bing";
    if (host.includes("sogou.")) return "sogou";
    return host;
  } catch {
    return undefined;
  }
}

function usePathname() {
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const handler = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  return pathname;
}

function readCachedContent() {
  try {
    const raw = window.localStorage.getItem(CONTENT_CACHE_KEY);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as CmsContent;
  } catch {
    return null;
  }
}

function writeCachedContent(content: CmsContent) {
  try {
    window.localStorage.setItem(CONTENT_CACHE_KEY, JSON.stringify(content));
  } catch {
    // ignore cache write errors
  }
}

function updateUrlLanguage(language: Language) {
  const url = new URL(window.location.href);
  url.searchParams.set("lang", language);
  window.history.replaceState({}, "", url.toString());
}

function readUrlLanguage() {
  return normalizeLanguage(new URL(window.location.href).searchParams.get("lang"));
}

function PageShell(props: {
  content: CmsContent;
  language: Language;
  dictionary: UiDictionary;
  onLanguageChange: (language: Language) => void;
  children: ReactNode;
}) {
  return (
    <main id="top">
      <Header
        settings={props.content.siteSettings}
        language={props.language}
        dictionary={props.dictionary}
        onLanguageChange={props.onLanguageChange}
      />
      <MediaBackdropWall items={props.content.gallery} />
      {props.children}
      <Footer settings={props.content.siteSettings} dictionary={props.dictionary} />
      <ChatWidget
        telegramUrl={props.content.telegramConfig.contactUrl || props.content.siteSettings.primaryContact.telegramUrl}
        language={props.language}
        dictionary={props.dictionary}
      />
    </main>
  );
}

function MediaBackdropWall(props: { items: GalleryAsset[] }) {
  const items = props.items.filter((item) => item.imageUrl).slice(0, 10);

  if (!items.length) {
    return null;
  }

  return (
    <div className="site-media-backdrop" aria-hidden="true">
      <div className="site-media-backdrop-track">
        {[...items, ...items].map((item, index) => (
          <div key={`${item.id}-${index}`} className="site-media-backdrop-tile">
            {item.mediaType === "video" ? (
              <video src={resolveAssetUrl(item.imageUrl)} muted autoPlay loop playsInline preload="metadata" />
            ) : (
              <img src={resolveAssetUrl(item.imageUrl)} alt="" loading="lazy" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RuntimeNotice(props: { message: string; dictionary: UiDictionary }) {
  return (
    <section className="runtime-notice-wrap">
      <div className="container">
        <div className="card runtime-notice-card">
          <strong>{props.dictionary.runtimeFallbackTitle}</strong>
          <p>{props.message}</p>
        </div>
      </div>
    </section>
  );
}

function EmptyState(props: { title: string; description: string; dictionary: UiDictionary }) {
  return (
    <section>
      <div className="container">
        <div className="card list-page">
          <h1>{props.title}</h1>
          <p>{props.description}</p>
          <a className="button secondary" href="/admin">
            {props.dictionary.addContentCta}
          </a>
        </div>
      </div>
    </section>
  );
}

function MediaPreview(props: { src: string; alt: string; mediaType?: "image" | "video" }) {
  if (!props.src) {
    return <div className="media-placeholder">{props.alt}</div>;
  }

  if (props.mediaType === "video") {
    return <video className="entity-image" src={resolveAssetUrl(props.src)} controls muted playsInline preload="metadata" />;
  }

  return <img className="entity-image" src={resolveAssetUrl(props.src)} alt={props.alt} />;
}

function FeaturedGalleryShowcase(props: { items: GalleryAsset[]; dictionary: UiDictionary }) {
  const items = props.items.filter((item) => item.imageUrl).slice(0, 8);

  if (!items.length) {
    return null;
  }

  const primary = items[0];

  return (
    <section id="gallery-showcase" className="gallery-showcase-section">
      <div className="container">
        <div className="gallery-showcase">
          <div className="gallery-showcase-head">
            <span className="eyebrow">{props.dictionary.galleryEyebrow}</span>
            <h2>{props.dictionary.galleryTitle}</h2>
            <p>{props.dictionary.galleryDescription}</p>
          </div>
          <div className="gallery-showcase-grid">
            <div className="gallery-showcase-main">
              {primary.mediaType === "video" ? (
                <video src={resolveAssetUrl(primary.imageUrl)} muted autoPlay loop playsInline preload="metadata" />
              ) : (
                <img src={resolveAssetUrl(primary.imageUrl)} alt={primary.title} />
              )}
            </div>
            <div className="gallery-showcase-side">
              {items.slice(1, 5).map((item) => (
                <div key={item.id} className="gallery-showcase-tile">
                  {item.mediaType === "video" ? (
                    <video src={resolveAssetUrl(item.imageUrl)} muted autoPlay loop playsInline preload="metadata" />
                  ) : (
                    <img src={resolveAssetUrl(item.imageUrl)} alt={item.title} loading="lazy" />
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="gallery-showcase-caption">
            <strong>{primary.title}</strong>
            <span>{primary.summary}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function ArticleList(props: { items: Article[]; anchorId?: string; dictionary: UiDictionary }) {
  return props.items.length ? (
    <section id={props.anchorId}>
      <div className="container">
        <div className="section-heading">
          <span className="eyebrow">{props.dictionary.articleEyebrow}</span>
          <h2>{props.dictionary.articleTitle}</h2>
          <p>{props.dictionary.articleDescription}</p>
        </div>
        <div className="grid-3">
          {props.items.map((item) => (
            <article key={item.id} className="card entity-card">
              <MediaPreview src={item.coverImage} alt={item.title} />
              <div className="entity-body">
                <div className="entity-meta">{item.category}</div>
                <h3>{item.title}</h3>
                <p>{item.excerpt}</p>
                <div className="entity-note">{item.seoTitle || item.publishedAt}</div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  ) : (
    <EmptyState
      title={props.dictionary.emptyArticleTitle}
      description={props.dictionary.emptyArticleDescription}
      dictionary={props.dictionary}
    />
  );
}

function DoctorList(props: { items: Doctor[]; anchorId?: string; dictionary: UiDictionary }) {
  return props.items.length ? (
    <section id={props.anchorId}>
      <div className="container">
        <div className="section-heading">
          <span className="eyebrow">{props.dictionary.doctorEyebrow}</span>
          <h2>{props.dictionary.doctorTitle}</h2>
          <p>{props.dictionary.doctorDescription}</p>
        </div>
        <div className="grid-3">
          {props.items.map((item) => (
            <article key={item.id} className="card entity-card">
              <MediaPreview src={item.image} alt={item.name} />
              <div className="entity-body">
                <h3>{item.name}</h3>
                <div className="entity-meta">{item.title}</div>
                <p>{item.summary}</p>
                <div className="entity-note">
                  {item.experience} | {item.specialties.join(" / ")}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  ) : (
    <EmptyState
      title={props.dictionary.emptyDoctorTitle}
      description={props.dictionary.emptyDoctorDescription}
      dictionary={props.dictionary}
    />
  );
}

function ServiceList(props: { items: ServiceItem[]; anchorId?: string; dictionary: UiDictionary }) {
  return props.items.length ? (
    <section id={props.anchorId}>
      <div className="container">
        <div className="section-heading">
          <span className="eyebrow">{props.dictionary.serviceEyebrow}</span>
          <h2>{props.dictionary.serviceTitle}</h2>
          <p>{props.dictionary.serviceDescription}</p>
        </div>
        <div className="grid-3">
          {props.items.map((item) => (
            <article key={item.id} className="card entity-card">
              <MediaPreview src={item.image} alt={item.name} />
              <div className="entity-body">
                <div className="entity-meta">{item.category}</div>
                <h3>{item.name}</h3>
                <p>{item.summary}</p>
                <div className="entity-note">{item.details}</div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  ) : (
    <EmptyState
      title={props.dictionary.emptyServiceTitle}
      description={props.dictionary.emptyServiceDescription}
      dictionary={props.dictionary}
    />
  );
}

function PricingList(props: { items: PricingItem[]; anchorId?: string; dictionary: UiDictionary }) {
  return props.items.length ? (
    <section id={props.anchorId}>
      <div className="container">
        <div className="section-heading">
          <span className="eyebrow">{props.dictionary.pricingEyebrow}</span>
          <h2>{props.dictionary.pricingTitle}</h2>
          <p>{props.dictionary.pricingDescription}</p>
        </div>
        <div className="grid-3">
          {props.items.map((item) => (
            <article key={item.id} className="card entity-card">
              <div className="entity-body">
                <div className="entity-meta">{item.category}</div>
                <h3>{item.name}</h3>
                <div className="price-value">{item.price}</div>
                <p>{item.notes}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  ) : (
    <EmptyState
      title={props.dictionary.emptyPricingTitle}
      description={props.dictionary.emptyPricingDescription}
      dictionary={props.dictionary}
    />
  );
}

function GalleryList(props: { items: GalleryAsset[]; anchorId?: string; dictionary: UiDictionary }) {
  return props.items.length ? (
    <section id={props.anchorId}>
      <div className="container">
        <div className="section-heading">
          <span className="eyebrow">{props.dictionary.galleryEyebrow}</span>
          <h2>{props.dictionary.galleryTitle}</h2>
          <p>{props.dictionary.galleryDescription}</p>
        </div>
        <div className="grid-3">
          {props.items.map((item) => (
            <article key={item.id} className="card entity-card">
              <MediaPreview src={item.imageUrl} alt={item.title} mediaType={item.mediaType} />
              <div className="entity-body">
                <div className="entity-meta">{item.mediaType === "video" ? props.dictionary.videoLabel : props.dictionary.imageLabel}</div>
                <h3>{item.title}</h3>
                <p>{item.summary}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  ) : (
    <EmptyState
      title={props.dictionary.emptyGalleryTitle}
      description={props.dictionary.emptyGalleryDescription}
      dictionary={props.dictionary}
    />
  );
}

function TriageFlowSection(props: { content: CmsContent; dictionary: UiDictionary }) {
  return (
    <section id="ai-chat">
      <div className="container">
        <div className="card longpage-flow-card">
          <div className="section-heading longpage-flow-heading">
            <span className="eyebrow">{props.dictionary.triageEyebrow}</span>
            <h2>{props.dictionary.triageTitle}</h2>
            <p>{props.dictionary.triageDescription}</p>
          </div>
          <div className="longpage-flow-grid">
            {[
              {
                title: props.dictionary.triageSteps[0],
                summary: props.content.homePage.sections[0]?.type === "hero" ? props.content.homePage.sections[0].aiPanel.steps[0] : "",
              },
              {
                title: props.dictionary.triageSteps[1],
                summary: props.content.homePage.sections[0]?.type === "hero" ? props.content.homePage.sections[0].aiPanel.steps[1] : "",
              },
              {
                title: props.dictionary.triageSteps[2],
                summary: props.content.homePage.sections[0]?.type === "hero" ? props.content.homePage.sections[0].aiPanel.steps[2] : "",
              },
            ].map((item, index) => (
              <article key={item.title} className="card longpage-flow-step">
                <div className="longpage-flow-index">0{index + 1}</div>
                <h3>{item.title}</h3>
                <p>{item.summary}</p>
              </article>
            ))}
          </div>
          <div className="longpage-cta-row">
            <a
              className="button primary"
              href={props.content.telegramConfig.contactUrl || props.content.siteSettings.primaryContact.telegramUrl}
              target="_blank"
              rel="noreferrer"
            >
              {props.dictionary.triagePrimaryCta}
            </a>
            <a className="button secondary" href="#services">
              {props.dictionary.triageSecondaryCta}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function ContactBand(props: { content: CmsContent; dictionary: UiDictionary }) {
  const telegramUrl = props.content.telegramConfig.contactUrl || props.content.siteSettings.primaryContact.telegramUrl;

  return (
    <section id="contact">
      <div className="container">
        <div className="card longpage-contact-card">
          <div className="longpage-contact-copy">
            <span className="eyebrow">{props.dictionary.contactEyebrow}</span>
            <h2>{props.dictionary.contactTitle}</h2>
            <p>{props.dictionary.contactDescription}</p>
          </div>
          <div className="longpage-contact-grid">
            <article className="card longpage-contact-item">
              <div className="entity-meta">{props.dictionary.phoneLabel}</div>
              <strong>{props.content.siteSettings.primaryContact.phone}</strong>
              <p>{props.dictionary.phoneNote}</p>
            </article>
            <article className="card longpage-contact-item">
              <div className="entity-meta">{props.dictionary.addressLabel}</div>
              <strong>{props.content.siteSettings.primaryContact.address}</strong>
              <p>{props.dictionary.addressNote}</p>
            </article>
            <article className="card longpage-contact-item">
              <div className="entity-meta">{props.dictionary.telegramLabel}</div>
              <strong>{props.content.siteSettings.primaryContact.telegramHandle}</strong>
              <p>{props.dictionary.telegramNote}</p>
            </article>
          </div>
          <div className="longpage-cta-row">
            <a className="button primary" href={telegramUrl} target="_blank" rel="noreferrer">
              {props.dictionary.contactPrimaryCta}
            </a>
            <a className="button secondary" href="#top">
              {props.dictionary.contactSecondaryCta}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function CustomPageView(props: { page?: LandingPage; dictionary: UiDictionary }) {
  if (!props.page) {
    return (
      <EmptyState
        title={props.dictionary.emptyPageTitle}
        description={props.dictionary.emptyPageDescription}
        dictionary={props.dictionary}
      />
    );
  }

  return (
    <section>
      <div className="container">
        <article className="card list-page">
          <div className="eyebrow">{props.dictionary.customPageEyebrow}</div>
          <h1>{props.page.title}</h1>
          <p>{props.page.summary}</p>
          <div className="prose-block">{props.page.content}</div>
        </article>
      </div>
    </section>
  );
}

export function App() {
  const pathname = usePathname();
  const [content, setContent] = useState<CmsContent>(cmsContentSeed);
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE);
  const [loading, setLoading] = useState(true);
  const [visualSaving, setVisualSaving] = useState(false);
  const [warning, setWarning] = useState("");
  const dictionary = uiDictionary[language];
  const contentWithFallbackI18n = useMemo(
    () => (content.i18n ? content : { ...content, i18n: cmsContentSeed.i18n }),
    [content],
  );
  const resolvedContent = useMemo(
    () => resolveContentForLanguage(contentWithFallbackI18n, language),
    [contentWithFallbackI18n, language],
  );
  const homeSectionsWithIndex = resolvedContent.homePage.sections.map((section, index) => ({ section, index }));
  const heroSections = homeSectionsWithIndex.filter((entry) => entry.section.type === "hero");
  const gallerySections = homeSectionsWithIndex.filter((entry) => entry.section.type === "gallery");
  const deferredHomeSections = homeSectionsWithIndex.filter((entry) => entry.section.type === "services" || entry.section.type === "journey");
  const supportingHomeSections = homeSectionsWithIndex.filter(
    (entry) => entry.section.type !== "hero" && entry.section.type !== "gallery" && entry.section.type !== "services" && entry.section.type !== "journey",
  );
  const visibility = {
    ...cmsContentSeed.siteSettings.sectionVisibility,
    ...(resolvedContent.siteSettings.sectionVisibility ?? {}),
  };
  const visibleDeferredHomeSections = deferredHomeSections.filter(
    (entry) => (entry.section.type === "services" && visibility.homeServices) || (entry.section.type === "journey" && visibility.homeJourney),
  );

  const applyLanguage = (nextLanguage: Language, persist = true) => {
    setLanguage(nextLanguage);
    if (persist) {
      writeStoredLanguage(nextLanguage);
    }
    updateUrlLanguage(nextLanguage);
  };

  useEffect(() => {
    const urlLanguage = readUrlLanguage();
    const storedLanguage = readStoredLanguage();
    const browserLanguage = normalizeLanguage(window.navigator.language);

    if (urlLanguage) {
      applyLanguage(urlLanguage);
      return;
    }

    if (storedLanguage) {
      applyLanguage(storedLanguage, false);
      return;
    }

    detectPreferredLanguage()
      .then((result) => {
        applyLanguage(result.preferredLanguage, false);
      })
      .catch(() => {
        applyLanguage(browserLanguage ?? DEFAULT_LANGUAGE, false);
      });
  }, []);

  useEffect(() => {
    let active = true;

    const cached = readCachedContent();
    if (cached && active) {
      setContent(cached);
    }

    const run = async () => {
      try {
        const remote = await fetchContent();
        if (active) {
          setContent(remote);
          writeCachedContent(remote);
          setWarning("");
        }
      } catch (fetchError) {
        if (active) {
          const fallback = cached ?? cmsContentSeed;
          setContent(fallback);
          setWarning(
            cached
              ? "网络暂时不稳定，页面已切换为最近一次成功读取的内容。你可以稍后下拉刷新再试。"
              : `网络暂时不稳定，页面已切换为本地兜底内容。原始错误：${String(fetchError)}`,
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    run();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = resolvedContent.homePage.seoTitle || resolvedContent.homePage.title;

    const ensureMeta = (name: "description" | "og:locale", attr: "name" | "property") => {
      let element = document.head.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attr, name);
        document.head.appendChild(element);
      }
      return element;
    };

    ensureMeta("description", "name").setAttribute("content", resolvedContent.homePage.seoDescription || "");
    ensureMeta("og:locale", "property").setAttribute(
      "content",
      language === "ru" ? "ru_RU" : language === "en" ? "en_US" : "zh_CN",
    );
  }, [language, resolvedContent.homePage.seoDescription, resolvedContent.homePage.seoTitle, resolvedContent.homePage.title]);

  useEffect(() => {
    if (pathname.startsWith("/admin")) {
      return;
    }

    const startedAt = Date.now();
    const visitorId = getStableBrowserId(VISITOR_ID_KEY);
    const sessionId = getStableBrowserId(ANALYTICS_SESSION_ID_KEY);
    const referrer = document.referrer || "";

    const basePayload = {
      sessionId,
      visitorId,
      pageUrl: window.location.href,
      pageTitle: document.title,
      referrer,
      searchEngine: detectSearchEngine(referrer),
      language,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      screen: {
        width: window.screen.width,
        height: window.screen.height,
      },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      extra: {
        colorDepth: window.screen.colorDepth,
        hardwareConcurrency: window.navigator.hardwareConcurrency,
        deviceMemory: "deviceMemory" in window.navigator ? (window.navigator as Navigator & { deviceMemory?: number }).deviceMemory : undefined,
      },
    };

    void sendAnalyticsEvent({
      ...basePayload,
      eventName: "page_start",
    }).catch(() => undefined);

    return () => {
      void sendAnalyticsEvent({
        ...basePayload,
        eventName: "page_leave",
        dwellTimeMs: Math.max(0, Date.now() - startedAt),
      }).catch(() => undefined);
    };
  }, [language, pathname]);

  const updateVisualSection = (sectionIndex: number, nextSection: PageSection) => {
    setContent((current) => {
      const nextContent = updateLocalizedContentDraft(current, language, (localized) => ({
        ...localized,
        homePage: {
          ...localized.homePage,
          sections: localized.homePage.sections.map((section, index) =>
            index === sectionIndex ? nextSection : section,
          ),
        },
      }));
      writeCachedContent(nextContent);
      return nextContent;
    });
  };

  const saveVisualContent = async () => {
    const token = window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);

    if (!token) {
      window.alert("请先登录后台，再进入可视化编辑。");
      window.location.href = "/admin";
      return;
    }

    setVisualSaving(true);

    try {
      const response = await saveContent(content, token);
      setContent(response.content);
      writeCachedContent(response.content);
      window.alert("可视化编辑内容已保存。");
    } catch (error) {
      window.alert(`保存失败: ${String(error)}`);
    } finally {
      setVisualSaving(false);
    }
  };

  if (pathname === "/admin") {
    return <AdminPage content={content} onSaved={setContent} />;
  }

  if (pathname === "/admin/visual") {
    const hasAdminToken = Boolean(window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY));

    return (
      <PageShell content={resolvedContent} language={language} dictionary={dictionary} onLanguageChange={applyLanguage}>
        <section className="visual-editor-bar-wrap">
          <div className="container">
            <div className="visual-editor-bar card">
              <div>
                <div className="eyebrow">Visual Edit</div>
                <h1>直接在首页改文字</h1>
                <p>点击页面中的虚线文字即可编辑。当前只编辑首页模块文案，保存后写入当前语言内容。</p>
              </div>
              <div className="visual-editor-actions">
                <LanguageMenu language={language} label={dictionary.langLabel} onChange={applyLanguage} />
                <a className="button secondary" href="/admin">
                  返回后台
                </a>
                <button className="button primary" onClick={saveVisualContent} type="button" disabled={visualSaving || !hasAdminToken}>
                  {visualSaving ? "保存中..." : hasAdminToken ? "保存可视化修改" : "需要先登录后台"}
                </button>
              </div>
            </div>
          </div>
        </section>
        {warning ? <RuntimeNotice message={warning} dictionary={dictionary} /> : null}
        {heroSections.map(({ section, index }) => (
          <SectionRenderer
            key={section.id}
            section={section}
            editable
            onSectionChange={(nextSection) => updateVisualSection(index, nextSection)}
          />
        ))}
        {visibility.galleryShowcase ? <FeaturedGalleryShowcase items={resolvedContent.gallery} dictionary={dictionary} /> : null}
        {gallerySections.map(({ section, index }) => (
          <SectionRenderer
            key={section.id}
            section={section}
            editable
            onSectionChange={(nextSection) => updateVisualSection(index, nextSection)}
          />
        ))}
        {visibility.galleryList ? <GalleryList items={resolvedContent.gallery} anchorId="gallery" dictionary={dictionary} /> : null}
        {supportingHomeSections.map(({ section, index }) => (
          <SectionRenderer
            key={section.id}
            section={section}
            editable
            onSectionChange={(nextSection) => updateVisualSection(index, nextSection)}
          />
        ))}
        {visibility.doctors ? <DoctorList items={resolvedContent.doctors} anchorId="doctors" dictionary={dictionary} /> : null}
        {visibility.pricing ? <PricingList items={resolvedContent.pricing} anchorId="pricing" dictionary={dictionary} /> : null}
        {visibility.articles ? <ArticleList items={resolvedContent.articles} anchorId="articles" dictionary={dictionary} /> : null}
        {visibility.consultationPrep ? <TriageFlowSection content={resolvedContent} dictionary={dictionary} /> : null}
        {visibleDeferredHomeSections.map(({ section, index }) => (
          <SectionRenderer
            key={section.id}
            section={section}
            editable
            onSectionChange={(nextSection) => updateVisualSection(index, nextSection)}
          />
        ))}
        {visibility.serviceList ? <ServiceList items={resolvedContent.services} anchorId="services" dictionary={dictionary} /> : null}
        <ContactBand content={resolvedContent} dictionary={dictionary} />
      </PageShell>
    );
  }

  if (pathname === "/admin/album") {
    return <MobileMediaPage />;
  }

  if (loading && pathname !== "/admin" && pathname !== "/admin/album") {
    return (
      <PageShell content={resolvedContent} language={language} dictionary={dictionary} onLanguageChange={applyLanguage}>
        <section>
          <div className="container">
            <div className="card list-page">
              <h1>{dictionary.loadingTitle}</h1>
              <p>{dictionary.loadingDescription}</p>
            </div>
          </div>
        </section>
      </PageShell>
    );
  }

  // 所有内容都在首页单页滚动展示，不再跳转子页面
  return (
    <PageShell content={resolvedContent} language={language} dictionary={dictionary} onLanguageChange={applyLanguage}>
      {warning ? <RuntimeNotice message={warning} dictionary={dictionary} /> : null}
      {heroSections.map(({ section }) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
      {visibility.galleryShowcase ? <FeaturedGalleryShowcase items={resolvedContent.gallery} dictionary={dictionary} /> : null}
      {gallerySections.map(({ section }) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
      {visibility.galleryList ? <GalleryList items={resolvedContent.gallery} anchorId="gallery" dictionary={dictionary} /> : null}
      {supportingHomeSections.map(({ section }) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
      {visibility.doctors ? <DoctorList items={resolvedContent.doctors} anchorId="doctors" dictionary={dictionary} /> : null}
      {visibility.pricing ? <PricingList items={resolvedContent.pricing} anchorId="pricing" dictionary={dictionary} /> : null}
      {visibility.articles ? <ArticleList items={resolvedContent.articles} anchorId="articles" dictionary={dictionary} /> : null}
      {visibility.consultationPrep ? <TriageFlowSection content={resolvedContent} dictionary={dictionary} /> : null}
      {visibleDeferredHomeSections.map(({ section }) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
      {visibility.serviceList ? <ServiceList items={resolvedContent.services} anchorId="services" dictionary={dictionary} /> : null}
      <ContactBand content={resolvedContent} dictionary={dictionary} />
    </PageShell>
  );
}
