import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  mediaLibraryAssetListSchema,
  mediaLibraryAssetSchema,
  mediaLibraryFolderSchema,
  mediaLibraryStateSchema,
  type MediaLibraryAsset,
  type MediaLibraryFolder,
  type MediaLibraryState,
} from "@quanyu/shared";
import { ensureMediaLibraryStorage, getLocalStoragePaths } from "./storage-paths";

export type MediaUploadInput = {
  title: string;
  fileName: string;
  storageKey: string;
  folderPath?: string;
  url: string;
  mediaType: "image" | "video";
  mimeType: string;
  size: number;
  source?: "upload" | "import" | "copy";
};

export type MediaLibraryRepository = {
  getState: () => Promise<MediaLibraryState>;
  add: (input: MediaUploadInput) => Promise<MediaLibraryAsset>;
  updateAsset: (params: { id: string; title?: string; folderPath?: string; aiAnalysis?: MediaLibraryAsset["aiAnalysis"] }) => Promise<MediaLibraryAsset>;
  deleteAsset: (id: string) => Promise<void>;
  createFolder: (params: { name: string; parentPath?: string }) => Promise<MediaLibraryFolder>;
  renameFolder: (params: { path: string; newName: string }) => Promise<MediaLibraryState>;
  copyFolder: (params: { sourcePath: string; targetParentPath?: string; newName: string }) => Promise<MediaLibraryState>;
};

function normalizeFolderPath(value: string | undefined) {
  const normalized = (value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/{2,}/g, "/");

  return normalized === "." ? "" : normalized;
}

function validateFolderName(value: string) {
  const name = value.trim();

  if (!name) {
    throw new Error("invalid_folder_name");
  }

  if (name.includes("/") || name.includes("\\")) {
    throw new Error("invalid_folder_name");
  }

  if (name === "." || name === "..") {
    throw new Error("invalid_folder_name");
  }

  return name;
}

function joinFolderPath(parentPath: string | undefined, name: string) {
  const normalizedParent = normalizeFolderPath(parentPath);
  const normalizedName = validateFolderName(name);
  return normalizedParent ? path.posix.join(normalizedParent, normalizedName) : normalizedName;
}

function getParentFolderPath(folderPath: string) {
  const normalized = normalizeFolderPath(folderPath);

  if (!normalized) {
    return "";
  }

  const parent = path.posix.dirname(normalized);
  return parent === "." ? "" : parent;
}

function sortFolders(items: MediaLibraryFolder[]) {
  return [...items].sort((left, right) => left.path.localeCompare(right.path));
}

function sortAssets(items: MediaLibraryAsset[]) {
  return [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function sortState(state: MediaLibraryState): MediaLibraryState {
  return {
    folders: sortFolders(state.folders),
    assets: sortAssets(state.assets),
  };
}

async function readState() {
  const { mediaLibraryFilePath } = getLocalStoragePaths();
  await ensureMediaLibraryStorage();
  const raw = JSON.parse(await readFile(mediaLibraryFilePath, "utf8")) as unknown;

  if (Array.isArray(raw)) {
    return sortState(
      mediaLibraryStateSchema.parse({
        folders: [],
        assets: raw.map((item) => {
          const legacyAsset = item as Partial<MediaLibraryAsset> & Record<string, unknown>;
          const fileName = typeof legacyAsset.fileName === "string" && legacyAsset.fileName ? legacyAsset.fileName : String(legacyAsset.title ?? "asset");
          const storageKey =
            typeof legacyAsset.storageKey === "string" && legacyAsset.storageKey
              ? legacyAsset.storageKey
              : typeof legacyAsset.url === "string" && legacyAsset.url.startsWith("/uploads/")
                ? legacyAsset.url.slice("/uploads/".length)
                : fileName;

          return {
            id: String(legacyAsset.id ?? `legacy-${storageKey}`),
            title: String(legacyAsset.title ?? fileName),
            fileName,
            storageKey,
            folderPath: normalizeFolderPath(typeof legacyAsset.folderPath === "string" ? legacyAsset.folderPath : ""),
            url: String(legacyAsset.url ?? `/uploads/${storageKey}`),
            mediaType: legacyAsset.mediaType === "video" ? "video" : "image",
            mimeType: String(legacyAsset.mimeType ?? ""),
            size: typeof legacyAsset.size === "number" ? legacyAsset.size : 0,
            createdAt: String(legacyAsset.createdAt ?? new Date().toISOString()),
            updatedAt: String(legacyAsset.updatedAt ?? legacyAsset.createdAt ?? new Date().toISOString()),
            source: legacyAsset.source === "import" || legacyAsset.source === "copy" ? legacyAsset.source : "upload",
            aiAnalysis: legacyAsset.aiAnalysis,
          };
        }),
      }),
    );
  }

  return sortState(mediaLibraryStateSchema.parse(raw));
}

async function writeState(state: MediaLibraryState) {
  const { mediaLibraryFilePath } = getLocalStoragePaths();
  await ensureMediaLibraryStorage();
  await writeFile(mediaLibraryFilePath, JSON.stringify(sortState(state), null, 2), "utf8");
}

function ensureFolderExists(state: MediaLibraryState, folderPath: string) {
  const normalized = normalizeFolderPath(folderPath);

  if (!normalized) {
    return;
  }

  if (!state.folders.some((folder) => folder.path === normalized)) {
    throw new Error("folder_not_found");
  }
}

function createMediaAsset(input: MediaUploadInput) {
  const now = new Date().toISOString();

  return mediaLibraryAssetSchema.parse({
    id: `media-${randomUUID()}`,
    title: input.title.trim() || input.fileName,
    fileName: input.fileName,
    storageKey: input.storageKey,
    folderPath: normalizeFolderPath(input.folderPath),
    url: input.url,
    mediaType: input.mediaType,
    mimeType: input.mimeType,
    size: input.size,
    createdAt: now,
    updatedAt: now,
    source: input.source ?? "upload",
  });
}

function createFolderRecord(params: { name: string; path: string }) {
  const now = new Date().toISOString();

  return mediaLibraryFolderSchema.parse({
    id: `folder-${randomUUID()}`,
    name: params.name,
    path: params.path,
    createdAt: now,
    updatedAt: now,
  });
}

function replaceFolderPrefix(value: string, sourcePath: string, targetPath: string) {
  if (value === sourcePath) {
    return targetPath;
  }

  const prefix = `${sourcePath}/`;

  if (!value.startsWith(prefix)) {
    return value;
  }

  const suffix = value.slice(prefix.length);
  return targetPath ? path.posix.join(targetPath, suffix) : suffix;
}

async function removePhysicalFileIfUnused(state: MediaLibraryState, storageKey: string) {
  if (state.assets.some((asset) => asset.storageKey === storageKey)) {
    return;
  }

  const { uploadsDir } = getLocalStoragePaths();
  await rm(path.resolve(uploadsDir, storageKey), { force: true });
}

function createJsonMediaLibraryRepository(): MediaLibraryRepository {
  return {
    async getState() {
      return readState();
    },
    async add(input) {
      const state = await readState();
      ensureFolderExists(state, input.folderPath ?? "");

      const created = createMediaAsset(input);
      state.assets.unshift(created);
      await writeState(state);
      return created;
    },
    async updateAsset(params) {
      const state = await readState();
      const target = state.assets.find((asset) => asset.id === params.id);

      if (!target) {
        throw new Error("asset_not_found");
      }

      if (params.folderPath !== undefined) {
        ensureFolderExists(state, params.folderPath);
        target.folderPath = normalizeFolderPath(params.folderPath);
      }

      if (params.title !== undefined) {
        const nextTitle = params.title.trim();

        if (!nextTitle) {
          throw new Error("invalid_asset_title");
        }

        target.title = nextTitle;
      }

      if (params.aiAnalysis !== undefined) {
        target.aiAnalysis = params.aiAnalysis;
      }

      target.updatedAt = new Date().toISOString();
      await writeState(state);
      return target;
    },
    async deleteAsset(id) {
      const state = await readState();
      const index = state.assets.findIndex((asset) => asset.id === id);

      if (index < 0) {
        throw new Error("asset_not_found");
      }

      const [removed] = state.assets.splice(index, 1);
      await writeState(state);
      await removePhysicalFileIfUnused(state, removed.storageKey);
    },
    async createFolder(params) {
      const state = await readState();
      ensureFolderExists(state, params.parentPath ?? "");

      const nextPath = joinFolderPath(params.parentPath, params.name);

      if (state.folders.some((folder) => folder.path === nextPath)) {
        throw new Error("folder_exists");
      }

      const created = createFolderRecord({
        name: validateFolderName(params.name),
        path: nextPath,
      });
      state.folders.push(created);
      await writeState(state);
      return created;
    },
    async renameFolder(params) {
      const sourcePath = normalizeFolderPath(params.path);

      if (!sourcePath) {
        throw new Error("root_folder_not_supported");
      }

      const state = await readState();
      const target = state.folders.find((folder) => folder.path === sourcePath);

      if (!target) {
        throw new Error("folder_not_found");
      }

      const nextPath = joinFolderPath(getParentFolderPath(sourcePath), params.newName);

      if (state.folders.some((folder) => folder.path === nextPath && folder.path !== sourcePath)) {
        throw new Error("folder_exists");
      }

      for (const folder of state.folders) {
        if (folder.path === sourcePath || folder.path.startsWith(`${sourcePath}/`)) {
          const replacedPath = replaceFolderPrefix(folder.path, sourcePath, nextPath);
          folder.path = replacedPath;
          folder.name = replacedPath.split("/").pop() ?? folder.name;
          folder.updatedAt = new Date().toISOString();
        }
      }

      for (const asset of state.assets) {
        if (asset.folderPath === sourcePath || asset.folderPath.startsWith(`${sourcePath}/`)) {
          asset.folderPath = replaceFolderPrefix(asset.folderPath, sourcePath, nextPath);
          asset.updatedAt = new Date().toISOString();
        }
      }

      await writeState(state);
      return sortState(state);
    },
    async copyFolder(params) {
      const sourcePath = normalizeFolderPath(params.sourcePath);

      if (!sourcePath) {
        throw new Error("root_folder_not_supported");
      }

      const state = await readState();
      const sourceFolder = state.folders.find((folder) => folder.path === sourcePath);

      if (!sourceFolder) {
        throw new Error("folder_not_found");
      }

      ensureFolderExists(state, params.targetParentPath ?? "");
      const nextPath = joinFolderPath(params.targetParentPath, params.newName);

      if (state.folders.some((folder) => folder.path === nextPath)) {
        throw new Error("folder_exists");
      }

      const now = new Date().toISOString();
      const relatedFolders = state.folders.filter((folder) => folder.path === sourcePath || folder.path.startsWith(`${sourcePath}/`));
      const relatedAssets = state.assets.filter((asset) => asset.folderPath === sourcePath || asset.folderPath.startsWith(`${sourcePath}/`));

      for (const folder of relatedFolders) {
        const copiedPath = replaceFolderPrefix(folder.path, sourcePath, nextPath);
        state.folders.push(
          mediaLibraryFolderSchema.parse({
            id: `folder-${randomUUID()}`,
            name: copiedPath.split("/").pop() ?? folder.name,
            path: copiedPath,
            createdAt: now,
            updatedAt: now,
          }),
        );
      }

      for (const asset of relatedAssets) {
        state.assets.push(
          mediaLibraryAssetSchema.parse({
            ...asset,
            id: `media-${randomUUID()}`,
            folderPath: replaceFolderPrefix(asset.folderPath, sourcePath, nextPath),
            createdAt: now,
            updatedAt: now,
            source: "copy",
          }),
        );
      }

      await writeState(state);
      return sortState(state);
    },
  };
}

export const mediaLibraryRepository: MediaLibraryRepository = createJsonMediaLibraryRepository();
