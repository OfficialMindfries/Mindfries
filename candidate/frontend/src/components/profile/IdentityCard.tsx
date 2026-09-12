"use client";

import { CalendarClock, Clock, Navigation } from "lucide-react";
import { resolveIdentity } from "@/lib/profile/data";
import { useProfileExtras } from "@/lib/profile/storage";
import { EditProfileModal } from "./EditProfileModal";

function formatUpdated(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Name, role, location, bio — everything the old separate "About you" card
 * held, folded in here so there's exactly one place on the page and one
 * button ("Edit profile", via EditProfileModal) that changes any of it,
 * rather than two sections each with their own edit affordance.
 *
 * Sample until the edit form saves something real (resolveIdentity), the
 * same fallback pattern the resume and linked accounts already use.
 */
export function IdentityCard() {
  const { identity: saved } = useProfileExtras();
  const identity = resolveIdentity(saved);

  return (
    <section className="rounded-2xl border border-[#B3CFE5] bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#1A3D63] text-xl font-semibold text-[#F6FAFD]">
            {identity.name.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <div className="min-w-0">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#0A1931]">{identity.name}</h2>
            <p className="mt-1 text-sm text-[#4A7FA7]">
              {identity.role}
              {identity.location && ` · ${identity.location}`}
            </p>
          </div>
        </div>

        <EditProfileModal />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#4A7FA7]">
        {identity.openTo.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <Navigation size={12} /> Open to {identity.openTo.join(", ")}
          </span>
        )}
        {identity.noticePeriod && (
          <span className="inline-flex items-center gap-1.5">
            <Clock size={12} /> {identity.noticePeriod} notice
          </span>
        )}
        {identity.updatedAt && (
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock size={12} /> Last updated {formatUpdated(identity.updatedAt)}
          </span>
        )}
      </div>

      {identity.bio && (
        <p className="mt-4 max-w-2xl text-[13.5px] leading-relaxed text-[#1A3D63]">{identity.bio}</p>
      )}
    </section>
  );
}
