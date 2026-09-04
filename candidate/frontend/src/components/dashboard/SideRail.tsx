import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { resources } from "@/lib/dashboard/data";

/**
 * Intervue's right-hand resources column, minus the blog carousel.
 *
 * Theirs rotates generic articles — "What is full-stack Development" — next to
 * a dashboard about your own interviews. Nothing there helps the person
 * reading it. These three are about *this* process: what the workspace
 * records, how the reasoning prompts are read, and what to do before a first
 * session.
 *
 * The card above them is the one thing a candidate on a proctored platform is
 * entitled to have in plain sight rather than buried in a policy page.
 */

export function SideRail() {
  return (
    <aside className="space-y-4">
      <section className="rounded-2xl border border-[#B3CFE5] bg-[#0A1931] p-5 text-[#F6FAFD]">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F6FAFD]/10">
          <ShieldCheck size={17} className="text-[#B3CFE5]" />
        </span>
        <h2 className="mt-3 text-sm font-semibold">What gets recorded</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[#B3CFE5]">
          During a session: your screen, your camera, the commands you run and the changes you
          make. Never outside one, and never on a practice run.
        </p>
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-[#B3CFE5] transition-colors hover:text-[#F6FAFD]"
        >
          Read the full list
          <ArrowUpRight size={13} />
        </button>
      </section>

      <section className="rounded-2xl border border-[#B3CFE5] bg-white p-1">
        <h2 className="px-4 pt-3 pb-2 text-sm font-semibold text-[#0A1931]">Before you start</h2>
        <ul>
          {resources.map((resource) => (
            <li key={resource.title}>
              <button
                type="button"
                className="group flex w-full items-start gap-2 rounded-xl px-4 py-3 text-left transition-colors hover:bg-[#B3CFE5]/25"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium text-[#0A1931]">
                    {resource.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-[#4A7FA7]">
                    {resource.body}
                  </span>
                </span>
                <ArrowUpRight
                  size={14}
                  className="mt-0.5 shrink-0 text-[#B3CFE5] transition-colors group-hover:text-[#4A7FA7]"
                />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
