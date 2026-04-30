import type { Language } from "@quanyu/shared";
import { useEffect, useMemo, useState } from "react";
import { sendChatMessage } from "../lib/api";
import type { UiDictionary } from "../lib/i18n";

type ChatWidgetProps = {
  telegramUrl: string;
  language: Language;
  dictionary: UiDictionary;
};

type LocalMessage = {
  role: "assistant" | "user";
  content: string;
};

function getStableId(key: string) {
  const existing = window.localStorage.getItem(key);

  if (existing) {
    return existing;
  }

  const created = `${key}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  window.localStorage.setItem(key, created);
  return created;
}

export function ChatWidget({ telegramUrl, language, dictionary }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<LocalMessage[]>([
    {
      role: "assistant",
      content: dictionary.chatWelcome,
    },
  ]);
  const [triageText, setTriageText] = useState("");

  const ids = useMemo(
    () => ({
      sessionId: getStableId("quanyu-chat-session"),
      visitorId: getStableId("quanyu-chat-visitor"),
    }),
    [],
  );

  useEffect(() => {
    setMessages([{ role: "assistant", content: dictionary.chatWelcome }]);
    setTriageText("");
    setInput("");
  }, [dictionary.chatWelcome, language]);

  const submit = async () => {
    const message = input.trim();

    if (!message || sending) {
      return;
    }

    setSending(true);
    setMessages((current) => [...current, { role: "user", content: message }]);
    setInput("");

    try {
      const result = await sendChatMessage({
        sessionId: ids.sessionId,
        visitorId: ids.visitorId,
        language,
        message,
      });

      setMessages((current) => [...current, { role: "assistant", content: result.assistantMessage.content }]);
      setTriageText(
        `${result.triage.urgent ? dictionary.chatUrgent : dictionary.chatContinue} ${result.triage.suggestedNextStep}`,
      );
    } catch (error) {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: `${dictionary.chatErrorPrefix}${String(error)}` },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`chat-widget ${open ? "open" : ""}`}>
      {open ? (
        <div className="chat-panel card">
          <div className="chat-head">
            <div>
              <strong>{dictionary.chatTitle}</strong>
              <div className="chat-subtitle">{dictionary.chatSubtitle}</div>
            </div>
            <button className="button secondary" type="button" onClick={() => setOpen(false)}>
              {dictionary.chatCollapse}
            </button>
          </div>
          <div className="chat-messages">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`chat-bubble ${message.role}`}>
                {message.content}
              </div>
            ))}
          </div>
          {triageText ? <div className="chat-triage">{triageText}</div> : null}
          <div className="chat-actions">
            <textarea
              placeholder={dictionary.chatPlaceholder}
              value={input}
              maxLength={1200}
              onChange={(event) => setInput(event.target.value)}
            />
            <div className="chat-buttons">
              <a className="button secondary" href={telegramUrl} target="_blank" rel="noreferrer">
                {dictionary.chatTelegram}
              </a>
              <button className="button primary" type="button" onClick={submit} disabled={sending}>
                {sending ? dictionary.chatSending : dictionary.chatSend}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button className="chat-open button primary" type="button" onClick={() => setOpen(true)}>
          {dictionary.chatOpen}
        </button>
      )}
    </div>
  );
}
