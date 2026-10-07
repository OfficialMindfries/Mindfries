/**
 * What the workspace needs from a browser, as a list of named checks.
 *
 * Each one is something the workspace really uses: Python runs as
 * WebAssembly in a worker, the files and git history live in IndexedDB and
 * localStorage, the session talks over fetch and a WebSocket, and a real
 * session runs fullscreen with the camera on. Nothing here is a guess from
 * the browser's name — it asks the browser whether the thing exists.
 *
 * Takes the global object as a parameter so Node can check it
 * (environment-checks.check.ts).
 */

export interface Capability {
  name: string;
  /** What the workspace uses it for, in the candidate's terms. */
  why: string;
  ok: boolean;
  /** A missing one of these stops a session; the rest only degrade it. */
  required: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export function browserCapabilities(g: any): Capability[] {
  const doc = g.document;
  let storage = false;
  try {
    // Present but unusable in some private-browsing modes — so it is tried.
    g.localStorage.setItem("mf-env-check", "1");
    g.localStorage.removeItem("mf-env-check");
    storage = true;
  } catch {
    storage = false;
  }

  return [
    { name: "WebAssembly", why: "runs Python in the workspace", ok: typeof g.WebAssembly === "object" && typeof g.WebAssembly?.instantiate === "function", required: true },
    { name: "Web Workers", why: "keeps the editor responsive while code runs", ok: typeof g.Worker === "function", required: true },
    { name: "IndexedDB", why: "stores your git history", ok: typeof g.indexedDB === "object" && g.indexedDB !== null, required: true },
    { name: "Local storage", why: "keeps your work across a refresh", ok: storage, required: true },
    { name: "Camera and microphone access", why: "a session keeps the camera on, and the interview can be spoken", ok: typeof g.navigator?.mediaDevices?.getUserMedia === "function", required: true },
    { name: "WebSocket", why: "the spoken interview and live updates", ok: typeof g.WebSocket === "function", required: true },
    { name: "Fullscreen", why: "a session runs fullscreen", ok: !!doc && (doc.fullscreenEnabled === true || doc.webkitFullscreenEnabled === true), required: true },
    {
      name: "A screen at least 1024 pixels wide",
      why: "the editor, task and terminal sit side by side",
      ok: typeof g.screen?.width === "number" ? g.screen.width >= 1024 : false,
      required: false,
    },
  ];
}

export function summarize(capabilities: Capability[]): { passed: boolean; missing: string[]; warnings: string[] } {
  return {
    passed: capabilities.every((c) => c.ok || !c.required),
    missing: capabilities.filter((c) => !c.ok && c.required).map((c) => c.name),
    warnings: capabilities.filter((c) => !c.ok && !c.required).map((c) => c.name),
  };
}

/** Turns a getUserMedia failure into what the candidate should do about it. */
export function mediaErrorMessage(device: "camera" | "microphone", err: unknown): string {
  const name = (err as { name?: string } | null)?.name ?? "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return `Permission for the ${device} was refused. Allow it for this site in your browser's address bar, then try again.`;
    case "NotFoundError":
    case "OverconstrainedError":
      return `No ${device} was found. Plug one in, or check it isn't disabled in your system settings.`;
    case "NotReadableError":
    case "AbortError":
      return `The ${device} is there but couldn't be opened — another app is probably using it. Close that app and try again.`;
    default:
      return `The ${device} couldn't be opened${name ? ` (${name})` : ""}.`;
  }
}
