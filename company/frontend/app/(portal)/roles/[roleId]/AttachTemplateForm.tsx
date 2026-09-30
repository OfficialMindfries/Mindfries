"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, Field, Select } from "@/components/ui";
import { attachTemplate, type AttachTemplateState } from "./actions";
import type { GameTemplate } from "@/lib/types";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

export function AttachTemplateForm({
  roleId,
  templates,
  currentTemplateId,
}: {
  roleId: string;
  templates: GameTemplate[];
  currentTemplateId: string | null;
}) {
  const attachToThisRole = attachTemplate.bind(null, roleId);
  const [state, action] = useActionState<AttachTemplateState, FormData>(attachToThisRole, { error: null, success: false });

  return (
    <form action={action} className="hair-card flex flex-wrap items-end gap-3 p-4">
      <div className="min-w-[220px] flex-1">
        <Field label="Assessment template" hint={templates.length === 0 ? "No published templates yet" : "Optional"}>
          <Select name="templateId" defaultValue={currentTemplateId ?? ""} disabled={templates.length === 0}>
            <option value="">No assessment attached</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.durationMin}min)
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Submit />
      {state.error && (
        <p role="alert" className="w-full rounded-xl bg-[#fdecef] px-3 py-2 text-[13px] leading-relaxed text-[#a6203c]">
          {state.error}
        </p>
      )}
      {state.success && !state.error && <p className="w-full text-[13px] text-[color:var(--color-success)]">Saved.</p>}
    </form>
  );
}
