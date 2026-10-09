import { Chip, Pill } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import type { CandidateProfile } from "@/lib/candidate-profile";

const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/**
 * The candidate's profile, beside their report.
 *
 * Three kinds of information, kept apart and labelled, because a reviewer
 * should weigh them differently: what the candidate wrote, what was read
 * from their resume, and what their linked code accounts show publicly.
 * None of it is evidence from the session — that is the report below.
 */
export function CandidateProfileCard({ profile }: { profile: CandidateProfile | null }) {
  if (!profile) {
    return (
      <div className="hair-card p-5">
        <div className="eyebrow">Profile</div>
        <p className="mt-2 text-sm text-dim">No candidate account uses this email yet, so there is no profile to show.</p>
      </div>
    );
  }

  const facts = [
    profile.location,
    profile.openTo.length > 0 ? `Open to ${profile.openTo.join(", ")}` : "",
    profile.noticePeriod ? `Notice: ${profile.noticePeriod}` : "",
  ].filter(Boolean);
  const wroteNothing = !profile.headline && !profile.bio && facts.length === 0;

  return (
    <div className="hair-card divide-y divide-hair">
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="eyebrow">Profile</div>
          <Pill tone={profile.emailVerifiedAt ? "green" : "gray"}>{profile.emailVerifiedAt ? "Email confirmed" : "Email not confirmed"}</Pill>
        </div>
        {wroteNothing ? (
          <p className="mt-2 text-sm text-dim">The candidate hasn&apos;t filled in their profile.</p>
        ) : (
          <>
            {profile.headline && <div className="mt-2 text-base font-bold">{profile.headline}</div>}
            {facts.length > 0 && <p className="mt-1 text-sm text-dim">{facts.join(" · ")}</p>}
            {profile.bio && <p className="mt-3 text-sm whitespace-pre-line">{profile.bio}</p>}
            <p className="mt-2 text-xs text-faint">
              Written by the candidate{profile.updatedAt ? ` · updated ${fmtDate(profile.updatedAt)}` : ""}
            </p>
          </>
        )}
        {profile.links.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {profile.links.map((l) => (
              <span key={l.platform}>
                {l.url ? (
                  <a href={l.url} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">
                    {l.label}
                  </a>
                ) : (
                  <span className="font-semibold">{l.label}</span>
                )}
                {l.platform === "linkedin" && l.signedInAs && (
                  <span className="text-xs text-faint">
                    {" "}
                    — signed in to LinkedIn as {l.signedInAs}
                    {l.headline ? ` (${l.headline})` : ""}
                    {l.url ? "; the address is as the candidate entered it" : ""}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="eyebrow">Resume</div>
        {!profile.resume ? (
          <p className="mt-2 text-sm text-dim">No resume uploaded.</p>
        ) : (
          <>
            <p className="mt-2 text-sm">
              {profile.resume.url ? (
                <a href={profile.resume.url} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">
                  {profile.resume.fileName}
                </a>
              ) : (
                <span className="font-semibold">{profile.resume.fileName}</span>
              )}
              <span className="text-faint"> · the link works for an hour</span>
            </p>
            {profile.resume.skills.length > 0 ? (
              <>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {profile.resume.skills.map((s) => (
                    <Chip key={s}>{s}</Chip>
                  ))}
                </div>
                <p className="mt-2 text-xs text-faint">
                  Technologies the resume names, most-mentioned first
                  {profile.resume.years ? `; it mentions years from ${profile.resume.years.from} to ${profile.resume.years.to}` : ""}. Found by
                  matching words in the text — not a check that the candidate has these skills.
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs text-faint">
                {profile.resume.readable
                  ? "The resume was read, but it names none of the technologies we look for."
                  : "Nothing could be read from the file automatically — open it to read it."}
              </p>
            )}
          </>
        )}
      </div>

      {profile.codeAccounts.map((a) => (
        <div key={a.source} className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="eyebrow">{a.source === "github" ? "GitHub" : "GitLab"}</div>
            <a href={a.profileUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold underline underline-offset-2">
              {a.handle}
            </a>
            <Pill tone={a.verified ? "green" : "amber"}>{a.verified ? "Ownership confirmed" : "Ownership not confirmed"}</Pill>
          </div>
          {!a.verified && (
            <p className="mt-2 text-xs text-faint">
              The candidate entered this username. The account exists and what follows is public information about it; nothing has shown
              it belongs to them.
            </p>
          )}

          {a.languages.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {a.languages.slice(0, 10).map((l) => (
                <Chip key={l.name}>
                  {l.name} · {l.projects}
                </Chip>
              ))}
            </div>
          )}

          <p className="mt-3 text-sm text-dim">
            {a.activity === null
              ? "Recent activity isn't public for this account."
              : a.activity.lastActiveAt
                ? `Last public activity ${fmtDate(a.activity.lastActiveAt)}. Since ${a.activity.since ? fmtDate(a.activity.since) : "—"}: ${n(a.activity.pushes, "push", "pushes")}, ${n(a.activity.pullRequests, "pull request")} opened, ${n(a.activity.reviews, "review")}, ${n(a.activity.issues, "issue")}.`
                : "No recent public activity."}
            {a.memberSince ? ` Account created ${fmtDate(a.memberSince)}.` : ""}
          </p>

          {a.projects.length > 0 && (
            <ul className="mt-3 space-y-2">
              {a.projects.slice(0, 6).map((p) => (
                <li key={p.url} className="text-sm">
                  <a href={p.url} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">
                    {p.name}
                  </a>
                  <span className="text-faint">
                    {p.language ? ` · ${p.language}` : ""}
                    {p.stars > 0 ? ` · ${p.stars} stars` : ""}
                    {p.updatedAt ? ` · updated ${fmtDate(p.updatedAt)}` : ""}
                  </span>
                  {p.description && <div className="text-dim">{p.description}</div>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-faint">
            {a.projectCount === 0
              ? "No public projects of their own."
              : `${Math.min(6, a.projects.length)} of ${a.projectCount} own public projects, most recently worked on first; forks are left out.`}{" "}
            {a.privateProjects > 0
              ? `Plus ${a.privateProjects} private ${a.privateProjects === 1 ? "project" : "projects"} of their own, counted in the languages above; private projects are never named. `
              : ""}
            Read {fmtDate(a.fetchedAt)}.
          </p>
        </div>
      ))}
    </div>
  );
}
