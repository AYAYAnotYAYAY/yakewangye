import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import { cmsContentSchema } from "@quanyu/shared";
import { z } from "zod";
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

const uploadQuerySchema = z.object({
  folderPath: z.string().optional(),
});

const updateAssetSchema = z.object({
  title: z.string().trim().min(1).optional(),
  folderPath: z.string().optional(),
});

const createFolderSchema = z.object({
  name: z.string().trim().min(1),
  parentPath: z.string().optional(),
});

const renameFolderSchema = z.object({
  path: z.string().trim().min(1),
  newName: z.string().trim().min(1),
});

const copyFolderSchema = z.object({
  sourcePath: z.string().trim().min(1),
  targetParentPath: z.string().optional(),
  newName: z.string().trim().min(1),
});

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

function parseAssetId(request: FastifyRequest) {
  const params = request.params as { id?: string };

  if (!params?.id?.trim()) {
    throw new Error("asset_id_required");
  }

  return params.id.trim();
}

async function saveUpload(file: MultipartFile, folderPath = "") {
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
    storageKey: fileName,
    folderPath,
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
      library: await mediaLibraryRepository.getState(),
    };
  });

  app.post("/api/admin/media-library/folders", async (request, reply) => {
    const admin = requireAdmin(request, reply);

    if (!admin || reply.sent) {
      return;
    }

    const parsed = createFolderSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: parsed.error.flatten(),
      });
    }

    try {
      const folder = await mediaLibraryRepository.createFolder(parsed.data);
      return {
        ok: true,
        folder,
        library: await mediaLibraryRepository.getState(),
      };
    } catch (error) {
      if (error instanceof Error && (error.message === "folder_exists" || error.message === "invalid_folder_name")) {
        return reply.status(400).send({
          ok: false,
          error: error.message,
        });
      }

      throw error;
    }
  });

  app.patch("/api/admin/media-library/folders", async (request, reply) => {
    const admin = requireAdmin(request, reply);

    if (!admin || reply.sent) {
      return;
    }

    const parsed = renameFolderSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: parsed.error.flatten(),
      });
    }

    try {
      const library = await mediaLibraryRepository.renameFolder(parsed.data);
      return {
        ok: true,
        library,
      };
    } catch (error) {
      if (error instanceof Error && ["folder_exists", "folder_not_found", "invalid_folder_name", "root_folder_not_supported"].includes(error.message)) {
        return reply.status(400).send({
          ok: false,
          error: error.message,
        });
      }

      throw error;
    }
  });

  app.post("/api/admin/media-library/folders/copy", async (request, reply) => {
    const admin = requireAdmin(request, reply);

    if (!admin || reply.sent) {
      return;
    }

    const parsed = copyFolderSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: parsed.error.flatten(),
      });
    }

    try {
      const library = await mediaLibraryRepository.copyFolder(parsed.data);
      return {
        ok: true,
        library,
      };
    } catch (error) {
      if (error instanceof Error && ["folder_exists", "folder_not_found", "invalid_folder_name", "root_folder_not_supported"].includes(error.message)) {
        return reply.status(400).send({
          ok: false,
          error: error.message,
        });
      }

      throw error;
    }
  });

  app.patch("/api/admin/media-library/assets/:id", async (request, reply) => {
    const admin = requireAdmin(request, reply);

    if (!admin || reply.sent) {
      return;
    }

    const parsed = updateAssetSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: parsed.error.flatten(),
      });
    }

    try {
      const asset = await mediaLibraryRepository.updateAsset({
        id: parseAssetId(request),
        ...parsed.data,
      });
      return {
        ok: true,
        asset,
        library: await mediaLibraryRepository.getState(),
      };
    } catch (error) {
      if (error instanceof Error && ["asset_not_found", "folder_not_found", "invalid_asset_title"].includes(error.message)) {
        return reply.status(400).send({
          ok: false,
          error: error.message,
        });
      }

      throw error;
    }
  });

  app.delete("/api/admin/media-library/assets/:id", async (request, reply) => {
    const admin = requireAdmin(request, reply);

    if (!admin || reply.sent) {
      return;
    }

    try {
      await mediaLibraryRepository.deleteAsset(parseAssetId(request));
      return {
        ok: true,
        library: await mediaLibraryRepository.getState(),
      };
    } catch (error) {
      if (error instanceof Error && error.message === "asset_not_found") {
        return reply.status(404).send({
          ok: false,
          error: error.message,
        });
      }

      throw error;
    }
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
      const parsedQuery = uploadQuerySchema.safeParse(request.query);

      if (!parsedQuery.success) {
        return reply.status(400).send({
          ok: false,
          error: parsedQuery.error.flatten(),
        });
      }

      const saved = await saveUpload(file, parsedQuery.data.folderPath ?? "");
      return {
        ok: true,
        ...saved,
        library: await mediaLibraryRepository.getState(),
      };
    } catch (error) {
      if (error instanceof Error && (error.message === "unsupported_media_type" || error.message === "folder_not_found")) {
        return reply.status(400).send({
          ok: false,
          error: error.message === "folder_not_found" ? "folder_not_found" : "Only image and video uploads are supported",
        });
      }

      throw error;
    }
  }

  app.post("/api/admin/upload", handleUpload);
  app.post("/api/admin/media-library/upload", handleUpload);
}
