"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button, Select, Textarea } from "@/components/ui";
import { addAnnotation, type ReviewState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Add"}
    </Button>
  );
}

/**
 * Adds a reviewer's note or correction — against one section of the report
 * when `category` is set, against the report as a whole when it's null.
 * Collapsed to a link until wanted, so a page of evidence isn't a page of
 * empty text boxes.
 */
export function AnnotationForm({ applicationId, category }: { applicationId: string; category: string | null }) {
  const [open, setOpen] = useState(false);
  const save = addAnnotation.bind(null, applicationId, category);
  const [state, action] = useActionState<ReviewState, FormData>(async (prev, form) => {
    const next = await save(prev, form);
    if (next.success) setOpen(false);
    return next;
  }, { error: null, success: false });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-xs font-semibold text-dim underline-offset-2 hover:underline">
        {category ? "Add a note or correction" : "Add a note"}
      </button>
    );
  }
  return (
    <form action={action} className="mt-3 space-y-2">
      <Textarea name="body" rows={3} required maxLength={4000} placeholder="What should someone reading this report know?" autoFocus />
      <div className="flex flex-wrap items-center gap-2">
        {category && (
          <Select name="kind" defaultValue="note" className="w-auto">
            <option value="note">Note</option>
            <option value="correction">Correction — the AI got this wrong</option>
          </Select>
        )}
        <Submit />
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-dim">
          Cancel
        </button>
      </div>
      {state.error && (
        <p role="alert" className="rounded-xl bg-[#fdecef] px-3 py-2 text-[13px] text-[#a6203c]">
          {state.error}
        </p>
      )}
    </form>
  );
}
