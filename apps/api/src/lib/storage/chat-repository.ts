import { readFile, writeFile } from "node:fs/promises";
import { chatSessionSchema, type ChatMessageRecord, type ChatSession, type TriageResult } from "@quanyu/shared";
import { ensureChatStorage, getLocalStoragePaths } from "./storage-paths";

export type ChatRepository = {
  list: () => Promise<ChatSession[]>;
  getOrCreate: (params: { sessionId: string; language: "zh" | "ru" | "en"; visitorId: string }) => Promise<ChatSession>;
  appendMessage: (sessionId: string, message: ChatMessageRecord) => Promise<ChatSession>;
  updateTriage: (sessionId: string, triage: TriageResult) => Promise<ChatSession>;
};

function createJsonChatRepository(): ChatRepository {
  const { chatSessionsFilePath: sessionsFilePath } = getLocalStoragePaths();

  async function ensureSessionsFile() {
    await ensureChatStorage();
  }

  async function readSessions() {
    await ensureSessionsFile();
    const raw = await readFile(sessionsFilePath, "utf8");
    const parsed = JSON.parse(raw) as unknown[];
    return parsed.map((item) => chatSessionSchema.parse(item));
  }

  async function writeSessions(sessions: ChatSession[]) {
    await ensureSessionsFile();
    await writeFile(sessionsFilePath, JSON.stringify(sessions, null, 2), "utf8");
  }

  return {
    async list() {
      return readSessions();
    },
    async getOrCreate(params) {
      const sessions = await readSessions();
      const existing = sessions.find((session) => session.sessionId === params.sessionId);

      if (existing) {
        return existing;
      }

      const now = new Date().toISOString();
      const created: ChatSession = {
        sessionId: params.sessionId,
        language: params.language,
        visitorId: params.visitorId,
        startedAt: now,
        updatedAt: now,
        messages: [],
      };

      sessions.push(created);
      await writeSessions(sessions);
      return created;
    },
    async appendMessage(sessionId, message) {
      const sessions = await readSessions();
      const target = sessions.find((session) => session.sessionId === sessionId);

      if (!target) {
        throw new Error(`Chat session not found: ${sessionId}`);
      }

      target.messages.push(message);
      target.updatedAt = message.createdAt;
      await writeSessions(sessions);
      return target;
    },
    async updateTriage(sessionId, triage) {
      const sessions = await readSessions();
      const target = sessions.find((session) => session.sessionId === sessionId);

      if (!target) {
        throw new Error(`Chat session not found: ${sessionId}`);
      }

      target.triage = triage;
      target.updatedAt = new Date().toISOString();
      await writeSessions(sessions);
      return target;
    },
  };
}

export const chatRepository: ChatRepository = createJsonChatRepository();
