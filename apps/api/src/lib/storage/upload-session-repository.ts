import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MediaLibraryAsset, MediaLibraryState } from "@quanyu/shared";
import { mediaLibraryRepository } from "./media-library-repository";
import { ensureUploadSessionStorage, ensureUploadsStorage, getLocalStoragePaths } from "./storage-paths";

const UPLOAD_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type UploadSessionRecord = {
  id: string;
  fileName: string;
  folderPath: string;
  mediaType: "image" | "video";
  mimeType: string;
  size: number;
  receivedBytes: number;
  tempFileName: string;
  createdAt: string;
  updatedAt: string;
};

export class UploadOffsetMismatchError extends Error {
  receivedBytes: number;

  constructor(receivedBytes: number) {
    super("upload_offset_mismatch");
    this.receivedBytes = receivedBytes;
  }
}

function normalizeFolderPath(value: string | undefined) {
  const normalized = (value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/{2,}/g, "/");

  return normalized === "." ? "" : normalized;
}

function getSessionMetaPath(id: string) {
  const { uploadSessionsDir } = getLocalStoragePaths();
  return path.resolve(uploadSessionsDir, `${id}.json`);
}

function getSessionTempPath(tempFileName: string) {
  const { uploadTempDir } = getLocalStoragePaths();
  return path.resolve(uploadTempDir, tempFileName);
}

async function ensureFolderExists(folderPath: string) {
  const normalized = normalizeFolderPath(folderPath);

  if (!normalized) {
    return;
  }

  const state = await mediaLibraryRepository.getState();

  if (!state.folders.some((folder) => folder.path === normalized)) {
    throw new Error("folder_not_found");
  }
}

async function writeSession(session: UploadSessionRecord) {
  await ensureUploadSessionStorage();
  await writeFile(getSessionMetaPath(session.id), JSON.stringify(session, null, 2), "utf8");
}

async function removeSessionFiles(session: UploadSessionRecord) {
  await Promise.all([
    rm(getSessionMetaPath(session.id), { force: true }),
    rm(getSessionTempPath(session.tempFileName), { force: true }),
  ]);
}

async function syncSessionWithTempFile(session: UploadSessionRecord) {
  const tempPath = getSessionTempPath(session.tempFileName);
  const tempStat = await stat(tempPath).catch(() => null);
  const actualSize = Math.min(tempStat?.size ?? 0, session.size);

  if (actualSize === session.receivedBytes) {
    return session;
  }

  const nextSession: UploadSessionRecord = {
    ...session,
    receivedBytes: actualSize,
    updatedAt: new Date().toISOString(),
  };
  await writeSession(nextSession);
  return nextSession;
}

async function readSession(id: string) {
  await ensureUploadSessionStorage();
  const metaPath = getSessionMetaPath(id);

  if (!existsSync(metaPath)) {
    return null;
  }

  const raw = JSON.parse(await readFile(metaPath, "utf8")) as UploadSessionRecord;
  const updatedAtMs = Date.parse(raw.updatedAt);

  if (Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs > UPLOAD_SESSION_TTL_MS) {
    await removeSessionFiles(raw);
    return null;
  }

  return syncSessionWithTempFile(raw);
}

async function createSession(input: {
  fileName: string;
  folderPath?: string;
  mediaType: "image" | "video";
  mimeType: string;
  size: number;
}) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const session: UploadSessionRecord = {
    id,
    fileName: input.fileName,
    folderPath: normalizeFolderPath(input.folderPath),
    mediaType: input.mediaType,
    mimeType: input.mimeType,
    size: input.size,
    receivedBytes: 0,
    tempFileName: `${id}.part`,
    createdAt: now,
    updatedAt: now,
  };

  await ensureUploadSessionStorage();
  await ensureFolderExists(session.folderPath);
  await writeFile(getSessionTempPath(session.tempFileName), "");
  await writeSession(session);
  return session;
}

async function appendChunk(params: { id: string; offset: number; chunk: Buffer }) {
  const session = await readSession(params.id);

  if (!session) {
    throw new Error("upload_session_not_found");
  }

  if (params.offset !== session.receivedBytes) {
    throw new UploadOffsetMismatchError(session.receivedBytes);
  }

  if (!params.chunk.byteLength) {
    throw new Error("invalid_upload_chunk");
  }

  if (session.receivedBytes + params.chunk.byteLength > session.size) {
    throw new Error("invalid_upload_chunk");
  }

  await appendFile(getSessionTempPath(session.tempFileName), params.chunk);
  const nextSession: UploadSessionRecord = {
    ...session,
    receivedBytes: session.receivedBytes + params.chunk.byteLength,
    updatedAt: new Date().toISOString(),
  };
  await writeSession(nextSession);
  return nextSession;
}

async function completeSession(id: string) {
  const session = await readSession(id);

  if (!session) {
    throw new Error("upload_session_not_found");
  }

  if (session.receivedBytes !== session.size) {
    throw new Error("upload_incomplete");
  }

  await ensureFolderExists(session.folderPath);
  const uploadsDir = await ensureUploadsStorage();
  const ext = path.extname(session.fileName) || (session.mediaType === "video" ? ".mp4" : ".bin");
  const fileName = `${Date.now()}-${randomUUID()}${ext}`;
  const finalPath = path.resolve(uploadsDir, fileName);
  const tempPath = getSessionTempPath(session.tempFileName);

  await rename(tempPath, finalPath);

  try {
    const url = `/uploads/${fileName}`;
    const asset = await mediaLibraryRepository.add({
      title: session.fileName,
      fileName,
      storageKey: fileName,
      folderPath: session.folderPath,
      url,
      mediaType: session.mediaType,
      mimeType: session.mimeType,
      size: session.size,
    });

    await rm(getSessionMetaPath(session.id), { force: true });

    return {
      ok: true as const,
      url,
      fileName,
      asset,
      library: await mediaLibraryRepository.getState(),
    };
  } catch (error) {
    await rename(finalPath, tempPath).catch(async () => {
      await rm(finalPath, { force: true }).catch(() => undefined);
    });
    await writeSession(session);
    throw error;
  }
}

async function deleteSession(id: string) {
  const session = await readSession(id);

  if (!session) {
    return;
  }

  await removeSessionFiles(session);
}

export const uploadSessionRepository = {
  createSession,
  readSession,
  appendChunk,
  completeSession,
  deleteSession,
};

export type UploadSessionCompleteResult = Awaited<ReturnType<typeof completeSession>>;
export type UploadSessionReadResult = Awaited<ReturnType<typeof readSession>>;
export type UploadSessionAppendResult = Awaited<ReturnType<typeof appendChunk>>;
export type UploadSessionStatusResult = UploadSessionReadResult;
export type UploadSessionAssetResult = {
  asset: MediaLibraryAsset;
  library: MediaLibraryState;
};
