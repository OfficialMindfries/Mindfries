import { mountPythonWorkspace, runJavaScriptSource, runPython, runPythonModule, runTypeScript } from "../../code-runner";
import { nodeAt, readFile, resolve } from "../fs-util";
import { fail, ok, type CommandContext, type CommandResult } from "../types";
import { parseFlags } from "./fs";

/**
 * `node`/`js`/`ts-node`/`tsx` — real JS execution, with TypeScript transpiled
 * by the real compiler first. With no file operand it runs stdin, so
 * `echo 'console.log(1+1)' | node` behaves the way you'd expect.
 */
export async function node(ctx: CommandContext): Promise<CommandResult> {
  const { operands } = parseFlags(ctx.argv);
  const file = operands[0];

  let source: string;
  let typescript = ctx.argv[0] === "ts-node" || ctx.argv[0] === "tsx";

  if (!file) {
    if (!ctx.stdin) return fail("node: missing file operand");
    source = ctx.stdin;
  } else {
    const segments = resolve(ctx.session, file);
    const target = nodeAt(ctx.vfs, segments);
    if (!target || target === "root" || target.type !== "file") {
      return fail(`node: cannot access '${file}': No such file or directory`);
    }
    source = readFile(ctx.vfs, segments) ?? "";
    if (/\.tsx?$/.test(target.name)) typescript = true;
  }

  const result = typescript ? await runTypeScript(source) : await runJavaScriptSource(source);
  const text = result.output.length > 0 ? `${result.output.join("\n")}\n` : "";
  return result.errored ? { stderr: text, code: 1 } : ok(text);
}

/**
 * `python`/`python3` — real CPython via Pyodide. Output streams live to the
 * terminal for a long-running script, but only when nothing downstream is
 * waiting to parse it (a pipe or a redirect gets the buffered text instead).
 *
 * Every run starts by copying the workspace into Python's own filesystem
 * with the shell's directory as the working directory (python-workspace.ts),
 * so a script can import the project's other modules and open its files.
 * `python -m <module>` runs a module the way the real one does, which is
 * what makes `python -m unittest` work on the candidate's own tests.
 */
export async function python(ctx: CommandContext): Promise<CommandResult> {
  const { flags, operands } = parseFlags(ctx.argv);
  const file = operands[0];

  await mountPythonWorkspace(ctx.vfs.getSnapshot().files, ctx.session.cwd);

  // Everything after `-m <module>` belongs to the module, flags included, so
  // it's taken from argv directly rather than from the parsed operands.
  const moduleIndex = ctx.argv.indexOf("-m");
  if (moduleIndex !== -1) {
    const name = ctx.argv[moduleIndex + 1];
    if (!name) return fail("python: argument -m: expected one argument");
    const result = await runPythonModule(name, ctx.argv.slice(moduleIndex + 2));
    const text = result.output.length > 0 ? `${result.output.join("\n")}\n` : "";
    return result.errored ? { stderr: text, code: 1 } : ok(text);
  }

  // `python -c "print(1)"` runs an inline program, same as the real thing.
  const inlineIndex = ctx.argv.indexOf("-c");
  let source: string;
  if (flags.has("c") && inlineIndex !== -1) {
    source = ctx.argv[inlineIndex + 1] ?? "";
  } else if (!file) {
    if (!ctx.stdin) {
      return fail("python: interactive REPL isn't supported yet — run a .py file, or use python -c '<code>'");
    }
    source = ctx.stdin;
  } else {
    const segments = resolve(ctx.session, file);
    const target = nodeAt(ctx.vfs, segments);
    if (!target || target === "root" || target.type !== "file") {
      return fail(`python: can't open file '${file}': [Errno 2] No such file or directory`);
    }
    source = readFile(ctx.vfs, segments) ?? "";
  }

  const result = await runPython(source);
  const text = result.output.length > 0 ? `${result.output.join("\n")}\n` : "";
  return result.errored ? { stderr: text, code: 1 } : ok(text);
}
