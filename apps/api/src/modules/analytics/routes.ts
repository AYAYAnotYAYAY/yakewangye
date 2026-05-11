import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { visitorLogRepository } from "../../lib/storage/visitor-log-repository";
import { requireAdmin } from "../../lib/auth";
import { z } from "zod";

const analyticsEventSchema = z.object({
  sessionId: z.string().min(1),
  visitorId: z.string().min(1),
  eventName: z.string().min(1),
  pageUrl: z.string().min(1),
  pageTitle: z.string().optional(),
  referrer: z.string().optional(),
  searchEngine: z.string().optional(),
  dwellTimeMs: z.number().int().nonnegative().optional(),
  language: z.enum(["zh", "ru", "en"]).optional(),
  viewport: z
    .object({
      width: z.number().int().nonnegative(),
      height: z.number().int().nonnegative(),
    })
    .optional(),
  screen: z
    .object({
      width: z.number().int().nonnegative(),
      height: z.number().int().nonnegative(),
    })
    .optional(),
  timezone: z.string().optional(),
  extra: z.record(z.unknown()).optional(),
});

function getHeaderValue(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function getClientIp(request: FastifyRequest) {
  const forwardedFor = getHeaderValue(request, "x-forwarded-for");
  const realIp = getHeaderValue(request, "x-real-ip");
  const cfIp = getHeaderValue(request, "cf-connecting-ip");
  return cfIp || realIp || forwardedFor?.split(",")[0]?.trim() || request.ip || "unknown";
}

function getGeoValue(request: FastifyRequest, names: string[]) {
  for (const name of names) {
    const value = getHeaderValue(request, name);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function parsePagePath(pageUrl: string) {
  try {
    return new URL(pageUrl).pathname || "/";
  } catch {
    return pageUrl.split("?")[0] || "/";
  }
}

function detectBrowser(userAgent: string) {
  if (/Edg\//i.test(userAgent)) return "Edge";
  if (/OPR\//i.test(userAgent)) return "Opera";
  if (/Chrome\//i.test(userAgent) && !/Chromium/i.test(userAgent)) return "Chrome";
  if (/Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent)) return "Safari";
  if (/Firefox\//i.test(userAgent)) return "Firefox";
  if (/MSIE|Trident/i.test(userAgent)) return "Internet Explorer";
  return "unknown";
}

function detectOs(userAgent: string) {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Windows NT/i.test(userAgent)) return "Windows";
  if (/Mac OS X/i.test(userAgent)) return "macOS";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "unknown";
}

function detectDeviceType(userAgent: string) {
  if (/iPad|Tablet|PlayBook/i.test(userAgent)) return "tablet";
  if (/Mobile|iPhone|Android/i.test(userAgent)) return "mobile";
  return "desktop";
}

function detectDeviceModel(userAgent: string) {
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";
  const androidModel = userAgent.match(/Android [^;]+;\s*([^;)]+)\)/i)?.[1]?.trim();
  if (androidModel) return androidModel.replace(/\s+Build\/.*$/i, "").trim();
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "Mac";
  if (/Windows NT/i.test(userAgent)) return "Windows PC";
  if (/Linux/i.test(userAgent)) return "Linux PC";
  return "unknown";
}

const visitorLogQuerySchema = z.object({
  ip: z.string().optional(),
  browser: z.string().optional(),
  deviceType: z.string().optional(),
  deviceModel: z.string().optional(),
  os: z.string().optional(),
  pagePath: z.string().optional(),
  visitorId: z.string().optional(),
  query: z.string().optional(),
});

export async function registerAnalyticsRoutes(app: FastifyInstance) {
  app.post("/api/analytics/events", async (request, reply) => {
    const parsed = analyticsEventSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: parsed.error.flatten(),
      });
    }

    const userAgent = getHeaderValue(request, "user-agent") || "unknown";
    const eventName = parsed.data.eventName === "page_start" ? "page_view" : parsed.data.eventName;
    const saved = await visitorLogRepository.append({
      id: `visit-${randomUUID()}`,
      ...parsed.data,
      eventName,
      pagePath: parsePagePath(parsed.data.pageUrl),
      ip: getClientIp(request),
      country: getGeoValue(request, ["cf-ipcountry", "x-vercel-ip-country", "x-country-code", "cloudfront-viewer-country"]),
      region: getGeoValue(request, ["x-vercel-ip-country-region", "x-region", "cloudfront-viewer-country-region"]),
      city: getGeoValue(request, ["x-vercel-ip-city", "x-city", "cloudfront-viewer-city"]),
      userAgent,
      deviceType: detectDeviceType(userAgent),
      deviceModel: detectDeviceModel(userAgent),
      os: detectOs(userAgent),
      browser: detectBrowser(userAgent),
      createdAt: new Date().toISOString(),
    });

    return {
      ok: true,
      id: saved.id,
    };
  });

  app.get("/api/admin/visitor-logs", async (request, reply) => {
    const admin = requireAdmin(request, reply);

    if (!admin || reply.sent) {
      return;
    }

    const parsed = visitorLogQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: parsed.error.flatten(),
      });
    }

    return visitorLogRepository.dashboard(parsed.data);
  });
}
