import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

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

const repoRoot = process.env.INIT_CWD ? path.resolve(process.env.INIT_CWD) : path.resolve(process.cwd(), "..", "..");
const adminConfigFilePath = path.resolve(repoRoot, "data/admin-config.json");

function getAdminUsernameFromEnv() {
  return process.env.ADMIN_USERNAME?.trim() ?? "";
}

function getAdminPasswordFromEnv() {
  return process.env.ADMIN_PASSWORD?.trim() ?? "";
}

function getAdminTokenSecret() {
  return process.env.ADMIN_TOKEN_SECRET ?? "quanyu-dev-secret";
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

function hashPassword(password: string) {
  return createHash("sha256").update(`${getAdminTokenSecret()}::${password}`).digest("hex");
}

async function readAdminFileConfig() {
  try {
    const raw = await readFile(adminConfigFilePath, "utf8");
    return JSON.parse(raw) as AdminFileConfig;
  } catch {
    return null;
  }
}

async function writeAdminFileConfig(config: AdminFileConfig) {
  await mkdir(path.dirname(adminConfigFilePath), { recursive: true });
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
      passwordHash: hashPassword(envPassword),
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
    passwordHash: hashPassword(password),
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

  const incomingHash = hashPassword(password);

  if (
    username === resolved.username &&
    incomingHash.length === resolved.passwordHash.length &&
    timingSafeEqual(Buffer.from(incomingHash), Buffer.from(resolved.passwordHash))
  ) {
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
