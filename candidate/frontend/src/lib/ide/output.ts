/**
 * Output channels, in VS Code's sense: named, append-only logs with a
 * dropdown to switch between them (build systems, tasks, language servers).
 *
 * Deliberately a plain module store with no React and no DOM imports —
 * shell commands write to it from outside React's render cycle, and the
 * shell engine has to stay drivable in Node. The React binding lives in the
 * panel, via `subscribe`/`getSnapshot` (useSyncExternalStore).
 */

export const CHANNELS = {
  preview: "Preview",
  packages: "Packages",
  git: "Git",
} as const;

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS];

/** Bounded so a long session can't grow a channel without limit. */
const MAX_LINES = 500;

type Listener = () => void;

class OutputStore {
  private lines = new Map<string, string[]>();
  private listeners = new Set<Listener>();
  /** Replaced on every change so useSyncExternalStore sees a new reference. */
  private snapshot: Record<string, string[]> = {};

  append(channel: ChannelName, text: string): void {
    const incoming = text.replace(/\r\n/g, "\n").split("\n").filter((line) => line.length > 0);
    if (incoming.length === 0) return;

    const existing = this.lines.get(channel) ?? [];
    const next = [...existing, ...incoming];
    this.lines.set(channel, next.length > MAX_LINES ? next.slice(-MAX_LINES) : next);
    this.publish();
  }

  clear(channel: ChannelName): void {
    this.lines.set(channel, []);
    this.publish();
  }

  /** Channels that have produced output — an empty one isn't worth listing. */
  active(): string[] {
    return [...this.lines.entries()].filter(([, lines]) => lines.length > 0).map(([name]) => name);
  }

  getSnapshot = (): Record<string, string[]> => this.snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish(): void {
    this.snapshot = Object.fromEntries(this.lines);
    for (const listener of this.listeners) listener();
  }
}

export const output = new OutputStore();

/**
 * Which channel a command's output belongs in. Routing centrally here means
 * commands don't each need to know about the Output panel — and a command
 * that isn't listed simply doesn't log, which is the right default.
 */
export function channelForCommand(command: string): ChannelName | null {
  if (["npm", "npx", "pip", "pip3"].includes(command)) return CHANNELS.packages;
  if (command === "git") return CHANNELS.git;
  if (["dev", "serve", "preview"].includes(command)) return CHANNELS.preview;
  // Program output (node/python) belongs in the terminal, as it does in VS
  // Code — the Output panel is for tooling, not the user's own program.
  return null;
}
