"use client";

import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import clsx from "clsx";
import type { IdeTheme } from "@/lib/ide/theme";

/**
 * The Mindfries AI input: a glassy box with a lit gradient edge, a glowing
 * send key, and starter chips underneath.
 *
 * Adapted from a supplied dark `styled-components` design. Rebuilt in
 * Tailwind rather than adding a second styling system to the IDE for one
 * component, and recoloured from its greys into the five brand swatches —
 * navy for the body, the mid blue for the lit edge — in both themes, since
 * the original only had a dark one.
 *
 * ## What was left out, and why
 *
 * The original has three icon buttons on the left: attach a file, add a
 * widget, search the web. None of them do anything here, and this workspace
 * doesn't ship controls that are wired to nothing. Two of them — pulling in
 * files and reaching the web on the candidate's behalf — are also exactly the
 * coding-agent behaviour the panel promises this assistant won't have. The
 * row keeps the send key, and the left side says how the box works instead.
 *
 * The chips are kept, but made real and made to fit. The original's "Create
 * an image" and "Analyse data" become questions this assistant is actually
 * for, and pressing one starts the sentence rather than sending it: the
 * candidate still has to finish the question, because their questions are
 * part of what the session records.
 */

const STARTERS = [
  { label: "Explain an error", text: "Can you help me understand this error: " },
  { label: "Talk through an approach", text: "I'm thinking of approaching this by " },
  { label: "What does this do?", text: "What does this code do? " },
];

const LOOK = {
  dark: {
    // The lit edge: brightest at the top-left corner, fading into the body.
    // Same shape as the original's #7e7e7e → #363636, in brand blues.
    edge: "bg-[linear-gradient(to_bottom_right,#4A7FA7,#1A3D63,#1A3D63,#1A3D63)]",
    body: "bg-[#0A1931]/70",
    text: "text-[#F6FAFD] placeholder:text-[#B3CFE5]/70 focus:placeholder:text-[#1A3D63]",
    hint: "text-[#B3CFE5]/45",
    key: "bg-[linear-gradient(to_top,#0A1931,#1A3D63,#0A1931)]",
    keyIcon: "text-[#4A7FA7]",
    chip: "border-[#1A3D63] bg-[#0A1931] text-[#B3CFE5] hover:border-[#4A7FA7] hover:text-[#F6FAFD]",
  },
  light: {
    edge: "bg-[linear-gradient(to_bottom_right,#4A7FA7,#B3CFE5,#B3CFE5,#B3CFE5)]",
    body: "bg-[#F6FAFD]",
    text: "text-[#0A1931] placeholder:text-[#4A7FA7] focus:placeholder:text-[#B3CFE5]",
    hint: "text-[#4A7FA7]/70",
    key: "bg-[linear-gradient(to_top,#1A3D63,#4A7FA7,#1A3D63)]",
    keyIcon: "text-[#B3CFE5]",
    chip: "border-[#B3CFE5] bg-[#F6FAFD] text-[#1A3D63] hover:border-[#4A7FA7] hover:text-[#0A1931]",
  },
} as const;

export function ChatComposer({
  theme,
  draft,
  onDraftChange,
  onSend,
}: {
  theme: IdeTheme;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
}) {
  const look = LOOK[theme];
  const input = useRef<HTMLTextAreaElement>(null);
  const empty = draft.trim().length === 0;

  const send = () => {
    if (empty) return;
    onSend();
    // Back to the box, so the next question can be typed straight away — and
    // so the send key loses focus and its "sent" tilt resets.
    input.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter starts a new line — the usual chat contract.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  // Set when a starter fills the box; consumed once the new text is in the DOM.
  const caretToEnd = useRef(false);

  const applyStarter = (text: string) => {
    caretToEnd.current = true;
    onDraftChange(text);
    // Focus now rather than waiting on the effect: if the starter matches
    // what's already in the box, the draft doesn't change and the effect below
    // never runs.
    input.current?.focus();
  };

  // Caret at the end, so the candidate carries on typing the sentence. A
  // layout effect rather than a `requestAnimationFrame`: it runs as soon as
  // React has committed the new text, and it doesn't depend on the page
  // painting — a backgrounded tab may run no animation frames at all.
  useLayoutEffect(() => {
    if (!caretToEnd.current) return;
    caretToEnd.current = false;
    const element = input.current;
    if (!element) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, [draft]);

  return (
    <div className="flex flex-col">
      <div
        className={clsx(
          "relative flex overflow-hidden rounded-2xl p-[1.5px]",
          look.edge,
          // The glint on the lit corner, as in the original — a small
          // blurred radial highlight sitting just off the top-left edge.
          "after:pointer-events-none after:absolute after:-top-2.5 after:-left-2.5 after:h-[30px] after:w-[30px] after:blur-[1px] after:content-['']",
          "after:bg-[radial-gradient(ellipse_at_center,#F6FAFD,rgba(179,207,229,0.35),rgba(179,207,229,0.1),transparent_70%)]"
        )}
      >
        <div className={clsx("flex w-full flex-col overflow-hidden rounded-[15px]", look.body)}>
          <textarea
            ref={input}
            rows={2}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Message Mindfries AI"
            placeholder="Ask about the code, an error, or an approach… ✦˚"
            className={clsx(
              "h-[58px] w-full resize-none bg-transparent px-3 pt-2.5 text-xs outline-none",
              "placeholder:transition-colors placeholder:duration-300",
              look.text
            )}
          />

          <div className="flex items-end justify-between px-2.5 pb-2.5">
            <span className={clsx("text-[10px]", look.hint)}>Enter to send · Shift+Enter new line</span>

            <button
              type="button"
              title="Send (Enter)"
              aria-label="Send"
              onClick={send}
              disabled={empty}
              className={clsx(
                "group flex rounded-[10px] p-[2px] outline-none",
                "shadow-[inset_0_6px_2px_-4px_rgba(246,250,253,0.5)]",
                "transition-transform duration-150 active:scale-[0.92]",
                "disabled:cursor-not-allowed disabled:opacity-50",
                look.key
              )}
            >
              <i className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px] bg-black/10 p-1.5 backdrop-blur-[3px]">
                <svg
                  viewBox="0 0 512 512"
                  aria-hidden
                  className={clsx(
                    "h-full w-full transition-all duration-300",
                    look.keyIcon,
                    // Lights up on hover; tilts forward, as if sent, while it
                    // holds focus. Neither applies while there's nothing to send.
                    "group-enabled:group-hover:text-[#F6FAFD] group-enabled:group-hover:drop-shadow-[0_0_5px_#F6FAFD]",
                    "group-enabled:group-focus:translate-x-[-2px] group-enabled:group-focus:translate-y-[1px] group-enabled:group-focus:scale-[1.2] group-enabled:group-focus:rotate-45 group-enabled:group-focus:text-[#F6FAFD] group-enabled:group-focus:drop-shadow-[0_0_5px_#F6FAFD]"
                  )}
                >
                  <path
                    fill="currentColor"
                    d="M473 39.05a24 24 0 0 0-25.5-5.46L47.47 185h-.08a24 24 0 0 0 1 45.16l.41.13l137.3 58.63a16 16 0 0 0 15.54-3.59L422 80a7.07 7.07 0 0 1 10 10L226.66 310.26a16 16 0 0 0-3.59 15.54l58.65 137.38c.06.2.12.38.19.57c3.2 9.27 11.3 15.81 21.09 16.25h1a24.63 24.63 0 0 0 23-15.46L478.39 64.62A24 24 0 0 0 473 39.05"
                  />
                </svg>
              </i>
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 pt-2.5">
        {STARTERS.map((starter) => (
          <button
            key={starter.label}
            type="button"
            onClick={() => applyStarter(starter.text)}
            className={clsx(
              "rounded-[10px] border-[1.5px] px-2 py-1 text-[10px] transition-colors select-none",
              look.chip
            )}
          >
            {starter.label}
          </button>
        ))}
      </div>
    </div>
  );
}
