import type { VfsBridge } from "../vfs-bridge";
import { segmentsToPath } from "../vfs-path";
import { parse, expandWord, ShellSyntaxError, type SimpleCommand } from "./parser";
import { expandGlob, readFile, resolve } from "./fs-util";
import { lookupCommand } from "./registry";
import type { CommandResult, ShellIO, ShellSession } from "./types";

/** Alias expansion is one level deep — enough for `alias ll="ls -la"`, no recursion loops. */
function applyAlias(session: ShellSession, argv: string[]): string[] {
  const alias = session.aliases[argv[0]];
  if (!alias) return argv;
  return [...alias.split(/\s+/).filter(Boolean), ...argv.slice(1)];
}

function expandArgv(
  command: SimpleCommand,
  session: ShellSession,
  vfs: VfsBridge
): string[] {
  const argv: string[] = [];
  for (const word of command.words) {
    const { value, globbable } = expandWord(word, session.env, session.lastExit);
    if (globbable) argv.push(...expandGlob(vfs, session, value));
    else argv.push(value);
  }
  return argv;
}

interface Redirection {
  stdinFrom: string[] | null;
  stdoutTo: { segments: string[]; append: boolean } | null;
  stderrTo: { segments: string[]; append: boolean } | null;
  error: string | null;
}

function resolveRedirects(command: SimpleCommand, session: ShellSession): Redirection {
  const out: Redirection = { stdinFrom: null, stdoutTo: null, stderrTo: null, error: null };

  for (const redirect of command.redirects) {
    const { value } = expandWord(redirect.target, session.env, session.lastExit);
    if (!value) {
      out.error = "syntax error near unexpected token `newline'";
      return out;
    }
    const segments = resolve(session, value);
    if (redirect.op === "<") out.stdinFrom = segments;
    else if (redirect.op === "2>") out.stderrTo = { segments, append: false };
    else out.stdoutTo = { segments, append: redirect.op === ">>" };
  }
  return out;
}

async function runPipeline(
  commands: SimpleCommand[],
  session: ShellSession,
  vfs: VfsBridge,
  io: ShellIO
): Promise<number> {
  let piped = "";
  let exitCode = 0;

  for (const [index, command] of commands.entries()) {
    const isLast = index === commands.length - 1;
    let argv = expandArgv(command, session, vfs);

    // Leading `FOO=bar` assignments set shell variables. Real bash scopes
    // them to the single command that follows; here they simply persist,
    // which is the one simplification worth taking over a fake `env` fork.
    while (argv.length > 0 && /^\w+=/.test(argv[0])) {
      const match = /^(\w+)=(.*)$/.exec(argv[0]);
      if (match) session.env[match[1]] = match[2];
      argv = argv.slice(1);
    }
    if (argv.length === 0) {
      exitCode = 0;
      continue;
    }
    argv = applyAlias(session, argv);

    const redirects = resolveRedirects(command, session);
    if (redirects.error) {
      io.write(`${redirects.error}\r\n`);
      return 2;
    }

    let stdin = piped;
    if (redirects.stdinFrom) {
      const content = readFile(vfs, redirects.stdinFrom);
      if (content === null) {
        io.write(`${argv[0]}: ${segmentsToPath(redirects.stdinFrom)}: No such file or directory\r\n`);
        return 1;
      }
      stdin = content;
    }

    const command_ = lookupCommand(argv[0]);
    let result: CommandResult;
    if (!command_) {
      result = { stderr: `command not found: ${argv[0]}\n`, code: 127 };
    } else {
      const isTerminalSink = isLast && !redirects.stdoutTo;
      try {
        result = await command_({ argv, stdin, session, vfs, io, isTerminalSink });
      } catch (err) {
        result = {
          stderr: `${argv[0]}: ${err instanceof Error ? err.message : String(err)}\n`,
          code: 1,
        };
      }
    }

    exitCode = result.code ?? 0;
    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";

    if (stderr) {
      if (redirects.stderrTo) {
        const error = vfs.write(segmentsToPath(redirects.stderrTo.segments), stderr, redirects.stderrTo.append);
        if (error) io.write(`${argv[0]}: ${error}\r\n`);
      } else {
        io.write(`\x1b[31m${toTerminalText(stderr)}\x1b[0m`);
      }
    }

    if (redirects.stdoutTo) {
      const error = vfs.write(segmentsToPath(redirects.stdoutTo.segments), stdout, redirects.stdoutTo.append);
      if (error) io.write(`\x1b[31m${argv[0]}: ${error}\x1b[0m\r\n`);
      piped = "";
    } else if (isLast) {
      io.write(toTerminalText(stdout));
      piped = "";
    } else {
      piped = stdout;
    }
  }

  return exitCode;
}

/** xterm needs CRLF; commands produce ordinary "\n" like any Unix program. */
function toTerminalText(text: string): string {
  return text.replace(/\r?\n/g, "\r\n");
}

/**
 * Runs one command line: `a | b && c > out.txt; d`. Pipelines are joined by
 * `&&`/`||`/`;` and short-circuit on the previous exit status, same as bash.
 */
export async function executeCommandLine(
  line: string,
  session: ShellSession,
  vfs: VfsBridge,
  io: ShellIO
): Promise<void> {
  if (!line.trim()) return;

  let entries;
  try {
    entries = parse(line);
  } catch (err) {
    if (err instanceof ShellSyntaxError) {
      io.write(`\x1b[31m${err.message}\x1b[0m\r\n`);
      session.lastExit = 2;
      return;
    }
    throw err;
  }

  for (const entry of entries) {
    if (entry.joiner === "&&" && session.lastExit !== 0) continue;
    if (entry.joiner === "||" && session.lastExit === 0) continue;
    session.lastExit = await runPipeline(entry.pipeline.commands, session, vfs, io);
  }
}
