import type { Article, CmsContent, Doctor, GalleryAsset, LandingPage, PricingItem, ServiceItem } from "@quanyu/shared";
import { cmsContentSeed } from "@quanyu/shared";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Footer } from "../components/layout/footer";
import { Header } from "../components/layout/header";
import { SectionRenderer } from "../components/section-renderer";
import { ChatWidget } from "./components/chat-widget";
import { fetchContent, resolveAssetUrl } from "./lib/api";
import { AdminPage } from "./pages/admin-page";
import { MobileMediaPage } from "./pages/mobile-media-page";

const CONTENT_CACHE_KEY = "quanyu_cached_content";

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

function PageShell(props: { content: CmsContent; children: ReactNode }) {
  return (
    <main id="top">
      <Header settings={props.content.siteSettings} />
      {props.children}
      <Footer settings={props.content.siteSettings} />
      <ChatWidget telegramUrl={props.content.telegramConfig.contactUrl || props.content.siteSettings.primaryContact.telegramUrl} />
    </main>
  );
}

function RuntimeNotice(props: { message: string }) {
  return (
    <section className="runtime-notice-wrap">
      <div className="container">
        <div className="card runtime-notice-card">
          <strong>当前显示的是兜底内容</strong>
          <p>{props.message}</p>
        </div>
      </div>
    </section>
  );
}

function EmptyState(props: { title: string; description: string }) {
  return (
    <section>
      <div className="container">
        <div className="card list-page">
          <h1>{props.title}</h1>
          <p>{props.description}</p>
          <a className="button secondary" href="/admin">
            去后台添加内容
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

function ArticleList(props: { items: Article[]; anchorId?: string }) {
  return props.items.length ? (
    <section id={props.anchorId}>
      <div className="container">
        <div className="section-heading">
          <span className="eyebrow">文章</span>
          <h2>文章内容与 SEO 入口</h2>
          <p>文章可以在后台新建、修改标题、摘要、正文、封面图和 SEO 字段。</p>
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
    <EmptyState title="暂无文章" description="后台还没有录入文章内容。" />
  );
}

function DoctorList(props: { items: Doctor[]; anchorId?: string }) {
  return props.items.length ? (
    <section id={props.anchorId}>
      <div className="container">
        <div className="section-heading">
          <span className="eyebrow">医生</span>
          <h2>医生介绍</h2>
          <p>姓名、职称、经验、擅长方向和头像都可以在后台维护。</p>
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
    <EmptyState title="暂无医生资料" description="后台还没有录入医生介绍。" />
  );
}

function ServiceList(props: { items: ServiceItem[]; anchorId?: string }) {
  return props.items.length ? (
    <section id={props.anchorId}>
      <div className="container">
        <div className="section-heading">
          <span className="eyebrow">服务</span>
          <h2>服务介绍</h2>
          <p>服务页会读取后台的服务列表，你可以在后台新增项目和说明。</p>
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
    <EmptyState title="暂无服务内容" description="后台还没有录入服务介绍。" />
  );
}

function PricingList(props: { items: PricingItem[]; anchorId?: string }) {
  return props.items.length ? (
    <section id={props.anchorId}>
      <div className="container">
        <div className="section-heading">
          <span className="eyebrow">价格</span>
          <h2>价格说明</h2>
          <p>价格项目、分类、备注都在后台维护，适合后续接不同渠道报价策略。</p>
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
    <EmptyState title="暂无价格内容" description="后台还没有录入价格说明。" />
  );
}

function GalleryList(props: { items: GalleryAsset[]; anchorId?: string }) {
  return props.items.length ? (
    <section id={props.anchorId}>
      <div className="container">
        <div className="section-heading">
          <span className="eyebrow">图册</span>
          <h2>图册与视频展示</h2>
          <p>支持图片和视频素材，后台可直接本地上传或从素材库复用。</p>
        </div>
        <div className="grid-3">
          {props.items.map((item) => (
            <article key={item.id} className="card entity-card">
              <MediaPreview src={item.imageUrl} alt={item.title} mediaType={item.mediaType} />
              <div className="entity-body">
                <div className="entity-meta">{item.mediaType === "video" ? "视频" : "图片"}</div>
                <h3>{item.title}</h3>
                <p>{item.summary}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  ) : (
    <EmptyState title="暂无图册内容" description="后台还没有录入图册或视频内容。" />
  );
}

function TriageFlowSection(props: { content: CmsContent }) {
  return (
    <section id="ai-chat">
      <div className="container">
        <div className="card longpage-flow-card">
          <div className="section-heading longpage-flow-heading">
            <span className="eyebrow">AI 导诊</span>
            <h2>先在线问诊，再进入 Telegram 和真人医生沟通</h2>
            <p>首页在手机上最重要的不是塞更多入口，而是让来访用户一路往下翻时，随时知道下一步该怎么做。</p>
          </div>
          <div className="longpage-flow-grid">
            {[
              {
                title: "描述症状或项目",
                summary: "牙疼、缺牙、修复、美白、种植、价格咨询，都可以先问。",
              },
              {
                title: "AI 先做初筛",
                summary: "先判断是否紧急、是否高意向、是否应该尽快转真人。",
              },
              {
                title: "继续发片子和资料",
                summary: "高意向用户直接转 Telegram，继续发影像、问价格和预约。",
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
              现在去 Telegram
            </a>
            <a className="button secondary" href="#services">
              继续看项目和价格
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function ContactBand(props: { content: CmsContent }) {
  const telegramUrl = props.content.telegramConfig.contactUrl || props.content.siteSettings.primaryContact.telegramUrl;

  return (
    <section id="contact">
      <div className="container">
        <div className="card longpage-contact-card">
          <div className="longpage-contact-copy">
            <span className="eyebrow">联系方式</span>
            <h2>翻到最后，直接联系，不再让用户跳来跳去</h2>
            <p>手机用户通常不会耐心点很多子页面。最后这一屏就是电话、地址、Telegram 和下一步动作，看到就能立刻转化。</p>
          </div>
          <div className="longpage-contact-grid">
            <article className="card longpage-contact-item">
              <div className="entity-meta">电话</div>
              <strong>{props.content.siteSettings.primaryContact.phone}</strong>
              <p>适合直接联系、回拨和快速确认。</p>
            </article>
            <article className="card longpage-contact-item">
              <div className="entity-meta">地址</div>
              <strong>{props.content.siteSettings.primaryContact.address}</strong>
              <p>适合继续讲路线、住宿和跨境到诊。</p>
            </article>
            <article className="card longpage-contact-item">
              <div className="entity-meta">Telegram</div>
              <strong>{props.content.siteSettings.primaryContact.telegramHandle}</strong>
              <p>适合继续发片子、问价格、约时间。</p>
            </article>
          </div>
          <div className="longpage-cta-row">
            <a className="button primary" href={telegramUrl} target="_blank" rel="noreferrer">
              直接去 Telegram
            </a>
            <a className="button secondary" href="#top">
              返回顶部
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function CustomPageView(props: { page?: LandingPage }) {
  if (!props.page) {
    return <EmptyState title="页面不存在" description="没有找到这个自定义页面。" />;
  }

  return (
    <section>
      <div className="container">
        <article className="card list-page">
          <div className="eyebrow">自定义页面</div>
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
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState("");

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

  if (pathname === "/admin") {
    return <AdminPage content={content} onSaved={setContent} />;
  }

  if (pathname === "/admin/album") {
    return <MobileMediaPage />;
  }

  if (loading && pathname !== "/admin" && pathname !== "/admin/album") {
    return (
      <PageShell content={content}>
        <section>
          <div className="container">
            <div className="card list-page">
              <h1>加载中</h1>
              <p>正在读取后台内容。</p>
            </div>
          </div>
        </section>
      </PageShell>
    );
  }

  // 所有内容都在首页单页滚动展示，不再跳转子页面
  return (
    <PageShell content={content}>
      {warning ? <RuntimeNotice message={warning} /> : null}
      {content.homePage.sections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
      <TriageFlowSection content={content} />
      <ServiceList items={content.services} anchorId="services" />
      <DoctorList items={content.doctors} anchorId="doctors" />
      <PricingList items={content.pricing} anchorId="pricing" />
      <GalleryList items={content.gallery} anchorId="gallery" />
      <ArticleList items={content.articles} anchorId="articles" />
      <ContactBand content={content} />
    </PageShell>
  );
}
