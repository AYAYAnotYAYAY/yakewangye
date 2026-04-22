import { readFile, writeFile } from "node:fs/promises";
import { cmsContentSchema, type CmsContent } from "@quanyu/shared";
import { ensureContentStorage, ensureUploadsStorage, getLocalStoragePaths } from "./storage-paths";

export type ContentRepository = {
  read: () => Promise<CmsContent>;
  write: (content: CmsContent) => Promise<CmsContent>;
  getUploadsDir: () => string;
};

function createJsonContentRepository(): ContentRepository {
  const { contentFilePath, uploadsDir } = getLocalStoragePaths();

  async function ensureContentFile() {
    await ensureContentStorage();
  }

  return {
    async read() {
      await ensureContentFile();
      const raw = await readFile(contentFilePath, "utf8");
      return cmsContentSchema.parse(JSON.parse(raw));
    },
    async write(content: CmsContent) {
      await ensureContentFile();
      const validated = cmsContentSchema.parse(content);
      await writeFile(contentFilePath, JSON.stringify(validated, null, 2), "utf8");
      return validated;
    },
    getUploadsDir() {
      void ensureUploadsStorage();
      return uploadsDir;
    },
  };
}

export const contentRepository: ContentRepository = createJsonContentRepository();
