import type { FastifyInstance, FastifyRequest } from "fastify";
import { languageSchema, type Language } from "@quanyu/shared";

const countryToLanguage: Record<string, Language> = {
  CN: "zh",
  HK: "zh",
  MO: "zh",
  TW: "zh",
  SG: "zh",
  RU: "ru",
  BY: "ru",
  KZ: "ru",
  KG: "ru",
  AM: "ru",
  AZ: "ru",
  UZ: "ru",
  TJ: "ru",
};

function normalizeLanguage(input: string | undefined): Language | null {
  if (!input) return null;

  const lower = input.toLowerCase();
  if (lower.startsWith("zh")) return "zh";
  if (lower.startsWith("ru")) return "ru";
  if (lower.startsWith("en")) return "en";
  return null;
}

function getCountryFromHeaders(request: FastifyRequest) {
  const candidates = [
    request.headers["cf-ipcountry"],
    request.headers["x-vercel-ip-country"],
    request.headers["x-country-code"],
    request.headers["cloudfront-viewer-country"],
  ];

  for (const value of candidates) {
    const country = Array.isArray(value) ? value[0] : value;
    if (country && typeof country === "string" && country.trim().length === 2) {
      return country.trim().toUpperCase();
    }
  }

  return "";
}

function detectPreferredLanguage(request: FastifyRequest): Language {
  const country = getCountryFromHeaders(request);
  if (country && countryToLanguage[country]) {
    return countryToLanguage[country];
  }

  const acceptLanguage = request.headers["accept-language"];
  const header = Array.isArray(acceptLanguage) ? acceptLanguage[0] : acceptLanguage;
  const parts = (header ?? "").split(",");

  for (const part of parts) {
    const parsed = normalizeLanguage(part.split(";")[0]?.trim());
    if (parsed) {
      return parsed;
    }
  }

  return "zh";
}

export async function registerLocaleRoutes(app: FastifyInstance) {
  app.get("/api/locale/detect", async (request) => {
    const preferredLanguage = detectPreferredLanguage(request);

    return {
      ok: true,
      preferredLanguage: languageSchema.parse(preferredLanguage),
      country: getCountryFromHeaders(request) || null,
      source: getCountryFromHeaders(request) ? "country_header" : "accept_language",
    };
  });
}
