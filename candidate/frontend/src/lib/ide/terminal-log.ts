/**
 * The tail of what the workspace terminal has shown, and a record of each
 * command as it finishes: what was run, how it exited, how long it took and
 * what it printed.
 *
 * Two things read it. The AI assistant is sent the tail, so it can be asked
 * "what does this error mean?" about an error that is on screen in the
 * terminal rather than in a file. And each finished command is handed to
 * whoever is listening — telemetry (the candidate's commands are evidence of
 * how they worked, and are disclosed as recorded), and the test results
 * panel, which reads a test run's output into results.
 *
 * A plain module store with no React and no DOM imports, like output.ts —
 * the shell writes to it from xterm callbacks, outside React's render cycle.
 * It is one log for the whole workspace: terminal tabs share it, in the
 * order things happened.
 */

/** Enough for a failing test run's traceback; older output falls off the front. */
const MAX_CHARS = 16_000;
/** A single command's output kept for its listeners — a test run's full report, bounded. */
const MAX_COMMAND_OUTPUT = 64_000;

// Colour and cursor escapes are for the screen, not for a reader of the text.
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g;
const clean = (text: string) => text.replace(ANSI, "").replace(/\r\n?/g, "\n");

export interface FinishedCommand {
  command: string;
  exitCode: number;
  /** How long it ran, in ms. */
  ms: number;
  /** Everything it printed, without colour codes. */
  output: string;
}

/** A command that is running: output is added to it until it is finished. */
export interface RunningCommand {
  output(text: string): void;
  finish(exitCode: number): void;
}

type Listener = (command: FinishedCommand) => void;

let log = "";
const listeners = new Set<Listener>();

function append(text: string): void {
  log += text;
  if (log.length > MAX_CHARS) log = log.slice(-MAX_CHARS);
}

export const terminalLog = {
  /** Call when a command line starts running; feed its output to what comes back, then finish it. */
  begin(line: string): RunningCommand {
    append(`${log && !log.endsWith("\n") ? "\n" : ""}$ ${line}\n`);
    const startedAt = Date.now();
    let output = "";
    let finished = false;
    return {
      output(text: string) {
        const plain = clean(text);
        append(plain);
        if (output.length < MAX_COMMAND_OUTPUT) output += plain;
      },
      finish(exitCode: number) {
        if (finished) return;
        finished = true;
        const done: FinishedCommand = { command: line, exitCode, ms: Date.now() - startedAt, output };
        for (const listener of listeners) listener(done);
      },
    };
  },
  /** Output that belongs to no command — a banner, a background watcher. */
  output(text: string): void {
    append(clean(text));
  },
  /** The recent terminal contents, oldest first. */
  read(): string {
    return log;
  },
  /** Hears about every command when it finishes. Returns the function that stops listening. */
  onCommand(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  clear(): void {
    log = "";
  },
};
