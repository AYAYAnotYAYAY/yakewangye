import type { ChatMessageRecord, ChatSession, TriageResult } from "@quanyu/shared";
import { chatRepository } from "./storage/chat-repository";

export async function listChatSessions(): Promise<ChatSession[]> {
  return chatRepository.list();
}

export async function getOrCreateChatSession(params: {
  sessionId: string;
  language: "zh" | "ru" | "en";
  visitorId: string;
}) {
  return chatRepository.getOrCreate(params);
}

export async function appendChatMessage(sessionId: string, message: ChatMessageRecord) {
  return chatRepository.appendMessage(sessionId, message);
}

export async function updateChatTriage(sessionId: string, triage: TriageResult) {
  return chatRepository.updateTriage(sessionId, triage);
}
