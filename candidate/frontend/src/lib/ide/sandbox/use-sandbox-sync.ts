"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deleteSandboxPath, listSandboxFiles, readSandboxFiles, writeSandboxFile } from "@/app/ide/sandbox-actions";
import type { FileContents } from "../types";
import { applyPull, planPull, planPush, toManifest, type Files, type Manifest } from "./sync";

/**
 * Keeps IdeShell's in-memory files and the session's sandbox in step — the
 * doing half of sync.ts.
 *
 *   on mount            read the whole project from the sandbox
 *   when a file saves   write it there (and delete what the editor deleted)
 *   every few seconds,
 *   and whenever a
 *   command finishes    read back what changed on the sandbox's disk
 *
 * Everything goes through one queue, so a write and a read never interleave
 * — and sync.ts's rule covers the cases a queue can't: nothing the candidate
 * has typed or saved is ever replaced by an older copy from the sandbox.
 *
 * The editor calls files "src/app.py"; the sandbox API answers "/src/app.py"
 * and accepts either. Paths are kept in the editor's form here.
 */

const POLL_MS = 5000;
const PUSH_DELAY_MS = 300;
const editorPath = (path: string) => path.replace(/^\/+/, "");

export type SandboxSyncStatus = "off" | "loading" | "ready" | "error";

export interface SandboxSync {
  status: SandboxSyncStatus;
  /** Why the last operation failed, while it is still failing. */
  problem: string | null;
  /** Reads back what changed on the sandbox's disk, now. */
  refresh: () => void;
  /** Resolves once everything saved in the editor has reached the sandbox. */
  flush: () => Promise<void>;
  /**
   * Files that are in the project but can't be shown in the editor — too
   * large, or not text. They exist and the terminal works with them as
   * usual; the editor just isn't the tool for them. (The backend's snapshot
   * leaves the same files out of what the report reads.)
   */
  unshown: UnshownFile[];
}

export interface UnshownFile {
  path: string;
  why: "too_large" | "binary";
}

export function useSandboxSync(opts: {
  /** The session, when its workspace is a sandbox; undefined turns this off. */
  sessionId: string | undefined;
  files: FileContents;
  savedFiles: FileContents;
  /** Stops reading and writing: the work is frozen (the interview has begun, or time is up). */
  paused: boolean;
  /** Replace the editor's files with these. `touched` is what changed; `initial` marks the first load. */
  onFiles: (next: { files: FileContents; saved: FileContents; touched: string[]; initial: boolean }) => void;
}): SandboxSync {
  const { sessionId, paused } = opts;
  const [status, setStatus] = useState<SandboxSyncStatus>(sessionId ? "loading" : "off");
  const [problem, setProblem] = useState<string | null>(null);
  const [unshown, setUnshown] = useState<UnshownFile[]>([]);
  const unshownRef = useRef<Record<string, UnshownFile["why"]>>({});

  // Read from async work, long after the render that started it.
  const filesRef = useRef(opts.files);
  const savedRef = useRef(opts.savedFiles);
  const onFilesRef = useRef(opts.onFiles);
  const pausedRef = useRef(paused);
  useEffect(() => {
    filesRef.current = opts.files;
    savedRef.current = opts.savedFiles;
    onFilesRef.current = opts.onFiles;
    pausedRef.current = paused;
  });

  const known = useRef<Files>({});
  const manifest = useRef<Manifest>({});
  const ready = useRef(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const enqueue = useCallback((job: () => Promise<void>): Promise<void> => {
    const next = queue.current.then(job, job);
    queue.current = next.catch(() => undefined);
    return next;
  }, []);

  /** Lists the sandbox and reads what is new or changed since `since`. */
  const pull = useCallback(
    async (initial: boolean) => {
      if (!sessionId) return;
      const listing = await listSandboxFiles(sessionId);
      if (!listing.ok) throw new Error(listing.error);
      const current: Manifest = {};
      for (const [path, stamp] of Object.entries(toManifest(listing.entries))) current[editorPath(path)] = stamp;

      const plan = planPull(initial ? {} : manifest.current, current);
      if (plan.changed.length === 0 && plan.removed.length === 0) {
        manifest.current = current;
        return;
      }
      const read: Record<string, string | null> = {};
      const fetchedWhy: Record<string, string> = {};
      if (plan.changed.length > 0) {
        const fetched = await readSandboxFiles(sessionId, plan.changed);
        if (!fetched.ok) throw new Error(fetched.error);
        for (const f of fetched.files) {
          // A file that vanished between the listing and the read is simply
          // not there; the next listing reports it removed.
          if (f.skipped === "missing") continue;
          read[editorPath(f.path)] = f.skipped ? null : f.content;
          if (f.skipped) fetchedWhy[editorPath(f.path)] = f.skipped;
        }
      }
      // Which of the project's files the editor is leaving out, and why.
      const left: Record<string, UnshownFile["why"]> = {};
      for (const [path, why] of Object.entries(unshownRef.current)) if (path in current && !(path in read)) left[path] = why;
      for (const [path, content] of Object.entries(read)) {
        if (content !== null) continue;
        const why = fetchedWhy[path];
        left[path] = why === "binary" ? "binary" : "too_large";
      }
      const before = unshownRef.current;
      if (Object.keys(left).length !== Object.keys(before).length || Object.keys(left).some((p) => before[p] !== left[p])) {
        unshownRef.current = left;
        setUnshown(Object.entries(left).map(([path, why]) => ({ path, why })).sort((a, b) => a.path.localeCompare(b.path)));
      }
      // Decided against the editor as it is *now*, not as it was when the
      // listing was asked for: the candidate may have typed in between.
      const state = initial ? { files: {}, saved: {}, known: {} } : { files: filesRef.current, saved: savedRef.current, known: known.current };
      const result = applyPull(state, read, plan.removed);
      known.current = result.known;
      manifest.current = current;
      if (initial || result.touched.length > 0) {
        // Updated here as well as by the render this causes, so a push or
        // pull queued right behind this one sees the new files.
        filesRef.current = result.files;
        savedRef.current = result.saved;
        onFilesRef.current({ files: result.files, saved: result.saved, touched: result.touched, initial });
      }
    },
    [sessionId],
  );

  /** Writes what the editor has saved that the sandbox doesn't have. */
  const push = useCallback(async () => {
    if (!sessionId || !ready.current) return;
    const saved = savedRef.current;
    const plan = planPush(known.current, saved);
    for (const path of plan.writes) {
      const content = saved[path];
      const result = await writeSandboxFile(sessionId, path, content);
      if (!result.ok) throw new Error(result.error);
      known.current = { ...known.current, [path]: content };
    }
    for (const path of plan.deletes) {
      const result = await deleteSandboxPath(sessionId, path);
      if (!result.ok) throw new Error(result.error);
      const rest = { ...known.current };
      delete rest[path];
      known.current = rest;
    }
  }, [sessionId]);

  const run = useCallback(
    (job: () => Promise<void>) =>
      enqueue(async () => {
        try {
          await job();
          setProblem(null);
        } catch (err) {
          setProblem(err instanceof Error ? err.message : "The sandbox didn't answer.");
          throw err;
        }
      }),
    [enqueue],
  );

  // The first load.
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const load = (attempt: number) => {
      run(() => pull(true))
        .then(() => {
          if (cancelled) return;
          ready.current = true;
          setStatus("ready");
        })
        .catch(() => {
          if (cancelled) return;
          // A sandbox that was stopped for being idle takes a moment to come
          // back; a few tries cover that before this is called an error.
          if (attempt < 4) setTimeout(() => !cancelled && load(attempt + 1), 2500);
          else setStatus("error");
        });
    };
    load(0);
    return () => {
      cancelled = true;
    };
  }, [sessionId, pull, run]);

  // Saves reach the sandbox a moment after they happen.
  useEffect(() => {
    if (!sessionId || status !== "ready" || paused) return;
    const timeout = setTimeout(() => void run(push).catch(() => undefined), PUSH_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [sessionId, status, paused, opts.savedFiles, run, push]);

  const refresh = useCallback(() => {
    if (!sessionId || !ready.current || pausedRef.current) return;
    // Anything saved goes first, so the read that follows can't be of a
    // file whose newer version is still waiting here.
    void run(async () => {
      await push();
      await pull(false);
    }).catch(() => undefined);
  }, [sessionId, run, push, pull]);

  // Something else may have changed the disk — a watcher, a background job.
  useEffect(() => {
    if (!sessionId || status !== "ready" || paused) return;
    const interval = setInterval(() => {
      if (!document.hidden) refresh();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [sessionId, status, paused, refresh]);

  const flush = useCallback(async () => {
    if (!sessionId || !ready.current) return;
    await run(push).catch(() => undefined);
  }, [sessionId, run, push]);

  return { status, problem, refresh, flush, unshown };
}
