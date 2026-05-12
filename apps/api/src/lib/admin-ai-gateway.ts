import { z } from "zod";
import {
  cmsContentSchema,
  type AiConfig,
  type CmsContent,
  type Language,
  type MediaLibraryAsset,
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

type TranslationDraftResult = {
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
        value: z.unknown(),
      }),
    )
    .max(120)
    .default([]),
});

const createServiceValueSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(60),
  summary: z.string().trim().min(1).max(260),
  details: z.string().trim().min(1).max(900),
  image: z.string().trim().min(1),
});

const createGalleryValueSchema = z.object({
  title: z.string().trim().min(1).max(90),
  summary: z.string().trim().min(1).max(260),
  imageUrl: z.string().trim().min(1),
});

const mediaAssetAnalysisSchema = z.object({
  summary: z.string().default(""),
  visualDescription: z.string().default(""),
  tags: z.array(z.string()).default([]),
  suggestedUseCases: z.array(z.string()).default([]),
  unsuitableUseCases: z.array(z.string()).default([]),
  placementSuggestions: z.array(z.string()).default([]),
  dentalRelevance: z.string().default(""),
  patientFacingCaption: z.string().default(""),
  safetyNotes: z.array(z.string()).default([]),
});

type MediaAnalysisInput = {
  asset: MediaLibraryAsset;
  config: AiConfig;
  language: Language;
  dataUrl?: string;
};

const AI_DRAFT_MEDIA_ASSET_LIMIT = Math.max(8, Number(process.env.AI_DRAFT_MEDIA_ASSET_LIMIT ?? 28) || 28);

function truncateText(value: string | undefined, maxLength: number) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function compactArray(values: string[] | undefined, limit: number, maxItemLength: number) {
  return (values ?? []).slice(0, limit).map((value) => truncateText(value, maxItemLength)).filter(Boolean);
}

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

    const length = Math.max(base.length, override.length);
    return Array.from({ length }, (_, index) => {
      if (!(index in override)) {
        return base[index];
      }
      if (!(index in base)) {
        return override[index];
      }
      return deepMerge(base[index], override[index]);
    });
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

function normalizeChangeTextValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function parseCreateValue(value: unknown) {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function createContentId(prefix: string, existingIds: Set<string>, index: number) {
  const timestamp = Date.now().toString(36);
  let candidate = `${prefix}-ai-${timestamp}-${index + 1}`;
  let suffix = 2;

  while (existingIds.has(candidate)) {
    candidate = `${prefix}-ai-${timestamp}-${index + 1}-${suffix}`;
    suffix += 1;
  }

  existingIds.add(candidate);
  return candidate;
}

function applyChanges(params: {
  content: CmsContent;
  language: Language;
  changes: Array<{ path: string; value?: unknown }>;
  mediaLibrary: MediaLibraryState;
}) {
  const localizedContent = resolveContentForLanguage(params.content, params.language);
  const allowedUpdates = buildAllowedUpdates(localizedContent);
  const allowedByPath = new Map(allowedUpdates.map((update) => [update.path, update]));
  const mediaUrls = new Set(params.mediaLibrary.assets.map((asset) => asset.url));
  const mediaAssetByUrl = new Map(params.mediaLibrary.assets.map((asset) => [asset.url, asset]));
  const appliedPaths: string[] = [];

  const next = updateLocalizedContentDraft(params.content, params.language, (current) => {
    const working = deepClone(current);
    const serviceIds = new Set(working.services.map((item) => item.id));
    const galleryIds = new Set(working.gallery.map((item) => item.id));

    params.changes.forEach((change, changeIndex) => {
      if (change.path === "create.services") {
        const parsed = createServiceValueSchema.safeParse(parseCreateValue(change.value));
        if (!parsed.success) {
          return;
        }

        const asset = mediaAssetByUrl.get(parsed.data.image);
        if (!asset || asset.mediaType !== "image") {
          return;
        }

        const item = {
          id: createContentId("service", serviceIds, changeIndex),
          name: parsed.data.name,
          category: parsed.data.category,
          summary: parsed.data.summary,
          details: parsed.data.details,
          image: parsed.data.image,
        };
        working.services.push(item);
        appliedPaths.push(`services.${item.id}.__create`);
        return;
      }

      if (change.path === "create.gallery") {
        const parsed = createGalleryValueSchema.safeParse(parseCreateValue(change.value));
        if (!parsed.success) {
          return;
        }

        const asset = mediaAssetByUrl.get(parsed.data.imageUrl);
        if (!asset) {
          return;
        }

        const item = {
          id: createContentId("gallery", galleryIds, changeIndex),
          title: parsed.data.title,
          summary: parsed.data.summary,
          imageUrl: parsed.data.imageUrl,
          mediaType: asset.mediaType,
        };
        working.gallery.push(item);
        appliedPaths.push(`gallery.${item.id}.__create`);
        return;
      }

      const update = allowedByPath.get(change.path);

      if (!update) {
        return;
      }

      const rawValue = normalizeChangeTextValue(change.value);

      if (rawValue === null) {
        return;
      }

      const nextValue = update.kind === "text" ? rawValue : normalizeMediaValue(rawValue, update, mediaUrls);

      if (nextValue === null) {
        return;
      }

      setPathValue(working, change.path, nextValue);
      if (update.kind === "media_url" && change.path.match(/^gallery\.\d+\.imageUrl$/)) {
        const asset = mediaAssetByUrl.get(nextValue);
        if (asset) {
          setPathValue(working, change.path.replace(/\.imageUrl$/, ".mediaType"), asset.mediaType);
        }
      }
      appliedPaths.push(change.path);
    });

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

function createAiDraftParseError(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(`invalid_ai_draft_response: AI 返回的 JSON 格式不合格或被截断。已尝试自动修复但仍失败。原始解析错误：${detail}`);
}

function buildCompactMediaAssets(mediaLibrary: MediaLibraryState) {
  return [...mediaLibrary.assets]
    .sort((left, right) => {
      const score = (asset: MediaLibraryAsset) =>
        asset.aiAnalysis?.status === "ready" ? 3 : asset.aiAnalysis?.status === "metadata_only" ? 2 : asset.aiAnalysis ? 1 : 0;
      return score(right) - score(left) || right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, AI_DRAFT_MEDIA_ASSET_LIMIT)
    .map((asset) => ({
      title: truncateText(asset.title, 60),
      url: asset.url,
      mediaType: asset.mediaType,
      folderPath: truncateText(asset.folderPath, 80),
      aiSummary: truncateText(asset.aiAnalysis?.summary, 140),
      visualDescription: truncateText(asset.aiAnalysis?.visualDescription, 220),
      tags: compactArray(asset.aiAnalysis?.tags, 8, 24),
      suggestedUseCases: compactArray(asset.aiAnalysis?.suggestedUseCases, 4, 80),
      unsuitableUseCases: compactArray(asset.aiAnalysis?.unsuitableUseCases, 3, 80),
      placementSuggestions: compactArray(asset.aiAnalysis?.placementSuggestions, 4, 80),
      patientFacingCaption: truncateText(asset.aiAnalysis?.patientFacingCaption, 100),
      analysisStatus: asset.aiAnalysis?.status ?? "not_analyzed",
    }));
}

function buildAiPrompt(params: {
  content: CmsContent;
  mediaLibrary: MediaLibraryState;
  instruction: string;
  language: Language;
}) {
  const allowedUpdates = buildAllowedUpdates(resolveContentForLanguage(params.content, params.language));
  const mediaAssets = buildCompactMediaAssets(params.mediaLibrary);

  return [
    "你是泉寓门诊网站的 AI 改版助手，负责根据管理员需求生成网站内容和素材使用草稿。",
    "你只能返回 JSON，不要返回 Markdown。",
    "必须遵守：",
    "1. 修改已有内容时，只允许使用 allowedUpdates 中列出的 path。",
    "2. 不允许修改 id、slug、href、电话、地址、Telegram、AI 配置、API Key、模型配置。",
    "3. 不允许编造医生资历、价格承诺、治疗效果、法律承诺。",
    "4. 你必须认真阅读 mediaAssets 的 aiSummary、visualDescription、tags、suggestedUseCases、placementSuggestions；如果素材明显代表一个当前网站没有的新牙科服务、医院环境、住宿环境、路线/翻译支持或展示内容，不要硬塞进已有服务，应该使用 create.services 或 create.gallery 新增内容。",
    "5. 可以改写文案、SEO、服务介绍、流程表达，也可以根据素材 AI 标注选择合适素材 URL 填到 media 类型 path。",
    "6. media 类型 path 和新增内容里的素材 URL 只能使用 mediaAssets 里已有的 url，不要编造外链。服务 image 必须用图片；图册 imageUrl 可以用图片或视频。",
    "7. 输出语言必须匹配 language。",
    "8. 如果素材没有 aiSummary，说明还没有做 AI 素材分析，优先使用已有分析结果的素材。",
    "9. 新增内容必须只围绕牙科治疗、门诊环境、就诊流程、住宿环境、路线/翻译/跨境就诊支持，不要新增无关营销栏目。",
    "10. 不要重复新增已有服务；只有素材 AI 标注提供了明确的新主题或管理员明确要求新增时才新增。",
    "",
    `language: ${params.language}`,
    `管理员需求: ${params.instruction}`,
    "",
    "返回格式：",
    '{"notes":["这次改动的简短说明"],"changes":[{"path":"allowed.path","value":"新内容"},{"path":"create.services","value":{"name":"服务名称","category":"分类","summary":"摘要","details":"详情","image":"/uploads/example.jpg"}},{"path":"create.gallery","value":{"title":"展示标题","summary":"展示摘要","imageUrl":"/uploads/example.mp4"}}]}',
    "",
    "可新增内容：",
    JSON.stringify(
      [
        {
          path: "create.services",
          useWhen: "素材 AI 标注显示这是一个当前 services 列表没有覆盖的新牙科服务或服务场景。",
          valueSchema: { name: "服务名称", category: "服务分类", summary: "短摘要", details: "详细介绍", image: "mediaAssets 中的图片 url" },
        },
        {
          path: "create.gallery",
          useWhen: "素材 AI 标注显示这是适合展示的医院环境、治疗场景、住宿环境、路线/翻译支持、设备或视频。",
          valueSchema: { title: "图册标题", summary: "展示说明", imageUrl: "mediaAssets 中的图片或视频 url" },
        },
      ],
      null,
      2,
    ),
    "",
    "allowedUpdates:",
    JSON.stringify(
      allowedUpdates.map((update) => ({
        path: update.path,
        label: update.label,
        kind: update.kind,
        currentValue: truncateText(update.currentValue, update.kind === "text" ? 300 : 160),
      })),
      null,
      2,
    ),
    "",
    "mediaAssets:",
    JSON.stringify(mediaAssets, null, 2),
  ].join("\n");
}

function buildTranslationPrompt(params: {
  content: CmsContent;
  targetLanguage: Exclude<Language, "zh">;
}) {
  const sourceUpdates = buildAllowedUpdates(resolveContentForLanguage(params.content, "zh")).filter((update) => update.kind === "text");
  const targetName = params.targetLanguage === "ru" ? "俄语" : "英语";

  return [
    "你是牙科门诊网站三语内容翻译助手。",
    "你只能返回 JSON，不要返回 Markdown。",
    `任务：把中文主内容翻译成${targetName}，用于网站 ${params.targetLanguage} 语言版本。`,
    "必须遵守：",
    "1. 只翻译 sourceTexts 中列出的 value，返回同一个 path 的翻译结果。",
    "2. 不要新增、删除或改名 path。",
    "3. 不要翻译 URL、id、slug、href、电话、地址、Telegram、API Key、模型配置。",
    "4. 医疗内容要自然、克制，不要编造医生资历、价格承诺、治疗效果或法律承诺。",
    "5. 牙科服务、医院环境、住宿、路线、翻译、跨境就诊相关表达要适合真实患者阅读。",
    "6. 俄语要面向俄罗斯患者自然表达；英语要面向国际访客自然表达。",
    "",
    "返回格式：",
    '{"notes":["翻译说明"],"changes":[{"path":"source.path","value":"翻译后的文本"}]}',
    "",
    "sourceTexts:",
    JSON.stringify(
      sourceUpdates.map((update) => ({
        path: update.path,
        label: update.label,
        value: truncateText(update.currentValue, 1200),
      })),
      null,
      2,
    ),
  ].join("\n");
}

function buildVisualAiPrompt(params: {
  content: CmsContent;
  mediaLibrary: MediaLibraryState;
  instruction: string;
  language: Language;
  screenshots: VisualInput[];
}) {
  return [
    buildAiPrompt(params),
    "",
    "额外视觉任务：",
    params.screenshots.length
      ? `管理员上传了 ${params.screenshots.length} 张网站截图：${params.screenshots.map((item) => `${item.fileName} (${item.mimeType})`).join("；")}。`
      : "管理员没有上传截图，本次只根据文字描述、当前 CMS 内容和素材库生成改动草稿。",
    "如果有截图，请先根据截图理解管理员指的是页面哪个区域，再结合 allowedUpdates 和可新增内容输出改动草稿。",
    "如果需求无法映射到 allowedUpdates 或 create.services/create.gallery，请在 notes 里说明原因，不要编造 path。",
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
  screenshots: VisualInput[];
}): WebsiteDraftResult {
  const draft = createMockDraft(params);

  return {
    content: draft.content,
    notes: [
      params.screenshots.length
        ? "当前 AI 配置未接入真实视觉模型，已根据多图任务生成一份本地演示草稿。"
        : "当前 AI 配置未接入真实模型，已根据文字描述生成一份本地演示草稿。",
      params.screenshots.length ? `已收到截图：${params.screenshots.map((item) => item.fileName).join("、")}` : "本次未上传截图。",
      ...draft.notes.slice(1),
    ],
  };
}

function stripMarkdownJson(input: string) {
  const trimmed = input.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function parseMediaAnalysisPayload(raw: string) {
  const stripped = stripMarkdownJson(raw);

  try {
    return mediaAssetAnalysisSchema.parse(JSON.parse(stripped));
  } catch {
    const firstBrace = stripped.indexOf("{");
    const lastBrace = stripped.lastIndexOf("}");

    if (firstBrace < 0 || lastBrace <= firstBrace) {
      throw new Error("invalid_media_analysis_response");
    }

    return mediaAssetAnalysisSchema.parse(JSON.parse(stripped.slice(firstBrace, lastBrace + 1)));
  }
}

function buildMediaAssetAnalysisPrompt(params: MediaAnalysisInput) {
  const { asset, language, dataUrl } = params;
  const canSeeMedia = Boolean(dataUrl && asset.mediaType === "image");

  return [
    "你是牙科门诊网站素材库分析助手。你要为每个图片/视频写出方便网站 AI 后续自动排版和选素材的结构化描述。",
    "只返回 JSON，不要 Markdown。",
    "必须围绕牙科门诊官网、线上问诊、跨境就诊、医院环境、住宿/路线/翻译服务这些场景判断素材用途。",
    "不要编造医学效果、医生资质、具体治疗承诺。如果看不清或只是文件名推断，要在 safetyNotes 里说明。",
    "",
    `language: ${language}`,
    `mediaType: ${asset.mediaType}`,
    `title: ${asset.title}`,
    `fileName: ${asset.fileName}`,
    `folderPath: ${asset.folderPath || "/"}`,
    `mimeType: ${asset.mimeType}`,
    `url: ${asset.url}`,
    canSeeMedia
      ? "你可以看到这张图片，请根据实际视觉内容描述。"
      : "你不能逐帧观看这个视频/文件，只能基于标题、文件名、文件夹和上下文生成 metadata_only 分析；不要假装已经看过画面。",
    "",
    "返回 JSON 格式：",
    JSON.stringify({
      summary: "一句话概括素材",
      visualDescription: "详细描述画面或 metadata_only 判断依据",
      tags: ["牙科", "环境", "设备"],
      suggestedUseCases: ["适合放在首页图册", "适合服务项目封面"],
      unsuitableUseCases: ["不适合医生头像"],
      placementSuggestions: ["homePage.sections.gallery.items.0.cover", "gallery.imageUrl"],
      dentalRelevance: "和牙科/门诊/就诊服务的关联度说明",
      patientFacingCaption: "可直接给访客看的简短说明",
      safetyNotes: ["如果内容不明确，在这里写限制"],
    }),
  ].join("\n");
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

async function callChatVisualDraft(config: AiConfig, prompt: string, screenshots: VisualInput[]) {
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
          ...screenshots.map((screenshot) => ({
            type: "image_url",
            image_url: {
              url: screenshot.dataUrl,
            },
          })),
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

async function callResponsesVisualDraft(config: AiConfig, prompt: string, screenshots: VisualInput[]) {
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
          ...screenshots.map((screenshot) => ({
            type: "input_image",
            image_url: screenshot.dataUrl,
          })),
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

async function callChatJsonRepair(config: AiConfig, raw: string) {
  const body = {
    model: config.model,
    temperature: 0,
    max_tokens: 1600,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "你是 JSON 修复器。只返回合法 JSON，不要解释。",
      },
      {
        role: "user",
        content: [
          "把下面内容修复为合法 JSON，结构必须是：",
          '{"notes":["说明"],"changes":[{"path":"allowed.path","value":"新内容"},{"path":"create.services","value":{"name":"服务名称","category":"分类","summary":"摘要","details":"详情","image":"/uploads/example.jpg"}}]}',
          "如果某项不完整就删除该项。不要新增非原文表达的改动。",
          "",
          raw.slice(0, 12000),
        ].join("\n"),
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

async function callResponsesJsonRepair(config: AiConfig, raw: string) {
  const body = {
    model: config.model,
    temperature: 0,
    max_output_tokens: 1600,
    instructions: "你是 JSON 修复器。只返回合法 JSON，不要解释。",
    input: [
      "把下面内容修复为合法 JSON，结构必须是：",
      '{"notes":["说明"],"changes":[{"path":"allowed.path","value":"新内容"},{"path":"create.services","value":{"name":"服务名称","category":"分类","summary":"摘要","details":"详情","image":"/uploads/example.jpg"}}]}',
      "如果某项不完整就删除该项。不要新增非原文表达的改动。",
      "",
      raw.slice(0, 12000),
    ].join("\n"),
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

async function parseAiDraftPayloadWithRepair(raw: string, config: AiConfig) {
  try {
    return parseAiDraftPayload(raw);
  } catch (firstError) {
    try {
      const repaired =
        config.provider === "openai_responses"
          ? await callResponsesJsonRepair(config, raw)
          : await callChatJsonRepair(config, raw);
      return parseAiDraftPayload(repaired);
    } catch (repairError) {
      throw createAiDraftParseError(repairError instanceof Error ? repairError : firstError);
    }
  }
}

async function callChatMediaAnalysis(config: AiConfig, prompt: string, dataUrl?: string) {
  const content = dataUrl
    ? [
        {
          type: "text",
          text: prompt,
        },
        {
          type: "image_url",
          image_url: {
            url: dataUrl,
          },
        },
      ]
    : prompt;
  const body = {
    model: config.model,
    temperature: Math.min(config.temperature, 0.4),
    max_tokens: Math.max(config.maxTokens, 1200),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "你是网站素材库 AI 分析助手。只返回 JSON。",
      },
      {
        role: "user",
        content,
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

async function callResponsesMediaAnalysis(config: AiConfig, prompt: string, dataUrl?: string) {
  const body = {
    model: config.model,
    temperature: Math.min(config.temperature, 0.4),
    max_output_tokens: Math.max(config.maxTokens, 1200),
    instructions: "你是网站素材库 AI 分析助手。只返回 JSON。",
    input: dataUrl
      ? [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: prompt,
              },
              {
                type: "input_image",
                image_url: dataUrl,
              },
            ],
          },
        ]
      : prompt,
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

export async function analyzeMediaAsset(params: MediaAnalysisInput): Promise<NonNullable<MediaLibraryAsset["aiAnalysis"]>> {
  const isVisionAnalysis = Boolean(params.dataUrl && params.asset.mediaType === "image");

  if (params.config.provider === "mock" || !params.config.apiKey.trim()) {
    return {
      status: isVisionAnalysis ? "ready" : "metadata_only",
      language: params.language,
      summary: `${params.asset.title} 可作为网站素材使用。`,
      visualDescription:
        params.asset.mediaType === "video"
          ? "当前未接入视频逐帧识别，已根据文件名、标题和文件夹生成素材建议。"
          : "当前 AI 配置未接入真实视觉模型，已生成本地演示描述。",
      tags: [params.asset.mediaType === "video" ? "视频" : "图片", "牙科", "素材"],
      suggestedUseCases: ["可用于首页图册、图册视频列表或相关服务模块。"],
      unsuitableUseCases: ["不建议用于无法对应内容的医生头像或具体治疗效果证明。"],
      placementSuggestions: ["homePage.sections.gallery.items.cover", "gallery.imageUrl"],
      dentalRelevance: "需要结合网站上下文确认具体放置位置。",
      patientFacingCaption: params.asset.title,
      safetyNotes: ["本条为本地演示分析，建议接入支持图片输入的模型后重新分析。"],
      analyzedAt: new Date().toISOString(),
      model: params.config.model || "mock",
      source: isVisionAnalysis ? "vision" : "metadata",
    };
  }

  const prompt = buildMediaAssetAnalysisPrompt(params);
  let raw: string;
  let source: "vision" | "metadata" = isVisionAnalysis ? "vision" : "metadata";
  let status: "ready" | "metadata_only" = isVisionAnalysis ? "ready" : "metadata_only";
  let fallbackNote = "";

  try {
    raw =
      params.config.provider === "openai_responses"
        ? await callResponsesMediaAnalysis(params.config, prompt, isVisionAnalysis ? params.dataUrl : undefined)
        : await callChatMediaAnalysis(params.config, prompt, isVisionAnalysis ? params.dataUrl : undefined);
  } catch (error) {
    if (!isVisionAnalysis) {
      throw error;
    }

    source = "metadata";
    status = "metadata_only";
    fallbackNote = `视觉识别调用失败，已退回元数据分析：${error instanceof Error ? error.message : String(error)}`;
    const metadataPrompt = buildMediaAssetAnalysisPrompt({
      ...params,
      dataUrl: undefined,
    });
    raw =
      params.config.provider === "openai_responses"
        ? await callResponsesMediaAnalysis(params.config, metadataPrompt, undefined)
        : await callChatMediaAnalysis(params.config, metadataPrompt, undefined);
  }

  const parsed = parseMediaAnalysisPayload(raw);

  return {
    status,
    language: params.language,
    ...parsed,
    safetyNotes: fallbackNote ? [fallbackNote, ...parsed.safetyNotes] : parsed.safetyNotes,
    analyzedAt: new Date().toISOString(),
    model: params.config.model,
    source,
  };
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
  const parsed = await parseAiDraftPayloadWithRepair(raw, params.config);
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

export async function generateWebsiteDraftForMediaAsset(params: {
  config: AiConfig;
  content: CmsContent;
  asset: MediaLibraryAsset;
  instruction: string;
  language: Language;
}): Promise<WebsiteDraftResult> {
  const assetUseHint = [
    "本次是逐个素材改站流程，只处理下面这个素材，不要考虑素材库其他素材。",
    `素材标题：${params.asset.title}`,
    `素材 URL：${params.asset.url}`,
    `素材类型：${params.asset.mediaType}`,
    `AI 摘要：${params.asset.aiAnalysis?.summary ?? "未分析"}`,
    `视觉描述：${params.asset.aiAnalysis?.visualDescription ?? "未分析"}`,
    `适用场景：${(params.asset.aiAnalysis?.suggestedUseCases ?? []).join("；") || "未分析"}`,
    `建议位置：${(params.asset.aiAnalysis?.placementSuggestions ?? []).join("；") || "未分析"}`,
    "请判断这个素材是否值得用于网站。如果适合，优先新增服务或新增图册；如果只适合替换已有图片，也可以替换。若不适合使用，notes 说明原因并返回空 changes。",
  ].join("\n");

  const result = await generateWebsiteDraft({
    config: params.config,
    content: params.content,
    mediaLibrary: {
      folders: [],
      assets: [params.asset],
    },
    instruction: [params.instruction, assetUseHint].join("\n\n"),
    language: params.language,
  });

  return {
    content: result.content,
    notes: [`素材 ${params.asset.title || params.asset.fileName}：`, ...result.notes],
  };
}

export async function generateVisualWebsiteDraft(params: {
  config: AiConfig;
  content: CmsContent;
  mediaLibrary: MediaLibraryState;
  instruction: string;
  language: Language;
  screenshots: VisualInput[];
}): Promise<WebsiteDraftResult> {
  if (params.config.provider === "mock" || !params.config.apiKey.trim()) {
    return createMockVisualDraft(params);
  }

  const prompt = buildVisualAiPrompt(params);
  const raw =
    params.screenshots.length === 0
      ? params.config.provider === "openai_responses"
        ? await callResponsesDraft(params.config, prompt)
        : await callChatDraft(params.config, prompt)
      : params.config.provider === "openai_responses"
      ? await callResponsesVisualDraft(params.config, prompt, params.screenshots)
      : await callChatVisualDraft(params.config, prompt, params.screenshots);
  const parsed = await parseAiDraftPayloadWithRepair(raw, params.config);
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
      `AI 根据${params.screenshots.length ? `${params.screenshots.length} 张截图和` : ""}描述返回 ${parsed.changes.length} 项改动，实际应用 ${applied.appliedPaths.length} 项白名单改动。`,
    ],
  };
}

export async function translateWebsiteFromChinese(params: {
  config: AiConfig;
  content: CmsContent;
  targetLanguages: Array<Exclude<Language, "zh">>;
}): Promise<TranslationDraftResult> {
  if (params.config.provider === "mock" || !params.config.apiKey.trim()) {
    return {
      content: params.content,
      notes: ["当前 AI 配置未接入真实模型，无法自动翻译中文修改。请先在 AI 配置里接入可用模型。"],
    };
  }

  let nextContent = params.content;
  const notes: string[] = [];

  for (const targetLanguage of params.targetLanguages) {
    const prompt = buildTranslationPrompt({
      content: nextContent,
      targetLanguage,
    });
    const raw =
      params.config.provider === "openai_responses"
        ? await callResponsesDraft(params.config, prompt)
        : await callChatDraft(params.config, prompt);
    const parsed = await parseAiDraftPayloadWithRepair(raw, params.config);
    const applied = applyChanges({
      content: nextContent,
      language: targetLanguage,
      changes: parsed.changes,
      mediaLibrary: { folders: [], assets: [] },
    });

    nextContent = applied.content;
    notes.push(
      ...parsed.notes,
      `${targetLanguage === "ru" ? "俄语" : "英语"}翻译返回 ${parsed.changes.length} 项，实际应用 ${applied.appliedPaths.length} 项。`,
    );
  }

  return {
    content: nextContent,
    notes,
  };
}
