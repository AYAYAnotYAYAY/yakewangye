import type { CmsContent } from "@quanyu/shared";
import { contentRepository } from "./storage/content-repository";

export async function readContent(): Promise<CmsContent> {
  return contentRepository.read();
}

export async function writeContent(content: CmsContent) {
  return contentRepository.write(content);
}

export function getUploadsDir() {
  return contentRepository.getUploadsDir();
}
