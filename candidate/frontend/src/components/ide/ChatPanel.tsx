"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import clsx from "clsx";
import { Send, Sparkles, X } from "lucide-react";
import { idePalette } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";

/**
 * The AI help chat.
 *
 * This is the panel only — there is no model behind it. Rather than inventing
 * plausible-looking answers, an assistant turn says plainly that nothing is
 * connected yet, so the UI can be reviewed without anyone mistaking it for a
 * working assistant. Wiring it up means replacing `respondTo` with a real
 * request; everything else here (history, layout, input handling) already
 * works.
 */

interface Message {
  id: number;
  author: "you" | "assistant";
  text: string;
}

const NOT_CONNECTED =
  "I'm not connected to a model yet — this panel is the interface only. " +
  "Point it at an API endpoint (and a key) and this reply becomes a real answer.";

function respondTo(): string {
  return NOT_CONNECTED;
}

export function ChatPanel({ theme, onClose }: { theme: IdeTheme; onClose: () => void }) {
  const palette = idePalette(theme);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const nextId = useRef(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    const id = nextId.current;
    nextId.current += 2;
    setMessages((prev) => [
      ...prev,
      { id, author: "you", text },
      { id: id + 1, author: "assistant", text: respondTo() },
    ]);
    setDraft("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter starts a new line — the usual chat contract.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
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
          AI help
        </span>
        <button type="button" title="Close" onClick={onClose} className={clsx("rounded-md p-1", palette.hover)}>
          <X size={13} />
        </button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <div className={clsx("space-y-2 text-xs leading-relaxed", palette.textMuted)}>
            <p className={palette.text}>Ask about the code in your workspace.</p>
            <p>
              Heads up: no model is connected yet, so replies are a placeholder. The panel, history
              and input all work — only the answer is missing.
            </p>
          </div>
        ) : (
          messages.map((message) => (
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
          ))
        )}
      </div>

      <div className={clsx("shrink-0 border-t p-2", palette.border)}>
        <div className={clsx("flex items-end gap-1.5 rounded-lg border p-1.5", palette.border)}>
          <textarea
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question…"
            className={clsx(
              "min-h-0 flex-1 resize-none bg-transparent text-xs outline-none placeholder:opacity-60",
              palette.text
            )}
          />
          <button
            type="button"
            title="Send (Enter)"
            onClick={send}
            disabled={draft.trim().length === 0}
            className={clsx(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
              draft.trim().length === 0
                ? clsx(palette.textMuted, "opacity-50")
                : "bg-[#4A7FA7] text-[#F6FAFD] hover:opacity-90"
            )}
          >
            <Send size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
