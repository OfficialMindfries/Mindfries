/**
 * Keeping the editor and the sandbox's disk in step.
 *
 * In a sandbox session the files are really on a machine: the terminal
 * changes them (a formatter, a code generator, `git checkout`), and so does
 * the editor. The editor still works on an in-memory copy — that is what
 * makes typing instant and keeps the Changes panel, diffs and the assistant
 * working unchanged — so the two have to be reconciled, in both directions:
 *
 *   push   what the editor has saved that the sandbox doesn't have yet
 *   pull   what changed on the sandbox's disk that the editor hasn't seen
 *
 * This file is the deciding, with no React, no DOM and no network, so Node
 * can check it (sync.check.ts). use-sandbox-sync.ts does the doing.
 *
 * The one rule for a conflict: a file the candidate has changed in the
 * editor — typed in and not yet saved, or saved and not yet sent — is never
 * overwritten by a pull. Their version is what the sandbox ends up with.
 */

export type Files = Record<string, string>;

/** What the sandbox says about one file, enough to notice it changed. */
export interface Stamp {
  size: number;
  modTime: number;
}
export type Manifest = Record<string, Stamp>;

/**
 * What to send to the sandbox: files the editor has saved whose content
 * differs from what the sandbox is known to hold, and files the sandbox
 * holds that the editor has deleted.
 *
 * `known` is the content last seen on, or written to, the sandbox.
 */
export function planPush(known: Files, saved: Files): { writes: string[]; deletes: string[] } {
  const writes = Object.keys(saved).filter((path) => known[path] !== saved[path]);
  const deletes = Object.keys(known).filter((path) => !(path in saved));
  return { writes: writes.sort(), deletes: deletes.sort() };
}

/**
 * What to fetch from the sandbox, given its file list now and as last seen:
 * files that are new or whose size or time changed, and files that are gone.
 */
export function planPull(previous: Manifest, current: Manifest): { changed: string[]; removed: string[] } {
  const changed = Object.keys(current).filter((path) => {
    const before = previous[path];
    return !before || before.size !== current[path].size || before.modTime !== current[path].modTime;
  });
  const removed = Object.keys(previous).filter((path) => !(path in current));
  return { changed: changed.sort(), removed: removed.sort() };
}

export interface PullResult {
  files: Files;
  saved: Files;
  known: Files;
  /** Paths whose content the editor now shows differently, or that it gained or lost. */
  touched: string[];
  /** Paths left alone because the candidate has unsaved edits in them. */
  kept: string[];
}

/**
 * Applies what was read from the sandbox to the editor's copy.
 *
 * `read` maps each fetched path to its content, or to null when the sandbox
 * can't give it as text (binary, too large) — such a file is not shown in
 * the editor at all, so that saving can never write an empty file over it.
 */
export function applyPull(state: { files: Files; saved: Files; known: Files }, read: Record<string, string | null>, removed: string[]): PullResult {
  const files = { ...state.files };
  const saved = { ...state.saved };
  const known = { ...state.known };
  const touched: string[] = [];
  const kept: string[] = [];
  // A file is the candidate's to keep when it has unsaved typing in it, or
  // when it has been saved but that save hasn't reached the sandbox yet — in
  // which case what the sandbox just returned is the version from before
  // their save, and showing it would undo what they did.
  const dirty = (path: string) =>
    (path in state.files && state.files[path] !== state.saved[path]) || (path in state.saved && state.saved[path] !== state.known[path]);

  for (const [path, content] of Object.entries(read)) {
    if (content === null) {
      // Not editable here. If the editor had it as text before (it grew past
      // the limit, or became binary), it leaves the editor.
      delete known[path];
      if (path in files && !dirty(path)) {
        delete files[path];
        delete saved[path];
        touched.push(path);
      }
      continue;
    }
    known[path] = content;
    if (dirty(path)) {
      // Their unsaved version wins; it is pushed when it saves.
      if (state.files[path] !== content) kept.push(path);
      continue;
    }
    if (files[path] !== content || saved[path] !== content) {
      files[path] = content;
      saved[path] = content;
      touched.push(path);
    }
  }

  for (const path of removed) {
    delete known[path];
    if (!(path in files)) continue;
    if (dirty(path)) {
      // Deleted on disk while being edited: keep the editor's copy, which
      // saving will write back. Losing typed work to an `rm` elsewhere would
      // be the worse surprise.
      kept.push(path);
      continue;
    }
    delete files[path];
    delete saved[path];
    touched.push(path);
  }

  return { files, saved, known, touched: touched.sort(), kept: kept.sort() };
}

/** A manifest from the backend's list of entries. */
export function toManifest(entries: Array<{ path: string; size: number; modTime: number }>): Manifest {
  const manifest: Manifest = {};
  for (const e of entries) manifest[e.path] = { size: e.size, modTime: e.modTime };
  return manifest;
}

/**
 * The command the sandbox should run for a command written for the
 * in-browser workspace. The only difference that matters: the sandbox's
 * interpreter is `python3`, and a bare `python` may not exist there.
 */
export function forSandbox(command: string): string {
  return command.replace(/^python(?=\s)/, "python3");
}
