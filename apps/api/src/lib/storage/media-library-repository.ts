import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import {
  mediaLibraryAssetListSchema,
  mediaLibraryAssetSchema,
  type MediaLibraryAsset,
} from "@quanyu/shared";
import { ensureMediaLibraryStorage, getLocalStoragePaths } from "./storage-paths";

export type MediaUploadInput = {
  title: string;
  fileName: string;
  url: string;
  mediaType: "image" | "video";
  mimeType: string;
  size: number;
  source?: "upload" | "import";
};

export type MediaLibraryRepository = {
  list: () => Promise<MediaLibraryAsset[]>;
  add: (input: MediaUploadInput) => Promise<MediaLibraryAsset>;
};

function sortNewestFirst(items: MediaLibraryAsset[]) {
  return [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

async function readLibrary() {
  const { mediaLibraryFilePath } = getLocalStoragePaths();
  await ensureMediaLibraryStorage();
  const raw = await readFile(mediaLibraryFilePath, "utf8");
  return mediaLibraryAssetListSchema.parse(JSON.parse(raw));
}

async function writeLibrary(items: MediaLibraryAsset[]) {
  const { mediaLibraryFilePath } = getLocalStoragePaths();
  await ensureMediaLibraryStorage();
  await writeFile(mediaLibraryFilePath, JSON.stringify(sortNewestFirst(items), null, 2), "utf8");
}

function createMediaAsset(input: MediaUploadInput) {
  const now = new Date().toISOString();

  return mediaLibraryAssetSchema.parse({
    id: `media-${randomUUID()}`,
    title: input.title,
    fileName: input.fileName,
    url: input.url,
    mediaType: input.mediaType,
    mimeType: input.mimeType,
    size: input.size,
    createdAt: now,
    updatedAt: now,
    source: input.source ?? "upload",
  });
}

function createJsonMediaLibraryRepository(): MediaLibraryRepository {
  return {
    async list() {
      const items = await readLibrary();
      return sortNewestFirst(items);
    },
    async add(input) {
      const items = await readLibrary();
      const existing = items.find((item) => item.fileName === input.fileName && item.url === input.url);

      if (existing) {
        return existing;
      }

      const created = createMediaAsset(input);
      items.unshift(created);
      await writeLibrary(items);
      return created;
    },
  };
}

export const mediaLibraryRepository: MediaLibraryRepository = createJsonMediaLibraryRepository();
