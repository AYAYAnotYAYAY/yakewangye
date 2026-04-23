import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  chatSessionSchema,
  cmsContentSchema,
  cmsContentSeed,
  mediaLibraryStateSchema,
  type ChatSession,
} from "@quanyu/shared";
import { z } from "zod";
import { ensureAdminStorage, ensureChatStorage, ensureContentStorage, ensureMediaLibraryStorage, ensureUploadsStorage, getLocalStoragePaths } from "./storage-paths";

const BACKUP_FORMAT = "quanyu.admin.backup";
const BACKUP_VERSION = 1;

const adminConfigSchema = z.object({
  username: z.string().min(1),
  passwordHash: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const backupUploadFileSchema = z.object({
  path: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
  encoding: z.literal("base64"),
  contentBase64: z.string(),
});

const backupBundleSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  generatedAt: z.string(),
  source: z.object({
    app: z.literal("yakewangye"),
    dataRoot: z.string(),
  }),
  summary: z.object({
    articleCount: z.number().int().nonnegative(),
    doctorCount: z.number().int().nonnegative(),
    serviceCount: z.number().int().nonnegative(),
    pricingCount: z.number().int().nonnegative(),
    galleryCount: z.number().int().nonnegative(),
    pageCount: z.number().int().nonnegative(),
    chatSessionCount: z.number().int().nonnegative(),
    mediaAssetCount: z.number().int().nonnegative(),
    mediaFolderCount: z.number().int().nonnegative(),
    uploadFileCount: z.number().int().nonnegative(),
  }),
  data: z.object({
    content: cmsContentSchema,
    adminConfig: adminConfigSchema.nullable(),
    chatSessions: z.array(chatSessionSchema),
    mediaLibrary: mediaLibraryStateSchema,
  }),
  uploads: z.object({
    files: z.array(backupUploadFileSchema),
  }),
});

export type BackupBundle = z.infer<typeof backupBundleSchema>;

function normalizeBackupFilePath(value: string) {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/{2,}/g, "/");

  if (!normalized || normalized === "." || normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("invalid_backup_upload_path");
  }

  return normalized;
}

async function readJsonFile<T>(filePath: string, schema: z.ZodSchema<T>, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf8");
    return schema.parse(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

async function readAdminConfig() {
  const { adminConfigFilePath } = getLocalStoragePaths();
  await ensureAdminStorage();

  try {
    const raw = await readFile(adminConfigFilePath, "utf8");
    return adminConfigSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function listUploadFiles(currentDir: string, relativeDir = ""): Promise<BackupBundle["uploads"]["files"]> {
  const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => []);
  const files: BackupBundle["uploads"]["files"] = [];

  for (const entry of entries) {
    const absolutePath = path.resolve(currentDir, entry.name);
    const relativePath = relativeDir ? path.posix.join(relativeDir, entry.name) : entry.name;

    if (entry.isDirectory()) {
      files.push(...(await listUploadFiles(absolutePath, relativePath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const fileBuffer = await readFile(absolutePath);
    const fileStats = await stat(absolutePath);
    files.push({
      path: relativePath,
      mimeType: "application/octet-stream",
      size: fileStats.size,
      encoding: "base64",
      contentBase64: fileBuffer.toString("base64"),
    });
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function writeBackupJsonFile(targetPath: string, value: unknown) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, JSON.stringify(value, null, 2), "utf8");
}

export async function createBackupBundle(): Promise<BackupBundle> {
  const paths = getLocalStoragePaths();
  await ensureContentStorage();
  await ensureChatStorage();
  await ensureAdminStorage();
  await ensureMediaLibraryStorage();
  await ensureUploadsStorage();

  const [content, adminConfig, chatSessions, mediaLibrary, uploadFiles] = await Promise.all([
    readJsonFile(paths.contentFilePath, cmsContentSchema, cmsContentSeed),
    readAdminConfig(),
    readJsonFile(paths.chatSessionsFilePath, z.array(chatSessionSchema), [] as ChatSession[]),
    readJsonFile(paths.mediaLibraryFilePath, mediaLibraryStateSchema, mediaLibraryStateSchema.parse({ folders: [], assets: [] })),
    listUploadFiles(paths.uploadsDir),
  ]);

  return backupBundleSchema.parse({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      app: "yakewangye",
      dataRoot: paths.dataRoot,
    },
    summary: {
      articleCount: content.articles.length,
      doctorCount: content.doctors.length,
      serviceCount: content.services.length,
      pricingCount: content.pricing.length,
      galleryCount: content.gallery.length,
      pageCount: content.pages.length,
      chatSessionCount: chatSessions.length,
      mediaAssetCount: mediaLibrary.assets.length,
      mediaFolderCount: mediaLibrary.folders.length,
      uploadFileCount: uploadFiles.length,
    },
    data: {
      content,
      adminConfig,
      chatSessions,
      mediaLibrary,
    },
    uploads: {
      files: uploadFiles,
    },
  });
}

export async function serializeBackupBundle() {
  return JSON.stringify(await createBackupBundle(), null, 2);
}

export async function restoreBackupBundle(rawInput: string | Buffer) {
  const rawText = Buffer.isBuffer(rawInput) ? rawInput.toString("utf8") : rawInput;
  const bundle = backupBundleSchema.parse(JSON.parse(rawText));
  const paths = getLocalStoragePaths();

  await mkdir(paths.dataRoot, { recursive: true });
  await writeBackupJsonFile(
    path.resolve(paths.dataRoot, "restore-snapshots", `pre-restore-${new Date().toISOString().replace(/[:.]/g, "-")}.json`),
    await createBackupBundle(),
  );

  await writeBackupJsonFile(paths.contentFilePath, bundle.data.content);
  await writeBackupJsonFile(paths.chatSessionsFilePath, bundle.data.chatSessions);
  await writeBackupJsonFile(paths.mediaLibraryFilePath, bundle.data.mediaLibrary);

  if (bundle.data.adminConfig) {
    await writeBackupJsonFile(paths.adminConfigFilePath, bundle.data.adminConfig);
  } else {
    await rm(paths.adminConfigFilePath, { force: true });
  }

  await rm(paths.uploadsDir, { recursive: true, force: true });
  await mkdir(paths.uploadsDir, { recursive: true });

  for (const file of bundle.uploads.files) {
    const relativePath = normalizeBackupFilePath(file.path);
    const targetPath = path.resolve(paths.uploadsDir, relativePath);
    const uploadsRoot = path.resolve(paths.uploadsDir);

    if (targetPath !== uploadsRoot && !targetPath.startsWith(`${uploadsRoot}${path.sep}`)) {
      throw new Error("invalid_backup_upload_path");
    }

    const buffer = Buffer.from(file.contentBase64, "base64");
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, buffer);
  }

  return {
    bundle,
    restoredAt: new Date().toISOString(),
  };
}
