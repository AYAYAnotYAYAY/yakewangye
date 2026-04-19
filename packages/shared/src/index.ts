import { z } from "zod";

export const navigationItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  href: z.string(),
});

export const actionSchema = z.object({
  label: z.string(),
  href: z.string(),
  variant: z.enum(["primary", "secondary"]),
});

export const siteSettingsSchema = z.object({
  brandName: z.string(),
  topbarNotice: z.string(),
  footerDescription: z.string(),
  primaryContact: z.object({
    phone: z.string(),
    address: z.string(),
    telegramHandle: z.string(),
    telegramUrl: z.string(),
  }),
  navigation: z.array(navigationItemSchema),
});

export const heroSectionSchema = z.object({
  id: z.string(),
  type: z.literal("hero"),
  eyebrow: z.string(),
  title: z.string(),
  description: z.string(),
  actions: z.array(actionSchema),
  highlights: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
    }),
  ),
  aiPanel: z.object({
    title: z.string(),
    description: z.string(),
    steps: z.array(z.string()),
  }),
});

export const servicesSectionSchema = z.object({
  id: z.string(),
  type: z.literal("services"),
  eyebrow: z.string(),
  title: z.string(),
  description: z.string(),
  items: z.array(
    z.object({
      tag: z.string(),
      title: z.string(),
      summary: z.string(),
      ctaLabel: z.string(),
    }),
  ),
});

export const journeySectionSchema = z.object({
  id: z.string(),
  type: z.literal("journey"),
  eyebrow: z.string(),
  title: z.string(),
  description: z.string(),
  steps: z.array(
    z.object({
      title: z.string(),
      summary: z.string(),
    }),
  ),
});

export const gallerySectionSchema = z.object({
  id: z.string(),
  type: z.literal("gallery"),
  eyebrow: z.string(),
  title: z.string(),
  description: z.string(),
  items: z.array(
    z.object({
      title: z.string(),
      summary: z.string(),
      cover: z.string(),
    }),
  ),
});

export const articlesSectionSchema = z.object({
  id: z.string(),
  type: z.literal("articles"),
  eyebrow: z.string(),
  title: z.string(),
  description: z.string(),
  items: z.array(
    z.object({
      slug: z.string(),
      category: z.string(),
      title: z.string(),
      excerpt: z.string(),
      seoTitle: z.string(),
    }),
  ),
});

export const analyticsSectionSchema = z.object({
  id: z.string(),
  type: z.literal("analytics"),
  eyebrow: z.string(),
  title: z.string(),
  description: z.string(),
  metrics: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      note: z.string(),
    }),
  ),
});

export const pageSectionSchema = z.discriminatedUnion("type", [
  heroSectionSchema,
  servicesSectionSchema,
  journeySectionSchema,
  gallerySectionSchema,
  articlesSectionSchema,
  analyticsSectionSchema,
]);

export const pageSchema = z.object({
  slug: z.string(),
  title: z.string(),
  seoTitle: z.string(),
  seoDescription: z.string(),
  sections: z.array(pageSectionSchema),
});

export const articleSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  category: z.string(),
  excerpt: z.string(),
  content: z.string(),
  coverImage: z.string(),
  seoTitle: z.string(),
  seoDescription: z.string(),
  publishedAt: z.string(),
});

export const doctorSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  summary: z.string(),
  specialties: z.array(z.string()),
  image: z.string(),
  experience: z.string(),
});

export const serviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  summary: z.string(),
  details: z.string(),
  image: z.string(),
});

export const pricingItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  price: z.string(),
  notes: z.string(),
});

export const galleryAssetSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  imageUrl: z.string(),
  mediaType: z.enum(["image", "video"]),
});

export const landingPageSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  content: z.string(),
  seoTitle: z.string(),
  seoDescription: z.string(),
});

export const aiProviderSchema = z.enum(["mock", "openai_compatible", "openai_responses"]);

export const aiConfigSchema = z.object({
  provider: aiProviderSchema,
  endpoint: z.string(),
  apiKey: z.string(),
  model: z.string(),
  systemPrompt: z.string(),
  triagePrompt: z.string(),
  leadPrompt: z.string(),
  fallbackReply: z.string(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(128).max(4096),
});

export const telegramConfigSchema = z.object({
  enabled: z.boolean(),
  botToken: z.string(),
  chatId: z.string(),
  contactUrl: z.string(),
  handoffTemplate: z.string(),
});

export const chatMessageRecordSchema = z.object({
  id: z.string(),
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
  createdAt: z.string(),
});

export const triageResultSchema = z.object({
  intent: z.string(),
  urgent: z.boolean(),
  recommendedAction: z.string(),
  suggestedNextStep: z.string(),
});

export const chatSessionSchema = z.object({
  sessionId: z.string(),
  language: z.enum(["zh", "ru", "en"]),
  visitorId: z.string(),
  startedAt: z.string(),
  updatedAt: z.string(),
  triage: triageResultSchema.optional(),
  messages: z.array(chatMessageRecordSchema),
});

export const cmsContentSchema = z.object({
  siteSettings: siteSettingsSchema,
  homePage: pageSchema,
  articles: z.array(articleSchema),
  doctors: z.array(doctorSchema),
  services: z.array(serviceSchema),
  pricing: z.array(pricingItemSchema),
  gallery: z.array(galleryAssetSchema),
  pages: z.array(landingPageSchema),
  aiConfig: aiConfigSchema,
  telegramConfig: telegramConfigSchema,
});

export type SiteSettings = z.infer<typeof siteSettingsSchema>;
export type HeroSection = z.infer<typeof heroSectionSchema>;
export type ServicesSection = z.infer<typeof servicesSectionSchema>;
export type JourneySection = z.infer<typeof journeySectionSchema>;
export type GallerySection = z.infer<typeof gallerySectionSchema>;
export type ArticlesSection = z.infer<typeof articlesSectionSchema>;
export type AnalyticsSection = z.infer<typeof analyticsSectionSchema>;
export type PageSection = z.infer<typeof pageSectionSchema>;
export type Page = z.infer<typeof pageSchema>;
export type Article = z.infer<typeof articleSchema>;
export type Doctor = z.infer<typeof doctorSchema>;
export type ServiceItem = z.infer<typeof serviceSchema>;
export type PricingItem = z.infer<typeof pricingItemSchema>;
export type GalleryAsset = z.infer<typeof galleryAssetSchema>;
export type LandingPage = z.infer<typeof landingPageSchema>;
export type AiConfig = z.infer<typeof aiConfigSchema>;
export type TelegramConfig = z.infer<typeof telegramConfigSchema>;
export type ChatMessageRecord = z.infer<typeof chatMessageRecordSchema>;
export type TriageResult = z.infer<typeof triageResultSchema>;
export type ChatSession = z.infer<typeof chatSessionSchema>;
export type CmsContent = z.infer<typeof cmsContentSchema>;

export const siteMetadata = {
  title: "泉寓门诊数字化平台",
  description: "支持内容管理、AI 导诊、Telegram 转人工、SEO 与访客分析的牙科营销平台。",
  siteUrl: "http://localhost:3000",
} as const;

const siteSettingsSeed: SiteSettings = {
  brandName: "泉寓门诊",
  topbarNotice: "俄语/中文/英语站点、多语言 SEO、AI 导诊与 Telegram 转化系统",
  footerDescription:
    "这是第一版可运行骨架，目标是为后续 CMS、AI 问诊、文章发布、访客分析与 CRM 打下稳定基础。",
  primaryContact: {
    phone: "+86 9619527988",
    address: "黑龙江省黑河市爱辉区花园街道环城东路33号",
    telegramHandle: "@quanyu_consult",
    telegramUrl: "https://t.me/quanyu_consult",
  },
  navigation: [
    { id: "ai-chat", label: "AI 问诊", href: "#ai-chat" },
    { id: "services", label: "服务项目", href: "/services" },
    { id: "doctors", label: "医生团队", href: "/doctors" },
    { id: "pricing", label: "价格说明", href: "/pricing" },
    { id: "articles", label: "文章内容", href: "/articles" },
    { id: "gallery", label: "图册视频", href: "/gallery" },
    { id: "contact", label: "联系咨询", href: "#contact" },
  ],
};

const homePageSeed: Page = {
  slug: "/",
  title: "泉寓门诊首页",
  seoTitle: "泉寓门诊 | AI 导诊 + Telegram 转人工 + SEO 营销平台",
  seoDescription:
    "模块化官网、文章系统、图册视频、AI 导诊、Telegram 转人工、访客分析与管理后台的一体化骨架。",
  sections: [
    {
      id: "hero-home",
      type: "hero",
      eyebrow: "黑河跨境牙科咨询",
      title: "先在线问诊，再决定是否去 Telegram 和真人医生沟通",
      description:
        "面向俄罗斯和跨境就诊客户的简洁咨询页。先由 AI 收集症状、治疗意向和价格关注点，再导向 Telegram 人工接待。",
      actions: [
        { label: "进入 Telegram", href: "https://t.me/quanyu_consult", variant: "primary" },
        { label: "在线问诊", href: "#ai-chat", variant: "secondary" },
      ],
      highlights: [
        { label: "初步回复", value: "5 分钟内" },
        { label: "跨境协助", value: "接待/翻译/路线" },
        { label: "核心方向", value: "种植/修复/急症" },
      ],
      aiPanel: {
        title: "先问 4 个问题",
        description:
          "症状、持续时间、是否出血或疼痛、是否拍过片。AI 会先做初步分诊，再提示是否需要尽快转人工。",
        steps: [
          "1. 说明你的症状和想做的项目",
          "2. 判断是否高紧急度或高意向",
          "3. 引导进入 Telegram 继续沟通",
        ],
      },
    },
    {
      id: "services-home",
      type: "services",
      eyebrow: "核心项目",
      title: "先把客户最关心的项目说清楚",
      description:
        "参考医疗咨询站的做法，首页不再堆太多模块，只保留高频咨询内容和强转化入口。",
      items: [
        {
          tag: "种植牙",
          title: "单颗 / 多颗 / 半口种植",
          summary: "适合缺牙、咀嚼下降和修复需求客户，先由 AI 收集缺牙情况和片子情况。",
          ctaLabel: "先问价格与方案",
        },
        {
          tag: "修复",
          title: "冠桥 / 义齿 / 美学修复",
          summary: "适合牙体缺损、旧修复体更换和外观改善需求。",
          ctaLabel: "先问材料与周期",
        },
        {
          tag: "急症",
          title: "牙疼 / 出血 / 松动 / 炎症",
          summary: "高紧急度问题优先转人工，减少来回试探式沟通。",
          ctaLabel: "先判断是否急症",
        },
      ],
    },
    {
      id: "journey-home",
      type: "journey",
      eyebrow: "咨询流程",
      title: "从访问首页到转真人，流程要足够短",
      description:
        "参考你的两个目标站，首页应该先解决信任、项目范围、价格关切和人工联系，而不是展示过多冗余内容。",
      steps: [
        {
          title: "在线初筛",
          summary: "AI 先收集症状、治疗方向、时间和是否有片子。",
        },
        {
          title: "判断优先级",
          summary: "价格咨询、种植意向、急性疼痛、修复需求分别走不同引导。",
        },
        {
          title: "转 Telegram",
          summary: "高意向或急症客户直接推送到 Telegram，减少信息丢失。",
        },
        {
          title: "人工接待",
          summary: "在 Telegram 里继续发送片子、问价格、确认路线和预约时间。",
        },
      ],
    },
    {
      id: "analytics-home",
      type: "analytics",
      eyebrow: "关键信息",
      title: "首页只保留最关键的转化信息",
      description:
        "价格、人工联系、跨境就诊支持、来访路径和咨询数据，都已经能在后台持续扩展。",
      metrics: [
        { label: "联系电话", value: "+86 9619527988", note: "适合直接电话或 Telegram 咨询" },
        { label: "地址", value: "黑河市环城东路33号", note: "支持跨境就诊路线说明" },
        { label: "人工转接", value: "Telegram", note: "AI 问诊后自动导向真人继续沟通" },
      ],
    },
  ],
};

const articlesSeed: Article[] = [
  {
    id: "article-1",
    slug: "implantation-heihe-overview",
    title: "黑河种植牙常见问题与跨境就诊说明",
    category: "种植牙",
    excerpt: "解释适用人群、流程、材料差异和术后恢复，适合作为搜索入口文章。",
    content:
      "这是一篇后台可编辑的文章示例。后续可以替换为富文本编辑器与正式 CMS 存储。",
    coverImage: "",
    seoTitle: "黑河种植牙指南 | 费用、流程、恢复期",
    seoDescription: "用于 SEO 和搜索引擎着陆的种植牙文章示例。",
    publishedAt: "2026-04-19",
  },
];

const doctorsSeed: Doctor[] = [
  {
    id: "doctor-1",
    name: "张医生",
    title: "种植修复主任医师",
    summary: "专注种植牙与复杂修复，负责跨境患者初诊评估与方案制定。",
    specialties: ["种植牙", "修复", "复杂病例"],
    image: "",
    experience: "12 年临床经验",
  },
];

const servicesSeed: ServiceItem[] = [
  {
    id: "service-1",
    name: "种植牙",
    category: "修复治疗",
    summary: "针对缺牙、咀嚼功能下降与美观修复的综合方案。",
    details: "支持单颗、多颗及半口方案评估。",
    image: "",
  },
];

const pricingSeed: PricingItem[] = [
  {
    id: "pricing-1",
    name: "种植牙初诊评估",
    category: "诊断",
    price: "¥299 起",
    notes: "以最终拍片和口腔情况为准。",
  },
];

const gallerySeed: GalleryAsset[] = [
  {
    id: "gallery-1",
    title: "门诊接待区",
    summary: "用于展示诊所环境。",
    imageUrl: "",
    mediaType: "image",
  },
];

const pagesSeed: LandingPage[] = [
  {
    id: "page-1",
    slug: "price-guide",
    title: "价格说明页",
    summary: "介绍价格结构、透明报价和咨询方式。",
    content: "这是一个后台可编辑的自定义页面示例。",
    seoTitle: "泉寓门诊价格说明",
    seoDescription: "支持自定义页面和 SEO 字段。",
  },
];

const aiConfigSeed: AiConfig = {
  provider: "mock",
  endpoint: "https://api.openai.com/v1/chat/completions",
  apiKey: "",
  model: "gpt-4.1-mini",
  systemPrompt:
    "你是泉寓门诊的网站 AI 导诊助手。你不能做明确医疗诊断，只能做初步问诊收集、风险提示、引导用户进入真人沟通。回答要简洁、礼貌，优先推动收集症状、持续时间、疼痛程度、是否出血、是否已有影像资料。",
  triagePrompt:
    "在回复里要完成三件事：1. 给出非诊断性的初步建议；2. 判断是否应该尽快联系真人医生；3. 若用户表现出强意向或紧急情况，引导其进入 Telegram 沟通。",
  leadPrompt:
    "当用户询问价格、种植牙、修复、急性疼痛、跨境就诊、预约流程时，应主动收集联系方式意愿，并提示可以转 Telegram 继续。",
  fallbackReply:
    "我先帮你做初步分诊。请告诉我你的主要问题、持续多久了、是否疼痛或出血、是否已经拍过片，我再给你下一步建议。",
  temperature: 0.3,
  maxTokens: 800,
};

const telegramConfigSeed: TelegramConfig = {
  enabled: false,
  botToken: "",
  chatId: "",
  contactUrl: "https://t.me/quanyu_consult",
  handoffTemplate:
    "新问诊线索\n会话ID: {{sessionId}}\n访客ID: {{visitorId}}\n意图: {{intent}}\n紧急度: {{urgent}}\n用户消息: {{message}}\n建议动作: {{recommendedAction}}\n下一步: {{suggestedNextStep}}",
};

export const cmsContentSeed: CmsContent = {
  siteSettings: siteSettingsSeed,
  homePage: homePageSeed,
  articles: articlesSeed,
  doctors: doctorsSeed,
  services: servicesSeed,
  pricing: pricingSeed,
  gallery: gallerySeed,
  pages: pagesSeed,
  aiConfig: aiConfigSeed,
  telegramConfig: telegramConfigSeed,
};
