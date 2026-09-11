"use client";

import { useState, useTransition } from "react";
import type { GameTemplate, RubricCriterion, TaskVariant } from "@/lib/types";
import { Box, CircleCheck, PencilLine } from "lucide-react";
import { Button, Chip, Field, Input, Modal, PageHeader, Pill, Select, Textarea } from "@/components/ui";
import { MetricCard, MetricGrid, flat } from "@/components/admin/cards";
import { SampleBadge } from "@/components/admin/SampleBadge";
import { VARIANT } from "@/components/admin/visuals";
import { countWithin, cumulative, DAY, WEEK } from "@/lib/overview";
import { fmtDate, taskVariantLabel } from "@/lib/format";
import { createGameTemplate, toggleTemplateStatus } from "@/app/admin/actions";
import { toast } from "@/components/admin/toast";

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

/**
 * `asOf` is decided on the server and passed in, so the server render and the
 * browser draw the same graphs; `sample` says the rows are fixtures.
 */
export function LibraryView({ initial, asOfIso, sample }: { initial: GameTemplate[]; asOfIso: string; sample: boolean }) {
  const asOf = new Date(asOfIso);
  const [rows, setRows] = useState<GameTemplate[]>(initial);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

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
    setName(""); setTaskVariant("bug_fix"); setRepoTemplate(""); setStack("");
    setDurationMin(60); setPrompt(""); setRubric(defaultRubric()); setPublishNow(false);
  }

  function editCriterion(id: string, patch: Partial<RubricCriterion>) {
    setRubric((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function publishTemplate() {
    const input = {
      name: name.trim(),
      taskVariant,
      repoTemplate: repoTemplate.trim() || "custom-repo",
      techStack: stack.split(",").map((s) => s.trim()).filter(Boolean),
      durationMin,
      interviewerPrompt: prompt.trim(),
      rubric,
      status: (publishNow ? "published" : "draft") as GameTemplate["status"],
    };
    start(async () => {
      const res = await createGameTemplate(input);
      if (!res.ok) { toast.error("Couldn't save the game", res.error); return; }
      toast.success(input.status === "published" ? "Published to the library" : "Draft saved", input.name);
      // optimistic — the persisted row also arrives on next server render
      setRows((r) => [{ ...input, id: crypto.randomUUID(), usedByCompanies: 0, createdAt: new Date().toISOString().slice(0, 10) }, ...r]);
      reset();
      setOpen(false);
    });
  }

  function togglePublish(t: GameTemplate) {
    const next = t.status === "published" ? "draft" : "published";
    setRows((r) => r.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    start(async () => { await toggleTemplateStatus(t.id, next); });
  }

  const published = rows.filter((t) => t.status === "published").length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assessment / Game Library"
        title="Game Library"
        action={
          <div className="flex items-center gap-3">
            {sample && <SampleBadge asOf={asOf} />}
            <Button onClick={() => setOpen(true)}>+ Author game</Button>
          </div>
        }
      />

      <MetricGrid columns={3}>
        <MetricCard
          id="games" label="Total games" value={rows.length} icon={Box} tone="violet"
          trend={flat(`${rows.filter((t) => t.usedByCompanies > 0).length} in use`)}
          series={cumulative(rows.map((t) => t.createdAt), asOf, 12, WEEK)} seriesLabel="Games, running total over the last 12 weeks"
        />
        <MetricCard
          id="published" label="Published" value={published} icon={CircleCheck} tone="green"
          trend={(() => { const n = countWithin(rows.filter((t) => t.status === "published").map((t) => t.createdAt), asOf, 30 * DAY); return n ? { text: `+${n} this month`, direction: "up" as const, good: true } : flat("None new this month"); })()}
          series={cumulative(rows.filter((t) => t.status === "published").map((t) => t.createdAt), asOf, 12, WEEK)} seriesLabel="Published games, running total over the last 12 weeks"
        />
        <MetricCard id="draft" label="Draft" value={rows.length - published} icon={PencilLine} tone="amber" trend={flat("Not yet visible to candidates")} />
      </MetricGrid>

      {rows.length === 0 && (
        <div className="hair-card p-8 text-center text-sm text-dim">
          No games yet. Author one — once the backend is connected it publishes to the candidate app.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((t) => (
          <div key={t.id} className="hair-card flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              {(() => { const V = VARIANT[t.taskVariant].icon; return (
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${VARIANT[t.taskVariant].tile}`}>
                  <V size={20} strokeWidth={2.1} aria-hidden />
                </span>
              ); })()}
              <div className="min-w-0 flex-1">
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
                onClick={() => togglePublish(t)}
                disabled={pending}
                className="rounded-lg border border-hair px-3 py-1.5 font-semibold text-dim hover:border-hair-bright hover:text-ink disabled:opacity-40"
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
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={publishTemplate} disabled={pending || !name.trim()}>
              {pending ? "Saving…" : publishNow ? "Publish to library" : "Save draft"}
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
                  <option key={v} value={v}>{taskVariantLabel[v]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Duration (min)">
              <Input type="number" min={15} value={durationMin} onChange={(e) => setDurationMin(Math.max(15, Number(e.target.value) || 15))} />
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
            <Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Probe how the candidate located the failing path…" />
          </Field>

          <Field label={`Evaluation rubric — ${rubricTotal}%`} hint={rubricTotal === 100 ? "Weights sum to 100%." : "Tip: weights should sum to 100%."}>
            <div className="space-y-2">
              {rubric.map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <Input value={r.label} onChange={(e) => editCriterion(r.id, { label: e.target.value })} className="flex-1" />
                  <Input type="number" min={0} max={100} value={r.weight} onChange={(e) => editCriterion(r.id, { weight: Number(e.target.value) || 0 })} className="w-20" />
                  <button onClick={() => setRubric((rs) => rs.filter((x) => x.id !== r.id))} className="rounded-lg px-2 py-1 text-dim hover:bg-black/5" aria-label="Remove criterion">✕</button>
                </div>
              ))}
              <button onClick={() => setRubric((rs) => [...rs, { id: crypto.randomUUID(), label: "", weight: 0 }])} className="text-sm font-semibold text-accent hover:underline">
                + Add criterion
              </button>
            </div>
          </Field>

          <label className="flex cursor-pointer items-center gap-3">
            <input type="checkbox" checked={publishNow} onChange={(e) => setPublishNow(e.target.checked)} className="h-4 w-4 accent-[#7c3aed]" />
            <span className="text-sm font-medium">Publish to company-selectable library now</span>
          </label>
        </div>
      </Modal>
    </div>
  );
}
