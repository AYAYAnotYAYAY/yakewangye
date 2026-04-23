import type {
  Article,
  ChatSession,
  CmsContent,
  Doctor,
  GalleryAsset,
  LandingPage,
  MediaLibraryState,
  PricingItem,
  ServiceItem,
} from "@quanyu/shared";
import {
  type AdminStatus,
  ADMIN_TOKEN_STORAGE_KEY,
  downloadAdminBackup,
  fetchAdminContent,
  fetchAdminMe,
  fetchAdminStatus,
  fetchChatSessions,
  fetchMediaLibrary,
  loginAdmin,
  restoreAdminBackup,
  saveContent,
  setupAdmin,
} from "../lib/api";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { MediaField, MediaLibraryManager } from "../components/admin-media";

type AdminPageProps = {
  content: CmsContent;
  onSaved: (content: CmsContent) => void;
};

type AdminConsoleProps = AdminPageProps & {
  adminToken: string;
  username: string;
  onLogout: () => void;
};

type TabKey =
  | "site"
  | "ai"
  | "home"
  | "articles"
  | "doctors"
  | "services"
  | "pricing"
  | "gallery"
  | "media"
  | "pages";

const ADMIN_TABS: Array<[TabKey, string]> = [
  ["site", "站点设置"],
  ["ai", "AI 配置"],
  ["home", "首页"],
  ["articles", "文章"],
  ["doctors", "医生"],
  ["services", "服务"],
  ["pricing", "价格"],
  ["gallery", "图册视频"],
  ["media", "素材库"],
  ["pages", "自定义页"],
];

function getAdminTabLabel(activeTab: TabKey) {
  return ADMIN_TABS.find(([key]) => key === activeTab)?.[1] ?? "模块";
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function TextField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  type?: string;
}) {
  return (
    <label className="admin-field">
      <span>{props.label}</span>
      {props.multiline ? (
        <textarea value={props.value} onChange={(event) => props.onChange(event.target.value)} />
      ) : (
        <input type={props.type ?? "text"} value={props.value} onChange={(event) => props.onChange(event.target.value)} />
      )}
    </label>
  );
}

function ChipsField(props: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <TextField
      label={props.label}
      value={props.values.join(", ")}
      onChange={(value) =>
        props.onChange(
          value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        )
      }
    />
  );
}

function AdminLogin(props: {
  status: AdminStatus;
  loading: boolean;
  error: string;
  onSubmit: (payload: { username: string; password: string }) => Promise<void>;
  onSetup: (payload: { username: string; password: string }) => Promise<void>;
}) {
  const [username, setUsername] = useState(props.status.initialized ? props.status.username : "admin");
  const [password, setPassword] = useState("");
  const isSetupMode = !props.status.initialized;

  useEffect(() => {
    if (props.status.initialized) {
      setUsername(props.status.username);
    }
  }, [props.status]);

  return (
    <div className="container admin-auth-page">
      <article className="card admin-auth-card">
        <div className="eyebrow">Admin</div>
        <h1>{isSetupMode ? "初始化后台管理员" : "后台登录"}</h1>
        <p>
          {isSetupMode
            ? "当前后台还没有管理员，请先创建一个管理员账号和密码。创建后会自动进入后台。"
            : "登录后才能查看问诊记录、上传图片和修改内容。"}
        </p>
        <form
          className="admin-auth-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (isSetupMode) {
              await props.onSetup({ username, password });
              return;
            }

            await props.onSubmit({ username, password });
          }}
        >
          <TextField
            label="用户名"
            value={username}
            onChange={setUsername}
          />
          <TextField label={isSetupMode ? "密码，至少 8 位" : "密码"} value={password} onChange={setPassword} type="password" />
          {props.error ? <div className="admin-auth-error">{props.error}</div> : null}
          <button className="button primary" type="submit" disabled={props.loading}>
            {props.loading ? (isSetupMode ? "初始化中..." : "登录中...") : isSetupMode ? "创建管理员并进入后台" : "进入后台"}
          </button>
        </form>
      </article>
    </div>
  );
}

function EntityToolbar(props: { title: string; onAdd: () => void }) {
  return (
    <div className="admin-toolbar">
      <h3>{props.title}</h3>
      <button className="button primary" onClick={props.onAdd} type="button">
        新增
      </button>
    </div>
  );
}

function EntityListEditor<T extends { id: string }>(props: {
  title: string;
  items: T[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, next: T) => void;
  getSummary: (item: T, index: number) => string;
  renderItem: (item: T, onChange: (next: T) => void) => ReactNode;
}) {
  const [openId, setOpenId] = useState<string | null>(props.items[0]?.id ?? null);

  useEffect(() => {
    if (!props.items.length) {
      setOpenId(null);
      return;
    }

    if (!openId || !props.items.some((item) => item.id === openId)) {
      setOpenId(props.items[0].id);
    }
  }, [openId, props.items]);

  return (
    <div className="card admin-panel">
      <EntityToolbar title={props.title} onAdd={props.onAdd} />
      <div className="admin-entity-list">
        {props.items.map((item, index) => (
          <article key={item.id} className="card admin-entity-card">
            <div className="admin-entity-head">
              <div className="admin-entity-title">
                <strong>{props.getSummary(item, index)}</strong>
                <span className="entity-note">{props.title} #{index + 1}</span>
              </div>
              <div className="admin-entity-actions">
                <button className="button secondary" onClick={() => setOpenId((current) => (current === item.id ? null : item.id))} type="button">
                  {openId === item.id ? "收起" : "展开"}
                </button>
                <button className="button secondary" onClick={() => props.onRemove(item.id)} type="button">
                  删除
                </button>
              </div>
            </div>
            {openId === item.id ? <div className="admin-grid">{props.renderItem(item, (next) => props.onUpdate(item.id, next))}</div> : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function AdminConsole({ content, onSaved, adminToken, username, onLogout }: AdminConsoleProps) {
  const [draft, setDraft] = useState<CmsContent>(content);
  const [activeTab, setActiveTab] = useState<TabKey>("site");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [mediaLibrary, setMediaLibrary] = useState<MediaLibraryState>({
    folders: [],
    assets: [],
  });
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(content);
  }, [content]);

  useEffect(() => {
    fetchChatSessions(adminToken).then(setSessions).catch(() => {
      setSessions([]);
    });

    fetchMediaLibrary(adminToken)
      .then((response) => setMediaLibrary(response.library))
      .catch(() => {
        setMediaLibrary({
          folders: [],
          assets: [],
        });
      });
  }, [adminToken]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [activeTab]);

  const save = async () => {
    setSaving(true);
    try {
      const response = await saveContent(draft, adminToken);
      setDraft(response.content);
      onSaved(response.content);
      window.alert("保存成功");
    } catch (error) {
      window.alert(`保存失败: ${String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const reloadAdminData = async () => {
    const [nextContent, nextSessions, nextLibrary] = await Promise.all([
      fetchAdminContent(adminToken),
      fetchChatSessions(adminToken).catch(() => []),
      fetchMediaLibrary(adminToken)
        .then((response) => response.library)
        .catch(() => ({
          folders: [],
          assets: [],
        })),
    ]);

    setDraft(nextContent);
    setSessions(nextSessions);
    setMediaLibrary(nextLibrary);
    onSaved(nextContent);
  };

  const handleBackupDownload = async () => {
    setBackingUp(true);

    try {
      const { blob, fileName } = await downloadAdminBackup(adminToken);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      window.alert(`备份失败: ${String(error)}`);
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestoreFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const confirmed = window.confirm("恢复会覆盖当前站点文字、配置、素材索引、聊天记录和上传文件，是否继续？");

    if (!confirmed) {
      return;
    }

    setRestoring(true);

    try {
      const result = await restoreAdminBackup(file, adminToken);
      await reloadAdminData();
      window.alert(
        `恢复成功。\n文章 ${result.summary.articleCount} 条，页面 ${result.summary.pageCount} 个，聊天 ${result.summary.chatSessionCount} 条，上传文件 ${result.summary.uploadFileCount} 个。`,
      );
    } catch (error) {
      window.alert(`恢复失败: ${String(error)}`);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="container admin-page">
      <div className="admin-header card">
        <div>
          <div className="eyebrow">Admin</div>
          <h1>内容后台</h1>
          <p>支持本地上传、素材库复用、内容编辑和独立数据存储，保存后前台会直接读取新内容。</p>
          <div className="entity-note">当前管理员：{username}</div>
        </div>
        <div className="admin-header-actions">
          <a className="button secondary" href="/">
            返回前台
          </a>
          <button className="button secondary" onClick={handleBackupDownload} type="button" disabled={backingUp || restoring}>
            {backingUp ? "导出中..." : "导出备份"}
          </button>
          <button
            className="button secondary"
            onClick={() => backupFileInputRef.current?.click()}
            type="button"
            disabled={backingUp || restoring}
          >
            {restoring ? "恢复中..." : "从文件恢复"}
          </button>
          <button className="button secondary" onClick={onLogout} type="button">
            退出登录
          </button>
          <button className="button primary" onClick={save} type="button" disabled={saving}>
            {saving ? "保存中..." : "保存全部内容"}
          </button>
        </div>
        <input ref={backupFileInputRef} type="file" accept="application/json,.json" hidden onChange={handleRestoreFile} />
      </div>

      <div className="admin-layout">
        <aside className="card admin-sidebar">
          <div className={`admin-tab-switcher ${mobileNavOpen ? "open" : ""}`}>
            <button className="admin-tab-trigger" onClick={() => setMobileNavOpen((current) => !current)} type="button" aria-expanded={mobileNavOpen}>
              <span className="admin-tab-trigger-kicker">当前模块</span>
              <strong>{getAdminTabLabel(activeTab)}</strong>
              <span className="admin-tab-trigger-hint">{mobileNavOpen ? "收起模块列表" : "点击切换模块"}</span>
            </button>
            {mobileNavOpen ? (
              <div className="admin-tab-sheet">
                {ADMIN_TABS.map(([key, label]) => (
                  <button
                    key={key}
                    className={`admin-nav-item ${activeTab === key ? "active" : ""}`}
                    onClick={() => setActiveTab(key)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="admin-sidebar-grid">
            {ADMIN_TABS.map(([key, label]) => (
              <button
                key={key}
                className={`admin-nav-item ${activeTab === key ? "active" : ""}`}
                onClick={() => setActiveTab(key)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </aside>

        <section className="admin-content">
          {activeTab === "site" ? (
            <div className="card admin-panel">
              <h2>站点设置</h2>
              <div className="admin-grid">
                <TextField
                  label="品牌名称"
                  value={draft.siteSettings.brandName}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      siteSettings: { ...current.siteSettings, brandName: value },
                    }))
                  }
                />
                <TextField
                  label="顶部提示"
                  value={draft.siteSettings.topbarNotice}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      siteSettings: { ...current.siteSettings, topbarNotice: value },
                    }))
                  }
                />
                <TextField
                  label="页脚说明"
                  value={draft.siteSettings.footerDescription}
                  multiline
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      siteSettings: { ...current.siteSettings, footerDescription: value },
                    }))
                  }
                />
                <TextField
                  label="联系电话"
                  value={draft.siteSettings.primaryContact.phone}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      siteSettings: {
                        ...current.siteSettings,
                        primaryContact: { ...current.siteSettings.primaryContact, phone: value },
                      },
                    }))
                  }
                />
                <TextField
                  label="地址"
                  value={draft.siteSettings.primaryContact.address}
                  multiline
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      siteSettings: {
                        ...current.siteSettings,
                        primaryContact: { ...current.siteSettings.primaryContact, address: value },
                      },
                    }))
                  }
                />
                <TextField
                  label="Telegram Handle"
                  value={draft.siteSettings.primaryContact.telegramHandle}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      siteSettings: {
                        ...current.siteSettings,
                        primaryContact: { ...current.siteSettings.primaryContact, telegramHandle: value },
                      },
                    }))
                  }
                />
                <TextField
                  label="Telegram 链接"
                  value={draft.siteSettings.primaryContact.telegramUrl}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      siteSettings: {
                        ...current.siteSettings,
                        primaryContact: { ...current.siteSettings.primaryContact, telegramUrl: value },
                      },
                    }))
                  }
                />
              </div>
            </div>
          ) : null}

          {activeTab === "ai" ? (
            <div className="card admin-panel">
              <h2>AI 配置与提示词</h2>
              <div className="admin-grid">
                <label className="admin-field">
                  <span>供应商类型</span>
                  <select
                    value={draft.aiConfig.provider}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        aiConfig: {
                          ...current.aiConfig,
                          provider: event.target.value as typeof current.aiConfig.provider,
                        },
                      }))
                    }
                  >
                    <option value="mock">Mock 本地占位</option>
                    <option value="openai_compatible">OpenAI Compatible</option>
                    <option value="openai_responses">OpenAI Responses</option>
                  </select>
                </label>
                <TextField
                  label="API 地址"
                  value={draft.aiConfig.endpoint}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      aiConfig: { ...current.aiConfig, endpoint: value },
                    }))
                  }
                />
                <TextField
                  label="API Key"
                  value={draft.aiConfig.apiKey}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      aiConfig: { ...current.aiConfig, apiKey: value },
                    }))
                  }
                />
                <TextField
                  label="模型"
                  value={draft.aiConfig.model}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      aiConfig: { ...current.aiConfig, model: value },
                    }))
                  }
                />
                <TextField
                  label="Temperature"
                  value={String(draft.aiConfig.temperature)}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      aiConfig: { ...current.aiConfig, temperature: Number(value) || 0 },
                    }))
                  }
                />
                <TextField
                  label="Max Tokens"
                  value={String(draft.aiConfig.maxTokens)}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      aiConfig: { ...current.aiConfig, maxTokens: Number(value) || 800 },
                    }))
                  }
                />
                <TextField
                  label="系统提示词"
                  value={draft.aiConfig.systemPrompt}
                  multiline
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      aiConfig: { ...current.aiConfig, systemPrompt: value },
                    }))
                  }
                />
                <TextField
                  label="分诊提示词"
                  value={draft.aiConfig.triagePrompt}
                  multiline
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      aiConfig: { ...current.aiConfig, triagePrompt: value },
                    }))
                  }
                />
                <TextField
                  label="线索收集提示词"
                  value={draft.aiConfig.leadPrompt}
                  multiline
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      aiConfig: { ...current.aiConfig, leadPrompt: value },
                    }))
                  }
                />
                <TextField
                  label="默认兜底回复"
                  value={draft.aiConfig.fallbackReply}
                  multiline
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      aiConfig: { ...current.aiConfig, fallbackReply: value },
                    }))
                  }
                />
                <label className="admin-field">
                  <span>Telegram 自动转接</span>
                  <select
                    value={draft.telegramConfig.enabled ? "on" : "off"}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        telegramConfig: {
                          ...current.telegramConfig,
                          enabled: event.target.value === "on",
                        },
                      }))
                    }
                  >
                    <option value="off">关闭</option>
                    <option value="on">开启</option>
                  </select>
                </label>
                <TextField
                  label="Telegram Bot Token"
                  value={draft.telegramConfig.botToken}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      telegramConfig: { ...current.telegramConfig, botToken: value },
                    }))
                  }
                />
                <TextField
                  label="Telegram Chat ID"
                  value={draft.telegramConfig.chatId}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      telegramConfig: { ...current.telegramConfig, chatId: value },
                    }))
                  }
                />
                <TextField
                  label="Telegram 联系链接"
                  value={draft.telegramConfig.contactUrl}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      telegramConfig: { ...current.telegramConfig, contactUrl: value },
                    }))
                  }
                />
                <TextField
                  label="转人工消息模板"
                  value={draft.telegramConfig.handoffTemplate}
                  multiline
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      telegramConfig: { ...current.telegramConfig, handoffTemplate: value },
                    }))
                  }
                />
              </div>

              <div className="admin-subsection">
                <h3>聊天记录</h3>
                <p>聊天记录保存在服务器端本地文件，当前用于开发阶段验证；正式环境建议切到数据库。</p>
                <div className="admin-session-list">
                  {sessions.length ? (
                    sessions.map((session) => (
                      <article key={session.sessionId} className="card admin-session-card">
                        <div className="entity-meta">
                          {session.language} | {session.sessionId}
                        </div>
                        <strong>{session.triage?.intent ?? "consultation"}</strong>
                        <div className="entity-note">
                          {session.triage?.urgent ? "高紧急度" : "普通"} | {session.updatedAt}
                        </div>
                        <div className="prose-block">
                          {session.messages.slice(-4).map((message) => `${message.role}: ${message.content}`).join("\n")}
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="entity-note">当前还没有聊天记录。</div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "home" ? (
            <div className="card admin-panel">
              <h2>首页 Hero 与 SEO</h2>
              {draft.homePage.sections[0]?.type === "hero" ? (
                <div className="admin-grid">
                  <TextField
                    label="首页主标题"
                    value={draft.homePage.sections[0].title}
                    multiline
                    onChange={(value) =>
                      setDraft((current) => {
                        const first = current.homePage.sections[0];
                        if (!first || first.type !== "hero") return current;
                        return {
                          ...current,
                          homePage: {
                            ...current.homePage,
                            sections: [{ ...first, title: value }, ...current.homePage.sections.slice(1)],
                          },
                        };
                      })
                    }
                  />
                  <TextField
                    label="首页说明"
                    value={draft.homePage.sections[0].description}
                    multiline
                    onChange={(value) =>
                      setDraft((current) => {
                        const first = current.homePage.sections[0];
                        if (!first || first.type !== "hero") return current;
                        return {
                          ...current,
                          homePage: {
                            ...current.homePage,
                            sections: [{ ...first, description: value }, ...current.homePage.sections.slice(1)],
                          },
                        };
                      })
                    }
                  />
                  <TextField
                    label="SEO Title"
                    value={draft.homePage.seoTitle}
                    onChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        homePage: { ...current.homePage, seoTitle: value },
                      }))
                    }
                  />
                  <TextField
                    label="SEO Description"
                    value={draft.homePage.seoDescription}
                    multiline
                    onChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        homePage: { ...current.homePage, seoDescription: value },
                      }))
                    }
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {activeTab === "articles" ? (
            <EntityListEditor
              title="文章"
              items={draft.articles}
              getSummary={(item) => item.title || item.slug || "未命名文章"}
              onAdd={() =>
                setDraft((current) => ({
                  ...current,
                  articles: [
                    ...current.articles,
                    {
                      id: createId("article"),
                      slug: "new-article",
                      title: "新文章",
                      category: "未分类",
                      excerpt: "",
                      content: "",
                      coverImage: "",
                      seoTitle: "",
                      seoDescription: "",
                      publishedAt: new Date().toISOString().slice(0, 10),
                    },
                  ],
                }))
              }
              onRemove={(id) =>
                setDraft((current) => ({
                  ...current,
                  articles: current.articles.filter((item) => item.id !== id),
                }))
              }
              onUpdate={(id, next) =>
                setDraft((current) => ({
                  ...current,
                  articles: current.articles.map((item) => (item.id === id ? next : item)),
                }))
              }
              renderItem={(item, onChange) => (
                <>
                  <TextField label="标题" value={item.title} onChange={(value) => onChange({ ...item, title: value })} />
                  <TextField label="Slug" value={item.slug} onChange={(value) => onChange({ ...item, slug: value })} />
                  <TextField label="分类" value={item.category} onChange={(value) => onChange({ ...item, category: value })} />
                  <TextField label="摘要" value={item.excerpt} multiline onChange={(value) => onChange({ ...item, excerpt: value })} />
                  <TextField label="正文" value={item.content} multiline onChange={(value) => onChange({ ...item, content: value })} />
                  <MediaField
                    label="封面图"
                    value={item.coverImage}
                    library={mediaLibrary}
                    adminToken={adminToken}
                    onLibraryChange={setMediaLibrary}
                    onChange={(value) => onChange({ ...item, coverImage: value })}
                  />
                  <TextField label="SEO Title" value={item.seoTitle} onChange={(value) => onChange({ ...item, seoTitle: value })} />
                  <TextField label="SEO Description" value={item.seoDescription} multiline onChange={(value) => onChange({ ...item, seoDescription: value })} />
                  <TextField label="发布时间" value={item.publishedAt} onChange={(value) => onChange({ ...item, publishedAt: value })} />
                </>
              )}
            />
          ) : null}

          {activeTab === "doctors" ? (
            <EntityListEditor
              title="医生"
              items={draft.doctors}
              getSummary={(item) => item.name || "未命名医生"}
              onAdd={() =>
                setDraft((current) => ({
                  ...current,
                  doctors: [
                    ...current.doctors,
                    {
                      id: createId("doctor"),
                      name: "新医生",
                      title: "",
                      summary: "",
                      specialties: [],
                      image: "",
                      experience: "",
                    },
                  ],
                }))
              }
              onRemove={(id) =>
                setDraft((current) => ({
                  ...current,
                  doctors: current.doctors.filter((item) => item.id !== id),
                }))
              }
              onUpdate={(id, next) =>
                setDraft((current) => ({
                  ...current,
                  doctors: current.doctors.map((item) => (item.id === id ? next : item)),
                }))
              }
              renderItem={(item, onChange) => (
                <>
                  <TextField label="姓名" value={item.name} onChange={(value) => onChange({ ...item, name: value })} />
                  <TextField label="职称" value={item.title} onChange={(value) => onChange({ ...item, title: value })} />
                  <TextField label="简介" value={item.summary} multiline onChange={(value) => onChange({ ...item, summary: value })} />
                  <ChipsField label="擅长方向" values={item.specialties} onChange={(value) => onChange({ ...item, specialties: value })} />
                  <TextField label="经验" value={item.experience} onChange={(value) => onChange({ ...item, experience: value })} />
                  <MediaField
                    label="头像"
                    value={item.image}
                    library={mediaLibrary}
                    adminToken={adminToken}
                    onLibraryChange={setMediaLibrary}
                    onChange={(value) => onChange({ ...item, image: value })}
                  />
                </>
              )}
            />
          ) : null}

          {activeTab === "services" ? (
            <EntityListEditor
              title="服务"
              items={draft.services}
              getSummary={(item) => item.name || "未命名服务"}
              onAdd={() =>
                setDraft((current) => ({
                  ...current,
                  services: [
                    ...current.services,
                    {
                      id: createId("service"),
                      name: "新服务",
                      category: "",
                      summary: "",
                      details: "",
                      image: "",
                    },
                  ],
                }))
              }
              onRemove={(id) =>
                setDraft((current) => ({
                  ...current,
                  services: current.services.filter((item) => item.id !== id),
                }))
              }
              onUpdate={(id, next) =>
                setDraft((current) => ({
                  ...current,
                  services: current.services.map((item) => (item.id === id ? next : item)),
                }))
              }
              renderItem={(item, onChange) => (
                <>
                  <TextField label="服务名称" value={item.name} onChange={(value) => onChange({ ...item, name: value })} />
                  <TextField label="分类" value={item.category} onChange={(value) => onChange({ ...item, category: value })} />
                  <TextField label="摘要" value={item.summary} multiline onChange={(value) => onChange({ ...item, summary: value })} />
                  <TextField label="详细说明" value={item.details} multiline onChange={(value) => onChange({ ...item, details: value })} />
                  <MediaField
                    label="服务图片"
                    value={item.image}
                    library={mediaLibrary}
                    adminToken={adminToken}
                    onLibraryChange={setMediaLibrary}
                    onChange={(value) => onChange({ ...item, image: value })}
                  />
                </>
              )}
            />
          ) : null}

          {activeTab === "pricing" ? (
            <EntityListEditor
              title="价格"
              items={draft.pricing}
              getSummary={(item) => item.name || "未命名价格项"}
              onAdd={() =>
                setDraft((current) => ({
                  ...current,
                  pricing: [
                    ...current.pricing,
                    {
                      id: createId("pricing"),
                      name: "新价格项",
                      category: "",
                      price: "",
                      notes: "",
                    },
                  ],
                }))
              }
              onRemove={(id) =>
                setDraft((current) => ({
                  ...current,
                  pricing: current.pricing.filter((item) => item.id !== id),
                }))
              }
              onUpdate={(id, next) =>
                setDraft((current) => ({
                  ...current,
                  pricing: current.pricing.map((item) => (item.id === id ? next : item)),
                }))
              }
              renderItem={(item, onChange) => (
                <>
                  <TextField label="项目名称" value={item.name} onChange={(value) => onChange({ ...item, name: value })} />
                  <TextField label="分类" value={item.category} onChange={(value) => onChange({ ...item, category: value })} />
                  <TextField label="价格" value={item.price} onChange={(value) => onChange({ ...item, price: value })} />
                  <TextField label="备注" value={item.notes} multiline onChange={(value) => onChange({ ...item, notes: value })} />
                </>
              )}
            />
          ) : null}

          {activeTab === "gallery" ? (
            <EntityListEditor
              title="图册视频"
              items={draft.gallery}
              getSummary={(item) => item.title || "未命名媒体"}
              onAdd={() =>
                setDraft((current) => ({
                  ...current,
                  gallery: [
                    ...current.gallery,
                    {
                      id: createId("gallery"),
                      title: "新媒体",
                      summary: "",
                      imageUrl: "",
                      mediaType: "image",
                    },
                  ],
                }))
              }
              onRemove={(id) =>
                setDraft((current) => ({
                  ...current,
                  gallery: current.gallery.filter((item) => item.id !== id),
                }))
              }
              onUpdate={(id, next) =>
                setDraft((current) => ({
                  ...current,
                  gallery: current.gallery.map((item) => (item.id === id ? next : item)),
                }))
              }
              renderItem={(item, onChange) => (
                <>
                  <TextField label="标题" value={item.title} onChange={(value) => onChange({ ...item, title: value })} />
                  <TextField label="说明" value={item.summary} multiline onChange={(value) => onChange({ ...item, summary: value })} />
                  <MediaField
                    label={item.mediaType === "video" ? "视频文件" : "图片"}
                    value={item.imageUrl}
                    previewType={item.mediaType}
                    mediaFilter={item.mediaType}
                    library={mediaLibrary}
                    adminToken={adminToken}
                    onLibraryChange={setMediaLibrary}
                    onChange={(value) => onChange({ ...item, imageUrl: value })}
                  />
                  <label className="admin-field">
                    <span>媒体类型</span>
                    <select value={item.mediaType} onChange={(event) => onChange({ ...item, mediaType: event.target.value as "image" | "video" })}>
                      <option value="image">图片</option>
                      <option value="video">视频</option>
                    </select>
                  </label>
                </>
              )}
            />
          ) : null}

          {activeTab === "media" ? (
            <MediaLibraryManager library={mediaLibrary} adminToken={adminToken} onLibraryChange={setMediaLibrary} />
          ) : null}

          {activeTab === "pages" ? (
            <EntityListEditor
              title="自定义页面"
              items={draft.pages}
              getSummary={(item) => item.title || item.slug || "未命名页面"}
              onAdd={() =>
                setDraft((current) => ({
                  ...current,
                  pages: [
                    ...current.pages,
                    {
                      id: createId("page"),
                      slug: "new-page",
                      title: "新页面",
                      summary: "",
                      content: "",
                      seoTitle: "",
                      seoDescription: "",
                    },
                  ],
                }))
              }
              onRemove={(id) =>
                setDraft((current) => ({
                  ...current,
                  pages: current.pages.filter((item) => item.id !== id),
                }))
              }
              onUpdate={(id, next) =>
                setDraft((current) => ({
                  ...current,
                  pages: current.pages.map((item) => (item.id === id ? next : item)),
                }))
              }
              renderItem={(item, onChange) => (
                <>
                  <TextField label="页面标题" value={item.title} onChange={(value) => onChange({ ...item, title: value })} />
                  <TextField label="Slug" value={item.slug} onChange={(value) => onChange({ ...item, slug: value })} />
                  <TextField label="摘要" value={item.summary} multiline onChange={(value) => onChange({ ...item, summary: value })} />
                  <TextField label="正文" value={item.content} multiline onChange={(value) => onChange({ ...item, content: value })} />
                  <TextField label="SEO Title" value={item.seoTitle} onChange={(value) => onChange({ ...item, seoTitle: value })} />
                  <TextField label="SEO Description" value={item.seoDescription} multiline onChange={(value) => onChange({ ...item, seoDescription: value })} />
                </>
              )}
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}

export function AdminPage({ content, onSaved }: AdminPageProps) {
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [adminContent, setAdminContent] = useState<CmsContent | null>(null);
  const [adminStatus, setAdminStatus] = useState<AdminStatus>({
    initialized: false,
    source: "setup_required",
  });

  useEffect(() => {
    fetchAdminStatus()
      .then((status) => {
        setAdminStatus(status);
        const stored = window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);

        if (!stored) {
          setAuthLoading(false);
          return;
        }

        return fetchAdminMe(stored)
          .then(async (result) => {
            setToken(stored);
            setUsername(result.user.username);
            const nextContent = await fetchAdminContent(stored);
            setAdminContent(nextContent);
            onSaved(nextContent);
          })
          .catch(() => {
            window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
            setToken("");
            setUsername("");
            setAdminContent(null);
          })
          .finally(() => {
            setAuthLoading(false);
          });
      })
      .catch(() => {
        setAuthLoading(false);
      });
  }, [onSaved]);

  const handleLogin = async (payload: { username: string; password: string }) => {
    setLoginError("");
    setLoginLoading(true);

    try {
      const result = await loginAdmin(payload);
      const nextContent = await fetchAdminContent(result.token);
      window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, result.token);
      setToken(result.token);
      setUsername(result.user.username);
      setAdminContent(nextContent);
      onSaved(nextContent);
    } catch (error) {
      setLoginError(String(error));
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSetup = async (payload: { username: string; password: string }) => {
    setLoginError("");
    setLoginLoading(true);

    try {
      const result = await setupAdmin(payload);
      const nextContent = await fetchAdminContent(result.token);
      window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, result.token);
      setAdminStatus({
        initialized: true,
        source: "file",
        username: result.user.username,
      });
      setToken(result.token);
      setUsername(result.user.username);
      setAdminContent(nextContent);
      onSaved(nextContent);
    } catch (error) {
      setLoginError(String(error));
      const status = await fetchAdminStatus().catch(() => null);
      if (status) {
        setAdminStatus(status);
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    setToken("");
    setUsername("");
    setAdminContent(null);
  };

  if (authLoading) {
    return (
      <div className="container admin-auth-page">
        <article className="card admin-auth-card">
          <h1>正在校验登录态</h1>
          <p>稍候，系统正在确认管理员身份。</p>
        </article>
      </div>
    );
  }

  if (!token || !username) {
    return <AdminLogin status={adminStatus} loading={loginLoading} error={loginError} onSubmit={handleLogin} onSetup={handleSetup} />;
  }

  return (
    <AdminConsole
      content={adminContent ?? content}
      onSaved={(next) => {
        setAdminContent(next);
        onSaved(next);
      }}
      adminToken={token}
      username={username}
      onLogout={handleLogout}
    />
  );
}
