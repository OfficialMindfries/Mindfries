"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, Field, Select } from "@/components/ui";
import { ASSISTANT_MESSAGE_CHOICES, type AssistantConfig } from "@/lib/assistant";
import { saveAssistantSettings, type AssistantSettingsState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

/**
 * Whether candidates invited to this role get the workspace AI assistant,
 * and how many messages they may send it. Takes effect the next time a
 * candidate opens or uses the assistant — including in a session already
 * under way.
 */
export function AssistantSettingsForm({ roleId, config }: { roleId: string; config: AssistantConfig }) {
  const saveForThisRole = saveAssistantSettings.bind(null, roleId);
  const [state, action] = useActionState<AssistantSettingsState, FormData>(saveForThisRole, { error: null, success: false });

  // A limit set some other way stays selectable rather than silently
  // snapping to the nearest listed choice.
  const choices = ASSISTANT_MESSAGE_CHOICES.some((c) => c.value === config.maxMessages)
    ? ASSISTANT_MESSAGE_CHOICES
    : [...ASSISTANT_MESSAGE_CHOICES, { value: config.maxMessages, label: `${config.maxMessages} messages` }].sort((a, b) => a.value - b.value);

  return (
    <form action={action} className="hair-card space-y-3 p-4">
      <div>
        <div className="eyebrow">AI assistant</div>
        <p className="mt-1 text-[13px] text-dim">
          Candidates can ask an assistant in the workspace to explain code, errors and concepts. It does not write their
          solution or say where a problem is, and everything they ask it appears with the report — including whether
          code it showed them ended up in their submission.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Assistant">
          <Select name="enabled" defaultValue={config.enabled ? "on" : "off"}>
            <option value="on">On — candidates can use it</option>
            <option value="off">Off — no assistant for this role</option>
          </Select>
        </Field>
        <Field label="Message limit per candidate">
          <Select name="maxMessages" defaultValue={String(config.maxMessages)}>
            {choices.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Submit />
        {state.success && !state.error && <p className="text-[13px] text-[color:var(--color-success)]">Saved.</p>}
      </div>
      {state.error && (
        <p role="alert" className="rounded-xl bg-[#fdecef] px-3 py-2 text-[13px] leading-relaxed text-[#a6203c]">
          {state.error}
        </p>
      )}
    </form>
  );
}
