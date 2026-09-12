"use client";

import { useEffect } from "react";
import { Clock, Eye, ShieldCheck, X } from "lucide-react";
import { HOW_EVIDENCE_IS_USED, RECORDED_SIGNALS, RETENTION, WHAT_IS_RECORDED } from "@/lib/policies";

/**
 * The same consent copy from onboarding's ConsentStep (lib/policies.ts),
 * available afterwards from the account menu — read-only here, since the
 * agreement itself already happened before the first session.
 */
export function PoliciesModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0A1931]/45 p-4 py-10 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Privacy & recording policy"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-[0_30px_60px_-20px_rgba(10,25,49,0.45)]"
      >
        <div className="flex items-center justify-between border-b border-[#B3CFE5] px-6 py-4">
          <h2 className="text-[17px] font-semibold text-[#0A1931]">Privacy & recording policy</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-[#4A7FA7] transition-colors hover:bg-[#B3CFE5]/30 hover:text-[#1A3D63]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-6">
          <p className="text-[13px] leading-relaxed text-[#4A7FA7]">
            The same terms you agreed to before your first session — nothing has changed since.
          </p>

          <Section icon={Eye} title={WHAT_IS_RECORDED.title} body={WHAT_IS_RECORDED.body} />

          <ul className="space-y-2 rounded-xl bg-[#F6FAFD] p-3">
            {RECORDED_SIGNALS.map((s) => (
              <li key={s.label} className="flex items-start gap-2.5">
                <span className="text-base leading-none">{s.icon}</span>
                <span>
                  <span className="text-xs font-medium text-[#0A1931]">{s.label}</span>
                  <span className="ml-1 text-xs text-[#4A7FA7]">— {s.detail}</span>
                </span>
              </li>
            ))}
          </ul>

          <Section icon={ShieldCheck} title={HOW_EVIDENCE_IS_USED.title} body={HOW_EVIDENCE_IS_USED.body} />
          <Section icon={Clock} title={RETENTION.title} body={RETENTION.body} />
        </div>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, body }: { icon: typeof Eye; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#B3CFE5]/40">
        <Icon size={16} className="text-[#1A3D63]" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-[#0A1931]">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-[#4A7FA7]">{body}</p>
      </div>
    </div>
  );
}
