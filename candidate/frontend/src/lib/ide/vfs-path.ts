/**
 * Path handling for the terminal's virtual filesystem. Paths are modeled
 * as segment arrays (`[]` = workspace root, `["src", "utils"]` = src/utils)
 * so `cd`/`..`/`.`/absolute paths all resolve the same way a real shell's
 * would, independent of our tree.ts path-string format (which just joins
 * segments with "/", no leading slash).
 */

export function normalizeSegments(raw: string[]): string[] {
  const out: string[] = [];
  for (const seg of raw) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      out.pop();
      continue;
    }
    out.push(seg);
  }
  return out;
}

/** Resolves user input (relative or absolute) against a cwd into a normalized segment array. */
export function resolveInputPath(cwd: string[], input: string): string[] {
  if (input.startsWith("/")) {
    return normalizeSegments(input.split("/"));
  }
  return normalizeSegments([...cwd, ...input.split("/")]);
}

/** Segment array -> our tree.ts path string (no leading slash, "" for root). */
export function segmentsToPath(segments: string[]): string {
  return segments.join("/");
}

/** Segment array -> a shell-style absolute display path, e.g. ["src"] -> "/src". */
export function segmentsToDisplay(segments: string[]): string {
  return "/" + segments.join("/");
}

export function basename(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}

export function dirname(path: string): string | null {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? null : path.slice(0, idx);
}
