import { randomUUID } from "node:crypto";
import type { AiConfig, ChatMessageRecord, TriageResult } from "@quanyu/shared";

type Language = "zh" | "ru" | "en";
type RecommendedAction =
  | "continue_ai_consultation"
  | "collect_lead"
  | "escalate_to_human"
  | "refuse_out_of_scope";

type TopicScope = "in_scope" | "needs_clarification" | "out_of_scope";

export type ChatReply = {
  assistantMessage: ChatMessageRecord;
  triage: TriageResult;
};

type ModelReplyPayload = {
  reply: string;
  triage: TriageResult;
};

const RECOMMENDED_ACTIONS = new Set<RecommendedAction>([
  "continue_ai_consultation",
  "collect_lead",
  "escalate_to_human",
  "refuse_out_of_scope",
]);

const LANGUAGE_NAMES: Record<Language, string> = {
  zh: "简体中文",
  ru: "русский язык",
  en: "English",
};

const DENTAL_KEYWORDS = [
  "牙",
  "齿",
  "口腔",
  "牙疼",
  "牙痛",
  "牙龈",
  "出血",
  "肿",
  "流脓",
  "龋",
  "蛀牙",
  "根管",
  "种植",
  "拔牙",
  "补牙",
  "镶牙",
  "义齿",
  "假牙",
  "正畸",
  "矫正",
  "美白",
  "洁牙",
  "洗牙",
  "牙冠",
  "牙桥",
  "牙套",
  "智齿",
  "牙周",
  "牙髓",
  "咬合",
  "拍片",
  "全景片",
  "ct",
  "cbct",
  "牙医",
  "牙科",
  "стомат",
  "зуб",
  "зубы",
  "десн",
  "имплант",
  "коронк",
  "мост",
  "протез",
  "брекет",
  "кариес",
  "пломб",
  "канал",
  "удалени",
  "отбелив",
  "чистк",
  "прикус",
  "снимок",
  "кт",
  "dental",
  "tooth",
  "teeth",
  "gum",
  "implant",
  "crown",
  "bridge",
  "denture",
  "braces",
  "orthodont",
  "cavity",
  "root canal",
  "extraction",
  "whitening",
  "cleaning",
  "x-ray",
];

const VISIT_KEYWORDS = [
  "门诊",
  "诊所",
  "医院",
  "医生",
  "护士",
  "营业",
  "上班",
  "预约",
  "挂号",
  "地址",
  "路线",
  "接送",
  "住宿",
  "酒店",
  "宾馆",
  "环境",
  "翻译",
  "俄语",
  "中文",
  "价格",
  "费用",
  "报价",
  "多少钱",
  "黑河",
  "跨境",
  "telegram",
  "телеграм",
  "клиник",
  "больниц",
  "врач",
  "доктор",
  "регистрат",
  "запис",
  "прием",
  "адрес",
  "маршрут",
  "трансфер",
  "гостиниц",
  "отел",
  "прожив",
  "услов",
  "перевод",
  "русск",
  "китайск",
  "цена",
  "стоим",
  "сколько стоит",
  "хэйхэ",
  "heihe",
  "clinic",
  "hospital",
  "doctor",
  "appointment",
  "address",
  "route",
  "transfer",
  "hotel",
  "accommodation",
  "translator",
  "russian",
  "chinese",
  "price",
  "cost",
  "quote",
  "how much",
];

const OUT_OF_SCOPE_KEYWORDS = [
  "写代码",
  "代码",
  "编程",
  "股票",
  "基金",
  "加密货币",
  "彩票",
  "赌博",
  "政治",
  "色情",
  "作业",
  "考试答案",
  "小说",
  "论文",
  "天气",
  "新闻",
  "食谱",
  "旅游攻略",
  "忽略之前",
  "忽略上面",
  "系统提示",
  "开发者消息",
  "api key",
  "越狱",
  "prompt",
  "код",
  "программ",
  "акци",
  "крипт",
  "казино",
  "ставк",
  "политик",
  "порно",
  "домашн",
  "экзамен",
  "погод",
  "новост",
  "рецепт",
  "игнорируй",
  "системн",
  "code",
  "programming",
  "stock",
  "crypto",
  "casino",
  "betting",
  "politics",
  "porn",
  "homework",
  "exam answer",
  "weather",
  "news",
  "recipe",
  "ignore previous",
  "system prompt",
  "developer message",
  "jailbreak",
];

const GENERAL_MEDICAL_KEYWORDS = [
  "心脏",
  "胸痛",
  "肚子",
  "胃",
  "皮肤",
  "感冒",
  "发烧",
  "妇科",
  "儿科",
  "骨折",
  "血压",
  "糖尿病",
  "怀孕",
  "сердц",
  "груд",
  "живот",
  "желуд",
  "кож",
  "простуд",
  "температур",
  "гинеколог",
  "педиатр",
  "перелом",
  "давлен",
  "диабет",
  "беремен",
  "heart",
  "chest pain",
  "stomach",
  "skin",
  "cold",
  "fever",
  "gynecolog",
  "pediatric",
  "fracture",
  "blood pressure",
  "diabetes",
  "pregnan",
];

const URGENT_KEYWORDS = [
  "疼",
  "痛",
  "出血",
  "肿",
  "流脓",
  "化脓",
  "发烧",
  "张不开嘴",
  "外伤",
  "摔",
  "断",
  "bleeding",
  "swelling",
  "pain",
  "pus",
  "fever",
  "trauma",
  "broken",
  "боль",
  "болит",
  "кров",
  "отек",
  "отёк",
  "опух",
  "гной",
  "температур",
  "травм",
  "слом",
];

const PRICING_KEYWORDS = [
  "价格",
  "费用",
  "报价",
  "多少钱",
  "价钱",
  "price",
  "cost",
  "quote",
  "how much",
  "цена",
  "стоим",
  "сколько стоит",
];

const APPOINTMENT_KEYWORDS = [
  "预约",
  "挂号",
  "时间",
  "几点",
  "到诊",
  "visit",
  "appointment",
  "book",
  "schedule",
  "запис",
  "прием",
  "приём",
  "время",
];

const LODGING_KEYWORDS = [
  "住宿",
  "酒店",
  "宾馆",
  "接送",
  "路线",
  "hotel",
  "accommodation",
  "transfer",
  "route",
  "гостиниц",
  "отел",
  "прожив",
  "трансфер",
  "маршрут",
];

const GREETING_PATTERNS = [
  "你好",
  "您好",
  "在吗",
  "hi",
  "hello",
  "привет",
  "здравствуйте",
  "добрый день",
];

const MODEL_REPLY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "triage"],
  properties: {
    reply: {
      type: "string",
      description: "Direct assistant reply to show to the website visitor.",
    },
    triage: {
      type: "object",
      additionalProperties: false,
      required: ["intent", "urgent", "recommendedAction", "suggestedNextStep"],
      properties: {
        intent: {
          type: "string",
        },
        urgent: {
          type: "boolean",
        },
        recommendedAction: {
          type: "string",
          enum: [...RECOMMENDED_ACTIONS],
        },
        suggestedNextStep: {
          type: "string",
        },
      },
    },
  },
} as const;

function normalizeText(input: string) {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function hasDentalTopic(text: string) {
  return includesAny(text, DENTAL_KEYWORDS);
}

function hasVisitTopic(text: string) {
  return includesAny(text, VISIT_KEYWORDS);
}

function hasAllowedTopic(text: string) {
  return hasDentalTopic(text) || hasVisitTopic(text);
}

function isGreeting(text: string) {
  return text.length <= 40 && includesAny(text, GREETING_PATTERNS);
}

function hasRecentAllowedContext(history: ChatMessageRecord[]) {
  return history
    .slice(-8)
    .some((message) => message.role === "user" && hasAllowedTopic(normalizeText(message.content)));
}

function classifyTopicScope(params: {
  userMessage: string;
  history: ChatMessageRecord[];
}): TopicScope {
  const message = normalizeText(params.userMessage);
  const recentContextAllowed = hasRecentAllowedContext(params.history);
  const dentalTopic = hasDentalTopic(message);
  const visitTopic = hasVisitTopic(message);
  const hasGeneralMedicalTopic = includesAny(message, GENERAL_MEDICAL_KEYWORDS);
  const outOfScope = includesAny(message, OUT_OF_SCOPE_KEYWORDS);

  if (outOfScope) {
    return "out_of_scope";
  }

  if (hasGeneralMedicalTopic && !dentalTopic && !visitTopic && !recentContextAllowed) {
    return "out_of_scope";
  }

  if (dentalTopic || visitTopic || recentContextAllowed) {
    return "in_scope";
  }

  if (isGreeting(message)) {
    return "needs_clarification";
  }

  return "needs_clarification";
}

function localizeOutOfScopeReply(language: Language) {
  if (language === "ru") {
    return "Я могу отвечать только на вопросы о зубах, стоматологическом лечении, клинике, записи, ценах, маршруте, переводе и проживании рядом с визитом. По другим темам я не консультирую. Если вопрос связан с зубами или визитом в клинику, опишите его, пожалуйста.";
  }

  if (language === "en") {
    return "I can only help with dental symptoms and treatment, clinic or hospital visit arrangements, pricing, appointments, route, translation, and accommodation related to the visit. I cannot answer unrelated topics. If your question is about dental care or visiting the clinic, please describe it.";
  }

  return "我只能回答牙齿/口腔问题、门诊就诊、价格预约、路线翻译、住宿环境等和来院相关的问题，不能处理其他话题。如果你要咨询牙齿或到诊安排，请直接描述症状或需求。";
}

function localizeClarificationReply(language: Language) {
  if (language === "ru") {
    return "Я могу помочь с первичным стоматологическим опросом, ценами, записью, маршрутом, переводом и проживанием для визита в клинику. Напишите, пожалуйста, что именно вас беспокоит: какой зуб, как давно, есть ли боль, отек, кровоточивость или снимок.";
  }

  if (language === "en") {
    return "I can help with initial dental triage, pricing, appointments, route, translation, and accommodation for visiting the clinic. Please describe the dental issue or visit need: which tooth or area, how long it has lasted, pain level, bleeding or swelling, and whether you have imaging.";
  }

  return "我可以帮你做牙科初步问诊，也可以说明价格、预约、路线、翻译和住宿安排。请先说清楚牙齿或来院相关需求：哪个部位、持续多久、疼痛程度、是否出血/肿胀、是否已经拍片。";
}

function localizeSuggestedNextStep(language: Language, intent: string, urgent: boolean) {
  if (language === "ru") {
    if (urgent) {
      return "Рекомендуется как можно скорее перейти в Telegram и отправить снимки или фото администратору/врачу для уточнения.";
    }

    if (intent === "pricing") {
      return "Уточните, пожалуйста, какой вид лечения нужен, есть ли снимок и сколько зубов требует оценки; затем можно перейти в Telegram для расчета.";
    }

    if (intent === "lodging") {
      return "Уточните даты визита, количество людей и требования к проживанию, затем администратор сможет подсказать варианты.";
    }

    if (intent === "appointment") {
      return "Уточните удобную дату, цель визита и есть ли снимок; после этого можно подтвердить время через Telegram.";
    }

    return "Продолжите описание симптомов: место, длительность, сила боли, кровоточивость или отек, а также наличие снимка.";
  }

  if (language === "en") {
    if (urgent) {
      return "Please continue in Telegram as soon as possible and send imaging or photos so staff can check the situation.";
    }

    if (intent === "pricing") {
      return "Please specify the treatment type, whether imaging is available, and how many teeth need evaluation before a price estimate.";
    }

    if (intent === "lodging") {
      return "Please share visit dates, number of people, and accommodation needs so staff can suggest options.";
    }

    if (intent === "appointment") {
      return "Please share your preferred date, visit purpose, and whether you have imaging, then staff can confirm through Telegram.";
    }

    return "Please continue with the tooth or area, duration, pain level, bleeding or swelling, and whether imaging is available.";
  }

  if (urgent) {
    return "建议尽快进入 Telegram，把片子或口内照片发给人工接待/医生进一步确认。";
  }

  if (intent === "pricing") {
    return "请补充想做的项目、涉及几颗牙、是否已有片子，再由人工进一步估价。";
  }

  if (intent === "lodging") {
    return "请补充来诊日期、同行人数和住宿要求，方便人工继续说明可选安排。";
  }

  if (intent === "appointment") {
    return "请补充方便到诊的日期、就诊目的和是否已有片子，再通过 Telegram 确认时间。";
  }

  return "请继续补充部位、持续时间、疼痛程度、是否出血/肿胀，以及是否已有影像资料。";
}

function inferTriage(message: string, language: Language): TriageResult {
  const normalized = normalizeText(message);
  const urgent = includesAny(normalized, URGENT_KEYWORDS);
  const pricing = includesAny(normalized, PRICING_KEYWORDS);
  const lodging = includesAny(normalized, LODGING_KEYWORDS);
  const appointment = includesAny(normalized, APPOINTMENT_KEYWORDS);
  const intent = urgent
    ? "emergency_or_pain"
    : pricing
      ? "pricing"
      : lodging
        ? "lodging"
        : appointment
          ? "appointment"
          : hasDentalTopic(normalized)
            ? "dental_symptom"
            : hasVisitTopic(normalized)
              ? "clinic_visit"
              : "consultation";
  const recommendedAction: RecommendedAction = urgent
    ? "escalate_to_human"
    : pricing || lodging || appointment
      ? "collect_lead"
      : "continue_ai_consultation";

  return {
    intent,
    urgent,
    recommendedAction,
    suggestedNextStep: localizeSuggestedNextStep(language, intent, urgent),
  };
}

function createAssistantMessage(content: string): ChatMessageRecord {
  return {
    id: `assistant-${randomUUID()}`,
    role: "assistant",
    content,
    createdAt: new Date().toISOString(),
  };
}

function createScopedReply(language: Language, scope: Exclude<TopicScope, "in_scope">): ChatReply {
  const content = scope === "out_of_scope" ? localizeOutOfScopeReply(language) : localizeClarificationReply(language);

  return {
    assistantMessage: createAssistantMessage(content),
    triage: {
      intent: scope,
      urgent: false,
      recommendedAction: scope === "out_of_scope" ? "refuse_out_of_scope" : "continue_ai_consultation",
      suggestedNextStep: content,
    },
  };
}

function localizeMockReply(config: AiConfig, language: Language, triage: TriageResult) {
  if (language === "ru") {
    if (triage.intent === "pricing") {
      return `Могу помочь собрать данные для предварительной оценки стоимости. Уточните, пожалуйста, какой вид лечения нужен, сколько зубов нужно оценить и есть ли снимок.\n\nСледующий шаг: ${triage.suggestedNextStep}`;
    }

    if (triage.intent === "lodging") {
      return `По маршруту, переводу и проживанию лучше продолжить с администратором. Уточните даты визита, количество людей и требования к гостинице.\n\nСледующий шаг: ${triage.suggestedNextStep}`;
    }

    if (triage.intent === "appointment" || triage.intent === "clinic_visit") {
      return `Могу помочь с первичной организацией визита в клинику. Уточните удобную дату, цель приема и есть ли снимки или фото.\n\nСледующий шаг: ${triage.suggestedNextStep}`;
    }

    return `Я могу помочь только с первичным стоматологическим опросом и организацией визита. Опишите, пожалуйста, какой зуб или зона беспокоит, как давно, насколько сильная боль, есть ли кровоточивость, отек или снимок.\n\nПредварительно: ${triage.suggestedNextStep}`;
  }

  if (language === "en") {
    if (triage.intent === "pricing") {
      return `I can collect the basic details needed for a preliminary price estimate. Please share the treatment type, number of teeth involved, and whether imaging is available.\n\nNext step: ${triage.suggestedNextStep}`;
    }

    if (triage.intent === "lodging") {
      return `For route, translation and accommodation, staff should continue with you directly. Please share visit dates, number of people and hotel requirements.\n\nNext step: ${triage.suggestedNextStep}`;
    }

    if (triage.intent === "appointment" || triage.intent === "clinic_visit") {
      return `I can help collect the basic visit details. Please share your preferred date, visit purpose, and whether you have imaging or photos.\n\nNext step: ${triage.suggestedNextStep}`;
    }

    return `I can help only with initial dental triage and visit arrangements. Please describe the tooth or area, duration, pain level, bleeding or swelling, and whether imaging is available.\n\nCurrent next step: ${triage.suggestedNextStep}`;
  }

  if (triage.intent === "pricing") {
    return `我可以先帮你收集估价前需要的信息。请补充想做的项目、涉及几颗牙、是否已有片子或口内照片。\n\n下一步：${triage.suggestedNextStep}`;
  }

  if (triage.intent === "lodging") {
    return `路线、翻译和住宿安排建议转人工继续确认。请补充来诊日期、同行人数、希望住几晚和住宿要求。\n\n下一步：${triage.suggestedNextStep}`;
  }

  if (triage.intent === "appointment" || triage.intent === "clinic_visit") {
    return `我可以先帮你整理到诊信息。请补充方便到诊的日期、就诊目的，以及是否已有片子或口内照片。\n\n下一步：${triage.suggestedNextStep}`;
  }

  return `${config.fallbackReply}\n\n当前判断：${triage.urgent ? "存在较高紧急度" : "可继续初步问诊"}。${triage.suggestedNextStep}`;
}

function createMockReply(config: AiConfig, language: Language, userMessage: string): ChatReply {
  const triage = inferTriage(userMessage, language);
  const content = localizeMockReply(config, language, triage);

  return {
    assistantMessage: createAssistantMessage(content),
    triage,
  };
}

function normalizeRecommendedAction(input: unknown): RecommendedAction | null {
  if (typeof input !== "string") {
    return null;
  }

  return RECOMMENDED_ACTIONS.has(input as RecommendedAction) ? (input as RecommendedAction) : null;
}

function normalizeModelPayload(value: unknown, fallbackTriage: TriageResult): ModelReplyPayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    reply?: unknown;
    triage?: {
      intent?: unknown;
      urgent?: unknown;
      recommendedAction?: unknown;
      suggestedNextStep?: unknown;
    };
  };

  if (typeof candidate.reply !== "string" || !candidate.reply.trim()) {
    return null;
  }

  const recommendedAction = normalizeRecommendedAction(candidate.triage?.recommendedAction);

  return {
    reply: candidate.reply.trim(),
    triage: {
      intent: typeof candidate.triage?.intent === "string" ? candidate.triage.intent : fallbackTriage.intent,
      urgent: typeof candidate.triage?.urgent === "boolean" ? candidate.triage.urgent : fallbackTriage.urgent,
      recommendedAction: recommendedAction ?? fallbackTriage.recommendedAction,
      suggestedNextStep:
        typeof candidate.triage?.suggestedNextStep === "string" && candidate.triage.suggestedNextStep.trim()
          ? candidate.triage.suggestedNextStep.trim()
          : fallbackTriage.suggestedNextStep,
    },
  };
}

function stripMarkdownJsonFence(input: string) {
  const trimmed = input.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function parseModelReply(content: string, fallbackTriage: TriageResult): ModelReplyPayload | null {
  const stripped = stripMarkdownJsonFence(content);

  try {
    return normalizeModelPayload(JSON.parse(stripped), fallbackTriage);
  } catch {
    const firstBrace = stripped.indexOf("{");
    const lastBrace = stripped.lastIndexOf("}");

    if (firstBrace < 0 || lastBrace <= firstBrace) {
      return null;
    }

    try {
      return normalizeModelPayload(JSON.parse(stripped.slice(firstBrace, lastBrace + 1)), fallbackTriage);
    } catch {
      return null;
    }
  }
}

function buildHardGuardrailPrompt(language: Language) {
  return [
    "你是泉寓门诊网站的 AI 导诊助手。必须严格遵守以下边界：",
    "1. 只允许讨论牙齿/口腔问题、牙科治疗项目、门诊/医院信息、医生与接待流程、价格预约、跨境到诊、路线翻译、住宿环境、Telegram 转人工。",
    "2. 不回答编程、金融、政治、色情、赌博、作业考试、新闻天气、普通闲聊、非牙科医疗诊断等无关问题。",
    "3. 不做确定诊断，不开药，不承诺疗效；只能做初步问诊收集和风险提示。",
    "4. 急性疼痛、明显出血、肿胀、流脓、外伤、发热或张口困难时，建议尽快转 Telegram 或线下就诊。",
    "5. 必须使用访客当前语言回复：" + LANGUAGE_NAMES[language] + "。",
    "6. 返回内容必须是 JSON 对象，字段为 reply 和 triage；不要输出 Markdown，不要输出额外解释。",
  ].join("\n");
}

function buildOutputContractPrompt() {
  return [
    "JSON 字段要求：",
    "- reply: 给用户看的直接回复，简洁、礼貌，最多 160 个汉字或等量文本。",
    "- triage.intent: 简短意图，例如 dental_symptom、pricing、appointment、lodging、clinic_visit、out_of_scope。",
    "- triage.urgent: 布尔值。",
    "- triage.recommendedAction: 只能是 continue_ai_consultation、collect_lead、escalate_to_human、refuse_out_of_scope。",
    "- triage.suggestedNextStep: 下一步建议，必须和 reply 使用同一种语言。",
  ].join("\n");
}

function mapHistoryForModel(history: ChatMessageRecord[]) {
  return history.slice(0, -1).slice(-10).map((message) => ({
    role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: message.content,
  }));
}

function buildChatMessages(params: {
  config: AiConfig;
  userMessage: string;
  language: Language;
  history: ChatMessageRecord[];
}) {
  return [
    { role: "system" as const, content: params.config.systemPrompt },
    { role: "system" as const, content: buildHardGuardrailPrompt(params.language) },
    { role: "system" as const, content: params.config.triagePrompt },
    { role: "system" as const, content: params.config.leadPrompt },
    { role: "system" as const, content: buildOutputContractPrompt() },
    ...mapHistoryForModel(params.history),
    {
      role: "user" as const,
      content: [
        `访客语言: ${params.language}`,
        `访客消息: ${params.userMessage}`,
        "请按边界完成初步问诊或拒绝越界问题，并只返回 JSON。",
      ].join("\n"),
    },
  ];
}

function buildChatRequestBody(params: {
  config: AiConfig;
  userMessage: string;
  language: Language;
  history: ChatMessageRecord[];
  structured: boolean;
}) {
  const body: Record<string, unknown> = {
    model: params.config.model,
    temperature: params.config.temperature,
    max_tokens: params.config.maxTokens,
    messages: buildChatMessages(params),
  };

  if (params.structured) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: "dental_consultation_reply",
        strict: true,
        schema: MODEL_REPLY_JSON_SCHEMA,
      },
    };
  }

  return body;
}

function normalizeResponsesEndpoint(endpoint: string) {
  return endpoint.trim().replace(/\/chat\/completions\/?$/, "/responses");
}

function buildResponsesRequestBody(params: {
  config: AiConfig;
  userMessage: string;
  language: Language;
  history: ChatMessageRecord[];
  structured: boolean;
}) {
  const body: Record<string, unknown> = {
    model: params.config.model,
    temperature: params.config.temperature,
    max_output_tokens: params.config.maxTokens,
    instructions: [
      params.config.systemPrompt,
      buildHardGuardrailPrompt(params.language),
      params.config.triagePrompt,
      params.config.leadPrompt,
      buildOutputContractPrompt(),
    ].join("\n\n"),
    input: [
      ...mapHistoryForModel(params.history),
      {
        role: "user",
        content: [
          `访客语言: ${params.language}`,
          `访客消息: ${params.userMessage}`,
          "请按边界完成初步问诊或拒绝越界问题，并只返回 JSON。",
        ].join("\n"),
      },
    ],
  };

  if (params.structured) {
    body.text = {
      format: {
        type: "json_schema",
        name: "dental_consultation_reply",
        strict: true,
        schema: MODEL_REPLY_JSON_SCHEMA,
      },
    };
  }

  return body;
}

async function postJson(params: {
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
    throw new Error(`AI provider error: ${response.status}`);
  }

  return response.json() as Promise<unknown>;
}

function extractChatCompletionText(payload: unknown) {
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

function buildReplyFromModelText(content: string, fallbackTriage: TriageResult, language: Language): ChatReply {
  const parsed = parseModelReply(content, fallbackTriage);

  if (parsed) {
    return {
      assistantMessage: createAssistantMessage(parsed.reply),
      triage: parsed.triage,
    };
  }

  return {
    assistantMessage: createAssistantMessage(content.trim() || localizeClarificationReply(language)),
    triage: fallbackTriage,
  };
}

async function callOpenAiCompatible(params: {
  config: AiConfig;
  userMessage: string;
  language: Language;
  history: ChatMessageRecord[];
}): Promise<ChatReply> {
  const fallbackTriage = inferTriage(params.userMessage, params.language);
  const payload = await postJson({
    endpoint: params.config.endpoint,
    apiKey: params.config.apiKey,
    body: buildChatRequestBody({ ...params, structured: true }),
    fallbackBody: buildChatRequestBody({ ...params, structured: false }),
  });
  return buildReplyFromModelText(extractChatCompletionText(payload), fallbackTriage, params.language);
}

async function callOpenAiResponses(params: {
  config: AiConfig;
  userMessage: string;
  language: Language;
  history: ChatMessageRecord[];
}): Promise<ChatReply> {
  const fallbackTriage = inferTriage(params.userMessage, params.language);
  const endpoint = normalizeResponsesEndpoint(params.config.endpoint);
  const payload = await postJson({
    endpoint,
    apiKey: params.config.apiKey,
    body: buildResponsesRequestBody({ ...params, structured: true }),
    fallbackBody: buildResponsesRequestBody({ ...params, structured: false }),
  });
  return buildReplyFromModelText(extractResponsesText(payload), fallbackTriage, params.language);
}

export async function generateChatReply(params: {
  config: AiConfig;
  userMessage: string;
  language: Language;
  history: ChatMessageRecord[];
}) {
  const scope = classifyTopicScope({
    userMessage: params.userMessage,
    history: params.history,
  });

  if (scope !== "in_scope") {
    return createScopedReply(params.language, scope);
  }

  if (params.config.provider === "mock" || !params.config.apiKey.trim()) {
    return createMockReply(params.config, params.language, params.userMessage);
  }

  try {
    if (params.config.provider === "openai_responses") {
      return await callOpenAiResponses(params);
    }

    return await callOpenAiCompatible(params);
  } catch {
    return createMockReply(params.config, params.language, params.userMessage);
  }
}
