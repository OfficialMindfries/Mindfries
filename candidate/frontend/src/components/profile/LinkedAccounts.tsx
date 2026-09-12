"use client";

import { useState } from "react";
import { BadgeCheck, ExternalLink, Loader2, Trash2, X } from "lucide-react";
import { NotFoundError, PLATFORM_ORDER, PLATFORMS, type LinkPlatform } from "@/lib/profile/links";
import { useProfileExtras, type StoredLink } from "@/lib/profile/storage";
import { usePreviewMode } from "./PreviewMode";

/**
 * GitHub, GitLab, LinkedIn and a portfolio link — the platforms that say
 * something about a candidate beyond what's typed into a form.
 *
 * A GitHub or GitLab username is checked against the real, public API for
 * that platform right in the browser (see lib/profile/links.ts) — a wrong
 * username is refused before it's saved, and what's shown afterwards (avatar,
 * name, public repo count) came from the platform itself. LinkedIn and a
 * portfolio have no such API to check against, so those two are stored
 * exactly as entered, marked "Linked" rather than "Verified" — a real
 * difference, not a cosmetic one, and the UI doesn't blur it.
 *
 * A grid of tiles, not a list of rows: each platform is its own square, so
 * "Connect" reads as an action on that specific card rather than a row item
 * in a form.
 */
export function LinkedAccounts() {
  const { links, setLink, removeLink } = useProfileExtras();
  const [open, setOpen] = useState<LinkPlatform | null>(null);
  const preview = usePreviewMode();

  const connectedCount = PLATFORM_ORDER.filter((id) => links[id]).length;
  const visible = preview ? PLATFORM_ORDER.filter((id) => links[id]) : PLATFORM_ORDER;

  return (
    <section className="rounded-2xl border border-[#B3CFE5] bg-white p-6">
      <h2 className="text-sm font-semibold text-[#0A1931]">Linked accounts</h2>
      {!preview && (
        <p className="mt-1 text-[12px] leading-relaxed text-[#4A7FA7]">
          GitHub and GitLab are checked against the real account when you add them. LinkedIn and a
          portfolio are stored as you enter them — there&apos;s no public way to check those two from here.
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
              onOpen={() => setOpen(id)}
              onClose={() => setOpen((cur) => (cur === id ? null : cur))}
              onSave={(link) => {
                const ok = setLink(id, link);
                if (ok) setOpen(null);
                return ok;
              }}
              onRemove={() => removeLink(id)}
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
  onOpen,
  onClose,
  onSave,
  onRemove,
}: {
  id: LinkPlatform;
  link: StoredLink | undefined;
  isOpen: boolean;
  preview: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** Returns whether the link was actually saved — false means storage refused it. */
  onSave: (link: StoredLink) => boolean;
  onRemove: () => void;
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

    const STORAGE_FULL = "Couldn't save — this browser's storage is full.";

    if (!platform.fetchStats) {
      if (!onSave({ value: result.value, savedAt: new Date().toISOString() })) setError(STORAGE_FULL);
      return;
    }

    setPending(true);
    setError(null);
    try {
      const stats = await platform.fetchStats(result.value);
      if (!onSave({ value: result.value, savedAt: new Date().toISOString(), stats })) setError(STORAGE_FULL);
    } catch (e) {
      if (e instanceof NotFoundError) {
        setError(e.message);
      } else {
        // A real account, most likely — GitHub/GitLab just didn't answer
        // this time (rate limit, network). Save the link anyway rather than
        // punishing a legitimate username for a transient failure; the tile
        // will show "couldn't verify" instead of a confirmed profile.
        if (!onSave({ value: result.value, savedAt: new Date().toISOString() })) setError(STORAGE_FULL);
      }
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
            <p className="truncate text-[13.5px] font-medium text-[#0A1931]">{link.stats?.name ?? link.value}</p>
            <div className="mt-0.5 flex items-center gap-1.5">
              {platform.live ? (
                link.stats ? (
                  <span className="inline-flex shrink-0 items-center gap-0.5 text-[10.5px] font-semibold text-[#1A9E6B]">
                    <BadgeCheck size={11} /> Verified
                  </span>
                ) : (
                  <span className="shrink-0 text-[10.5px] text-[#4A7FA7]">couldn&apos;t verify</span>
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
          <a
            href={link.stats?.profileUrl ?? platform.profileUrl(link.value)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-[#1A3D63] hover:underline"
          >
            View <ExternalLink size={11} />
          </a>
          {!preview && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${platform.label}`}
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
          {pending ? <Loader2 size={13} className="mx-auto animate-spin" /> : platform.live ? "Verify" : "Save"}
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
        Connect
      </button>
    </div>
  );
}
