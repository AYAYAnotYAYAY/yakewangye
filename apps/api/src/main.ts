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

async function bootstrap() {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    origin: true,
  });

  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
  });

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
