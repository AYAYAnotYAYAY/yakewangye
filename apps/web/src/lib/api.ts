import type { ChatSession, CmsContent } from "@quanyu/shared";

const API_BASE_URL = "http://localhost:4000";
export const ADMIN_TOKEN_STORAGE_KEY = "quanyu_admin_token";

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

export function resolveAssetUrl(value: string) {
  if (!value) {
    return "";
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  if (value.startsWith("/")) {
    return `${API_BASE_URL}${value}`;
  }

  return value;
}

export async function fetchContent() {
  const response = await fetch(`${API_BASE_URL}/api/content`);

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

export async function loginAdmin(payload: { username: string; password: string }) {
  const response = await fetch(`${API_BASE_URL}/api/admin/login`, {
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
  const response = await fetch(`${API_BASE_URL}/api/admin/status`);

  if (!response.ok) {
    throw new Error("无法获取后台状态");
  }

  return (await response.json()) as AdminStatus;
}

export async function setupAdmin(payload: { username: string; password: string }) {
  const response = await fetch(`${API_BASE_URL}/api/admin/setup`, {
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
  const response = await fetch(`${API_BASE_URL}/api/admin/me`, {
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
  const response = await fetch(`${API_BASE_URL}/api/admin/content`, {
    headers: createAdminHeaders(token),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch admin content");
  }

  return (await response.json()) as CmsContent;
}

export async function saveContent(content: CmsContent, token: string) {
  const response = await fetch(`${API_BASE_URL}/api/admin/content`, {
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

export async function uploadFile(file: File, token: string) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/admin/upload`, {
    method: "POST",
    headers: createAdminHeaders(token),
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Failed to upload file");
  }

  return (await response.json()) as { ok: true; url: string; fileName: string };
}

export async function fetchChatSessions(token: string) {
  const response = await fetch(`${API_BASE_URL}/api/chat/sessions`, {
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
  const response = await fetch(`${API_BASE_URL}/api/chat/triage`, {
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
