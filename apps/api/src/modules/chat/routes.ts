import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { readContent } from "../../lib/content-store";
import { appendChatMessage, getOrCreateChatSession, listChatSessions, updateChatTriage } from "../../lib/chat-store";
import { generateChatReply } from "../../lib/ai-gateway";
import { sendTelegramLead } from "../../lib/telegram-gateway";
import { requireAdmin } from "../../lib/auth";
import { z } from "zod";

const chatMessageSchema = z.object({
  sessionId: z.string().min(1),
  visitorId: z.string().min(1).default("anonymous"),
  language: z.enum(["zh", "ru", "en"]).default("zh"),
  message: z.string().min(1),
});

export async function registerChatRoutes(app: FastifyInstance) {
  app.get("/api/chat/sessions", async (request, reply) => {
    const admin = requireAdmin(request, reply);

    if (!admin || reply.sent) {
      return;
    }

    return listChatSessions();
  });

  app.post("/api/chat/triage", async (request, reply) => {
    const parsed = chatMessageSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: parsed.error.flatten(),
      });
    }

    const { aiConfig, telegramConfig } = await readContent();
    const session = await getOrCreateChatSession({
      sessionId: parsed.data.sessionId,
      language: parsed.data.language,
      visitorId: parsed.data.visitorId,
    });

    const userMessage = {
      id: `user-${randomUUID()}`,
      role: "user" as const,
      content: parsed.data.message,
      createdAt: new Date().toISOString(),
    };

    await appendChatMessage(session.sessionId, userMessage);

    const replyPayload = await generateChatReply({
      config: aiConfig,
      userMessage: parsed.data.message,
      language: parsed.data.language,
      history: [...session.messages, userMessage],
    });

    await appendChatMessage(session.sessionId, replyPayload.assistantMessage);
    await updateChatTriage(session.sessionId, replyPayload.triage);

    let telegram: { ok: boolean; skipped: boolean; reason: string } = {
      ok: false,
      skipped: true,
      reason: "not_needed",
    };

    if (
      replyPayload.triage.recommendedAction === "escalate_to_human" ||
      replyPayload.triage.recommendedAction === "collect_lead"
    ) {
      try {
        telegram = await sendTelegramLead({
          config: telegramConfig,
          sessionId: session.sessionId,
          visitorId: session.visitorId,
          userMessage: parsed.data.message,
          triage: replyPayload.triage,
        }).then((result) => ({
          ok: result.ok,
          skipped: result.skipped,
          reason: result.skipped ? "telegram_not_configured" : "sent",
        }));
      } catch (error) {
        telegram = {
          ok: false,
          skipped: false,
          reason: String(error),
        };
      }
    }

    return {
      ok: true,
      sessionId: parsed.data.sessionId,
      assistantMessage: replyPayload.assistantMessage,
      triage: replyPayload.triage,
      telegram,
    };
  });
}
