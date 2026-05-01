import type {
  Article,
  ChatSession,
  CmsContent,
  Doctor,
  GalleryAsset,
  Language,
  LandingPage,
  MediaLibraryState,
  PricingItem,
  ServiceItem,
} from "@quanyu/shared";
import {
  type AdminStatus,
  ADMIN_TOKEN_STORAGE_KEY,
  downloadAiCopyPackage,
  downloadAdminBackup,
  fetchAdminContent,
  fetchAdminMe,
  fetchAdminStatus,
  fetchChatSessions,
  fetchMediaLibrary,
  generateAiSiteDraft,
  loginAdmin,
  restoreAdminBackup,
  saveContent,
  setupAdmin,
  testAiConfig,
} from "../lib/api";
import type { ReactNode } from "react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { MediaField, MediaLibraryManager } from "../components/admin-media";
import { DEFAULT_LANGUAGE, resolveContentForLanguage, SUPPORTED_LANGUAGES, updateLocalizedContentDraft } from "../lib/i18n";

type AdminPageProps = {
  content: CmsContent;
  onSaved: (content: CmsContent) => void;
};

type AdminConsoleProps = AdminPageProps & {
  adminToken: string;
  username: string;
  onLogout: () => void;
};

type AiCopyPackage = {
  format: "quanyu.ai-copy-package";
  version: number;
  contentSnapshot: CmsContent;
};

type PendingAiImport = {
  incoming: CmsContent;
  localizedIncoming: CmsContent;
  language: Language;
  diffs: AiDiffEntry[];
};

type AiDiffEntry = {
  id: string;
  label: string;
  currentValue: string;
  nextValue: string;
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

const ADMIN_LANGUAGE_LABELS: Record<Language, string> = {
  zh: "中文",
  ru: "俄语",
  en: "英语",
};

function getAdminTabLabel(activeTab: TabKey) {
  return ADMIN_TABS.find(([key]) => key === activeTab)?.[1] ?? "模块";
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildExternalAiInstructions(content: CmsContent) {
  const contact = content.siteSettings.primaryContact;

  return [
    "你现在是这个网站的文案优化助手。",
    "",
    "网站类型：牙科诊所/门诊官网，目标是让访客先理解诊所实力和服务范围，再发起咨询并转到 Telegram 或人工沟通。",
    `品牌名称：${content.siteSettings.brandName}`,
    `联系电话：${contact.phone}`,
    `地址：${contact.address}`,
    `Telegram：${contact.telegramHandle} ${contact.telegramUrl}`.trim(),
    "",
    "你的任务：",
    "1. 先浏览同类牙科诊所、口腔门诊、跨境医疗咨询网站，研究他们的首页介绍、服务介绍、医生介绍、价格说明、信任表达和行动号召写法。",
    "2. 再根据我提供的 JSON 内容，对本站文案进行重写，让它更专业、更可信、更像真实医疗服务网站，并且更适合咨询转化。",
    "3. 本站采用三语结构：中文是主基底语言，俄语和英语写在 contentSnapshot.i18n.ru / contentSnapshot.i18n.en 覆盖层。",
    "4. 输出时保留原 JSON 结构，返回完整 JSON，只修改适合改写的文字内容。",
    "5. 中文文案写回 contentSnapshot 主结构；俄语、英语文案分别写回 contentSnapshot.i18n.ru / contentSnapshot.i18n.en 中对应字段。",
    "6. 注意：系统导回时只接受白名单内的文案字段，电话、地址、链接、配置、素材等字段即使被改也会被忽略。",
    "",
    "重点优化方向：",
    "- 首页标题、副标题、卖点、行动按钮文案",
    "- 服务项目介绍",
    "- 医生介绍和信任表达",
    "- 页面正文、文章摘要、SEO 标题和 SEO 描述",
    "- 跨境就诊、咨询流程、联系方式引导",
    "",
    "严格禁止：",
    "- 不要修改 JSON 结构",
    "- 不要删除或新增顶层字段",
    "- 不要修改 id、slug、href、url、图片地址、视频地址、fileName、storageKey",
    "- 不要随意编造电话、地址、医生资历、价格、治疗效果、法律承诺",
    "- 不要修改管理员配置、AI 接口配置、聊天记录、素材信息",
    "",
    "事实信息默认保持不变：",
    `- 品牌名：${content.siteSettings.brandName}`,
    `- 电话：${contact.phone}`,
    `- 地址：${contact.address}`,
    `- Telegram：${contact.telegramHandle} / ${contact.telegramUrl}`,
    "",
    "输出要求：",
    "- 返回完整 JSON",
    "- 保持字段名和层级完全一致",
    "- 中文主内容放在 contentSnapshot 主结构里",
    "- 俄语放在 contentSnapshot.i18n.ru",
    "- 英语放在 contentSnapshot.i18n.en",
    "- 只改适合改写的文案字段",
    "- 文案要与牙科门诊网站场景匹配，不能写成别的行业",
  ].join("\n");
}

function stringifyDiffValue(value: string) {
  return value.trim() ? value : "（空）";
}

function collectAiCopyDiffs(current: CmsContent, incoming: CmsContent) {
  const diffs: AiDiffEntry[] = [];
  const pushDiff = (id: string, label: string, currentValue: string, nextValue: string) => {
    if (currentValue === nextValue) {
      return;
    }

    diffs.push({
      id,
      label,
      currentValue: stringifyDiffValue(currentValue),
      nextValue: stringifyDiffValue(nextValue),
    });
  };

  pushDiff("siteSettings.topbarNotice", "站点设置 / 顶部提示", current.siteSettings.topbarNotice, incoming.siteSettings.topbarNotice);
  pushDiff(
    "siteSettings.footerDescription",
    "站点设置 / 页脚说明",
    current.siteSettings.footerDescription,
    incoming.siteSettings.footerDescription,
  );

  current.siteSettings.navigation.forEach((item, index) => {
    pushDiff(
      `siteSettings.navigation.${item.id}.label`,
      `站点设置 / 导航文案 / ${item.id}`,
      item.label,
      incoming.siteSettings.navigation[index]?.label ?? item.label,
    );
  });

  pushDiff("homePage.title", "首页 / 页面标题", current.homePage.title, incoming.homePage.title);
  pushDiff("homePage.seoTitle", "首页 / SEO 标题", current.homePage.seoTitle, incoming.homePage.seoTitle);
  pushDiff("homePage.seoDescription", "首页 / SEO 描述", current.homePage.seoDescription, incoming.homePage.seoDescription);

  current.homePage.sections.forEach((section, index) => {
    const next = incoming.homePage.sections[index];

    if (!next || next.id !== section.id || next.type !== section.type) {
      return;
    }

    pushDiff(`homePage.sections.${section.id}.eyebrow`, `首页模块 / ${section.id} / 眉题`, section.eyebrow, next.eyebrow);
    pushDiff(`homePage.sections.${section.id}.title`, `首页模块 / ${section.id} / 标题`, section.title, next.title);
    pushDiff(`homePage.sections.${section.id}.description`, `首页模块 / ${section.id} / 描述`, section.description, next.description);

    if (section.type === "hero" && next.type === "hero") {
      section.actions.forEach((action, actionIndex) => {
        pushDiff(
          `homePage.sections.${section.id}.actions.${actionIndex}.label`,
          `首页模块 / ${section.id} / 按钮 ${actionIndex + 1}`,
          action.label,
          next.actions[actionIndex]?.label ?? action.label,
        );
      });
      section.highlights.forEach((item, itemIndex) => {
        pushDiff(
          `homePage.sections.${section.id}.highlights.${itemIndex}.label`,
          `首页模块 / ${section.id} / 高亮 ${itemIndex + 1} 标题`,
          item.label,
          next.highlights[itemIndex]?.label ?? item.label,
        );
        pushDiff(
          `homePage.sections.${section.id}.highlights.${itemIndex}.value`,
          `首页模块 / ${section.id} / 高亮 ${itemIndex + 1} 内容`,
          item.value,
          next.highlights[itemIndex]?.value ?? item.value,
        );
      });
      pushDiff(
        `homePage.sections.${section.id}.aiPanel.title`,
        `首页模块 / ${section.id} / AI 面板标题`,
        section.aiPanel.title,
        next.aiPanel.title,
      );
      pushDiff(
        `homePage.sections.${section.id}.aiPanel.description`,
        `首页模块 / ${section.id} / AI 面板描述`,
        section.aiPanel.description,
        next.aiPanel.description,
      );
      section.aiPanel.steps.forEach((step, stepIndex) => {
        pushDiff(
          `homePage.sections.${section.id}.aiPanel.steps.${stepIndex}`,
          `首页模块 / ${section.id} / AI 面板步骤 ${stepIndex + 1}`,
          step,
          next.aiPanel.steps[stepIndex] ?? step,
        );
      });
    }

    if (section.type === "services" && next.type === "services") {
      section.items.forEach((item, itemIndex) => {
        pushDiff(
          `homePage.sections.${section.id}.items.${itemIndex}.tag`,
          `首页模块 / ${section.id} / 项目 ${itemIndex + 1} 标签`,
          item.tag,
          next.items[itemIndex]?.tag ?? item.tag,
        );
        pushDiff(
          `homePage.sections.${section.id}.items.${itemIndex}.title`,
          `首页模块 / ${section.id} / 项目 ${itemIndex + 1} 标题`,
          item.title,
          next.items[itemIndex]?.title ?? item.title,
        );
        pushDiff(
          `homePage.sections.${section.id}.items.${itemIndex}.summary`,
          `首页模块 / ${section.id} / 项目 ${itemIndex + 1} 摘要`,
          item.summary,
          next.items[itemIndex]?.summary ?? item.summary,
        );
        pushDiff(
          `homePage.sections.${section.id}.items.${itemIndex}.ctaLabel`,
          `首页模块 / ${section.id} / 项目 ${itemIndex + 1} 按钮`,
          item.ctaLabel,
          next.items[itemIndex]?.ctaLabel ?? item.ctaLabel,
        );
      });
    }

    if (section.type === "journey" && next.type === "journey") {
      section.steps.forEach((item, itemIndex) => {
        pushDiff(
          `homePage.sections.${section.id}.steps.${itemIndex}.title`,
          `首页模块 / ${section.id} / 步骤 ${itemIndex + 1} 标题`,
          item.title,
          next.steps[itemIndex]?.title ?? item.title,
        );
        pushDiff(
          `homePage.sections.${section.id}.steps.${itemIndex}.summary`,
          `首页模块 / ${section.id} / 步骤 ${itemIndex + 1} 摘要`,
          item.summary,
          next.steps[itemIndex]?.summary ?? item.summary,
        );
      });
    }

    if (section.type === "gallery" && next.type === "gallery") {
      section.items.forEach((item, itemIndex) => {
        pushDiff(
          `homePage.sections.${section.id}.items.${itemIndex}.title`,
          `首页模块 / ${section.id} / 图册 ${itemIndex + 1} 标题`,
          item.title,
          next.items[itemIndex]?.title ?? item.title,
        );
        pushDiff(
          `homePage.sections.${section.id}.items.${itemIndex}.summary`,
          `首页模块 / ${section.id} / 图册 ${itemIndex + 1} 摘要`,
          item.summary,
          next.items[itemIndex]?.summary ?? item.summary,
        );
      });
    }

    if (section.type === "articles" && next.type === "articles") {
      section.items.forEach((item, itemIndex) => {
        pushDiff(
          `homePage.sections.${section.id}.items.${itemIndex}.category`,
          `首页模块 / ${section.id} / 文章 ${itemIndex + 1} 分类`,
          item.category,
          next.items[itemIndex]?.category ?? item.category,
        );
        pushDiff(
          `homePage.sections.${section.id}.items.${itemIndex}.title`,
          `首页模块 / ${section.id} / 文章 ${itemIndex + 1} 标题`,
          item.title,
          next.items[itemIndex]?.title ?? item.title,
        );
        pushDiff(
          `homePage.sections.${section.id}.items.${itemIndex}.excerpt`,
          `首页模块 / ${section.id} / 文章 ${itemIndex + 1} 摘要`,
          item.excerpt,
          next.items[itemIndex]?.excerpt ?? item.excerpt,
        );
        pushDiff(
          `homePage.sections.${section.id}.items.${itemIndex}.seoTitle`,
          `首页模块 / ${section.id} / 文章 ${itemIndex + 1} SEO 标题`,
          item.seoTitle,
          next.items[itemIndex]?.seoTitle ?? item.seoTitle,
        );
      });
    }

    if (section.type === "analytics" && next.type === "analytics") {
      section.metrics.forEach((item, itemIndex) => {
        pushDiff(
          `homePage.sections.${section.id}.metrics.${itemIndex}.label`,
          `首页模块 / ${section.id} / 指标 ${itemIndex + 1} 标题`,
          item.label,
          next.metrics[itemIndex]?.label ?? item.label,
        );
        pushDiff(
          `homePage.sections.${section.id}.metrics.${itemIndex}.value`,
          `首页模块 / ${section.id} / 指标 ${itemIndex + 1} 内容`,
          item.value,
          next.metrics[itemIndex]?.value ?? item.value,
        );
        pushDiff(
          `homePage.sections.${section.id}.metrics.${itemIndex}.note`,
          `首页模块 / ${section.id} / 指标 ${itemIndex + 1} 备注`,
          item.note,
          next.metrics[itemIndex]?.note ?? item.note,
        );
      });
    }
  });

  current.articles.forEach((item) => {
    const next = incoming.articles.find((candidate) => candidate.id === item.id);
    if (!next) return;
    pushDiff(`articles.${item.id}.title`, `文章 / ${item.id} / 标题`, item.title, next.title);
    pushDiff(`articles.${item.id}.category`, `文章 / ${item.id} / 分类`, item.category, next.category);
    pushDiff(`articles.${item.id}.excerpt`, `文章 / ${item.id} / 摘要`, item.excerpt, next.excerpt);
    pushDiff(`articles.${item.id}.content`, `文章 / ${item.id} / 正文`, item.content, next.content);
    pushDiff(`articles.${item.id}.seoTitle`, `文章 / ${item.id} / SEO 标题`, item.seoTitle, next.seoTitle);
    pushDiff(`articles.${item.id}.seoDescription`, `文章 / ${item.id} / SEO 描述`, item.seoDescription, next.seoDescription);
  });

  current.doctors.forEach((item) => {
    const next = incoming.doctors.find((candidate) => candidate.id === item.id);
    if (!next) return;
    pushDiff(`doctors.${item.id}.name`, `医生 / ${item.id} / 姓名`, item.name, next.name);
    pushDiff(`doctors.${item.id}.title`, `医生 / ${item.id} / 职称`, item.title, next.title);
    pushDiff(`doctors.${item.id}.summary`, `医生 / ${item.id} / 简介`, item.summary, next.summary);
    item.specialties.forEach((specialty, specialtyIndex) => {
      pushDiff(
        `doctors.${item.id}.specialties.${specialtyIndex}`,
        `医生 / ${item.id} / 专长 ${specialtyIndex + 1}`,
        specialty,
        next.specialties[specialtyIndex] ?? specialty,
      );
    });
    pushDiff(`doctors.${item.id}.experience`, `医生 / ${item.id} / 经验`, item.experience, next.experience);
  });

  current.services.forEach((item) => {
    const next = incoming.services.find((candidate) => candidate.id === item.id);
    if (!next) return;
    pushDiff(`services.${item.id}.name`, `服务 / ${item.id} / 名称`, item.name, next.name);
    pushDiff(`services.${item.id}.category`, `服务 / ${item.id} / 分类`, item.category, next.category);
    pushDiff(`services.${item.id}.summary`, `服务 / ${item.id} / 摘要`, item.summary, next.summary);
    pushDiff(`services.${item.id}.details`, `服务 / ${item.id} / 详情`, item.details, next.details);
  });

  current.pricing.forEach((item) => {
    const next = incoming.pricing.find((candidate) => candidate.id === item.id);
    if (!next) return;
    pushDiff(`pricing.${item.id}.name`, `价格 / ${item.id} / 名称`, item.name, next.name);
    pushDiff(`pricing.${item.id}.category`, `价格 / ${item.id} / 分类`, item.category, next.category);
    pushDiff(`pricing.${item.id}.notes`, `价格 / ${item.id} / 备注`, item.notes, next.notes);
  });

  current.gallery.forEach((item) => {
    const next = incoming.gallery.find((candidate) => candidate.id === item.id);
    if (!next) return;
    pushDiff(`gallery.${item.id}.title`, `图册 / ${item.id} / 标题`, item.title, next.title);
    pushDiff(`gallery.${item.id}.summary`, `图册 / ${item.id} / 摘要`, item.summary, next.summary);
  });

  current.pages.forEach((item) => {
    const next = incoming.pages.find((candidate) => candidate.id === item.id);
    if (!next) return;
    pushDiff(`pages.${item.id}.title`, `页面 / ${item.id} / 标题`, item.title, next.title);
    pushDiff(`pages.${item.id}.summary`, `页面 / ${item.id} / 摘要`, item.summary, next.summary);
    pushDiff(`pages.${item.id}.content`, `页面 / ${item.id} / 正文`, item.content, next.content);
    pushDiff(`pages.${item.id}.seoTitle`, `页面 / ${item.id} / SEO 标题`, item.seoTitle, next.seoTitle);
    pushDiff(`pages.${item.id}.seoDescription`, `页面 / ${item.id} / SEO 描述`, item.seoDescription, next.seoDescription);
  });

  return diffs;
}

function applySelectedAiDiffs(current: CmsContent, incoming: CmsContent, selectedIds: Set<string>): CmsContent {
  const nextContent = JSON.parse(JSON.stringify(current)) as CmsContent;
  const has = (id: string) => selectedIds.has(id);

  if (has("siteSettings.topbarNotice")) nextContent.siteSettings.topbarNotice = incoming.siteSettings.topbarNotice;
  if (has("siteSettings.footerDescription")) nextContent.siteSettings.footerDescription = incoming.siteSettings.footerDescription;

  nextContent.siteSettings.navigation.forEach((item, index) => {
    if (has(`siteSettings.navigation.${item.id}.label`)) {
      item.label = incoming.siteSettings.navigation[index]?.label ?? item.label;
    }
  });

  if (has("homePage.title")) nextContent.homePage.title = incoming.homePage.title;
  if (has("homePage.seoTitle")) nextContent.homePage.seoTitle = incoming.homePage.seoTitle;
  if (has("homePage.seoDescription")) nextContent.homePage.seoDescription = incoming.homePage.seoDescription;

  nextContent.homePage.sections.forEach((section, index) => {
    const incomingSection = incoming.homePage.sections[index];
    if (!incomingSection || incomingSection.id !== section.id || incomingSection.type !== section.type) return;

    if (has(`homePage.sections.${section.id}.eyebrow`)) section.eyebrow = incomingSection.eyebrow;
    if (has(`homePage.sections.${section.id}.title`)) section.title = incomingSection.title;
    if (has(`homePage.sections.${section.id}.description`)) section.description = incomingSection.description;

    if (section.type === "hero" && incomingSection.type === "hero") {
      section.actions.forEach((action, actionIndex) => {
        if (has(`homePage.sections.${section.id}.actions.${actionIndex}.label`)) {
          action.label = incomingSection.actions[actionIndex]?.label ?? action.label;
        }
      });
      section.highlights.forEach((item, itemIndex) => {
        if (has(`homePage.sections.${section.id}.highlights.${itemIndex}.label`)) {
          item.label = incomingSection.highlights[itemIndex]?.label ?? item.label;
        }
        if (has(`homePage.sections.${section.id}.highlights.${itemIndex}.value`)) {
          item.value = incomingSection.highlights[itemIndex]?.value ?? item.value;
        }
      });
      if (has(`homePage.sections.${section.id}.aiPanel.title`)) section.aiPanel.title = incomingSection.aiPanel.title;
      if (has(`homePage.sections.${section.id}.aiPanel.description`)) section.aiPanel.description = incomingSection.aiPanel.description;
      section.aiPanel.steps.forEach((step, stepIndex) => {
        if (has(`homePage.sections.${section.id}.aiPanel.steps.${stepIndex}`)) {
          section.aiPanel.steps[stepIndex] = incomingSection.aiPanel.steps[stepIndex] ?? step;
        }
      });
    }

    if (section.type === "services" && incomingSection.type === "services") {
      section.items.forEach((item, itemIndex) => {
        if (has(`homePage.sections.${section.id}.items.${itemIndex}.tag`)) item.tag = incomingSection.items[itemIndex]?.tag ?? item.tag;
        if (has(`homePage.sections.${section.id}.items.${itemIndex}.title`)) item.title = incomingSection.items[itemIndex]?.title ?? item.title;
        if (has(`homePage.sections.${section.id}.items.${itemIndex}.summary`)) item.summary = incomingSection.items[itemIndex]?.summary ?? item.summary;
        if (has(`homePage.sections.${section.id}.items.${itemIndex}.ctaLabel`)) {
          item.ctaLabel = incomingSection.items[itemIndex]?.ctaLabel ?? item.ctaLabel;
        }
      });
    }

    if (section.type === "journey" && incomingSection.type === "journey") {
      section.steps.forEach((item, itemIndex) => {
        if (has(`homePage.sections.${section.id}.steps.${itemIndex}.title`)) item.title = incomingSection.steps[itemIndex]?.title ?? item.title;
        if (has(`homePage.sections.${section.id}.steps.${itemIndex}.summary`)) item.summary = incomingSection.steps[itemIndex]?.summary ?? item.summary;
      });
    }

    if (section.type === "gallery" && incomingSection.type === "gallery") {
      section.items.forEach((item, itemIndex) => {
        if (has(`homePage.sections.${section.id}.items.${itemIndex}.title`)) item.title = incomingSection.items[itemIndex]?.title ?? item.title;
        if (has(`homePage.sections.${section.id}.items.${itemIndex}.summary`)) item.summary = incomingSection.items[itemIndex]?.summary ?? item.summary;
      });
    }

    if (section.type === "articles" && incomingSection.type === "articles") {
      section.items.forEach((item, itemIndex) => {
        if (has(`homePage.sections.${section.id}.items.${itemIndex}.category`)) item.category = incomingSection.items[itemIndex]?.category ?? item.category;
        if (has(`homePage.sections.${section.id}.items.${itemIndex}.title`)) item.title = incomingSection.items[itemIndex]?.title ?? item.title;
        if (has(`homePage.sections.${section.id}.items.${itemIndex}.excerpt`)) item.excerpt = incomingSection.items[itemIndex]?.excerpt ?? item.excerpt;
        if (has(`homePage.sections.${section.id}.items.${itemIndex}.seoTitle`)) item.seoTitle = incomingSection.items[itemIndex]?.seoTitle ?? item.seoTitle;
      });
    }

    if (section.type === "analytics" && incomingSection.type === "analytics") {
      section.metrics.forEach((item, itemIndex) => {
        if (has(`homePage.sections.${section.id}.metrics.${itemIndex}.label`)) item.label = incomingSection.metrics[itemIndex]?.label ?? item.label;
        if (has(`homePage.sections.${section.id}.metrics.${itemIndex}.value`)) item.value = incomingSection.metrics[itemIndex]?.value ?? item.value;
        if (has(`homePage.sections.${section.id}.metrics.${itemIndex}.note`)) item.note = incomingSection.metrics[itemIndex]?.note ?? item.note;
      });
    }
  });

  nextContent.articles.forEach((item) => {
    const incomingItem = incoming.articles.find((candidate) => candidate.id === item.id);
    if (!incomingItem) return;
    if (has(`articles.${item.id}.title`)) item.title = incomingItem.title;
    if (has(`articles.${item.id}.category`)) item.category = incomingItem.category;
    if (has(`articles.${item.id}.excerpt`)) item.excerpt = incomingItem.excerpt;
    if (has(`articles.${item.id}.content`)) item.content = incomingItem.content;
    if (has(`articles.${item.id}.seoTitle`)) item.seoTitle = incomingItem.seoTitle;
    if (has(`articles.${item.id}.seoDescription`)) item.seoDescription = incomingItem.seoDescription;
  });

  nextContent.doctors.forEach((item) => {
    const incomingItem = incoming.doctors.find((candidate) => candidate.id === item.id);
    if (!incomingItem) return;
    if (has(`doctors.${item.id}.name`)) item.name = incomingItem.name;
    if (has(`doctors.${item.id}.title`)) item.title = incomingItem.title;
    if (has(`doctors.${item.id}.summary`)) item.summary = incomingItem.summary;
    item.specialties.forEach((specialty, specialtyIndex) => {
      if (has(`doctors.${item.id}.specialties.${specialtyIndex}`)) {
        item.specialties[specialtyIndex] = incomingItem.specialties[specialtyIndex] ?? specialty;
      }
    });
    if (has(`doctors.${item.id}.experience`)) item.experience = incomingItem.experience;
  });

  nextContent.services.forEach((item) => {
    const incomingItem = incoming.services.find((candidate) => candidate.id === item.id);
    if (!incomingItem) return;
    if (has(`services.${item.id}.name`)) item.name = incomingItem.name;
    if (has(`services.${item.id}.category`)) item.category = incomingItem.category;
    if (has(`services.${item.id}.summary`)) item.summary = incomingItem.summary;
    if (has(`services.${item.id}.details`)) item.details = incomingItem.details;
  });

  nextContent.pricing.forEach((item) => {
    const incomingItem = incoming.pricing.find((candidate) => candidate.id === item.id);
    if (!incomingItem) return;
    if (has(`pricing.${item.id}.name`)) item.name = incomingItem.name;
    if (has(`pricing.${item.id}.category`)) item.category = incomingItem.category;
    if (has(`pricing.${item.id}.notes`)) item.notes = incomingItem.notes;
  });

  nextContent.gallery.forEach((item) => {
    const incomingItem = incoming.gallery.find((candidate) => candidate.id === item.id);
    if (!incomingItem) return;
    if (has(`gallery.${item.id}.title`)) item.title = incomingItem.title;
    if (has(`gallery.${item.id}.summary`)) item.summary = incomingItem.summary;
  });

  nextContent.pages.forEach((item) => {
    const incomingItem = incoming.pages.find((candidate) => candidate.id === item.id);
    if (!incomingItem) return;
    if (has(`pages.${item.id}.title`)) item.title = incomingItem.title;
    if (has(`pages.${item.id}.summary`)) item.summary = incomingItem.summary;
    if (has(`pages.${item.id}.content`)) item.content = incomingItem.content;
    if (has(`pages.${item.id}.seoTitle`)) item.seoTitle = incomingItem.seoTitle;
    if (has(`pages.${item.id}.seoDescription`)) item.seoDescription = incomingItem.seoDescription;
  });

  return nextContent;
}

function applySelectedAiDiffsForLanguage(
  current: CmsContent,
  incoming: CmsContent,
  language: Language,
  selectedIds: Set<string>,
) {
  return updateLocalizedContentDraft(current, language, (localizedCurrent) =>
    applySelectedAiDiffs(localizedCurrent, incoming, selectedIds),
  );
}

function isAiCopyPackage(value: unknown): value is AiCopyPackage {
  return Boolean(
    value &&
      typeof value === "object" &&
      "format" in value &&
      "contentSnapshot" in value &&
      (value as { format?: unknown }).format === "quanyu.ai-copy-package",
  );
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
  const [editingLanguage, setEditingLanguage] = useState<Language>(DEFAULT_LANGUAGE);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [exportingAiCopy, setExportingAiCopy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoringAiCopy, setRestoringAiCopy] = useState(false);
  const [copyingInstructions, setCopyingInstructions] = useState(false);
  const [generatingAiSiteDraft, setGeneratingAiSiteDraft] = useState(false);
  const [testingAiConfig, setTestingAiConfig] = useState(false);
  const [aiSiteInstruction, setAiSiteInstruction] = useState(
    "根据当前素材库，优化首页首屏、服务卡片、流程说明和图册文案，让网站更像真实牙科门诊官网，并更适合俄罗斯/中国患者咨询转化。",
  );
  const [pendingAiImport, setPendingAiImport] = useState<PendingAiImport | null>(null);
  const [selectedAiDiffIds, setSelectedAiDiffIds] = useState<string[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [mediaLibrary, setMediaLibrary] = useState<MediaLibraryState>({
    folders: [],
    assets: [],
  });
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);
  const aiCopyFileInputRef = useRef<HTMLInputElement | null>(null);
  const externalAiInstructions = buildExternalAiInstructions(draft);
  const localizedDraft = useMemo(() => resolveContentForLanguage(draft, editingLanguage), [draft, editingLanguage]);
  const isLocalizedEditing = editingLanguage !== DEFAULT_LANGUAGE;
  const dirtyLanguages = useMemo(() => {
    const result: Record<Language, boolean> = {
      zh: false,
      ru: false,
      en: false,
    };

    for (const language of SUPPORTED_LANGUAGES) {
      result[language] =
        JSON.stringify(resolveContentForLanguage(draft, language)) !==
        JSON.stringify(resolveContentForLanguage(content, language));
    }

    return result;
  }, [content, draft]);
  const dirtyLanguageCount = SUPPORTED_LANGUAGES.filter((language) => dirtyLanguages[language]).length;

  const updateDraft = (mutator: (current: CmsContent) => CmsContent) => {
    setDraft((current) => updateLocalizedContentDraft(current, editingLanguage, mutator));
  };

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

  useEffect(() => {
    if (pendingAiImport && pendingAiImport.language !== editingLanguage) {
      setPendingAiImport(null);
      setSelectedAiDiffIds([]);
    }
  }, [editingLanguage, pendingAiImport]);

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

  const handleAiCopyDownload = async () => {
    setExportingAiCopy(true);

    try {
      const { blob, fileName } = await downloadAiCopyPackage(adminToken);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      window.alert(`导出 AI 文案包失败: ${String(error)}`);
    } finally {
      setExportingAiCopy(false);
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

  const handleAiCopyRestoreFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setRestoringAiCopy(true);

    try {
      const raw = JSON.parse(await file.text()) as unknown;

      if (!isAiCopyPackage(raw)) {
        throw new Error("invalid_ai_copy_file");
      }

      const localizedIncoming = resolveContentForLanguage(raw.contentSnapshot, editingLanguage);
      const diffs = collectAiCopyDiffs(localizedDraft, localizedIncoming);
      setPendingAiImport({
        language: editingLanguage,
        incoming: raw.contentSnapshot,
        localizedIncoming,
        diffs,
      });
      setSelectedAiDiffIds(diffs.map((item) => item.id));

      if (!diffs.length) {
        window.alert(`这个 AI 文案包和当前 ${ADMIN_LANGUAGE_LABELS[editingLanguage]} 视图没有可应用的文案差异。`);
      }
    } catch (error) {
      window.alert(`AI 文案包恢复失败: ${String(error)}`);
    } finally {
      setRestoringAiCopy(false);
    }
  };

  const handleApplySelectedAiDiffs = async () => {
    if (!pendingAiImport) {
      return;
    }

    const selectedIds = new Set(selectedAiDiffIds);

    if (!selectedIds.size) {
      window.alert("请先勾选至少一项改动。");
      return;
    }

    setSaving(true);

    try {
      const merged = applySelectedAiDiffsForLanguage(draft, pendingAiImport.localizedIncoming, pendingAiImport.language, selectedIds);
      const response = await saveContent(merged, adminToken);
      setDraft(response.content);
      onSaved(response.content);
      setPendingAiImport(null);
      setSelectedAiDiffIds([]);
      window.alert(`已应用 ${selectedIds.size} 项 AI 文案改动。`);
    } catch (error) {
      window.alert(`应用 AI 文案改动失败: ${String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyInstructions = async () => {
    setCopyingInstructions(true);

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(externalAiInstructions);
        window.alert("给外部 AI 的指令已复制。");
      } else {
        throw new Error("clipboard_unavailable");
      }
    } catch {
      window.alert("当前环境不能直接复制，你可以手动复制下方指令内容。");
    } finally {
      setCopyingInstructions(false);
    }
  };

  const handleGenerateAiSiteDraft = async () => {
    const instruction = aiSiteInstruction.trim();

    if (!instruction) {
      window.alert("请先输入你希望 AI 怎么改网站。");
      return;
    }

    setGeneratingAiSiteDraft(true);

    try {
      const result = await generateAiSiteDraft(
        {
          instruction,
          language: editingLanguage,
        },
        adminToken,
      );
      const localizedIncoming = resolveContentForLanguage(result.content, editingLanguage);
      const diffs = collectAiCopyDiffs(localizedDraft, localizedIncoming);
      setPendingAiImport({
        language: editingLanguage,
        incoming: result.content,
        localizedIncoming,
        diffs,
      });
      setSelectedAiDiffIds(diffs.map((item) => item.id));

      window.alert(
        [
          `AI 已生成草稿，发现 ${diffs.length} 项可应用改动。`,
          ...result.notes.map((item) => `- ${item}`),
        ].join("\n"),
      );
    } catch (error) {
      window.alert(`AI 生成网站草稿失败: ${String(error)}`);
    } finally {
      setGeneratingAiSiteDraft(false);
    }
  };

  const handleTestAiConfig = async () => {
    setTestingAiConfig(true);

    try {
      const result = await testAiConfig(draft.aiConfig, adminToken);
      window.alert(`AI 连接测试成功。\n\n模型回复：${result.message}`);
    } catch (error) {
      window.alert(`AI 连接测试失败：${String(error)}`);
    } finally {
      setTestingAiConfig(false);
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
          <div className="admin-language-toolbar">
            <div className="entity-note">
              当前编辑语言：{ADMIN_LANGUAGE_LABELS[editingLanguage]}
              {isLocalizedEditing ? "，保存后会写入对应语言覆盖层" : "，这是主基底语言"}
            </div>
            <div className="admin-language-switcher">
              {SUPPORTED_LANGUAGES.map((language) => (
                <button
                  key={language}
                  className={`site-language-chip${editingLanguage === language ? " active" : ""}${dirtyLanguages[language] ? " dirty" : ""}`}
                  onClick={() => setEditingLanguage(language)}
                  type="button"
                >
                  {language.toUpperCase()}
                  {dirtyLanguages[language] ? " *" : ""}
                </button>
              ))}
            </div>
            <div className="entity-note">
              {dirtyLanguageCount ? `未保存语言：${SUPPORTED_LANGUAGES.filter((language) => dirtyLanguages[language]).map((language) => ADMIN_LANGUAGE_LABELS[language]).join(" / ")}` : "当前三种语言都已保存"}
            </div>
          </div>
        </div>
        <div className="admin-header-actions">
          <a className="button secondary" href="/">
            返回前台
          </a>
          <a className="button secondary" href="/admin/visual">
            可视化编辑
          </a>
          <button
            className="button secondary"
            onClick={handleAiCopyDownload}
            type="button"
            disabled={backingUp || restoring || exportingAiCopy || restoringAiCopy}
          >
            {exportingAiCopy ? "导出中..." : "导出 AI 文案包"}
          </button>
          <button
            className="button secondary"
            onClick={() => aiCopyFileInputRef.current?.click()}
            type="button"
            disabled={backingUp || restoring || exportingAiCopy || restoringAiCopy}
          >
            {restoringAiCopy ? "导入中..." : "导入 AI 文案包"}
          </button>
          <button
            className="button secondary"
            onClick={handleBackupDownload}
            type="button"
            disabled={backingUp || restoring || exportingAiCopy || restoringAiCopy}
          >
            {backingUp ? "导出中..." : "导出备份"}
          </button>
          <button
            className="button secondary"
            onClick={() => backupFileInputRef.current?.click()}
            type="button"
            disabled={backingUp || restoring || exportingAiCopy || restoringAiCopy}
          >
            {restoring ? "恢复中..." : "从文件恢复"}
          </button>
          <button className="button secondary" onClick={onLogout} type="button">
            退出登录
          </button>
          <button className="button primary" onClick={save} type="button" disabled={saving}>
            {saving ? "保存中..." : dirtyLanguageCount ? `保存全部内容（${dirtyLanguageCount} 种语言有改动）` : "保存全部内容"}
          </button>
        </div>
        <input ref={aiCopyFileInputRef} type="file" accept="application/json,.json" hidden onChange={handleAiCopyRestoreFile} />
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
          {pendingAiImport ? (
            <div className="card admin-panel">
              <div className="admin-toolbar">
                <h3>AI 文案差异预览</h3>
                <div className="admin-entity-actions">
                  <button className="button secondary" onClick={() => setSelectedAiDiffIds(pendingAiImport.diffs.map((item) => item.id))} type="button">
                    全选
                  </button>
                  <button className="button secondary" onClick={() => setSelectedAiDiffIds([])} type="button">
                    全不选
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setPendingAiImport(null);
                      setSelectedAiDiffIds([]);
                    }}
                    type="button"
                  >
                    取消本次导入
                  </button>
                  <button className="button primary" onClick={handleApplySelectedAiDiffs} type="button" disabled={saving}>
                    {saving ? "应用中..." : `应用已选 ${selectedAiDiffIds.length} 项`}
                  </button>
                </div>
              </div>
              <div className="entity-note">
                这里展示的是 AI 文案包和当前 {ADMIN_LANGUAGE_LABELS[pendingAiImport.language]} 编辑视图之间的白名单差异。你可以逐项勾选，只导入你认可的文案。
              </div>
              <div className="admin-ai-diff-list">
                {pendingAiImport.diffs.map((item) => {
                  const checked = selectedAiDiffIds.includes(item.id);

                  return (
                    <label key={item.id} className={`card admin-ai-diff-card ${checked ? "selected" : ""}`}>
                      <div className="admin-ai-diff-head">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            setSelectedAiDiffIds((current) =>
                              event.target.checked ? [...current, item.id] : current.filter((value) => value !== item.id),
                            )
                          }
                        />
                        <strong>{item.label}</strong>
                      </div>
                      <div className="admin-ai-diff-grid">
                        <div>
                          <div className="entity-note">当前内容</div>
                          <div className="prose-block">{item.currentValue}</div>
                        </div>
                        <div>
                          <div className="entity-note">AI 建议</div>
                          <div className="prose-block">{item.nextValue}</div>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="card admin-panel">
            <div className="admin-toolbar">
              <h3>AI 改稿工作流</h3>
              <div className="admin-entity-actions">
                <button className="button secondary" onClick={handleCopyInstructions} type="button" disabled={copyingInstructions}>
                  {copyingInstructions ? "复制中..." : "复制外部 AI 指令"}
                </button>
                <button className="button primary" onClick={handleGenerateAiSiteDraft} type="button" disabled={generatingAiSiteDraft}>
                  {generatingAiSiteDraft ? "生成中..." : "让 AI 直接生成草稿"}
                </button>
              </div>
            </div>
            <div className="entity-note">
              可以继续用导出/导入文案包，也可以直接让后台调用已配置的 AI 生成草稿。AI 返回后会进入差异预览，你确认后才会应用到网站。
            </div>
            <label className="admin-field admin-full-span">
              <span>直接发给网站 AI 的改版需求</span>
              <textarea value={aiSiteInstruction} onChange={(event) => setAiSiteInstruction(event.target.value)} />
            </label>
            <label className="admin-field admin-full-span">
              <span>发给外部 AI 的标准指令</span>
              <textarea value={externalAiInstructions} readOnly />
            </label>
          </div>

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
                  value={localizedDraft.siteSettings.topbarNotice}
                  onChange={(value) =>
                    updateDraft((current) => ({
                      ...current,
                      siteSettings: { ...current.siteSettings, topbarNotice: value },
                    }))
                  }
                />
                <TextField
                  label="页脚说明"
                  value={localizedDraft.siteSettings.footerDescription}
                  multiline
                  onChange={(value) =>
                    updateDraft((current) => ({
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
              <div className="admin-subsection">
                <h3>导航文案</h3>
                <div className="admin-grid">
                  {localizedDraft.siteSettings.navigation.map((item, index) => (
                    <TextField
                      key={item.id}
                      label={`导航 ${item.id}`}
                      value={item.label}
                      onChange={(value) =>
                        updateDraft((current) => ({
                          ...current,
                          siteSettings: {
                            ...current.siteSettings,
                            navigation: current.siteSettings.navigation.map((entry, entryIndex) =>
                              entryIndex === index ? { ...entry, label: value } : entry,
                            ),
                          },
                        }))
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "ai" ? (
            <div className="card admin-panel">
              <div className="admin-toolbar">
                <h2>AI 配置与提示词</h2>
                <button className="button secondary" onClick={handleTestAiConfig} type="button" disabled={testingAiConfig}>
                  {testingAiConfig ? "测试中..." : "测试 AI 连接"}
                </button>
              </div>
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
              <h2>首页文案与 SEO</h2>
              <div className="admin-grid">
                <TextField
                  label="页面标题"
                  value={localizedDraft.homePage.title}
                  onChange={(value) =>
                    updateDraft((current) => ({
                      ...current,
                      homePage: { ...current.homePage, title: value },
                    }))
                  }
                />
                <TextField
                  label="SEO Title"
                  value={localizedDraft.homePage.seoTitle}
                  onChange={(value) =>
                    updateDraft((current) => ({
                      ...current,
                      homePage: { ...current.homePage, seoTitle: value },
                    }))
                  }
                />
                <TextField
                  label="SEO Description"
                  value={localizedDraft.homePage.seoDescription}
                  multiline
                  onChange={(value) =>
                    updateDraft((current) => ({
                      ...current,
                      homePage: { ...current.homePage, seoDescription: value },
                    }))
                  }
                />
              </div>

              <div className="admin-subsection">
                <h3>首页模块文案</h3>
                <div className="admin-entity-list">
                  {localizedDraft.homePage.sections.map((section, sectionIndex) => (
                    <article key={section.id} className="card admin-entity-card">
                      <div className="admin-entity-head">
                        <div className="admin-entity-title">
                          <strong>{section.id}</strong>
                          <span className="entity-note">{section.type}</span>
                        </div>
                      </div>

                      <div className="admin-grid">
                        <TextField
                          label="眉题"
                          value={section.eyebrow}
                          onChange={(value) =>
                            updateDraft((current) => ({
                              ...current,
                              homePage: {
                                ...current.homePage,
                                sections: current.homePage.sections.map((item, index) =>
                                  index === sectionIndex ? { ...item, eyebrow: value } : item,
                                ),
                              },
                            }))
                          }
                        />
                        <TextField
                          label="标题"
                          value={section.title}
                          multiline
                          onChange={(value) =>
                            updateDraft((current) => ({
                              ...current,
                              homePage: {
                                ...current.homePage,
                                sections: current.homePage.sections.map((item, index) =>
                                  index === sectionIndex ? { ...item, title: value } : item,
                                ),
                              },
                            }))
                          }
                        />
                        <TextField
                          label="描述"
                          value={section.description}
                          multiline
                          onChange={(value) =>
                            updateDraft((current) => ({
                              ...current,
                              homePage: {
                                ...current.homePage,
                                sections: current.homePage.sections.map((item, index) =>
                                  index === sectionIndex ? { ...item, description: value } : item,
                                ),
                              },
                            }))
                          }
                        />

                        {section.type === "hero"
                          ? (
                              <>
                                {section.actions.map((action, actionIndex) => (
                                  <TextField
                                    key={`${section.id}-action-${actionIndex}`}
                                    label={`按钮 ${actionIndex + 1}`}
                                    value={action.label}
                                    onChange={(value) =>
                                      updateDraft((current) => {
                                        const currentSection = current.homePage.sections[sectionIndex];
                                        if (!currentSection || currentSection.type !== "hero") return current;
                                        return {
                                          ...current,
                                          homePage: {
                                            ...current.homePage,
                                            sections: current.homePage.sections.map((item, index) =>
                                              index === sectionIndex && item.type === "hero"
                                                ? {
                                                    ...item,
                                                    actions: item.actions.map((entry, entryIndex) =>
                                                      entryIndex === actionIndex ? { ...entry, label: value } : entry,
                                                    ),
                                                  }
                                                : item,
                                            ),
                                          },
                                        };
                                      })
                                    }
                                  />
                                ))}
                                {section.highlights.map((item, itemIndex) => (
                                  <Fragment key={`${section.id}-highlight-${itemIndex}`}>
                                    <TextField
                                      label={`高亮 ${itemIndex + 1} 标题`}
                                      value={item.label}
                                      onChange={(value) =>
                                        updateDraft((current) => {
                                          const currentSection = current.homePage.sections[sectionIndex];
                                          if (!currentSection || currentSection.type !== "hero") return current;
                                          return {
                                            ...current,
                                            homePage: {
                                              ...current.homePage,
                                              sections: current.homePage.sections.map((entry, index) =>
                                                index === sectionIndex && entry.type === "hero"
                                                  ? {
                                                      ...entry,
                                                      highlights: entry.highlights.map((highlight, highlightIndex) =>
                                                        highlightIndex === itemIndex ? { ...highlight, label: value } : highlight,
                                                      ),
                                                    }
                                                  : entry,
                                              ),
                                            },
                                          };
                                        })
                                      }
                                    />
                                    <TextField
                                      label={`高亮 ${itemIndex + 1} 内容`}
                                      value={item.value}
                                      onChange={(value) =>
                                        updateDraft((current) => {
                                          const currentSection = current.homePage.sections[sectionIndex];
                                          if (!currentSection || currentSection.type !== "hero") return current;
                                          return {
                                            ...current,
                                            homePage: {
                                              ...current.homePage,
                                              sections: current.homePage.sections.map((entry, index) =>
                                                index === sectionIndex && entry.type === "hero"
                                                  ? {
                                                      ...entry,
                                                      highlights: entry.highlights.map((highlight, highlightIndex) =>
                                                        highlightIndex === itemIndex ? { ...highlight, value } : highlight,
                                                      ),
                                                    }
                                                  : entry,
                                              ),
                                            },
                                          };
                                        })
                                      }
                                    />
                                  </Fragment>
                                ))}
                                <TextField
                                  label="AI 面板标题"
                                  value={section.aiPanel.title}
                                  onChange={(value) =>
                                    updateDraft((current) => {
                                      const currentSection = current.homePage.sections[sectionIndex];
                                      if (!currentSection || currentSection.type !== "hero") return current;
                                      return {
                                        ...current,
                                        homePage: {
                                          ...current.homePage,
                                          sections: current.homePage.sections.map((entry, index) =>
                                            index === sectionIndex && entry.type === "hero"
                                              ? { ...entry, aiPanel: { ...entry.aiPanel, title: value } }
                                              : entry,
                                          ),
                                        },
                                      };
                                    })
                                  }
                                />
                                <TextField
                                  label="AI 面板描述"
                                  value={section.aiPanel.description}
                                  multiline
                                  onChange={(value) =>
                                    updateDraft((current) => {
                                      const currentSection = current.homePage.sections[sectionIndex];
                                      if (!currentSection || currentSection.type !== "hero") return current;
                                      return {
                                        ...current,
                                        homePage: {
                                          ...current.homePage,
                                          sections: current.homePage.sections.map((entry, index) =>
                                            index === sectionIndex && entry.type === "hero"
                                              ? { ...entry, aiPanel: { ...entry.aiPanel, description: value } }
                                              : entry,
                                          ),
                                        },
                                      };
                                    })
                                  }
                                />
                                {section.aiPanel.steps.map((step, stepIndex) => (
                                  <TextField
                                    key={`${section.id}-ai-step-${stepIndex}`}
                                    label={`AI 步骤 ${stepIndex + 1}`}
                                    value={step}
                                    onChange={(value) =>
                                      updateDraft((current) => {
                                        const currentSection = current.homePage.sections[sectionIndex];
                                        if (!currentSection || currentSection.type !== "hero") return current;
                                        return {
                                          ...current,
                                          homePage: {
                                            ...current.homePage,
                                            sections: current.homePage.sections.map((entry, index) =>
                                              index === sectionIndex && entry.type === "hero"
                                                ? {
                                                    ...entry,
                                                    aiPanel: {
                                                      ...entry.aiPanel,
                                                      steps: entry.aiPanel.steps.map((item, itemIndex) =>
                                                        itemIndex === stepIndex ? value : item,
                                                      ),
                                                    },
                                                  }
                                                : entry,
                                            ),
                                          },
                                        };
                                      })
                                    }
                                  />
                                ))}
                              </>
                            )
                          : null}

                        {section.type === "services"
                          ? section.items.map((item, itemIndex) => (
                              <Fragment key={`${section.id}-item-${itemIndex}`}>
                                <TextField
                                  label={`项目 ${itemIndex + 1} 标签`}
                                  value={item.tag}
                                  onChange={(value) =>
                                    updateDraft((current) => {
                                      const currentSection = current.homePage.sections[sectionIndex];
                                      if (!currentSection || currentSection.type !== "services") return current;
                                      return {
                                        ...current,
                                        homePage: {
                                          ...current.homePage,
                                          sections: current.homePage.sections.map((entry, index) =>
                                            index === sectionIndex && entry.type === "services"
                                              ? {
                                                  ...entry,
                                                  items: entry.items.map((serviceItem, serviceIndex) =>
                                                    serviceIndex === itemIndex ? { ...serviceItem, tag: value } : serviceItem,
                                                  ),
                                                }
                                              : entry,
                                          ),
                                        },
                                      };
                                    })
                                  }
                                />
                                <TextField
                                  label={`项目 ${itemIndex + 1} 标题`}
                                  value={item.title}
                                  onChange={(value) =>
                                    updateDraft((current) => {
                                      const currentSection = current.homePage.sections[sectionIndex];
                                      if (!currentSection || currentSection.type !== "services") return current;
                                      return {
                                        ...current,
                                        homePage: {
                                          ...current.homePage,
                                          sections: current.homePage.sections.map((entry, index) =>
                                            index === sectionIndex && entry.type === "services"
                                              ? {
                                                  ...entry,
                                                  items: entry.items.map((serviceItem, serviceIndex) =>
                                                    serviceIndex === itemIndex ? { ...serviceItem, title: value } : serviceItem,
                                                  ),
                                                }
                                              : entry,
                                          ),
                                        },
                                      };
                                    })
                                  }
                                />
                                <TextField
                                  label={`项目 ${itemIndex + 1} 摘要`}
                                  value={item.summary}
                                  multiline
                                  onChange={(value) =>
                                    updateDraft((current) => {
                                      const currentSection = current.homePage.sections[sectionIndex];
                                      if (!currentSection || currentSection.type !== "services") return current;
                                      return {
                                        ...current,
                                        homePage: {
                                          ...current.homePage,
                                          sections: current.homePage.sections.map((entry, index) =>
                                            index === sectionIndex && entry.type === "services"
                                              ? {
                                                  ...entry,
                                                  items: entry.items.map((serviceItem, serviceIndex) =>
                                                    serviceIndex === itemIndex ? { ...serviceItem, summary: value } : serviceItem,
                                                  ),
                                                }
                                              : entry,
                                          ),
                                        },
                                      };
                                    })
                                  }
                                />
                                <TextField
                                  label={`项目 ${itemIndex + 1} 按钮`}
                                  value={item.ctaLabel}
                                  onChange={(value) =>
                                    updateDraft((current) => {
                                      const currentSection = current.homePage.sections[sectionIndex];
                                      if (!currentSection || currentSection.type !== "services") return current;
                                      return {
                                        ...current,
                                        homePage: {
                                          ...current.homePage,
                                          sections: current.homePage.sections.map((entry, index) =>
                                            index === sectionIndex && entry.type === "services"
                                              ? {
                                                  ...entry,
                                                  items: entry.items.map((serviceItem, serviceIndex) =>
                                                    serviceIndex === itemIndex ? { ...serviceItem, ctaLabel: value } : serviceItem,
                                                  ),
                                                }
                                              : entry,
                                          ),
                                        },
                                      };
                                    })
                                  }
                                />
                              </Fragment>
                            ))
                          : null}

                        {section.type === "journey"
                          ? section.steps.map((step, stepIndex) => (
                              <Fragment key={`${section.id}-step-${stepIndex}`}>
                                <TextField
                                  label={`流程 ${stepIndex + 1} 标题`}
                                  value={step.title}
                                  onChange={(value) =>
                                    updateDraft((current) => {
                                      const currentSection = current.homePage.sections[sectionIndex];
                                      if (!currentSection || currentSection.type !== "journey") return current;
                                      return {
                                        ...current,
                                        homePage: {
                                          ...current.homePage,
                                          sections: current.homePage.sections.map((entry, index) =>
                                            index === sectionIndex && entry.type === "journey"
                                              ? {
                                                  ...entry,
                                                  steps: entry.steps.map((journeyStep, journeyIndex) =>
                                                    journeyIndex === stepIndex ? { ...journeyStep, title: value } : journeyStep,
                                                  ),
                                                }
                                              : entry,
                                          ),
                                        },
                                      };
                                    })
                                  }
                                />
                                <TextField
                                  label={`流程 ${stepIndex + 1} 摘要`}
                                  value={step.summary}
                                  multiline
                                  onChange={(value) =>
                                    updateDraft((current) => {
                                      const currentSection = current.homePage.sections[sectionIndex];
                                      if (!currentSection || currentSection.type !== "journey") return current;
                                      return {
                                        ...current,
                                        homePage: {
                                          ...current.homePage,
                                          sections: current.homePage.sections.map((entry, index) =>
                                            index === sectionIndex && entry.type === "journey"
                                              ? {
                                                  ...entry,
                                                  steps: entry.steps.map((journeyStep, journeyIndex) =>
                                                    journeyIndex === stepIndex ? { ...journeyStep, summary: value } : journeyStep,
                                                  ),
                                                }
                                              : entry,
                                          ),
                                        },
                                      };
                                    })
                                  }
                                />
                              </Fragment>
                            ))
                          : null}

                        {section.type === "gallery"
                          ? section.items.map((item, itemIndex) => (
                              <Fragment key={`${section.id}-gallery-${itemIndex}`}>
                                <TextField
                                  label={`图册 ${itemIndex + 1} 标题`}
                                  value={item.title}
                                  onChange={(value) =>
                                    updateDraft((current) => {
                                      const currentSection = current.homePage.sections[sectionIndex];
                                      if (!currentSection || currentSection.type !== "gallery") return current;
                                      return {
                                        ...current,
                                        homePage: {
                                          ...current.homePage,
                                          sections: current.homePage.sections.map((entry, index) =>
                                            index === sectionIndex && entry.type === "gallery"
                                              ? {
                                                  ...entry,
                                                  items: entry.items.map((galleryItem, galleryIndex) =>
                                                    galleryIndex === itemIndex ? { ...galleryItem, title: value } : galleryItem,
                                                  ),
                                                }
                                              : entry,
                                          ),
                                        },
                                      };
                                    })
                                  }
                                />
                                <TextField
                                  label={`图册 ${itemIndex + 1} 摘要`}
                                  value={item.summary}
                                  multiline
                                  onChange={(value) =>
                                    updateDraft((current) => {
                                      const currentSection = current.homePage.sections[sectionIndex];
                                      if (!currentSection || currentSection.type !== "gallery") return current;
                                      return {
                                        ...current,
                                        homePage: {
                                          ...current.homePage,
                                          sections: current.homePage.sections.map((entry, index) =>
                                            index === sectionIndex && entry.type === "gallery"
                                              ? {
                                                  ...entry,
                                                  items: entry.items.map((galleryItem, galleryIndex) =>
                                                    galleryIndex === itemIndex ? { ...galleryItem, summary: value } : galleryItem,
                                                  ),
                                                }
                                              : entry,
                                          ),
                                        },
                                      };
                                    })
                                  }
                                />
                              </Fragment>
                            ))
                          : null}

                        {section.type === "articles"
                          ? section.items.map((item, itemIndex) => (
                              <Fragment key={`${section.id}-article-${itemIndex}`}>
                                <TextField
                                  label={`文章 ${itemIndex + 1} 分类`}
                                  value={item.category}
                                  onChange={(value) =>
                                    updateDraft((current) => {
                                      const currentSection = current.homePage.sections[sectionIndex];
                                      if (!currentSection || currentSection.type !== "articles") return current;
                                      return {
                                        ...current,
                                        homePage: {
                                          ...current.homePage,
                                          sections: current.homePage.sections.map((entry, index) =>
                                            index === sectionIndex && entry.type === "articles"
                                              ? {
                                                  ...entry,
                                                  items: entry.items.map((articleItem, articleIndex) =>
                                                    articleIndex === itemIndex ? { ...articleItem, category: value } : articleItem,
                                                  ),
                                                }
                                              : entry,
                                          ),
                                        },
                                      };
                                    })
                                  }
                                />
                                <TextField
                                  label={`文章 ${itemIndex + 1} 标题`}
                                  value={item.title}
                                  onChange={(value) =>
                                    updateDraft((current) => {
                                      const currentSection = current.homePage.sections[sectionIndex];
                                      if (!currentSection || currentSection.type !== "articles") return current;
                                      return {
                                        ...current,
                                        homePage: {
                                          ...current.homePage,
                                          sections: current.homePage.sections.map((entry, index) =>
                                            index === sectionIndex && entry.type === "articles"
                                              ? {
                                                  ...entry,
                                                  items: entry.items.map((articleItem, articleIndex) =>
                                                    articleIndex === itemIndex ? { ...articleItem, title: value } : articleItem,
                                                  ),
                                                }
                                              : entry,
                                          ),
                                        },
                                      };
                                    })
                                  }
                                />
                                <TextField
                                  label={`文章 ${itemIndex + 1} 摘要`}
                                  value={item.excerpt}
                                  multiline
                                  onChange={(value) =>
                                    updateDraft((current) => {
                                      const currentSection = current.homePage.sections[sectionIndex];
                                      if (!currentSection || currentSection.type !== "articles") return current;
                                      return {
                                        ...current,
                                        homePage: {
                                          ...current.homePage,
                                          sections: current.homePage.sections.map((entry, index) =>
                                            index === sectionIndex && entry.type === "articles"
                                              ? {
                                                  ...entry,
                                                  items: entry.items.map((articleItem, articleIndex) =>
                                                    articleIndex === itemIndex ? { ...articleItem, excerpt: value } : articleItem,
                                                  ),
                                                }
                                              : entry,
                                          ),
                                        },
                                      };
                                    })
                                  }
                                />
                                <TextField
                                  label={`文章 ${itemIndex + 1} SEO 标题`}
                                  value={item.seoTitle}
                                  onChange={(value) =>
                                    updateDraft((current) => {
                                      const currentSection = current.homePage.sections[sectionIndex];
                                      if (!currentSection || currentSection.type !== "articles") return current;
                                      return {
                                        ...current,
                                        homePage: {
                                          ...current.homePage,
                                          sections: current.homePage.sections.map((entry, index) =>
                                            index === sectionIndex && entry.type === "articles"
                                              ? {
                                                  ...entry,
                                                  items: entry.items.map((articleItem, articleIndex) =>
                                                    articleIndex === itemIndex ? { ...articleItem, seoTitle: value } : articleItem,
                                                  ),
                                                }
                                              : entry,
                                          ),
                                        },
                                      };
                                    })
                                  }
                                />
                              </Fragment>
                            ))
                          : null}

                        {section.type === "analytics"
                          ? section.metrics.map((item, itemIndex) => (
                              <Fragment key={`${section.id}-metric-${itemIndex}`}>
                                <TextField
                                  label={`指标 ${itemIndex + 1} 标题`}
                                  value={item.label}
                                  onChange={(value) =>
                                    updateDraft((current) => {
                                      const currentSection = current.homePage.sections[sectionIndex];
                                      if (!currentSection || currentSection.type !== "analytics") return current;
                                      return {
                                        ...current,
                                        homePage: {
                                          ...current.homePage,
                                          sections: current.homePage.sections.map((entry, index) =>
                                            index === sectionIndex && entry.type === "analytics"
                                              ? {
                                                  ...entry,
                                                  metrics: entry.metrics.map((metric, metricIndex) =>
                                                    metricIndex === itemIndex ? { ...metric, label: value } : metric,
                                                  ),
                                                }
                                              : entry,
                                          ),
                                        },
                                      };
                                    })
                                  }
                                />
                                <TextField
                                  label={`指标 ${itemIndex + 1} 内容`}
                                  value={item.value}
                                  onChange={(value) =>
                                    updateDraft((current) => {
                                      const currentSection = current.homePage.sections[sectionIndex];
                                      if (!currentSection || currentSection.type !== "analytics") return current;
                                      return {
                                        ...current,
                                        homePage: {
                                          ...current.homePage,
                                          sections: current.homePage.sections.map((entry, index) =>
                                            index === sectionIndex && entry.type === "analytics"
                                              ? {
                                                  ...entry,
                                                  metrics: entry.metrics.map((metric, metricIndex) =>
                                                    metricIndex === itemIndex ? { ...metric, value } : metric,
                                                  ),
                                                }
                                              : entry,
                                          ),
                                        },
                                      };
                                    })
                                  }
                                />
                                <TextField
                                  label={`指标 ${itemIndex + 1} 备注`}
                                  value={item.note}
                                  multiline
                                  onChange={(value) =>
                                    updateDraft((current) => {
                                      const currentSection = current.homePage.sections[sectionIndex];
                                      if (!currentSection || currentSection.type !== "analytics") return current;
                                      return {
                                        ...current,
                                        homePage: {
                                          ...current.homePage,
                                          sections: current.homePage.sections.map((entry, index) =>
                                            index === sectionIndex && entry.type === "analytics"
                                              ? {
                                                  ...entry,
                                                  metrics: entry.metrics.map((metric, metricIndex) =>
                                                    metricIndex === itemIndex ? { ...metric, note: value } : metric,
                                                  ),
                                                }
                                              : entry,
                                          ),
                                        },
                                      };
                                    })
                                  }
                                />
                              </Fragment>
                            ))
                          : null}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "articles" ? (
            <EntityListEditor
              title="文章"
              items={localizedDraft.articles}
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
                updateDraft((current) => ({
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
              items={localizedDraft.doctors}
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
                updateDraft((current) => ({
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
              items={localizedDraft.services}
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
                updateDraft((current) => ({
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
              items={localizedDraft.pricing}
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
                updateDraft((current) => ({
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
              items={localizedDraft.gallery}
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
                updateDraft((current) => ({
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
              items={localizedDraft.pages}
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
                updateDraft((current) => ({
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
