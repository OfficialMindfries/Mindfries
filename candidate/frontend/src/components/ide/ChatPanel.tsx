"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Sparkles, X } from "lucide-react";
import { idePalette } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";
import { askWorkspaceAssistant, loadAssistant } from "@/app/ide/actions";
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
 *
 * Every exchange goes through the backend, which answers with the task brief
 * and the open file as context and records both sides as `ai_usage` events.
 * The conversation is therefore the session's, not this component's: it is
 * reloaded from the backend on mount. Outside a real session — a scratch
 * workspace, or no model configured — the panel says the assistant is
 * unavailable rather than answering with something made up.
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
  onClose: () => void;
}

const SCRATCH = "The assistant is only available inside an assessment. Start one from your dashboard.";
const NOT_CONFIGURED = "The assistant isn't switched on for this workspace yet, so it can't answer.";

export function ChatPanel({ theme, sessionId, activePath, activeContent, onClose }: ChatPanelProps) {
  const palette = idePalette(theme);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  // undefined while the history request is in flight; a string once we know
  // the assistant can't be used here, and why.
  const [unavailable, setUnavailable] = useState<string | undefined>(sessionId ? undefined : SCRATCH);
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

  const send = async () => {
    const text = draft.trim();
    if (!text || pending || !sessionId || unavailable) return;
    setMessages((prev) => [...prev, { id: nextId.current++, author: "you", text }]);
    setDraft("");
    setPending(true);
    const result = await askWorkspaceAssistant(sessionId, text, activePath ?? undefined, activeContent);
    setPending(false);
    setMessages((prev) => [
      ...prev,
      "error" in result
        ? { id: nextId.current++, author: "notice", text: `${result.error} Your message wasn't recorded.` }
        : { id: nextId.current++, author: "assistant", text: result.reply },
    ]);
  };

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
        <button type="button" title="Close" onClick={onClose} className={clsx("rounded-md p-1", palette.hover)}>
          <X size={13} />
        </button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
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
              question is worth more than asking for the answer. It can see the task and the file
              you have open.
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

        {pending && <p className={clsx("text-xs", palette.textMuted)}>Thinking…</p>}
        {unavailable && <p className={clsx("text-xs", palette.textMuted)}>{unavailable}</p>}
      </div>

      <div className={clsx("shrink-0 border-t p-2.5", palette.border)}>
        <ChatComposer theme={theme} draft={draft} onDraftChange={setDraft} onSend={() => void send()} />
      </div>
    </div>
  );
}
