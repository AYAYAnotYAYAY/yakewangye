import { randomUUID } from "node:crypto";
import type { AiConfig, ChatMessageRecord, TriageResult } from "@quanyu/shared";

type Language = "zh" | "ru" | "en";

export type ChatReply = {
  assistantMessage: ChatMessageRecord;
  triage: TriageResult;
};

function inferTriage(message: string): TriageResult {
  const lower = message.toLowerCase();
  const pricing =
    lower.includes("价格") || lower.includes("费用") || lower.includes("price") || lower.includes("cost");
  const urgent =
    lower.includes("疼") ||
    lower.includes("痛") ||
    lower.includes("出血") ||
    lower.includes("bleeding") ||
    lower.includes("swelling");

  return {
    intent: pricing ? "pricing" : "consultation",
    urgent,
    recommendedAction: urgent ? "escalate_to_human" : pricing ? "collect_lead" : "continue_ai_consultation",
    suggestedNextStep: urgent
      ? "建议尽快转 Telegram 或真人医生继续沟通，并补充疼痛程度、持续时间、是否出血。"
      : pricing
        ? "可以继续收集缺牙情况、是否拍片、想做哪类治疗，再引导进入 Telegram。"
        : "继续收集症状、持续时间、既往治疗和是否已有影像资料。",
  };
}

function createMockReply(config: AiConfig, language: Language, userMessage: string): ChatReply {
  const triage = inferTriage(userMessage);
  const content =
    language === "ru"
      ? "Я могу помочь с первичным опросом. Опишите, пожалуйста, боль, длительность, есть ли кровотечение и есть ли снимок. При необходимости я переведу вас на Telegram."
      : language === "en"
        ? "I can help with an initial triage. Please tell me about the pain, duration, whether there is bleeding, and whether you already have an X-ray. If needed, I will guide you to Telegram."
        : `${config.fallbackReply}\n\n当前判断：${triage.urgent ? "存在较高紧急度" : "可继续初步问诊"}。${triage.suggestedNextStep}`;

  return {
    assistantMessage: {
      id: `assistant-${randomUUID()}`,
      role: "assistant",
      content,
      createdAt: new Date().toISOString(),
    },
    triage,
  };
}

async function callOpenAiCompatible(params: {
  config: AiConfig;
  userMessage: string;
  language: Language;
  history: ChatMessageRecord[];
}): Promise<ChatReply> {
  const { config, userMessage, language, history } = params;

  const messages = [
    { role: "system", content: config.systemPrompt },
    { role: "system", content: config.triagePrompt },
    { role: "system", content: config.leadPrompt },
    ...history.slice(-12).map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    })),
    {
      role: "user",
      content: `语言: ${language}\n用户消息: ${userMessage}\n请给出一段直接回复，并兼顾初步分诊与转人工建议。`,
    },
  ];

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI provider error: ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };

  const content =
    payload.choices?.[0]?.message?.content ||
    payload.output?.[0]?.content?.map((item) => item.text ?? "").join("\n") ||
    config.fallbackReply;

  return {
    assistantMessage: {
      id: `assistant-${randomUUID()}`,
      role: "assistant",
      content,
      createdAt: new Date().toISOString(),
    },
    triage: inferTriage(userMessage),
  };
}

export async function generateChatReply(params: {
  config: AiConfig;
  userMessage: string;
  language: Language;
  history: ChatMessageRecord[];
}) {
  const { config } = params;

  if (config.provider === "mock" || !config.apiKey.trim()) {
    return createMockReply(config, params.language, params.userMessage);
  }

  return callOpenAiCompatible(params);
}
