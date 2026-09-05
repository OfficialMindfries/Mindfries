/**
 * The installed-JS-package manifest, persisted in this browser like the
 * workspace files are.
 *
 * What this genuinely is: real package metadata resolved from the real npm
 * registry, and real package code served as ESM by esm.sh, which the JS/TS
 * runner then resolves bare `import`s against.
 *
 * What it deliberately is NOT: a real `node_modules`. There's no filesystem
 * resolution, no lifecycle scripts, no native addons, and no CommonJS-only
 * packages that never publish an ESM build. Those need a real machine — see
 * the terminal roadmap in src/app/ide/spec.md.
 */

const STORAGE_KEY = "mindfries-ide-packages";
const REGISTRY_URL = "https://registry.npmjs.org";
const ESM_CDN = "https://esm.sh";

export interface InstalledPackage {
  name: string;
  version: string;
  description?: string;
}

export type PackageManifest = Record<string, InstalledPackage>;

export function loadManifest(): PackageManifest {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PackageManifest) : {};
  } catch {
    // Private browsing / quota / disabled storage: packages just won't persist.
    return {};
  }
}

export function saveManifest(manifest: PackageManifest): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(manifest));
  } catch {
    // Same as above — non-fatal, the install still works for this session.
  }
}

/** The esm.sh URL a bare specifier resolves to, pinned to the installed version. */
export function moduleUrlFor(specifier: string, manifest: PackageManifest = loadManifest()): string {
  // "react-dom/client" -> package "react-dom", subpath "/client"
  const scoped = specifier.startsWith("@");
  const parts = specifier.split("/");
  const name = scoped ? parts.slice(0, 2).join("/") : parts[0];
  const subpath = specifier.slice(name.length);

  const installed = manifest[name];
  return installed
    ? `${ESM_CDN}/${name}@${installed.version}${subpath}`
    : `${ESM_CDN}/${specifier}`;
}

export interface ResolveResult {
  package?: InstalledPackage;
  error?: string;
}

/** Real npm registry lookup — a wrong name gives a real 404, not a fake success. */
export async function resolvePackage(spec: string): Promise<ResolveResult> {
  const at = spec.lastIndexOf("@");
  const scoped = spec.startsWith("@");
  const hasVersion = at > 0 && !(scoped && at === 0);
  const name = hasVersion ? spec.slice(0, at) : spec;
  const version = hasVersion ? spec.slice(at + 1) : "latest";

  try {
    const response = await fetch(`${REGISTRY_URL}/${name}/${version}`);
    if (response.status === 404) return { error: `404 Not Found - GET ${REGISTRY_URL}/${name} - Not found` };
    if (!response.ok) return { error: `registry responded ${response.status} for ${name}` };

    const data = (await response.json()) as { name: string; version: string; description?: string };
    return { package: { name: data.name, version: data.version, description: data.description } };
  } catch {
    return { error: `could not reach the npm registry (offline, or the request was blocked)` };
  }
}

/** Confirms esm.sh can actually serve the package as ESM before calling it installed. */
export async function verifyEsmBuild(pkg: InstalledPackage): Promise<string | null> {
  try {
    const response = await fetch(`${ESM_CDN}/${pkg.name}@${pkg.version}`, { method: "GET" });
    if (!response.ok) {
      return `${pkg.name}@${pkg.version} has no usable ESM build on esm.sh (HTTP ${response.status})`;
    }
    return null;
  } catch {
    return `could not reach ${ESM_CDN} to fetch ${pkg.name}`;
  }
}
