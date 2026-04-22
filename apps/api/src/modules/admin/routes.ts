import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
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
import { mediaLibraryRepository } from "../../lib/storage/media-library-repository";
import { ensureUploadsStorage } from "../../lib/storage/storage-paths";

function resolveMediaType(mimeType: string | undefined): "image" | "video" | null {
  if (!mimeType) {
    return null;
  }

  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  return null;
}

async function saveUpload(file: MultipartFile) {
  const mediaType = resolveMediaType(file.mimetype);

  if (!mediaType) {
    throw new Error("unsupported_media_type");
  }

  const uploadsDir = getUploadsDir();
  await ensureUploadsStorage();
  await mkdir(uploadsDir, { recursive: true });
  const ext = path.extname(file.filename || "") || ".bin";
  const fileName = `${Date.now()}-${randomUUID()}${ext}`;
  const filePath = path.join(uploadsDir, fileName);
  const buffer = await file.toBuffer();
  await writeFile(filePath, buffer);
  const url = `/uploads/${fileName}`;
  const asset = await mediaLibraryRepository.add({
    title: file.filename || fileName,
    fileName,
    url,
    mediaType,
    mimeType: file.mimetype || (mediaType === "video" ? "video/mp4" : "image/jpeg"),
    size: buffer.byteLength,
  });

  return {
    url,
    fileName,
    asset,
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

  app.get("/api/admin/media-library", async (request, reply) => {
    const admin = requireAdmin(request, reply);

    if (!admin || reply.sent) {
      return;
    }

    return {
      ok: true,
      items: await mediaLibraryRepository.list(),
    };
  });

  async function handleUpload(request: FastifyRequest, reply: FastifyReply) {
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

    try {
      const saved = await saveUpload(file);
      return {
        ok: true,
        ...saved,
      };
    } catch (error) {
      if (error instanceof Error && error.message === "unsupported_media_type") {
        return reply.status(400).send({
          ok: false,
          error: "Only image and video uploads are supported",
        });
      }

      throw error;
    }
  }

  app.post("/api/admin/upload", handleUpload);
  app.post("/api/admin/media-library/upload", handleUpload);
}
