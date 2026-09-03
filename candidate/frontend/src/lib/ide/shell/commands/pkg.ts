import { loadManifest, moduleUrlFor, resolvePackage, saveManifest, verifyEsmBuild, type InstalledPackage } from "../../packages";
import { getPyodide } from "../../pyodide-runtime";
import { applyProjectName, fetchViteTemplate, latestVersion } from "../../scaffold";
import { segmentsToPath } from "../../vfs-path";
import { nodeAt, readFile } from "../fs-util";
import { fail, ok, type CommandContext, type CommandResult } from "../types";
import { startPreview } from "./dev";
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

export const NODE_MODULES = "node_modules";

/**
 * `npm create vite@latest <name> -- --template react` — real scaffolding.
 *
 * The published create-vite package's template directory is fetched and
 * written into the workspace, so the files are genuinely Vite's. What can't
 * follow is the CLI's interactive prompting and its `npm install` step;
 * `dev` then builds a live preview instead of running Vite's dev server.
 */
async function npmCreate(ctx: CommandContext, args: string[]): Promise<CommandResult> {
  const positional = args.filter((a) => a !== "--" && !a.startsWith("--"));
  const starter = positional[0] ?? "";
  const generator = starter.split("@")[0] || "vite";

  if (generator !== "vite") {
    return fail(
      `npm create ${generator}: only the vite templates are available here.\n` +
        `They're fetched from the real create-vite package; other generators need their Node CLI.`,
      127
    );
  }

  const templateFlag = args.indexOf("--template");
  const template = templateFlag !== -1 ? args[templateFlag + 1] : "react";
  const projectName = positional[1] ?? "vite-project";

  if (nodeAt(ctx.vfs, projectName.split("/"))) {
    return fail(`npm create: "${projectName}" already exists here`);
  }

  if (ctx.isTerminalSink) {
    ctx.io.write(`resolving create-vite from the npm registry...\r\n`);
  }

  let scaffold;
  try {
    const version = await latestVersion("create-vite");
    if (ctx.isTerminalSink) ctx.io.write(`scaffolding ${template} template from create-vite@${version}\r\n`);
    scaffold = await fetchViteTemplate(template, version);
  } catch (err) {
    return fail(`npm create: ${err instanceof Error ? err.message : String(err)}`);
  }

  const files = applyProjectName(scaffold.files, projectName);
  let stderr = "";
  for (const file of files) {
    const full = `${projectName}/${file.path}`;
    // Create each parent directory the file needs.
    const segments = full.split("/");
    for (let i = 1; i < segments.length; i++) {
      const dir = segments.slice(0, i).join("/");
      if (!nodeAt(ctx.vfs, segments.slice(0, i))) {
        const error = ctx.vfs.createFolder(dir);
        if (error) stderr += `npm create: ${dir}: ${error}\n`;
      }
    }
    const error = ctx.vfs.write(full, file.content);
    if (error) stderr += `npm create: ${full}: ${error}\n`;
  }

  const lines = [
    ``,
    `Scaffolded ${files.length} files into ${projectName}/ from create-vite@${scaffold.version}`,
  ];
  if (scaffold.skipped.length > 0) {
    // Binary assets can't live in a text filesystem — say so rather than
    // leaving a project with mysteriously missing images.
    lines.push(`Skipped ${scaffold.skipped.length} binary asset(s): ${scaffold.skipped.join(", ")}`);
  }
  lines.push(``, `  cd ${projectName}`, `  npm install`, `  dev            # build and preview it here`, ``);

  return { stdout: `${lines.join("\n")}`, stderr, code: stderr ? 1 : 0 };
}

/**
 * Dev-server scripts we can genuinely stand in for by building a preview.
 * Anchored at both ends (flags aside) on purpose: matching only the start
 * would let `vite build` through, and a build is not a dev server.
 */
const PREVIEW_SCRIPTS = /^(vite|vite\s+(dev|serve|preview)|next\s+dev|parcel|serve)(\s+-.*)?$/;

/**
 * `npm run <script>` — reads the project's real package.json.
 *
 * A dev-server script (`vite`, `vite dev`, ...) can't launch the actual
 * server, but building a live preview is the same outcome, so those run.
 * Anything else (build, lint, test) genuinely needs a Node process, and the
 * error names the actual script command rather than hand-waving.
 */
async function npmRun(ctx: CommandContext, args: string[]): Promise<CommandResult> {
  const scriptName = args.find((a) => !a.startsWith("-")) ?? "dev";
  const root = segmentsToPath(ctx.session.cwd);
  const packagePath = root ? `${root}/package.json` : "package.json";

  const raw = readFile(ctx.vfs, packagePath.split("/"));
  if (raw === null) {
    return fail(`npm run: no package.json in ${root || "the workspace root"}`, 254);
  }

  let scripts: Record<string, string> = {};
  try {
    scripts = ((JSON.parse(raw) as { scripts?: Record<string, string> }).scripts ?? {}) as Record<string, string>;
  } catch {
    return fail(`npm run: ${packagePath} is not valid JSON`);
  }

  const command = scripts[scriptName];
  if (!command) {
    const available = Object.keys(scripts);
    return fail(
      `npm run: missing script "${scriptName}"` +
        (available.length > 0 ? `\nAvailable: ${available.join(", ")}` : ""),
      254
    );
  }

  if (PREVIEW_SCRIPTS.test(command.trim())) {
    if (ctx.isTerminalSink) ctx.io.write(`> ${scriptName}\r\n> ${command}\r\n\r\n`);
    return startPreview(ctx, root);
  }

  return fail(
    `npm run ${scriptName}: "${command}" needs a Node process, which the browser doesn't have.\n` +
      `Dev-server scripts work (they open the live preview); build/lint/test don't.`,
    127
  );
}

/**
 * `npx` exists to execute a package's command-line binary. Those are Node
 * programs expecting a process, a real filesystem and argv — none of which
 * exist in a tab — so this reports that plainly rather than looking like a
 * missing command.
 */
export function npx(ctx: CommandContext): CommandResult {
  const target = ctx.argv[1];
  return fail(
    `npx: not supported${target ? ` (can't run "${target}")` : ""} — it executes a package's Node CLI, ` +
      `and there's no Node process in the browser.\n` +
      `Library code does work: npm install <pkg>, then import it from a .js/.ts file and run it with node.`,
    127
  );
}

/**
 * Writes the installed package into `node_modules/<name>/package.json` so an
 * install is something you can actually see in the Explorer, not just an
 * invisible entry in browser storage.
 *
 * The contents are the real registry metadata, including npm's own `_from`
 * and `_resolved` bookkeeping fields — `_resolved` records that the code is
 * served from the CDN rather than unpacked from a tarball, which is the one
 * place this differs from a real install.
 */
function writePackageIntoTree(ctx: CommandContext, pkg: InstalledPackage): string | null {
  // Relative to the directory you ran install in, like real npm — running
  // it inside my-app must put node_modules there, not at the workspace root.
  const segments = [...ctx.session.cwd, NODE_MODULES, ...pkg.name.split("/")];
  for (let i = 1; i <= segments.length; i++) {
    const dir = segments.slice(0, i).join("/");
    if (!nodeAt(ctx.vfs, segments.slice(0, i))) {
      const error = ctx.vfs.createFolder(dir);
      if (error) return error;
    }
  }

  const manifest = {
    name: pkg.name,
    version: pkg.version,
    ...(pkg.description ? { description: pkg.description } : {}),
    _from: `${pkg.name}@${pkg.version}`,
    _resolved: moduleUrlFor(pkg.name, { [pkg.name]: pkg }),
  };
  return ctx.vfs.write(`${segments.join("/")}/package.json`, `${JSON.stringify(manifest, null, 2)}\n`);
}

/** Removes `node_modules/<name>`, and the scope directory if it's now empty. */
function removePackageFromTree(ctx: CommandContext, name: string): void {
  const segments = [...ctx.session.cwd, NODE_MODULES, ...name.split("/")];
  if (nodeAt(ctx.vfs, segments)) ctx.vfs.remove(segments.join("/"), true);

  if (name.startsWith("@")) {
    const scope = segments.slice(0, ctx.session.cwd.length + 2);
    const node = nodeAt(ctx.vfs, scope);
    if (node && node !== "root" && node.type === "folder" && node.children.length === 0) {
      ctx.vfs.remove(scope.join("/"), true);
    }
  }
}

/**
 * `npm` — real registry metadata plus real ESM code from esm.sh, recorded in
 * a manifest that persists in this browser and mirrored into `node_modules/`
 * so installs are visible in the Explorer. Installed packages are importable
 * by name from `node`/`ts-node` scripts.
 *
 * This is not real npm: the `node_modules` entries are metadata only (the
 * code is fetched from the CDN at run time), there are no lifecycle scripts
 * or native addons, and packages that never ship ESM won't work. Those need
 * a real machine.
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
        removePackageFromTree(ctx, name);
        removed++;
      }
    }
    saveManifest(manifest);
    return ok(`removed ${removed} package${removed === 1 ? "" : "s"}\n`);
  }

  if (subcommand === "create" || subcommand === "init") {
    return npmCreate(ctx, packages);
  }

  // The rest run a package's Node CLI, and there's no Node process here to
  // run one — say exactly that rather than a bare "unknown command" that
  // reads like a typo.
  if (["exec", "start", "test", "publish"].includes(subcommand)) {
    return fail(
      `npm ${subcommand}: not supported — it runs a package's Node CLI, and there's no Node process in the browser.`,
      127
    );
  }

  if (subcommand === "run" || subcommand === "run-script") {
    return npmRun(ctx, packages);
  }

  if (subcommand !== "install" && subcommand !== "i" && subcommand !== "add") {
    return fail(`npm: unknown command "${subcommand}"`, 127);
  }
  // Bare `npm install` installs what package.json asks for, like the real thing.
  let specs = packages;
  if (specs.length === 0) {
    const root = segmentsToPath(ctx.session.cwd);
    const manifestPath = root ? `${root}/package.json` : "package.json";
    const raw = readFile(ctx.vfs, manifestPath.split("/"));
    if (raw === null) {
      return fail(
        `npm install: no package.json in ${root || "the workspace root"}\n` +
          `Name a package to install one directly: npm install <pkg>`,
        254
      );
    }

    let parsed: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      return fail(`npm install: ${manifestPath} is not valid JSON`);
    }

    specs = Object.keys(parsed.dependencies ?? {});
    const devDeps = Object.keys(parsed.devDependencies ?? {});

    if (specs.length === 0 && devDeps.length === 0) {
      return ok("up to date — package.json lists no dependencies\n");
    }
    if (ctx.isTerminalSink && devDeps.length > 0) {
      // These are build tools (vite, plugins, linters). They'd resolve from
      // the registry but do nothing without a Node process to run them, so
      // say that rather than installing something inert.
      ctx.io.write(
        `skipping ${devDeps.length} devDependencies (${devDeps.join(", ")}) — build tooling needs a Node process\r\n`
      );
    }
    if (specs.length === 0) {
      return ok("nothing to install — package.json only lists devDependencies\n");
    }
  }

  let stdout = "";
  let stderr = "";
  for (const spec of specs) {
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
    const treeError = writePackageIntoTree(ctx, resolved);
    if (treeError) stderr += `npm WARN could not write node_modules/${resolved.name}: ${treeError}\n`;
    stdout += `+ ${resolved.name}@${resolved.version}\n`;
  }

  saveManifest(manifest);
  if (stdout) {
    stdout +=
      `\nadded to ${
        ctx.session.cwd.length > 0 ? `${segmentsToPath(ctx.session.cwd)}/${NODE_MODULES}` : NODE_MODULES
      }/ — import by name from a .js/.ts file and run it with node, e.g.\n` +
      `  echo 'import x from "${Object.keys(manifest)[0] ?? "pkg"}"; console.log(x);' > app.js && node app.js\n`;
  }
  return { stdout, stderr, code: stderr ? 1 : 0 };
}
