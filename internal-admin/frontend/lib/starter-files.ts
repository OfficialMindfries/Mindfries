/**
 * A lightweight multi-file text format for authoring an assessment's
 * starter files in one textarea, rather than building a full file-tree
 * editor just to fill in `game_templates.starter_files` (see
 * 0010_game_template_content.sql). A candidate's real IDE workspace is
 * seeded from exactly this map, verbatim — see
 * candidate/frontend/src/lib/ide/seed-workspace.ts.
 *
 * Format: a delimiter line `--- path/to/file.ext ---` on its own line,
 * followed by that file's content, up to the next delimiter or the end of
 * the text. Anything before the first delimiter is ignored (room for an
 * admin's own notes-to-self at the top without them ending up as a file).
 */
export function parseStarterFiles(text: string): Record<string, string> {
  const files: Record<string, string> = {};
  let currentPath: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (!currentPath) return;
    // Strip trailing blank lines — they're the gap before the next
    // delimiter, not part of the file's real content.
    const content = currentLines.join("\n").replace(/\n+$/, "");
    const path = currentPath.replace(/^\/+/, "");
    if (path) files[path] = content;
  };

  for (const line of text.split("\n")) {
    const match = /^---\s+(.+?)\s+---$/.exec(line.trim());
    if (match) {
      flush();
      currentPath = match[1].trim();
      currentLines = [];
    } else if (currentPath) {
      currentLines.push(line);
    }
  }
  flush();

  return files;
}

/** The inverse of parseStarterFiles — round-trips a map back into the same textarea format, for pre-filling an edit view later. */
export function serializeStarterFiles(files: Record<string, string>): string {
  return Object.entries(files)
    .map(([path, content]) => `--- ${path} ---\n${content}`)
    .join("\n\n");
}
