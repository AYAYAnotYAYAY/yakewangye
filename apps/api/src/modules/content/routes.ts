import type { FastifyInstance } from "fastify";
import { siteMetadata } from "@quanyu/shared";
import { readContent } from "../../lib/content-store";

export async function registerContentRoutes(app: FastifyInstance) {
  app.get("/api/content/site", async () => {
    const content = await readContent();
    return {
    metadata: siteMetadata,
      settings: content.siteSettings,
    };
  });

  app.get("/api/content", async () => readContent());

  app.get("/api/content/pages/home", async () => {
    const content = await readContent();
    return content.homePage;
  });
}
