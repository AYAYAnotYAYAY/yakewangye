import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { readContent } from "../../lib/content-store";
import { appendChatMessage, getOrCreateChatSession, listChatSessions, updateChatTriage } from "../../lib/chat-store";
import { generateChatReply } from "../../lib/ai-gateway";
import { sendTelegramLead } from "../../lib/telegram-gateway";
import { requireAdmin } from "../../lib/auth";
import { z } from "zod";

const CHAT_MESSAGE_MAX_LENGTH = 1200;
const CHAT_RATE_LIMIT_WINDOW_MS = 60_000;
const CHAT_RATE_LIMIT_MAX_MESSAGES = 12;
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

const chatMessageSchema = z.object({
  sessionId: z.string().min(1),
  visitorId: z.string().min(1).default("anonymous"),
  language: z.enum(["zh", "ru", "en"]).default("zh"),
  message: z.string().trim().min(1).max(CHAT_MESSAGE_MAX_LENGTH),
});

function getClientIp(request: FastifyRequest) {
  const forwardedFor = request.headers["x-forwarded-for"];
  const raw = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  return raw?.split(",")[0]?.trim() || request.ip || "unknown";
}

function consumeChatRateLimit(key: string) {
  const now = Date.now();
  const current = rateLimitBuckets.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + CHAT_RATE_LIMIT_WINDOW_MS,
    });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= CHAT_RATE_LIMIT_MAX_MESSAGES) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000),
    };
  }

  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

function pruneRateLimitBuckets() {
  if (rateLimitBuckets.size < 1000) {
    return;
  }

  const now = Date.now();

  for (const [key, value] of rateLimitBuckets.entries()) {
    if (value.resetAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }
}

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

    pruneRateLimitBuckets();
    const rateLimit = consumeChatRateLimit(`${getClientIp(request)}:${parsed.data.visitorId}`);

    if (!rateLimit.allowed) {
      return reply
        .header("Retry-After", String(rateLimit.retryAfterSeconds))
        .status(429)
        .send({
          ok: false,
          error: "chat_rate_limited",
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
