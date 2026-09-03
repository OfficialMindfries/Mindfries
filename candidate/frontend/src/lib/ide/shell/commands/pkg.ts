import { loadManifest, resolvePackage, saveManifest, verifyEsmBuild } from "../../packages";
import { getPyodide } from "../../pyodide-runtime";
import { fail, ok, type CommandContext, type CommandResult } from "../types";
import { parseFlags } from "./fs";

/**
 * `pip` — real installs through micropip, the package manager Pyodide ships.
 * micropip resolves against Pyodide's own WASM-built package index first
 * (numpy, pandas, scikit-learn, matplotlib and ~200 more) and falls back to
 * real pure-Python wheels from PyPI.
 *
 * A package needing a compiled native/GPU backend (tensorflow, torch) has no
 * WASM build and genuinely cannot install here — micropip's own error is
 * surfaced verbatim rather than dressed up as success.
 */
export async function pip(ctx: CommandContext): Promise<CommandResult> {
  const { operands } = parseFlags(ctx.argv);
  const [subcommand, ...packages] = operands;

  if (!subcommand) return fail("usage: pip <install|uninstall|list|show> [package ...]");

  const pyodide = await getPyodide();
  const output: string[] = [];
  pyodide.setStdout({ batched: (text) => output.push(text) });
  pyodide.setStderr({ batched: (text) => output.push(text) });

  const ensureMicropip = async () => {
    if (ctx.isTerminalSink) ctx.io.write("Preparing Python package manager...\r\n");
    await pyodide.loadPackage("micropip");
  };

  if (subcommand === "install") {
    if (packages.length === 0) return fail("pip install: missing package name");
    await ensureMicropip();

    let stderr = "";
    for (const name of packages) {
      if (ctx.isTerminalSink) ctx.io.write(`Collecting ${name}\r\n`);
      try {
        const bareName = name.split(/[=<>[]/)[0];
        await pyodide.runPythonAsync(
          `import micropip\n` +
            `await micropip.install(${JSON.stringify(name)})\n` +
            `_p = micropip.list()\n` +
            `print(f"Successfully installed ${bareName}-{_p[${JSON.stringify(bareName)}].version}"` +
            ` if ${JSON.stringify(bareName)} in _p else "Successfully installed ${bareName}")`
        );
      } catch (err) {
        // micropip's own message is the honest one: it names exactly why a
        // package can't work here (no pure-Python wheel, no WASM build...).
        stderr += `ERROR: ${pythonErrorMessage(err)}\n`;
      }
    }
    return { stdout: joinOutput(output), stderr, code: stderr ? 1 : 0 };
  }

  if (subcommand === "list") {
    await ensureMicropip();
    await pyodide.runPythonAsync(
      `import micropip\n_p = micropip.list()\nprint("\\n".join(sorted(f"{k}=={_p[k].version}" for k in _p)) or "(no packages installed yet)")`
    );
    return ok(joinOutput(output));
  }

  if (subcommand === "show") {
    if (packages.length === 0) return fail("pip show: missing package name");
    await ensureMicropip();
    for (const name of packages) {
      await pyodide.runPythonAsync(
        `import micropip\n_p = micropip.list()\nprint(f"Name: ${name}\\nVersion: {_p[${JSON.stringify(
          name
        )}].version}" if ${JSON.stringify(name)} in _p else "WARNING: Package(s) not found: ${name}")`
      );
    }
    return ok(joinOutput(output));
  }

  if (subcommand === "uninstall") {
    return fail(
      "pip uninstall: micropip can't remove a package once it's loaded into the running interpreter.\n" +
        "Refresh the page to start from a clean environment."
    );
  }

  return fail(`pip: unknown command "${subcommand}"`);
}

function joinOutput(lines: string[]): string {
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

/**
 * The useful part of a Pyodide error: everything from the exception line on,
 * dropping the Python traceback above it. Taking just the last line would
 * surface micropip's trailing "you can use keep_going=True" hint instead of
 * the actual reason ("Can't find a pure Python 3 wheel for 'tensorflow'").
 */
function pythonErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const lines = message.split("\n").filter(Boolean);
  const start = lines.findIndex((line) => /^[A-Za-z_][\w.]*(Error|Exception):/.test(line));
  return (start === -1 ? lines.slice(-1) : lines.slice(start)).join("\n");
}

/**
 * `npm` — real registry metadata plus real ESM code from esm.sh, recorded in
 * a manifest that persists in this browser. Installed packages become
 * importable by name from `node`/`ts-node` scripts.
 *
 * This is not real npm: no node_modules, no lifecycle scripts, no native
 * addons, and packages that never ship ESM won't work. Those need the
 * backend executor.
 */
export async function npm(ctx: CommandContext): Promise<CommandResult> {
  const { operands } = parseFlags(ctx.argv);
  const [subcommand, ...packages] = operands;
  const manifest = loadManifest();

  if (!subcommand || subcommand === "help") {
    return ok("usage: npm <install|uninstall|list> [package ...]\n");
  }

  if (subcommand === "list" || subcommand === "ls") {
    const entries = Object.values(manifest).sort((a, b) => a.name.localeCompare(b.name));
    if (entries.length === 0) return ok("(no packages installed yet)\n");
    return ok(`${entries.map((p) => `${p.name}@${p.version}`).join("\n")}\n`);
  }

  if (subcommand === "uninstall" || subcommand === "remove" || subcommand === "rm") {
    if (packages.length === 0) return fail("npm uninstall: missing package name");
    let removed = 0;
    for (const name of packages) {
      if (manifest[name]) {
        delete manifest[name];
        removed++;
      }
    }
    saveManifest(manifest);
    return ok(`removed ${removed} package${removed === 1 ? "" : "s"}\n`);
  }

  if (subcommand !== "install" && subcommand !== "i" && subcommand !== "add") {
    return fail(`npm: unknown command "${subcommand}"`);
  }
  if (packages.length === 0) return fail("npm install: missing package name");

  let stdout = "";
  let stderr = "";
  for (const spec of packages) {
    if (ctx.isTerminalSink) ctx.io.write(`resolving ${spec} from the npm registry...\r\n`);

    const { package: resolved, error } = await resolvePackage(spec);
    if (error || !resolved) {
      stderr += `npm ERR! ${error}\n`;
      continue;
    }

    const esmError = await verifyEsmBuild(resolved);
    if (esmError) {
      stderr += `npm ERR! ${esmError}\n`;
      continue;
    }

    manifest[resolved.name] = resolved;
    stdout += `+ ${resolved.name}@${resolved.version}\n`;
  }

  saveManifest(manifest);
  if (stdout) stdout += `\nimport it by name from a .js/.ts file, then run it with node\n`;
  return { stdout, stderr, code: stderr ? 1 : 0 };
}
