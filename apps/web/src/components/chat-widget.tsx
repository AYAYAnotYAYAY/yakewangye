import { useMemo, useState } from "react";
import { sendChatMessage } from "../lib/api";

type ChatWidgetProps = {
  telegramUrl: string;
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

export function ChatWidget({ telegramUrl }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<LocalMessage[]>([
    {
      role: "assistant",
      content: "你好，我是泉寓门诊的 AI 导诊助手。你可以先告诉我你的症状、持续多久了、是否疼痛或出血。",
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
        language: "zh",
        message,
      });

      setMessages((current) => [...current, { role: "assistant", content: result.assistantMessage.content }]);
      setTriageText(
        `${result.triage.urgent ? "当前判断：较高紧急度。" : "当前判断：可继续初步问诊。"} ${result.triage.suggestedNextStep}`,
      );
    } catch (error) {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: `发送失败：${String(error)}` },
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
              <strong>AI 问诊助手</strong>
              <div className="chat-subtitle">后台可配置模型、API 地址和提示词</div>
            </div>
            <button className="button secondary" type="button" onClick={() => setOpen(false)}>
              收起
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
              placeholder="例如：右下牙疼两天了，晚上更疼，还没拍片"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
            <div className="chat-buttons">
              <a className="button secondary" href={telegramUrl} target="_blank" rel="noreferrer">
                去 Telegram
              </a>
              <button className="button primary" type="button" onClick={submit} disabled={sending}>
                {sending ? "发送中..." : "发送"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button className="chat-open button primary" type="button" onClick={() => setOpen(true)}>
          AI 问诊
        </button>
      )}
    </div>
  );
}
