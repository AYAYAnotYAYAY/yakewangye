import type { FastifyInstance } from "fastify";
import { z } from "zod";

const analyticsEventSchema = z.object({
  sessionId: z.string().min(1),
  visitorId: z.string().min(1),
  eventName: z.string().min(1),
  pageUrl: z.string().min(1),
  referrer: z.string().optional(),
  searchEngine: z.string().optional(),
  dwellTimeMs: z.number().int().nonnegative().optional(),
  deviceType: z.string().optional(),
  os: z.string().optional(),
  browser: z.string().optional(),
  ip: z.string().optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  extra: z.record(z.unknown()).optional(),
});

const demoEvents: Array<z.infer<typeof analyticsEventSchema>> = [];

export async function registerAnalyticsRoutes(app: FastifyInstance) {
  app.post("/api/analytics/events", async (request, reply) => {
    const parsed = analyticsEventSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: parsed.error.flatten(),
      });
    }

    demoEvents.push(parsed.data);

    return {
      ok: true,
      count: demoEvents.length,
    };
  });

  app.get("/api/analytics/dashboard", async () => ({
    summary: {
      totalSessions: 128,
      aiStarts: 43,
      telegramClicks: 19,
      averageDurationSec: 186,
    },
    dimensions: {
      topSources: [
        { source: "google", sessions: 42 },
        { source: "yandex", sessions: 35 },
        { source: "direct", sessions: 24 },
      ],
      topRegions: [
        { region: "Amur Oblast", sessions: 31 },
        { region: "Heilongjiang", sessions: 25 },
        { region: "Moscow", sessions: 16 },
      ],
    },
    storagePlan:
      "当前为内存占位实现。下一阶段切换 PostgreSQL 业务库 + ClickHouse 或 PostgreSQL 分析表。",
  }));
}
