import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type CmsContent,
  chatSessionSchema,
  cmsContentSchema,
  cmsContentSeed,
  mediaLibraryStateSchema,
  type ChatSession,
} from "@quanyu/shared";
import { z } from "zod";
import { ensureAdminStorage, ensureChatStorage, ensureContentStorage, ensureMediaLibraryStorage, ensureUploadsStorage, getLocalStoragePaths } from "./storage-paths";

const BACKUP_FORMAT = "quanyu.admin.backup";
const BACKUP_VERSION = 1;
const AI_COPY_FORMAT = "quanyu.ai-copy-package";
const AI_COPY_VERSION = 1;

const adminConfigSchema = z.object({
  username: z.string().min(1),
  passwordHash: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const backupUploadFileSchema = z.object({
  path: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
  encoding: z.literal("base64"),
  contentBase64: z.string(),
});

const backupBundleSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  generatedAt: z.string(),
  source: z.object({
    app: z.literal("yakewangye"),
    dataRoot: z.string(),
  }),
  summary: z.object({
    articleCount: z.number().int().nonnegative(),
    doctorCount: z.number().int().nonnegative(),
    serviceCount: z.number().int().nonnegative(),
    pricingCount: z.number().int().nonnegative(),
    galleryCount: z.number().int().nonnegative(),
    pageCount: z.number().int().nonnegative(),
    chatSessionCount: z.number().int().nonnegative(),
    mediaAssetCount: z.number().int().nonnegative(),
    mediaFolderCount: z.number().int().nonnegative(),
    uploadFileCount: z.number().int().nonnegative(),
  }),
  data: z.object({
    content: cmsContentSchema,
    adminConfig: adminConfigSchema.nullable(),
    chatSessions: z.array(chatSessionSchema),
    mediaLibrary: mediaLibraryStateSchema,
  }),
  uploads: z.object({
    files: z.array(backupUploadFileSchema),
  }),
});

const aiCopyPackageSchema = z.object({
  format: z.literal(AI_COPY_FORMAT),
  version: z.literal(AI_COPY_VERSION),
  generatedAt: z.string(),
  source: z.object({
    app: z.literal("yakewangye"),
    dataRoot: z.string(),
  }),
  siteProfile: z.object({
    brandName: z.string(),
    websiteType: z.string(),
    businessSummary: z.string(),
    targetAudience: z.array(z.string()),
    languages: z.array(z.string()),
    primaryGoals: z.array(z.string()),
    identitySignals: z.array(z.string()),
    immutableFacts: z.array(z.string()),
  }),
  workflow: z.object({
    objective: z.string(),
    suggestedSteps: z.array(z.string()),
    outputRequirement: z.string(),
  }),
  editingRules: z.object({
    allowedOperations: z.array(z.string()),
    forbiddenOperations: z.array(z.string()),
    fieldHandling: z.array(
      z.object({
        path: z.string(),
        instruction: z.string(),
      }),
    ),
  }),
  promptTemplate: z.string(),
  contentSnapshot: cmsContentSchema,
});

export type BackupBundle = z.infer<typeof backupBundleSchema>;
export type AiCopyPackage = z.infer<typeof aiCopyPackageSchema>;

function normalizeBackupFilePath(value: string) {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/{2,}/g, "/");

  if (!normalized || normalized === "." || normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("invalid_backup_upload_path");
  }

  return normalized;
}

async function readJsonFile<T>(filePath: string, schema: z.ZodSchema<T>, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf8");
    return schema.parse(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

async function readAdminConfig() {
  const { adminConfigFilePath } = getLocalStoragePaths();
  await ensureAdminStorage();

  try {
    const raw = await readFile(adminConfigFilePath, "utf8");
    return adminConfigSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function listUploadFiles(currentDir: string, relativeDir = ""): Promise<BackupBundle["uploads"]["files"]> {
  const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => []);
  const files: BackupBundle["uploads"]["files"] = [];

  for (const entry of entries) {
    const absolutePath = path.resolve(currentDir, entry.name);
    const relativePath = relativeDir ? path.posix.join(relativeDir, entry.name) : entry.name;

    if (entry.isDirectory()) {
      files.push(...(await listUploadFiles(absolutePath, relativePath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const fileBuffer = await readFile(absolutePath);
    const fileStats = await stat(absolutePath);
    files.push({
      path: relativePath,
      mimeType: "application/octet-stream",
      size: fileStats.size,
      encoding: "base64",
      contentBase64: fileBuffer.toString("base64"),
    });
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function writeBackupJsonFile(targetPath: string, value: unknown) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, JSON.stringify(value, null, 2), "utf8");
}

function summarizeBusiness(content: z.infer<typeof cmsContentSchema>) {
  const contact = content.siteSettings.primaryContact;

  return [
    `${content.siteSettings.brandName} 是一个以牙科/门诊咨询转化为目标的营销网站。`,
    "站点通过首页介绍、服务项目、医生信息、价格说明、文章和 AI 导诊来获取咨询线索。",
    `当前公开联系信息包含电话 ${contact.phone}、地址 ${contact.address}、Telegram ${contact.telegramHandle || contact.telegramUrl}。`,
  ].join("");
}

function buildAiPromptTemplate(content: z.infer<typeof cmsContentSchema>) {
  return [
    "你正在为一个真实线上网站改写文案。",
    `品牌名：${content.siteSettings.brandName}`,
    "你的任务：先参考同类牙科/医疗服务网站的介绍方式，再重写这个网站的首页、服务、文章摘要和页面介绍文案。",
    "必须遵守：不要改 JSON 结构、不要改 id/slug/url/电话号码/地址/Telegram/价格数值/素材链接，除非字段本身就是纯介绍文案。",
    "注意：系统恢复时只接受白名单中的文案字段，其他字段就算改了也会被自动忽略。",
    "优先优化：信任感、专业度、跨境就诊说明、咨询转化率、语言自然度。",
    "输出要求：返回完整 JSON，结构必须与输入完全一致，只改适合改写的文字字段。",
  ].join("\n");
}

function createAiCopyPackage(params: { content: z.infer<typeof cmsContentSchema>; dataRoot: string }) {
  const { content, dataRoot } = params;
  const contact = content.siteSettings.primaryContact;

  return aiCopyPackageSchema.parse({
    format: AI_COPY_FORMAT,
    version: AI_COPY_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      app: "yakewangye",
      dataRoot,
    },
    siteProfile: {
      brandName: content.siteSettings.brandName,
      websiteType: "牙科诊所/门诊官网，带内容管理、AI 导诊和咨询转化能力",
      businessSummary: summarizeBusiness(content),
      targetAudience: ["牙科治疗意向客户", "跨境就诊客户", "需要先线上咨询再转人工的访客"],
      languages: ["中文", "俄语", "英语"],
      primaryGoals: ["让访客快速理解诊所实力和服务范围", "提高咨询与 Telegram 转化", "让介绍文案更专业、更像真实医疗服务网站"],
      identitySignals: ["诊所品牌", "医生团队", "服务项目", "价格说明", "跨境就诊支持", "AI 初筛问诊"],
      immutableFacts: [
        `品牌名称：${content.siteSettings.brandName}`,
        `联系电话：${contact.phone}`,
        `地址：${contact.address}`,
        `Telegram：${contact.telegramHandle} / ${contact.telegramUrl}`,
        "所有 id、slug、URL、图片地址、视频地址、价格数字、联系方式默认不改",
      ],
    },
    workflow: {
      objective: "参考其他同类网站后，重写更匹配本站定位的介绍文案，并返回可直接导回本系统的内容 JSON。",
      suggestedSteps: [
        "先理解 siteProfile，明确这是牙科诊所营销站而不是纯资讯站。",
        "浏览同类牙科/门诊网站，提炼他们的首页卖点、服务介绍、信任表达和行动号召。",
        "基于 contentSnapshot 改写标题、描述、摘要、正文等纯文案字段。",
        "保留结构和事实信息，输出完整 JSON。",
      ],
      outputRequirement: "返回内容包时，结构必须与 contentSnapshot 完全一致，可直接被本站恢复。",
    },
    editingRules: {
      allowedOperations: [
        "改写首页标题、副标题、说明文字和 CTA 文案",
        "改写服务介绍、医生简介、文章摘要与页面正文",
        "优化 SEO 标题和 SEO 描述",
        "统一语言风格，让文案更专业、更可信、更适合转化",
      ],
      forbiddenOperations: [
        "不要删除或新增顶层字段",
        "不要修改任何 id、slug、href、url、fileName、storageKey",
        "不要随意编造电话号码、地址、医生资历、价格、治疗结果或法律承诺",
        "不要改写管理配置、素材文件、聊天记录或管理员信息",
        "白名单之外的改动在系统导入时会被自动忽略",
      ],
      fieldHandling: [
        { path: "siteSettings.brandName", instruction: "默认保持不变，除非用户明确要求改品牌名。" },
        { path: "siteSettings.primaryContact.*", instruction: "联系方式和地址默认保持不变。" },
        { path: "homePage.sections[*].title/description/actions[*].label", instruction: "这些是优先优化的转化文案。" },
        { path: "articles[*].title/summary/content", instruction: "可根据竞品风格重写，但要与牙科场景匹配。" },
        { path: "services[*].title/summary", instruction: "可重写为更像真实门诊服务介绍。" },
        { path: "doctors[*].name/title/bio", instruction: "可润色表达，但不要虚构资历。" },
        { path: "pages[*].title/summary/content/seoTitle/seoDescription", instruction: "可全面重写。" },
        { path: "aiConfig", instruction: "除非用户明确要求，不要修改 API、模型或提示词配置。" },
      ],
    },
    promptTemplate: buildAiPromptTemplate(content),
    contentSnapshot: content,
  });
}

function sanitizePageSections(current: CmsContent["homePage"]["sections"], incoming: CmsContent["homePage"]["sections"]) {
  return current.map((section, index) => {
    const next = incoming[index];

    if (!next || next.type !== section.type || next.id !== section.id) {
      return section;
    }

    switch (section.type) {
      case "hero": {
        const nextHero = next as Extract<CmsContent["homePage"]["sections"][number], { type: "hero" }>;
        return {
          ...section,
          eyebrow: nextHero.eyebrow,
          title: nextHero.title,
          description: nextHero.description,
          actions: section.actions.map((action, actionIndex) => ({
            ...action,
            label: nextHero.actions[actionIndex]?.label ?? action.label,
          })),
          highlights: section.highlights.map((item, itemIndex) => ({
            ...item,
            label: nextHero.highlights[itemIndex]?.label ?? item.label,
            value: nextHero.highlights[itemIndex]?.value ?? item.value,
          })),
          aiPanel: {
            ...section.aiPanel,
            title: nextHero.aiPanel.title,
            description: nextHero.aiPanel.description,
            steps: section.aiPanel.steps.map((step, stepIndex) => nextHero.aiPanel.steps[stepIndex] ?? step),
          },
        };
      }
      case "services": {
        const nextServices = next as Extract<CmsContent["homePage"]["sections"][number], { type: "services" }>;
        return {
          ...section,
          eyebrow: nextServices.eyebrow,
          title: nextServices.title,
          description: nextServices.description,
          items: section.items.map((item, itemIndex) => ({
            ...item,
            tag: nextServices.items[itemIndex]?.tag ?? item.tag,
            title: nextServices.items[itemIndex]?.title ?? item.title,
            summary: nextServices.items[itemIndex]?.summary ?? item.summary,
            ctaLabel: nextServices.items[itemIndex]?.ctaLabel ?? item.ctaLabel,
          })),
        };
      }
      case "journey": {
        const nextJourney = next as Extract<CmsContent["homePage"]["sections"][number], { type: "journey" }>;
        return {
          ...section,
          eyebrow: nextJourney.eyebrow,
          title: nextJourney.title,
          description: nextJourney.description,
          steps: section.steps.map((item, itemIndex) => ({
            ...item,
            title: nextJourney.steps[itemIndex]?.title ?? item.title,
            summary: nextJourney.steps[itemIndex]?.summary ?? item.summary,
          })),
        };
      }
      case "gallery": {
        const nextGallery = next as Extract<CmsContent["homePage"]["sections"][number], { type: "gallery" }>;
        return {
          ...section,
          eyebrow: nextGallery.eyebrow,
          title: nextGallery.title,
          description: nextGallery.description,
          items: section.items.map((item, itemIndex) => ({
            ...item,
            title: nextGallery.items[itemIndex]?.title ?? item.title,
            summary: nextGallery.items[itemIndex]?.summary ?? item.summary,
          })),
        };
      }
      case "articles": {
        const nextArticles = next as Extract<CmsContent["homePage"]["sections"][number], { type: "articles" }>;
        return {
          ...section,
          eyebrow: nextArticles.eyebrow,
          title: nextArticles.title,
          description: nextArticles.description,
          items: section.items.map((item, itemIndex) => ({
            ...item,
            category: nextArticles.items[itemIndex]?.category ?? item.category,
            title: nextArticles.items[itemIndex]?.title ?? item.title,
            excerpt: nextArticles.items[itemIndex]?.excerpt ?? item.excerpt,
            seoTitle: nextArticles.items[itemIndex]?.seoTitle ?? item.seoTitle,
          })),
        };
      }
      case "analytics": {
        const nextAnalytics = next as Extract<CmsContent["homePage"]["sections"][number], { type: "analytics" }>;
        return {
          ...section,
          eyebrow: nextAnalytics.eyebrow,
          title: nextAnalytics.title,
          description: nextAnalytics.description,
          metrics: section.metrics.map((item, itemIndex) => ({
            ...item,
            label: nextAnalytics.metrics[itemIndex]?.label ?? item.label,
            value: nextAnalytics.metrics[itemIndex]?.value ?? item.value,
            note: nextAnalytics.metrics[itemIndex]?.note ?? item.note,
          })),
        };
      }
      default:
        return section;
    }
  });
}

function sanitizeAiCopyContent(current: CmsContent, incoming: CmsContent): CmsContent {
  return {
    ...current,
    siteSettings: {
      ...current.siteSettings,
      brandName: current.siteSettings.brandName,
      topbarNotice: incoming.siteSettings.topbarNotice,
      footerDescription: incoming.siteSettings.footerDescription,
      primaryContact: current.siteSettings.primaryContact,
      navigation: current.siteSettings.navigation.map((item, index) => ({
        ...item,
        label: incoming.siteSettings.navigation[index]?.label ?? item.label,
      })),
    },
    homePage: {
      ...current.homePage,
      title: incoming.homePage.title,
      seoTitle: incoming.homePage.seoTitle,
      seoDescription: incoming.homePage.seoDescription,
      sections: sanitizePageSections(current.homePage.sections, incoming.homePage.sections),
    },
    articles: current.articles.map((item, index) => ({
      ...item,
      title: incoming.articles[index]?.title ?? item.title,
      category: incoming.articles[index]?.category ?? item.category,
      excerpt: incoming.articles[index]?.excerpt ?? item.excerpt,
      content: incoming.articles[index]?.content ?? item.content,
      seoTitle: incoming.articles[index]?.seoTitle ?? item.seoTitle,
      seoDescription: incoming.articles[index]?.seoDescription ?? item.seoDescription,
    })),
    doctors: current.doctors.map((item, index) => ({
      ...item,
      name: incoming.doctors[index]?.name ?? item.name,
      title: incoming.doctors[index]?.title ?? item.title,
      summary: incoming.doctors[index]?.summary ?? item.summary,
      specialties: item.specialties.map((specialty, specialtyIndex) => incoming.doctors[index]?.specialties[specialtyIndex] ?? specialty),
      experience: incoming.doctors[index]?.experience ?? item.experience,
    })),
    services: current.services.map((item, index) => ({
      ...item,
      name: incoming.services[index]?.name ?? item.name,
      category: incoming.services[index]?.category ?? item.category,
      summary: incoming.services[index]?.summary ?? item.summary,
      details: incoming.services[index]?.details ?? item.details,
    })),
    pricing: current.pricing.map((item, index) => ({
      ...item,
      name: incoming.pricing[index]?.name ?? item.name,
      category: incoming.pricing[index]?.category ?? item.category,
      notes: incoming.pricing[index]?.notes ?? item.notes,
    })),
    gallery: current.gallery.map((item, index) => ({
      ...item,
      title: incoming.gallery[index]?.title ?? item.title,
      summary: incoming.gallery[index]?.summary ?? item.summary,
    })),
    pages: current.pages.map((item, index) => ({
      ...item,
      title: incoming.pages[index]?.title ?? item.title,
      summary: incoming.pages[index]?.summary ?? item.summary,
      content: incoming.pages[index]?.content ?? item.content,
      seoTitle: incoming.pages[index]?.seoTitle ?? item.seoTitle,
      seoDescription: incoming.pages[index]?.seoDescription ?? item.seoDescription,
    })),
    aiConfig: current.aiConfig,
    telegramConfig: current.telegramConfig,
  };
}

export async function createBackupBundle(): Promise<BackupBundle> {
  const paths = getLocalStoragePaths();
  await ensureContentStorage();
  await ensureChatStorage();
  await ensureAdminStorage();
  await ensureMediaLibraryStorage();
  await ensureUploadsStorage();

  const [content, adminConfig, chatSessions, mediaLibrary, uploadFiles] = await Promise.all([
    readJsonFile(paths.contentFilePath, cmsContentSchema, cmsContentSeed),
    readAdminConfig(),
    readJsonFile(paths.chatSessionsFilePath, z.array(chatSessionSchema), [] as ChatSession[]),
    readJsonFile(paths.mediaLibraryFilePath, mediaLibraryStateSchema, mediaLibraryStateSchema.parse({ folders: [], assets: [] })),
    listUploadFiles(paths.uploadsDir),
  ]);

  return backupBundleSchema.parse({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      app: "yakewangye",
      dataRoot: paths.dataRoot,
    },
    summary: {
      articleCount: content.articles.length,
      doctorCount: content.doctors.length,
      serviceCount: content.services.length,
      pricingCount: content.pricing.length,
      galleryCount: content.gallery.length,
      pageCount: content.pages.length,
      chatSessionCount: chatSessions.length,
      mediaAssetCount: mediaLibrary.assets.length,
      mediaFolderCount: mediaLibrary.folders.length,
      uploadFileCount: uploadFiles.length,
    },
    data: {
      content,
      adminConfig,
      chatSessions,
      mediaLibrary,
    },
    uploads: {
      files: uploadFiles,
    },
  });
}

export async function serializeBackupBundle() {
  return JSON.stringify(await createBackupBundle(), null, 2);
}

export async function createAiCopyPackageBundle() {
  const paths = getLocalStoragePaths();
  await ensureContentStorage();
  const content = await readJsonFile(paths.contentFilePath, cmsContentSchema, cmsContentSeed);
  return createAiCopyPackage({
    content,
    dataRoot: paths.dataRoot,
  });
}

export async function serializeAiCopyPackageBundle() {
  return JSON.stringify(await createAiCopyPackageBundle(), null, 2);
}

export async function restoreBackupBundle(rawInput: string | Buffer) {
  const rawText = Buffer.isBuffer(rawInput) ? rawInput.toString("utf8") : rawInput;
  const bundle = backupBundleSchema.parse(JSON.parse(rawText));
  const paths = getLocalStoragePaths();

  await mkdir(paths.dataRoot, { recursive: true });
  await writeBackupJsonFile(
    path.resolve(paths.dataRoot, "restore-snapshots", `pre-restore-${new Date().toISOString().replace(/[:.]/g, "-")}.json`),
    await createBackupBundle(),
  );

  await writeBackupJsonFile(paths.contentFilePath, bundle.data.content);
  await writeBackupJsonFile(paths.chatSessionsFilePath, bundle.data.chatSessions);
  await writeBackupJsonFile(paths.mediaLibraryFilePath, bundle.data.mediaLibrary);

  if (bundle.data.adminConfig) {
    await writeBackupJsonFile(paths.adminConfigFilePath, bundle.data.adminConfig);
  } else {
    await rm(paths.adminConfigFilePath, { force: true });
  }

  await rm(paths.uploadsDir, { recursive: true, force: true });
  await mkdir(paths.uploadsDir, { recursive: true });

  for (const file of bundle.uploads.files) {
    const relativePath = normalizeBackupFilePath(file.path);
    const targetPath = path.resolve(paths.uploadsDir, relativePath);
    const uploadsRoot = path.resolve(paths.uploadsDir);

    if (targetPath !== uploadsRoot && !targetPath.startsWith(`${uploadsRoot}${path.sep}`)) {
      throw new Error("invalid_backup_upload_path");
    }

    const buffer = Buffer.from(file.contentBase64, "base64");
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, buffer);
  }

  return {
    bundle,
    restoredAt: new Date().toISOString(),
  };
}

export async function restoreAiCopyPackage(rawInput: string | Buffer) {
  const rawText = Buffer.isBuffer(rawInput) ? rawInput.toString("utf8") : rawInput;
  const bundle = aiCopyPackageSchema.parse(JSON.parse(rawText));
  const paths = getLocalStoragePaths();
  const currentContent = await readJsonFile(paths.contentFilePath, cmsContentSchema, cmsContentSeed);
  const sanitizedContent = sanitizeAiCopyContent(currentContent, bundle.contentSnapshot);

  await mkdir(paths.dataRoot, { recursive: true });
  await writeBackupJsonFile(
    path.resolve(paths.dataRoot, "restore-snapshots", `pre-ai-restore-${new Date().toISOString().replace(/[:.]/g, "-")}.json`),
    await createAiCopyPackageBundle(),
  );
  await writeBackupJsonFile(paths.contentFilePath, sanitizedContent);

  return {
    bundle,
    restoredAt: new Date().toISOString(),
  };
}
