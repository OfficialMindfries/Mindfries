import type { Terminal as XTerm } from "@xterm/xterm";
import { openSandboxTerminal } from "@/app/ide/sandbox-actions";
import { terminalLog } from "../terminal-log";

/**
 * The sandbox terminal: xterm on one end, a real shell in the session's
 * sandbox on the other, with candidate/backend relaying between them (its
 * internal/httpapi/sandbox.go describes the wire format).
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
 * If the connection drops, the terminal says so and reconnects on the next
 * keypress. That is a new shell — the sandbox and its files are untouched,
 * but a `cd` or an exported variable from before is gone, and it says that.
 */

// Leftovers a shell prints around a command that aren't output: keypad and
// cursor-key mode switches (ESC = / ESC >). Colour codes are removed by the
// terminal log itself.
const SHELL_NOISE = /\x1b[=>]/g;

export function attachSandboxTerminal(term: XTerm, sessionId: string): () => void {
  const encoder = new TextEncoder();
  let socket: WebSocket | null = null;
  let disposed = false;
  let connecting = false;
  let everConnected = false;

  const note = (text: string) => term.write(`\r\n\x1b[2m${text}\x1b[0m\r\n`);

  const connect = async () => {
    if (disposed || connecting || socket) return;
    connecting = true;
    term.write(`\x1b[2m${everConnected ? "Reconnecting to your sandbox…" : "Connecting to your sandbox…"}\x1b[0m\r\n`);
    const opened = await openSandboxTerminal(sessionId).catch(() => null);
    if (disposed) return;
    if (!opened || !opened.ok) {
      connecting = false;
      note(`${opened && !opened.ok ? opened.error : "The sandbox didn't answer."} Press Enter to try again.`);
      return;
    }

    const ws = new WebSocket(opened.url);
    ws.binaryType = "arraybuffer";
    socket = ws;
    let closedReason = "";
    ws.onopen = () => ws.send(JSON.stringify({ ticket: opened.ticket, cols: term.cols, rows: term.rows }));
    ws.onmessage = (event) => {
      if (typeof event.data !== "string") {
        term.write(new Uint8Array(event.data as ArrayBuffer));
        return;
      }
      let message: { type?: string; command?: string; exitCode?: number; output?: string; reason?: string };
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === "ready") {
        connecting = false;
        everConnected = true;
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
      note(closedReason || (everConnected ? "The terminal was disconnected. Press Enter for a new shell — your files are as you left them." : "The terminal couldn't connect. Press Enter to try again."));
    };
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

  void connect();

  return () => {
    disposed = true;
    input.dispose();
    resize.dispose();
    socket?.close();
    socket = null;
  };
}
