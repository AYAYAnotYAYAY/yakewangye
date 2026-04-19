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

function usePathname() {
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const handler = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  return pathname;
}

function PageShell(props: { content: CmsContent; children: ReactNode }) {
  return (
    <main>
      <Header settings={props.content.siteSettings} />
      {props.children}
      <Footer settings={props.content.siteSettings} />
      <ChatWidget telegramUrl={props.content.telegramConfig.contactUrl || props.content.siteSettings.primaryContact.telegramUrl} />
    </main>
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

function MediaPreview(props: { src: string; alt: string }) {
  if (!props.src) {
    return <div className="media-placeholder">{props.alt}</div>;
  }

  return <img className="entity-image" src={resolveAssetUrl(props.src)} alt={props.alt} />;
}

function ArticleList(props: { items: Article[] }) {
  return props.items.length ? (
    <section>
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

function DoctorList(props: { items: Doctor[] }) {
  return props.items.length ? (
    <section>
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

function ServiceList(props: { items: ServiceItem[] }) {
  return props.items.length ? (
    <section>
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

function PricingList(props: { items: PricingItem[] }) {
  return props.items.length ? (
    <section>
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

function GalleryList(props: { items: GalleryAsset[] }) {
  return props.items.length ? (
    <section>
      <div className="container">
        <div className="section-heading">
          <span className="eyebrow">图册</span>
          <h2>图册与视频展示</h2>
          <p>支持图片上传，视频可以先通过封面图与说明展示。</p>
        </div>
        <div className="grid-3">
          {props.items.map((item) => (
            <article key={item.id} className="card entity-card">
              <MediaPreview src={item.imageUrl} alt={item.title} />
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
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        const remote = await fetchContent();
        if (active) {
          setContent(remote);
        }
      } catch (fetchError) {
        if (active) {
          setError(String(fetchError));
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

  if (loading && pathname !== "/admin") {
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

  if (error && pathname !== "/admin") {
    return (
      <PageShell content={content}>
        <section>
          <div className="container">
            <div className="card list-page">
              <h1>内容读取失败</h1>
              <p>{error}</p>
            </div>
          </div>
        </section>
      </PageShell>
    );
  }

  // 所有内容都在首页单页滚动展示，不再跳转子页面
  return (
    <PageShell content={content}>
      {/* 首页 hero + 核心 sections */}
      {content.homePage.sections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}

      {/* 服务项目 */}
      <div id="services">
        <ServiceList items={content.services} />
      </div>

      {/* 医生团队 */}
      <div id="doctors">
        <DoctorList items={content.doctors} />
      </div>

      {/* 价格说明 */}
      <div id="pricing">
        <PricingList items={content.pricing} />
      </div>

      {/* 图册视频 */}
      <div id="gallery">
        <GalleryList items={content.gallery} />
      </div>

      {/* 文章内容 */}
      <div id="articles">
        <ArticleList items={content.articles} />
      </div>
    </PageShell>
  );
}
