import type { TelegramConfig, TriageResult } from "@quanyu/shared";

function renderTemplate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (current, [key, value]) => current.replaceAll(`{{${key}}}`, value),
    template,
  );
}

export async function sendTelegramLead(params: {
  config: TelegramConfig;
  sessionId: string;
  visitorId: string;
  userMessage: string;
  triage: TriageResult;
}) {
  const { config, sessionId, visitorId, userMessage, triage } = params;

  if (!config.enabled || !config.botToken.trim() || !config.chatId.trim()) {
    return {
      ok: false,
      skipped: true,
      reason: "telegram_not_configured",
    };
  }

  const text = renderTemplate(config.handoffTemplate, {
    sessionId,
    visitorId,
    intent: triage.intent,
    urgent: triage.urgent ? "是" : "否",
    message: userMessage,
    recommendedAction: triage.recommendedAction,
    suggestedNextStep: triage.suggestedNextStep,
  });

  const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: config.chatId,
      text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Telegram API error: ${response.status}`);
  }

  return {
    ok: true,
    skipped: false,
  };
}
