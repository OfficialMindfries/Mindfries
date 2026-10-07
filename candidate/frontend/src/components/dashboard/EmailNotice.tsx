"use client";

import { useState, useTransition } from "react";
import { MailCheck, MailWarning } from "lucide-react";
import { resendVerification } from "@/lib/auth/verify-actions";

/**
 * The strip at the top of the dashboard about the candidate's email: a
 * request to confirm it while it is unconfirmed, and the outcome of opening
 * a confirmation link.
 *
 * `canSend` is false when this site can't send mail; the strip then isn't
 * shown at all for an unconfirmed address, since there would be nothing the
 * candidate could do about it.
 */
export function EmailNotice({
  email,
  verified,
  canSend,
  outcome,
}: {
  email: string;
  verified: boolean;
  canSend: boolean;
  /** From the confirmation link: "confirmed", "link_expired", or nothing. */
  outcome?: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (verified) {
    if (outcome !== "confirmed") return null;
    return (
      <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-[#c5ecd5] bg-[#effbf4] px-4 py-3 text-[13px] text-[#14693a]">
        <MailCheck size={16} className="shrink-0" />
        Your email is confirmed.
      </div>
    );
  }
  if (!canSend) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-[#f3dca6] bg-[#fff8e8] px-4 py-3 text-[13px] text-[#7a5211]">
      <MailWarning size={16} className="shrink-0" />
      <span className="min-w-0 flex-1">
        {outcome === "link_expired"
          ? "That confirmation link has expired or was already used."
          : `Confirm ${email} — hiring teams see whether a candidate's email is confirmed.`}{" "}
        {message}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMessage(await resendVerification());
          })
        }
        className="font-semibold underline underline-offset-2 hover:text-[#0A1931] disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send the link"}
      </button>
    </div>
  );
}
