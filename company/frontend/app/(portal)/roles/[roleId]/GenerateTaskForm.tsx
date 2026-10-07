"use client";

import { useState, useTransition } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import type { GeneratedTask } from "@/lib/task-generation";
import { generateRoleTask, saveGeneratedTask } from "./actions";

const TASK_TYPES = [
  { value: "bug_fix", label: "Find and fix a bug" },
  { value: "feature", label: "Add a feature" },
  { value: "refactor", label: "Refactor working code" },
  { value: "debug", label: "Debug a failure" },
];

const VERDICT: Record<GeneratedTask["verification"]["status"], { label: string; tone: string }> = {
  verified: { label: "Ran and checked", tone: "bg-[#e8f6ee] text-[#17663d]" },
  failed: { label: "Ran, and it has a problem", tone: "bg-[#fdecef] text-[#a6203c]" },
  not_run: { label: "Not run", tone: "bg-[color:var(--color-hair)] text-dim" },
};

/**
 * Generates an assessment task for this role from the company's own
 * material — the job description, and optionally some of its code — instead
 * of picking one from Mindfries' library.
 *
 * Two steps on purpose. Generating only produces a draft, shown here with
 * what running it found; nothing is saved and no candidate can be sent it
 * until someone has looked at it and chosen to use it. A model wrote the
 * task: the draft says whether it was actually run, and what happened.
 */
export function GenerateTaskForm({ roleId, roleTitle, techStack, durationMin }: { roleId: string; roleTitle: string; techStack: string[]; durationMin: number | null }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<GeneratedTask | null>(null);
  const [name, setName] = useState(`${roleTitle} assessment`);
  const [taskVariant, setTaskVariant] = useState("bug_fix");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [working, start] = useTransition();

  function generate(form: FormData) {
    setError(null);
    setSaved(false);
    start(async () => {
      const res = await generateRoleTask(roleId, form);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setName(String(form.get("name") ?? name));
      setTaskVariant(String(form.get("taskVariant") ?? "bug_fix"));
      setDraft(res.task);
    });
  }

  function save() {
    if (!draft) return;
    setError(null);
    start(async () => {
      const res = await saveGeneratedTask(roleId, { name, taskVariant, task: draft });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setDraft(null);
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <div className="hair-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="eyebrow">Generate a task for this role</div>
          <p className="mt-1 text-[13px] text-dim">
            Have a task written from your job description and code, instead of choosing one from the library.
            {saved && <span className="ml-1 font-semibold text-[color:var(--color-success)]">Saved and attached.</span>}
          </p>
        </div>
        <Button size="sm" variant="soft" onClick={() => setOpen(true)}>
          Generate a task
        </Button>
      </div>
    );
  }

  return (
    <div className="hair-card space-y-4 p-4">
      <div>
        <div className="eyebrow">Generate a task for this role</div>
        <p className="mt-1 text-[13px] text-dim">
          The task is written around what you give it. It stays private to your company, and nothing is sent to a
          candidate until you save it and attach it.
        </p>
      </div>

      {!draft && (
        <form action={generate} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Task name">
              <Input name="name" defaultValue={name} required maxLength={120} />
            </Field>
            <Field label="Kind of task">
              <Select name="taskVariant" defaultValue="bug_fix">
                {TASK_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tech stack" hint="Python, JavaScript and TypeScript run in the candidate's workspace.">
              <Input name="techStack" defaultValue={techStack.join(", ")} placeholder="Python" />
            </Field>
          </div>
          <input type="hidden" name="durationMin" value={durationMin ?? 60} />
          <Field label="Job description" hint="Paste the role as you advertise it. The task is built around the work it describes.">
            <Textarea name="jobDescription" rows={6} maxLength={12000} placeholder="We're hiring a backend engineer to own our payments API…" />
          </Field>
          <Field
            label="A sample of your code (optional)"
            hint="Paste one or more files so the task feels like your codebase. Start each file with a line like  --- src/billing/invoice.py ---  . It is used to write the task and is never shown to candidates."
          >
            <Textarea name="codebase" rows={6} maxLength={60000} className="mono" placeholder={"--- src/billing/invoice.py ---\nclass Invoice:\n    ..."} />
          </Field>
          <Field label="Anything else the task should reflect (optional)">
            <Textarea name="notes" rows={2} maxLength={4000} placeholder="Most of the work is debugging data pipelines; we care about tests." />
          </Field>
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={working}>
              {working ? "Generating… (up to a minute)" : "Generate draft"}
            </Button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-dim">
              Cancel
            </button>
          </div>
        </form>
      )}

      {draft && (
        <div className="space-y-3">
          <div className={`rounded-xl px-3 py-2 text-[13px] leading-relaxed ${VERDICT[draft.verification.status].tone}`}>
            <span className="font-semibold">{VERDICT[draft.verification.status].label}</span> — {draft.verification.reason}
          </div>
          <Field label="Task name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </Field>
          <Field label="What the candidate will read">
            <pre className="max-h-80 overflow-auto rounded-xl border border-hair px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap">{draft.taskBrief}</pre>
          </Field>
          <Field label={`Starting files (${Object.keys(draft.starterFiles).length})`}>
            <div className="space-y-1.5">
              {Object.entries(draft.starterFiles).map(([path, content]) => (
                <details key={path} className="rounded-xl border border-hair px-3 py-2">
                  <summary className="mono cursor-pointer text-[13px]">{path}</summary>
                  <pre className="mono mt-2 max-h-72 overflow-auto text-[12px] whitespace-pre">{content}</pre>
                </details>
              ))}
            </div>
          </Field>
          {Object.keys(draft.solutionFiles).length > 0 && (
            <p className="text-xs text-dim">
              A reference solution was written for {Object.keys(draft.solutionFiles).join(", ")}. It was used to run the task and is
              kept with it; candidates never see it.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={save} disabled={working || !name.trim()}>
              {working ? "Saving…" : "Save and attach to this role"}
            </Button>
            <Button size="sm" variant="soft" onClick={() => setDraft(null)} disabled={working}>
              Discard and try again
            </Button>
          </div>
          {draft.verification.status !== "verified" && (
            <p className="text-xs text-dim">
              This draft hasn&apos;t been confirmed by running it. Read the files before you use it with a candidate.
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-[#fdecef] px-3 py-2 text-[13px] leading-relaxed text-[#a6203c]">
          {error}
        </p>
      )}
    </div>
  );
}
