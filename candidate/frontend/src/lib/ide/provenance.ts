/**
 * Two things about how work arrived in the workspace, recorded as
 * telemetry: text pasted in, and time spent with the workspace tab out of
 * view. candidate/backend turns them into "where the work came from"
 * signals in the report (orchestrator/evidence.go) — signals for a
 * reviewer to weigh, not findings.
 *
 * What is recorded is deliberately little:
 *
 * - For a paste: how many characters and lines, where it landed, and
 *   whether the same text had just been copied from inside this workspace
 *   (moving code around isn't bringing it in). **Never the text itself** —
 *   a clipboard can hold anything, including things that have nothing to do
 *   with the assessment.
 * - For an absence: how long. Not where the candidate went; the browser
 *   doesn't say and this doesn't try to find out.
 *
 * Both are disclosed in the consent copy (lib/policies.ts). Change what is
 * captured here, change that.
 */

type Record = (type: string, payload: unknown) => void;

/** Smaller pastes than this are names and one-liners — not worth an event each. */
const MIN_PASTE_CHARS = 20;
/** A glance at another window isn't an absence. */
const MIN_AWAY_SECONDS = 3;

const normalize = (text: string) => text.replace(/\r\n?/g, "\n").trim();

function pasteTarget(target: EventTarget | null, activePath: string | null): string {
  const el = target instanceof Element ? target : null;
  if (el?.closest(".monaco-editor")) return activePath ?? "the editor";
  if (el?.closest(".xterm")) return "the terminal";
  if (el?.closest("[data-assistant-composer]")) return "the assistant's message box";
  return "the workspace";
}

/**
 * Starts watching. `getActivePath` names the file a paste into the editor
 * went into. Returns the function that stops it.
 */
export function watchProvenance(record: Record, getActivePath: () => string | null): () => void {
  // The last text copied or cut inside this page — held in memory only, to
  // tell an internal move from an outside paste.
  let lastCopied = "";

  const onCopy = (event: ClipboardEvent) => {
    // Read after the editor's own handler has filled the clipboard: Monaco
    // and xterm put their selection there themselves, so the DOM selection
    // alone would miss it.
    const text = event.clipboardData?.getData("text/plain") || window.getSelection()?.toString() || "";
    if (text) lastCopied = normalize(text);
  };

  const onPaste = (event: ClipboardEvent) => {
    const text = normalize(event.clipboardData?.getData("text/plain") ?? "");
    if (text.length < MIN_PASTE_CHARS) return;
    record("paste", {
      chars: text.length,
      lines: text.split("\n").length,
      internal: text === lastCopied,
      target: pasteTarget(event.target, getActivePath()),
    });
  };

  let awaySince: number | null = null;
  const leave = () => {
    if (awaySince === null) awaySince = Date.now();
  };
  const back = () => {
    if (awaySince === null) return;
    const seconds = Math.round((Date.now() - awaySince) / 1000);
    awaySince = null;
    if (seconds >= MIN_AWAY_SECONDS) record("tab_hidden", { seconds });
  };
  const onVisibility = () => (document.hidden ? leave() : back());
  const onBlur = () => {
    // Focus moving into the preview pane's iframe is still the workspace.
    if (document.activeElement?.tagName !== "IFRAME") leave();
  };

  // Capture phase for paste so it's seen whichever widget handles it; bubble
  // phase for copy so the widget has written the clipboard first.
  document.addEventListener("copy", onCopy);
  document.addEventListener("cut", onCopy);
  document.addEventListener("paste", onPaste, true);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("blur", onBlur);
  window.addEventListener("focus", back);

  return () => {
    document.removeEventListener("copy", onCopy);
    document.removeEventListener("cut", onCopy);
    document.removeEventListener("paste", onPaste, true);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("focus", back);
  };
}
