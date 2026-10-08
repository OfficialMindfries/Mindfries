"use client";

import { useState } from "react";
import { ExternalLink, RefreshCw, Star } from "lucide-react";
import { refreshKnowledge } from "@/lib/profile/actions";
import { PLATFORMS } from "@/lib/profile/links";
import type { StoredKnowledge } from "@/lib/profile/knowledge";
import { usePreviewMode } from "./PreviewMode";

const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/**
 * What the linked code accounts say: projects, languages, recent activity.
 *
 * Read from each platform's public API for the username the candidate
 * linked (lib/profile/knowledge.ts). It is shown to hiring teams beside the
 * report — and it says, here and there, that it describes a public account
 * the candidate named, not one they have been shown to own.
 */
export function KnowledgeBase({ items }: { items: StoredKnowledge[] }) {
  const preview = usePreviewMode();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (items.length === 0) {
    if (preview) return null;
    return (
      <section className="rounded-2xl border border-dashed border-[#B3CFE5] bg-white p-6">
        <h2 className="text-sm font-semibold text-[#0A1931]">Projects, languages and activity</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[#4A7FA7]">
          Link a GitHub or GitLab account above and what it shows publicly — your own projects, the languages
          they&apos;re in, how recently you&apos;ve been active — appears here and beside your reports.
        </p>
      </section>
    );
  }

  async function refresh(source: StoredKnowledge["source"]) {
    setBusy(source);
    setNotice(null);
    try {
      const res = await refreshKnowledge(source);
      if (!res.ok) setNotice(res.error || "Couldn't refresh.");
    } catch {
      setNotice("Couldn't reach the server — check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-[#B3CFE5] bg-white p-6">
      <h2 className="text-sm font-semibold text-[#0A1931]">Projects, languages and activity</h2>
      <p className="mt-1 text-[12px] leading-relaxed text-[#4A7FA7]">
        Public information from the accounts linked above. An account you signed in to is marked as yours; one
        linked only by username shows the account exists, not that it is yours, and hiring teams are told which.
      </p>
      {notice && <p className="mt-2 text-[12px] text-[#a6203c]">{notice}</p>}

      <div className="mt-4 space-y-6">
        {items.map(({ source, handle, verified, fetchedAt, knowledge: k }) => (
          <div key={source}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[13.5px] font-semibold text-[#0A1931]">
                {PLATFORMS[source].label} · {handle}
              </h3>
              <span className={verified ? "text-[11px] font-semibold text-[#1A9E6B]" : "text-[11px] text-[#4A7FA7]"}>{verified ? "yours" : "ownership not confirmed"}</span>
              <span className="text-[11px] text-[#4A7FA7]">read {day(fetchedAt)}</span>
              {!preview && (
                <button
                  type="button"
                  onClick={() => void refresh(source)}
                  disabled={busy !== null}
                  className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium text-[#1A3D63] hover:underline disabled:opacity-50"
                >
                  <RefreshCw size={11} className={busy === source ? "animate-spin" : ""} /> Refresh
                </button>
              )}
            </div>

            {k.languages.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {k.languages.slice(0, 10).map((l) => (
                  <span key={l.name} className="rounded-full border border-[#B3CFE5] bg-[#F6FAFD] px-2.5 py-0.5 text-[11.5px] text-[#0A1931]">
                    {l.name} <span className="text-[#4A7FA7]">· {l.projects} {l.projects === 1 ? "project" : "projects"}</span>
                  </span>
                ))}
              </div>
            )}

            <p className="mt-2.5 text-[12px] text-[#4A7FA7]">
              {k.activity === null
                ? "Recent activity isn't public for this account."
                : k.activity.lastActiveAt
                  ? `Last public activity ${day(k.activity.lastActiveAt)}. Since ${day(k.activity.since)}: ${n(k.activity.pushes, "push", "pushes")}, ${n(k.activity.pullRequests, "pull request")} opened, ${n(k.activity.reviews, "review")}, ${n(k.activity.issues, "issue")}.`
                  : "No recent public activity."}
            </p>

            {k.projects.length === 0 ? (
              <p className="mt-2 text-[12.5px] text-[#4A7FA7]">No public projects of their own on this account.</p>
            ) : (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {k.projects.map((p) => (
                  <li key={p.url} className="rounded-xl border border-[#B3CFE5]/70 bg-[#F6FAFD] p-3">
                    <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium text-[#1A3D63] hover:underline">
                      {p.name} <ExternalLink size={11} />
                    </a>
                    {p.description && <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-[#0A1931]/80">{p.description}</p>}
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-[#4A7FA7]">
                      {p.language && <span>{p.language}</span>}
                      {p.stars > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          <Star size={10} /> {p.stars}
                        </span>
                      )}
                      {p.updatedAt && <span>updated {day(p.updatedAt)}</span>}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {!!k.privateProjects && (
              <p className="mt-2 text-[11.5px] text-[#4A7FA7]">
                Plus {k.privateProjects} private {k.privateProjects === 1 ? "project" : "projects"}, counted in the languages above. Their
                names are not stored or shown.
              </p>
            )}
            {k.projectCount > k.projects.length && (
              <p className="mt-2 text-[11.5px] text-[#4A7FA7]">
                Showing the {k.projects.length} most recently worked on, of {k.projectCount}.
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
