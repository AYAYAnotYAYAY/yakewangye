import type { FastifyInstance } from "fastify";
import { z } from "zod";

const telegramLeadSchema = z.object({
  sessionId: z.string().min(1),
  language: z.enum(["zh", "ru", "en"]),
  summary: z.string().min(1),
  priority: z.enum(["low", "medium", "high"]),
  telegramHandle: z.string().optional(),
});

export async function registerTelegramRoutes(app: FastifyInstance) {
  app.post("/api/telegram/leads", async (request, reply) => {
    const parsed = telegramLeadSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: parsed.error.flatten(),
      });
    }

    return {
      ok: true,
      message:
        "已完成 Telegram lead 接口占位。下一阶段接 Bot Token、群组推送和人工接管流程。",
      lead: parsed.data,
    };
  });
}
