import { readFile, resolve, walk } from "../fs-util";
import { fail, ok, type CommandContext, type CommandResult } from "../types";
import { parseFlags } from "./fs";

/** Splits into lines without inventing a trailing empty one for a final newline. */
function toLines(text: string): string[] {
  if (text === "") return [];
  return text.replace(/\n$/, "").split("\n");
}

function fromLines(lines: string[]): string {
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

/** Reads the named files, or stdin when there are none — the standard filter contract. */
function gatherInput(
  ctx: CommandContext,
  operands: string[],
  command: string
): { sources: { label: string; text: string }[]; stderr: string } {
  if (operands.length === 0) return { sources: [{ label: "", text: ctx.stdin }], stderr: "" };

  const sources: { label: string; text: string }[] = [];
  let stderr = "";
  for (const operand of operands) {
    const content = readFile(ctx.vfs, resolve(ctx.session, operand));
    if (content === null) {
      stderr += `${command}: ${operand}: No such file or directory\n`;
      continue;
    }
    sources.push({ label: operand, text: content });
  }
  return { sources, stderr };
}

export function echo(ctx: CommandContext): CommandResult {
  const args = ctx.argv.slice(1);
  const noNewline = args[0] === "-n";
  const text = (noNewline ? args.slice(1) : args).join(" ");
  return ok(noNewline ? text : `${text}\n`);
}

export function grep(ctx: CommandContext): CommandResult {
  const { flags, operands } = parseFlags(ctx.argv);
  const pattern = operands[0];
  if (pattern === undefined) return fail("usage: grep [-invcr] pattern [file ...]");

  const ignoreCase = flags.has("i");
  const invert = flags.has("v");
  const showNumbers = flags.has("n");
  const countOnly = flags.has("c");
  const recursive = flags.has("r") || flags.has("R");

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, ignoreCase ? "i" : "");
  } catch {
    return fail(`grep: ${pattern}: invalid regular expression`, 2);
  }

  let fileOperands = operands.slice(1);
  if (recursive) {
    const roots = fileOperands.length > 0 ? fileOperands : ["."];
    fileOperands = roots.flatMap((root) => {
      const base = resolve(ctx.session, root);
      const prefix = root === "." ? "" : `${root.replace(/\/$/, "")}/`;
      const basePath = base.join("/");
      return walk(ctx.vfs, base)
        .filter((node) => node.type === "file")
        .map((node) => {
          const relative = basePath ? node.path.slice(basePath.length).replace(/^\//, "") : node.path;
          return `${prefix}${relative}`;
        });
    });
  }

  const { sources, stderr } = gatherInput(ctx, fileOperands, "grep");
  const showFilenames = sources.length > 1;
  let stdout = "";
  let matched = false;

  for (const source of sources) {
    const hits: string[] = [];
    toLines(source.text).forEach((line, index) => {
      if (regex.test(line) === invert) return;
      matched = true;
      const withNumber = showNumbers ? `${index + 1}:${line}` : line;
      hits.push(showFilenames ? `${source.label}:${withNumber}` : withNumber);
    });

    if (countOnly) {
      stdout += showFilenames ? `${source.label}:${hits.length}\n` : `${hits.length}\n`;
      continue;
    }
    stdout += fromLines(hits);
  }

  // grep's exit code is a real API: 0 = found, 1 = not found. `&&` depends on it.
  return { stdout, stderr, code: stderr ? 2 : matched ? 0 : 1 };
}

export function head(ctx: CommandContext): CommandResult {
  return headOrTail(ctx, "head");
}

export function tail(ctx: CommandContext): CommandResult {
  return headOrTail(ctx, "tail");
}

function headOrTail(ctx: CommandContext, command: "head" | "tail"): CommandResult {
  const args = ctx.argv.slice(1);
  let count = 10;
  const operands: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-n" && args[i + 1]) {
      count = Number.parseInt(args[i + 1], 10);
      i++;
      continue;
    }
    const shorthand = /^-(\d+)$/.exec(args[i]);
    if (shorthand) {
      count = Number.parseInt(shorthand[1], 10);
      continue;
    }
    operands.push(args[i]);
  }
  if (!Number.isFinite(count) || count < 0) return fail(`${command}: illegal line count`);

  const { sources, stderr } = gatherInput(ctx, operands, command);
  let stdout = "";
  for (const source of sources) {
    const lines = toLines(source.text);
    const slice = command === "head" ? lines.slice(0, count) : lines.slice(-count);
    if (sources.length > 1) stdout += `==> ${source.label} <==\n`;
    stdout += fromLines(slice);
  }
  return { stdout, stderr, code: stderr ? 1 : 0 };
}

export function wc(ctx: CommandContext): CommandResult {
  const { flags, operands } = parseFlags(ctx.argv);
  const { sources, stderr } = gatherInput(ctx, operands, "wc");
  const showAll = !flags.has("l") && !flags.has("w") && !flags.has("c");

  let stdout = "";
  for (const source of sources) {
    const lines = toLines(source.text).length;
    const words = source.text.split(/\s+/).filter(Boolean).length;
    const characters = source.text.length;

    const columns: string[] = [];
    if (showAll || flags.has("l")) columns.push(String(lines).padStart(6));
    if (showAll || flags.has("w")) columns.push(String(words).padStart(6));
    if (showAll || flags.has("c")) columns.push(String(characters).padStart(6));
    stdout += `${columns.join(" ")}${source.label ? ` ${source.label}` : ""}\n`;
  }
  return { stdout, stderr, code: stderr ? 1 : 0 };
}

export function sort(ctx: CommandContext): CommandResult {
  const { flags, operands } = parseFlags(ctx.argv);
  const { sources, stderr } = gatherInput(ctx, operands, "sort");
  let lines = sources.flatMap((source) => toLines(source.text));

  lines = flags.has("n")
    ? lines.sort((a, b) => (Number.parseFloat(a) || 0) - (Number.parseFloat(b) || 0))
    : lines.sort((a, b) => a.localeCompare(b));
  if (flags.has("r")) lines.reverse();
  if (flags.has("u")) lines = [...new Set(lines)];

  return { stdout: fromLines(lines), stderr, code: stderr ? 1 : 0 };
}

export function uniq(ctx: CommandContext): CommandResult {
  const { flags, operands } = parseFlags(ctx.argv);
  const { sources, stderr } = gatherInput(ctx, operands, "uniq");
  const lines = sources.flatMap((source) => toLines(source.text));

  // Real uniq only collapses ADJACENT duplicates — that's why `sort | uniq`
  // is the idiom rather than uniq alone.
  const groups: { line: string; count: number }[] = [];
  for (const line of lines) {
    const last = groups[groups.length - 1];
    if (last && last.line === line) last.count++;
    else groups.push({ line, count: 1 });
  }

  const output = groups
    .filter((group) => (flags.has("d") ? group.count > 1 : true))
    .map((group) => (flags.has("c") ? `${String(group.count).padStart(4)} ${group.line}` : group.line));
  return { stdout: fromLines(output), stderr, code: stderr ? 1 : 0 };
}

export function cut(ctx: CommandContext): CommandResult {
  const args = ctx.argv.slice(1);
  let delimiter = "\t";
  let fields: number[] = [];
  const operands: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("-d")) {
      delimiter = args[i].length > 2 ? args[i].slice(2) : (args[++i] ?? "\t");
      continue;
    }
    if (args[i].startsWith("-f")) {
      const spec = args[i].length > 2 ? args[i].slice(2) : (args[++i] ?? "");
      fields = spec.split(",").map((f) => Number.parseInt(f, 10)).filter(Number.isFinite);
      continue;
    }
    operands.push(args[i]);
  }
  if (fields.length === 0) return fail("cut: you must specify a list of fields with -f");

  const { sources, stderr } = gatherInput(ctx, operands, "cut");
  const lines = sources.flatMap((source) =>
    toLines(source.text).map((line) => {
      const parts = line.split(delimiter);
      return fields.map((field) => parts[field - 1] ?? "").join(delimiter);
    })
  );
  return { stdout: fromLines(lines), stderr, code: stderr ? 1 : 0 };
}

export function tr(ctx: CommandContext): CommandResult {
  const { flags, operands } = parseFlags(ctx.argv);
  const [from, to] = operands;
  if (!from) return fail("usage: tr [-d] set1 [set2]");

  let text = ctx.stdin;
  if (flags.has("d")) {
    text = [...text].filter((ch) => !from.includes(ch)).join("");
  } else {
    if (!to) return fail("usage: tr set1 set2");
    text = [...text]
      .map((ch) => {
        const index = from.indexOf(ch);
        return index === -1 ? ch : (to[index] ?? to[to.length - 1]);
      })
      .join("");
  }
  return ok(text);
}

/** `sed s/pattern/replacement/[g]` — the substitution everyone actually uses. */
export function sed(ctx: CommandContext): CommandResult {
  const { flags, operands } = parseFlags(ctx.argv);
  const script = operands[0];
  if (!script) return fail("usage: sed [-i] s/pattern/replacement/[g] [file ...]");

  const match = /^s(.)(.*?)\1(.*?)\1([gi]*)$/.exec(script);
  if (!match) return fail(`sed: unsupported script '${script}' (only s/pattern/replacement/ is supported)`);
  const [, , pattern, replacement, modifiers] = match;

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, modifiers.includes("g") ? "g" : "");
  } catch {
    return fail(`sed: invalid regular expression '${pattern}'`);
  }

  const fileOperands = operands.slice(1);
  const { sources, stderr } = gatherInput(ctx, fileOperands, "sed");
  let stdout = "";
  let writeErrors = "";

  for (const source of sources) {
    const result = fromLines(toLines(source.text).map((line) => line.replace(regex, replacement)));
    // -i edits the file in place instead of printing, like GNU sed.
    if (flags.has("i") && source.label) {
      const error = ctx.vfs.write(resolve(ctx.session, source.label).join("/"), result);
      if (error) writeErrors += `sed: ${source.label}: ${error}\n`;
      continue;
    }
    stdout += result;
  }
  return { stdout, stderr: stderr + writeErrors, code: stderr || writeErrors ? 1 : 0 };
}

/** Unified-ish line diff: enough to see what changed, not a full Myers diff. */
export function diff(ctx: CommandContext): CommandResult {
  const { operands } = parseFlags(ctx.argv);
  if (operands.length < 2) return fail("usage: diff file1 file2");

  const [leftPath, rightPath] = operands;
  const left = readFile(ctx.vfs, resolve(ctx.session, leftPath));
  const right = readFile(ctx.vfs, resolve(ctx.session, rightPath));
  if (left === null) return fail(`diff: ${leftPath}: No such file or directory`, 2);
  if (right === null) return fail(`diff: ${rightPath}: No such file or directory`, 2);
  if (left === right) return ok();

  const leftLines = toLines(left);
  const rightLines = toLines(right);
  const output: string[] = [`--- ${leftPath}`, `+++ ${rightPath}`];

  for (let i = 0; i < Math.max(leftLines.length, rightLines.length); i++) {
    if (leftLines[i] === rightLines[i]) continue;
    if (leftLines[i] !== undefined) output.push(`-${leftLines[i]}`);
    if (rightLines[i] !== undefined) output.push(`+${rightLines[i]}`);
  }
  // Exit 1 means "files differ" — scripts branch on this.
  return { stdout: fromLines(output), code: 1 };
}
