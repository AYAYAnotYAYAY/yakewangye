import type { ChatSession, CmsContent, MediaLibraryAsset, MediaLibraryState } from "@quanyu/shared";

const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
export const ADMIN_TOKEN_STORAGE_KEY = "quanyu_admin_token";
let runtimeApiBaseUrl: string | undefined = API_BASE_URL || undefined;

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

function getUploadErrorMessage(payload: { error?: string; maxSizeMb?: number } | null, xhr: XMLHttpRequest) {
  if (payload?.error === "file_too_large") {
    return `文件过大，单个文件请不要超过 ${payload.maxSizeMb ?? 128} MB`;
  }

  if (payload?.error === "no_file_uploaded") {
    return "没有检测到要上传的文件";
  }

  if (payload?.error) {
    return payload.error;
  }

  if (xhr.status === 413) {
    return "文件过大，上传请求被服务器拒绝";
  }

  if (xhr.status === 415) {
    return "当前只支持图片和视频素材";
  }

  return `upload_failed_${xhr.status || "unknown"}`;
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

export async function uploadFile(
  file: File,
  token: string,
  options?: {
    folderPath?: string;
    onProgress?: (progress: number) => void;
  },
) {
  const formData = new FormData();
  formData.append("file", file);
  const requestPath = appendQuery("/api/admin/media-library/upload", {
    folderPath: options?.folderPath,
  });

  return new Promise<{ ok: true; url: string; fileName: string; asset: MediaLibraryAsset; library: MediaLibraryState }>((resolve, reject) => {
    const candidates = getApiBaseCandidates();
    let candidateIndex = 0;
    let settled = false;

    const attemptUpload = () => {
      const base = candidates[candidateIndex];
      const xhr = new XMLHttpRequest();
      const requestUrl = buildRequestUrl(base, requestPath);

      xhr.open("POST", requestUrl);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          options?.onProgress?.(Math.round((event.loaded / event.total) * 100));
        }
      };

      xhr.onerror = () => {
        if (settled) {
          return;
        }

        candidateIndex += 1;

        if (candidateIndex < candidates.length) {
          attemptUpload();
          return;
        }

        settled = true;
        reject(new Error("upload_network_error"));
      };

      xhr.onload = () => {
        if (settled) {
          return;
        }

        try {
          const payload = (JSON.parse(xhr.responseText || "null") ?? null) as { error?: string; maxSizeMb?: number } | null;

          if (xhr.status < 200 || xhr.status >= 300) {
            settled = true;
            reject(new Error(getUploadErrorMessage(payload, xhr)));
            return;
          }

          runtimeApiBaseUrl = base;
          options?.onProgress?.(100);
          settled = true;
          resolve(payload as { ok: true; url: string; fileName: string; asset: MediaLibraryAsset; library: MediaLibraryState });
        } catch {
          settled = true;
          reject(new Error(getUploadErrorMessage(null, xhr)));
        }
      };

      xhr.send(formData);
    };

    attemptUpload();
  });
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
