import type { TreeNode } from "../../types";
import { segmentsToDisplay, segmentsToPath } from "../../vfs-path";
import { childrenAt, matchesGlob, nodeAt, readFile, resolve, sortEntries, walk } from "../fs-util";
import { fail, ok, type CommandContext, type CommandResult } from "../types";

/** Splits `-la file.txt` into flags {l,a} and operands ["file.txt"]. */
export function parseFlags(argv: string[]): { flags: Set<string>; operands: string[] } {
  const flags = new Set<string>();
  const operands: string[] = [];
  let literal = false;

  for (const arg of argv.slice(1)) {
    if (literal || arg === "-" || !arg.startsWith("-")) {
      operands.push(arg);
      continue;
    }
    if (arg === "--") {
      literal = true;
      continue;
    }
    if (arg.startsWith("--")) {
      flags.add(arg.slice(2));
      continue;
    }
    for (const ch of arg.slice(1)) flags.add(ch);
  }
  return { flags, operands };
}

const BLUE = "\x1b[1;34m";
const RESET = "\x1b[0m";

export function ls(ctx: CommandContext): CommandResult {
  const { flags, operands } = parseFlags(ctx.argv);
  const targets = operands.length > 0 ? operands : ["."];
  const showHidden = flags.has("a");
  const longFormat = flags.has("l");
  const onePerLine = flags.has("1") || longFormat;

  // Real `ls` groups its operands: every file argument is listed together
  // first, then each directory argument gets its own (headed) listing.
  const fileTargets: TreeNode[] = [];
  const dirTargets: string[] = [];
  let errors = "";

  for (const target of targets) {
    const node = nodeAt(ctx.vfs, resolve(ctx.session, target));
    if (!node) {
      errors += `ls: ${target}: No such file or directory\n`;
      continue;
    }
    if (node !== "root" && node.type === "file") fileTargets.push({ ...node, name: target });
    else dirTargets.push(target);
  }

  const format = (entries: TreeNode[]) =>
    formatEntries(entries, { longFormat, onePerLine, color: ctx.isTerminalSink, ctx });

  const chunks: string[] = [];
  if (fileTargets.length > 0) chunks.push(format(sortEntries(fileTargets)));

  const needsHeadings = dirTargets.length + (fileTargets.length > 0 ? 1 : 0) > 1;
  for (const target of dirTargets) {
    const entries = sortEntries(childrenAt(ctx.vfs, resolve(ctx.session, target)) ?? []).filter(
      (n) => showHidden || !n.name.startsWith(".")
    );
    chunks.push((needsHeadings ? `${target}:\n` : "") + format(entries));
  }

  return { stdout: chunks.join(""), stderr: errors, code: errors ? 1 : 0 };
}

function formatEntries(
  entries: TreeNode[],
  options: { longFormat: boolean; onePerLine: boolean; color: boolean; ctx: CommandContext }
): string {
  if (entries.length === 0) return "";

  const name = (n: TreeNode) => {
    const label = n.type === "folder" ? `${n.name}/` : n.name;
    return options.color && n.type === "folder" ? `${BLUE}${label}${RESET}` : label;
  };

  if (options.longFormat) {
    const files = options.ctx.vfs.getSnapshot().files;
    return (
      entries
        .map((n) => {
          const size = n.type === "file" ? (files[n.path] ?? "").length : 0;
          const kind = n.type === "folder" ? "drwxr-xr-x" : "-rw-r--r--";
          return `${kind} ${String(size).padStart(6)} ${name(n)}`;
        })
        .join("\n") + "\n"
    );
  }
  return entries.map(name).join(options.onePerLine ? "\n" : "  ") + "\n";
}

export function cd(ctx: CommandContext): CommandResult {
  const { operands } = parseFlags(ctx.argv);
  const target = operands[0];

  // Bare `cd` goes home, and `cd -` returns to the previous directory.
  if (target === "-") {
    const previous = ctx.session.env.OLDPWD;
    if (!previous) return fail("cd: OLDPWD not set");
    return changeDirectory(ctx, resolve({ ...ctx.session, cwd: [] }, previous), previous);
  }
  return changeDirectory(ctx, resolve(ctx.session, target ?? ""), target ?? "~");
}

function changeDirectory(ctx: CommandContext, segments: string[], label: string): CommandResult {
  const node = nodeAt(ctx.vfs, segments);
  if (!node) return fail(`cd: ${label}: No such file or directory`);
  if (node !== "root" && node.type === "file") return fail(`cd: ${label}: Not a directory`);

  ctx.session.env.OLDPWD = segmentsToDisplay(ctx.session.cwd);
  ctx.session.cwd = segments;
  ctx.session.env.PWD = segmentsToDisplay(segments);
  return ok();
}

export function pwd(ctx: CommandContext): CommandResult {
  return ok(`${segmentsToDisplay(ctx.session.cwd)}\n`);
}

export function cat(ctx: CommandContext): CommandResult {
  const { operands } = parseFlags(ctx.argv);
  // No operands means read stdin — that's what makes `ls | cat` work.
  if (operands.length === 0) return ok(ctx.stdin);

  let stdout = "";
  let stderr = "";
  for (const operand of operands) {
    const segments = resolve(ctx.session, operand);
    const node = nodeAt(ctx.vfs, segments);
    if (!node) {
      stderr += `cat: ${operand}: No such file or directory\n`;
      continue;
    }
    if (node === "root" || node.type === "folder") {
      stderr += `cat: ${operand}: Is a directory\n`;
      continue;
    }
    const content = readFile(ctx.vfs, segments) ?? "";
    stdout += content.endsWith("\n") || content === "" ? content : `${content}\n`;
  }
  return { stdout, stderr, code: stderr ? 1 : 0 };
}

export function touch(ctx: CommandContext): CommandResult {
  const { operands } = parseFlags(ctx.argv);
  if (operands.length === 0) return fail("touch: missing file operand");

  let stderr = "";
  for (const operand of operands) {
    const segments = resolve(ctx.session, operand);
    // Touching an existing file is a no-op here (no mtimes to update).
    if (nodeAt(ctx.vfs, segments)) continue;
    const error = ctx.vfs.createFile(segmentsToPath(segments));
    if (error) stderr += `touch: cannot touch '${operand}': ${error}\n`;
  }
  return { stderr, code: stderr ? 1 : 0 };
}

export function mkdir(ctx: CommandContext): CommandResult {
  const { flags, operands } = parseFlags(ctx.argv);
  if (operands.length === 0) return fail("mkdir: missing operand");
  const parents = flags.has("p");

  let stderr = "";
  for (const operand of operands) {
    const segments = resolve(ctx.session, operand);
    if (parents) {
      for (let i = 1; i <= segments.length; i++) {
        const prefix = segments.slice(0, i);
        if (nodeAt(ctx.vfs, prefix)) continue;
        const error = ctx.vfs.createFolder(segmentsToPath(prefix));
        if (error) {
          stderr += `mkdir: cannot create directory '${operand}': ${error}\n`;
          break;
        }
      }
      continue;
    }
    const error = ctx.vfs.createFolder(segmentsToPath(segments));
    if (error) stderr += `mkdir: cannot create directory '${operand}': ${error}\n`;
  }
  return { stderr, code: stderr ? 1 : 0 };
}

export function rm(ctx: CommandContext): CommandResult {
  const { flags, operands } = parseFlags(ctx.argv);
  const recursive = flags.has("r") || flags.has("R");
  const force = flags.has("f");
  if (operands.length === 0) return force ? ok() : fail("rm: missing operand");

  let stderr = "";
  for (const operand of operands) {
    const segments = resolve(ctx.session, operand);
    if (!nodeAt(ctx.vfs, segments)) {
      if (!force) stderr += `rm: cannot remove '${operand}': No such file or directory\n`;
      continue;
    }
    const error = ctx.vfs.remove(segmentsToPath(segments), recursive);
    if (error && !force) stderr += `rm: cannot remove '${operand}': ${error}\n`;
  }
  return { stderr, code: stderr ? 1 : 0 };
}

export function mv(ctx: CommandContext): CommandResult {
  const { operands } = parseFlags(ctx.argv);
  if (operands.length < 2) return fail("mv: missing destination file operand");

  const sources = operands.slice(0, -1);
  const destination = operands[operands.length - 1];
  const destSegments = resolve(ctx.session, destination);
  const destNode = nodeAt(ctx.vfs, destSegments);
  const intoDirectory = destNode === "root" || (destNode && destNode.type === "folder");

  if (sources.length > 1 && !intoDirectory) {
    return fail(`mv: target '${destination}' is not a directory`);
  }

  let stderr = "";
  for (const source of sources) {
    const sourceSegments = resolve(ctx.session, source);
    if (!nodeAt(ctx.vfs, sourceSegments)) {
      stderr += `mv: cannot stat '${source}': No such file or directory\n`;
      continue;
    }
    // `mv a dir/` moves INTO dir keeping the name; otherwise the last
    // destination segment IS the new name — same as real mv.
    const parent = intoDirectory ? destSegments : destSegments.slice(0, -1);
    const name = intoDirectory
      ? sourceSegments[sourceSegments.length - 1]
      : destSegments[destSegments.length - 1];
    const error = ctx.vfs.move(
      segmentsToPath(sourceSegments),
      parent.length > 0 ? segmentsToPath(parent) : null,
      name
    );
    if (error) stderr += `mv: cannot move '${source}' to '${destination}': ${error}\n`;
  }
  return { stderr, code: stderr ? 1 : 0 };
}

export function cp(ctx: CommandContext): CommandResult {
  const { flags, operands } = parseFlags(ctx.argv);
  const recursive = flags.has("r") || flags.has("R");
  if (operands.length < 2) return fail("cp: missing destination file operand");

  const sources = operands.slice(0, -1);
  const destination = operands[operands.length - 1];
  const destSegments = resolve(ctx.session, destination);
  const destNode = nodeAt(ctx.vfs, destSegments);
  const intoDirectory = destNode === "root" || (destNode && destNode.type === "folder");

  let stderr = "";
  for (const source of sources) {
    const sourceSegments = resolve(ctx.session, source);
    const sourceNode = nodeAt(ctx.vfs, sourceSegments);
    if (!sourceNode || sourceNode === "root") {
      stderr += `cp: cannot stat '${source}': No such file or directory\n`;
      continue;
    }

    const name = sourceNode.name;
    const targetSegments = intoDirectory ? [...destSegments, name] : destSegments;

    if (sourceNode.type === "folder") {
      if (!recursive) {
        stderr += `cp: -r not specified; omitting directory '${source}'\n`;
        continue;
      }
      stderr += copyTree(ctx, sourceNode, targetSegments, source);
      continue;
    }

    const content = readFile(ctx.vfs, sourceSegments) ?? "";
    const error = ctx.vfs.write(segmentsToPath(targetSegments), content);
    if (error) stderr += `cp: cannot create '${destination}': ${error}\n`;
  }
  return { stderr, code: stderr ? 1 : 0 };
}

/** Recursive directory copy for `cp -r`, recreating the subtree under `targetSegments`. */
function copyTree(
  ctx: CommandContext,
  source: TreeNode,
  targetSegments: string[],
  label: string
): string {
  if (source.type === "file") {
    const content = ctx.vfs.getSnapshot().files[source.path] ?? "";
    const error = ctx.vfs.write(segmentsToPath(targetSegments), content);
    return error ? `cp: cannot create '${label}': ${error}\n` : "";
  }

  if (!nodeAt(ctx.vfs, targetSegments)) {
    const error = ctx.vfs.createFolder(segmentsToPath(targetSegments));
    if (error) return `cp: cannot create directory '${label}': ${error}\n`;
  }
  let stderr = "";
  for (const child of source.children) {
    stderr += copyTree(ctx, child, [...targetSegments, child.name], `${label}/${child.name}`);
  }
  return stderr;
}

export function find(ctx: CommandContext): CommandResult {
  const argv = ctx.argv.slice(1);
  const start = argv.find((a) => !a.startsWith("-")) ?? ".";
  const nameIndex = argv.indexOf("-name");
  const typeIndex = argv.indexOf("-type");
  const namePattern = nameIndex !== -1 ? argv[nameIndex + 1] : null;
  const typeFilter = typeIndex !== -1 ? argv[typeIndex + 1] : null;

  const startSegments = resolve(ctx.session, start);
  if (!nodeAt(ctx.vfs, startSegments)) {
    return fail(`find: '${start}': No such file or directory`);
  }

  const matches = walk(ctx.vfs, startSegments).filter((node) => {
    if (namePattern && !matchesGlob(node.name, namePattern)) return false;
    if (typeFilter === "f" && node.type !== "file") return false;
    if (typeFilter === "d" && node.type !== "folder") return false;
    return true;
  });

  const prefix = start === "." ? "." : start.replace(/\/$/, "");
  const base = segmentsToPath(startSegments);
  const lines = matches.map((node) => {
    const relative = base ? node.path.slice(base.length).replace(/^\//, "") : node.path;
    return relative ? `${prefix}/${relative}` : prefix;
  });
  return ok(lines.length > 0 ? `${lines.join("\n")}\n` : "");
}

export function tree(ctx: CommandContext): CommandResult {
  const { operands } = parseFlags(ctx.argv);
  const startSegments = resolve(ctx.session, operands[0] ?? ".");
  const entries = childrenAt(ctx.vfs, startSegments);
  if (entries === null) return fail(`tree: ${operands[0] ?? "."}: Not a directory`);

  const lines: string[] = [operands[0] ?? "."];
  let directories = 0;
  let files = 0;

  const render = (nodes: TreeNode[], prefix: string) => {
    const sorted = sortEntries(nodes);
    sorted.forEach((node, index) => {
      const last = index === sorted.length - 1;
      lines.push(`${prefix}${last ? "└── " : "├── "}${node.name}${node.type === "folder" ? "/" : ""}`);
      if (node.type === "folder") {
        directories++;
        render(node.children, `${prefix}${last ? "    " : "│   "}`);
      } else {
        files++;
      }
    });
  };

  render(entries, "");
  lines.push("", `${directories} directories, ${files} files`);
  return ok(`${lines.join("\n")}\n`);
}
