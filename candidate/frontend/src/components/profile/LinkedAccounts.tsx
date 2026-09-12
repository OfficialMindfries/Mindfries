"use client";

import { useState } from "react";
import { BadgeCheck, ExternalLink, Loader2, Plus, Trash2, X } from "lucide-react";
import { NotFoundError, PLATFORM_ORDER, PLATFORMS, type LinkPlatform } from "@/lib/profile/links";
import { useProfileExtras, type StoredLink } from "@/lib/profile/storage";

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
 */
export function LinkedAccounts() {
  const { links, setLink, removeLink } = useProfileExtras();
  const [open, setOpen] = useState<LinkPlatform | null>(null);

  return (
    <section className="rounded-2xl border border-[#B3CFE5] bg-white p-6">
      <h2 className="text-sm font-semibold text-[#0A1931]">Linked accounts</h2>
      <p className="mt-1 text-[12px] leading-relaxed text-[#4A7FA7]">
        GitHub and GitLab are checked against the real account when you add them. LinkedIn and a
        portfolio are stored as you enter them — there&apos;s no public way to check those two from here.
      </p>

      <ul className="mt-4 space-y-2">
        {PLATFORM_ORDER.map((id) => (
          <li key={id}>
            <PlatformRow
              id={id}
              link={links[id]}
              isOpen={open === id}
              onOpen={() => setOpen(id)}
              onClose={() => setOpen((cur) => (cur === id ? null : cur))}
              onSave={(link) => {
                const ok = setLink(id, link);
                if (ok) setOpen(null);
                return ok;
              }}
              onRemove={() => removeLink(id)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function PlatformRow({
  id,
  link,
  isOpen,
  onOpen,
  onClose,
  onSave,
  onRemove,
}: {
  id: LinkPlatform;
  link: StoredLink | undefined;
  isOpen: boolean;
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
        // punishing a legitimate username for a transient failure; the row
        // will show "couldn't verify" instead of a confirmed profile.
        if (!onSave({ value: result.value, savedAt: new Date().toISOString() })) setError(STORAGE_FULL);
      }
    } finally {
      setPending(false);
    }
  }

  if (link) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-[#B3CFE5] bg-[#F6FAFD] px-3.5 py-2.5">
        {link.stats?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a remote avatar from the platform's own API, not worth an image-optimization pass for a 32px badge
          <img src={link.stats.avatarUrl} alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-full" />
        ) : (
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: platform.tint }}
          >
            <Icon size={15} />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-medium text-[#0A1931]">
              {link.stats?.name ?? link.value}
            </span>
            {platform.live ? (
              link.stats ? (
                <span className="inline-flex shrink-0 items-center gap-0.5 text-[10.5px] font-semibold text-[#1A9E6B]">
                  <BadgeCheck size={12} /> Verified
                </span>
              ) : (
                <span className="shrink-0 text-[10.5px] text-[#4A7FA7]">couldn&apos;t verify</span>
              )
            ) : (
              <span className="shrink-0 text-[10.5px] text-[#4A7FA7]">Linked</span>
            )}
          </div>
          <p className="text-[11px] text-[#4A7FA7]">
            {platform.label}
            {link.stats?.publicRepos !== undefined && ` · ${link.stats.publicRepos} public repos`}
            {link.stats?.followers !== undefined && ` · ${link.stats.followers} followers`}
          </p>
        </div>

        <a
          href={link.stats?.profileUrl ?? platform.profileUrl(link.value)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${platform.label} profile`}
          className="shrink-0 rounded-lg p-1.5 text-[#4A7FA7] transition-colors hover:bg-[#B3CFE5]/40 hover:text-[#1A3D63]"
        >
          <ExternalLink size={14} />
        </a>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${platform.label}`}
          className="shrink-0 rounded-lg p-1.5 text-[#4A7FA7] transition-colors hover:bg-[#B3CFE5]/40 hover:text-[#c0304c]"
        >
          <Trash2 size={14} />
        </button>
      </div>
    );
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="group flex w-full items-center gap-3 rounded-xl border border-dashed border-[#B3CFE5] px-3.5 py-2.5 text-left transition-colors hover:border-[#4A7FA7] hover:bg-[#B3CFE5]/10"
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white opacity-70 transition-opacity group-hover:opacity-100"
          style={{ backgroundColor: platform.tint }}
        >
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-[#0A1931]">{platform.label}</p>
          <p className="truncate text-[11px] text-[#4A7FA7]">{platform.pitch}</p>
        </div>
        <Plus size={16} className="shrink-0 text-[#4A7FA7]" />
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-[#4A7FA7] bg-[#F6FAFD] px-3.5 py-3">
      <div className="flex items-center gap-2">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: platform.tint }}
        >
          <Icon size={15} />
        </span>
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
          className="min-w-0 flex-1 rounded-lg border border-[#B3CFE5] bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-[#1A3D63]"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={pending || !value.trim()}
          className="btn-wipe px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
          style={{ "--btn-bg": "#1A3D63", "--btn-fg": "#F6FAFD", "--btn-fill": "#4A7FA7", "--btn-fg-hover": "#FFFFFF" } as React.CSSProperties}
        >
          {pending ? <Loader2 size={13} className="animate-spin" /> : platform.live ? "Verify" : "Save"}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          aria-label="Cancel"
          className="shrink-0 rounded-lg p-1.5 text-[#4A7FA7] transition-colors hover:bg-[#B3CFE5]/40 hover:text-[#1A3D63]"
        >
          <X size={14} />
        </button>
      </div>
      {error && <p className="mt-1.5 pl-10 text-[12px] text-[#c0304c]">{error}</p>}
    </div>
  );
}
