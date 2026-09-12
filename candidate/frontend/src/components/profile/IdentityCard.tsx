import { candidate } from "@/lib/dashboard/data";
import { availability, bio } from "@/lib/profile/data";

/**
 * Name, role, location and a line of bio — the part of the profile a hiring
 * team reads first, and the only part that's read-only for a reason: there's
 * no profile-write path yet, so this shows what exists rather than drawing
 * edit controls that would have nowhere to send a save.
 */
export function IdentityCard() {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#B3CFE5] bg-white">
      <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-start">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#1A3D63] text-xl font-semibold text-[#F6FAFD]">
          {candidate.initials}
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="text-[20px] font-semibold tracking-tight text-[#0A1931]">{candidate.name}</h2>
          <p className="mt-1 text-sm text-[#4A7FA7]">
            {candidate.role} · {candidate.location}
          </p>
          <p className="mt-1 text-xs text-[#4A7FA7]">
            Open to {availability.openTo.join(", ")} · {availability.noticePeriod} notice
          </p>
          <p className="mt-4 max-w-2xl text-[13.5px] leading-relaxed text-[#1A3D63]">{bio}</p>
        </div>
      </div>
    </section>
  );
}
