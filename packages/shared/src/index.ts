import { z } from "zod";

export const languageSchema = z.enum(["zh", "ru", "en"]);

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

export const mediaLibraryAssetSchema = z.object({
  id: z.string(),
  title: z.string(),
  fileName: z.string(),
  storageKey: z.string(),
  folderPath: z.string(),
  url: z.string(),
  mediaType: z.enum(["image", "video"]),
  mimeType: z.string(),
  size: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
  source: z.enum(["upload", "import", "copy"]),
});

export const mediaLibraryAssetListSchema = z.array(mediaLibraryAssetSchema);

export const mediaLibraryFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const mediaLibraryStateSchema = z.object({
  folders: z.array(mediaLibraryFolderSchema),
  assets: z.array(mediaLibraryAssetSchema),
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
  language: languageSchema,
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
  i18n: z
    .object({
      zh: z.unknown().optional(),
      ru: z.unknown().optional(),
      en: z.unknown().optional(),
    })
    .optional(),
});

export type Language = z.infer<typeof languageSchema>;
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
export type MediaLibraryAsset = z.infer<typeof mediaLibraryAssetSchema>;
export type MediaLibraryFolder = z.infer<typeof mediaLibraryFolderSchema>;
export type MediaLibraryState = z.infer<typeof mediaLibraryStateSchema>;
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
    "你是泉寓门诊的网站 AI 导诊助手。只允许讨论牙齿/口腔问题、牙科治疗项目、门诊/医院信息、医生与接待流程、价格预约、跨境到诊、路线翻译、住宿环境和 Telegram 转人工。不能回答编程、金融、政治、作业考试、普通闲聊或非牙科医疗诊断。你不能做明确医疗诊断、不能开药、不能承诺疗效，只能做初步问诊收集、风险提示、引导用户进入真人沟通。必须按用户当前语言用中文、俄语或英语回答。",
  triagePrompt:
    "在回复里要完成三件事：1. 给出非诊断性的初步建议；2. 判断是否应该尽快联系真人医生；3. 若用户表现出强意向或紧急情况，引导其进入 Telegram 沟通。若问题越界，只能简短拒绝并提示可咨询牙齿、门诊、价格预约、路线翻译或住宿问题。",
  leadPrompt:
    "当用户询问价格、种植牙、修复、急性疼痛、跨境就诊、预约流程、路线翻译或住宿环境时，应主动收集联系方式意愿，并提示可以转 Telegram 继续。不要索要身份证、银行卡、密码等敏感信息。",
  fallbackReply:
    "我先帮你做牙科初步分诊。请告诉我牙齿/口腔的主要问题、持续多久了、是否疼痛或出血、是否已经拍过片；如果是来院安排，也可以说明价格、预约、路线、翻译或住宿需求。",
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

const i18nSeed: Partial<Record<Language, unknown>> = {
  ru: {
    siteSettings: {
      topbarNotice: "Консультации на китайском, русском и английском языках, AI-первичный опрос и перевод в Telegram",
      footerDescription:
        "Клиника «Цюаньюй» помогает сначала понять направления лечения, объем услуг и способ консультации, а затем перейти к общению с администратором или в Telegram.",
      navigation: [
        { id: "ai-chat", label: "AI-опрос" },
        { id: "services", label: "Услуги" },
        { id: "doctors", label: "Врачи" },
        { id: "pricing", label: "Цены" },
        { id: "articles", label: "Статьи" },
        { id: "gallery", label: "Клиника" },
        { id: "contact", label: "Контакты" },
      ],
    },
    homePage: {
      title: "泉寓门诊 | Стоматологическая консультация в Хэйхэ и помощь для пациентов из-за рубежа",
      seoTitle: "泉寓门诊 | Стоматология в Хэйхэ, имплантация, протезирование и консультации",
      seoDescription:
        "Имплантация, восстановление зубов, неотложные обращения и консультации для пациентов из Китая и из-за рубежа. Сначала онлайн-опрос, затем связь через Telegram.",
      sections: [
        {
          eyebrow: "Стоматологическая консультация в Хэйхэ",
          title: "Имплантация, протезирование и острая зубная боль: сначала уточните ситуацию, затем продолжайте общение",
          description:
            "Клиника «Цюаньюй» принимает местных и зарубежных пациентов. Вы можете сначала описать симптомы, цель лечения и вопросы по цене, а затем перейти к общению в Telegram.",
          actions: [{ label: "Перейти в Telegram" }, { label: "Начать онлайн-опрос" }],
          highlights: [
            { label: "Каналы связи", value: "AI + Telegram" },
            { label: "Языки", value: "Китайский / Русский / Английский" },
            { label: "Основные запросы", value: "Имплантация / Протезирование / Срочная помощь" },
          ],
          aiPanel: {
            title: "Сначала кратко опишите ситуацию",
            description:
              "Укажите симптомы, длительность, уровень боли и наличие снимков, чтобы понять, нужен ли быстрый перевод к администратору.",
            steps: [
              "1. Опишите симптомы, отсутствие зубов или интересующий вас проект",
              "2. Получите первичную оценку типа проблемы и приоритета",
              "3. При необходимости продолжите общение в Telegram",
            ],
          },
        },
        {
          eyebrow: "Основные направления",
          title: "Частые стоматологические запросы и что важно уточнить заранее",
          description:
            "На главной странице сначала объясняются самые частые услуги, подходящие случаи и ключевые вопросы для консультации.",
          items: [
            {
              tag: "Имплантация",
              title: "Одиночная / множественная / полу-челюстная имплантация",
              summary:
                "Подходит при отсутствии зубов и снижении жевательной функции. До консультации желательно сообщить зону отсутствия зубов, количество и наличие снимков.",
              ctaLabel: "Уточнить план и оценку",
            },
            {
              tag: "Протезирование",
              title: "Коронки / мосты / съемные протезы / эстетическое восстановление",
              summary:
                "Подходит при дефектах зубов, замене старых конструкций, восстановлении внешнего вида и функции.",
              ctaLabel: "Уточнить материалы и сроки",
            },
            {
              tag: "Срочно",
              title: "Боль / кровоточивость / подвижность / воспаление",
              summary:
                "При боли, кровоточивости десен, подвижности зубов или воспалении лучше обратиться как можно раньше для оценки срочности.",
              ctaLabel: "Понять срочность обращения",
            },
          ],
        },
        {
          eyebrow: "Порядок консультации",
          title: "От первого обращения до связи с администратором без лишних шагов",
          description:
            "Сайт сначала объясняет спектр услуг, способ связи и логику консультации, чтобы пациент быстрее дошел до полезного общения.",
          steps: [
            { title: "Отправьте исходные данные", summary: "Опишите симптомы, отсутствие зубов, цель лечения и наличие снимков." },
            { title: "Сформируйте вопросы", summary: "После первичной сортировки проще обсудить имплантацию, протезирование, срочность и цену." },
            { title: "Перейдите в Telegram", summary: "Если нужно продолжить, отправьте дополнительные материалы и вопросы в Telegram." },
            { title: "Подключается администратор", summary: "Далее уточняются направление лечения, подготовка материалов и план визита." },
          ],
        },
        {
          eyebrow: "Ключевая информация",
          title: "Самое важное перед обращением видно сразу",
          description:
            "Контакты, адрес, способ связи и дальнейший шаг собраны на одной странице, чтобы не приходилось искать информацию по сайту.",
          metrics: [
            { label: "Телефон", value: "+86 9619527988", note: "Можно продолжить консультацию по телефону или в Telegram" },
            { label: "Адрес", value: "黑河市环城东路33号", note: "黑龙江省黑河市爱辉区花园街道环城东路33号" },
            { label: "Связь с администратором", value: "Telegram", note: "Удобно отправлять снимки, уточнять процесс и запись" },
          ],
        },
      ],
    },
    articles: [
      {
        id: "article-1",
        title: "Имплантация зубов в Хэйхэ: кому подходит, как проходит и как подготовиться к консультации",
        category: "Имплантация",
        excerpt:
          "Кратко о первичной оценке, снимках, этапах лечения, восстановлении и способе связи для пациентов из-за рубежа.",
        content:
          "Вопрос о том, подходит ли имплантация, решается после оценки отсутствующих зубов, состояния кости, общей стоматологической ситуации и рентгенологических данных. До консультации желательно сообщить, каких зубов не хватает, как давно это произошло, проводилось ли ранее лечение и есть ли панорамный снимок или КТ. Для пациентов из-за рубежа полезно заранее обсудить удобные даты, подготовку документов и желаемый диапазон стоимости.",
        seoTitle: "Имплантация зубов в Хэйхэ | консультация, этапы и подготовка",
        seoDescription:
          "Узнайте, какие данные нужны для первичной оценки имплантации, как проходит консультация и как удобнее подготовиться к визиту.",
      },
    ],
    doctors: [
      {
        id: "doctor-1",
        title: "Главный врач по имплантации и протезированию",
        summary:
          "Занимается клинической работой в направлениях имплантации и протезирования, помогает на этапе первичной оценки и обсуждения дальнейшего плана лечения.",
        specialties: ["Имплантация", "Протезирование", "Сложные случаи"],
        experience: "12 лет клинической практики",
      },
    ],
    services: [
      {
        id: "service-1",
        name: "Имплантация зубов",
        category: "Восстановительное лечение",
        summary:
          "Первичная оценка и обсуждение направления лечения при отсутствии зубов, снижении жевательной функции и необходимости восстановления.",
        details:
          "Поддерживаются консультации по одиночной, множественной и полу-челюстной имплантации. Окончательный план определяется после осмотра и снимков.",
      },
    ],
    pricing: [
      {
        id: "pricing-1",
        name: "Первичная оценка перед имплантацией",
        category: "Диагностика",
        notes:
          "Указана ориентировочная стоимость первичного этапа. Итоговая цена зависит от снимков, обследования и реальной клинической ситуации.",
      },
    ],
    gallery: [
      {
        id: "gallery-1",
        title: "Зона приема пациентов",
        summary: "Видео и изображения помогают заранее понять обстановку и организацию приема.",
      },
    ],
    pages: [
      {
        id: "page-1",
        title: "Цены и способ консультации",
        summary: "Что влияет на цену, как запрашивать оценку и почему окончательная стоимость подтверждается после диагностики.",
        content:
          "Стоимость стоматологического лечения зависит от типа услуги, объема восстановления, выбранных материалов, исходной ситуации в полости рта и необходимости дополнительных обследований. Цены на сайте подходят только как предварительный ориентир. Для точной оценки лучше сначала отправить основные данные и снимки через онлайн-опрос или Telegram, после чего администратор поможет продолжить общение.",
        seoTitle: "泉寓门诊 | цены, первичная оценка и порядок консультации",
        seoDescription:
          "Узнайте, как формируется стоимость стоматологического лечения, какие данные нужны для предварительной оценки и как продолжить консультацию.",
      },
    ],
    aiConfig: {
      fallbackReply:
        "Я помогу с первичным опросом. Опишите основную проблему, сколько она длится, есть ли боль или кровоточивость и имеются ли снимки, после чего я подскажу следующий шаг.",
    },
  },
  en: {
    siteSettings: {
      topbarNotice: "Chinese / Russian / English consultation with AI pre-screening and Telegram handoff",
      footerDescription:
        "Quanyu Clinic helps patients first understand treatment scope, consultation flow and contact options, then continue with staff through Telegram or direct contact.",
      navigation: [
        { id: "ai-chat", label: "AI Triage" },
        { id: "services", label: "Services" },
        { id: "doctors", label: "Doctors" },
        { id: "pricing", label: "Pricing" },
        { id: "articles", label: "Articles" },
        { id: "gallery", label: "Clinic" },
        { id: "contact", label: "Contact" },
      ],
    },
    homePage: {
      title: "泉寓门诊 | Dental Consultation in Heihe for Local and Cross-Border Patients",
      seoTitle: "泉寓门诊 | Dental Consultation, Implant and Restorative Care in Heihe",
      seoDescription:
        "Consultation for implants, restorative treatment, urgent dental issues and cross-border visits. Start with online triage, then continue through Telegram.",
      sections: [
        {
          eyebrow: "Dental Consultation in Heihe",
          title: "Implants, restorations and tooth pain: understand the direction first, then continue the conversation",
          description:
            "Quanyu Clinic provides dental consultation for local and cross-border patients. You can first describe symptoms, treatment goals and pricing questions, then continue with staff in Telegram.",
          actions: [{ label: "Open Telegram" }, { label: "Start Online Triage" }],
          highlights: [
            { label: "Consultation Channels", value: "AI + Telegram" },
            { label: "Languages", value: "Chinese / Russian / English" },
            { label: "Common Needs", value: "Implants / Restorations / Urgent Care" },
          ],
          aiPanel: {
            title: "Start by describing your case",
            description:
              "Share your symptoms, duration, pain level and whether you already have imaging so we can judge whether faster human follow-up is needed.",
            steps: [
              "1. Describe symptoms, missing teeth or the service you want to ask about",
              "2. Get an initial sense of issue type and priority",
              "3. Move to Telegram when further communication is needed",
            ],
          },
        },
        {
          eyebrow: "Core Services",
          title: "Common dental services and what to clarify before consultation",
          description:
            "The homepage explains the services patients ask about most often, the common indications and the key points worth clarifying in advance.",
          items: [
            {
              tag: "Implants",
              title: "Single / Multiple / Half-arch Implant Consultation",
              summary:
                "Suitable for missing teeth and functional restoration. It helps to share the location, number of missing teeth and any existing imaging before consultation.",
              ctaLabel: "Ask About Plan and Evaluation",
            },
            {
              tag: "Restoration",
              title: "Crowns / Bridges / Dentures / Esthetic Restoration",
              summary:
                "Suitable for tooth defects, replacement of previous restorations, esthetic improvement and chewing function recovery.",
              ctaLabel: "Ask About Materials and Timeline",
            },
            {
              tag: "Urgent",
              title: "Pain / Bleeding / Mobility / Inflammation",
              summary:
                "Tooth pain, gum bleeding, tooth mobility or inflammation should be discussed early so the urgency can be judged properly.",
              ctaLabel: "Check Urgency First",
            },
          ],
        },
        {
          eyebrow: "Consultation Flow",
          title: "From first visit to human follow-up with fewer extra steps",
          description:
            "The site first explains service scope, communication options and the consultation path, helping visitors move into useful conversation faster.",
          steps: [
            { title: "Submit Basic Information", summary: "Describe symptoms, missing teeth, treatment goals and whether you already have imaging." },
            { title: "Clarify Consultation Focus", summary: "Use the initial triage to narrow the conversation around implants, restorations, urgency or pricing." },
            { title: "Move to Telegram", summary: "When more discussion is needed, continue by sending questions and imaging through Telegram." },
            { title: "Staff Follow-up", summary: "Then confirm treatment direction, information to prepare and visit arrangements." },
          ],
        },
        {
          eyebrow: "Key Information",
          title: "The most important pre-visit details appear first",
          description:
            "Phone, address, communication channel and next steps are shown clearly on one page so visitors do not need to search around.",
          metrics: [
            { label: "Phone", value: "+86 9619527988", note: "Continue by phone or through Telegram" },
            { label: "Address", value: "黑河市环城东路33号", note: "黑龙江省黑河市爱辉区花园街道环城东路33号" },
            { label: "Human Handoff", value: "Telegram", note: "Useful for sharing imaging, process questions and scheduling" },
          ],
        },
      ],
    },
    articles: [
      {
        id: "article-1",
        title: "Dental Implant Consultation in Heihe: suitability, workflow and preparation",
        category: "Implants",
        excerpt:
          "An overview of initial assessment, imaging, treatment steps, recovery concerns and consultation flow for cross-border patients.",
        content:
          "Whether dental implants are appropriate depends on the pattern of tooth loss, bone condition, overall oral status and imaging findings. Before consultation, it helps to explain which teeth are missing, how long they have been missing, whether prior treatment was done and whether you already have a panoramic image or CT scan. For cross-border patients, discussing visit timing, required materials and the expected pricing range in advance can make follow-up communication more efficient.",
        seoTitle: "Heihe Dental Implant Guide | assessment, workflow and preparation",
        seoDescription:
          "Learn what information is useful for an initial implant consultation, how the workflow is discussed and how to prepare before a visit.",
      },
    ],
    doctors: [
      {
        id: "doctor-1",
        title: "Lead Physician for Implant and Restorative Care",
        summary:
          "Focused on implant and restorative clinical work, with emphasis on missing-tooth rehabilitation, treatment planning discussion and initial case evaluation.",
        specialties: ["Implants", "Restorations", "Complex Cases"],
        experience: "12 years of clinical experience",
      },
    ],
    services: [
      {
        id: "service-1",
        name: "Dental Implants",
        category: "Restorative Treatment",
        summary:
          "Initial evaluation and treatment-direction consultation for missing teeth, reduced chewing function and restorative needs.",
        details:
          "Supports consultation for single, multiple and half-arch implant cases. Final planning depends on examination findings and imaging.",
      },
    ],
    pricing: [
      {
        id: "pricing-1",
        name: "Initial Implant Evaluation",
        category: "Diagnostics",
        notes:
          "The listed price is a starting reference for the first evaluation step. Final fees depend on examination, imaging and the actual oral condition.",
      },
    ],
    gallery: [
      {
        id: "gallery-1",
        title: "Reception Area",
        summary: "Images and video help visitors understand the clinic environment before arrival.",
      },
    ],
    pages: [
      {
        id: "page-1",
        title: "Pricing and Consultation Guide",
        summary: "Learn what affects pricing, how to request an estimate and why final costs are confirmed after assessment.",
        content:
          "Dental treatment costs usually depend on the treatment category, restoration scope, material choice, baseline oral condition and whether additional examinations are required. Website pricing should be treated as an initial reference only. For a more useful estimate, start by sending your basic case information and any imaging through the online triage or Telegram, then continue with staff for the next step.",
        seoTitle: "泉寓门诊 | pricing, initial evaluation and consultation flow",
        seoDescription:
          "Understand how dental fees are assessed, what affects the estimate and how to continue consultation through online triage or Telegram.",
      },
    ],
    aiConfig: {
      fallbackReply:
        "I can help with an initial triage. Please describe your main concern, how long it has lasted, whether there is pain or bleeding, and whether you already have imaging, then I will suggest the next step.",
    },
  },
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
  i18n: i18nSeed,
};
