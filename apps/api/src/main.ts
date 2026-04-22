import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { registerAnalyticsRoutes } from "./modules/analytics/routes";
import { registerAdminRoutes } from "./modules/admin/routes";
import { registerChatRoutes } from "./modules/chat/routes";
import { registerContentRoutes } from "./modules/content/routes";
import { registerHealthRoutes } from "./modules/health/routes";
import { registerTelegramRoutes } from "./modules/telegram/routes";
import { getUploadsDir } from "./lib/content-store";
import { ensureAllLocalStorage } from "./lib/storage/storage-paths";

async function bootstrap() {
  await ensureAllLocalStorage();
  const uploadMaxFileSizeMb = Math.max(10, Number(process.env.UPLOAD_MAX_FILE_SIZE_MB ?? 1024) || 1024);
  const uploadChunkSizeMb = Math.max(1, Number(process.env.UPLOAD_CHUNK_SIZE_MB ?? 8) || 8);

  const app = Fastify({
    logger: true,
    bodyLimit: uploadMaxFileSizeMb * 1024 * 1024,
  });

  await app.register(cors, {
    origin: true,
  });

  await app.register(multipart, {
    limits: {
      fileSize: uploadMaxFileSizeMb * 1024 * 1024,
    },
  });

  app.addContentTypeParser(
    "application/octet-stream",
    {
      parseAs: "buffer",
      bodyLimit: uploadChunkSizeMb * 1024 * 1024,
    },
    (_request, body, done) => {
      done(null, body);
    },
  );

  await app.register(fastifyStatic, {
    root: getUploadsDir(),
    prefix: "/uploads/",
  });

  await registerHealthRoutes(app);
  await registerAdminRoutes(app);
  await registerContentRoutes(app);
  await registerAnalyticsRoutes(app);
  await registerChatRoutes(app);
  await registerTelegramRoutes(app);

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen({
    host: "0.0.0.0",
    port,
  });
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
