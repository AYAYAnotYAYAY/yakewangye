import { cmsContentSeed, type CmsContent } from "@quanyu/shared";
import { contentRepository } from "./storage/content-repository";

export async function readContent(): Promise<CmsContent> {
  const content = await contentRepository.read();
  return content.i18n ? content : { ...content, i18n: cmsContentSeed.i18n };
}

export async function writeContent(content: CmsContent) {
  return contentRepository.write(content);
}

export function getUploadsDir() {
  return contentRepository.getUploadsDir();
}
