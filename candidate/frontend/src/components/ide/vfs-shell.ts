import type { Terminal } from "@xterm/xterm";
import type { VfsBridge } from "@/lib/ide/vfs-bridge";
import { findNode } from "@/lib/ide/tree";
import { resolveInputPath, segmentsToDisplay, segmentsToPath } from "@/lib/ide/vfs-path";
import { getPyodide } from "@/lib/ide/pyodide-runtime";
import { runJavaScript } from "@/lib/ide/code-runner";

const HELP_TEXT = [
  "Filesystem: ls, cd, pwd, cat, touch, mkdir [-p], rm [-r], mv, cp, echo [> file | >> file]",
  "Run scripts: node <file>.js, python <file>.py",
  "Other: clear, whoami, date, help",
].join("\r\n");

// True-color (24-bit) escape for the exact brand purple (#7957da) — the
// standard 16-color ANSI palette has no purple, only magenta, which reads
// noticeably pink/off-brand next to the rest of the UI.
const BRAND_PURPLE = "\x1b[1;38;2;121;87;218m";

function promptFor(cwd: string[]): string {
  return `${BRAND_PURPLE}mindfries\x1b[0m \x1b[1;34m~${segmentsToDisplay(cwd)}\x1b[0m$ `;
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of input) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === " " && !inQuotes) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

interface ShellState {
  cwd: string[];
}

/** Attaches an interactive shell backed by a real (in-memory) virtual filesystem, shared with the Explorer/Editor. */
export function attachVfsShell(term: Terminal, vfs: VfsBridge): () => void {
  const state: ShellState = { cwd: [] };
  let buffer = "";
  const history: string[] = [];
  let historyIndex = -1;
  let busy = false;

  const writePrompt = () => term.write(`\r\n${promptFor(state.cwd)}`);

  term.writeln("Linux commands are supported.");
  term.write(promptFor(state.cwd));

  const disposable = term.onData((data) => {
    if (busy) return; // block input while a foreground command (python/node) is running
    const code = data.charCodeAt(0);

    if (data === "\r") {
      term.write("\r\n");
      const cmd = buffer.trim();
      if (cmd) history.push(cmd);
      historyIndex = history.length;
      buffer = "";
      busy = true;
      runCommand(term, vfs, state, cmd)
        .catch((err) => term.writeln(`\x1b[31m${err instanceof Error ? err.message : String(err)}\x1b[0m`))
        .finally(() => {
          busy = false;
          writePrompt();
        });
      return;
    }

    if (code === 127) {
      if (buffer.length > 0) {
        buffer = buffer.slice(0, -1);
        term.write("\b \b");
      }
      return;
    }

    if (data === "\x1b[A") {
      if (historyIndex > 0) {
        historyIndex -= 1;
        replaceLine(term, buffer, history[historyIndex]);
        buffer = history[historyIndex];
      }
      return;
    }

    if (data === "\x1b[B") {
      if (historyIndex < history.length - 1) {
        historyIndex += 1;
        replaceLine(term, buffer, history[historyIndex]);
        buffer = history[historyIndex];
      } else if (historyIndex === history.length - 1) {
        historyIndex = history.length;
        replaceLine(term, buffer, "");
        buffer = "";
      }
      return;
    }

    if (code < 32) return; // ignore other control characters for this shell

    buffer += data;
    term.write(data);
  });

  return () => disposable.dispose();
}

function replaceLine(term: Terminal, current: string, next: string) {
  if (current.length > 0) term.write("\b \b".repeat(current.length));
  term.write(next);
}

async function runCommand(term: Terminal, vfs: VfsBridge, state: ShellState, cmd: string): Promise<void> {
  if (!cmd) return;
  const [name, ...args] = tokenize(cmd);

  switch (name) {
    case "help":
      term.writeln(HELP_TEXT);
      return;
    case "pwd":
      term.writeln(segmentsToDisplay(state.cwd));
      return;
    case "whoami":
      term.writeln("candidate");
      return;
    case "date":
      term.writeln(new Date().toString());
      return;
    case "clear":
      term.clear();
      return;
    case "ls":
      return runLs(term, vfs, state, args[0]);
    case "cd":
      return runCd(term, vfs, state, args[0]);
    case "cat":
      return runCat(term, vfs, state, args);
    case "touch":
      return runTouch(term, vfs, state, args);
    case "mkdir":
      return runMkdir(term, vfs, state, args);
    case "rm":
      return runRm(term, vfs, state, args);
    case "mv":
      return runMv(term, vfs, state, args);
    case "cp":
      return runCp(term, vfs, state, args);
    case "echo":
      return runEcho(term, vfs, state, args);
    case "node":
    case "js":
      return runNode(term, vfs, state, args);
    case "python":
    case "python3":
      return runPython(term, vfs, state, args);
    default:
      term.writeln(`command not found: ${name}`);
  }
}

function resolve(state: ShellState, input: string | undefined): string[] {
  return resolveInputPath(state.cwd, input ?? "");
}

function runLs(term: Terminal, vfs: VfsBridge, state: ShellState, arg?: string) {
  const target = arg ? resolve(state, arg) : state.cwd;
  const { tree } = vfs.getSnapshot();

  let children;
  if (target.length === 0) {
    children = tree;
  } else {
    const node = findNode(tree, segmentsToPath(target));
    if (!node) {
      term.writeln(`ls: ${arg}: No such file or directory`);
      return;
    }
    if (node.type === "file") {
      term.writeln(node.name);
      return;
    }
    children = node.children;
  }

  if (children.length === 0) return;
  const sorted = [...children].sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  const line = sorted
    .map((n) => (n.type === "folder" ? `\x1b[1;34m${n.name}/\x1b[0m` : n.name))
    .join("  ");
  term.writeln(line);
}

function runCd(term: Terminal, vfs: VfsBridge, state: ShellState, arg?: string) {
  const target = resolve(state, arg);
  if (target.length === 0) {
    state.cwd = [];
    return;
  }
  const { tree } = vfs.getSnapshot();
  const node = findNode(tree, segmentsToPath(target));
  if (!node) {
    term.writeln(`cd: ${arg}: No such file or directory`);
    return;
  }
  if (node.type === "file") {
    term.writeln(`cd: ${arg}: Not a directory`);
    return;
  }
  state.cwd = target;
}

function runCat(term: Terminal, vfs: VfsBridge, state: ShellState, args: string[]) {
  if (args.length === 0) {
    term.writeln("cat: missing file operand");
    return;
  }
  const { tree, files } = vfs.getSnapshot();
  for (const arg of args) {
    const target = resolve(state, arg);
    const node = findNode(tree, segmentsToPath(target));
    if (!node) {
      term.writeln(`cat: ${arg}: No such file or directory`);
      continue;
    }
    if (node.type === "folder") {
      term.writeln(`cat: ${arg}: Is a directory`);
      continue;
    }
    term.write(files[node.path] ?? "");
    term.write("\r\n");
  }
}

function runTouch(term: Terminal, vfs: VfsBridge, state: ShellState, args: string[]) {
  if (args.length === 0) {
    term.writeln("touch: missing file operand");
    return;
  }
  for (const arg of args) {
    const target = resolve(state, arg);
    const err = vfs.createFile(segmentsToPath(target));
    if (err) term.writeln(`touch: cannot touch '${arg}': ${err}`);
  }
}

function runMkdir(term: Terminal, vfs: VfsBridge, state: ShellState, args: string[]) {
  const parents = args.includes("-p");
  const targets = args.filter((a) => a !== "-p");
  if (targets.length === 0) {
    term.writeln("mkdir: missing operand");
    return;
  }
  for (const arg of targets) {
    const target = resolve(state, arg);
    if (parents) {
      for (let i = 1; i <= target.length; i++) {
        const prefix = target.slice(0, i);
        const { tree } = vfs.getSnapshot();
        if (!findNode(tree, segmentsToPath(prefix))) {
          const err = vfs.createFolder(segmentsToPath(prefix));
          if (err) {
            term.writeln(`mkdir: cannot create directory '${arg}': ${err}`);
            break;
          }
        }
      }
    } else {
      const err = vfs.createFolder(segmentsToPath(target));
      if (err) term.writeln(`mkdir: cannot create directory '${arg}': ${err}`);
    }
  }
}

function runRm(term: Terminal, vfs: VfsBridge, state: ShellState, args: string[]) {
  const recursive = args.some((a) => a === "-r" || a === "-rf" || a === "-fr" || a === "-R");
  const targets = args.filter((a) => !a.startsWith("-"));
  if (targets.length === 0) {
    term.writeln("rm: missing operand");
    return;
  }
  for (const arg of targets) {
    const target = resolve(state, arg);
    const err = vfs.remove(segmentsToPath(target), recursive);
    if (err) term.writeln(`rm: cannot remove '${arg}': ${err}`);
  }
}

function runMv(term: Terminal, vfs: VfsBridge, state: ShellState, args: string[]) {
  const [src, dest] = args;
  if (!src || !dest) {
    term.writeln("mv: missing file operand");
    return;
  }
  const { tree } = vfs.getSnapshot();
  const srcTarget = resolve(state, src);
  const srcPath = segmentsToPath(srcTarget);
  if (!findNode(tree, srcPath)) {
    term.writeln(`mv: cannot stat '${src}': No such file or directory`);
    return;
  }

  // `mv a b/` (an existing directory) moves INTO it, keeping the same name —
  // same as real mv — otherwise the destination's last segment is the new name.
  const destTarget = resolve(state, dest);
  const destNode = findNode(tree, segmentsToPath(destTarget));
  const destParent = destNode?.type === "folder" ? destTarget : destTarget.slice(0, -1);
  const destName = destNode?.type === "folder" ? srcTarget[srcTarget.length - 1] : destTarget[destTarget.length - 1];

  const err = vfs.move(srcPath, destParent.length ? segmentsToPath(destParent) : null, destName);
  if (err) term.writeln(`mv: cannot move '${src}' to '${dest}': ${err}`);
}

function runCp(term: Terminal, vfs: VfsBridge, state: ShellState, args: string[]) {
  const [src, dest] = args;
  if (!src || !dest) {
    term.writeln("cp: missing file operand");
    return;
  }
  const { tree, files } = vfs.getSnapshot();
  const srcTarget = resolve(state, src);
  const srcNode = findNode(tree, segmentsToPath(srcTarget));
  if (!srcNode) {
    term.writeln(`cp: cannot stat '${src}': No such file or directory`);
    return;
  }
  if (srcNode.type === "folder") {
    term.writeln(`cp: -r not implemented for directories in this demo shell`);
    return;
  }
  const destTarget = resolve(state, dest);
  const err = vfs.createFile(segmentsToPath(destTarget), files[srcNode.path] ?? "");
  if (err) term.writeln(`cp: cannot create '${dest}': ${err}`);
}

function runEcho(term: Terminal, vfs: VfsBridge, state: ShellState, args: string[]) {
  const redirectIndex = args.findIndex((a) => a === ">" || a === ">>" || a.startsWith(">"));
  if (redirectIndex === -1) {
    term.writeln(args.join(" "));
    return;
  }
  const text = args.slice(0, redirectIndex).join(" ");
  const marker = args[redirectIndex];
  const append = marker.startsWith(">>");
  const inlineTarget = marker.replace(/^>>?/, "");
  const target = inlineTarget || args[redirectIndex + 1];
  if (!target) {
    term.writeln("echo: syntax error near unexpected token 'newline'");
    return;
  }
  const path = segmentsToPath(resolve(state, target));
  const err = vfs.write(path, text + "\n", append);
  if (err) term.writeln(`echo: ${target}: ${err}`);
}

function runNode(term: Terminal, vfs: VfsBridge, state: ShellState, args: string[]) {
  const [file] = args;
  if (!file) {
    term.writeln("node: missing file operand");
    return;
  }
  const { tree, files } = vfs.getSnapshot();
  const target = resolve(state, file);
  const node = findNode(tree, segmentsToPath(target));
  if (!node || node.type !== "file") {
    term.writeln(`node: cannot access '${file}': No such file`);
    return;
  }

  const { output, errored } = runJavaScript(files[node.path] ?? "");
  for (const [i, line] of output.entries()) {
    const isLast = i === output.length - 1;
    term.writeln(errored && isLast ? `\x1b[31mUncaught ${line}\x1b[0m` : line);
  }
}

async function runPython(term: Terminal, vfs: VfsBridge, state: ShellState, args: string[]) {
  const [file] = args;
  if (!file) {
    term.writeln("python: missing file operand");
    return;
  }
  const { tree, files } = vfs.getSnapshot();
  const target = resolve(state, file);
  const node = findNode(tree, segmentsToPath(target));
  if (!node || node.type !== "file") {
    term.writeln(`python: can't open file '${file}': No such file`);
    return;
  }

  const pyodide = await getPyodide();
  pyodide.setStdout({ batched: (text) => term.writeln(text) });
  pyodide.setStderr({ batched: (text) => term.writeln(`\x1b[31m${text}\x1b[0m`) });

  try {
    await pyodide.runPythonAsync(files[node.path] ?? "");
  } catch (err) {
    term.writeln(`\x1b[31m${err instanceof Error ? err.message : String(err)}\x1b[0m`);
  }
}
