/**
 * Real project scaffolding.
 *
 * `npm create vite` works by copying a template directory out of the
 * published `create-vite` package. We can't run its Node CLI, but we can do
 * the part that matters: fetch that same published template and write it
 * into the workspace. The files are genuinely Vite's, not a lookalike.
 *
 * jsDelivr serves both a file listing and the file contents for any npm
 * package, with CORS — which is what makes this possible from a tab.
 */

const DATA_API = "https://data.jsdelivr.com/v1/packages/npm";
const CDN = "https://cdn.jsdelivr.net/npm";

/** The workspace filesystem stores text, so binary template assets can't come along. */
const BINARY_EXTENSIONS = /\.(png|jpe?g|gif|ico|webp|avif|woff2?|ttf|eot|mp4|webm|zip)$/i;

export interface TemplateFile {
  /** Path relative to the project root, e.g. "src/App.jsx". */
  path: string;
  content: string;
}

export interface ScaffoldResult {
  files: TemplateFile[];
  /** Binary files that couldn't be stored, reported rather than silently dropped. */
  skipped: string[];
  version: string;
}

interface JsDelivrFile {
  name: string;
}

/**
 * create-vite prefixes dotfiles with "_" inside the published package (npm
 * would otherwise strip them), and renames them on copy. Doing the same
 * keeps the scaffolded project identical to a real one.
 */
function templateNameToProjectPath(name: string): string {
  const base = name.replace(/^_/, ".");
  return base;
}

export async function listTemplates(version: string): Promise<string[]> {
  const response = await fetch(`${DATA_API}/create-vite@${version}?structure=flat`);
  if (!response.ok) throw new Error(`could not list create-vite templates (HTTP ${response.status})`);
  const data = (await response.json()) as { files: JsDelivrFile[] };

  const names = new Set<string>();
  for (const file of data.files) {
    const match = /^\/template-([^/]+)\//.exec(file.name);
    if (match) names.add(match[1]);
  }
  return [...names].sort();
}

export async function latestVersion(pkg: string): Promise<string> {
  const response = await fetch(`${DATA_API}/${pkg}`);
  if (!response.ok) throw new Error(`could not reach the registry for ${pkg} (HTTP ${response.status})`);
  const data = (await response.json()) as { tags?: Record<string, string> };
  const version = data.tags?.latest;
  if (!version) throw new Error(`could not resolve a latest version for ${pkg}`);
  return version;
}

/** Fetches one Vite template, ready to write into the workspace. */
export async function fetchViteTemplate(template: string, version: string): Promise<ScaffoldResult> {
  const listing = await fetch(`${DATA_API}/create-vite@${version}?structure=flat`);
  if (!listing.ok) throw new Error(`could not list create-vite files (HTTP ${listing.status})`);
  const data = (await listing.json()) as { files: JsDelivrFile[] };

  const prefix = `/template-${template}/`;
  const entries = data.files.filter((file) => file.name.startsWith(prefix));
  if (entries.length === 0) {
    const available = await listTemplates(version);
    throw new Error(`unknown template "${template}". Available: ${available.join(", ")}`);
  }

  const files: TemplateFile[] = [];
  const skipped: string[] = [];

  await Promise.all(
    entries.map(async (entry) => {
      const relative = entry.name.slice(prefix.length);
      if (BINARY_EXTENSIONS.test(relative)) {
        skipped.push(relative);
        return;
      }
      const response = await fetch(`${CDN}/create-vite@${version}${entry.name}`);
      if (!response.ok) {
        skipped.push(relative);
        return;
      }
      files.push({
        path: relative.split("/").map(templateNameToProjectPath).join("/"),
        content: await response.text(),
      });
    })
  );

  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, skipped, version };
}

/** Renames the scaffolded package to the project directory, like the real CLI does. */
export function applyProjectName(files: TemplateFile[], projectName: string): TemplateFile[] {
  return files.map((file) => {
    if (file.path !== "package.json") return file;
    try {
      const parsed = JSON.parse(file.content) as Record<string, unknown>;
      parsed.name = projectName;
      return { ...file, content: `${JSON.stringify(parsed, null, 2)}\n` };
    } catch {
      return file;
    }
  });
}
