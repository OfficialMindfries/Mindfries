"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, Field, Select, Textarea } from "@/components/ui";
import { recommendationLabel } from "@/lib/format";
import type { ReportReview } from "@/lib/types";
import { saveReviewerDecision, type ReviewState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save decision"}
    </Button>
  );
}

/**
 * The reviewer's own decision, recorded beside the AI's recommendation. It
 * never overwrites that recommendation: the product's principle is that the
 * AI collects evidence and a person decides, so the page shows both, and
 * which of them a person made.
 */
export function ReviewerDecisionForm({ applicationId, review }: { applicationId: string; review: ReportReview | null }) {
  const save = saveReviewerDecision.bind(null, applicationId);
  const [state, action] = useActionState<ReviewState, FormData>(save, { error: null, success: false });

  return (
    <form action={action} className="mt-4 space-y-3 border-t border-hair pt-4">
      <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
        <Field label="Your decision">
          <Select name="recommendation" defaultValue={review?.recommendation ?? ""}>
            <option value="">Not decided</option>
            {Object.entries(recommendationLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Why" hint="Shown to your team with the report. Not shown to the candidate.">
          <Textarea name="note" rows={2} maxLength={4000} defaultValue={review?.note ?? ""} />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Submit />
        {state.success && !state.error && <p className="text-[13px] text-[color:var(--color-success)]">Saved.</p>}
      </div>
      {state.error && (
        <p role="alert" className="rounded-xl bg-[#fdecef] px-3 py-2 text-[13px] text-[#a6203c]">
          {state.error}
        </p>
      )}
    </form>
  );
}
