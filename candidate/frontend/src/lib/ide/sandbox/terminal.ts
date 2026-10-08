import type { Terminal as XTerm } from "@xterm/xterm";
import { openSandboxTerminal } from "@/app/ide/sandbox-actions";
import { terminalLog } from "../terminal-log";

/**
 * The sandbox terminal: xterm on one end, a real shell in the session's
 * sandbox on the other, with candidate/backend relaying between them (its
 * internal/httpapi/terminals.go describes the wire format).
 *
 * Nothing is interpreted here. Keystrokes go to the shell as typed and what
 * the shell prints is drawn as it arrives — tab completion, history, Ctrl+C,
 * a full-screen editor all work because they are the shell's own.
 *
 * Each command the shell reports as finished is handed to the workspace's
 * terminal log, the same place the in-browser shell reports to: that is
 * what fills the Tests panel, gives the assistant the recent output, and
 * tells the editor that files may have changed.
 *
 * The shell belongs to the session, not to this connection. If the
 * connection drops, the shell and whatever it is running carry on in the
 * sandbox; this reconnects by itself and asks for the same shell back,
 * saying how much of its output was already drawn so that only the rest is
 * sent. A reload does the same from the start of what the backend still
 * holds. The backend keeps an unattended shell for a few minutes; after
 * that, or if the backend itself restarted, the shell is gone and this says
 * so plainly: a new shell, the files untouched, but a `cd` or an exported
 * variable from before lost.
 */

// Leftovers a shell prints around a command that aren't output: keypad and
// cursor-key mode switches (ESC = / ESC >). Colour codes are removed by the
// terminal log itself.
const SHELL_NOISE = /\x1b[=>]/g;

// How long to wait before each automatic reconnect. After the last one the
// terminal stops trying and waits for Enter.
const RETRY_MS = [500, 1500, 3000, 6000, 10000, 15000];

const storageKey = (sessionId: string) => `mf_sandbox_terminal:${sessionId}`;

function remembered(sessionId: string): string {
  try {
    return window.sessionStorage.getItem(storageKey(sessionId)) ?? "";
  } catch {
    return "";
  }
}

function remember(sessionId: string, terminalId: string) {
  try {
    if (terminalId) window.sessionStorage.setItem(storageKey(sessionId), terminalId);
    else window.sessionStorage.removeItem(storageKey(sessionId));
  } catch {
    // Storage is a convenience here: without it a reload gets a new shell.
  }
}

interface ServerMessage {
  type?: string;
  command?: string;
  exitCode?: number;
  output?: string;
  reason?: string;
  terminal?: string;
  resumed?: boolean;
  offset?: number;
}

/**
 * @param onResume called when this terminal is reattached to a shell that
 *   kept running without it — commands may have finished and changed files
 *   in the meantime, unannounced.
 */
export function attachSandboxTerminal(term: XTerm, sessionId: string, onResume?: () => void): () => void {
  const encoder = new TextEncoder();
  let socket: WebSocket | null = null;
  let disposed = false;
  let connecting = false;
  let everConnected = false;
  // The shell this terminal is showing, and how many bytes of its output
  // have been drawn here. A page that was reloaded knows the shell (from
  // sessionStorage) but has drawn nothing.
  let terminalId = remembered(sessionId);
  let seen = 0;
  let attempt = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const note = (text: string) => term.write(`\r\n\x1b[2m${text}\x1b[0m\r\n`);

  const connect = async () => {
    if (disposed || connecting || socket) return;
    connecting = true;
    clearTimeout(retry);
    if (!everConnected) term.write(`\x1b[2mConnecting to your sandbox…\x1b[0m\r\n`);
    const opened = await openSandboxTerminal(sessionId).catch(() => null);
    if (disposed) return;
    if (!opened || !opened.ok) {
      connecting = false;
      // A refusal is an answer (the session ended, the interview began);
      // no answer at all is the network, and worth trying again.
      if (opened) note(`${opened.error} Press Enter to try again.`);
      else lost("");
      return;
    }

    const ws = new WebSocket(opened.url);
    ws.binaryType = "arraybuffer";
    socket = ws;
    let closedReason: string | null = null;
    const asked = terminalId;
    ws.onopen = () =>
      ws.send(JSON.stringify({ ticket: opened.ticket, cols: term.cols, rows: term.rows, ...(asked ? { terminal: asked, seen } : {}) }));
    ws.onmessage = (event) => {
      if (typeof event.data !== "string") {
        const bytes = new Uint8Array(event.data as ArrayBuffer);
        seen += bytes.byteLength;
        term.write(bytes);
        return;
      }
      let message: ServerMessage;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === "ready") {
        connecting = false;
        attempt = 0;
        if (asked && !message.resumed) {
          note("Your earlier shell is no longer running, so this is a new one. Your files are as you left them; a cd or an exported variable from before is not.");
        } else if (asked && everConnected) {
          note("Reconnected — this is the same shell, and anything it was running kept going.");
        }
        if (asked && message.resumed) onResume?.();
        everConnected = true;
        terminalId = message.terminal ?? "";
        remember(sessionId, terminalId);
        seen = typeof message.offset === "number" ? message.offset : 0;
      } else if (message.type === "command" && typeof message.command === "string") {
        const tracked = terminalLog.begin(message.command);
        tracked.output((message.output ?? "").replace(SHELL_NOISE, ""));
        tracked.finish(typeof message.exitCode === "number" ? message.exitCode : 1);
      } else if (message.type === "closed") {
        closedReason = message.reason ?? "";
      }
    };
    ws.onclose = () => {
      if (socket === ws) socket = null;
      connecting = false;
      if (disposed) return;
      if (closedReason !== null) {
        // The backend ended it and said why: that shell is over.
        terminalId = "";
        seen = 0;
        remember(sessionId, "");
        note(`${closedReason || "The terminal was closed."} Press Enter for a new shell.`);
        return;
      }
      lost(everConnected ? "The connection dropped. Your shell is still running in the sandbox — reconnecting…" : "");
    };
  };

  // The connection went without the backend ending it: try again, a few
  // times, then leave it to the candidate.
  const lost = (message: string) => {
    if (disposed) return;
    if (attempt === 0 && message) note(message);
    if (attempt >= RETRY_MS.length) {
      attempt = 0;
      note(everConnected ? "Still can't reach the sandbox. Press Enter to try again — the shell is kept for a few minutes." : "The terminal couldn't connect. Press Enter to try again.");
      return;
    }
    retry = setTimeout(() => void connect(), RETRY_MS[attempt++]);
  };

  const input = term.onData((data) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(encoder.encode(data));
    } else if (!connecting && (data === "\r" || data === "\n")) {
      void connect();
    }
  });
  const resize = term.onResize(({ cols, rows }) => {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "resize", cols, rows }));
  });
  // Back online is the moment a waiting reconnect is most likely to work.
  const online = () => {
    if (!socket && !connecting) void connect();
  };
  window.addEventListener("online", online);

  void connect();

  return () => {
    disposed = true;
    clearTimeout(retry);
    window.removeEventListener("online", online);
    input.dispose();
    resize.dispose();
    socket?.close();
    socket = null;
  };
}
