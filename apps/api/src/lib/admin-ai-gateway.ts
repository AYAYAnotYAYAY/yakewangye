import { z } from "zod";
import {
  cmsContentSchema,
  type AiConfig,
  type CmsContent,
  type Language,
  type MediaLibraryState,
} from "@quanyu/shared";

type AllowedUpdate = {
  path: string;
  label: string;
  currentValue: string;
  kind: "text" | "media_url" | "gallery_cover";
};

type WebsiteDraftResult = {
  content: CmsContent;
  notes: string[];
};

type VisualInput = {
  dataUrl: string;
  mimeType: string;
  fileName: string;
};

const aiDraftSchema = z.object({
  notes: z.array(z.string()).default([]),
  changes: z
    .array(
      z.object({
        path: z.string().trim().min(1),
        value: z.string(),
      }),
    )
    .max(120)
    .default([]),
});

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepMerge(base: unknown, override: unknown): unknown {
  if (override === undefined) {
    return base;
  }

  if (Array.isArray(base)) {
    if (!Array.isArray(override)) {
      return base;
    }

    return base.map((item, index) => deepMerge(item, override[index]));
  }

  if (base && typeof base === "object") {
    if (!override || typeof override !== "object" || Array.isArray(override)) {
      return base;
    }

    const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
      result[key] = key in result ? deepMerge(result[key], value) : value;
    }
    return result;
  }

  return override;
}

function stripNestedI18n<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripNestedI18n(item)) as T;
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (key === "i18n") continue;
      result[key] = stripNestedI18n(entry);
    }
    return result as T;
  }

  return value;
}

function buildOverlay(base: unknown, localized: unknown): unknown {
  if (Array.isArray(base)) {
    if (!Array.isArray(localized) || base.length !== localized.length) {
      return localized;
    }

    const next = base.map((item, index) => buildOverlay(item, localized[index]));
    return next.some((item) => item !== undefined) ? next : undefined;
  }

  if (base && typeof base === "object") {
    if (!localized || typeof localized !== "object" || Array.isArray(localized)) {
      return localized === base ? undefined : localized;
    }

    const result: Record<string, unknown> = {};
    for (const key of Object.keys(localized as Record<string, unknown>)) {
      if (key === "i18n") continue;
      const next = buildOverlay((base as Record<string, unknown>)[key], (localized as Record<string, unknown>)[key]);
      if (next !== undefined) {
        result[key] = next;
      }
    }
    return Object.keys(result).length ? result : undefined;
  }

  return Object.is(base, localized) ? undefined : localized;
}

function resolveContentForLanguage(content: CmsContent, language: Language): CmsContent {
  if (language === "zh" || !content.i18n?.[language]) {
    return deepClone(content);
  }

  return deepMerge(deepClone(content), content.i18n[language]) as CmsContent;
}

function updateLocalizedContentDraft(
  draft: CmsContent,
  language: Language,
  mutator: (current: CmsContent) => CmsContent,
): CmsContent {
  if (language === "zh") {
    return mutator(deepClone(draft));
  }

  const base = stripNestedI18n(deepClone(draft));
  const localized = resolveContentForLanguage(draft, language);
  const nextLocalized = stripNestedI18n(mutator(localized));
  const overlay = buildOverlay(base, nextLocalized);
  const nextI18n = { ...(draft.i18n ?? {}) } as Record<string, unknown>;

  if (overlay === undefined) {
    delete nextI18n[language];
  } else {
    nextI18n[language] = overlay;
  }

  return {
    ...draft,
    i18n: nextI18n,
  };
}

function pushTextPath(updates: AllowedUpdate[], path: string, label: string, currentValue: string) {
  updates.push({
    path,
    label,
    currentValue,
    kind: "text",
  });
}

function pushMediaPath(updates: AllowedUpdate[], path: string, label: string, currentValue: string, kind: "media_url" | "gallery_cover" = "media_url") {
  updates.push({
    path,
    label,
    currentValue,
    kind,
  });
}

function buildAllowedUpdates(content: CmsContent): AllowedUpdate[] {
  const updates: AllowedUpdate[] = [];

  pushTextPath(updates, "siteSettings.topbarNotice", "顶部提示", content.siteSettings.topbarNotice);
  pushTextPath(updates, "siteSettings.footerDescription", "页脚说明", content.siteSettings.footerDescription);
  content.siteSettings.navigation.forEach((item, index) => {
    pushTextPath(updates, `siteSettings.navigation.${index}.label`, `导航 ${item.id}`, item.label);
  });

  pushTextPath(updates, "homePage.title", "首页标题", content.homePage.title);
  pushTextPath(updates, "homePage.seoTitle", "首页 SEO 标题", content.homePage.seoTitle);
  pushTextPath(updates, "homePage.seoDescription", "首页 SEO 描述", content.homePage.seoDescription);

  content.homePage.sections.forEach((section, sectionIndex) => {
    const sectionPath = `homePage.sections.${sectionIndex}`;
    pushTextPath(updates, `${sectionPath}.eyebrow`, `首页模块 ${section.id} 眉题`, section.eyebrow);
    pushTextPath(updates, `${sectionPath}.title`, `首页模块 ${section.id} 标题`, section.title);
    pushTextPath(updates, `${sectionPath}.description`, `首页模块 ${section.id} 描述`, section.description);

    if (section.type === "hero") {
      section.actions.forEach((item, index) => {
        pushTextPath(updates, `${sectionPath}.actions.${index}.label`, `首屏按钮 ${index + 1}`, item.label);
      });
      section.highlights.forEach((item, index) => {
        pushTextPath(updates, `${sectionPath}.highlights.${index}.label`, `首屏高亮 ${index + 1} 标题`, item.label);
        pushTextPath(updates, `${sectionPath}.highlights.${index}.value`, `首屏高亮 ${index + 1} 内容`, item.value);
      });
      pushTextPath(updates, `${sectionPath}.aiPanel.title`, "首屏 AI 面板标题", section.aiPanel.title);
      pushTextPath(updates, `${sectionPath}.aiPanel.description`, "首屏 AI 面板描述", section.aiPanel.description);
      section.aiPanel.steps.forEach((item, index) => {
        pushTextPath(updates, `${sectionPath}.aiPanel.steps.${index}`, `首屏 AI 步骤 ${index + 1}`, item);
      });
    }

    if (section.type === "services") {
      section.items.forEach((item, index) => {
        pushTextPath(updates, `${sectionPath}.items.${index}.tag`, `服务卡片 ${index + 1} 标签`, item.tag);
        pushTextPath(updates, `${sectionPath}.items.${index}.title`, `服务卡片 ${index + 1} 标题`, item.title);
        pushTextPath(updates, `${sectionPath}.items.${index}.summary`, `服务卡片 ${index + 1} 摘要`, item.summary);
        pushTextPath(updates, `${sectionPath}.items.${index}.ctaLabel`, `服务卡片 ${index + 1} 按钮`, item.ctaLabel);
      });
    }

    if (section.type === "journey") {
      section.steps.forEach((item, index) => {
        pushTextPath(updates, `${sectionPath}.steps.${index}.title`, `流程 ${index + 1} 标题`, item.title);
        pushTextPath(updates, `${sectionPath}.steps.${index}.summary`, `流程 ${index + 1} 摘要`, item.summary);
      });
    }

    if (section.type === "gallery") {
      section.items.forEach((item, index) => {
        pushTextPath(updates, `${sectionPath}.items.${index}.title`, `首页图册 ${index + 1} 标题`, item.title);
        pushTextPath(updates, `${sectionPath}.items.${index}.summary`, `首页图册 ${index + 1} 摘要`, item.summary);
        pushMediaPath(updates, `${sectionPath}.items.${index}.cover`, `首页图册 ${index + 1} 背景图`, item.cover, "gallery_cover");
      });
    }

    if (section.type === "articles") {
      section.items.forEach((item, index) => {
        pushTextPath(updates, `${sectionPath}.items.${index}.category`, `首页文章 ${index + 1} 分类`, item.category);
        pushTextPath(updates, `${sectionPath}.items.${index}.title`, `首页文章 ${index + 1} 标题`, item.title);
        pushTextPath(updates, `${sectionPath}.items.${index}.excerpt`, `首页文章 ${index + 1} 摘要`, item.excerpt);
        pushTextPath(updates, `${sectionPath}.items.${index}.seoTitle`, `首页文章 ${index + 1} SEO 标题`, item.seoTitle);
      });
    }

    if (section.type === "analytics") {
      section.metrics.forEach((item, index) => {
        pushTextPath(updates, `${sectionPath}.metrics.${index}.label`, `指标 ${index + 1} 标题`, item.label);
        pushTextPath(updates, `${sectionPath}.metrics.${index}.value`, `指标 ${index + 1} 内容`, item.value);
        pushTextPath(updates, `${sectionPath}.metrics.${index}.note`, `指标 ${index + 1} 备注`, item.note);
      });
    }
  });

  content.articles.forEach((item, index) => {
    pushTextPath(updates, `articles.${index}.title`, `文章 ${item.id} 标题`, item.title);
    pushTextPath(updates, `articles.${index}.category`, `文章 ${item.id} 分类`, item.category);
    pushTextPath(updates, `articles.${index}.excerpt`, `文章 ${item.id} 摘要`, item.excerpt);
    pushTextPath(updates, `articles.${index}.content`, `文章 ${item.id} 正文`, item.content);
    pushTextPath(updates, `articles.${index}.seoTitle`, `文章 ${item.id} SEO 标题`, item.seoTitle);
    pushTextPath(updates, `articles.${index}.seoDescription`, `文章 ${item.id} SEO 描述`, item.seoDescription);
    pushMediaPath(updates, `articles.${index}.coverImage`, `文章 ${item.id} 封面图`, item.coverImage);
  });

  content.doctors.forEach((item, index) => {
    pushTextPath(updates, `doctors.${index}.name`, `医生 ${item.id} 姓名`, item.name);
    pushTextPath(updates, `doctors.${index}.title`, `医生 ${item.id} 职称`, item.title);
    pushTextPath(updates, `doctors.${index}.summary`, `医生 ${item.id} 简介`, item.summary);
    item.specialties.forEach((specialty, specialtyIndex) => {
      pushTextPath(updates, `doctors.${index}.specialties.${specialtyIndex}`, `医生 ${item.id} 专长 ${specialtyIndex + 1}`, specialty);
    });
    pushTextPath(updates, `doctors.${index}.experience`, `医生 ${item.id} 经验`, item.experience);
    pushMediaPath(updates, `doctors.${index}.image`, `医生 ${item.id} 图片`, item.image);
  });

  content.services.forEach((item, index) => {
    pushTextPath(updates, `services.${index}.name`, `服务 ${item.id} 名称`, item.name);
    pushTextPath(updates, `services.${index}.category`, `服务 ${item.id} 分类`, item.category);
    pushTextPath(updates, `services.${index}.summary`, `服务 ${item.id} 摘要`, item.summary);
    pushTextPath(updates, `services.${index}.details`, `服务 ${item.id} 详情`, item.details);
    pushMediaPath(updates, `services.${index}.image`, `服务 ${item.id} 图片`, item.image);
  });

  content.pricing.forEach((item, index) => {
    pushTextPath(updates, `pricing.${index}.name`, `价格 ${item.id} 名称`, item.name);
    pushTextPath(updates, `pricing.${index}.category`, `价格 ${item.id} 分类`, item.category);
    pushTextPath(updates, `pricing.${index}.notes`, `价格 ${item.id} 备注`, item.notes);
  });

  content.gallery.forEach((item, index) => {
    pushTextPath(updates, `gallery.${index}.title`, `图册 ${item.id} 标题`, item.title);
    pushTextPath(updates, `gallery.${index}.summary`, `图册 ${item.id} 摘要`, item.summary);
    pushMediaPath(updates, `gallery.${index}.imageUrl`, `图册 ${item.id} 素材`, item.imageUrl);
  });

  content.pages.forEach((item, index) => {
    pushTextPath(updates, `pages.${index}.title`, `自定义页 ${item.id} 标题`, item.title);
    pushTextPath(updates, `pages.${index}.summary`, `自定义页 ${item.id} 摘要`, item.summary);
    pushTextPath(updates, `pages.${index}.content`, `自定义页 ${item.id} 正文`, item.content);
    pushTextPath(updates, `pages.${index}.seoTitle`, `自定义页 ${item.id} SEO 标题`, item.seoTitle);
    pushTextPath(updates, `pages.${index}.seoDescription`, `自定义页 ${item.id} SEO 描述`, item.seoDescription);
  });

  return updates;
}

function setPathValue(target: unknown, path: string, value: string) {
  const parts = path.split(".");
  let cursor = target as Record<string, unknown>;

  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    const key = /^\d+$/.test(part) ? Number(part) : part;
    cursor = (cursor as Record<string | number, unknown>)[key] as Record<string, unknown>;

    if (!cursor || typeof cursor !== "object") {
      return;
    }
  }

  const last = parts[parts.length - 1];
  const lastKey = /^\d+$/.test(last) ? Number(last) : last;
  (cursor as Record<string | number, unknown>)[lastKey] = value;
}

function normalizeMediaValue(value: string, update: AllowedUpdate, mediaUrls: Set<string>) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  const extractedUrl = trimmed.match(/\/uploads\/[^"')\s]+/)?.[0] ?? trimmed;

  if (!mediaUrls.has(extractedUrl)) {
    return null;
  }

  return update.kind === "gallery_cover" ? `url("${extractedUrl}") center/cover` : extractedUrl;
}

function applyChanges(params: {
  content: CmsContent;
  language: Language;
  changes: Array<{ path: string; value: string }>;
  mediaLibrary: MediaLibraryState;
}) {
  const localizedContent = resolveContentForLanguage(params.content, params.language);
  const allowedUpdates = buildAllowedUpdates(localizedContent);
  const allowedByPath = new Map(allowedUpdates.map((update) => [update.path, update]));
  const mediaUrls = new Set(params.mediaLibrary.assets.map((asset) => asset.url));
  const appliedPaths: string[] = [];

  const next = updateLocalizedContentDraft(params.content, params.language, (current) => {
    const working = deepClone(current);

    for (const change of params.changes) {
      const update = allowedByPath.get(change.path);

      if (!update) {
        continue;
      }

      const nextValue = update.kind === "text" ? change.value : normalizeMediaValue(change.value, update, mediaUrls);

      if (nextValue === null) {
        continue;
      }

      setPathValue(working, change.path, nextValue);
      appliedPaths.push(change.path);
    }

    return working;
  });

  return {
    content: cmsContentSchema.parse(next),
    allowedUpdates,
    appliedPaths,
  };
}

function stripMarkdownFence(input: string) {
  const trimmed = input.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function parseAiDraftPayload(raw: string) {
  const stripped = stripMarkdownFence(raw);

  try {
    return aiDraftSchema.parse(JSON.parse(stripped));
  } catch {
    const firstBrace = stripped.indexOf("{");
    const lastBrace = stripped.lastIndexOf("}");

    if (firstBrace < 0 || lastBrace <= firstBrace) {
      throw new Error("invalid_ai_draft_response");
    }

    return aiDraftSchema.parse(JSON.parse(stripped.slice(firstBrace, lastBrace + 1)));
  }
}

function buildAiPrompt(params: {
  content: CmsContent;
  mediaLibrary: MediaLibraryState;
  instruction: string;
  language: Language;
}) {
  const allowedUpdates = buildAllowedUpdates(resolveContentForLanguage(params.content, params.language));
  const mediaAssets = params.mediaLibrary.assets.slice(0, 80).map((asset) => ({
    title: asset.title,
    url: asset.url,
    mediaType: asset.mediaType,
    folderPath: asset.folderPath,
  }));

  return [
    "你是泉寓门诊网站的 AI 改版助手，负责根据管理员需求生成网站内容和素材使用草稿。",
    "你只能返回 JSON，不要返回 Markdown。",
    "必须遵守：",
    "1. 只允许修改 allowedUpdates 中列出的 path。",
    "2. 不允许修改 id、slug、href、电话、地址、Telegram、AI 配置、API Key、模型配置。",
    "3. 不允许编造医生资历、价格承诺、治疗效果、法律承诺。",
    "4. 可以改写文案、SEO、服务介绍、流程表达，也可以从 mediaAssets 中选择合适素材 URL 填到 media 类型 path。",
    "5. media 类型 path 的 value 只能使用 mediaAssets 里已有的 url，不要编造外链。",
    "6. 输出语言必须匹配 language。",
    "",
    `language: ${params.language}`,
    `管理员需求: ${params.instruction}`,
    "",
    "返回格式：",
    '{"notes":["这次改动的简短说明"],"changes":[{"path":"allowed.path","value":"新内容"}]}',
    "",
    "allowedUpdates:",
    JSON.stringify(
      allowedUpdates.map((update) => ({
        path: update.path,
        label: update.label,
        kind: update.kind,
        currentValue: update.currentValue,
      })),
      null,
      2,
    ),
    "",
    "mediaAssets:",
    JSON.stringify(mediaAssets, null, 2),
  ].join("\n");
}

function buildVisualAiPrompt(params: {
  content: CmsContent;
  mediaLibrary: MediaLibraryState;
  instruction: string;
  language: Language;
  screenshot: VisualInput;
}) {
  return [
    buildAiPrompt(params),
    "",
    "额外视觉任务：",
    `管理员上传了一张网站截图：${params.screenshot.fileName} (${params.screenshot.mimeType})。`,
    "请先根据截图理解管理员指的是页面哪个区域，再结合 allowedUpdates 输出改动草稿。",
    "如果截图中的需求无法映射到 allowedUpdates，请在 notes 里说明原因，不要编造 path。",
    "不要输出坐标，不要描述截图本身，最终仍然只返回 JSON。",
  ].join("\n");
}

function createMockDraft(params: {
  content: CmsContent;
  mediaLibrary: MediaLibraryState;
  instruction: string;
  language: Language;
}): WebsiteDraftResult {
  const localized = resolveContentForLanguage(params.content, params.language);
  const firstImage = params.mediaLibrary.assets.find((asset) => asset.mediaType === "image")?.url ?? "";
  const changes: Array<{ path: string; value: string }> = [];

  if (params.language === "ru") {
    changes.push(
      { path: "homePage.sections.0.title", value: "Стоматология в Хэйхэ с понятной записью и поддержкой на русском" },
      { path: "homePage.sections.0.description", value: "Помогаем заранее уточнить лечение, стоимость, маршрут, перевод и проживание, а затем продолжить общение через Telegram." },
      { path: "homePage.sections.0.actions.0.label", value: "Получить консультацию" },
    );
  } else if (params.language === "en") {
    changes.push(
      { path: "homePage.sections.0.title", value: "Dental Care in Heihe With Clear Visit Support" },
      { path: "homePage.sections.0.description", value: "Check treatment needs, pricing, route, translation and accommodation first, then continue with staff through Telegram." },
      { path: "homePage.sections.0.actions.0.label", value: "Start Consultation" },
    );
  } else {
    changes.push(
      { path: "homePage.sections.0.title", value: "黑河牙科门诊，先在线咨询再安心到诊" },
      { path: "homePage.sections.0.description", value: "围绕种植、修复、牙齿治疗、路线翻译和住宿安排，先用 AI 收集需求，再由人工继续确认方案与时间。" },
      { path: "homePage.sections.0.actions.0.label", value: "开始在线咨询" },
    );
  }

  if (firstImage && localized.gallery[0]) {
    changes.push({ path: "gallery.0.imageUrl", value: firstImage });
  }

  const applied = applyChanges({
    content: params.content,
    language: params.language,
    changes,
    mediaLibrary: params.mediaLibrary,
  });

  return {
    content: applied.content,
    notes: [
      "当前 AI 配置未接入真实模型，已生成一份本地演示草稿。",
      params.instruction ? `管理员需求：${params.instruction}` : "可以在后台 AI 配置中接入 OpenAI Compatible 或 Responses 后生成真实草稿。",
    ],
  };
}

function createMockVisualDraft(params: {
  content: CmsContent;
  mediaLibrary: MediaLibraryState;
  instruction: string;
  language: Language;
  screenshot: VisualInput;
}): WebsiteDraftResult {
  const draft = createMockDraft(params);

  return {
    content: draft.content,
    notes: [
      "当前 AI 配置未接入真实视觉模型，已生成一份本地演示草稿。",
      `已收到截图：${params.screenshot.fileName}`,
      ...draft.notes.slice(1),
    ],
  };
}

function normalizeResponsesEndpoint(endpoint: string) {
  return endpoint.trim().replace(/\/chat\/completions\/?$/, "/responses");
}

async function postAiJson(params: {
  endpoint: string;
  apiKey: string;
  body: Record<string, unknown>;
  fallbackBody: Record<string, unknown>;
}) {
  async function send(body: Record<string, unknown>) {
    return fetch(params.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify(body),
    });
  }

  let response = await send(params.body);

  if (!response.ok && [400, 404, 422].includes(response.status)) {
    response = await send(params.fallbackBody);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`AI provider error: ${response.status}${errorText ? ` ${errorText.slice(0, 600)}` : ""}`);
  }

  return response.json() as Promise<unknown>;
}

function extractChatText(payload: unknown) {
  const value = payload as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  return value.choices?.[0]?.message?.content?.trim() ?? "";
}

function extractResponsesText(payload: unknown) {
  const value = payload as {
    output_text?: string;
    output?: Array<{
      content?: Array<{
        text?: string;
      }>;
    }>;
  };

  if (value.output_text?.trim()) {
    return value.output_text.trim();
  }

  return (
    value.output
      ?.flatMap((item) => item.content ?? [])
      .map((item) => item.text ?? "")
      .join("\n")
      .trim() ?? ""
  );
}

async function callChatDraft(config: AiConfig, prompt: string) {
  const body = {
    model: config.model,
    temperature: Math.min(config.temperature, 0.7),
    max_tokens: Math.max(config.maxTokens, 4096),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "你是网站 CMS 改版助手。只返回 JSON。",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  };
  const fallbackBody = {
    ...body,
    response_format: undefined,
  };
  const payload = await postAiJson({
    endpoint: config.endpoint,
    apiKey: config.apiKey,
    body,
    fallbackBody,
  });

  return extractChatText(payload);
}

async function callChatVisualDraft(config: AiConfig, prompt: string, screenshot: VisualInput) {
  const body = {
    model: config.model,
    temperature: Math.min(config.temperature, 0.7),
    max_tokens: Math.max(config.maxTokens, 4096),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "你是网站 CMS 视觉改版助手。只返回 JSON。",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt,
          },
          {
            type: "image_url",
            image_url: {
              url: screenshot.dataUrl,
            },
          },
        ],
      },
    ],
  };
  const fallbackBody = {
    ...body,
    response_format: undefined,
  };
  const payload = await postAiJson({
    endpoint: config.endpoint,
    apiKey: config.apiKey,
    body,
    fallbackBody,
  });

  return extractChatText(payload);
}

async function callResponsesDraft(config: AiConfig, prompt: string) {
  const body = {
    model: config.model,
    temperature: Math.min(config.temperature, 0.7),
    max_output_tokens: Math.max(config.maxTokens, 4096),
    instructions: "你是网站 CMS 改版助手。只返回 JSON。",
    input: prompt,
    text: {
      format: {
        type: "json_object",
      },
    },
  };
  const fallbackBody = {
    ...body,
    text: undefined,
  };
  const payload = await postAiJson({
    endpoint: normalizeResponsesEndpoint(config.endpoint),
    apiKey: config.apiKey,
    body,
    fallbackBody,
  });

  return extractResponsesText(payload);
}

async function callResponsesVisualDraft(config: AiConfig, prompt: string, screenshot: VisualInput) {
  const body = {
    model: config.model,
    temperature: Math.min(config.temperature, 0.7),
    max_output_tokens: Math.max(config.maxTokens, 4096),
    instructions: "你是网站 CMS 视觉改版助手。只返回 JSON。",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: prompt,
          },
          {
            type: "input_image",
            image_url: screenshot.dataUrl,
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_object",
      },
    },
  };
  const fallbackBody = {
    ...body,
    text: undefined,
  };
  const payload = await postAiJson({
    endpoint: normalizeResponsesEndpoint(config.endpoint),
    apiKey: config.apiKey,
    body,
    fallbackBody,
  });

  return extractResponsesText(payload);
}

export async function generateWebsiteDraft(params: {
  config: AiConfig;
  content: CmsContent;
  mediaLibrary: MediaLibraryState;
  instruction: string;
  language: Language;
}): Promise<WebsiteDraftResult> {
  if (params.config.provider === "mock" || !params.config.apiKey.trim()) {
    return createMockDraft(params);
  }

  const prompt = buildAiPrompt(params);
  const raw =
    params.config.provider === "openai_responses"
      ? await callResponsesDraft(params.config, prompt)
      : await callChatDraft(params.config, prompt);
  const parsed = parseAiDraftPayload(raw);
  const applied = applyChanges({
    content: params.content,
    language: params.language,
    changes: parsed.changes,
    mediaLibrary: params.mediaLibrary,
  });

  return {
    content: applied.content,
    notes: [
      ...parsed.notes,
      `AI 返回 ${parsed.changes.length} 项改动，实际应用 ${applied.appliedPaths.length} 项白名单改动。`,
    ],
  };
}

export async function generateVisualWebsiteDraft(params: {
  config: AiConfig;
  content: CmsContent;
  mediaLibrary: MediaLibraryState;
  instruction: string;
  language: Language;
  screenshot: VisualInput;
}): Promise<WebsiteDraftResult> {
  if (params.config.provider === "mock" || !params.config.apiKey.trim()) {
    return createMockVisualDraft(params);
  }

  const prompt = buildVisualAiPrompt(params);
  const raw =
    params.config.provider === "openai_responses"
      ? await callResponsesVisualDraft(params.config, prompt, params.screenshot)
      : await callChatVisualDraft(params.config, prompt, params.screenshot);
  const parsed = parseAiDraftPayload(raw);
  const applied = applyChanges({
    content: params.content,
    language: params.language,
    changes: parsed.changes,
    mediaLibrary: params.mediaLibrary,
  });

  return {
    content: applied.content,
    notes: [
      ...parsed.notes,
      `AI 根据截图返回 ${parsed.changes.length} 项改动，实际应用 ${applied.appliedPaths.length} 项白名单改动。`,
    ],
  };
}
