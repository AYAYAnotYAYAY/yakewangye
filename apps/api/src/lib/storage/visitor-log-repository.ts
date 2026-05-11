import { readFile, writeFile } from "node:fs/promises";
import { visitorLogEventSchema, type VisitorLogDashboard, type VisitorLogEvent } from "@quanyu/shared";
import { ensureVisitorLogStorage, getLocalStoragePaths } from "./storage-paths";

const MAX_VISITOR_LOG_EVENTS = Math.max(100, Number(process.env.VISITOR_LOG_MAX_EVENTS ?? 5000) || 5000);

type VisitorLogRepository = {
  append: (event: VisitorLogEvent) => Promise<VisitorLogEvent>;
  list: () => Promise<VisitorLogEvent[]>;
  dashboard: (filters?: VisitorLogFilters) => Promise<VisitorLogDashboard>;
};

type VisitorLogFilters = {
  ip?: string;
  browser?: string;
  deviceType?: string;
  deviceModel?: string;
  os?: string;
  pagePath?: string;
  visitorId?: string;
  query?: string;
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

function uniqueSorted(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 300);
}

function matchesFilter(value: string | undefined, filter: string | undefined) {
  return !filter || value === filter;
}

function filterEvents(events: VisitorLogEvent[], filters: VisitorLogFilters | undefined) {
  const query = filters?.query?.trim().toLowerCase();

  return events.filter((event) => {
    if (!matchesFilter(event.ip, filters?.ip)) return false;
    if (!matchesFilter(event.browser, filters?.browser)) return false;
    if (!matchesFilter(event.deviceType, filters?.deviceType)) return false;
    if (!matchesFilter(event.deviceModel, filters?.deviceModel)) return false;
    if (!matchesFilter(event.os, filters?.os)) return false;
    if (!matchesFilter(event.pagePath, filters?.pagePath)) return false;
    if (!matchesFilter(event.visitorId, filters?.visitorId)) return false;

    if (!query) {
      return true;
    }

    return [
      event.ip,
      event.visitorId,
      event.sessionId,
      event.pagePath,
      event.pageTitle,
      event.pageUrl,
      event.browser,
      event.os,
      event.deviceType,
      event.deviceModel,
      event.userAgent,
      event.referrer,
      event.country,
      event.region,
      event.city,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function buildIpGroups(events: VisitorLogEvent[]) {
  const groups = new Map<string, VisitorLogEvent[]>();

  for (const event of events) {
    const group = groups.get(event.ip) ?? [];
    group.push(event);
    groups.set(event.ip, group);
  }

  return [...groups.entries()]
    .map(([ip, group]) => ({
      ip,
      events: group.length,
      sessions: new Set(group.map((event) => event.sessionId)).size,
      visitors: new Set(group.map((event) => event.visitorId)).size,
      pageViews: group.filter((event) => event.eventName === "page_view").length,
      latestAt: group.map((event) => event.createdAt).sort((left, right) => right.localeCompare(left))[0] ?? "",
      browsers: uniqueSorted(group.map((event) => event.browser)).slice(0, 6),
      deviceTypes: uniqueSorted(group.map((event) => event.deviceType)).slice(0, 6),
      deviceModels: uniqueSorted(group.map((event) => event.deviceModel)).slice(0, 6),
    }))
    .sort((left, right) => right.latestAt.localeCompare(left.latestAt) || right.events - left.events)
    .slice(0, 80);
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
    async dashboard(filters) {
      return runExclusive(async () => {
        const events = await readEvents();
        const filteredEvents = filterEvents(events, filters);
        const sorted = [...filteredEvents].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        const visitorIds = new Set(filteredEvents.map((event) => event.visitorId));
        const sessionIds = new Set(filteredEvents.map((event) => event.sessionId));
        const pageViewEvents = filteredEvents.filter((event) => event.eventName === "page_view");
        const dwellValues = filteredEvents
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
          totalEvents: filteredEvents.length,
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
          topReferrers: topEntries(countBy(filteredEvents.map((event) => event.referrer || "direct")), 8).map(([referrer, visits]) => ({
            referrer,
            visits,
          })),
          topBrowsers: topEntries(countBy(filteredEvents.map((event) => event.browser || "unknown")), 8).map(([browser, sessions]) => ({
            browser,
            sessions,
          })),
          topIps: buildIpGroups(filteredEvents),
          filterOptions: {
            ips: uniqueSorted(events.map((event) => event.ip)),
            browsers: uniqueSorted(events.map((event) => event.browser || "unknown")),
            deviceTypes: uniqueSorted(events.map((event) => event.deviceType || "unknown")),
            deviceModels: uniqueSorted(events.map((event) => event.deviceModel || "unknown")),
            os: uniqueSorted(events.map((event) => event.os || "unknown")),
            pagePaths: uniqueSorted(events.map((event) => event.pagePath || "/")),
          },
          recentEvents: sorted.slice(0, 120),
        };
      });
    },
  };
}

export const visitorLogRepository = createJsonVisitorLogRepository();
