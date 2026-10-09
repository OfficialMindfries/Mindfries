"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { acceptInvitation, declineInvitation } from "@/lib/invitations";

/**
 * Accept or decline, on an invitation the candidate hasn't answered.
 *
 * Declining asks once more, in place, and offers a line for a reason — it
 * closes the invitation for good, and the reason (if any) goes to the
 * company, which the form says before anything is sent.
 */
export function InvitationAnswer({ assessmentId }: { assessmentId: string }) {
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (action: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      try {
        const result = await action();
        setError(result.ok ? null : result.error);
      } catch {
        // The request never arrived, so the invitation is as it was.
        setError("Couldn't reach the server — check your connection and try again.");
      }
    });

  if (declining) {
    return (
      <div className="w-full">
        <label className="block text-[11.5px] font-medium text-[#1A3D63]">
          Decline this invitation? It can&apos;t be reopened from here.
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder="Reason (optional — the company sees it)"
            className="mt-1.5 w-full rounded-lg border border-[#0A1931]/20 bg-white/80 px-2.5 py-1.5 text-[12.5px] text-[#0A1931] outline-none focus:border-[#1A3D63]"
          />
        </label>
        <div className="mt-2 flex items-center justify-end gap-2">
          <button type="button" onClick={() => setDeclining(false)} disabled={pending} className="text-xs font-medium text-[#1A3D63] hover:underline">
            Keep it
          </button>
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => run(() => declineInvitation(assessmentId, reason))}
            style={{ "--btn-bg": "#a6203c" } as React.CSSProperties}
          >
            {pending ? "Declining…" : "Decline"}
          </Button>
        </div>
        {error && <p className="mt-1.5 text-right text-[11.5px] text-[#a6203c]">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-2.5">
        <button type="button" onClick={() => setDeclining(true)} disabled={pending} className="text-xs font-medium text-[#1A3D63] hover:underline">
          Decline
        </button>
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => run(() => acceptInvitation(assessmentId))}
          style={{ "--btn-bg": "#0A1931" } as React.CSSProperties}
        >
          {pending ? "Saving…" : "Accept"}
        </Button>
      </div>
      {error && <p className="text-[11.5px] text-[#a6203c]">{error}</p>}
    </div>
  );
}
