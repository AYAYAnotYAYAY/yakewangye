import type { ChatSession, CmsContent, MediaLibraryAsset, MediaLibraryState } from "@quanyu/shared";

const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
export const ADMIN_TOKEN_STORAGE_KEY = "quanyu_admin_token";
let runtimeApiBaseUrl: string | undefined = API_BASE_URL || undefined;
const MAX_MEDIA_UPLOAD_SIZE_MB = 1024;
const MAX_MEDIA_UPLOAD_SIZE_BYTES = MAX_MEDIA_UPLOAD_SIZE_MB * 1024 * 1024;
// 为了绕过常见反向代理（如 Nginx 默认 1MB）的限制，将分片大小缩小到 512KB（防止包含请求头后超出1MB）
const MEDIA_UPLOAD_CHUNK_SIZE_BYTES = 512 * 1024;
const UPLOAD_SESSION_STORAGE_PREFIX = "quanyu_upload_session_v1";

export type AdminStatus =
  | {
      initialized: true;
      source: "env" | "file";
      username: string;
    }
  | {
      initialized: false;
      source: "setup_required";
    };

function unique(values: string[]) {
  return [...new Set(values)];
}

function normalizeApiBaseUrl(value: string | undefined) {
  const trimmed = value?.trim() ?? "";

  if (!trimmed || trimmed === "/") {
    return "";
  }

  return trimmed.replace(/\/+$/, "");
}

function buildRequestUrl(base: string, input: string) {
  return base ? `${base}${input}` : input;
}

function appendQuery(input: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value && value.trim()) {
      search.set(key, value);
    }
  }

  const query = search.toString();
  return query ? `${input}?${query}` : input;
}

function getApiBaseCandidates() {
  const candidates: string[] = [];

  if (runtimeApiBaseUrl !== undefined) {
    candidates.push(runtimeApiBaseUrl);
  }

  if (API_BASE_URL) {
    candidates.push(API_BASE_URL);
  }

  if (typeof window !== "undefined") {
    const { protocol, hostname, port } = window.location;
    const host4000 =
      protocol === "http:" && hostname && port !== "4000"
        ? `${protocol}//${hostname}:4000`
        : "";

    if (host4000) {
      candidates.push(host4000);
    }
  }

  candidates.push("");
  return unique(candidates);
}

async function fetchWithFallback(input: string, init?: RequestInit) {
  let lastError: unknown;
  const attemptedUrls: string[] = [];

  for (const base of getApiBaseCandidates()) {
    const requestUrl = buildRequestUrl(base, input);
    attemptedUrls.push(requestUrl);

    try {
      const response = await fetch(requestUrl, {
        ...init,
        cache: "no-store",
      });

      runtimeApiBaseUrl = base;
      return response;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error(`Failed to fetch: ${attemptedUrls.join(", ")}`);
}

export function resolveAssetUrl(value: string) {
  if (!value) {
    return "";
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  if (value.startsWith("/")) {
    return buildRequestUrl(runtimeApiBaseUrl ?? API_BASE_URL, value);
  }

  return value;
}

export async function fetchContent() {
  const response = await fetchWithFallback(`/api/content?_=${Date.now()}`);

  if (!response.ok) {
    throw new Error("Failed to fetch content");
  }

  return (await response.json()) as CmsContent;
}

function createAdminHeaders(token: string, extra?: HeadersInit) {
  return {
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

async function parseErrorMessage(response: Response, fallback: string) {
  const errorPayload = (await response.json().catch(() => null)) as { error?: string } | null;
  return errorPayload?.error || fallback;
}

function getUploadErrorMessage(
  payload:
    | { error?: string; maxSizeMb?: number; receivedBytes?: number }
    | { ok: true; uploadId: string; receivedBytes: number; size: number }
    | { ok: true; url: string; fileName: string; asset: MediaLibraryAsset; library: MediaLibraryState }
    | null,
  xhrOrStatus: XMLHttpRequest | number,
) {
  const status = typeof xhrOrStatus === "number" ? xhrOrStatus : xhrOrStatus.status;

  if (isUploadErrorPayload(payload) && payload.error === "file_too_large") {
    return `文件过大，单个文件请不要超过 ${payload.maxSizeMb ?? MAX_MEDIA_UPLOAD_SIZE_MB} MB`;
  }

  if (isUploadErrorPayload(payload) && payload.error === "no_file_uploaded") {
    return "没有检测到要上传的文件";
  }

  if (isUploadErrorPayload(payload) && payload.error === "upload_session_not_found") {
    return "上传会话已失效，请重新开始";
  }

  if (isUploadErrorPayload(payload) && payload.error === "upload_incomplete") {
    return "文件还没有全部上传完成";
  }

  if (isUploadErrorPayload(payload) && payload.error === "invalid_upload_chunk") {
    return "上传分片无效，请重新开始上传";
  }

  if (isUploadErrorPayload(payload) && payload.error === "upload_chunk_too_large") {
    return "上传分片过大，请刷新页面后重试";
  }

  if (isUploadErrorPayload(payload) && payload.error) {
    return payload.error;
  }

  if (status === 413) {
    return "文件过大，上传请求被服务器拒绝";
  }

  if (status === 415) {
    return "当前只支持图片和视频素材";
  }

  return `upload_failed_${status || "unknown"}`;
}

class UploadOffsetMismatchError extends Error {
  receivedBytes: number;

  constructor(receivedBytes: number) {
    super("upload_offset_mismatch");
    this.receivedBytes = receivedBytes;
  }
}

class UploadSessionExpiredError extends Error {
  constructor() {
    super("upload_session_not_found");
  }
}

function getUploadSessionFingerprint(file: File, folderPath: string | undefined) {
  return [file.name, String(file.size), file.type, String(file.lastModified), folderPath?.trim() ?? ""].join("::");
}

function getUploadSessionStorageKey(file: File, folderPath: string | undefined) {
  return `${UPLOAD_SESSION_STORAGE_PREFIX}:${getUploadSessionFingerprint(file, folderPath)}`;
}

function readStoredUploadSessionId(storageKey: string) {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    return window.localStorage.getItem(storageKey) || undefined;
  } catch {
    return undefined;
  }
}

function writeStoredUploadSessionId(storageKey: string, uploadId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, uploadId);
  } catch {
    // Ignore storage failures and continue without resumable persistence.
  }
}

function clearStoredUploadSessionId(storageKey: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore storage failures and continue.
  }
}

type UploadSessionStatus = {
  ok: true;
  uploadId: string;
  fileName: string;
  size: number;
  receivedBytes: number;
  maxSizeMb: number;
};

function isUploadErrorPayload(
  payload:
    | { ok: true; uploadId: string; receivedBytes: number; size: number }
    | { ok: true; url: string; fileName: string; asset: MediaLibraryAsset; library: MediaLibraryState }
    | { error?: string; receivedBytes?: number; maxSizeMb?: number }
    | null,
): payload is { error?: string; receivedBytes?: number; maxSizeMb?: number } {
  return Boolean(payload && "error" in payload);
}

async function createUploadSession(file: File, token: string, folderPath: string | undefined) {
  const response = await fetchWithFallback("/api/admin/media-library/upload-sessions", {
    method: "POST",
    headers: {
      ...createAdminHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      folderPath,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | (UploadSessionStatus & { error?: string; receivedBytes?: number })
    | { error?: string; maxSizeMb?: number }
    | null;

  if (!response.ok) {
    throw new Error(getUploadErrorMessage(payload, response.status));
  }

  return payload as UploadSessionStatus;
}

async function fetchUploadSessionStatus(uploadId: string, token: string) {
  const response = await fetchWithFallback(`/api/admin/media-library/upload-sessions/${uploadId}`, {
    headers: createAdminHeaders(token),
  });

  const payload = (await response.json().catch(() => null)) as
    | (UploadSessionStatus & { error?: string; receivedBytes?: number })
    | { error?: string; maxSizeMb?: number }
    | null;

  if (!response.ok) {
    if (payload?.error === "upload_session_not_found" || response.status === 404) {
      throw new UploadSessionExpiredError();
    }

    throw new Error(getUploadErrorMessage(payload, response.status));
  }

  return payload as UploadSessionStatus;
}

async function uploadChunk(
  uploadId: string,
  offset: number,
  chunk: Blob,
  token: string,
  onProgress?: (loadedBytes: number) => void,
) {
  const requestPath = appendQuery(`/api/admin/media-library/upload-sessions/${uploadId}/chunk`, {
    offset: String(offset),
  });
  const requestUrl = buildRequestUrl(runtimeApiBaseUrl ?? API_BASE_URL, requestPath);

  return new Promise<{ ok: true; uploadId: string; receivedBytes: number; size: number }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", requestUrl);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(event.loaded);
      }
    };

    xhr.onerror = () => {
      reject(new Error("upload_network_error"));
    };

    xhr.onload = () => {
      let payload:
        | { ok: true; uploadId: string; receivedBytes: number; size: number }
        | { error?: string; receivedBytes?: number; maxSizeMb?: number }
        | null = null;

      try {
        payload = (JSON.parse(xhr.responseText || "null") ?? null) as
          | { ok: true; uploadId: string; receivedBytes: number; size: number }
          | { error?: string; receivedBytes?: number; maxSizeMb?: number }
          | null;
      } catch {
        reject(new Error(getUploadErrorMessage(null, xhr)));
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload as { ok: true; uploadId: string; receivedBytes: number; size: number });
        return;
      }

      if (isUploadErrorPayload(payload) && payload.error === "upload_offset_mismatch" && typeof payload.receivedBytes === "number") {
        reject(new UploadOffsetMismatchError(payload.receivedBytes));
        return;
      }

      if ((isUploadErrorPayload(payload) && payload.error === "upload_session_not_found") || xhr.status === 404) {
        reject(new UploadSessionExpiredError());
        return;
      }

      reject(new Error(getUploadErrorMessage(payload, xhr)));
    };

    xhr.send(chunk);
  });
}

async function completeUploadSession(uploadId: string, token: string) {
  const response = await fetchWithFallback(`/api/admin/media-library/upload-sessions/${uploadId}/complete`, {
    method: "POST",
    headers: createAdminHeaders(token),
  });

  const payload = (await response.json().catch(() => null)) as
    | { ok: true; url: string; fileName: string; asset: MediaLibraryAsset; library: MediaLibraryState }
    | { error?: string; maxSizeMb?: number }
    | null;

  if (!response.ok) {
    if ((isUploadErrorPayload(payload) && payload.error === "upload_session_not_found") || response.status === 404) {
      throw new UploadSessionExpiredError();
    }

    throw new Error(getUploadErrorMessage(payload, response.status));
  }

  return payload as { ok: true; url: string; fileName: string; asset: MediaLibraryAsset; library: MediaLibraryState };
}

export async function loginAdmin(payload: { username: string; password: string }) {
  const response = await fetchWithFallback("/api/admin/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (errorPayload?.error === "setup_required") {
      throw new Error("后台尚未初始化，请先创建管理员账号");
    }

    throw new Error("登录失败，请检查账号密码");
  }

  return (await response.json()) as {
    ok: true;
    token: string;
    user: { username: string };
  };
}

export async function fetchAdminStatus() {
  const response = await fetchWithFallback("/api/admin/status");

  if (!response.ok) {
    throw new Error("无法获取后台状态");
  }

  return (await response.json()) as AdminStatus;
}

export async function setupAdmin(payload: { username: string; password: string }) {
  const response = await fetchWithFallback("/api/admin/setup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (errorPayload?.error === "already_initialized" || errorPayload?.error === "env_managed") {
      throw new Error("管理员已经初始化，直接登录即可");
    }

    throw new Error("初始化管理员失败，请检查输入内容");
  }

  return (await response.json()) as {
    ok: true;
    token: string;
    user: { username: string };
  };
}

export async function fetchAdminMe(token: string) {
  const response = await fetchWithFallback("/api/admin/me", {
    headers: createAdminHeaders(token),
  });

  if (!response.ok) {
    throw new Error("管理员登录态已失效");
  }

  return (await response.json()) as {
    ok: true;
    user: { username: string };
  };
}

export async function fetchAdminContent(token: string) {
  const response = await fetchWithFallback("/api/admin/content", {
    headers: createAdminHeaders(token),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch admin content");
  }

  return (await response.json()) as CmsContent;
}

export async function saveContent(content: CmsContent, token: string) {
  const response = await fetchWithFallback("/api/admin/content", {
    method: "PUT",
    headers: {
      ...createAdminHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(content),
  });

  if (!response.ok) {
    throw new Error("Failed to save content");
  }

  return (await response.json()) as { ok: true; content: CmsContent };
}

function getDownloadFileName(response: Response, fallback: string) {
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/i);
  return match?.[1] ?? fallback;
}

export async function downloadAdminBackup(token: string) {
  const response = await fetchWithFallback("/api/admin/backup", {
    headers: createAdminHeaders(token),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "backup_download_failed"));
  }

  return {
    fileName: getDownloadFileName(response, `quanyu-backup-${Date.now()}.json`),
    blob: await response.blob(),
  };
}

export async function downloadAiCopyPackage(token: string) {
  const response = await fetchWithFallback("/api/admin/backup/ai-copy", {
    headers: createAdminHeaders(token),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "ai_copy_download_failed"));
  }

  return {
    fileName: getDownloadFileName(response, `quanyu-ai-copy-package-${Date.now()}.json`),
    blob: await response.blob(),
  };
}

export async function restoreAdminBackup(file: File, token: string) {
  const formData = new FormData();
  formData.set("file", file);

  const response = await fetchWithFallback("/api/admin/backup/restore", {
    method: "POST",
    headers: createAdminHeaders(token),
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "backup_restore_failed"));
  }

  return (await response.json()) as {
    ok: true;
    restoredAt: string;
    summary: {
      articleCount: number;
      doctorCount: number;
      serviceCount: number;
      pricingCount: number;
      galleryCount: number;
      pageCount: number;
      chatSessionCount: number;
      mediaAssetCount: number;
      mediaFolderCount: number;
      uploadFileCount: number;
    };
  };
}

export async function restoreAiCopyPackage(file: File, token: string) {
  const formData = new FormData();
  formData.set("file", file);

  const response = await fetchWithFallback("/api/admin/backup/restore-ai-copy", {
    method: "POST",
    headers: createAdminHeaders(token),
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "ai_copy_restore_failed"));
  }

  return (await response.json()) as {
    ok: true;
    restoredAt: string;
  };
}

export async function uploadFile(
  file: File,
  token: string,
  options?: {
    folderPath?: string;
    onProgress?: (progress: number) => void;
    onTransferredBytes?: (uploadedBytes: number, totalBytes: number) => void;
  },
) {
  if (file.size > MAX_MEDIA_UPLOAD_SIZE_BYTES) {
    throw new Error(`文件过大，单个文件请不要超过 ${MAX_MEDIA_UPLOAD_SIZE_MB} MB`);
  }

  const sessionStorageKey = getUploadSessionStorageKey(file, options?.folderPath);
  let uploadId = readStoredUploadSessionId(sessionStorageKey);
  let session: UploadSessionStatus | null = null;

  if (uploadId) {
    try {
      session = await fetchUploadSessionStatus(uploadId, token);
    } catch (error) {
      if (error instanceof UploadSessionExpiredError) {
        clearStoredUploadSessionId(sessionStorageKey);
        uploadId = undefined;
      } else {
        throw error;
      }
    }
  }

  if (!uploadId || !session) {
    session = await createUploadSession(file, token, options?.folderPath);
    uploadId = session.uploadId;
    writeStoredUploadSessionId(sessionStorageKey, uploadId);
  }

  if (!session) {
    throw new Error("upload_session_not_found");
  }

  let uploadedBytes = session.receivedBytes;
  let retryCount = 0;
  options?.onTransferredBytes?.(uploadedBytes, file.size);
  options?.onProgress?.(Math.round((uploadedBytes / Math.max(file.size, 1)) * 100));

  while (uploadedBytes < file.size) {
    const chunkEnd = Math.min(uploadedBytes + MEDIA_UPLOAD_CHUNK_SIZE_BYTES, file.size);
    const chunk = file.slice(uploadedBytes, chunkEnd);

    try {
      const result = await uploadChunk(uploadId, uploadedBytes, chunk, token, (loadedBytes) => {
        const nextUploadedBytes = Math.min(uploadedBytes + loadedBytes, file.size);
        options?.onTransferredBytes?.(nextUploadedBytes, file.size);
        options?.onProgress?.(Math.round((nextUploadedBytes / Math.max(file.size, 1)) * 100));
      });

      uploadedBytes = result.receivedBytes;
      retryCount = 0;
      options?.onTransferredBytes?.(uploadedBytes, file.size);
      options?.onProgress?.(Math.round((uploadedBytes / Math.max(file.size, 1)) * 100));
    } catch (error) {
      if (error instanceof UploadOffsetMismatchError) {
        uploadedBytes = error.receivedBytes;
        options?.onTransferredBytes?.(uploadedBytes, file.size);
        options?.onProgress?.(Math.round((uploadedBytes / Math.max(file.size, 1)) * 100));
        retryCount = 0;
        continue;
      }

      if (error instanceof UploadSessionExpiredError) {
        clearStoredUploadSessionId(sessionStorageKey);
        session = await createUploadSession(file, token, options?.folderPath);
        uploadId = session.uploadId;
        uploadedBytes = session.receivedBytes;
        writeStoredUploadSessionId(sessionStorageKey, uploadId);
        retryCount = 0;
        continue;
      }

      const latestStatus = await fetchUploadSessionStatus(uploadId, token).catch(() => null);

      if (latestStatus) {
        if (latestStatus.receivedBytes !== uploadedBytes) {
          uploadedBytes = latestStatus.receivedBytes;
          options?.onTransferredBytes?.(uploadedBytes, file.size);
          options?.onProgress?.(Math.round((uploadedBytes / Math.max(file.size, 1)) * 100));
          retryCount = 0;
          continue;
        }

        retryCount += 1;

        if (retryCount <= 3) {
          continue;
        }
      }

      throw error;
    }
  }

  const result = await completeUploadSession(uploadId, token);
  clearStoredUploadSessionId(sessionStorageKey);
  options?.onTransferredBytes?.(file.size, file.size);
  options?.onProgress?.(100);
  return result;
}

export async function fetchMediaLibrary(token: string) {
  const response = await fetchWithFallback("/api/admin/media-library", {
    headers: createAdminHeaders(token),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to fetch media library"));
  }

  return (await response.json()) as { ok: true; library: MediaLibraryState };
}

export async function createMediaFolder(payload: { name: string; parentPath?: string }, token: string) {
  const response = await fetchWithFallback("/api/admin/media-library/folders", {
    method: "POST",
    headers: {
      ...createAdminHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "create_folder_failed"));
  }

  return (await response.json()) as { ok: true; library: MediaLibraryState };
}

export async function renameMediaFolder(payload: { path: string; newName: string }, token: string) {
  const response = await fetchWithFallback("/api/admin/media-library/folders", {
    method: "PATCH",
    headers: {
      ...createAdminHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "rename_folder_failed"));
  }

  return (await response.json()) as { ok: true; library: MediaLibraryState };
}

export async function copyMediaFolder(payload: { sourcePath: string; targetParentPath?: string; newName: string }, token: string) {
  const response = await fetchWithFallback("/api/admin/media-library/folders/copy", {
    method: "POST",
    headers: {
      ...createAdminHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "copy_folder_failed"));
  }

  return (await response.json()) as { ok: true; library: MediaLibraryState };
}

export async function updateMediaAsset(id: string, payload: { title?: string; folderPath?: string }, token: string) {
  const response = await fetchWithFallback(`/api/admin/media-library/assets/${id}`, {
    method: "PATCH",
    headers: {
      ...createAdminHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "update_asset_failed"));
  }

  return (await response.json()) as { ok: true; asset: MediaLibraryAsset; library: MediaLibraryState };
}

export async function deleteMediaAsset(id: string, token: string) {
  const response = await fetchWithFallback(`/api/admin/media-library/assets/${id}`, {
    method: "DELETE",
    headers: createAdminHeaders(token),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "delete_asset_failed"));
  }

  return (await response.json()) as { ok: true; library: MediaLibraryState };
}

export async function fetchChatSessions(token: string) {
  const response = await fetchWithFallback("/api/chat/sessions", {
    headers: createAdminHeaders(token),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch chat sessions");
  }

  return (await response.json()) as ChatSession[];
}

export async function sendChatMessage(payload: {
  sessionId: string;
  visitorId: string;
  language: "zh" | "ru" | "en";
  message: string;
}) {
  const response = await fetchWithFallback("/api/chat/triage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Failed to send chat message");
  }

  return (await response.json()) as {
    ok: true;
    sessionId: string;
    assistantMessage: { id: string; role: "assistant"; content: string; createdAt: string };
    triage: {
      intent: string;
      urgent: boolean;
      recommendedAction: string;
      suggestedNextStep: string;
    };
  };
}
