/**
 * The tail of what the workspace terminal has shown: each command the
 * candidate ran and what it printed, as plain text. It exists so the AI
 * assistant can be asked "what does this error mean?" about an error that is
 * on screen in the terminal rather than in a file.
 *
 * A plain module store with no React and no DOM imports, like output.ts —
 * the shell writes to it from xterm callbacks, outside React's render cycle.
 * It is one log for the whole workspace: terminal tabs share it, in the
 * order things happened.
 */

/** Enough for a failing test run's traceback; older output falls off the front. */
const MAX_CHARS = 16_000;

// Colour and cursor escapes are for the screen, not for a reader of the text.
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g;

let log = "";

function append(text: string): void {
  log += text.replace(ANSI, "").replace(/\r\n?/g, "\n");
  if (log.length > MAX_CHARS) log = log.slice(-MAX_CHARS);
}

export const terminalLog = {
  /** A command line, as it was run. */
  command(line: string): void {
    append(`${log && !log.endsWith("\n") ? "\n" : ""}$ ${line}\n`);
  },
  /** Something a command wrote to the terminal. */
  output(text: string): void {
    append(text);
  },
  /** The recent terminal contents, oldest first. */
  read(): string {
    return log;
  },
  clear(): void {
    log = "";
  },
};
