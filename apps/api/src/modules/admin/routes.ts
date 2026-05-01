import { mkdir, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import { aiConfigSchema, cmsContentSchema } from "@quanyu/shared";
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
import { generateWebsiteDraft } from "../../lib/admin-ai-gateway";
import { testAiProviderConnection } from "../../lib/ai-gateway";
import { mediaLibraryRepository } from "../../lib/storage/media-library-repository";
import {
  restoreAiCopyPackage,
  restoreBackupBundle,
  serializeAiCopyPackageBundle,
  serializeBackupBundle,
} from "../../lib/storage/backup-repository";
import { ensureUploadsStorage, inferMimeTypeFromFileName } from "../../lib/storage/storage-paths";
import { UploadOffsetMismatchError, uploadSessionRepository } from "../../lib/storage/upload-session-repository";

const UPLOAD_MAX_FILE_SIZE_MB = Math.max(10, Number(process.env.UPLOAD_MAX_FILE_SIZE_MB ?? 1024) || 1024);

const uploadQuerySchema = z.object({
  folderPath: z.string().optional(),
});

const uploadSessionCreateSchema = z.object({
  fileName: z.string().trim().min(1),
  fileSize: z.number().int().positive().max(UPLOAD_MAX_FILE_SIZE_MB * 1024 * 1024),
  mimeType: z.string().optional(),
  folderPath: z.string().optional(),
});

const uploadChunkQuerySchema = z.object({
  offset: z.coerce.number().int().min(0),
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

const aiWebsiteDraftSchema = z.object({
  instruction: z.string().trim().min(1).max(2000),
  language: z.enum(["zh", "ru", "en"]).default("zh"),
});

const aiConfigTestSchema = z.object({
  config: aiConfigSchema,
});

const supportedImageExtensions = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif", ".heic", ".heif"]);
const supportedVideoExtensions = new Set([".mp4", ".mov", ".m4v", ".webm", ".ogg", ".ogv"]);

function resolveMediaType(mimeType: string | undefined): "image" | "video" | null {
  const normalized = mimeType?.trim().toLowerCase();

  if (normalized && normalized !== "application/octet-stream") {
    if (normalized.startsWith("image/")) {
      return "image";
    }

    if (normalized.startsWith("video/")) {
      return "video";
    }
  }

  return null;
}

function resolveMediaTypeFromUpload(mimeType: string | undefined, fileName: string | undefined): "image" | "video" | null {
  const byMime = resolveMediaType(mimeType);

  if (byMime) {
    return byMime;
  }

  const ext = path.extname(fileName ?? "").toLowerCase();

  if (supportedImageExtensions.has(ext)) {
    return "image";
  }

  if (supportedVideoExtensions.has(ext)) {
    return "video";
  }

  return null;
}

function resolveUploadMimeType(mimeType: string | undefined, fileName: string | undefined, mediaType: "image" | "video") {
  const normalized = mimeType?.trim().toLowerCase();

  if (normalized && normalized !== "application/octet-stream") {
    return normalized;
  }

  if (fileName) {
    return inferMimeTypeFromFileName(fileName);
  }

  return mediaType === "video" ? "video/mp4" : "image/jpeg";
}

function parseAssetId(request: FastifyRequest) {
  const params = request.params as { id?: string };

  if (!params?.id?.trim()) {
    throw new Error("asset_id_required");
  }

  return params.id.trim();
}

function parseUploadSessionId(request: FastifyRequest) {
  const params = request.params as { uploadId?: string };

  if (!params?.uploadId?.trim()) {
    throw new Error("upload_session_id_required");
  }

  return params.uploadId.trim();
}

async function saveUpload(file: MultipartFile, folderPath = "") {
  const mediaType = resolveMediaTypeFromUpload(file.mimetype, file.filename);

  if (!mediaType) {
    throw new Error("unsupported_media_type");
  }

  const uploadsDir = getUploadsDir();
  await ensureUploadsStorage();
  await mkdir(uploadsDir, { recursive: true });
  const ext = path.extname(file.filename || "") || ".bin";
  const fileName = `${Date.now()}-${randomUUID()}${ext}`;
  const filePath = path.join(uploadsDir, fileName);
  const output = createWriteStream(filePath);
  let size = 0;

  try {
    for await (const chunk of file.file) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.byteLength;

      if (!output.write(buffer)) {
        await once(output, "drain");
      }
    }

    await new Promise<void>((resolve, reject) => {
      output.end((error?: Error | null) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  } catch (error) {
    output.destroy();
    await rm(filePath, { force: true }).catch(() => undefined);
    throw error;
  }

  const url = `/uploads/${fileName}`;
  const asset = await mediaLibraryRepository.add({
    title: file.filename || fileName,
    fileName,
    storageKey: fileName,
    folderPath,
    url,
    mediaType,
    mimeType: resolveUploadMimeType(file.mimetype, file.filename, mediaType),
    size,
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

  app.get("/api/admin/backup", async (request, reply) => {
    const admin = requireAdmin(request, reply);

    if (!admin || reply.sent) {
      return;
    }

    const fileName = `quanyu-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    const payload = await serializeBackupBundle();

    reply.header("Content-Type", "application/json; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${fileName}"`);
    return reply.send(payload);
  });

  app.get("/api/admin/backup/ai-copy", async (request, reply) => {
    const admin = requireAdmin(request, reply);

    if (!admin || reply.sent) {
      return;
    }

    const fileName = `quanyu-ai-copy-package-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    const payload = await serializeAiCopyPackageBundle();

    reply.header("Content-Type", "application/json; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${fileName}"`);
    return reply.send(payload);
  });

  app.post("/api/admin/backup/restore", async (request, reply) => {
    const admin = requireAdmin(request, reply);

    if (!admin || reply.sent) {
      return;
    }

    const file = await request.file();

    if (!file) {
      return reply.status(400).send({
        ok: false,
        error: "backup_file_required",
      });
    }

    const input = await file.toBuffer();

    try {
      const restored = await restoreBackupBundle(input);
      return {
        ok: true,
        restoredAt: restored.restoredAt,
        summary: restored.bundle.summary,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          ok: false,
          error: "invalid_backup_file",
          detail: error.flatten(),
        });
      }

      if (error instanceof Error && error.message === "invalid_backup_upload_path") {
        return reply.status(400).send({
          ok: false,
          error: error.message,
        });
      }

      throw error;
    }
  });

  app.post("/api/admin/backup/restore-ai-copy", async (request, reply) => {
    const admin = requireAdmin(request, reply);

    if (!admin || reply.sent) {
      return;
    }

    const file = await request.file();

    if (!file) {
      return reply.status(400).send({
        ok: false,
        error: "backup_file_required",
      });
    }

    const input = await file.toBuffer();

    try {
      const restored = await restoreAiCopyPackage(input);
      return {
        ok: true,
        restoredAt: restored.restoredAt,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          ok: false,
          error: "invalid_ai_copy_file",
          detail: error.flatten(),
        });
      }

      throw error;
    }
  });

  app.post("/api/admin/ai/site-draft", async (request, reply) => {
    const admin = requireAdmin(request, reply);

    if (!admin || reply.sent) {
      return;
    }

    const parsed = aiWebsiteDraftSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: parsed.error.flatten(),
      });
    }

    const content = await readContent();
    const library = await mediaLibraryRepository.getState();
    const result = await generateWebsiteDraft({
      config: content.aiConfig,
      content,
      mediaLibrary: library,
      instruction: parsed.data.instruction,
      language: parsed.data.language,
    });

    return {
      ok: true,
      content: result.content,
      notes: result.notes,
    };
  });

  app.post("/api/admin/ai/test", async (request, reply) => {
    const admin = requireAdmin(request, reply);

    if (!admin || reply.sent) {
      return;
    }

    const parsed = aiConfigTestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: parsed.error.flatten(),
      });
    }

    try {
      const result = await testAiProviderConnection(parsed.data.config);
      return {
        ok: result.ok,
        message: result.message,
        triage: result.triage,
      };
    } catch (error) {
      return reply.status(502).send({
        ok: false,
        error: "ai_provider_test_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
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

  app.post("/api/admin/media-library/upload-sessions", async (request, reply) => {
    const admin = requireAdmin(request, reply);

    if (!admin || reply.sent) {
      return;
    }

    try {
      const parsed = uploadSessionCreateSchema.safeParse(request.body);

      if (!parsed.success) {
        const sizeTooLarge = parsed.error.issues.some((issue) => issue.path[0] === "fileSize" && issue.code === "too_big");

        if (sizeTooLarge) {
          return reply.status(413).send({
            ok: false,
            error: "file_too_large",
            maxSizeMb: UPLOAD_MAX_FILE_SIZE_MB,
          });
        }

        return reply.status(400).send({
          ok: false,
          error: parsed.error.flatten(),
        });
      }

      const mediaType = resolveMediaTypeFromUpload(parsed.data.mimeType, parsed.data.fileName);

      if (!mediaType) {
        return reply.status(400).send({
          ok: false,
          error: "Only image and video uploads are supported",
        });
      }

      const session = await uploadSessionRepository.createSession({
        fileName: parsed.data.fileName,
        folderPath: parsed.data.folderPath ?? "",
        mediaType,
        mimeType: resolveUploadMimeType(parsed.data.mimeType, parsed.data.fileName, mediaType),
        size: parsed.data.fileSize,
      });

      return {
        ok: true,
        uploadId: session.id,
        fileName: session.fileName,
        size: session.size,
        receivedBytes: session.receivedBytes,
        maxSizeMb: UPLOAD_MAX_FILE_SIZE_MB,
      };
    } catch (error) {
      if (error instanceof Error && error.message === "folder_not_found") {
        return reply.status(400).send({
          ok: false,
          error: error.message,
        });
      }

      throw error;
    }
  });

  app.get("/api/admin/media-library/upload-sessions/:uploadId", async (request, reply) => {
    const admin = requireAdmin(request, reply);

    if (!admin || reply.sent) {
      return;
    }

    try {
      const session = await uploadSessionRepository.readSession(parseUploadSessionId(request));

      if (!session) {
        return reply.status(404).send({
          ok: false,
          error: "upload_session_not_found",
        });
      }

      return {
        ok: true,
        uploadId: session.id,
        fileName: session.fileName,
        size: session.size,
        receivedBytes: session.receivedBytes,
        maxSizeMb: UPLOAD_MAX_FILE_SIZE_MB,
      };
    } catch (error) {
      throw error;
    }
  });

  app.put("/api/admin/media-library/upload-sessions/:uploadId/chunk", async (request, reply) => {
    const admin = requireAdmin(request, reply);

    if (!admin || reply.sent) {
      return;
    }

    try {
      const parsedQuery = uploadChunkQuerySchema.safeParse(request.query);

      if (!parsedQuery.success) {
        return reply.status(400).send({
          ok: false,
          error: parsedQuery.error.flatten(),
        });
      }

      const chunk = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
      const session = await uploadSessionRepository.appendChunk({
        id: parseUploadSessionId(request),
        offset: parsedQuery.data.offset,
        chunk,
      });

      return {
        ok: true,
        uploadId: session.id,
        receivedBytes: session.receivedBytes,
        size: session.size,
      };
    } catch (error) {
      if (error instanceof UploadOffsetMismatchError) {
        return reply.status(409).send({
          ok: false,
          error: error.message,
          receivedBytes: error.receivedBytes,
        });
      }

      if (error instanceof Error && ["upload_session_not_found", "invalid_upload_chunk"].includes(error.message)) {
        return reply.status(error.message === "upload_session_not_found" ? 404 : 400).send({
          ok: false,
          error: error.message,
        });
      }

      if (error && typeof error === "object" && "code" in error && error.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
        return reply.status(413).send({
          ok: false,
          error: "upload_chunk_too_large",
        });
      }

      throw error;
    }
  });

  app.post("/api/admin/media-library/upload-sessions/:uploadId/complete", async (request, reply) => {
    const admin = requireAdmin(request, reply);

    if (!admin || reply.sent) {
      return;
    }

    try {
      return await uploadSessionRepository.completeSession(parseUploadSessionId(request));
    } catch (error) {
      if (error instanceof Error && ["upload_session_not_found", "upload_incomplete", "folder_not_found"].includes(error.message)) {
        return reply.status(error.message === "upload_session_not_found" ? 404 : 400).send({
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

    try {
      const file = await request.file();

      if (!file) {
        return reply.status(400).send({
          ok: false,
          error: "no_file_uploaded",
        });
      }

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
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error.code === "FST_REQ_FILE_TOO_LARGE" || error.code === "FST_FILES_LIMIT")
      ) {
        return reply.status(413).send({
          ok: false,
          error: "file_too_large",
          maxSizeMb: UPLOAD_MAX_FILE_SIZE_MB,
        });
      }

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
