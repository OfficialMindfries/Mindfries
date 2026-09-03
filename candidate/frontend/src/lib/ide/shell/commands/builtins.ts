import { segmentsToPath } from "../../vfs-path";
import { resolve } from "../fs-util";
import { commandNames, hasCommand } from "../registry";
import { fail, ok, type CommandContext, type CommandResult } from "../types";
import { parseFlags } from "./fs";

export function env(ctx: CommandContext): CommandResult {
  const lines = Object.entries(ctx.session.env)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);
  return ok(`${lines.join("\n")}\n`);
}

export function exportVar(ctx: CommandContext): CommandResult {
  const assignments = ctx.argv.slice(1);
  if (assignments.length === 0) return env(ctx);

  for (const assignment of assignments) {
    const match = /^(\w+)(?:=(.*))?$/.exec(assignment);
    if (!match) return fail(`export: '${assignment}': not a valid identifier`);
    // Bare `export FOO` marks an existing variable — it doesn't clear it.
    ctx.session.env[match[1]] = match[2] ?? ctx.session.env[match[1]] ?? "";
  }
  return ok();
}

export function unset(ctx: CommandContext): CommandResult {
  for (const name of ctx.argv.slice(1)) delete ctx.session.env[name];
  return ok();
}

export function alias(ctx: CommandContext): CommandResult {
  const args = ctx.argv.slice(1);
  if (args.length === 0) {
    const lines = Object.entries(ctx.session.aliases)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => `alias ${name}='${value}'`);
    return ok(lines.length > 0 ? `${lines.join("\n")}\n` : "");
  }

  for (const arg of args) {
    const match = /^(\w[\w-]*)=(.*)$/.exec(arg);
    if (!match) {
      const value = ctx.session.aliases[arg];
      if (!value) return fail(`alias: ${arg}: not found`);
      continue;
    }
    ctx.session.aliases[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return ok();
}

export function unalias(ctx: CommandContext): CommandResult {
  for (const name of ctx.argv.slice(1)) delete ctx.session.aliases[name];
  return ok();
}

export function which(ctx: CommandContext): CommandResult {
  const { operands } = parseFlags(ctx.argv);
  let stdout = "";
  let missing = false;

  for (const name of operands) {
    if (ctx.session.aliases[name]) {
      stdout += `${name}: aliased to ${ctx.session.aliases[name]}\n`;
    } else if (hasCommand(name)) {
      stdout += `/usr/bin/${name}\n`;
    } else {
      missing = true;
    }
  }
  return { stdout, code: missing ? 1 : 0 };
}

export function history(ctx: CommandContext): CommandResult {
  const lines = ctx.session.history.map((entry, index) => `${String(index + 1).padStart(5)}  ${entry}`);
  return ok(lines.length > 0 ? `${lines.join("\n")}\n` : "");
}

export function clear(ctx: CommandContext): CommandResult {
  ctx.io.clear();
  return ok();
}

export function whoami(ctx: CommandContext): CommandResult {
  return ok(`${ctx.session.env.USER ?? "candidate"}\n`);
}

export function date(): CommandResult {
  return ok(`${new Date().toString()}\n`);
}

export function uname(ctx: CommandContext): CommandResult {
  const { flags } = parseFlags(ctx.argv);
  if (flags.has("a")) return ok("Mindfries wasm browser x86_64 JavaScript\n");
  return ok("Mindfries\n");
}

export function help(): CommandResult {
  const sections = [
    "Files:      ls cd pwd cat touch mkdir rm mv cp find tree",
    "Text:       echo grep sed head tail wc sort uniq cut tr diff",
    "Run:        node/js <file>.js  ts-node/tsx <file>.ts  python/python3 <file>.py",
    "Packages:   pip install <pkg>   npm install <pkg>   (pip list, npm list)",
    "Git:        git init/add/commit/status/log/diff/branch/checkout",
    "Network:    curl <url>  wget <url>",
    "Shell:      export FOO=bar, $FOO, alias, unalias, which, env, history, clear",
    "Operators:  |  >  >>  <  &&  ||  ;   globs (*.ts)   $? for last exit code",
    "",
    `All commands: ${commandNames().join(" ")}`,
  ];
  return ok(`${sections.join("\n")}\n`);
}

/** `cat > file` style writing without a real editor: `write <file> <text...>`. */
export function write(ctx: CommandContext): CommandResult {
  const { operands } = parseFlags(ctx.argv);
  const [file, ...rest] = operands;
  if (!file) return fail("usage: write <file> [text ...]");

  const content = rest.length > 0 ? `${rest.join(" ")}\n` : ctx.stdin;
  const error = ctx.vfs.write(segmentsToPath(resolve(ctx.session, file)), content);
  return error ? fail(`write: ${file}: ${error}`) : ok();
}
