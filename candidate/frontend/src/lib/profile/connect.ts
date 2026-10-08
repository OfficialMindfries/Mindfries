import "server-only";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "../supabase";
import { endConnection, type ConnectedIdentity, type ConnectPlatform } from "../composio";
import { dropKnowledge, storeKnowledge } from "./knowledge";
import { readLinkedIn, readThroughConnection } from "./knowledge-connection";
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
 * Records an account the candidate has just signed in to as theirs, keeps
 * the connection, and reads the account through it.
 *
 * For GitHub and GitLab the link becomes the username they signed in as —
 * replacing whatever was typed, if it differs — and the knowledge base is
 * built through the connection and marked verified. For LinkedIn the
 * platform gives a name (and sometimes a headline and picture) but usually
 * no profile address, so the link keeps the address the candidate entered
 * (if any) and records who signed in beside it: it shows they hold a
 * LinkedIn account in that name, not that the address typed is that account.
 *
 * A connection this replaces — the candidate connecting again, or a
 * different account — is ended, so only one is ever held per platform.
 */
export async function recordVerifiedAccount(candidateId: string, platform: ConnectPlatform, identity: ConnectedIdentity, connectionId: string): Promise<void> {
  const c = db();
  if (!c) throw new Error("The database isn't connected.");

  const { data } = await c.from("candidate_users").select("links").eq("id", candidateId).single();
  const links = (data?.links ?? {}) as Record<string, { value?: string; savedAt?: string; stats?: unknown; connectionId?: string } | undefined>;
  const previous = links[platform]?.connectionId;
  const now = new Date().toISOString();
  const verified = { at: now, as: identity.handle || identity.name };

  let link: Record<string, unknown>;
  if (platform === "linkedin") {
    const profile = await readLinkedIn(candidateId, connectionId);
    link = {
      value: links.linkedin?.value ?? "",
      savedAt: links.linkedin?.savedAt ?? now,
      verified,
      connectionId,
      ...(profile ? { profile } : {}),
    };
  } else {
    link = { value: identity.handle, savedAt: now, verified, connectionId };
    try {
      const knowledge = await readThroughConnection(platform, candidateId, connectionId, identity.handle);
      await storeKnowledge(candidateId, knowledge, true);
      link.stats = statsOf(knowledge);
    } catch {
      // Neither the connection nor the public API answered just now. The
      // account is still theirs; whatever was read for a different username
      // isn't it. Refresh fills it in later.
      await dropKnowledge(candidateId, platform);
    }
  }

  const { error } = await c.from("candidate_users").update({ links: { ...links, [platform]: link } }).eq("id", candidateId);
  if (error) throw new Error(error.message);
  if (previous && previous !== connectionId) await endConnection(previous);
  revalidatePath("/profile");
}
