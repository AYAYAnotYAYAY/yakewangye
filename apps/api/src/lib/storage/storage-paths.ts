import { existsSync } from "node:fs";
import { cp, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  cmsContentSeed,
  mediaLibraryStateSchema,
  type MediaLibraryAsset,
  type MediaLibraryFolder,
} from "@quanyu/shared";
import { resolveLocalDataRoot, resolveProjectRoot } from "../project-paths";

const repoRoot = resolveProjectRoot();
const dataRoot = resolveLocalDataRoot();

const legacyContentFilePath = path.resolve(repoRoot, "data/content.json");
const legacyChatSessionsFilePath = path.resolve(repoRoot, "data/chat-sessions.json");
const legacyAdminConfigFilePath = path.resolve(repoRoot, "data/admin-config.json");
const legacyUploadsDir = path.resolve(repoRoot, "apps/api/uploads");

const videoExtensions = new Set([".mp4", ".mov", ".m4v", ".webm", ".ogg", ".ogv"]);

export function inferMediaTypeFromFileName(fileName: string): "image" | "video" {
  return videoExtensions.has(path.extname(fileName).toLowerCase()) ? "video" : "image";
}

export function inferMimeTypeFromFileName(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();

  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".avif":
      return "image/avif";
    case ".heic":
      return "image/heic";
    case ".heif":
      return "image/heif";
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    case ".m4v":
      return "video/x-m4v";
    case ".webm":
      return "video/webm";
    case ".ogg":
    case ".ogv":
      return "video/ogg";
    default:
      return inferMediaTypeFromFileName(fileName) === "video" ? "video/mp4" : "image/jpeg";
  }
}

export function getLocalStoragePaths() {
  return {
    repoRoot,
    dataRoot,
    contentFilePath: path.resolve(dataRoot, "content.json"),
    chatSessionsFilePath: path.resolve(dataRoot, "chat-sessions.json"),
    adminConfigFilePath: path.resolve(dataRoot, "admin-config.json"),
    mediaLibraryFilePath: path.resolve(dataRoot, "media-library.json"),
    uploadsDir: path.resolve(dataRoot, "uploads"),
    uploadSessionsDir: path.resolve(dataRoot, "upload-sessions"),
    uploadTempDir: path.resolve(dataRoot, "upload-temp"),
    legacyContentFilePath,
    legacyChatSessionsFilePath,
    legacyAdminConfigFilePath,
    legacyUploadsDir,
  };
}

async function ensureJsonFile(params: {
  filePath: string;
  legacyFilePath?: string;
  fallbackJson: string;
}) {
  await mkdir(path.dirname(params.filePath), { recursive: true });

  if (existsSync(params.filePath)) {
    return;
  }

  if (params.legacyFilePath && existsSync(params.legacyFilePath) && path.resolve(params.legacyFilePath) !== path.resolve(params.filePath)) {
    await cp(params.legacyFilePath, params.filePath);
    return;
  }

  await writeFile(params.filePath, params.fallbackJson, "utf8");
}

export async function ensureUploadsStorage() {
  const { uploadsDir } = getLocalStoragePaths();
  await mkdir(uploadsDir, { recursive: true });

  if (!existsSync(legacyUploadsDir) || path.resolve(legacyUploadsDir) === path.resolve(uploadsDir)) {
    return uploadsDir;
  }

  const currentEntries = await readdir(uploadsDir);

  if (currentEntries.length > 0) {
    return uploadsDir;
  }

  const legacyEntries = await readdir(legacyUploadsDir).catch(() => []);

  for (const entry of legacyEntries) {
    await cp(path.resolve(legacyUploadsDir, entry), path.resolve(uploadsDir, entry), {
      recursive: true,
      errorOnExist: false,
      force: false,
    });
  }

  return uploadsDir;
}

export async function ensureUploadSessionStorage() {
  const { uploadSessionsDir, uploadTempDir } = getLocalStoragePaths();
  await mkdir(uploadSessionsDir, { recursive: true });
  await mkdir(uploadTempDir, { recursive: true });
  return {
    uploadSessionsDir,
    uploadTempDir,
  };
}

async function buildMediaLibrarySeedFromUploads() {
  const { uploadsDir } = getLocalStoragePaths();
  await ensureUploadsStorage();
  const assets: MediaLibraryAsset[] = [];
  const folders: MediaLibraryFolder[] = [];

  async function walk(currentDir: string, currentRelativePath = ""): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
      const absolutePath = path.resolve(currentDir, entry.name);
      const relativePath = currentRelativePath ? path.posix.join(currentRelativePath, entry.name) : entry.name;

      if (entry.isDirectory()) {
        const folderStat = await stat(absolutePath);
        folders.push({
          id: `legacy-folder-${relativePath}`,
          name: entry.name,
          path: relativePath,
          createdAt: folderStat.mtime.toISOString(),
          updatedAt: folderStat.mtime.toISOString(),
        });
        await walk(absolutePath, relativePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const fileName = entry.name;
      const fileStat = await stat(absolutePath);
      const timestamp = fileStat.mtime.toISOString();

      assets.push({
        id: `legacy-${relativePath}`,
        title: fileName,
        fileName,
        storageKey: relativePath,
        folderPath: currentRelativePath,
        url: `/uploads/${relativePath}`,
        mediaType: inferMediaTypeFromFileName(fileName),
        mimeType: inferMimeTypeFromFileName(fileName),
        size: fileStat.size,
        createdAt: timestamp,
        updatedAt: timestamp,
        source: "upload",
      });
    }
  }

  await walk(uploadsDir);

  return mediaLibraryStateSchema.parse({
    folders: folders.sort((left, right) => left.path.localeCompare(right.path)),
    assets: assets.sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  });
}

export async function ensureContentStorage() {
  const { contentFilePath } = getLocalStoragePaths();
  await ensureJsonFile({
    filePath: contentFilePath,
    legacyFilePath: legacyContentFilePath,
    fallbackJson: JSON.stringify(cmsContentSeed, null, 2),
  });
  return contentFilePath;
}

export async function ensureChatStorage() {
  const { chatSessionsFilePath } = getLocalStoragePaths();
  await ensureJsonFile({
    filePath: chatSessionsFilePath,
    legacyFilePath: legacyChatSessionsFilePath,
    fallbackJson: "[]",
  });
  return chatSessionsFilePath;
}

export async function ensureAdminStorage() {
  const { adminConfigFilePath } = getLocalStoragePaths();
  await mkdir(path.dirname(adminConfigFilePath), { recursive: true });

  if (!existsSync(adminConfigFilePath) && existsSync(legacyAdminConfigFilePath) && path.resolve(adminConfigFilePath) !== path.resolve(legacyAdminConfigFilePath)) {
    await cp(legacyAdminConfigFilePath, adminConfigFilePath);
  }

  return adminConfigFilePath;
}

export async function ensureMediaLibraryStorage() {
  const { mediaLibraryFilePath } = getLocalStoragePaths();
  await mkdir(path.dirname(mediaLibraryFilePath), { recursive: true });

  if (existsSync(mediaLibraryFilePath)) {
    return mediaLibraryFilePath;
  }

  const seed = await buildMediaLibrarySeedFromUploads();
  await writeFile(mediaLibraryFilePath, JSON.stringify(seed, null, 2), "utf8");
  return mediaLibraryFilePath;
}

export async function ensureAllLocalStorage() {
  await ensureUploadsStorage();
  await ensureUploadSessionStorage();
  await ensureContentStorage();
  await ensureChatStorage();
  await ensureAdminStorage();
  await ensureMediaLibraryStorage();
}
