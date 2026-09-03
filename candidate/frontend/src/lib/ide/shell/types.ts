import type { VfsBridge } from "../vfs-bridge";

export type ShellEnv = Record<string, string>;

/** Shell state that outlives a single command — one of these per terminal session. */
export interface ShellSession {
  cwd: string[];
  env: ShellEnv;
  aliases: Record<string, string>;
  history: string[];
  /** Exit status of the last command, exposed to scripts as `$?`. */
  lastExit: number;
}

export function createSession(): ShellSession {
  return {
    cwd: [],
    env: { HOME: "/", USER: "candidate", SHELL: "/bin/mindfriesh", PWD: "/" },
    aliases: {},
    history: [],
    lastExit: 0,
  };
}

/** Terminal-level effects a command can reach for (clearing, live streaming, preview). */
export interface ShellIO {
  /** Writes straight to the terminal, bypassing the pipeline — for live progress only. */
  write: (text: string) => void;
  clear: () => void;
  /**
   * Opens a built page in the IDE's preview sidebar. `root` is kept so the
   * IDE can rebuild on every edit — that's what makes the preview stay live
   * rather than being a one-shot snapshot.
   */
  openPreview: (build: { html: string; title: string; root: string; objectUrls: string[] }) => void;
}

export interface CommandContext {
  /** argv[0] is the command name, as typed (after alias resolution). */
  argv: string[];
  stdin: string;
  session: ShellSession;
  vfs: VfsBridge;
  io: ShellIO;
  /**
   * True when this command's stdout goes straight to the terminal (not into a
   * pipe or a file). Commands use it the way real ones use isatty(): `ls`
   * only colorizes for a terminal, and long-running commands only stream
   * live progress when nothing downstream is waiting to parse their output.
   */
  isTerminalSink: boolean;
}

export interface CommandResult {
  stdout?: string;
  stderr?: string;
  /** 0 = success, non-zero = failure (127 = not found), mirroring real shells. */
  code?: number;
}

export type CommandFn = (ctx: CommandContext) => CommandResult | Promise<CommandResult>;

/** Convenience: a one-line failure with the conventional exit code. */
export function fail(message: string, code = 1): CommandResult {
  return { stderr: `${message}\n`, code };
}

export function ok(stdout = ""): CommandResult {
  return { stdout, code: 0 };
}
