"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Sparkles, X } from "lucide-react";
import { idePalette } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";
import { terminalLog } from "@/lib/ide/terminal-log";
import { loadAssistant } from "@/app/ide/actions";
import { ChatComposer } from "./ChatComposer";

/**
 * Mindfries AI — the candidate's assistant during an assessment.
 *
 * The copy below is a **behavioural contract, not decoration**. It tells the
 * candidate this assistant explains and discusses but does not write their
 * solution, and that the conversation forms part of the session's evidence
 * (PRD §1.7 counts AI usage as an evidence dimension). The backend's system
 * prompt (candidate/backend/internal/llm/conversation.go) enforces the same
 * boundary — if the UI promises "it won't write the solution" and the model
 * happily does, the product is lying to the person being assessed. Change
 * one, change the other.
 *
 * Telling the candidate their AI use is observed is the same principle as the
 * camera disclosure: they can see what is being captured, before it happens.
 * That includes copying out of this panel, which is recorded, and whether
 * code the assistant showed ends up in what they submit, which the backend
 * checks at the end.
 *
 * Every exchange goes through the backend, which answers with the task
 * brief, the project's files and the terminal's recent output as context,
 * and records both sides as `ai_usage` events. The conversation is therefore
 * the session's, not this component's: it is reloaded from the backend on
 * mount. Replies are streamed (see app/api/assistant/route.ts) and shown as
 * they are written.
 *
 * The hiring company can switch the assistant off for a role, or cap how
 * many messages a candidate may send; the panel says which applies. Outside
 * a real session — a scratch workspace, or no model configured — it says the
 * assistant is unavailable rather than answering with something made up.
 */

interface Message {
  id: number;
  author: "you" | "assistant" | "notice";
  text: string;
}

interface ChatPanelProps {
  theme: IdeTheme;
  /** The real session this workspace belongs to. Undefined in a scratch workspace. */
  sessionId?: string;
  /** The file open in the editor, sent with each question as context. */
  activePath?: string | null;
  activeContent?: string;
  /** The project's files as they stand, read when a question is sent. */
  getFiles?: () => Record<string, string>;
  /** The candidate copied this many characters out of the conversation. */
  onCopy?: (chars: number) => void;
  onClose: () => void;
}

const SCRATCH = "The assistant is only available inside an assessment. Start one from your dashboard.";
const NOT_CONFIGURED = "The assistant isn't switched on for this workspace yet, so it can't answer.";
const SWITCHED_OFF = "The hiring team has switched the assistant off for this assessment.";
const NOT_RECORDED = "Your message wasn't recorded.";

/**
 * Reads a server-sent event stream, calling `onEvent` for each event as it
 * completes. Events are separated by a blank line; each has an `event:` name
 * and one `data:` line of JSON.
 */
async function readEvents(body: ReadableStream<Uint8Array>, onEvent: (name: string, data: Record<string, unknown>) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let name = "message";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) name = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      try {
        onEvent(name, JSON.parse(data));
      } catch {
        // a malformed event is skipped; the "done" event carries the whole reply anyway
      }
    }
  }
}

export function ChatPanel({ theme, sessionId, activePath, activeContent, getFiles, onCopy, onClose }: ChatPanelProps) {
  const palette = idePalette(theme);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  // undefined while the history request is in flight; a string once we know
  // the assistant can't be used here, and why.
  const [unavailable, setUnavailable] = useState<string | undefined>(sessionId ? undefined : SCRATCH);
  // How many messages the role allows and how many have been sent. Null
  // until the backend has said.
  const [allowance, setAllowance] = useState<{ limit: number; used: number } | null>(null);
  const nextId = useRef(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    void loadAssistant(sessionId).then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        setUnavailable(result.error);
        return;
      }
      if (!result.configured) setUnavailable(NOT_CONFIGURED);
      else if (!result.enabled) setUnavailable(SWITCHED_OFF);
      if (result.limit > 0) setAllowance({ limit: result.limit, used: result.used });
      setMessages(
        result.messages.map((turn) => ({
          id: nextId.current++,
          author: turn.role === "candidate" ? "you" : "assistant",
          text: turn.text,
        })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, pending]);

  const left = allowance ? Math.max(0, allowance.limit - allowance.used) : null;
  const spent = left === 0;

  const send = async () => {
    const text = draft.trim();
    if (!text || pending || !sessionId || unavailable || spent) return;
    // Both ids are taken now: the reply's is needed before it exists, so
    // each piece of it can replace the one before.
    const questionId = nextId.current++;
    const replyId = nextId.current++;
    setMessages((prev) => [...prev, { id: questionId, author: "you", text }]);
    setDraft("");
    setPending(true);

    const setReply = (author: Message["author"], replyText: string) =>
      setMessages((prev) => {
        const rest = prev.filter((m) => m.id !== replyId);
        return [...rest, { id: replyId, author, text: replyText }];
      });
    const fail = (reason: string) => setReply("notice", `${reason} ${NOT_RECORDED}`);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          message: text,
          filePath: activePath ?? "",
          fileContent: activeContent ?? "",
          files: getFiles?.() ?? {},
          terminal: terminalLog.read(),
        }),
      });
      if (!res.ok || !res.body || !res.headers.get("Content-Type")?.startsWith("text/event-stream")) {
        // Refused before any reply: the backend said why.
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        fail(body?.error ?? "The AI service didn't answer — try again.");
        return;
      }

      let written = "";
      let finished = false;
      await readEvents(res.body, (name, data) => {
        if (name === "delta" && typeof data.text === "string") {
          written += data.text;
          setReply("assistant", written);
        } else if (name === "done" && typeof data.reply === "string") {
          finished = true;
          setReply("assistant", data.reply);
        } else if (name === "error") {
          finished = true;
          fail(typeof data.error === "string" ? data.error : "The reply was cut off.");
        }
      });
      if (!finished) {
        fail("The reply was cut off.");
        return;
      }
      setAllowance((prev) => (prev ? { ...prev, used: prev.used + 1 } : prev));
    } catch {
      fail("The AI service couldn't be reached — try again.");
    } finally {
      setPending(false);
    }
  };

  const streaming = pending && messages[messages.length - 1]?.author === "assistant";

  return (
    <div className={clsx("flex h-full min-h-0 flex-col", palette.appBg)}>
      <div
        className={clsx(
          "flex h-8 shrink-0 items-center justify-between border-b px-2 text-xs",
          palette.border,
          palette.panelBg
        )}
      >
        <span className={clsx("flex items-center gap-1.5", palette.text)}>
          <Sparkles size={13} className={palette.accent} />
          Mindfries AI
        </span>
        <span className="flex items-center gap-2">
          {left !== null && !unavailable && (
            <span className={clsx("tabular-nums", left <= 3 ? "text-red-400" : palette.textMuted)} title="Messages you can still send in this assessment">
              {left} left
            </span>
          )}
          <button type="button" title="Close" onClick={onClose} className={clsx("rounded-md p-1", palette.hover)}>
            <X size={13} />
          </button>
        </span>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3"
        onCopy={() => {
          const chars = window.getSelection()?.toString().length ?? 0;
          if (chars > 0) onCopy?.(chars);
        }}
      >
        {messages.length === 0 && (
          <div className={clsx("space-y-2.5 text-xs leading-relaxed", palette.textMuted)}>
            <p className={palette.text}>
              An assistant for the assessment — not a coding agent.
            </p>
            <p>
              Ask it to explain unfamiliar code, unpack an error, or think through an approach
              with you. It won&apos;t write the solution or hand you code to paste: what&apos;s
              being assessed is how <em>you</em> work.
            </p>
            <p>
              Your conversation here forms part of the evidence from this session, so a sharp
              question is worth more than asking for the answer. It can see the task, the files
              in your project and the recent output of your terminal.
            </p>
            <p>
              Copying out of this panel is recorded, and the report notes whether code it showed
              you appears in what you submit.
            </p>
          </div>
        )}

        {messages.map((message) =>
          message.author === "notice" ? (
            <p key={message.id} className="rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {message.text}
            </p>
          ) : (
            <div
              key={message.id}
              className={clsx("flex", message.author === "you" ? "justify-end" : "justify-start")}
            >
              <div
                className={clsx(
                  "max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap",
                  message.author === "you"
                    ? "bg-[#4A7FA7] text-[#F6FAFD]"
                    : clsx("border", palette.border, palette.panelBg, palette.text)
                )}
              >
                {message.text}
              </div>
            </div>
          ),
        )}

        {pending && !streaming && <p className={clsx("text-xs", palette.textMuted)}>Thinking…</p>}
        {unavailable && <p className={clsx("text-xs", palette.textMuted)}>{unavailable}</p>}
        {spent && !unavailable && (
          <p className={clsx("text-xs", palette.textMuted)}>
            You&apos;ve used all {allowance?.limit} of the assistant messages allowed for this assessment.
          </p>
        )}
      </div>

      <div className={clsx("shrink-0 border-t p-2.5", palette.border)}>
        <ChatComposer theme={theme} draft={draft} onDraftChange={setDraft} onSend={() => void send()} />
      </div>
    </div>
  );
}
