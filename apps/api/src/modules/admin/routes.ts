import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import { cmsContentSchema } from "@quanyu/shared";
import {
  getAdminStatus,
  initializeAdminCredentials,
  issueAdminToken,
  parseAdminLogin,
  parseAdminSetup,
  requireAdmin,
  validateAdminCredentials,
} from "../../lib/auth";
import { getUploadsDir, readContent, writeContent } from "../../lib/content-store";

async function saveUpload(file: MultipartFile) {
  const uploadsDir = getUploadsDir();
  await mkdir(uploadsDir, { recursive: true });
  const ext = path.extname(file.filename || "") || ".bin";
  const fileName = `${Date.now()}-${randomUUID()}${ext}`;
  const filePath = path.join(uploadsDir, fileName);
  const buffer = await file.toBuffer();
  await writeFile(filePath, buffer);
  return {
    url: `/uploads/${fileName}`,
    fileName,
  };
}

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get("/api/admin/status", async () => getAdminStatus());

  app.post("/api/admin/setup", async (request, reply) => {
    const parsed = parseAdminSetup(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: parsed.error.flatten(),
      });
    }

    const result = await initializeAdminCredentials(parsed.data.username, parsed.data.password);

    if (!result.ok) {
      return reply.status(409).send({
        ok: false,
        error: result.reason,
      });
    }

    return {
      ok: true,
      token: issueAdminToken(result.username),
      user: {
        username: result.username,
      },
    };
  });

  app.post("/api/admin/login", async (request, reply) => {
    const parsed = parseAdminLogin(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: parsed.error.flatten(),
      });
    }

    const validation = await validateAdminCredentials(parsed.data.username, parsed.data.password);

    if (!validation.ok) {
      return reply.status(validation.reason === "setup_required" ? 409 : 401).send({
        ok: false,
        error: validation.reason,
      });
    }

    return {
      ok: true,
      token: issueAdminToken(validation.username),
      user: {
        username: validation.username,
      },
    };
  });

  app.get("/api/admin/me", async (request, reply) => {
    const admin = requireAdmin(request, reply);

    if (!admin || reply.sent) {
      return;
    }

    return {
      ok: true,
      user: {
        username: admin.username,
      },
    };
  });

  app.get("/api/admin/content", async (request, reply) => {
    const admin = requireAdmin(request, reply);

    if (!admin || reply.sent) {
      return;
    }

    return readContent();
  });

  app.put("/api/admin/content", async (request, reply) => {
    const admin = requireAdmin(request, reply);

    if (!admin || reply.sent) {
      return;
    }

    const parsed = cmsContentSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: parsed.error.flatten(),
      });
    }

    const content = await writeContent(parsed.data);
    return {
      ok: true,
      content,
    };
  });

  app.post("/api/admin/upload", async (request, reply) => {
    const admin = requireAdmin(request, reply);

    if (!admin || reply.sent) {
      return;
    }

    const file = await request.file();

    if (!file) {
      return reply.status(400).send({
        ok: false,
        error: "No file uploaded",
      });
    }

    const saved = await saveUpload(file);
    return {
      ok: true,
      ...saved,
    };
  });
}
