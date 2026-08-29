"use client";

import { useState } from "react";
import { templates as seed } from "@/lib/mock-data";
import type { GameTemplate, RubricCriterion, TaskVariant } from "@/lib/types";
import { Button, Chip, Field, Input, Modal, PageHeader, Pill, Select, StatCard, Textarea } from "@/components/ui";
import { fmtDate, taskVariantLabel } from "@/lib/format";

const variantTone: Record<TaskVariant, "violet" | "coral" | "amber" | "green"> = {
  bug_fix: "coral",
  feature: "violet",
  refactor: "amber",
  debug: "green",
};

const defaultRubric = (): RubricCriterion[] => [
  { id: crypto.randomUUID(), label: "Technical correctness", weight: 35 },
  { id: crypto.randomUUID(), label: "Engineering workflow", weight: 25 },
  { id: crypto.randomUUID(), label: "Reasoning & communication", weight: 20 },
  { id: crypto.randomUUID(), label: "AI usage", weight: 20 },
];

export default function LibraryPage() {
  const [rows, setRows] = useState<GameTemplate[]>(seed);
  const [open, setOpen] = useState(false);

  // author form
  const [name, setName] = useState("");
  const [taskVariant, setTaskVariant] = useState<TaskVariant>("bug_fix");
  const [repoTemplate, setRepoTemplate] = useState("");
  const [stack, setStack] = useState("");
  const [durationMin, setDurationMin] = useState(60);
  const [prompt, setPrompt] = useState("");
  const [rubric, setRubric] = useState<RubricCriterion[]>(defaultRubric());
  const [publishNow, setPublishNow] = useState(false);

  const rubricTotal = rubric.reduce((sum, r) => sum + (Number(r.weight) || 0), 0);

  function reset() {
    setName("");
    setTaskVariant("bug_fix");
    setRepoTemplate("");
    setStack("");
    setDurationMin(60);
    setPrompt("");
    setRubric(defaultRubric());
    setPublishNow(false);
  }

  function editCriterion(id: string, patch: Partial<RubricCriterion>) {
    setRubric((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function publishTemplate() {
    const tpl: GameTemplate = {
      id: crypto.randomUUID(),
      name: name.trim(),
      taskVariant,
      repoTemplate: repoTemplate.trim() || "custom-repo",
      techStack: stack.split(",").map((s) => s.trim()).filter(Boolean),
      durationMin,
      interviewerPrompt: prompt.trim(),
      rubric,
      status: publishNow ? "published" : "draft",
      usedByCompanies: 0,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setRows((r) => [tpl, ...r]);
    reset();
    setOpen(false);
  }

  function togglePublish(id: string) {
    setRows((r) =>
      r.map((t) => (t.id === id ? { ...t, status: t.status === "published" ? "draft" : "published" } : t)),
    );
  }

  const published = rows.filter((t) => t.status === "published").length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Assessment / Game Library"
        title="Game Library"
        action={<Button onClick={() => setOpen(true)}>+ Author game</Button>}
      >
        Mindfries centrally authors the base repository templates, task variants, interviewer prompts, and default
        rubrics that every company picks from — so assessment quality stays consistent (PRD §1.11).
      </PageHeader>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total games" value={rows.length} />
        <StatCard label="Published" value={published} />
        <StatCard label="Draft" value={rows.length - published} />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {rows.map((t) => (
          <div key={t.id} className="hair-card flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Pill tone={variantTone[t.taskVariant]}>{taskVariantLabel[t.taskVariant]}</Pill>
                  <Pill tone={t.status === "published" ? "green" : "gray"}>{t.status}</Pill>
                </div>
                <h3 className="mt-3 text-lg font-extrabold tracking-tight">{t.name}</h3>
                <div className="mt-0.5 text-xs text-dim mono">{t.repoTemplate}</div>
              </div>
              <div className="text-right text-xs text-dim">
                <div className="mono text-base font-bold text-ink">{t.durationMin}m</div>
                <div>used by {t.usedByCompanies}</div>
              </div>
            </div>

            <p className="mt-3 line-clamp-2 text-sm text-dim">{t.interviewerPrompt}</p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {t.techStack.map((s) => (
                <Chip key={s}>{s}</Chip>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-hair pt-3 text-xs text-faint">
              <span>Created {fmtDate(t.createdAt)}</span>
              <button
                onClick={() => togglePublish(t.id)}
                className="rounded-lg border border-hair px-3 py-1.5 font-semibold text-dim hover:border-hair-bright hover:text-ink"
              >
                {t.status === "published" ? "Unpublish" : "Publish"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Author game"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={publishTemplate} disabled={!name.trim()}>
              {publishNow ? "Publish to library" : "Save draft"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Game name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Auth Bug Hunt" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Task variant">
              <Select value={taskVariant} onChange={(e) => setTaskVariant(e.target.value as TaskVariant)}>
                {(Object.keys(taskVariantLabel) as TaskVariant[]).map((v) => (
                  <option key={v} value={v}>
                    {taskVariantLabel[v]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Duration (min)">
              <Input
                type="number"
                min={15}
                value={durationMin}
                onChange={(e) => setDurationMin(Math.max(15, Number(e.target.value) || 15))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Base repository template">
              <Input value={repoTemplate} onChange={(e) => setRepoTemplate(e.target.value)} placeholder="node-express-api" />
            </Field>
            <Field label="Tech stack" hint="Comma-separated">
              <Input value={stack} onChange={(e) => setStack(e.target.value)} placeholder="Node, Express, JWT" />
            </Field>
          </div>
          <Field label="AI interviewer prompt" hint="How the AI interviewer probes the candidate's reasoning.">
            <Textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Probe how the candidate located the failing path and what causes they ruled out…"
            />
          </Field>

          <Field label={`Evaluation rubric — ${rubricTotal}%`} hint={rubricTotal === 100 ? "Weights sum to 100%." : "Tip: weights should sum to 100%."}>
            <div className="space-y-2">
              {rubric.map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <Input value={r.label} onChange={(e) => editCriterion(r.id, { label: e.target.value })} className="flex-1" />
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={r.weight}
                    onChange={(e) => editCriterion(r.id, { weight: Number(e.target.value) || 0 })}
                    className="w-20"
                  />
                  <button
                    onClick={() => setRubric((rs) => rs.filter((x) => x.id !== r.id))}
                    className="rounded-lg px-2 py-1 text-dim hover:bg-black/5"
                    aria-label="Remove criterion"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() => setRubric((rs) => [...rs, { id: crypto.randomUUID(), label: "", weight: 0 }])}
                className="text-sm font-semibold text-accent hover:underline"
              >
                + Add criterion
              </button>
            </div>
          </Field>

          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={publishNow}
              onChange={(e) => setPublishNow(e.target.checked)}
              className="h-4 w-4 accent-[#7c3aed]"
            />
            <span className="text-sm font-medium">Publish to company-selectable library now</span>
          </label>
        </div>
      </Modal>
    </div>
  );
}
