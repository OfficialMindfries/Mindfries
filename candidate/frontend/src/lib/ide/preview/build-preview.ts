import type { VfsBridge } from "../vfs-bridge";
import { findNode } from "../tree";
import { moduleUrlFor } from "../packages";

/**
 * Builds a runnable page out of the workspace's own source files.
 *
 * Vite's dev server can't run here — it's a Node process. But a bundler
 * isn't what actually makes a React app run; the browser is already the
 * runtime. So this does the three jobs that matter: transpile JSX with the
 * real TypeScript compiler, resolve every import (relative ones to the
 * user's other files, bare ones to the installed package), and hand the
 * result to the browser as real ES modules.
 *
 * It is not Vite: no HMR, no plugin pipeline, no production build. It is the
 * user's real code really running.
 */

const SCRIPT_EXTENSIONS = [".jsx", ".tsx", ".ts", ".js", ".mjs"];

export interface PreviewBuild {
  html: string;
  entry: string;
  /** Things referenced but not resolvable, surfaced instead of failing silently. */
  warnings: string[];
  /**
   * Every blob URL this build created. Rebuilds happen on every edit, so the
   * caller revokes the previous build's URLs — otherwise a long editing
   * session leaks a module's worth of memory per keystroke-batch.
   */
  objectUrls: string[];
}

/** Frees a previous build's modules. Safe to call with URLs already revoked. */
export function releaseBuild(build: Pick<PreviewBuild, "objectUrls"> | null): void {
  for (const url of build?.objectUrls ?? []) URL.revokeObjectURL(url);
}

export class PreviewError extends Error {}

/** Resolves "./App" / "../lib/x" against the importing file, trying extensions and /index. */
function resolveRelative(
  vfs: VfsBridge,
  fromPath: string,
  specifier: string
): string | null {
  const fromDir = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
  const segments = [...fromDir.split("/").filter(Boolean), ...specifier.split("/")];

  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === "." || segment === "") continue;
    if (segment === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  const base = resolved.join("/");
  const { tree } = vfs.getSnapshot();

  const candidates = [base, ...SCRIPT_EXTENSIONS.map((ext) => `${base}${ext}`), ...SCRIPT_EXTENSIONS.map((ext) => `${base}/index${ext}`)];
  for (const candidate of candidates) {
    const node = findNode(tree, candidate);
    if (node?.type === "file") return candidate;
  }
  return null;
}

function readFile(vfs: VfsBridge, path: string): string | null {
  const { tree, files } = vfs.getSnapshot();
  const node = findNode(tree, path);
  if (node?.type !== "file") return null;
  return files[path] ?? "";
}

/** CSS becomes a module that injects a <style> tag, which is what a bundler does too. */
function cssModule(source: string): string {
  return `const style = document.createElement("style");
style.textContent = ${JSON.stringify(source)};
document.head.appendChild(style);
export default {};`;
}

/** An imported SVG becomes a data URI, so `<img src={logo} />` works. */
function svgModule(source: string): string {
  const encoded = `data:image/svg+xml;utf8,${encodeURIComponent(source)}`;
  return `export default ${JSON.stringify(encoded)};`;
}

export async function buildPreview(
  vfs: VfsBridge,
  projectRoot: string
): Promise<PreviewBuild> {
  const prefix = projectRoot ? `${projectRoot}/` : "";
  const indexPath = `${prefix}index.html`;
  const indexHtml = readFile(vfs, indexPath);
  if (indexHtml === null) {
    throw new PreviewError(`no index.html in ${projectRoot || "the workspace root"}`);
  }

  const scriptMatch = /<script[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/i.exec(indexHtml);
  if (!scriptMatch) {
    throw new PreviewError(`${indexPath} has no <script src="..."> to run`);
  }

  // index.html references its entry as a root-absolute path ("/src/main.jsx"),
  // where root means the project directory.
  const entrySpecifier = scriptMatch[1].replace(/^\//, "./");
  const entryPath = resolveRelative(vfs, indexPath, entrySpecifier);
  if (!entryPath) throw new PreviewError(`entry "${scriptMatch[1]}" not found`);

  const ts = await import("typescript");
  const warnings: string[] = [];
  const objectUrls: string[] = [];
  const built = new Map<string, string>();
  const building = new Set<string>();

  const buildModule = async (path: string): Promise<string> => {
    const cached = built.get(path);
    if (cached) return cached;
    if (building.has(path)) {
      // A cycle can't be given a URL before it has one; bail rather than hang.
      throw new PreviewError(`circular import involving ${path}`);
    }
    building.add(path);

    const source = readFile(vfs, path) ?? "";
    let code: string;

    if (path.endsWith(".css")) {
      code = cssModule(source);
    } else if (path.endsWith(".svg")) {
      code = svgModule(source);
    } else {
      code = ts.transpileModule(source, {
        compilerOptions: {
          // react-jsx emits imports from "react/jsx-runtime", which resolve
          // through the same bare-specifier path as any other package.
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2020,
        },
        fileName: path,
      }).outputText;
    }

    const rewritten = await rewriteImports(code, path);
    const url = URL.createObjectURL(new Blob([rewritten], { type: "text/javascript" }));
    objectUrls.push(url);
    building.delete(path);
    built.set(path, url);
    return url;
  };

  const rewriteImports = async (code: string, fromPath: string): Promise<string> => {
    const pattern = /(\bfrom\s*|\bimport\s*\(?\s*)(["'])([^"']+)\2/g;
    const edits: { match: string; replacement: string }[] = [];

    for (const match of code.matchAll(pattern)) {
      const [full, prefixText, quote, specifier] = match;
      if (/^[a-z]+:/i.test(specifier)) continue; // already a URL

      let target: string;
      if (specifier.startsWith(".") || specifier.startsWith("/")) {
        const relativeSpecifier = specifier.startsWith("/")
          ? `.${specifier}`
          : specifier;
        const resolvedPath = resolveRelative(
          vfs,
          specifier.startsWith("/") ? indexPath : fromPath,
          relativeSpecifier
        );
        if (!resolvedPath) {
          // A missing asset shouldn't take the whole page down.
          warnings.push(`${fromPath}: could not resolve "${specifier}"`);
          target = URL.createObjectURL(
            new Blob([`export default "";`], { type: "text/javascript" })
          );
          objectUrls.push(target);
        } else {
          target = await buildModule(resolvedPath);
        }
      } else {
        target = moduleUrlFor(specifier);
      }
      edits.push({ match: full, replacement: `${prefixText}${quote}${target}${quote}` });
    }

    let output = code;
    for (const edit of edits) output = output.replace(edit.match, edit.replacement);
    return output;
  };

  const entryUrl = await buildModule(entryPath);

  // Point the page at the built entry, and drop the favicon link (it would
  // 404 against the blob document and log a distracting error).
  const html = indexHtml
    .replace(scriptMatch[0], `<script type="module" src="${entryUrl}"></script>`)
    .replace(/<link[^>]*rel=["']icon["'][^>]*>/i, "");

  return { html, entry: entryPath, warnings, objectUrls };
}
