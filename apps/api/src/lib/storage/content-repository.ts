import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cmsContentSchema, cmsContentSeed, type CmsContent } from "@quanyu/shared";

export type ContentRepository = {
  read: () => Promise<CmsContent>;
  write: (content: CmsContent) => Promise<CmsContent>;
  getUploadsDir: () => string;
};

function createJsonContentRepository(): ContentRepository {
  const repoRoot = process.env.INIT_CWD ? path.resolve(process.env.INIT_CWD) : path.resolve(process.cwd(), "..", "..");
  const contentFilePath = path.resolve(repoRoot, "data/content.json");

  async function ensureContentFile() {
    await mkdir(path.dirname(contentFilePath), { recursive: true });

    try {
      await readFile(contentFilePath, "utf8");
    } catch {
      await writeFile(contentFilePath, JSON.stringify(cmsContentSeed, null, 2), "utf8");
    }
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
      return path.resolve(repoRoot, "apps/api/uploads");
    },
  };
}

export const contentRepository: ContentRepository = createJsonContentRepository();
