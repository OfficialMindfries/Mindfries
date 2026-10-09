"use client";

import { createContext, useContext } from "react";

/**
 * Whether this workspace is a sandbox one, for the panels that behave
 * differently when it is: the terminal (a real shell instead of the
 * in-browser one) and the Tests panel (runs the tests on the sandbox).
 *
 * Null — the default — is the in-browser workspace: a scratch or practice
 * run, or a session whose sandbox wasn't available.
 */
export interface SandboxWorkspace {
  sessionId: string;
  /** Reads back what changed on the sandbox's disk. */
  refresh: () => void;
  /** What the sandbox may reach on the network. */
  network: "open" | "essentials" | "none";
}

export const SandboxContext = createContext<SandboxWorkspace | null>(null);

export const useSandbox = () => useContext(SandboxContext);
