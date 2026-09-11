"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { bulkDeleteTargets, bulkUpdateTargets, deleteTarget, updateTarget } from "@/app/admin/targets/actions";
import { STAGES } from "@/lib/targets-rules";
import type { TargetPriority, TargetStage } from "@/lib/types";
import { AddTarget } from "./AddTarget";
import { toast } from "../toast";

/**
 * The Targets list, laid out after the supplied "Vendor Activity History"
 * table: a card header with title, total, search, Filter and Add; rows with a
 * checkbox, a logo tile, name and domain, a progress bar, a date, tag pills,
 * and edit / ⋮ actions; numbered pagination underneath.
 *
 * Mapped onto what a target needs:
 * - Performance → deal progress: the bar is how far through the pipeline the
 *   deal is, labelled with the stage rather than a percentage — "In
 *   conversation" says more than "45%".
 * - Last checked → last touch.
 * - Categories → priority, owner and next-step state, where overdue or
 *   "no next step" stand out, because that's what gets deals lost.
 * - The checkboxes do something: select rows to move stage, assign an owner or
 *   delete in bulk.
 *
 * Everything that narrows the list — search, filters, sort, page — lives in
 * the URL, so a view survives reloads and can be shared as a link.
 */

export interface TargetRow {
  id: string;
  name: string;
  host: string | null;
  initials: string;
  tile: string; // tailwind classes for the logo tile
  priority: TargetPriority;
  owner: string | null;
  stage: TargetStage;
  stageLabel: string;
  progress: number; // 0..100
  bar: string; // tailwind class for the bar fill
  lastTouchDate: string | null;
  lastTouchSummary: string | null;
  due: { label: string; tone: "red" | "amber" | "gray"; action: string | null } | null;
  noNextStep: boolean;
  cold: boolean;
}

const TAG: Record<"violet" | "red" | "amber" | "gray" | "green" | "blue", string> = {
  violet: "border-[#c7c2f7] bg-[#f1efff] text-[#5b4fd6]",
  blue: "border-[#bfd3f6] bg-[#eef4ff] text-[#3563c9]",
  red: "border-[#f6c2cb] bg-[#fff0f2] text-[#d0304c]",
  amber: "border-[#f3d9a4] bg-[#fff8e8] text-[#b7791f]",
  green: "border-[#bfe8cd] bg-[#effbf3] text-[#23894a]",
  gray: "border-[#e2e2e8] bg-[#f6f6f8] text-[#6b6b78]",
};
const PRIORITY_TAG: Record<TargetPriority, keyof typeof TAG> = { A: "red", B: "amber", C: "gray" };

function Tag({ tone, children, title }: { tone: keyof typeof TAG; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${TAG[tone]}`}>
      {children}
    </span>
  );
}

// ── Icons (the admin app ships no icon library) ─────────────────────────────
const Icon = {
  search: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  filter: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M7 12h10M10 18h4" /></svg>,
  edit: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></svg>,
  dots: <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>,
  sort: (dir: "asc" | "desc" | null) => (
    <svg viewBox="0 0 12 16" width="10" height="14" fill="currentColor" aria-hidden>
      <path d="M6 1 10 6H2z" opacity={dir === "desc" ? 0.25 : 1} />
      <path d="M6 15 2 10h8z" opacity={dir === "asc" ? 0.25 : 1} />
    </svg>
  ),
  left: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m15 18-6-6 6-6" /></svg>,
  right: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m9 18 6-6-6-6" /></svg>,
};

// ── URL state ───────────────────────────────────────────────────────────────
// The current filters arrive as a prop from the server page, which already has
// them, rather than through `useSearchParams`. That hook needs a <Suspense>
// boundary around the table, and a Suspense boundary hydrates on its own,
// later and at lower priority than the rest of the page — so the table sat
// there un-interactive after everything around it was live.
export type Query = Record<string, string | undefined>;

function useUrl(query: Query) {
  const router = useRouter();
  const params = new URLSearchParams(Object.entries(query).filter(([, v]) => v) as [string, string][]);
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    // Any change to what's shown starts again from the first page.
    if (!("page" in patch)) next.delete("page");
    router.replace(`/admin/targets${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  return { params, set };
}

/** Page numbers with gaps: 1 2 3 4 5 … 12, or 1 … 6 7 8 … 12. */
function pageList(current: number, count: number): (number | "…")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "…", count];
  if (current >= count - 3) return [1, "…", count - 4, count - 3, count - 2, count - 1, count];
  return [1, "…", current - 1, current, current + 1, "…", count];
}

export function TargetsTable({
  rows, total, matched, page, pageCount, pageSize, owners, stageCounts, query,
}: {
  rows: TargetRow[];
  total: number;
  matched: number;
  page: number;
  pageCount: number;
  pageSize: number;
  owners: string[];
  stageCounts: Record<TargetStage, number>;
  query: Query;
}) {
  const { params, set } = useUrl(query);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  // Selection is per visible page. Derived during render rather than pruned in
  // an effect: rows that left the page (a new filter, a deletion, the next
  // page) simply stop counting, with no second render to catch up.
  const onPage = new Set(rows.map((r) => r.id));
  const selected = new Set([...picked].filter((id) => onPage.has(id)));
  const setSelected = setPicked;

  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someOn = !allOn && rows.some((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allOn ? new Set() : new Set(rows.map((r) => r.id)));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const sort = params.get("sort");
  const dir = (params.get("dir") as "asc" | "desc" | null) ?? null;
  const sortBy = (key: "name" | "touch") => {
    // attention (default) → key asc → key desc → back to attention
    if (sort !== key) set({ sort: key, dir: key === "touch" ? "desc" : "asc" });
    else if (dir === (key === "touch" ? "desc" : "asc")) set({ sort: key, dir: key === "touch" ? "asc" : "desc" });
    else set({ sort: null, dir: null });
  };

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done?: string) => {
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error("That didn't go through", res.error ?? "Something went wrong");
      else {
        if (done) toast.success(done);
        setSelected(new Set());
      }
    });
  };

  const activeFilters = ["view", "stage", "owner", "priority"].filter((k) => params.get(k)).length;
  const first = matched === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, matched);

  return (
    <div className="overflow-hidden rounded-2xl border border-hair bg-surface shadow-[0_1px_3px_rgba(16,16,24,0.04)]">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 pt-5 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold tracking-tight">Target Accounts</h2>
            <span className="rounded-full border border-[#c7c2f7] bg-[#f1efff] px-2 py-0.5 text-[11px] font-semibold text-[#5b4fd6]">
              {total} Total
            </span>
          </div>
          <p className="mt-1 text-sm text-dim">Track every company you&apos;re working to win, and what happens next.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              set({ q: q.trim() || null });
            }}
            className="relative"
          >
            <input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                if (!e.target.value) set({ q: null });
              }}
              placeholder="Search..."
              aria-label="Search targets"
              className="h-10 w-64 rounded-full border border-hair bg-surface pr-10 pl-4 text-sm outline-none transition focus:border-accent"
            />
            <button type="submit" aria-label="Search" className="absolute top-1/2 right-3 -translate-y-1/2 text-dim hover:text-ink">
              {Icon.search}
            </button>
          </form>
          <FilterMenu owners={owners} stageCounts={stageCounts} active={activeFilters} query={query} />
          <AddTarget owners={owners} />
        </div>
      </div>

      {/* Bulk bar — only while something is selected */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-y border-hair bg-[#f7f6ff] px-6 py-2.5 text-sm">
          <span className="font-semibold text-[#5b4fd6]">{selected.size} selected</span>
          <select
            defaultValue=""
            disabled={pending}
            onChange={(e) => {
              const stage = e.target.value;
              e.target.value = "";
              if (stage) run(() => bulkUpdateTargets([...selected], { stage }), `Moved ${selected.size} to ${STAGES.find((s) => s.key === stage)?.label}`);
            }}
            className="h-8 rounded-lg border border-hair bg-surface px-2 text-sm"
            aria-label="Move selected to stage"
          >
            <option value="">Move to stage…</option>
            {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const owner = String(new FormData(e.currentTarget).get("owner") ?? "");
              run(() => bulkUpdateTargets([...selected], { owner }), owner ? `Assigned to ${owner}` : "Unassigned");
              e.currentTarget.reset();
            }}
            className="flex items-center gap-1.5"
          >
            <input name="owner" list="bulk-owners" placeholder="Assign owner" className="h-8 w-36 rounded-lg border border-hair bg-surface px-2 text-sm" />
            <datalist id="bulk-owners">{owners.map((o) => <option key={o} value={o} />)}</datalist>
            <button
              type="submit"
              disabled={pending}
              className="btn-wipe h-9 px-4 text-[13px] font-extrabold"
              style={{ "--btn-bg": "#f0f0f4", "--btn-fg": "var(--color-ink)", "--btn-fill": "var(--color-ink)", "--btn-fg-hover": "#f4f4f7" } as React.CSSProperties}
            >
              Assign
            </button>
          </form>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (window.confirm(`Delete ${selected.size} target${selected.size === 1 ? "" : "s"}, with their people and history? This can't be undone.`)) {
                run(() => bulkDeleteTargets([...selected]), "Deleted");
              }
            }}
            className="btn-wipe h-9 px-4 text-[13px] font-extrabold"
            style={{ "--btn-bg": "#fdecef", "--btn-fg": "#a6203c", "--btn-fill": "#d0304c", "--btn-fg-hover": "#ffffff" } as React.CSSProperties}
          >
            Delete
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-sm text-dim hover:text-ink">Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-hair bg-[#fafafc] text-left text-[13px] font-semibold text-ink">
              <th className="w-12 py-3 pr-2 pl-6">
                <Checkbox checked={allOn} mixed={someOn} onChange={toggleAll} label="Select all on this page" />
              </th>
              <th className="py-3 pr-4">
                <button type="button" onClick={() => sortBy("name")} className="inline-flex items-center gap-2 hover:text-accent">
                  Company <span className="text-dim">{Icon.sort(sort === "name" ? dir : null)}</span>
                </button>
              </th>
              <th className="py-3 pr-4">Deal progress</th>
              <th className="py-3 pr-4">
                <button type="button" onClick={() => sortBy("touch")} className="inline-flex items-center gap-2 hover:text-accent">
                  Last touch <span className="text-dim">{Icon.sort(sort === "touch" ? dir : null)}</span>
                </button>
              </th>
              <th className="py-3 pr-4">Tags</th>
              <th className="py-3 pr-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hair">
            {rows.map((r) => (
              <tr key={r.id} className={`transition-colors hover:bg-[#fafafc] ${selected.has(r.id) ? "bg-[#f7f6ff]" : ""}`}>
                <td className="py-3.5 pr-2 pl-6">
                  <Checkbox checked={selected.has(r.id)} onChange={() => toggle(r.id)} label={`Select ${r.name}`} />
                </td>
                <td className="py-3.5 pr-4">
                  <Link href={`/admin/targets/${r.id}`} className="group flex items-center gap-3">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[13px] font-bold ${r.tile}`}>{r.initials}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold group-hover:text-accent">{r.name}</span>
                      <span className="block truncate text-[13px] text-dim">{r.host ?? "no website"}</span>
                    </span>
                  </Link>
                </td>
                <td className="py-3.5 pr-4">
                  <div className="flex items-center gap-3" title={`${r.stageLabel} — ${r.progress}% through the pipeline`}>
                    <div className="h-2.5 w-44 overflow-hidden rounded-full bg-[#eeeef3]">
                      <div className={`h-full rounded-full ${r.bar}`} style={{ width: `${Math.max(r.progress, 4)}%` }} />
                    </div>
                    <span className="w-28 shrink-0 text-[13px] text-dim">{r.stageLabel}</span>
                  </div>
                </td>
                <td className="py-3.5 pr-4 whitespace-nowrap" title={r.lastTouchSummary ?? undefined}>
                  {r.lastTouchDate ?? <span className="text-faint">Not yet</span>}
                </td>
                <td className="py-3.5 pr-4">
                  <div className="flex flex-wrap gap-1.5">
                    <Tag tone={PRIORITY_TAG[r.priority]}>Priority {r.priority}</Tag>
                    {r.owner && <Tag tone="violet">{r.owner}</Tag>}
                    {r.due && <Tag tone={r.due.tone} title={r.due.action ?? undefined}>{r.due.label}</Tag>}
                    {r.noNextStep && <Tag tone="amber">No next step</Tag>}
                    {r.cold && <Tag tone="blue" title="No touch in 14 days">Going cold</Tag>}
                  </div>
                </td>
                <td className="py-3.5 pr-6">
                  <div className="flex items-center justify-end gap-1">
                    <Link href={`/admin/targets/${r.id}`} aria-label={`Open ${r.name}`} title="Open" className="rounded-lg p-1.5 text-ink hover:bg-black/[0.05]">
                      {Icon.edit}
                    </Link>
                    <RowMenu row={r} disabled={pending} run={run} />
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-14 text-center text-sm text-dim">
                  {total === 0 ? "No targets yet — add the first company you want to win." : "Nothing matches this search or filter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hair px-6 py-3.5">
        <div className="flex items-center gap-1">
          <PageButton disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>
            {Icon.left} Previous
          </PageButton>
          {pageList(page, Math.max(pageCount, 1)).map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="w-9 text-center text-dim">…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => set({ page: p === 1 ? null : String(p) })}
                aria-current={p === page ? "page" : undefined}
                className={`h-9 w-9 rounded-full text-sm font-medium transition ${p === page ? "bg-[#ecebfd] text-[#5b4fd6]" : "text-ink hover:bg-black/[0.04]"}`}
              >
                {p}
              </button>
            ),
          )}
          <PageButton disabled={page >= pageCount} onClick={() => set({ page: String(page + 1) })}>
            Next {Icon.right}
          </PageButton>
        </div>
        <div className="text-sm text-dim">
          {matched === 0 ? "No results" : `Showing ${first}–${last} of ${matched} result${matched === 1 ? "" : "s"}`}
        </div>
      </div>
    </div>
  );
}

function Checkbox({ checked, mixed = false, onChange, label }: { checked: boolean; mixed?: boolean; onChange: () => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className="h-[18px] w-[18px] cursor-pointer rounded-md accent-[#5b4fd6]"
    />
  );
}

function PageButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink transition hover:bg-black/[0.04] disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  );
}

/** Closes on outside click or Escape — a menu that has to be dismissed by hand is a trap. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

function RowMenu({
  row, disabled, run,
}: {
  row: TargetRow;
  disabled: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, done?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const item = "block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-black/[0.04] disabled:opacity-40";
  const move = (stage: TargetStage, label: string) => {
    setOpen(false);
    run(() => updateTarget(row.id, { stage }), `${row.name} → ${label}`);
  };
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`More actions for ${row.name}`}
        aria-expanded={open}
        className="rounded-lg p-1.5 text-ink hover:bg-black/[0.05]"
      >
        {Icon.dots}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-hair bg-surface p-1 shadow-lg">
          <Link href={`/admin/targets/${row.id}`} className={item} role="menuitem">Open</Link>
          {row.stage !== "won" && <button type="button" disabled={disabled} className={item} onClick={() => move("won", "Won")}>Mark as won</button>}
          {row.stage !== "lost" && <button type="button" disabled={disabled} className={item} onClick={() => move("lost", "Lost")}>Mark as lost</button>}
          {row.stage !== "nurture" && <button type="button" disabled={disabled} className={item} onClick={() => move("nurture", "Nurture")}>Move to nurture</button>}
          <div className="my-1 border-t border-hair" />
          <button
            type="button"
            disabled={disabled}
            className={`${item} text-[#d0304c]`}
            onClick={() => {
              setOpen(false);
              if (window.confirm(`Delete ${row.name}, its people and its whole history? This can't be undone.`)) {
                run(() => deleteTarget(row.id), `Deleted ${row.name}`);
              }
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function FilterMenu({ owners, stageCounts, active, query }: { owners: string[]; stageCounts: Record<TargetStage, number>; active: number; query: Query }) {
  const { params, set } = useUrl(query);
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const opt = (on: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs font-medium transition ${on ? "border-accent bg-accent text-white" : "border-hair bg-surface text-dim hover:text-ink"}`;
  const toggle = (key: string, value: string) => set({ [key]: params.get(key) === value ? null : value });

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-hair bg-surface px-4 text-sm font-medium hover:border-hair-bright"
      >
        {Icon.filter} Filter
        {active > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-white">{active}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 space-y-4 rounded-2xl border border-hair bg-surface p-4 shadow-xl">
          <section>
            <div className="mb-2 text-xs font-semibold text-dim">Show</div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={opt(!params.get("view"))} onClick={() => set({ view: null })}>Everything</button>
              <button type="button" className={opt(params.get("view") === "due")} onClick={() => toggle("view", "due")}>Due &amp; overdue</button>
              <button type="button" className={opt(params.get("view") === "cold")} onClick={() => toggle("view", "cold")}>Going cold</button>
            </div>
          </section>
          <section>
            <div className="mb-2 text-xs font-semibold text-dim">Stage</div>
            <div className="flex flex-wrap gap-1.5">
              {STAGES.map((s) => (
                <button key={s.key} type="button" className={opt(params.get("stage") === s.key)} onClick={() => toggle("stage", s.key)}>
                  {s.label} <span className="opacity-60">{stageCounts[s.key]}</span>
                </button>
              ))}
            </div>
          </section>
          <section>
            <div className="mb-2 text-xs font-semibold text-dim">Priority</div>
            <div className="flex gap-1.5">
              {(["A", "B", "C"] as const).map((p) => (
                <button key={p} type="button" className={opt(params.get("priority") === p)} onClick={() => toggle("priority", p)}>{p}</button>
              ))}
            </div>
          </section>
          <section>
            <div className="mb-2 text-xs font-semibold text-dim">Owner</div>
            <div className="flex flex-wrap gap-1.5">
              {owners.map((o) => (
                <button key={o} type="button" className={opt(params.get("owner") === o)} onClick={() => toggle("owner", o)}>{o}</button>
              ))}
              <button type="button" className={opt(params.get("owner") === "__none")} onClick={() => toggle("owner", "__none")}>Unassigned</button>
            </div>
          </section>
          {active > 0 && (
            <button type="button" onClick={() => set({ view: null, stage: null, owner: null, priority: null })} className="text-sm font-semibold text-accent hover:underline">
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
