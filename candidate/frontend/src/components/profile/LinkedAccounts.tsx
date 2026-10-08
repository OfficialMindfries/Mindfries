"use client";

import { useState } from "react";
import { BadgeCheck, ExternalLink, Loader2, Trash2, X } from "lucide-react";
import { PLATFORM_ORDER, PLATFORMS, type LinkPlatform } from "@/lib/profile/links";
import type { StoredLink } from "@/lib/profile/storage";
import { saveLink, removeLink } from "@/lib/profile/actions";
import { usePreviewMode } from "./PreviewMode";

/**
 * GitHub, GitLab, LinkedIn and a portfolio link — the platforms that say
 * something about a candidate beyond what's typed into a form.
 *
 * A GitHub or GitLab username is read from that platform's public API by
 * the server when it is saved (lib/profile/actions.ts → knowledge.ts) — a
 * username with no account behind it is refused, and what's shown afterwards
 * (avatar, name, public repo count) came from the platform itself. That
 * shows the account exists, so the tile says "Account found"; it does not
 * show the account is the candidate's, so it does not say "Verified".
 * LinkedIn and a portfolio have no such API to read, so those two are
 * stored exactly as entered and marked "Linked".
 *
 * "Verified — yours" is a different claim, made only after the candidate
 * signed in to the account (app/api/connect, lib/composio.ts). For LinkedIn
 * that sign-in yields a name, not a profile address, so the tile says who
 * signed in rather than calling the typed address verified.
 *
 * A grid of tiles, not a list of rows: each platform is its own square, so
 * "Connect" reads as an action on that specific card rather than a row item
 * in a form.
 */
const CONNECT_RESULT: Record<string, string> = {
  verified: "is confirmed as yours.",
  cancelled: "sign-in wasn't completed, so nothing changed.",
  expired: "sign-in took too long or was started in another browser. Try again.",
  failed: "couldn't be confirmed just now. Try again in a moment.",
  not_configured: "sign-in isn't set up on this site yet.",
  unavailable: "sign-in isn't available for this platform yet.",
};

export function LinkedAccounts({
  links,
  verifiable = [],
  connectResult,
}: {
  links: Partial<Record<LinkPlatform, StoredLink>>;
  /** The platforms that can be signed in to, to prove an account is yours (lib/composio.ts). */
  verifiable?: string[];
  /** What a sign-in that just returned did: which platform, and how it ended. */
  connectResult?: { platform: string; result: string };
}) {
  const [open, setOpen] = useState<LinkPlatform | null>(null);
  const preview = usePreviewMode();

  const connectedCount = PLATFORM_ORDER.filter((id) => links[id]).length;
  const visible = preview ? PLATFORM_ORDER.filter((id) => links[id]) : PLATFORM_ORDER;

  return (
    <section className="rounded-2xl border border-[#B3CFE5] bg-white p-6">
      <h2 className="text-sm font-semibold text-[#0A1931]">Linked accounts</h2>
      {!preview && (
        <p className="mt-1 text-[12px] leading-relaxed text-[#4A7FA7]">
          A GitHub or GitLab username is looked up when you add it, and the account&apos;s public projects are
          read. LinkedIn and a portfolio are stored as you enter them — there&apos;s no public way to check those two.
          {verifiable.length > 0 &&
            ` Signing in to ${verifiable.map((id) => PLATFORMS[id as LinkPlatform]?.label ?? id).join(", ")} shows hiring teams the account is yours and lets us read it for your profile: your projects, the languages they are in and your recent activity; from LinkedIn, your name, headline and picture. Private projects are only counted — their names are never stored or shown. We only read: nothing is posted or changed. The connection stays until you remove the account here, which ends it.`}
        </p>
      )}
      {connectResult && PLATFORMS[connectResult.platform as LinkPlatform] && CONNECT_RESULT[connectResult.result] && (
        <p
          role="status"
          className={
            connectResult.result === "verified"
              ? "mt-3 rounded-lg border border-[#c5ecd5] bg-[#effbf4] px-3 py-2 text-[12.5px] text-[#14693a]"
              : "mt-3 rounded-lg border border-[#f3dca6] bg-[#fff8e8] px-3 py-2 text-[12.5px] text-[#7a5211]"
          }
        >
          {PLATFORMS[connectResult.platform as LinkPlatform].label} {CONNECT_RESULT[connectResult.result]}
        </p>
      )}

      {preview && connectedCount === 0 ? (
        <p className="mt-3 text-[13px] text-[#4A7FA7]">No accounts linked yet.</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {visible.map((id) => (
            <PlatformTile
              key={id}
              id={id}
              link={links[id]}
              isOpen={open === id}
              preview={preview}
              canVerify={verifiable.includes(id)}
              onOpen={() => setOpen(id)}
              onClose={() => setOpen((cur) => (cur === id ? null : cur))}
              onSave={async (value) => {
                const res = await saveLink(id, value);
                if (res.ok) {
                  setOpen(null);
                  return null;
                }
                return res.error || "Couldn't save that.";
              }}
              onRemove={async () => {
                await removeLink(id);
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PlatformTile({
  id,
  link,
  isOpen,
  preview,
  canVerify,
  onOpen,
  onClose,
  onSave,
  onRemove,
}: {
  id: LinkPlatform;
  link: StoredLink | undefined;
  isOpen: boolean;
  preview: boolean;
  /** This platform can be signed in to, to show the account is the candidate's. */
  canVerify: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** Returns null once saved, or the reason it wasn't. */
  onSave: (value: string) => Promise<string | null>;
  onRemove: () => Promise<void>;
}) {
  const platform = PLATFORMS[id];
  const Icon = platform.icon;
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const result = platform.normalize(value);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setPending(true);
    setError(null);
    try {
      setError(await onSave(result.value));
    } catch {
      setError("Couldn't save that — try again.");
    } finally {
      setPending(false);
    }
  }

  const iconTile = (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
      style={{ backgroundColor: platform.tint }}
    >
      <Icon size={17} />
    </span>
  );

  // ── Connected ──────────────────────────────────────────────────────────
  if (link) {
    return (
      <div className="rounded-xl border border-[#B3CFE5] bg-[#F6FAFD] p-3.5">
        <div className="flex items-start gap-3">
          {link.stats?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a remote avatar from the platform's own API, not worth an image-optimization pass for a 40px badge
            <img src={link.stats.avatarUrl} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full" />
          ) : (
            iconTile
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-medium text-[#0A1931]">{link.stats?.name ?? link.profile?.name ?? (link.value || link.verified?.as)}</p>
            {link.profile?.headline && <p className="truncate text-[11px] text-[#4A7FA7]">{link.profile.headline}</p>}
            <div className="mt-0.5 flex items-center gap-1.5">
              {link.verified ? (
                <span className="inline-flex shrink-0 items-center gap-0.5 text-[10.5px] font-semibold text-[#1A9E6B]" title={`Signed in as ${link.verified.as}`}>
                  <BadgeCheck size={11} /> {id === "linkedin" ? `Signed in as ${link.verified.as}` : "Verified — yours"}
                </span>
              ) : platform.live ? (
                link.stats ? (
                  <span className="inline-flex shrink-0 items-center gap-0.5 text-[10.5px] font-semibold text-[#1A9E6B]">
                    <BadgeCheck size={11} /> Account found
                  </span>
                ) : (
                  <span className="shrink-0 text-[10.5px] text-[#4A7FA7]">not looked up yet</span>
                )
              ) : (
                <span className="shrink-0 text-[10.5px] text-[#4A7FA7]">Linked</span>
              )}
            </div>
            {(link.stats?.publicRepos !== undefined || link.stats?.followers !== undefined) && (
              <p className="mt-0.5 text-[11px] text-[#4A7FA7]">
                {link.stats?.publicRepos !== undefined && `${link.stats.publicRepos} public repos`}
                {link.stats?.publicRepos !== undefined && link.stats?.followers !== undefined && " · "}
                {link.stats?.followers !== undefined && `${link.stats.followers} followers`}
              </p>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 border-t border-[#B3CFE5]/60 pt-2.5">
          {(link.value || link.profile?.profileUrl) && (
            <a
              href={link.stats?.profileUrl ?? link.profile?.profileUrl ?? platform.profileUrl(link.value)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[12px] font-medium text-[#1A3D63] hover:underline"
            >
              View <ExternalLink size={11} />
            </a>
          )}
          {!preview && canVerify && !link.verified && (
            // A plain link: it leaves this site for the platform's sign-in.
            <a href={`/api/connect/${id}/start`} className="text-[12px] font-medium text-[#1A3D63] underline underline-offset-2 hover:text-[#0A1931]">
              Confirm it&apos;s yours
            </a>
          )}
          {!preview && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={link.connectionId ? `Remove ${platform.label} and end the connection` : `Remove ${platform.label}`}
              title={link.connectionId ? "Removes the account and ends the connection" : undefined}
              className="ml-auto rounded-lg p-1.5 text-[#4A7FA7] transition-colors hover:bg-white hover:text-[#a6203c]"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Not connected, entering a value ───────────────────────────────────
  if (isOpen) {
    return (
      <div className="rounded-xl border border-[#4A7FA7] bg-[#F6FAFD] p-3.5">
        <div className="flex items-center gap-2.5">
          {iconTile}
          <p className="text-[13.5px] font-medium text-[#0A1931]">{platform.label}</p>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Cancel"
            className="ml-auto rounded-lg p-1.5 text-[#4A7FA7] transition-colors hover:bg-white hover:text-[#1A3D63]"
          >
            <X size={14} />
          </button>
        </div>
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          placeholder={platform.placeholder}
          disabled={pending}
          className="mt-2.5 w-full rounded-lg border border-[#B3CFE5] bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-[#1A3D63]"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={pending || !value.trim()}
          className="btn-wipe mt-2 w-full px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50"
          style={{ "--btn-bg": "#1A3D63", "--btn-fg": "#F6FAFD", "--btn-fill": "#4A7FA7", "--btn-fg-hover": "#FFFFFF" } as React.CSSProperties}
        >
          {pending ? <Loader2 size={13} className="mx-auto animate-spin" /> : platform.live ? "Look up and save" : "Save"}
        </button>
        {error && <p className="mt-1.5 text-[12px] text-[#c0304c]">{error}</p>}
      </div>
    );
  }

  // ── Not connected ──────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-[#B3CFE5] bg-white p-3.5">
      <div className="flex items-center gap-2.5">
        {iconTile}
        <p className="text-[13.5px] font-medium text-[#0A1931]">{platform.label}</p>
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-[#4A7FA7]">{platform.pitch}</p>
      <button
        type="button"
        onClick={onOpen}
        className="btn-wipe mt-2.5 px-3 py-1.5 text-[12px] font-semibold"
        style={{ "--btn-bg": "#1A3D63", "--btn-fg": "#F6FAFD", "--btn-fill": "#4A7FA7", "--btn-fg-hover": "#FFFFFF" } as React.CSSProperties}
      >
        {canVerify ? (id === "linkedin" ? "Enter the address" : "Enter a username") : "Connect"}
      </button>
      {canVerify && (
        <a
          href={`/api/connect/${id}/start`}
          className="btn-wipe mt-2 block px-3 py-1.5 text-center text-[12px] font-semibold"
          style={{ "--btn-bg": "#0A1931", "--btn-fg": "#F6FAFD", "--btn-fill": "#1A3D63", "--btn-fg-hover": "#FFFFFF" } as React.CSSProperties}
        >
          Sign in with {platform.label}
        </a>
      )}
    </div>
  );
}
