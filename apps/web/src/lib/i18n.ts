import type { CmsContent, Language } from "@quanyu/shared";

export const SUPPORTED_LANGUAGES: Language[] = ["zh", "ru", "en"];
export const DEFAULT_LANGUAGE: Language = "zh";
export const LANGUAGE_STORAGE_KEY = "quanyu_preferred_language";

export type UiDictionary = {
  langLabel: string;
  telegramCta: string;
  loadingTitle: string;
  loadingDescription: string;
  runtimeFallbackTitle: string;
  emptyArticleTitle: string;
  emptyArticleDescription: string;
  emptyDoctorTitle: string;
  emptyDoctorDescription: string;
  emptyServiceTitle: string;
  emptyServiceDescription: string;
  emptyPricingTitle: string;
  emptyPricingDescription: string;
  emptyGalleryTitle: string;
  emptyGalleryDescription: string;
  emptyPageTitle: string;
  emptyPageDescription: string;
  addContentCta: string;
  articleEyebrow: string;
  articleTitle: string;
  articleDescription: string;
  doctorEyebrow: string;
  doctorTitle: string;
  doctorDescription: string;
  serviceEyebrow: string;
  serviceTitle: string;
  serviceDescription: string;
  pricingEyebrow: string;
  pricingTitle: string;
  pricingDescription: string;
  galleryEyebrow: string;
  galleryTitle: string;
  galleryDescription: string;
  imageLabel: string;
  videoLabel: string;
  triageEyebrow: string;
  triageTitle: string;
  triageDescription: string;
  triageSteps: string[];
  triagePrimaryCta: string;
  triageSecondaryCta: string;
  contactEyebrow: string;
  contactTitle: string;
  contactDescription: string;
  phoneLabel: string;
  addressLabel: string;
  telegramLabel: string;
  phoneNote: string;
  addressNote: string;
  telegramNote: string;
  contactPrimaryCta: string;
  contactSecondaryCta: string;
  customPageEyebrow: string;
  footerContactTitle: string;
  footerNavigationTitle: string;
  footerCopyright: string;
  footerRegion: string;
  chatTitle: string;
  chatSubtitle: string;
  chatCollapse: string;
  chatTelegram: string;
  chatPlaceholder: string;
  chatSending: string;
  chatSend: string;
  chatOpen: string;
  chatUrgent: string;
  chatContinue: string;
  chatErrorPrefix: string;
  chatWelcome: string;
  backToTop: string;
};

export const uiDictionary: Record<Language, UiDictionary> = {
  zh: {
    langLabel: "语言",
    telegramCta: "Telegram 咨询",
    loadingTitle: "加载中",
    loadingDescription: "正在读取后台内容。",
    runtimeFallbackTitle: "当前显示的是兜底内容",
    emptyArticleTitle: "暂无文章",
    emptyArticleDescription: "后台还没有录入文章内容。",
    emptyDoctorTitle: "暂无医生资料",
    emptyDoctorDescription: "后台还没有录入医生介绍。",
    emptyServiceTitle: "暂无服务内容",
    emptyServiceDescription: "后台还没有录入服务介绍。",
    emptyPricingTitle: "暂无价格内容",
    emptyPricingDescription: "后台还没有录入价格说明。",
    emptyGalleryTitle: "暂无图册内容",
    emptyGalleryDescription: "后台还没有录入图册或视频内容。",
    emptyPageTitle: "页面不存在",
    emptyPageDescription: "没有找到这个自定义页面。",
    addContentCta: "去后台添加内容",
    articleEyebrow: "文章",
    articleTitle: "文章内容与 SEO 入口",
    articleDescription: "文章可以在后台新建、修改标题、摘要、正文、封面图和 SEO 字段。",
    doctorEyebrow: "医生",
    doctorTitle: "医生介绍",
    doctorDescription: "姓名、职称、经验、擅长方向和头像都可以在后台维护。",
    serviceEyebrow: "服务",
    serviceTitle: "服务介绍",
    serviceDescription: "服务页会读取后台的服务列表，你可以在后台新增项目和说明。",
    pricingEyebrow: "价格",
    pricingTitle: "价格说明",
    pricingDescription: "价格项目、分类、备注都在后台维护，适合后续接不同渠道报价策略。",
    galleryEyebrow: "图册",
    galleryTitle: "图册与视频展示",
    galleryDescription: "支持图片和视频素材，后台可直接本地上传或从素材库复用。",
    imageLabel: "图片",
    videoLabel: "视频",
    triageEyebrow: "AI 导诊",
    triageTitle: "先在线问诊，再进入 Telegram 和真人沟通",
    triageDescription: "用户可以先说明症状和需求，系统先做初步分诊，再决定是否转入 Telegram 继续沟通。",
    triageSteps: ["描述症状或项目", "AI 先做初筛", "继续发片子和资料"],
    triagePrimaryCta: "现在去 Telegram",
    triageSecondaryCta: "继续看项目和价格",
    contactEyebrow: "联系方式",
    contactTitle: "看到联系方式后，用户就能直接继续咨询",
    contactDescription: "电话、地址和 Telegram 集中展示，减少跳转和流失。",
    phoneLabel: "电话",
    addressLabel: "地址",
    telegramLabel: "Telegram",
    phoneNote: "适合直接联系、回拨和快速确认。",
    addressNote: "适合继续沟通路线、到诊和跨境安排。",
    telegramNote: "适合继续发片子、问价格和约时间。",
    contactPrimaryCta: "直接去 Telegram",
    contactSecondaryCta: "返回顶部",
    customPageEyebrow: "自定义页面",
    footerContactTitle: "联系方式",
    footerNavigationTitle: "快速导航",
    footerCopyright: "保留所有权利。",
    footerRegion: "黑龙江省黑河市 · 跨境牙科咨询",
    chatTitle: "AI 问诊助手",
    chatSubtitle: "先做基础问诊，再转人工继续沟通",
    chatCollapse: "收起",
    chatTelegram: "去 Telegram",
    chatPlaceholder: "例如：右下牙疼两天了；或想问种植牙价格、来院路线和住宿",
    chatSending: "发送中...",
    chatSend: "发送",
    chatOpen: "AI 问诊",
    chatUrgent: "当前判断：较高紧急度。",
    chatContinue: "当前判断：可继续初步问诊。",
    chatErrorPrefix: "发送失败：",
    chatWelcome: "你好，我是泉寓门诊的 AI 导诊助手，只处理牙齿问诊、门诊信息、价格预约、路线翻译和住宿相关问题。你可以先说症状、持续时间、是否疼痛/出血，或说明来院需求。",
    backToTop: "返回顶部",
  },
  ru: {
    langLabel: "Язык",
    telegramCta: "Консультация в Telegram",
    loadingTitle: "Загрузка",
    loadingDescription: "Получаем контент из CMS.",
    runtimeFallbackTitle: "Сейчас показан резервный контент",
    emptyArticleTitle: "Статей пока нет",
    emptyArticleDescription: "В CMS пока не добавлены статьи.",
    emptyDoctorTitle: "Нет данных о врачах",
    emptyDoctorDescription: "В CMS пока не добавлены профили врачей.",
    emptyServiceTitle: "Нет описания услуг",
    emptyServiceDescription: "В CMS пока не добавлены услуги.",
    emptyPricingTitle: "Нет раздела с ценами",
    emptyPricingDescription: "В CMS пока не добавлены ценовые позиции.",
    emptyGalleryTitle: "Нет галереи",
    emptyGalleryDescription: "В CMS пока не добавлены фото или видео.",
    emptyPageTitle: "Страница не найдена",
    emptyPageDescription: "Эта пользовательская страница не найдена.",
    addContentCta: "Перейти в админку",
    articleEyebrow: "Статьи",
    articleTitle: "Контент и SEO-страницы",
    articleDescription: "В админке можно редактировать заголовок, краткое описание, текст, обложку и SEO-поля статьи.",
    doctorEyebrow: "Врачи",
    doctorTitle: "Профили врачей",
    doctorDescription: "Имя, должность, опыт, направления и фото поддерживаются через CMS.",
    serviceEyebrow: "Услуги",
    serviceTitle: "Описание услуг",
    serviceDescription: "Раздел услуг читает данные из CMS, поэтому список и описания можно менять без правки кода.",
    pricingEyebrow: "Цены",
    pricingTitle: "Информация о стоимости",
    pricingDescription: "Позиции, категории и примечания по цене поддерживаются через CMS.",
    galleryEyebrow: "Галерея",
    galleryTitle: "Фото и видео",
    galleryDescription: "Поддерживаются изображения и видео, которые можно загружать и переиспользовать через CMS.",
    imageLabel: "Изображение",
    videoLabel: "Видео",
    triageEyebrow: "AI-опрос",
    triageTitle: "Сначала онлайн-опрос, затем связь через Telegram",
    triageDescription: "Пациент сначала описывает симптомы и запрос, система делает первичную сортировку и помогает перейти к дальнейшему общению.",
    triageSteps: ["Опишите симптомы или запрос", "AI проводит первичный опрос", "Отправьте снимки и детали дальше"],
    triagePrimaryCta: "Перейти в Telegram",
    triageSecondaryCta: "Посмотреть услуги и цены",
    contactEyebrow: "Контакты",
    contactTitle: "Когда контакты видны сразу, продолжить консультацию проще",
    contactDescription: "Телефон, адрес и Telegram собраны в одном месте, чтобы сократить лишние переходы.",
    phoneLabel: "Телефон",
    addressLabel: "Адрес",
    telegramLabel: "Telegram",
    phoneNote: "Подходит для быстрого звонка и уточнения.",
    addressNote: "Удобно для обсуждения маршрута и визита.",
    telegramNote: "Удобно для отправки снимков, вопросов и времени визита.",
    contactPrimaryCta: "Открыть Telegram",
    contactSecondaryCta: "Наверх",
    customPageEyebrow: "Пользовательская страница",
    footerContactTitle: "Контакты",
    footerNavigationTitle: "Навигация",
    footerCopyright: "Все права защищены.",
    footerRegion: "Хэйлунцзян, Хэйхэ · консультации для пациентов из-за рубежа",
    chatTitle: "AI-ассистент",
    chatSubtitle: "Сначала первичный опрос, затем перевод к человеку",
    chatCollapse: "Свернуть",
    chatTelegram: "В Telegram",
    chatPlaceholder: "Например: болит нижний правый зуб; или цена импланта, маршрут и проживание",
    chatSending: "Отправка...",
    chatSend: "Отправить",
    chatOpen: "AI-опрос",
    chatUrgent: "Предварительная оценка: ситуация более срочная.",
    chatContinue: "Предварительная оценка: можно продолжить первичный опрос.",
    chatErrorPrefix: "Ошибка отправки: ",
    chatWelcome: "Здравствуйте, я AI-ассистент клиники «Цюаньюй». Я отвечаю только на вопросы о зубах, клинике, ценах, записи, маршруте, переводе и проживании. Опишите симптомы, длительность, боль/кровоточивость или ваш вопрос по визиту.",
    backToTop: "Наверх",
  },
  en: {
    langLabel: "Language",
    telegramCta: "Telegram Consultation",
    loadingTitle: "Loading",
    loadingDescription: "Fetching content from the CMS.",
    runtimeFallbackTitle: "Fallback content is currently shown",
    emptyArticleTitle: "No articles yet",
    emptyArticleDescription: "No articles have been added in the CMS yet.",
    emptyDoctorTitle: "No doctors listed",
    emptyDoctorDescription: "No doctor profiles have been added in the CMS yet.",
    emptyServiceTitle: "No services listed",
    emptyServiceDescription: "No service content has been added in the CMS yet.",
    emptyPricingTitle: "No pricing content",
    emptyPricingDescription: "No pricing items have been added in the CMS yet.",
    emptyGalleryTitle: "No gallery content",
    emptyGalleryDescription: "No images or videos have been added in the CMS yet.",
    emptyPageTitle: "Page not found",
    emptyPageDescription: "This custom page could not be found.",
    addContentCta: "Open Admin",
    articleEyebrow: "Articles",
    articleTitle: "Content and SEO Entry Points",
    articleDescription: "Article title, excerpt, content, cover image and SEO fields can all be maintained in the CMS.",
    doctorEyebrow: "Doctors",
    doctorTitle: "Doctor Profiles",
    doctorDescription: "Name, role, experience, specialties and image are all managed through the CMS.",
    serviceEyebrow: "Services",
    serviceTitle: "Service Overview",
    serviceDescription: "The service section reads from the CMS, so new items and descriptions can be maintained without code edits.",
    pricingEyebrow: "Pricing",
    pricingTitle: "Pricing Information",
    pricingDescription: "Pricing items, categories and notes are managed in the CMS and ready for later pricing strategies.",
    galleryEyebrow: "Gallery",
    galleryTitle: "Images and Video",
    galleryDescription: "Both image and video assets are supported and can be uploaded or reused from the media library.",
    imageLabel: "Image",
    videoLabel: "Video",
    triageEyebrow: "AI Triage",
    triageTitle: "Start online first, then continue through Telegram",
    triageDescription: "Visitors can describe symptoms and treatment goals first, then move to staff follow-up after initial triage.",
    triageSteps: ["Describe symptoms or the service", "AI performs initial triage", "Send imaging and further details"],
    triagePrimaryCta: "Open Telegram",
    triageSecondaryCta: "See Services and Pricing",
    contactEyebrow: "Contact",
    contactTitle: "Once contact details are visible, continuing the conversation is easier",
    contactDescription: "Phone, address and Telegram are grouped together to reduce unnecessary navigation.",
    phoneLabel: "Phone",
    addressLabel: "Address",
    telegramLabel: "Telegram",
    phoneNote: "Useful for direct calls and quick confirmation.",
    addressNote: "Useful when discussing route and visit arrangements.",
    telegramNote: "Useful for sending imaging, pricing questions and scheduling.",
    contactPrimaryCta: "Go to Telegram",
    contactSecondaryCta: "Back to Top",
    customPageEyebrow: "Custom Page",
    footerContactTitle: "Contact",
    footerNavigationTitle: "Navigation",
    footerCopyright: "All rights reserved.",
    footerRegion: "Heihe, Heilongjiang · cross-border dental consultation",
    chatTitle: "AI Triage Assistant",
    chatSubtitle: "Start with initial screening, then continue with staff",
    chatCollapse: "Close",
    chatTelegram: "Telegram",
    chatPlaceholder: "For example: lower right tooth pain; or implant price, route and accommodation",
    chatSending: "Sending...",
    chatSend: "Send",
    chatOpen: "AI Triage",
    chatUrgent: "Current assessment: higher urgency.",
    chatContinue: "Current assessment: initial triage can continue.",
    chatErrorPrefix: "Failed to send: ",
    chatWelcome: "Hello, I am the AI triage assistant for Quanyu Clinic. I only answer dental, clinic, pricing, appointment, route, translation and accommodation questions. Please describe symptoms, duration, pain/bleeding, or your visit needs.",
    backToTop: "Back to Top",
  },
};

export function isSupportedLanguage(input: string | null | undefined): input is Language {
  return SUPPORTED_LANGUAGES.includes((input ?? "") as Language);
}

export function normalizeLanguage(input: string | null | undefined): Language | null {
  if (!input) return null;
  const lower = input.toLowerCase();
  if (lower.startsWith("zh")) return "zh";
  if (lower.startsWith("ru")) return "ru";
  if (lower.startsWith("en")) return "en";
  return null;
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

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

export function resolveContentForLanguage(content: CmsContent, language: Language): CmsContent {
  if (language === DEFAULT_LANGUAGE || !content.i18n?.[language]) {
    return deepClone(content);
  }

  return deepMerge(deepClone(content), content.i18n[language]) as CmsContent;
}

export function readStoredLanguage(): Language | null {
  if (typeof window === "undefined") return null;

  try {
    const value = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isSupportedLanguage(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeStoredLanguage(language: Language) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // ignore storage errors
  }
}

export function updateLocalizedContentDraft(
  draft: CmsContent,
  language: Language,
  mutator: (current: CmsContent) => CmsContent,
): CmsContent {
  if (language === DEFAULT_LANGUAGE) {
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
