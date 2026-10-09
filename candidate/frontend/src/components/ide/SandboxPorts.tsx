"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ExternalLink, RefreshCw } from "lucide-react";
import { idePalette } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";
import { listSandboxPorts, previewSandboxPort } from "@/app/ide/sandbox-actions";

/**
 * The Ports view of a sandbox session: what is listening on the session's
 * machine, read from the machine itself, each with a link that opens it in
 * the candidate's browser.
 *
 * Nothing here is inferred. A row is a port the sandbox reports a program
 * bound to; the link is one Daytona signs for that port alone and that stops
 * working after an hour. A server bound only to 127.0.0.1 can't be reached
 * from outside the sandbox and isn't listed — the empty state says to bind
 * to 0.0.0.0, since that is the usual reason a started server is missing.
 *
 * The list is re-read every few seconds while this tab is showing; the
 * panel is unmounted otherwise, so nothing polls in the background.
 */

const REFRESH_MS = 5000;

const NETWORK: Record<"open" | "essentials" | "none", string> = {
  open: "This sandbox has full internet access.",
  essentials: "This sandbox can reach package registries and code hosts, not the wider web.",
  none: "This sandbox has no internet access — packages can't be installed.",
};

interface Row {
  port: number;
  process: string;
}

export function SandboxPorts({ theme, sessionId, network }: { theme: IdeTheme; sessionId: string; network: "open" | "essentials" | "none" }) {
  const palette = idePalette(theme);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // A link per port, asked for once when the port first appears.
  const [links, setLinks] = useState<Record<number, string>>({});
  const asked = useRef(new Set<number>());

  const read = useCallback(async () => {
    const res = await listSandboxPorts(sessionId).catch(() => null);
    if (!res || !res.ok) {
      setProblem(res ? res.error : "The sandbox didn't answer.");
      return;
    }
    setProblem(null);
    setRows(res.ports);
    for (const { port } of res.ports) {
      if (asked.current.has(port)) continue;
      asked.current.add(port);
      void previewSandboxPort(sessionId, port)
        .then((link) => {
          if (link.ok) setLinks((prev) => ({ ...prev, [port]: link.url }));
          else asked.current.delete(port); // ask again on the next read
        })
        .catch(() => asked.current.delete(port));
    }
  }, [sessionId]);

  useEffect(() => {
    let live = true;
    const tick = () => {
      if (live && document.visibilityState === "visible") void read();
    };
    tick();
    const timer = setInterval(tick, REFRESH_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [read]);

  return (
    <div className="flex h-full flex-col text-xs">
      <div className={clsx("grid grid-cols-[5rem_1fr_auto] items-center gap-2 border-b px-3 py-1.5", palette.border, palette.textMuted)}>
        <span>Port</span>
        <span>Program</span>
        <button type="button" title="Read again" onClick={() => void read()} className={clsx("rounded-md p-1", palette.hover)}>
          <RefreshCw size={12} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {rows === null && !problem && <p className={clsx("px-4 py-3", palette.textMuted)}>Reading what&apos;s listening in your sandbox…</p>}
        {problem && <p className="px-4 py-3 text-amber-500">Couldn&apos;t read the sandbox&apos;s ports ({problem}). Trying again shortly.</p>}
        {rows !== null && rows.length === 0 && (
          <div className={clsx("space-y-1.5 px-4 py-3", palette.textMuted)}>
            <p className={palette.text}>Nothing is listening.</p>
            <p>Start a server in the terminal and it appears here, with a link to open it.</p>
            <p className="opacity-80">
              A server bound only to <code className="font-mono">127.0.0.1</code> can&apos;t be reached from your browser — bind it to{" "}
              <code className="font-mono">0.0.0.0</code> (for example <code className="font-mono">--host 0.0.0.0</code>).
            </p>
          </div>
        )}
        {rows?.map((row) => (
          <div key={row.port} className="grid grid-cols-[5rem_1fr_auto] items-center gap-2 px-3 py-2">
            <span className={clsx("font-mono", palette.text)}>{row.port}</span>
            <span className={clsx("truncate", palette.textMuted)}>{row.process || "—"}</span>
            {links[row.port] ? (
              <a
                href={links[row.port]}
                target="_blank"
                rel="noreferrer"
                title="Open in a new tab — the link works for an hour"
                className={clsx("flex items-center gap-1 rounded-md px-1.5 py-1", palette.hover, palette.accent)}
              >
                Open <ExternalLink size={12} />
              </a>
            ) : (
              <span className={palette.textMuted}>getting a link…</span>
            )}
          </div>
        ))}
      </div>

      <p className={clsx("border-t px-3 py-1.5 text-[11px]", palette.border, palette.textMuted)}>{NETWORK[network]}</p>
    </div>
  );
}
