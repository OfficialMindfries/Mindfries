"use client";

import { useSyncExternalStore } from "react";
import type { LinkPlatform, PlatformStats } from "./links";

// ── Resume and linked accounts, kept in this browser ────────────────────────
//
// There's no profile-write path to a server yet (same gap useActor.ts notes
// for the admin's touch log), so a resume and a connected account live in
// this browser's localStorage: real for the person using it, gone if they
// clear site data or switch devices. The UI says exactly that — "saved in
// this browser" is not the same claim as "saved", and the difference matters
// on a page a hiring team is eventually meant to read.
//
// One JSON blob under one key, same reasoning as useActor: simple enough that
// a hand-rolled store beats a dependency, and `useSyncExternalStore` with an
// empty server snapshot keeps the server render and the first client render
// in agreement so hydration doesn't throw.

export interface StoredResume {
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  /** The file itself, as a data: URL — this browser only, never sent anywhere. */
  dataUrl: string;
  savedAt: string;
}

export interface StoredLink {
  /** Username for GitHub/GitLab, a full URL for LinkedIn/portfolio. */
  value: string;
  savedAt: string;
  /** Only for the two platforms whose public API answered when this was saved. */
  stats?: PlatformStats;
}

/** What the "Edit profile" form writes. Absent (`null`) means nothing has been edited yet — the page falls back to the sample identity in lib/dashboard/data.ts and lib/profile/data.ts. */
export interface StoredIdentity {
  name: string;
  role: string;
  location: string;
  openTo: string[];
  noticePeriod: string;
  bio: string;
  updatedAt: string;
}

interface ProfileExtras {
  resume: StoredResume | null;
  links: Partial<Record<LinkPlatform, StoredLink>>;
  identity: StoredIdentity | null;
}

const KEY = "mindfries.profile.extras";
const EMPTY: ProfileExtras = { resume: null, links: {}, identity: null };
const listeners = new Set<() => void>();

// useSyncExternalStore requires its snapshot function to return the *same*
// reference when nothing has changed — otherwise React sees a "new" value on
// every render and loops (caught this live: "The result of getSnapshot
// should be cached to avoid an infinite loop"). So the parsed object is
// cached alongside the raw string it came from, and only reparsed when the
// raw string actually differs.
let cachedRaw: string | null = null;
let cachedValue: ProfileExtras = EMPTY;

function parse(raw: string | null): ProfileExtras {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as Partial<ProfileExtras>;
    return { resume: parsed.resume ?? null, links: parsed.links ?? {}, identity: parsed.identity ?? null };
  } catch {
    // Corrupt blob from an earlier shape — treat it as empty rather than
    // throwing the page over it.
    return EMPTY;
  }
}

function read(): ProfileExtras {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  cachedValue = parse(raw);
  return cachedValue;
}

/**
 * Returns whether the write actually landed. A resume near the size cap, on
 * top of whatever else already lives in this origin's storage, can hit the
 * quota — when that happens the cache is deliberately left untouched, so a
 * failed save doesn't look successful for the rest of this session only to
 * vanish on the next reload with no explanation.
 */
function write(next: ProfileExtras): boolean {
  const raw = JSON.stringify(next);
  try {
    localStorage.setItem(KEY, raw);
  } catch {
    return false;
  }
  cachedRaw = raw;
  cachedValue = next;
  listeners.forEach((l) => l());
  return true;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useProfileExtras() {
  const extras = useSyncExternalStore(subscribe, read, () => EMPTY);

  return {
    resume: extras.resume,
    links: extras.links,
    identity: extras.identity,
    /** True if the resume was actually saved; false means the browser refused to store it (most likely full). */
    setResume(resume: StoredResume): boolean {
      return write({ ...read(), resume });
    },
    removeResume() {
      write({ ...read(), resume: null });
    },
    /** True if the link was actually saved. */
    setLink(platform: LinkPlatform, link: StoredLink): boolean {
      return write({ ...read(), links: { ...read().links, [platform]: link } });
    },
    removeLink(platform: LinkPlatform) {
      const rest = Object.fromEntries(Object.entries(read().links).filter(([id]) => id !== platform));
      write({ ...read(), links: rest });
    },
    /** True if it saved. Stamps `updatedAt` itself, so every caller reports the same "when" honestly. */
    setIdentity(identity: Omit<StoredIdentity, "updatedAt">): boolean {
      return write({ ...read(), identity: { ...identity, updatedAt: new Date().toISOString() } });
    },
  };
}
