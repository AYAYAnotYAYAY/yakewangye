import { readFile, writeFile } from "node:fs/promises";
import { visitorLogEventSchema, type VisitorLogDashboard, type VisitorLogEvent } from "@quanyu/shared";
import { ensureVisitorLogStorage, getLocalStoragePaths } from "./storage-paths";

const MAX_VISITOR_LOG_EVENTS = Math.max(100, Number(process.env.VISITOR_LOG_MAX_EVENTS ?? 5000) || 5000);

type VisitorLogRepository = {
  append: (event: VisitorLogEvent) => Promise<VisitorLogEvent>;
  list: () => Promise<VisitorLogEvent[]>;
  dashboard: () => Promise<VisitorLogDashboard>;
};

function countBy<T extends string>(values: T[]) {
  const counts = new Map<T, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return counts;
}

function topEntries<T extends string>(counts: Map<T, number>, limit: number) {
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit);
}

function createJsonVisitorLogRepository(): VisitorLogRepository {
  const { visitorLogsFilePath } = getLocalStoragePaths();
  let operationQueue: Promise<void> = Promise.resolve();

  function runExclusive<T>(operation: () => Promise<T>) {
    const result = operationQueue.then(operation, operation);
    operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async function readEvents() {
    await ensureVisitorLogStorage();
    const raw = await readFile(visitorLogsFilePath, "utf8");
    const parsed = JSON.parse(raw) as unknown[];
    return parsed.map((item) => visitorLogEventSchema.parse(item));
  }

  async function writeEvents(events: VisitorLogEvent[]) {
    await ensureVisitorLogStorage();
    await writeFile(visitorLogsFilePath, JSON.stringify(events, null, 2), "utf8");
  }

  return {
    async append(event) {
      return runExclusive(async () => {
        const events = await readEvents();
        events.push(event);
        const trimmed = events.slice(-MAX_VISITOR_LOG_EVENTS);
        await writeEvents(trimmed);
        return event;
      });
    },
    async list() {
      return runExclusive(() => readEvents());
    },
    async dashboard() {
      return runExclusive(async () => {
        const events = await readEvents();
        const sorted = [...events].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        const visitorIds = new Set(events.map((event) => event.visitorId));
        const sessionIds = new Set(events.map((event) => event.sessionId));
        const pageViewEvents = events.filter((event) => event.eventName === "page_view");
        const dwellValues = events
          .map((event) => event.dwellTimeMs)
          .filter((value): value is number => typeof value === "number" && value > 0);
        const averageDwellSec = dwellValues.length
          ? Math.round((dwellValues.reduce((sum, value) => sum + value, 0) / dwellValues.length / 1000) * 10) / 10
          : 0;

        const latestSessionDevice = new Map<string, string>();

        for (const event of sorted) {
          if (!latestSessionDevice.has(event.sessionId)) {
            latestSessionDevice.set(event.sessionId, event.deviceType);
          }
        }

        const deviceValues = [...latestSessionDevice.values()];

        return {
          summary: {
            totalEvents: events.length,
            totalVisitors: visitorIds.size,
            totalSessions: sessionIds.size,
            pageViews: pageViewEvents.length,
            averageDwellSec,
            mobileSessions: deviceValues.filter((value) => value === "mobile").length,
            desktopSessions: deviceValues.filter((value) => value === "desktop").length,
            tabletSessions: deviceValues.filter((value) => value === "tablet").length,
          },
          topPages: topEntries(countBy(pageViewEvents.map((event) => event.pagePath)), 8).map(([pagePath, views]) => ({
            pagePath,
            views,
          })),
          topReferrers: topEntries(countBy(events.map((event) => event.referrer || "direct")), 8).map(([referrer, visits]) => ({
            referrer,
            visits,
          })),
          topBrowsers: topEntries(countBy(events.map((event) => event.browser || "unknown")), 8).map(([browser, sessions]) => ({
            browser,
            sessions,
          })),
          recentEvents: sorted.slice(0, 120),
        };
      });
    },
  };
}

export const visitorLogRepository = createJsonVisitorLogRepository();
