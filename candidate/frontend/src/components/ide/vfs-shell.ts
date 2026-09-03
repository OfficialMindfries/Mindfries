import type { Terminal } from "@xterm/xterm";
import type { VfsBridge } from "@/lib/ide/vfs-bridge";
import type { TreeNode } from "@/lib/ide/types";
import { findNode } from "@/lib/ide/tree";
import { resolveInputPath, segmentsToDisplay, segmentsToPath } from "@/lib/ide/vfs-path";
import { executeCommandLine } from "@/lib/ide/shell/execute";
import { isMultiLineInput, splitPastedInput } from "@/lib/ide/shell/paste";
import { commandNames } from "@/lib/ide/shell/registry";
import { createSession, type ShellSession } from "@/lib/ide/shell/types";

// True-color (24-bit) escape for the exact brand mid-blue (#4A7FA7) — the
// standard 16-color ANSI palette has no matching blue close enough to read
// as on-brand next to the rest of the UI.
const BRAND_BLUE = "\x1b[1;38;2;74;127;167m";
const PATH_BLUE = "\x1b[1;38;2;179;207;229m";

function promptFor(session: ShellSession): string {
  return `${BRAND_BLUE}mindfries\x1b[0m ${PATH_BLUE}~${segmentsToDisplay(session.cwd)}\x1b[0m$ `;
}

function longestCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return "";
  let prefix = strings[0];
  for (const s of strings.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < s.length && prefix[i] === s[i]) i++;
    prefix = prefix.slice(0, i);
    if (!prefix) break;
  }
  return prefix;
}

/** Word being completed -> its `dirPart` (up to the last "/") and `prefix` (the basename typed so far). */
function splitCompletionWord(word: string): { dirPart: string; prefix: string } {
  const idx = word.lastIndexOf("/");
  return idx === -1
    ? { dirPart: "", prefix: word }
    : { dirPart: word.slice(0, idx + 1), prefix: word.slice(idx + 1) };
}

/** Matches for a path-completion word, resolved against the shell's cwd — folders get a trailing "/". */
function completePathWord(
  session: ShellSession,
  vfs: VfsBridge,
  word: string
): { matches: string[]; dirPart: string; prefix: string } {
  const { dirPart, prefix } = splitCompletionWord(word);
  const target = resolveInputPath(session.cwd, dirPart);
  const { tree } = vfs.getSnapshot();

  let children: TreeNode[];
  if (target.length === 0) {
    children = tree;
  } else {
    const node = findNode(tree, segmentsToPath(target));
    if (!node || node.type !== "folder") return { matches: [], dirPart, prefix };
    children = node.children;
  }

  const matches = children
    .filter((n) => n.name.startsWith(prefix))
    .map((n) => (n.type === "folder" ? `${n.name}/` : n.name))
    .sort();
  return { matches, dirPart, prefix };
}

/**
 * Attaches an interactive shell — line editor here, command execution in
 * lib/ide/shell (parser + pipeline executor + command registry), so pipes,
 * redirection, `&&`/`||`, globs and exit codes all work like a real shell.
 */
export function attachVfsShell(
  term: Terminal,
  vfs: VfsBridge,
  openPreview: (html: string, title: string) => void
): () => void {
  const session = createSession();
  let buffer = "";
  let cursor = 0;
  let historyIndex = 0;
  let busy = false;
  /** Remaining complete lines from a multi-line paste, run one after another. */
  let queued: string[] = [];
  /** Text after a paste's last line break — goes on the prompt, not executed. */
  let pendingInput = "";

  const io = {
    write: (text: string) => term.write(text),
    clear: () => term.clear(),
    openPreview,
  };

  const writePrompt = () => term.write(`\r\n${promptFor(session)}`);

  // Full redraw of the current input line: clear it, rewrite prompt + buffer,
  // then reposition the cursor. Simpler and less bug-prone than manually
  // tracking cursor-relative writes for every edit (insert/delete/history/
  // completion all funnel through this one place).
  const redraw = () => {
    term.write(`\r\x1b[2K${promptFor(session)}${buffer}`);
    const back = buffer.length - cursor;
    if (back > 0) term.write(`\x1b[${back}D`);
  };

  const setLine = (next: string, cursorAt = next.length) => {
    buffer = next;
    cursor = Math.max(0, Math.min(cursorAt, buffer.length));
    redraw();
  };

  const handleTab = () => {
    const upToCursor = buffer.slice(0, cursor);
    const wordStart = upToCursor.lastIndexOf(" ") + 1;
    const word = upToCursor.slice(wordStart);
    const isFirstWord = upToCursor.slice(0, wordStart).trim().length === 0;

    let candidates: string[];
    let replaceStart: number;
    let typedLen: number;

    if (isFirstWord) {
      candidates = commandNames().filter((c) => c.startsWith(word));
      replaceStart = wordStart;
      typedLen = word.length;
    } else {
      const { matches, dirPart, prefix } = completePathWord(session, vfs, word);
      candidates = matches;
      replaceStart = wordStart + dirPart.length;
      typedLen = prefix.length;
    }

    if (candidates.length === 0) return;

    const applyReplacement = (text: string) => {
      const tail = buffer.slice(cursor);
      buffer = buffer.slice(0, replaceStart) + text + tail;
      cursor = replaceStart + text.length;
    };

    if (candidates.length === 1) {
      const completion = candidates[0];
      // Only auto-append a trailing space once the completion is unambiguous
      // AND it's not a directory (so the user can keep typing deeper into
      // it) AND there's nothing already after the cursor to collide with.
      const trailingSpace = !completion.endsWith("/") && cursor === buffer.length ? " " : "";
      applyReplacement(completion + trailingSpace);
      redraw();
      return;
    }

    const lcp = longestCommonPrefix(candidates);
    if (lcp.length > typedLen) applyReplacement(lcp);

    term.write(`\r\n${candidates.join("  ")}`);
    redraw();
  };

  /**
   * Runs one line, then drains anything a multi-line paste left queued —
   * each queued line is echoed after its own prompt first, so the transcript
   * reads the same as if it had been typed.
   */
  const submit = (line: string) => {
    const trimmed = line.trim();
    if (trimmed) session.history.push(trimmed);
    historyIndex = session.history.length;
    buffer = "";
    cursor = 0;
    busy = true;

    executeCommandLine(trimmed, session, vfs, io)
      .catch((err) =>
        term.writeln(`\x1b[31m${err instanceof Error ? err.message : String(err)}\x1b[0m`)
      )
      .finally(() => {
        busy = false;
        const next = queued.shift();
        if (next !== undefined) {
          term.write(`\r\n${promptFor(session)}${next}\r\n`);
          submit(next);
          return;
        }
        writePrompt();
        // Text after the paste's final line break isn't a command yet — it
        // sits on the prompt waiting for Enter, same as a real terminal.
        if (pendingInput) {
          buffer = pendingInput;
          cursor = buffer.length;
          pendingInput = "";
          term.write(buffer);
        }
      });
  };

  term.writeln("Linux commands are supported. Type help to see them.");
  term.write(promptFor(session));

  const disposable = term.onData((data) => {
    if (busy) return; // block input while a foreground command is running
    const code = data.charCodeAt(0);

    if (data === "\r" || data === "\n") {
      term.write("\r\n");
      submit(buffer);
      return;
    }

    // A paste arrives as ONE chunk that can carry line breaks. Without this
    // it would fall through to the insert branch below and land as a single
    // line with literal control characters in it, running nothing.
    if (isMultiLineInput(data)) {
      const split = splitPastedInput(data, buffer, cursor);
      queued = split.queued;
      pendingInput = split.pending;

      buffer = split.line;
      cursor = split.line.length;
      redraw();
      term.write("\r\n");
      submit(split.line);
      return;
    }

    if (data === "\t") {
      handleTab();
      return;
    }

    if (code === 127 || data === "\x1b[3~") {
      // Backspace (127) deletes before the cursor; Delete ("\x1b[3~") deletes at it.
      if (data === "\x1b[3~") {
        if (cursor < buffer.length) setLine(buffer.slice(0, cursor) + buffer.slice(cursor + 1), cursor);
      } else if (cursor > 0) {
        setLine(buffer.slice(0, cursor - 1) + buffer.slice(cursor), cursor - 1);
      }
      return;
    }

    if (data === "\x1b[D" || data === "\x02" /* Ctrl+B */) {
      if (cursor > 0) setLine(buffer, cursor - 1);
      return;
    }
    if (data === "\x1b[C" || data === "\x06" /* Ctrl+F */) {
      if (cursor < buffer.length) setLine(buffer, cursor + 1);
      return;
    }
    if (data === "\x1b[H" || data === "\x1b[1~" || data === "\x01" /* Ctrl+A */) {
      setLine(buffer, 0);
      return;
    }
    if (data === "\x1b[F" || data === "\x1b[4~" || data === "\x05" /* Ctrl+E */) {
      setLine(buffer, buffer.length);
      return;
    }
    if (data === "\x15" /* Ctrl+U: kill to start */) {
      setLine(buffer.slice(cursor), 0);
      return;
    }
    if (data === "\x0b" /* Ctrl+K: kill to end */) {
      setLine(buffer.slice(0, cursor));
      return;
    }
    if (data === "\x17" /* Ctrl+W: delete previous word */) {
      const before = buffer.slice(0, cursor).replace(/\s*\S+\s*$/, "");
      setLine(before + buffer.slice(cursor), before.length);
      return;
    }
    if (data === "\x03" /* Ctrl+C: cancel line */) {
      term.write("^C");
      buffer = "";
      cursor = 0;
      historyIndex = session.history.length;
      writePrompt();
      return;
    }
    if (data === "\x0c" /* Ctrl+L: clear screen, keep line */) {
      term.clear();
      redraw();
      return;
    }

    if (data === "\x1b[A") {
      if (historyIndex > 0) {
        historyIndex -= 1;
        setLine(session.history[historyIndex]);
      }
      return;
    }

    if (data === "\x1b[B") {
      if (historyIndex < session.history.length - 1) {
        historyIndex += 1;
        setLine(session.history[historyIndex]);
      } else if (historyIndex === session.history.length - 1) {
        historyIndex = session.history.length;
        setLine("");
      }
      return;
    }

    if (code < 32) return; // ignore other control characters for this shell

    setLine(buffer.slice(0, cursor) + data + buffer.slice(cursor), cursor + data.length);
  });

  return () => disposable.dispose();
}
