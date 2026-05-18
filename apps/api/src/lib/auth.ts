import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { ensureAdminStorage, getLocalStoragePaths } from "./storage/storage-paths";

const adminLoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const adminSetupSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(8),
});

export type AdminTokenPayload = {
  username: string;
  exp: number;
};

type AdminFileConfig = {
  username: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

type AdminCredentialSource =
  | {
      initialized: true;
      source: "env" | "file";
      username: string;
      passwordHash: string;
    }
  | {
      initialized: false;
      source: "setup_required";
    };

const { adminConfigFilePath } = getLocalStoragePaths();

// --- Login rate limiting & lockout ---
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const MAX_LOGIN_ATTEMPTS_PER_WINDOW = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

type IpLoginState = {
  failedCount: number;
  lockedUntil: number;
  windowStart: number;
  windowCount: number;
};

const ipLoginStates = new Map<string, IpLoginState>();

export function getLoginRateLimitCleanup() {
  const now = Date.now();
  for (const [ip, state] of ipLoginStates.entries()) {
    if (state.windowStart + RATE_LIMIT_WINDOW_MS < now && state.lockedUntil < now) {
      ipLoginStates.delete(ip);
    }
  }
}

export function checkLoginLockout(ip: string): { allowed: false; retryAfterMs?: number } | { allowed: true } {
  getLoginRateLimitCleanup();
  const state = ipLoginStates.get(ip);

  if (!state) {
    return { allowed: true };
  }

  if (state.lockedUntil > Date.now()) {
    return { allowed: false, retryAfterMs: state.lockedUntil - Date.now() };
  }

  if (state.windowStart + RATE_LIMIT_WINDOW_MS < Date.now()) {
    // Reset window if expired and not locked
    ipLoginStates.delete(ip);
    return { allowed: true };
  }

  if (state.windowCount >= MAX_LOGIN_ATTEMPTS_PER_WINDOW) {
    return { allowed: false, retryAfterMs: state.windowStart + RATE_LIMIT_WINDOW_MS - Date.now() };
  }

  return { allowed: true };
}

export function recordFailedLogin(ip: string) {
  const now = Date.now();
  let state = ipLoginStates.get(ip);

  if (!state || state.windowStart + RATE_LIMIT_WINDOW_MS < now) {
    state = { failedCount: 0, lockedUntil: 0, windowStart: now, windowCount: 0 };
  }

  state.failedCount++;
  state.windowCount++;

  if (state.failedCount >= MAX_FAILED_ATTEMPTS) {
    state.lockedUntil = now + LOCKOUT_DURATION_MS;
  }

  ipLoginStates.set(ip, state);
}

export function resetLoginLockout(ip: string) {
  ipLoginStates.delete(ip);
}

function getAdminUsernameFromEnv() {
  return process.env.ADMIN_USERNAME?.trim() ?? "";
}

function getAdminPasswordFromEnv() {
  return process.env.ADMIN_PASSWORD?.trim() ?? "";
}

function getAdminTokenSecret() {
  const secret = process.env.ADMIN_TOKEN_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "ADMIN_TOKEN_SECRET environment variable is required for production. " +
        "Generate a strong random secret: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return secret;
}

function sign(value: string) {
  return createHmac("sha256", getAdminTokenSecret()).update(value).digest("hex");
}

function encodePayload(payload: AdminTokenPayload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodePayload(raw: string) {
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  return JSON.parse(decoded) as AdminTokenPayload;
}

function legacyHashPassword(password: string) {
  return createHash("sha256").update(`${getAdminTokenSecret()}::${password}`).digest("hex");
}

function hashPasswordForStorage(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password: string, storedHash: string) {
  if (storedHash.startsWith("scrypt$")) {
    const [, salt, hash] = storedHash.split("$");

    if (!salt || !hash) {
      return false;
    }

    const incoming = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    return incoming.length === expected.length && timingSafeEqual(incoming, expected);
  }

  const incomingHash = legacyHashPassword(password);
  return (
    incomingHash.length === storedHash.length &&
    timingSafeEqual(Buffer.from(incomingHash), Buffer.from(storedHash))
  );
}

async function readAdminFileConfig() {
  await ensureAdminStorage();

  try {
    const raw = await readFile(adminConfigFilePath, "utf8");
    return JSON.parse(raw) as AdminFileConfig;
  } catch {
    return null;
  }
}

async function writeAdminFileConfig(config: AdminFileConfig) {
  await mkdir(path.dirname(adminConfigFilePath), { recursive: true });
  await ensureAdminStorage();
  await writeFile(adminConfigFilePath, JSON.stringify(config, null, 2), "utf8");
}

async function resolveAdminCredentialSource(): Promise<AdminCredentialSource> {
  const envUsername = getAdminUsernameFromEnv();
  const envPassword = getAdminPasswordFromEnv();

  if (envUsername && envPassword) {
    return {
      initialized: true,
      source: "env",
      username: envUsername,
      passwordHash: legacyHashPassword(envPassword),
    };
  }

  const fileConfig = await readAdminFileConfig();

  if (fileConfig?.username && fileConfig.passwordHash) {
    return {
      initialized: true,
      source: "file",
      username: fileConfig.username,
      passwordHash: fileConfig.passwordHash,
    };
  }

  return {
    initialized: false,
    source: "setup_required",
  };
}

export function parseAdminLogin(body: unknown) {
  return adminLoginSchema.safeParse(body);
}

export function parseAdminSetup(body: unknown) {
  return adminSetupSchema.safeParse(body);
}

export async function getAdminStatus() {
  const resolved = await resolveAdminCredentialSource();

  if (!resolved.initialized) {
    return resolved;
  }

  return {
    initialized: true as const,
    source: resolved.source,
    username: resolved.username,
  };
}

export async function initializeAdminCredentials(username: string, password: string) {
  const current = await resolveAdminCredentialSource();

  if (current.initialized) {
    return {
      ok: false as const,
      reason: current.source === "env" ? "env_managed" : "already_initialized",
    };
  }

  const now = new Date().toISOString();
  await writeAdminFileConfig({
    username,
    passwordHash: hashPasswordForStorage(password),
    createdAt: now,
    updatedAt: now,
  });

  return {
    ok: true as const,
    username,
  };
}

export async function validateAdminCredentials(username: string, password: string) {
  const resolved = await resolveAdminCredentialSource();

  if (!resolved.initialized) {
    return {
      ok: false as const,
      reason: "setup_required",
    };
  }

  if (username === resolved.username && verifyPassword(password, resolved.passwordHash)) {
    return {
      ok: true as const,
      username: resolved.username,
      source: resolved.source,
    };
  }

  return {
    ok: false as const,
    reason: "invalid_credentials",
  };
}

export function issueAdminToken(username: string) {
  const payload = encodePayload({
    username,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
  });

  return `${payload}.${sign(payload)}`;
}

export function verifyAdminToken(token: string) {
  const [payload, signature] = token.split(".");

  if (!payload || !signature) {
    return null;
  }

  const expected = sign(payload);

  if (expected.length !== signature.length) {
    return null;
  }

  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    return null;
  }

  const decoded = decodePayload(payload);

  if (!decoded.username || decoded.exp < Date.now()) {
    return null;
  }

  return decoded;
}

export function extractBearerToken(request: FastifyRequest) {
  const header = request.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length).trim();
}

export function unauthorized(reply: FastifyReply, error = "Unauthorized") {
  return reply.status(401).send({
    ok: false,
    error,
  });
}

export function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const token = extractBearerToken(request);

  if (!token) {
    unauthorized(reply);
    return null;
  }

  const payload = verifyAdminToken(token);

  if (!payload) {
    unauthorized(reply, "Invalid admin token");
    return null;
  }

  return payload;
}

/**
 * Change admin password for file-based credentials.
 * Used by yk.sh CLI tool. env-based credentials must be changed via .env file.
 */
export async function changeAdminPassword(oldPassword: string, newPassword: string): Promise<
  | { ok: true; message: string }
  | { ok: false; error: string }
> {
  const resolved = await resolveAdminCredentialSource();

  if (!resolved.initialized) {
    return { ok: false, error: "setup_required: 管理员账号尚未初始化" };
  }

  if (resolved.source === "env") {
    return {
      ok: false,
      error: "env_managed: 密码由环境变量 ADMIN_PASSWORD 管理，请直接修改 .env 文件后重启 PM2",
    };
  }

  // Validate old password
  if (!verifyPassword(oldPassword, resolved.passwordHash)) {
    return { ok: false, error: "invalid_credentials: 旧密码验证失败" };
  }

  // Validate new password complexity
  const complexityError = validatePasswordComplexity(newPassword);
  if (complexityError) {
    return { ok: false, error: `weak_password: ${complexityError}` };
  }

  const fileConfig = await readAdminFileConfig();
  if (!fileConfig) {
    return { ok: false, error: "config_read_failed: 无法读取管理员配置文件" };
  }

  const now = new Date().toISOString();
  await writeAdminFileConfig({
    ...fileConfig,
    passwordHash: hashPasswordForStorage(newPassword),
    updatedAt: now,
  });

  return { ok: true, message: "管理员密码已成功修改" };
}

/**
 * Validate password meets minimum complexity requirements:
 * - At least 10 characters
 * - Contains uppercase letter
 * - Contains lowercase letter
 * - Contains digit
 * - Contains special character
 */
export function validatePasswordComplexity(password: string): string | null {
  if (password.length < 10) {
    return "密码长度至少 10 位";
  }
  if (!/[A-Z]/.test(password)) {
    return "密码必须包含大写字母";
  }
  if (!/[a-z]/.test(password)) {
    return "密码必须包含小写字母";
  }
  if (!/[0-9]/.test(password)) {
    return "密码必须包含数字";
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) {
    return "密码必须包含特殊字符";
  }
  return null;
}
