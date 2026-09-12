"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { LogOut, ShieldCheck, User } from "lucide-react";
import { resolveIdentity } from "@/lib/profile/data";
import { useProfileExtras } from "@/lib/profile/storage";
import { useDismissablePanel } from "@/lib/useDismissablePanel";
import { signOut as endSession } from "@/app/login/actions";
import { PoliciesModal } from "./PoliciesModal";

/**
 * The avatar, turned into a menu instead of a direct link to /profile — the
 * standard shape (View profile, policies, sign out) once there's more than
 * one place worth going from here.
 *
 * "Sign out" now does two real, separate things: ends the real session
 * (lib/auth — a signed cookie against a row in candidate_users) and clears
 * the profile data kept only in this browser (resume, linked accounts,
 * identity edits — lib/profile/storage.ts). The confirmation names both,
 * because they're genuinely different kinds of data with different
 * lifetimes, and a candidate signing out on a shared machine cares about
 * both being gone.
 */
export function AccountMenu() {
  const { open, setOpen, ref } = useDismissablePanel<HTMLDivElement>();
  const { identity: saved, clearAll } = useProfileExtras();
  const identity = resolveIdentity(saved);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [showPolicies, setShowPolicies] = useState(false);
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setConfirmingSignOut(false);
  }

  function signOut() {
    clearAll();
    // endSession() redirects to /login itself once the cookie is cleared —
    // Next resolves that redirect through this transition, same pattern
    // AssessmentWall already uses to call startAssessment from a client
    // component.
    startTransition(() => {
      void endSession();
    });
  }

  return (
    <>
      <div ref={ref} className="relative">
        <button
          type="button"
          aria-label="Your account"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1A3D63] text-[13px] font-semibold text-[#F6FAFD] transition-opacity hover:opacity-90"
        >
          {identity.name.trim().charAt(0).toUpperCase() || "?"}
        </button>

        {open && (
          <div className="absolute top-full right-0 z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-[#B3CFE5] bg-white shadow-[0_20px_45px_-16px_rgba(10,25,49,0.35)]">
            <div className="flex items-center gap-3 border-b border-[#B3CFE5] px-4 py-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1A3D63] text-[13px] font-semibold text-[#F6FAFD]">
                {identity.name.trim().charAt(0).toUpperCase() || "?"}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold text-[#0A1931]">{identity.name}</p>
                <p className="truncate text-[11.5px] text-[#4A7FA7]">{identity.role}</p>
              </div>
            </div>

            {confirmingSignOut ? (
              <div className="p-4">
                <p className="text-[12.5px] leading-relaxed text-[#0A1931]">
                  Ends your session and clears your resume, linked accounts and any profile edits saved in this browser.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingSignOut(false)}
                    disabled={pending}
                    className="flex-1 rounded-lg border border-[#B3CFE5] px-3 py-1.5 text-[12.5px] font-medium text-[#1A3D63] transition-colors hover:bg-[#B3CFE5]/20 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={signOut}
                    disabled={pending}
                    className="flex-1 rounded-lg bg-[#a6203c] px-3 py-1.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {pending ? "Signing out…" : "Sign out"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-1.5">
                <Link
                  href="/profile"
                  onClick={close}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium text-[#0A1931] transition-colors hover:bg-[#B3CFE5]/20"
                >
                  <User size={15} className="text-[#4A7FA7]" />
                  View profile
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setShowPolicies(true);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium text-[#0A1931] transition-colors hover:bg-[#B3CFE5]/20"
                >
                  <ShieldCheck size={15} className="text-[#4A7FA7]" />
                  Privacy & recording policy
                </button>

                <div className="my-1.5 border-t border-[#B3CFE5]/60" />

                <button
                  type="button"
                  onClick={() => setConfirmingSignOut(true)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium text-[#a6203c] transition-colors hover:bg-[#a6203c]/10"
                >
                  <LogOut size={15} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {showPolicies && <PoliciesModal onClose={() => setShowPolicies(false)} />}
    </>
  );
}
