import "server-only";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "../supabase";
import type { ConnectedIdentity, ConnectPlatform } from "../composio";
import { dropKnowledge, readAccount, storeKnowledge } from "./knowledge";
import { statsOf } from "./knowledge-shape";

// What the "prove it's yours" sign-in leaves on the profile
// (app/api/connect/[platform]).

/** Remembers, between start and callback, which sign-in this browser began. */
export const CONNECT_COOKIE = "mf_connect";

/** Back to the profile, with what happened for it to say. The target is a fixed path on this site. */
export function profileRedirect(request: Request, platform: string, outcome: string): NextResponse {
  return NextResponse.redirect(new URL(`/profile?connect=${encodeURIComponent(platform)}&result=${encodeURIComponent(outcome)}`, request.url));
}

/**
 * Records an account the candidate has just signed in to as theirs.
 *
 * For GitHub and GitLab the link becomes the username they signed in as —
 * replacing whatever was typed, if it differs — and that account's public
 * projects are read into the knowledge base, now marked verified. For
 * LinkedIn the platform gives a name but no profile address, so the link
 * keeps the address the candidate entered (if any) and records the name
 * they signed in under beside it: it shows they hold a LinkedIn account in
 * that name, not that the address typed is that account.
 */
export async function recordVerifiedAccount(candidateId: string, platform: ConnectPlatform, identity: ConnectedIdentity): Promise<void> {
  const c = db();
  if (!c) throw new Error("The database isn't connected.");

  const { data } = await c.from("candidate_users").select("links").eq("id", candidateId).single();
  const links = (data?.links ?? {}) as Record<string, { value?: string; savedAt?: string; stats?: unknown } | undefined>;
  const now = new Date().toISOString();
  const verified = { at: now, as: identity.handle || identity.name };

  let link: Record<string, unknown>;
  if (platform === "linkedin") {
    link = { ...links.linkedin, value: links.linkedin?.value ?? "", savedAt: links.linkedin?.savedAt ?? now, verified };
  } else {
    link = { value: identity.handle, savedAt: now, verified };
    try {
      const knowledge = await readAccount(platform, identity.handle);
      await storeKnowledge(candidateId, knowledge, true);
      link.stats = statsOf(knowledge);
    } catch {
      // The platform's public API didn't answer just now. The account is
      // still theirs; whatever was read for a different username isn't it.
      await dropKnowledge(candidateId, platform);
    }
  }

  const { error } = await c.from("candidate_users").update({ links: { ...links, [platform]: link } }).eq("id", candidateId);
  if (error) throw new Error(error.message);
  revalidatePath("/profile");
}
